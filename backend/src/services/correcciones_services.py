"""
Lo que la pizarra aprende cuando alguien edita una secuencia de historias.

Al guardar una secuencia editada, el código compara lo que armó la IA con cómo quedó:
textos reescritos, historias sacadas, agregadas o movidas, marcas nuevas, imágenes que
salieron o entraron, rayones, figuras, notas y fondos. Eso se guarda como una corrección
(una por secuencia) y las próximas secuencias la leen.

Qué decide la IA y qué decide el código:
- Las diferencias las mide el código, nunca la IA.
- A la IA le llegan los hechos (antes → después, qué sacó, qué marcó): las conclusiones
  las saca ella al escribir, no se le pasan reglas inventadas por otra IA.
- Lo que se le muestra a la persona ("Lo que cambiaste", "Lo que va a usar") también sale
  del código, sin otra llamada a Claude.
- Una secuencia guardada sin cambios es una secuencia aprobada tal cual: va de ejemplo bueno.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from datetime import datetime

from pony.orm import db_session

from src.models import PizarraCorreccion

ULTIMAS = 6          # correcciones con cambios que lee cada secuencia nueva
APROBADAS = 2        # secuencias aprobadas tal cual que van de ejemplo
MAX_TEXTOS = 6       # textos antes → después por corrección
MAX_CHARS = 14_000   # tope del tramo en el pedido

LARGO = {"corta": "corta", "media": "media", "larga": "larga"}
FIGURA = {"rect": "cuadrado", "circ": "círculo", "linea": "línea", "flecha": "flecha", "nota": "nota"}
OBJETIVO = {"palabra": "pedir la palabra", "ensenar": "enseñar y pedir la palabra", "mostrar": "mostrar un proceso",
            "objecion": "romper una objeción"}
BLOQUE = {"imagen": "la imagen", "flecha": "la flecha", "diagrama": "el diagrama", "grafico": "el gráfico"}
# Las marcas del texto, con el nombre que se le dice a la persona.
MARCAS = {
    "negrita": re.compile(r"\*\*[^*]+\*\*"),
    "óvalo": re.compile(r"\[\[[^\]]+\]\]"),
    "rojo": re.compile(r"\{\{[^}]+\}\}"),
    "tachado": re.compile(r"~~[^~]+~~"),
    "subrayado": re.compile(r"__[^_]+__"),
}
_DELIM = re.compile(r"\*\*|\[\[|\]\]|\{\{|\}\}|~~|__")


# ------------------------------------------------------------------ forma de una historia

def historia_normal(h, origen: int | None = None) -> dict:
    """Una historia siempre como {origen, bloques, trazos, figuras, fondo}. Las que armó la IA
    son una lista de bloques, con el fondo (si eligió uno) como un bloque más."""
    if isinstance(h, dict):
        return {"origen": h.get("origen"), "bloques": list(h.get("bloques") or []), "trazos": list(h.get("trazos") or []),
                "figuras": list(h.get("figuras") or []), "fondo": h.get("fondo")}
    bloques = [b for b in h or [] if isinstance(b, dict)]
    fondo = next((b.get("foto") for b in bloques if b.get("tipo") == "fondo"), None)
    return {"origen": origen, "bloques": [b for b in bloques if b.get("tipo") != "fondo"], "trazos": [], "figuras": [], "fondo": fondo}


def historias_normales(historias: list) -> list[dict]:
    return [historia_normal(h, i) for i, h in enumerate(historias or [])]


def texto(h: dict) -> str:
    """El texto de la historia con sus marcas, como va en pantalla."""
    return "\n".join(str(b.get("texto") or "") for b in h["bloques"] if b.get("tipo") == "texto").strip()


def plano(t: str) -> str:
    """Sin marcas ni espacios de más: para saber si el texto cambió de verdad."""
    return " ".join(_DELIM.sub("", t or "").split())


def _corto(t: str, largo: int = 90) -> str:
    t = plano(t)
    return t if len(t) <= largo else t[: largo - 1].rstrip() + "…"


def _marcas(t: str) -> Counter:
    return Counter({k: len(r.findall(t or "")) for k, r in MARCAS.items()})


def _firma(b: dict) -> str:
    """Qué es un bloque que no es texto, para ver si salió o entró."""
    if b.get("tipo") == "imagen" and b.get("dibujo") is not None:
        return f"imagen:dibujo {b['dibujo']}"
    return f"{b.get('tipo')}:{plano(str(b.get('texto') or ''))}"


# ------------------------------------------------------------------ diferencias

def diferencias(original: list, editada: list, fondos: dict[int, str] | None = None) -> dict:
    """Qué cambió entre lo que armó la IA y cómo quedó. `fondos`: id → descripción de la foto.
    Función pura: no toca la base."""
    fondos = fondos or {}
    orig = historias_normales(original)
    edit = [historia_normal(h) for h in editada or []]
    vacia = {"bloques": [], "trazos": [], "figuras": [], "fondo": None}
    origenes = [h["origen"] for h in edit if isinstance(h.get("origen"), int) and 0 <= h["origen"] < len(orig)]
    d = {"orden": None, "sacadas": [], "agregadas": [], "textos": [], "marcas": [], "bloques": [],
         "trazos": [], "figuras": [], "notas": [], "fondos": []}
    if origenes != sorted(origenes):
        d["orden"] = [h["origen"] + 1 if isinstance(h.get("origen"), int) else None for h in edit]
    for i, o in enumerate(orig):
        if i not in origenes:
            d["sacadas"].append({"n": i + 1, "texto": texto(o)})
    for n, h in enumerate(edit, 1):
        nueva = not (isinstance(h.get("origen"), int) and 0 <= h["origen"] < len(orig))
        o = vacia if nueva else orig[h["origen"]]
        t_antes, t_despues = texto(o), texto(h)
        if nueva:
            d["agregadas"].append({"n": n, "texto": t_despues})
        elif plano(t_antes) != plano(t_despues):
            d["textos"].append({"n": n, "antes": t_antes, "despues": t_despues})
        if not nueva:
            m_antes, m_despues = _marcas(t_antes), _marcas(t_despues)
            mas = [k for k in MARCAS if m_despues[k] > m_antes[k]]
            menos = [k for k in MARCAS if m_despues[k] < m_antes[k]]
            if mas or menos:
                d["marcas"].append({"n": n, "agregadas": mas, "sacadas": menos})
            otros_antes = Counter(_firma(b) for b in o["bloques"] if b.get("tipo") != "texto")
            otros_despues = Counter(_firma(b) for b in h["bloques"] if b.get("tipo") != "texto")
            sacados = [f.split(":", 1) for f in (otros_antes - otros_despues).elements()]
            sumados = [f.split(":", 1) for f in (otros_despues - otros_antes).elements()]
            if sacados or sumados:
                d["bloques"].append({"n": n, "sacados": [{"tipo": t, "texto": x} for t, x in sacados],
                                     "agregados": [{"tipo": t, "texto": x} for t, x in sumados]})
        trazos_nuevos = len(h["trazos"]) - len(o["trazos"])
        if trazos_nuevos > 0:
            colores = Counter(str(t.get("color") or "rojo") for t in h["trazos"][len(o["trazos"]):])
            d["trazos"].append({"n": n, "cantidad": trazos_nuevos, "colores": sorted(colores)})
        figuras_nuevas = Counter(f.get("tipo") for f in h["figuras"] if f.get("tipo") != "nota") - \
            Counter(f.get("tipo") for f in o["figuras"] if f.get("tipo") != "nota")
        if figuras_nuevas:
            d["figuras"].append({"n": n, "tipos": [FIGURA.get(t, t) for t in figuras_nuevas.elements()]})
        notas_antes = {plano(f.get("texto") or "") for f in o["figuras"] if f.get("tipo") == "nota"}
        for f in h["figuras"]:
            if f.get("tipo") == "nota" and plano(f.get("texto") or "") and plano(f.get("texto") or "") not in notas_antes:
                d["notas"].append({"n": n, "texto": plano(f["texto"])})
        if h.get("fondo") != o.get("fondo"):
            d["fondos"].append({"n": n, "foto": h.get("fondo"), "descripcion": fondos.get(h.get("fondo")) or None,
                                "texto": t_despues})
    d["aprobada"] = not any(v for k, v in d.items() if k != "aprobada")
    return d


# ------------------------------------------------------------------ lo que se le muestra a la persona

def _orden_texto(orden: list) -> str:
    return " → ".join(str(x) if x is not None else "nueva" for x in orden)


def _y(lista: list[str]) -> str:
    return lista[0] if len(lista) == 1 else ", ".join(lista[:-1]) + " y " + lista[-1]


def lo_que_cambiaste(d: dict) -> list[str]:
    if d.get("aprobada"):
        return ["No cambiaste nada: queda como una secuencia aprobada tal cual."]
    salida = []
    if d["orden"]:
        salida.append(f"Cambiaste el orden: {_orden_texto(d['orden'])}.")
    salida += [f"Sacaste la historia {s['n']}: «{_corto(s['texto'])}»." for s in d["sacadas"]]
    salida += [f"Agregaste una historia en el lugar {a['n']}: «{_corto(a['texto'])}»." for a in d["agregadas"]]
    salida += [f"Historia {t['n']}: «{_corto(t['antes'], 60)}» → «{_corto(t['despues'])}»." for t in d["textos"]]
    for m in d["marcas"]:
        partes = ([f"marcaste en {_y(m['agregadas'])}"] if m["agregadas"] else []) + \
                 ([f"sacaste {_y(m['sacadas'])}"] if m["sacadas"] else [])
        salida.append(f"Historia {m['n']}: {' y '.join(partes)}.")
    for b in d["bloques"]:
        salida += [f"Historia {b['n']}: sacaste {BLOQUE.get(x['tipo'], x['tipo'])}" + (f" «{_corto(x['texto'], 60)}»." if x["texto"] else ".")
                   for x in b["sacados"]]
        salida += [f"Historia {b['n']}: agregaste {BLOQUE.get(x['tipo'], x['tipo'])}" + (f" «{_corto(x['texto'], 60)}»." if x["texto"] else ".")
                   for x in b["agregados"]]
    salida += [f"Historia {t['n']}: rayaste encima ({t['cantidad']} {'trazo' if t['cantidad'] == 1 else 'trazos'})." for t in d["trazos"]]
    salida += [f"Historia {f['n']}: agregaste {_y(f['tipos'])}." for f in d["figuras"]]
    salida += [f"Historia {x['n']}: nota para el equipo «{_corto(x['texto'], 120)}»." for x in d["notas"]]
    for f in d["fondos"]:
        if f["foto"] is None:
            salida.append(f"Historia {f['n']}: sacaste el fondo.")
        else:
            salida.append(f"Historia {f['n']}: pusiste de fondo " + (f"«{_corto(f['descripcion'], 70)}»." if f["descripcion"] else f"la foto {f['foto']} del álbum."))
    return salida


def lo_que_usa(d: dict) -> list[str]:
    """Lo que las próximas secuencias van a leer de esta corrección, dicho en humano. Es lo
    mismo que va en el pedido (ver `_hechos`), no una regla aparte."""
    if d.get("aprobada"):
        return ["Esta secuencia queda de ejemplo bueno: las próximas la leen como modelo."]
    salida = []
    if d["orden"]:
        salida.append(f"El orden como lo dejaste: {_orden_texto(d['orden'])}.")
    salida += [f"Escribir como lo escribiste: «{_corto(t['despues'], 110)}»." for t in d["textos"]]
    salida += [f"Sin historias como «{_corto(s['texto'], 80)}»: la sacaste." for s in d["sacadas"]]
    salida += [f"El paso que sumaste: «{_corto(a['texto'], 90)}»." for a in d["agregadas"]]
    marcadas = sorted({k for m in d["marcas"] for k in m["agregadas"]})
    if marcadas:
        salida.append(f"Las palabras que marcás ({_y(marcadas)}), como en la historia {d['marcas'][0]['n']}.")
    for b in d["bloques"]:
        salida += [f"Sin {BLOQUE.get(x['tipo'], x['tipo'])}" + (f" «{_corto(x['texto'], 60)}»" if x["texto"] else "") + f" en un paso como la historia {b['n']}."
                   for x in b["sacados"]]
    salida += [f"Que en un paso como la historia {t['n']} rayás a mano encima." for t in d["trazos"]]
    salida += [f"Que en la historia {f['n']} señalaste con {_y(f['tipos'])}." for f in d["figuras"]]
    salida += [f"Tu nota: «{_corto(x['texto'], 120)}»." for x in d["notas"]]
    salida += [f"Fondos como «{_corto(f['descripcion'], 70)}» para historias como la {f['n']}." for f in d["fondos"] if f["foto"] is not None and f["descripcion"]]
    return list(dict.fromkeys(salida))


# ------------------------------------------------------------------ lo que se le pasa a la IA

def _hechos(d: dict) -> list[str]:
    """Las diferencias como hechos, una por línea, para el pedido."""
    filas = []
    for t in d["textos"][:MAX_TEXTOS]:
        filas.append(f"- Historia {t['n']}. Antes: \"{' / '.join(t['antes'].splitlines())[:240]}\" Después: \"{' / '.join(t['despues'].splitlines())[:240]}\"")
    filas += [f"- Sacó la que era la historia {s['n']}: \"{_corto(s['texto'], 160)}\"" for s in d["sacadas"]]
    filas += [f"- Agregó una historia en el lugar {a['n']}: \"{' / '.join(a['texto'].splitlines())[:240]}\"" for a in d["agregadas"]]
    if d["orden"]:
        filas.append(f"- Orden final (números de la secuencia original): {_orden_texto(d['orden'])}")
    for m in d["marcas"]:
        if m["agregadas"]:
            filas.append(f"- Historia {m['n']}: marcó en {_y(m['agregadas'])}")
        if m["sacadas"]:
            filas.append(f"- Historia {m['n']}: sacó {_y(m['sacadas'])}")
    for b in d["bloques"]:
        filas += [f"- Historia {b['n']}: sacó {BLOQUE.get(x['tipo'], x['tipo'])}" + (f" \"{x['texto'][:120]}\"" if x["texto"] else "") for x in b["sacados"]]
        filas += [f"- Historia {b['n']}: agregó {BLOQUE.get(x['tipo'], x['tipo'])}" + (f" \"{x['texto'][:120]}\"" if x["texto"] else "") for x in b["agregados"]]
    filas += [f"- Historia {t['n']}: rayó a mano encima ({t['cantidad']} {'trazo' if t['cantidad'] == 1 else 'trazos'}, "
              f"en {_y(t['colores'])})" for t in d["trazos"]]
    filas += [f"- Historia {f['n']}: sumó {_y(f['tipos'])} encima" for f in d["figuras"]]
    filas += [f"- Historia {x['n']}: nota para el equipo: \"{x['texto'][:200]}\"" for x in d["notas"]]
    for f in d["fondos"]:
        if f["foto"] is None:
            filas.append(f"- Historia {f['n']}: sacó el fondo")
        else:
            filas.append(f"- Historia {f['n']} (\"{_corto(f['texto'], 80)}\"): puso de fondo la foto {f['foto']}"
                         + (f" ({f['descripcion'][:140]})" if f["descripcion"] else ""))
    return filas


def _fecha(dt: datetime | None) -> str:
    return dt.strftime("%d-%m") if dt else ""


def armar_bloque(registros: list[dict]) -> str:
    """El tramo del pedido con las correcciones (de la más nueva a la más vieja) y las
    secuencias aprobadas tal cual. `registros`: {idea, largo, objetivo, cambios, despues,
    aprobada, fecha}. Función pura."""
    corregidas = [r for r in registros if not r["aprobada"]][:ULTIMAS]
    aprobadas = [r for r in registros if r["aprobada"]][:APROBADAS]
    if not corregidas and not aprobadas:
        return ""
    partes = []
    if corregidas:
        partes.append("# Cómo corrigió Juan secuencias anteriores\n"
                      "Son correcciones reales sobre secuencias que armaste, de la más nueva a la más vieja. "
                      "Lo que cambió es como lo quiere: no vuelvas a escribir lo que reescribió ni lo que sacó.")
        for r in corregidas:
            hechos = _hechos(r["cambios"])
            if hechos:
                partes.append(f"## «{r['idea']}» · {LARGO.get(r['largo'], r['largo'])}"
                              + (f" ({OBJETIVO.get(r['objetivo'], r['objetivo'])})" if r.get("objetivo") else "") + (f" · {r['fecha']}" if r.get("fecha") else "")
                              + "\n" + "\n".join(hechos))
    if aprobadas:
        partes.append("# Secuencias que Juan aprobó tal cual (ejemplos buenos)")
        for r in aprobadas:
            partes.append(f"## «{r['idea']}» · {LARGO.get(r['largo'], r['largo'])}\n{(r.get('despues') or '')[:1500]}")
    texto_final = "\n\n".join(partes)
    return "\n\n" + texto_final[:MAX_CHARS]


def texto_secuencia(historias: list[dict]) -> str:
    """La secuencia en texto, una historia por línea, con marcas e imágenes."""
    filas = []
    for n, h in enumerate(historias, 1):
        partes = []
        for b in h["bloques"]:
            if b.get("tipo") == "texto":
                partes.append(" / ".join(str(b.get("texto") or "").splitlines()))
            elif b.get("tipo") == "imagen":
                partes.append(f"[imagen: {b.get('texto') or 'dibujo de Juan'}]")
            elif b.get("tipo") in BLOQUE:
                partes.append(f"[{b['tipo']}{': ' + str(b.get('texto')) if b.get('texto') else ''}]")
        if h.get("fondo") is not None:
            partes.append(f"[fondo: foto {h['fondo']}]")
        filas.append(f"{n}. " + " · ".join(p for p in partes if p))
    return "\n".join(filas)


# ------------------------------------------------------------------ base

def registrar(secuencia_id: int, variante_id: int, idea: str, largo: str, objetivo: str | None, estructura: str | None,
              original: list, editada: list, d: dict, por: str | None) -> None:
    """Guarda (o pisa) la corrección de esa secuencia. Va dentro de la sesión de quien guarda."""
    ahora = datetime.utcnow()
    datos = dict(variante_id=variante_id, idea=(idea or "")[:300], largo=largo, objetivo=objetivo, estructura=estructura,
                 cambios_json=json.dumps(d, ensure_ascii=False), antes=texto_secuencia(historias_normales(original)),
                 despues=texto_secuencia([historia_normal(h) for h in editada]), aprobada=bool(d.get("aprobada")),
                 por=por, actualizado_at=ahora)
    c = PizarraCorreccion.get(secuencia_id=secuencia_id)
    if c is None:
        PizarraCorreccion(secuencia_id=secuencia_id, creado_at=ahora, **datos)
    else:
        c.set(**datos)


def bloque() -> str:
    """El tramo de correcciones para el pedido de secuencias, leído de la base."""
    with db_session:
        filas = sorted(PizarraCorreccion.select(), key=lambda c: c.actualizado_at, reverse=True)[: (ULTIMAS + APROBADAS) * 3]
        registros = [{"idea": c.idea, "largo": c.largo, "objetivo": c.objetivo, "cambios": json.loads(c.cambios_json or "{}"),
                      "despues": c.despues, "aprobada": c.aprobada, "fecha": _fecha(c.actualizado_at)} for c in filas]
    registros = [r for r in registros if r["aprobada"] or _completo(r["cambios"])]
    return armar_bloque(registros)


def _completo(d: dict) -> bool:
    return all(k in d for k in ("textos", "sacadas", "agregadas", "marcas", "bloques", "trazos", "figuras", "notas", "fondos", "orden"))


def fondos_elegidos() -> list[int]:
    """Las fotos que Juan puso de fondo, de la corrección más nueva a la más vieja."""
    with db_session:
        filas = sorted(PizarraCorreccion.select(), key=lambda c: c.actualizado_at, reverse=True)[:30]
        cambios = [json.loads(c.cambios_json or "{}") for c in filas]
    ids = [f["foto"] for d in cambios for f in d.get("fondos") or [] if isinstance(f.get("foto"), int)]
    return list(dict.fromkeys(ids))
