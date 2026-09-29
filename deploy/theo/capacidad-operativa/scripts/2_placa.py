#!/usr/bin/env python3
"""
Parte 2 — Armar la foto.

    python3 scripts/2_placa.py

Lee salida/agenda.json (parte 1) y los números de config.json, y dibuja
salida/capacidad.png: 1080×1350, negro y rojo, en Barlow. Es el diseño aprobado el
29-09-2026 —"CAPACIDAD OPERATIVA", el porcentaje, el recuadro de cierres y la agenda del
día— hecho con Pillow para no depender de un navegador en el server.

Los nombres van con nombre e inicial ("Tomás F."): la foto puede quedar a la vista y no
tiene por qué mostrar el apellido de nadie.
"""

import json

from PIL import Image, ImageDraw, ImageFont

from comun import AGENDA, FOTO, FUENTES, SALIDA, config, salir

ANCHO, ALTO, MARGEN = 1080, 1350, 84
NEGRO, PANEL, LINEA = "#000000", "#0e0e0e", "#232323"
ROJO, TEXTO, APAGADO = "#e3121c", "#f4f4f4", "#8a8a8a"


def fuente(peso: str, tam: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FUENTES / f"Barlow-{peso}.ttf"), tam)


def ancho(txt: str, f, espacio: float = 0) -> float:
    return f.getlength(txt) + espacio * max(len(txt) - 1, 0)


def escribir(d, x, y, txt, f, color, espacio: float = 0, ancla: str = "ls"):
    """Texto con interletrado. `y` es la línea de base: así todo alinea por abajo."""
    if not espacio:
        d.text((x, y), txt, font=f, fill=color, anchor=ancla)
        return
    if ancla[0] == "r":
        x -= ancho(txt, f, espacio)
    for letra in txt:
        d.text((x, y), letra, font=f, fill=color, anchor="l" + ancla[1])
        x += f.getlength(letra) + espacio


def corto(nombre: str) -> str:
    partes = nombre.split()
    if not partes:
        return "Sin nombre"
    return partes[0].capitalize() + (f" {partes[1][0].upper()}." if len(partes) > 1 else "")


def porcentaje(v) -> str:
    v = float(v)
    return f"{v:.0f}%" if v == int(v) else f"{v:.1f}%"


def main() -> None:
    try:
        agenda = json.loads(AGENDA.read_text())
    except (OSError, ValueError) as e:
        salir(f"No se pudo leer {AGENDA}: corré antes la parte 1 ({e}).")
    cfg = config()
    llamadas = agenda.get("llamadas") or []
    cierres = int(cfg.get("cierres") or 0)

    f_titulo, f_pct, f_etq = fuente("Bold", 46), fuente("ExtraBold", 168), fuente("Medium", 22)
    f_num, f_chip = fuente("Bold", 120), fuente("Medium", 21)
    f_cab, f_cab_der = fuente("Medium", 22), fuente("SemiBold", 22)
    f_hora, f_nom, f_tag = fuente("Bold", 34), fuente("Medium", 30), fuente("SemiBold", 18)

    # Alturas de cada bloque, para centrar todo en vertical.
    filas = max(len(llamadas), 1)
    alto_fila = 86 if filas <= 7 else max(58, int(86 * 7 / filas))
    alto_titulo, alto_top, alto_panel = 46, 208, 80 + alto_fila * filas
    total = alto_titulo + 56 + alto_top + 64 + alto_panel
    y = (ALTO - total) // 2

    img = Image.new("RGB", (ANCHO, ALTO), NEGRO)
    d = ImageDraw.Draw(img)

    # Título
    escribir(d, MARGEN, y + 40, "CAPACIDAD OPERATIVA", f_titulo, TEXTO, espacio=2.8)
    y += alto_titulo + 56

    # Porcentaje + recuadro de cierres
    escribir(d, MARGEN - 4, y + 150, porcentaje(cfg.get("ocupacion") or 0), f_pct, ROJO)
    escribir(d, MARGEN, y + 196, "OCUPACIÓN", f_etq, APAGADO, espacio=5.3)
    chip_w, chip_h = 230, 208
    cx0 = ANCHO - MARGEN - chip_w
    d.rounded_rectangle((cx0, y, ANCHO - MARGEN, y + chip_h), radius=26, fill=PANEL, outline=ROJO, width=2)
    medio = cx0 + chip_w / 2
    d.text((medio, y + 136), str(cierres), font=f_num, fill=ROJO, anchor="ms")
    d.text((medio, y + 176), "cierre" if cierres == 1 else "cierres", font=f_chip, fill=APAGADO, anchor="ms")
    y += alto_top + 64

    # Agenda de hoy
    d.rounded_rectangle((MARGEN, y, ANCHO - MARGEN, y + alto_panel), radius=26, fill=PANEL, outline=LINEA, width=2)
    x0, x1 = MARGEN + 34, ANCHO - MARGEN - 34
    escribir(d, x0, y + 50, "AGENDA DE HOY", f_cab, APAGADO, espacio=4.4)
    n = len(llamadas)
    d.text((x1, y + 50), f"{n} {'llamada' if n == 1 else 'llamadas'}", font=f_cab_der, fill=TEXTO, anchor="rs")
    fy = y + 66
    if not llamadas:
        d.text((x0, fy + alto_fila / 2 + 11), "Sin llamadas agendadas", font=f_nom, fill=APAGADO, anchor="ls")
    for i, ll in enumerate(llamadas):
        if i:
            d.line((x0, fy, x1, fy), fill=LINEA, width=1)
        base = fy + alto_fila / 2 + 12
        d.text((x0, base), ll.get("hora") or "", font=f_hora, fill=TEXTO, anchor="ls")
        d.text((x0 + 138, base), corto(ll.get("nombre") or ""), font=f_nom, fill=TEXTO, anchor="ls")
        tag = "Agendada"
        tw = f_tag.getlength(tag) + 32
        ty = fy + alto_fila / 2
        d.rounded_rectangle((x1 - tw, ty - 17, x1, ty + 17), radius=17, outline=ROJO, width=2)
        d.text((x1 - tw / 2, ty), tag, font=f_tag, fill=ROJO, anchor="mm")
        fy += alto_fila

    SALIDA.mkdir(exist_ok=True)
    img.save(FOTO, optimize=True)
    print(f"Foto lista: {FOTO} ({n} llamadas, ocupación {porcentaje(cfg.get('ocupacion') or 0)}, {cierres} cierres).")


if __name__ == "__main__":
    main()
