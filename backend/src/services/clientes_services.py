"""
Cartera de clientes armada desde los transcripts de Discord.

Un canal en boost / advantage / avanzados / principiantes (= mentoría) = un cliente.
No hay CRM todavía: nombre, entrada y engagement salen del .txt. MRR, activación
clasificada, outcomes y mix fino quedan en defaults hasta conectar esas fuentes.
"""

from __future__ import annotations

import re
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


def _nombre_desde_canal(canal: str) -> str:
    return " ".join(p.capitalize() for p in canal.replace("_", "-").split("-") if p)


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
    return f"S{fecha.isocalendar().week:02d}"


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
            "mix": {"implementacion": 0, "soporte": 0, "queja": 0, "celebracion": 0},
            "mixPendiente": True,
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

        return {
            "id": cliente_id,
            "nombre": _nombre_desde_canal(canal["canal"]),
            "pais": None,
            "entradaAt": entrada_iso,
            "caja": "caja_1",
            "estado": "activo",
            "mrrUsd": 0,
            "ultimaActividadAt": _iso(canal["ultimo_mensaje_at"]),
            "onboardingDias": None,
            "coachId": coach_id,
            "coachNombre": coach_nombre,
            "tier": None,
            "churnAt": None,
            "motivoChurn": None,
            "categoria": canal["categoria"],
            "canal": canal["canal"],
            "canalId": canal["id"],
            "completo": canal["completo"],
            "mensajes": canal["mensajes"],
            "activacion": {
                "activado": False,
                "diasHastaResultado": None,
                "primerResultadoAt": None,
                "descripcion": None,
                "evidenciaMensajeId": None,
                "blocker": None,
            },
            "engagement": engagement,
            "outcome": {
                "revenueInicialUsd": 0,
                "revenueActualUsd": 0,
                "audienciaInicial": 0,
                "audienciaActual": 0,
                "ultimoHitoAt": None,
                "ultimoHito": None,
            },
            "expansion": {
                "tierInicial": None,
                "upsells": 0,
                "revenueExpansionUsd": 0,
                "ultimoUpsellAt": None,
                "candidatoUpsell": False,
            },
            "_actividad": actividad,
        }

    def listar(self) -> dict:
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
                "clientes": len(clientes),
                "mensajes": sum(c["mensajes"] for c in clientes),
                "por_categoria": {
                    cat: sum(1 for c in clientes if c["categoria"] == cat)
                    for cat in sorted({c["categoria"] for c in clientes})
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
            "senales": [],
            "blocker": None,
        }
