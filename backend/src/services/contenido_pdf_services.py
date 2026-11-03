"""El contenido de uno o varios meses en un PDF: los reels y las secuencias de historias
como se publicaron, con lo que midió Instagram.

El PDF está pensado para que lo lea una IA: la pieza va lo más grande que entra en la hoja
y los números van chicos, porque el texto del PDF se lee del archivo y no de la imagen.

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

MARGEN = 30
PIE = 34          # lo que se reserva abajo para el pie de página
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
    _, m, d = iso[:10].split("-")
    return f"{int(d)} de {MESES[int(m) - 1]}"


def _mes_largo(mes: str) -> str:
    return f"{MESES[int(mes[5:7]) - 1]} {mes[:4]}"


def _foto(ruta: str | None, ancho_pt: float):
    """La miniatura guardada, achicada a lo que ocupa en la hoja. Nunca levanta.

    Se guarda al triple de los puntos que mide en el papel, para que se lea al ampliarla;
    nunca se agranda más allá del original. Sin esto, un mes de historias pesaba 21 MB
    porque cada pieza entraba con el tamaño que devuelve Instagram.
    """
    if not ruta:
        return None
    archivo = FOTOS / Path(ruta).name
    try:
        if not (archivo.exists() and archivo.stat().st_size > 0):
            return None
        from PIL import Image

        tope = max(240, round(ancho_pt * 3))
        with Image.open(archivo) as im:
            im = im.convert("RGB")
            if im.width > tope:
                im = im.resize((tope, round(im.height * tope / im.width)), Image.LANCZOS)
            chico = io.BytesIO()
            im.save(chico, format="JPEG", quality=80, optimize=True)
        chico.seek(0)
        return ImageReader(chico)
    except Exception as e:  # noqa: BLE001
        logger.warning("PDF de contenido, miniatura %s: %s", ruta, str(e)[:120])
    return None


def _recortado(c, texto: str, x: float, y: float, ancho: float, fuente="Helvetica", cuerpo=7) -> None:
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
    """El recuadro 9:16 de una pieza, con una etiqueta abajo a la izquierda."""
    foto = _foto(ruta, ancho)
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
        c.setFillColor(TINTA)
        c.setFont("Helvetica-Bold", 6.5)
        ancho_e = c.stringWidth(etiqueta, "Helvetica-Bold", 6.5) + 8
        c.rect(x + 5, y + 5, ancho_e, 12, stroke=0, fill=1)
        c.setFillColor(HexColor("#ffffff"))
        c.drawString(x + 9, y + 8.5, etiqueta)


def _cabecera(c, titulo: str, sub: str, ancho_hoja: float, alto_hoja: float) -> float:
    c.setFillColor(TINTA)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(MARGEN, alto_hoja - MARGEN - 4, titulo)
    c.setFillColor(TINTA_2)
    c.setFont("Helvetica", 8)
    c.drawString(MARGEN, alto_hoja - MARGEN - 16, sub)
    c.setStrokeColor(LINEA)
    c.setLineWidth(0.6)
    c.line(MARGEN, alto_hoja - MARGEN - 23, ancho_hoja - MARGEN, alto_hoja - MARGEN - 23)
    return alto_hoja - MARGEN - 34


def _pie(c, ancho_hoja: float, pagina: int) -> None:
    c.setFillColor(TINTA_3)
    c.setFont("Helvetica", 7)
    c.drawString(MARGEN, 20, "ATV Ops · contenido de Instagram")
    c.drawRightString(ancho_hoja - MARGEN, 20, str(pagina))


# ----------------------------------------------------------------------- reels

def reels_pdf(bloques: list[tuple[str, list[dict]]]) -> bytes:
    """Tres reels por fila y dos filas por hoja: la pieza entera en 9:16 y sus números en
    una tira chica debajo. Cada mes arranca en hoja nueva."""
    buffer = io.BytesIO()
    ancho_hoja, alto_hoja = A4
    c = rl_canvas.Canvas(buffer, pagesize=A4)
    c.setTitle("Reels · ATV Ops")

    cols, filas_por_hoja = 3, 2
    hueco = 10
    ancho = (ancho_hoja - 2 * MARGEN - hueco * (cols - 1)) / cols
    alto_foto = ancho * 16 / 9
    alto_texto = 43   # título, la tira de números y la de calificados
    pagina = 0
    tope = alto_hoja

    for mes, reels in bloques:
        vistas = sum(r.get("views") or 0 for r in reels)
        alcance = sum(r.get("reach") or 0 for r in reels)
        chats = sum(r.get("chats") or 0 for r in reels)
        sub = f"{len(reels)} reels · {_n(vistas)} vistas · {_n(alcance)} de alcance · {_n(chats)} chats"
        titulo = f"Reels de {_mes_largo(mes)}"
        for i, r in enumerate(reels):
            en_hoja = i % (cols * filas_por_hoja)
            if en_hoja == 0:
                if pagina:
                    _pie(c, ancho_hoja, pagina)
                    c.showPage()
                pagina += 1
                tope = _cabecera(c, titulo, sub, ancho_hoja, alto_hoja)
            col, fila = en_hoja % cols, en_hoja // cols
            x = MARGEN + col * (ancho + hueco)
            y_foto = tope - fila * (alto_foto + alto_texto + hueco) - alto_foto
            _pieza(c, x, y_foto, ancho, alto_foto, r.get("thumbnail"), _dia(r.get("fecha")))

            es_cta = bool((r.get("cta") or {}).get("esCta"))
            tiene_chats = bool(r.get("chats"))
            y = y_foto - 11
            c.setFillColor(TINTA)
            _recortado(c, r.get("titulo") or "(sin caption)", x, y, ancho, "Helvetica-Bold", 7.5)
            y -= 10
            c.setFillColor(TINTA_2)
            _recortado(c, f"{_n(r.get('views'))} vistas · {_n(r.get('reach'))} alcance · "
                          f"{_n(r.get('total_interactions'))} interac · "
                          + (f"{_n(r['chats'])} chats" if tiene_chats else ("0 chats" if es_cta else "sin CTA")),
                       x, y, ancho, "Helvetica", 6.5)
            y -= 9
            c.setFillColor(TINTA_3)
            _recortado(c, f"{_n(r.get('likes'))} likes · {_n(r.get('comments'))} coment · "
                          f"{_n(r.get('shares'))} comp · {_n(r.get('saved'))} guard"
                          + (f" · palabra «{r.get('keyword')}»" if es_cta and r.get("keyword") else ""),
                       x, y, ancho, "Helvetica", 6.5)

            a = r.get("audiencia") or {}
            y -= 13
            c.setFillColor(BANDA)
            c.rect(x, y - 3, ancho, 13, stroke=0, fill=1)
            c.setFillColor(TINTA_3)
            c.setFont("Helvetica-Bold", 5.6)
            c.drawString(x + 4, y + 1, "CALIFICADOS")
            if a.get("analizados"):
                c.setFillColor(TINTA)
                c.setFont("Helvetica-Bold", 7.5)
                c.drawRightString(x + ancho - 4, y + 0.5,
                                  f"{_pct(a['pct'])}  ({a['calificados']}/{a['analizados']})")
            else:
                c.setFillColor(TINTA_3)
                c.setFont("Helvetica", 6.5)
                c.drawRightString(x + ancho - 4, y + 1, "sin analizar")

    _pie(c, ancho_hoja, max(pagina, 1))
    c.save()
    return buffer.getvalue()


# ------------------------------------------------------------------ historias

def historias_pdf(bloques: list[tuple[str, list[dict]]]) -> bytes:
    """Una fila por secuencia (un día de historias): sus piezas en orden y los totales del
    día. Cuatro piezas por fila, para que se lea lo que dice cada una. Cada mes arranca en
    hoja nueva."""
    buffer = io.BytesIO()
    ancho_hoja, alto_hoja = A4
    c = rl_canvas.Canvas(buffer, pagesize=A4)
    c.setTitle("Historias · ATV Ops")

    por_fila = 4
    # Doce piezas por hoja: con 4 por fila entran tres filas justas, y así una pieza se ve
    # el doble de grande que antes sin que el PDF se vaya al doble de hojas.
    hueco = 12
    ancho = (ancho_hoja - 2 * MARGEN - hueco * (por_fila - 1)) / por_fila
    alto_foto = ancho * 16 / 9
    pagina = 0

    for mes, secuencias in bloques:
        piezas = sum(s.get("piezas") or 0 for s in secuencias)
        sub = (f"{len(secuencias)} secuencias · {_n(piezas)} piezas · "
               f"{_n(sum(s.get('vistas') or 0 for s in secuencias))} vistas · "
               f"{_n(sum(s.get('respuestas') or 0 for s in secuencias))} respuestas")
        titulo = f"Historias de {_mes_largo(mes)}"
        if pagina:
            _pie(c, ancho_hoja, pagina)
            c.showPage()
        pagina += 1
        y = _cabecera(c, titulo, sub, ancho_hoja, alto_hoja)

        for s in secuencias:
            lista = s.get("historias") or []
            trozos = [lista[i:i + por_fila] for i in range(0, len(lista), por_fila)] or [[]]
            # Si no entra el encabezado del día con su primera fila de piezas, hoja nueva.
            if y - (22 + alto_foto + 14) < PIE:
                _pie(c, ancho_hoja, pagina)
                c.showPage()
                pagina += 1
                y = _cabecera(c, titulo, sub, ancho_hoja, alto_hoja)

            dia = _dia(s.get("fecha"))
            c.setFillColor(TINTA)
            c.setFont("Helvetica-Bold", 9.5)
            c.drawString(MARGEN, y - 9, dia)
            if s.get("cta"):
                c.setFillColor(VERDE)
                c.setFont("Helvetica-Bold", 6.5)
                c.drawString(MARGEN + c.stringWidth(dia, "Helvetica-Bold", 9.5) + 7, y - 9, "CON CTA")
            c.setFillColor(TINTA_2)
            c.setFont("Helvetica", 7)
            c.drawRightString(ancho_hoja - MARGEN, y - 9,
                              f"{_n(s.get('piezas'))} piezas · {_n(s.get('vistas'))} vistas · "
                              f"{_n(s.get('alcance'))} de alcance · {_n(s.get('respuestas'))} respuestas"
                              + (f" · {_n(s.get('chats'))} chats" if s.get("chats") else ""))
            y -= 22

            for trozo in trozos:
                if y - alto_foto - 14 < PIE:
                    _pie(c, ancho_hoja, pagina)
                    c.showPage()
                    pagina += 1
                    y = _cabecera(c, titulo, sub, ancho_hoja, alto_hoja)
                for j, h in enumerate(trozo):
                    x = MARGEN + j * (ancho + hueco)
                    _pieza(c, x, y - alto_foto, ancho, alto_foto, h.get("thumbnail"))
                    c.setFillColor(TINTA_3)
                    c.setFont("Helvetica", 6)
                    c.drawCentredString(x + ancho / 2, y - alto_foto - 9, f"{_n(h.get('views'))} vistas")
                y -= alto_foto + 18
            y -= 4
            c.setStrokeColor(LINEA)
            c.setLineWidth(0.4)
            c.line(MARGEN, y + 6, ancho_hoja - MARGEN, y + 6)

    _pie(c, ancho_hoja, max(pagina, 1))
    c.save()
    return buffer.getvalue()
