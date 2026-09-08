"""
Cartera de clientes armada desde los transcripts de Discord.

Un canal en boost / advantage / avanzados / principiantes (= mentoría) = un cliente.
Nombre, entrada, engagement, activación heurística y mix léxico salen del .txt.
MRR / NRR / tiers de payments no se inventan acá.
"""

from __future__ import annotations

import re
from functools import lru_cache
import statistics
from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import HTTPException

from src.services.transcripts_services import AR_TZ, TranscriptsServices
from src.transcripts_source import base_disponible

# Categorías cuyo canal es un cliente (no updates / inactivos / admin).
CATEGORIAS_CLIENTE = frozenset({
    "boost",
    "advantage",
    "avanzados",
    "principiantes",
    "mentoria",  # legacy: transcripts viejos bajo este slug
})
SEMANAS_VENTANA = 12
# Autor que escribe en ≥ N canales de cliente = staff/coach (no el cliente).
STAFF_MIN_CANALES = 2
VENTANA_ACTIVACION_DIAS = 30

# Señal heurística de "primer resultado" en mensajes del cliente (sin NLP).
_ACTIVACION_RE = re.compile(
    r"(?:"
    r"\bvend[ií]\b|"
    r"\bvendimos\b|"
    r"\bya\s+vend|"
    r"\bprimera?\s+venta\b|"
    r"\bprimer\s+cliente\b|"
    r"\bprimer\s+pago\b|"
    r"\bcobr[eé]\b|"
    r"\bcobramos\b|"
    r"\bme\s+pagaron\b|"
    r"\bme\s+compraron\b|"
    r"\bcerr[eé]\s+(?:una|la|el|mi|con)\b|"
    r"\bcerramos\s+(?:una|la|el|venta|lanzamiento|deal)\b|"
    r"\bconsegu[ií]\s+(?:un\s+)?(?:cliente|venta|pago)\b|"
    r"\bhicimos\s+(?:una\s+)?venta\b|"
    r"\bfirm[eé]\b|"
    r"\binscribi(?:ó|o|eron)\b"
    r")",
    re.IGNORECASE,
)
_ACTIVACION_EXCLUIR_RE = re.compile(
    r"(?:objetivo:|avatar:|ya\s+le\s+vend[ií]\s+a\s+todo|que\s+ya\s+venden|"
    r"estrategia\s+de\s+comunicaci|guiones)",
    re.IGNORECASE,
)

# Mix de conversación (heurística léxica; no NLP/LLM).
_MIX_RES: dict[str, re.Pattern[str]] = {
    "implementacion": re.compile(
        r"(?:implement|c[oó]mo\s+(?:hago|armo|lanzo|vendo)|lanz(?:ar|o|amos)|"
        r"oferta|funnel|landing|copy|ads?|campa[nñ]a|guion|closing|"
        r"ticket|precio|avatar|embudo|secuencia)",
        re.IGNORECASE,
    ),
    "soporte": re.compile(
        r"(?:acceso|login|contrase[nñ]a|no\s+puedo|error|link|invite|"
        r"d[oó]nde\s+est[aá]|no\s+me\s+lleg|plataforma|drive|notion|"
        r"zoom|grabaci[oó]n|archivo)",
        re.IGNORECASE,
    ),
    "queja": re.compile(
        r"(?:reembolso|devolver|dinero\s+atr[aá]s|estafa|frustrad|"
        r"no\s+sirve|no\s+funciona|cancelar|quiero\s+baja|me\s+quiero\s+ir|"
        r"perdi\s+el\s+tiempo|no\s+es\s+lo\s+que)",
        re.IGNORECASE,
    ),
    "celebracion": re.compile(
        r"(?:primera?\s+venta|vend[ií]|vendimos|cerr[eé]|cerramos|"
        r"me\s+pagaron|logr[eé]|consegu[ií]|gracias\s+(?:equipo|coach|chicos)|"
        r"incre[ií]ble|bomb[aá]|winn?|factur)",
        re.IGNORECASE,
    ),
}

_UPSELL_RE = re.compile(
    r"(?:upsell|pasar\s+a\s+(?:boost|advantage|scale|growth)|"
    r"siguiente\s+nivel|quiero\s+m[aá]s\s+(?:mentor|acompa[nñ]|sesion)|"
    r"aumentar\s+(?:el\s+)?ticket|escalar\s+(?:el\s+)?negocio|"
    r"me\s+queda\s+chico|techo\s+de\s+capacidad)",
    re.IGNORECASE,
)

_CHURN_INTENT_RE = re.compile(
    r"(?:reembolso|devolver\s+el\s+dinero|cancelar\s+(?:la\s+)?(?:suscri|mentor)|"
    r"quiero\s+baja|me\s+quiero\s+ir|no\s+renuevo|dar(?:me)?\s+de\s+baja)",
    re.IGNORECASE,
)


def _nombre_desde_canal(canal: str) -> str:
    return " ".join(p.capitalize() for p in canal.replace("_", "-").split("-") if p)


@lru_cache(maxsize=8192)
def _norm(texto: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (texto or "").lower())


def _mediana(valores: list[float], default: float | None = None) -> float | None:
    if not valores:
        return default
    return float(statistics.median(valores))


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.isoformat()


def _semana_label(fecha: datetime) -> str:
    """Clave de la semana: el lunes en ISO ('2026-09-07'). Nadie sabe qué es
    'S37'; una fecha la lee cualquiera y el frontend la muestra como quiera."""
    return fecha.date().isoformat()


def _staff_desde_canales(canales: list[dict]) -> set[str]:
    """Quién escribe en varios canales = equipo ATV, no el cliente del canal."""
    por_autor: dict[str, set[str]] = defaultdict(set)
    for canal in canales:
        slug = canal["canal"]
        for msg in canal.get("_mensajes") or []:
            key = _norm(msg["autor"])
            if key:
                por_autor[key].add(slug)
    return {autor for autor, chs in por_autor.items() if len(chs) >= STAFF_MIN_CANALES}


def _autor_es_cliente(autor: str, canal: str, staff: set[str]) -> bool:
    key = _norm(autor)
    if not key:
        return False
    if key in staff:
        return False
    # Match suave nombre ↔ slug (Gretel Lucia ↔ gretelukz).
    c = _norm(canal)
    if key in c or c in key:
        return True
    partes = [p for p in canal.lower().replace("_", "-").split("-") if len(p) > 2]
    if partes and sum(1 for p in partes if p in key) >= max(1, (len(partes) + 1) // 2):
        return True
    # En un canal de cliente, quien no es staff es el cliente (o pareja).
    return True


def _detectar_activacion(
    mensajes: list[dict],
    canal_slug: str,
    staff: set[str],
    entrada: datetime,
) -> dict:
    """
    Primer mensaje del cliente que parece un win tangible.
    Heurística léxica hasta que exista clasificador NLP.
    """
    if hasattr(entrada, "astimezone"):
        entrada_ar = entrada.astimezone(AR_TZ)
    else:
        entrada_ar = entrada

    for msg in mensajes:
        if not _autor_es_cliente(msg["autor"], canal_slug, staff):
            continue
        contenido = (msg.get("contenido") or "").strip()
        if len(contenido) < 12 or len(contenido) > 1200:
            continue
        if _ACTIVACION_EXCLUIR_RE.search(contenido):
            continue
        if not _ACTIVACION_RE.search(contenido):
            continue

        fecha = msg["fecha_at"]
        dias = max(0, (fecha.date() - entrada_ar.date()).days)
        extracto = " ".join(contenido.split())
        if len(extracto) > 220:
            extracto = extracto[:217] + "…"
        return {
            "activado": True,
            "diasHastaResultado": dias,
            "primerResultadoAt": _iso(fecha),
            "descripcion": extracto,
            "evidenciaMensajeId": f"idx:{msg.get('indice', 0)}",
            "blocker": None,
            "fuente": "heuristica_transcript",
        }

    # Sin win detectado: blocker grueso según silencio / ventana.
    ahora = datetime.now(AR_TZ)
    dias_desde = max(0, (ahora.date() - entrada_ar.date()).days)
    blocker = None
    if dias_desde > VENTANA_ACTIVACION_DIAS:
        msgs_cli = sum(1 for m in mensajes if _autor_es_cliente(m["autor"], canal_slug, staff))
        if msgs_cli <= 2:
            blocker = "cliente_ausente"
        else:
            blocker = "no_implementa"

    return {
        "activado": False,
        "diasHastaResultado": None,
        "primerResultadoAt": None,
        "descripcion": None,
        "evidenciaMensajeId": None,
        "blocker": blocker,
        "fuente": "heuristica_transcript",
    }


def _contar_mix(mensajes: list[dict], canal_slug: str, staff: set[str]) -> dict:
    """% de mensajes del cliente que matchean cada bucket (pueden sumar >100)."""
    contadores = {k: 0 for k in _MIX_RES}
    etiquetados = 0
    for msg in mensajes:
        if not _autor_es_cliente(msg["autor"], canal_slug, staff):
            continue
        contenido = (msg.get("contenido") or "").strip()
        if len(contenido) < 8:
            continue
        hit = False
        for key, patron in _MIX_RES.items():
            if patron.search(contenido):
                contadores[key] += 1
                hit = True
        if hit:
            etiquetados += 1

    if etiquetados == 0:
        return {
            "mix": {"implementacion": 0, "soporte": 0, "queja": 0, "celebracion": 0},
            "mixPendiente": True,
            "mensajesEtiquetados": 0,
        }

    mix = {
        k: round(100.0 * contadores[k] / etiquetados)
        for k in contadores
    }
    # Normalizar a ~100 por redondeo.
    total = sum(mix.values()) or 1
    if total != 100:
        mayor = max(mix, key=mix.get)
        mix[mayor] = max(0, mix[mayor] + (100 - total))
    return {"mix": mix, "mixPendiente": False, "mensajesEtiquetados": etiquetados}


def _candidato_upsell(mensajes: list[dict], canal_slug: str, staff: set[str]) -> bool:
    for msg in mensajes[-80:]:
        if not _autor_es_cliente(msg["autor"], canal_slug, staff):
            continue
        if _UPSELL_RE.search(msg.get("contenido") or ""):
            return True
    return False


def _intencion_churn(mensajes: list[dict], canal_slug: str, staff: set[str]) -> dict | None:
    for msg in reversed(mensajes[-120:]):
        if not _autor_es_cliente(msg["autor"], canal_slug, staff):
            continue
        contenido = (msg.get("contenido") or "").strip()
        if _CHURN_INTENT_RE.search(contenido):
            extracto = " ".join(contenido.split())
            if len(extracto) > 180:
                extracto = extracto[:177] + "…"
            return {
                "detectado": True,
                "fechaAt": _iso(msg["fecha_at"]),
                "extracto": extracto,
            }
    return None


class ClientesServices:
    def __init__(self) -> None:
        self._tx = TranscriptsServices()

    def _canales_cliente(self) -> list[dict]:
        return [c for c in self._tx._recorrer() if c["categoria"] in CATEGORIAS_CLIENTE]

    def _engagement_y_actividad(
        self,
        canal_slug: str,
        mensajes: list[dict],
        ahora: datetime,
        staff: set[str],
    ) -> tuple[dict, list[dict], str]:
        inicio_semana = ahora.date() - timedelta(days=ahora.weekday())  # lunes AR
        semanas: list[tuple[str, datetime, datetime]] = []
        for i in range(SEMANAS_VENTANA - 1, -1, -1):
            lun = datetime.combine(inicio_semana - timedelta(weeks=i), datetime.min.time(), tzinfo=AR_TZ)
            dom = lun + timedelta(days=7)
            semanas.append((_semana_label(lun), lun, dom))

        labels = [s[0] for s in semanas]
        cliente_por_sem = {lab: 0 for lab in labels}
        coach_por_sem = {lab: 0 for lab in labels}
        mensajes_cliente: list[dict] = []
        coaches_count: dict[str, int] = defaultdict(int)

        for msg in mensajes:
            es_cli = _autor_es_cliente(msg["autor"], canal_slug, staff)
            bucket = None
            for lab, lun, dom in semanas:
                if lun <= msg["fecha_at"] < dom:
                    bucket = lab
                    break
            if es_cli:
                mensajes_cliente.append(msg)
                if bucket:
                    cliente_por_sem[bucket] += 1
            else:
                coaches_count[msg["autor"]] += 1
                if bucket:
                    coach_por_sem[bucket] += 1

        coach_nombre = (
            max(coaches_count.items(), key=lambda x: x[1])[0]
            if coaches_count
            else "Equipo ATV"
        )

        gaps_hs: list[float] = []
        pendiente: datetime | None = None
        for msg in mensajes:
            if _autor_es_cliente(msg["autor"], canal_slug, staff):
                pendiente = msg["fecha_at"]
            elif pendiente is not None:
                delta = (msg["fecha_at"] - pendiente).total_seconds() / 3600
                if 0 < delta < 72:
                    gaps_hs.append(delta)
                pendiente = None

        vals = [cliente_por_sem[lab] for lab in labels]
        ult4 = vals[-4:] if len(vals) >= 4 else vals
        prev4 = vals[-8:-4] if len(vals) >= 8 else vals[: max(0, len(vals) - 4)]
        avg_ult = sum(ult4) / len(ult4) if ult4 else 0.0
        avg_prev = sum(prev4) / len(prev4) if prev4 else avg_ult
        tendencia = ((avg_ult - avg_prev) / avg_prev * 100) if avg_prev > 0 else 0.0

        ultimo_cli = max((m["fecha_at"] for m in mensajes_cliente), default=None)
        ultimo_any = max((m["fecha_at"] for m in mensajes), default=None)
        ref_silencio = ultimo_cli or ultimo_any
        dias_sin = (ahora - ref_silencio).days if ref_silencio else 0

        resp = _mediana(gaps_hs)
        mix_info = _contar_mix(mensajes, canal_slug, staff)
        engagement = {
            "mensajesClienteSemana": round(avg_ult, 1),
            "mensajesCoachSemana": round(
                (sum(coach_por_sem[lab] for lab in labels[-4:]) / max(len(ult4), 1)),
                1,
            ),
            "interaccionesSemana": round(
                min(avg_ult, sum(coach_por_sem[lab] for lab in labels[-4:]) / max(len(ult4), 1)),
                1,
            ),
            "respuestaCoachHs": round(resp, 1) if resp is not None else None,
            "diasSinMensaje": max(0, dias_sin),
            "mix": mix_info["mix"],
            "mixPendiente": mix_info["mixPendiente"],
            "mensajesEtiquetados": mix_info["mensajesEtiquetados"],
            "tendencia": round(tendencia),
        }

        actividad = [
            {
                "semana": lab,
                "mensajesCliente": cliente_por_sem[lab],
                "mensajesCoach": coach_por_sem[lab],
                "respuestaCoachHs": engagement["respuestaCoachHs"],
            }
            for lab in labels
        ]
        return engagement, actividad, coach_nombre

    def _canal_a_cliente(self, canal: dict, ahora: datetime, staff: set[str]) -> dict:
        mensajes = canal.get("_mensajes") or []
        engagement, actividad, coach_nombre = self._engagement_y_actividad(
            canal["canal"], mensajes, ahora, staff
        )
        cliente_id = f"{canal['categoria']}__{canal['canal']}"
        coach_id = "coach_" + (_norm(coach_nombre)[:24] or "equipo")
        entrada = canal["primer_mensaje_at"] or ahora
        # Fecha calendario en Argentina (sin hora) para entrada.
        if hasattr(entrada, "astimezone"):
            entrada_ar = entrada.astimezone(AR_TZ)
        else:
            entrada_ar = entrada
        entrada_iso = entrada_ar.date().isoformat()
        activacion = _detectar_activacion(mensajes, canal["canal"], staff, entrada_ar)
        churn_intent = _intencion_churn(mensajes, canal["canal"], staff)
        candidato = _candidato_upsell(mensajes, canal["canal"], staff)

        return {
            "id": cliente_id,
            "nombre": _nombre_desde_canal(canal["canal"]),
            "pais": None,
            "entradaAt": entrada_iso,
            "caja": None,
            "estado": "activo" if canal.get("en_discord", True) else "cerrado",
            "mrrUsd": None,
            "ultimaActividadAt": _iso(canal["ultimo_mensaje_at"]),
            "onboardingDias": None,
            "coachId": coach_id,
            "coachNombre": coach_nombre,
            "tier": None,
            "churnAt": None,
            "motivoChurn": None,
            "churnIntent": churn_intent,
            "categoria": canal["categoria"],
            "canal": canal["canal"],
            "canalId": canal["id"],
            "completo": canal["completo"],
            "mensajes": canal["mensajes"],
            "activacion": activacion,
            "engagement": engagement,
            "outcome": {
                "revenueInicialUsd": None,
                "revenueActualUsd": None,
                "audienciaInicial": None,
                "audienciaActual": None,
                "ultimoHitoAt": activacion.get("primerResultadoAt"),
                "ultimoHito": activacion.get("descripcion") if activacion.get("activado") else None,
            },
            "expansion": {
                "tierInicial": None,
                "upsells": 0,
                "revenueExpansionUsd": None,
                "ultimoUpsellAt": None,
                "candidatoUpsell": candidato,
            },
            "_actividad": actividad,
        }

    def _firma_transcripts(self) -> tuple:
        """Cambia solo cuando el bot escribió algo (o cambió el directorio)."""
        from src.transcripts_source import get_transcripts_base
        base = get_transcripts_base()
        partes = []
        try:
            partes.append(("_directorio", (base / "_directorio.json").stat().st_mtime))
        except OSError:
            pass
        if base.is_dir():
            for cat in base.iterdir():
                if not cat.is_dir() or cat.name.startswith("_"):
                    continue
                for canal in cat.iterdir():
                    txt = canal / f"{canal.name}.txt"
                    try:
                        st = txt.stat()
                        partes.append((str(txt), st.st_mtime, st.st_size))
                    except OSError:
                        continue
        return tuple(sorted(partes))

    def listar(self) -> dict:
        """Cartera completa. El análisis de 60k+ mensajes cuesta segundos, así
        que se recalcula solo cuando cambió algún transcript; entre medio, se
        devuelve el último resultado."""
        firma = self._firma_transcripts()
        cacheado = getattr(self, "_cache_listar", None)
        if cacheado and cacheado[0] == firma:
            return cacheado[1]
        resultado = self._listar_sin_cache()
        self._cache_listar = (firma, resultado)
        return resultado

    def _listar_sin_cache(self) -> dict:
        ahora = datetime.now(AR_TZ)
        canales = self._canales_cliente()
        staff = _staff_desde_canales(canales)
        clientes_raw = [self._canal_a_cliente(c, ahora, staff) for c in canales]
        clientes_raw.sort(
            key=lambda c: c["ultimaActividadAt"] or "",
            reverse=True,
        )

        coaches_map: dict[str, dict] = {}
        actividad: list[dict] = []
        semanas: list[str] = []

        for c in clientes_raw:
            act = c.pop("_actividad")
            if not semanas and act:
                semanas = [a["semana"] for a in act]
            for a in act:
                actividad.append({**a, "clienteId": c["id"]})
            coaches_map.setdefault(
                c["coachId"],
                {
                    "id": c["coachId"],
                    "nombre": c["coachNombre"],
                    "desde": c["entradaAt"],
                    "capacidad": 20,
                },
            )

        clientes = [{k: v for k, v in c.items() if k != "coachNombre"} for c in clientes_raw]

        return {
            "fuente": "discord_transcripts",
            "base_disponible": base_disponible(),
            "categorias": sorted({c["categoria"] for c in clientes}),
            "clientes": clientes,
            "coaches": list(coaches_map.values()),
            "actividad": actividad,
            "semanas": semanas,
            "resumen": {
                # Solo clientes activos: las carpetas cerradas (categorías viejas,
                # egresados) no cuentan como cartera.
                "clientes": sum(1 for c in clientes if c["estado"] == "activo"),
                "cerrados": sum(1 for c in clientes if c["estado"] != "activo"),
                "mensajes": sum(c["mensajes"] for c in clientes if c["estado"] == "activo"),
                "por_categoria": {
                    cat: sum(1 for c in clientes if c["categoria"] == cat and c["estado"] == "activo")
                    for cat in sorted({c["categoria"] for c in clientes if c["estado"] == "activo"})
                },
                "parcial": any(not c.get("completo") for c in clientes) if clientes else False,
                "canales_completos": sum(1 for c in clientes if c.get("completo")),
                "ultimo_mensaje_at": max(
                    (c["ultimaActividadAt"] for c in clientes if c.get("ultimaActividadAt")),
                    default=None,
                ),
            },
        }

    def obtener(self, cliente_id: str) -> dict:
        data = self.listar()
        cliente = next((c for c in data["clientes"] if c["id"] == cliente_id), None)
        if cliente is None:
            raise HTTPException(status_code=404, detail=f"No existe el cliente {cliente_id}.")
        coach = next((c for c in data["coaches"] if c["id"] == cliente["coachId"]), None)
        actividad = [a for a in data["actividad"] if a["clienteId"] == cliente_id]
        return {
            "cliente": cliente,
            "coach": coach,
            "actividad": actividad,
            "actividadDiaria": self._actividad_diaria(cliente),
            "senales": [],
            "blocker": None,
        }

    def _actividad_diaria(self, cliente: dict, dias: int = 30) -> list[dict]:
        """Día a día de los últimos N días: cuántos mensajes escribió el cliente y
        cuántos el equipo. Es la vista más honesta del vínculo, y solo tiene
        sentido en la ficha (en la cartera entera sería ilegible)."""
        categoria, _, canal = (cliente.get("canalId") or "").partition("/")
        if not categoria or not canal:
            return []
        try:
            mensajes = self._tx.obtener_canal(categoria, canal)["mensajes"]
        except HTTPException:
            return []
        staff = _staff_desde_canales(self._canales_cliente())
        hoy = datetime.now(AR_TZ).date()
        desde = hoy - timedelta(days=dias - 1)
        por_dia = {desde + timedelta(days=i): {"cliente": 0, "coach": 0} for i in range(dias)}
        for msg in mensajes:
            d = msg["fecha_at"].date()
            if d not in por_dia:
                continue
            if _autor_es_cliente(msg["autor"], canal, staff):
                por_dia[d]["cliente"] += 1
            else:
                por_dia[d]["coach"] += 1
        return [
            {"fecha": d.isoformat(), "cliente": v["cliente"], "coach": v["coach"]}
            for d, v in sorted(por_dia.items())
        ]
