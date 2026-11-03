"""El contenido de un mes en un PDF: los reels y las secuencias de historias como se
publicaron, con lo que midió Instagram debajo de cada pieza.

Se arma con las miniaturas que ya están guardadas en el servidor (`data/ig`), así que no
pide nada a Instagram: sale al momento y funciona aunque la API esté caída. Una pieza sin
miniatura guardada deja su recuadro vacío en vez de romper la hoja.
"""

from __future__ import annotations

import io
import logging
from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as rl_canvas

logger = logging.getLogger("atv_ops.contenido_pdf")

FOTOS = Path(__file__).resolve().parents[2] / "data" / "ig"

# Los mismos colores de la pantalla (styles/tokens.css): hueso, tinta y el verde solo
# donde hay chats. En papel el fondo va blanco; el hueso queda en las bandas.
TINTA = HexColor("#1c1917")
TINTA_2 = HexColor("#57534e")
TINTA_3 = HexColor("#78716c")
LINEA = HexColor("#d8cfc1")
BANDA = HexColor("#f6f4f0")
VERDE = HexColor("#15803d")

MARGEN = 36
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
         "septiembre", "octubre", "noviembre", "diciembre"]


def _n(v) -> str:
    """12345 → 12.345, como en la pantalla."""
    return f"{int(v or 0):,}".replace(",", ".")


def _pct(v) -> str:
    return "—" if v is None else f"{str(v).replace('.', ',')}%"


def _dia(iso: str | None) -> str:
    if not iso:
        return ""
    a, m, d = iso[:10].split("-")
    return f"{int(d)} de {MESES[int(m) - 1]}"


def _mes_largo(mes: str) -> str:
    return f"{MESES[int(mes[5:7]) - 1]} {mes[:4]}"


def _foto(ruta: str | None, ancho_px: int = 420):
    """La miniatura guardada, achicada a lo que ocupa en la hoja. Nunca levanta.

    Sin achicar, un mes de historias pesaba 21 MB: cada pieza entraba al PDF con el
    tamaño con el que Instagram la devuelve, muchas veces más grande que el recuadro.
    """
    if not ruta:
        return None
    archivo = FOTOS / Path(ruta).name
    try:
        if not (archivo.exists() and archivo.stat().st_size > 0):
            return None
        from PIL import Image

        with Image.open(archivo) as im:
            im = im.convert("RGB")
            if im.width > ancho_px:
                im = im.resize((ancho_px, round(im.height * ancho_px / im.width)), Image.LANCZOS)
            chico = io.BytesIO()
            im.save(chico, format="JPEG", quality=72, optimize=True)
        chico.seek(0)
        return ImageReader(chico)
    except Exception as e:  # noqa: BLE001
        logger.warning("PDF de contenido, miniatura %s: %s", ruta, str(e)[:120])
    return None


def _recortado(c, texto: str, x: float, y: float, ancho: float, fuente="Helvetica", cuerpo=8.5) -> None:
    """Una línea que no se pasa de su ancho: lo que sobra se corta con puntos suspensivos."""
    c.setFont(fuente, cuerpo)
    t = (texto or "").replace("\n", " ").strip()
    if c.stringWidth(t, fuente, cuerpo) <= ancho:
        c.drawString(x, y, t)
        return
    while t and c.stringWidth(t + "…", fuente, cuerpo) > ancho:
        t = t[:-1]
    c.drawString(x, y, t + "…")


def _pieza(c, x: float, y: float, ancho: float, alto: float, ruta: str | None, etiqueta: str = "") -> None:
    """El recuadro 9:16 de una pieza, con su fecha abajo a la izquierda."""
    # El doble del ancho que ocupa en la hoja: se ve nítida impresa y el PDF no se infla.
    foto = _foto(ruta, max(160, round(ancho * 2)))
    if foto is not None:
        c.saveState()
        p = c.beginPath()
        p.rect(x, y, ancho, alto)
        c.clipPath(p, stroke=0)
        # La miniatura puede no ser 9:16: se agranda hasta tapar el recuadro y se recorta.
        iw, ih = foto.getSize()
        escala = max(ancho / iw, alto / ih)
        c.drawImage(foto, x - (iw * escala - ancho) / 2, y - (ih * escala - alto) / 2,
                    iw * escala, ih * escala, mask="auto")
        c.restoreState()
    else:
        c.setFillColor(BANDA)
        c.rect(x, y, ancho, alto, stroke=0, fill=1)
        c.setFillColor(TINTA_3)
        c.setFont("Helvetica", 7)
        c.drawCentredString(x + ancho / 2, y + alto / 2, "sin miniatura")
    c.setStrokeColor(LINEA)
    c.setLineWidth(0.5)
    c.rect(x, y, ancho, alto, stroke=1, fill=0)
    if etiqueta:
        c.setFillColor(HexColor("#1c1917"))
        c.setFont("Helvetica-Bold", 6.5)
        ancho_e = c.stringWidth(etiqueta, "Helvetica-Bold", 6.5) + 8
        c.rect(x + 5, y + 5, ancho_e, 12, stroke=0, fill=1)
        c.setFillColor(HexColor("#ffffff"))
        c.drawString(x + 9, y + 8.5, etiqueta)


def _dato(c, x: float, y: float, rotulo: str, valor: str, color=TINTA) -> None:
    c.setFillColor(TINTA_3)
    c.setFont("Helvetica-Bold", 5.8)
    c.drawString(x, y + 10, rotulo.upper())
    c.setFillColor(color)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(x, y, valor)


def _cabecera(c, titulo: str, sub: str, ancho_hoja: float, alto_hoja: float) -> float:
    c.setFillColor(TINTA)
    c.setFont("Helvetica-Bold", 15)
    c.drawString(MARGEN, alto_hoja - MARGEN - 4, titulo)
    c.setFillColor(TINTA_2)
    c.setFont("Helvetica", 8.5)
    c.drawString(MARGEN, alto_hoja - MARGEN - 18, sub)
    c.setStrokeColor(LINEA)
    c.setLineWidth(0.6)
    c.line(MARGEN, alto_hoja - MARGEN - 26, ancho_hoja - MARGEN, alto_hoja - MARGEN - 26)
    return alto_hoja - MARGEN - 40


def _pie(c, ancho_hoja: float, pagina: int) -> None:
    c.setFillColor(TINTA_3)
    c.setFont("Helvetica", 7)
    c.drawString(MARGEN, 24, "ATV Ops · contenido de Instagram")
    c.drawRightString(ancho_hoja - MARGEN, 24, str(pagina))


# ----------------------------------------------------------------------- reels

def reels_pdf(mes: str, reels: list[dict]) -> bytes:
    """Una tarjeta por reel, tres por fila: la pieza, lo que midió Instagram y, si está
    analizado, qué parte de los que comentaron califica como lead."""
    buffer = io.BytesIO()
    ancho_hoja, alto_hoja = A4
    c = rl_canvas.Canvas(buffer, pagesize=A4)
    c.setTitle(f"Reels {_mes_largo(mes)} · ATV Ops")

    # Cuatro por fila y dos filas entran enteras en A4 con la pieza en 9:16 sin recortar;
    # con tres por fila la segunda fila se iba abajo del pie.
    cols, filas_por_hoja = 4, 2
    hueco = 12
    ancho = (ancho_hoja - 2 * MARGEN - hueco * (cols - 1)) / cols
    alto_foto = ancho * 16 / 9
    alto_texto = 103   # lo que ocupan título, CTA, los cuatro números, la línea chica y la banda
    pagina = 1

    vistas = sum(r.get("views") or 0 for r in reels)
    alcance = sum(r.get("reach") or 0 for r in reels)
    chats = sum(r.get("chats") or 0 for r in reels)
    sub = f"{len(reels)} reels · {_n(vistas)} vistas · {_n(alcance)} de alcance · {_n(chats)} chats"
    tope = _cabecera(c, f"Reels de {_mes_largo(mes)}", sub, ancho_hoja, alto_hoja)

    for i, r in enumerate(reels):
        en_hoja = i % (cols * filas_por_hoja)
        if i and en_hoja == 0:
            _pie(c, ancho_hoja, pagina)
            c.showPage()
            pagina += 1
            tope = _cabecera(c, f"Reels de {_mes_largo(mes)}", sub, ancho_hoja, alto_hoja)
        col, fila = en_hoja % cols, en_hoja // cols
        x = MARGEN + col * (ancho + hueco)
        y_arriba = tope - fila * (alto_foto + alto_texto + hueco)
        y_foto = y_arriba - alto_foto
        _pieza(c, x, y_foto, ancho, alto_foto, r.get("thumbnail"), _dia(r.get("fecha")))

        y = y_foto - 13
        c.setFillColor(TINTA)
        _recortado(c, r.get("titulo") or "(sin caption)", x, y, ancho, "Helvetica-Bold", 8.5)
        y -= 11
        cta = f"CTA · {r['keyword']}" if r.get("cta", {}).get("esCta") else "Sin CTA"
        c.setFillColor(VERDE if r.get("cta", {}).get("esCta") else TINTA_3)
        _recortado(c, cta, x, y, ancho, "Helvetica-Bold", 7)

        y -= 20
        media = ancho / 2
        _dato(c, x, y, "Vistas", _n(r.get("views")))
        _dato(c, x + media, y, "Alcance", _n(r.get("reach")))
        y -= 20
        tiene_chats = bool(r.get("chats"))
        _dato(c, x, y, "Interac.", _n(r.get("total_interactions")))
        _dato(c, x + media, y, "Chats",
              _n(r["chats"]) if tiene_chats else ("0" if r.get("cta", {}).get("esCta") else "—"),
              VERDE if tiene_chats else TINTA_3)

        y -= 13
        c.setFillColor(TINTA_3)
        _recortado(c, f"{_n(r.get('likes'))} likes · {_n(r.get('comments'))} coment · "
                      f"{_n(r.get('shares'))} comp · {_n(r.get('saved'))} guard", x, y, ancho, "Helvetica", 5.8)

        a = r.get("audiencia") or {}
        y -= 16
        c.setFillColor(BANDA)
        c.rect(x, y - 4, ancho, 18, stroke=0, fill=1)
        c.setFillColor(TINTA_3)
        c.setFont("Helvetica-Bold", 5.8)
        c.drawString(x + 5, y + 4, "CALIFICADOS")
        if a.get("analizados"):
            c.setFillColor(TINTA)
            c.setFont("Helvetica-Bold", 9)
            c.drawRightString(x + ancho - 5, y + 2.5, f"{_pct(a['pct'])}  ({a['calificados']}/{a['analizados']})")
        else:
            c.setFillColor(TINTA_3)
            c.setFont("Helvetica", 7)
            c.drawRightString(x + ancho - 5, y + 3, "sin analizar")

    _pie(c, ancho_hoja, pagina)
    c.save()
    return buffer.getvalue()


# ------------------------------------------------------------------ historias

def historias_pdf(mes: str, secuencias: list[dict]) -> bytes:
    """Una fila por secuencia (un día de historias): sus piezas en orden y los totales
    del día. Una secuencia con muchas piezas sigue en la fila de abajo."""
    buffer = io.BytesIO()
    ancho_hoja, alto_hoja = A4
    c = rl_canvas.Canvas(buffer, pagesize=A4)
    c.setTitle(f"Historias {_mes_largo(mes)} · ATV Ops")

    por_fila = 8
    hueco = 7
    ancho = (ancho_hoja - 2 * MARGEN - hueco * (por_fila - 1)) / por_fila
    alto_foto = ancho * 16 / 9
    pagina = 1

    piezas = sum(s.get("piezas") or 0 for s in secuencias)
    respuestas = sum(s.get("respuestas") or 0 for s in secuencias)
    sub = (f"{len(secuencias)} secuencias · {_n(piezas)} piezas · "
           f"{_n(sum(s.get('vistas') or 0 for s in secuencias))} vistas · {_n(respuestas)} respuestas")
    y = _cabecera(c, f"Historias de {_mes_largo(mes)}", sub, ancho_hoja, alto_hoja)

    for s in secuencias:
        trozos = [s["historias"][i:i + por_fila] for i in range(0, len(s.get("historias") or []), por_fila)] or [[]]
        alto_bloque = 26 + len(trozos) * (alto_foto + hueco) + 10
        if y - alto_bloque < 46:
            _pie(c, ancho_hoja, pagina)
            c.showPage()
            pagina += 1
            y = _cabecera(c, f"Historias de {_mes_largo(mes)}", sub, ancho_hoja, alto_hoja)

        c.setFillColor(TINTA)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(MARGEN, y - 10, _dia(s.get("fecha")))
        if s.get("cta"):
            c.setFillColor(VERDE)
            c.setFont("Helvetica-Bold", 7)
            c.drawString(MARGEN + c.stringWidth(_dia(s.get("fecha")), "Helvetica-Bold", 10) + 8, y - 10, "CON CTA")
        c.setFillColor(TINTA_2)
        c.setFont("Helvetica", 7.5)
        c.drawRightString(ancho_hoja - MARGEN, y - 10,
                          f"{_n(s.get('piezas'))} piezas · {_n(s.get('vistas'))} vistas · "
                          f"{_n(s.get('alcance'))} de alcance · {_n(s.get('respuestas'))} respuestas"
                          + (f" · {_n(s.get('chats'))} chats" if s.get("chats") else ""))
        y -= 26

        for trozo in trozos:
            for j, h in enumerate(trozo):
                x = MARGEN + j * (ancho + hueco)
                _pieza(c, x, y - alto_foto, ancho, alto_foto, h.get("thumbnail"))
                c.setFillColor(TINTA_3)
                c.setFont("Helvetica", 5.5)
                c.drawCentredString(x + ancho / 2, y - alto_foto - 8, _n(h.get("views")))
            y -= alto_foto + hueco + 6
        y -= 8
        c.setStrokeColor(LINEA)
        c.setLineWidth(0.4)
        c.line(MARGEN, y + 4, ancho_hoja - MARGEN, y + 4)

    _pie(c, ancho_hoja, pagina)
    c.save()
    return buffer.getvalue()
