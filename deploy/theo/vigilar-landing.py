#!/usr/bin/env python3
"""
Avisa al grupo de Ventas cuando la landing del webinar deja de guardar.

    /opt/atv-ops/deploy/theo/vigilar-landing.py            # chequea y avisa
    /opt/atv-ops/deploy/theo/vigilar-landing.py --simulacro # dice qué haría

**El 26-09-2026 el backend estuvo caído cinco horas y nadie se enteró.** El frontend
seguía sirviendo la página, así que desde afuera todo se veía bien: la gente llegaba del
anuncio, completaba el quiz y recibía un error. 255 visitas, cero registros, unos 250
dólares de pauta que no dejaron nada. Se descubrió de casualidad, mirando por qué dos
contadores no coincidían.

Por eso hay dos señales y no una:

1. **La API contesta.** Es el caso obvio y lo agarra un ping.
2. **ATV Ops ve visitas y la landing no.** Este es el que importa: una landing puede
   contestar 200 en `/api/webinar/` —que solo lee variables de entorno— y no poder
   escribir en la base. Como el script de tracking le pega a ops.atvos.io y no depende
   del backend de la landing, comparar los dos contadores detecta justo esa falla.

No usa ningún modelo. Igual que el aviso de llamadas: la inteligencia está en la
comparación, no hace falta que nadie razone para mandar un mensaje.
"""

import json
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

LANDING = "https://join.atvos.io"
GRUPO_VENTAS = "120363405702147911@g.us"
ESTADO = Path("/var/lib/atv-ops/landing-vigilada.json")

# Cuántas visitas tiene que ver ATV Ops en la ventana antes de desconfiar del silencio de
# la landing. Con pocas visitas el cero puede ser real —nadie entró— y avisar sería ruido.
MINIMO_PARA_SOSPECHAR = 8
VENTANA_MIN = 30


def http(url: str, timeout: int = 10) -> int:
    pedido = urllib.request.Request(url, headers={"User-Agent": "atv-ops-vigia"})
    try:
        with urllib.request.urlopen(pedido, timeout=timeout) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:  # noqa: BLE001 — sin red, DNS caído, timeout: todo es "no contesta"
        return 0


def en_contenedor(contenedor: str, script: str) -> str:
    """Corre un script Python adentro de un contenedor y devuelve su salida."""
    try:
        r = subprocess.run(
            ["docker", "exec", "-i", contenedor, "python", "-"],
            input=script, capture_output=True, text=True, timeout=60,
        )
        return (r.stdout or "").strip() if r.returncode == 0 else ""
    except Exception:  # noqa: BLE001
        return ""


CONTAR_OPS = f"""
from src.db import init_db, DB_SCHEMA, ES_POSTGRES, db
from pony.orm import db_session
init_db()
t = f'"{{DB_SCHEMA}}"."tracking_eventos"' if ES_POSTGRES else '"TrackingEvento"'
with db_session:
    print(db.execute(
        f"select count(*) from {{t}} where tipo = 'pageview' "
        "and creado_at > now() - interval '{VENTANA_MIN} minutes'").fetchall()[0][0])
"""

CONTAR_LANDING = f"""
from src.db import init_db, db
init_db()
from pony.orm import db_session
with db_session:
    print(db.execute(
        'select count(*) from webinar."page_views" '
        "where created_at > now() - interval '{VENTANA_MIN} minutes'").fetchall()[0][0])
"""


def revisar() -> tuple[bool, str]:
    """Devuelve (está_sana, por_qué)."""
    if http(f"{LANDING}/") != 200:
        return False, "la página no carga"
    codigo = http(f"{LANDING}/api/webinar/")
    if codigo != 200:
        return False, f"la API no contesta (HTTP {codigo})"

    ops = en_contenedor("atv-ops-backend", CONTAR_OPS)
    landing = en_contenedor("atv-webinar-join-backend", CONTAR_LANDING)
    if not ops.isdigit() or not landing.isdigit():
        # No se pudo comparar. No es motivo para alarmar: el chequeo de arriba ya pasó.
        return True, ""
    if int(ops) >= MINIMO_PARA_SOSPECHAR and int(landing) == 0:
        return False, (f"contesta pero no guarda: {ops} visitas en los últimos "
                       f"{VENTANA_MIN} min y ningún registro del lado de la landing")
    return True, ""


def mandar(texto: str) -> bool:
    try:
        r = subprocess.run(
            ["openclaw", "message", "send", "--channel", "whatsapp",
             "--target", GRUPO_VENTAS, "--message", texto],
            capture_output=True, text=True, timeout=120,
        )
    except Exception as e:  # noqa: BLE001
        print(f"No se pudo ejecutar openclaw: {str(e)[:160]}", file=sys.stderr)
        return False
    if r.returncode != 0:
        print(f"openclaw devolvió {r.returncode}: {(r.stderr or r.stdout)[:300]}", file=sys.stderr)
        return False
    return True


def leer_estado() -> dict:
    try:
        return json.loads(ESTADO.read_text())
    except (OSError, ValueError):
        return {}


def guardar_estado(datos: dict) -> None:
    try:
        ESTADO.parent.mkdir(parents=True, exist_ok=True)
        ESTADO.write_text(json.dumps(datos))
    except OSError as e:
        print(f"No se pudo guardar el estado: {e}", file=sys.stderr)


def main() -> None:
    simulacro = "--simulacro" in sys.argv
    sana, motivo = revisar()
    estado = leer_estado()
    avisado = bool(estado.get("caida"))

    # Solo se avisa en los cambios de estado. Un mensaje cada diez minutos durante una
    # caída larga es ruido, y el ruido enseña a ignorar justamente este mensaje.
    if not sana and not avisado:
        texto = (f"⚠️ *La landing del webinar no está guardando*\n\n{motivo}.\n\n"
                 f"{LANDING}\n\nLa gente que llega del anuncio completa el formulario y "
                 f"recibe un error. Se pierde el registro y el mail.")
    elif sana and avisado:
        desde = estado.get("desde", "")
        cuanto = ""
        if desde:
            try:
                minutos = int((datetime.utcnow() - datetime.fromisoformat(desde)).total_seconds() // 60)
                cuanto = f" Estuvo {minutos} minutos así."
            except ValueError:
                pass
        texto = f"✅ *La landing volvió a guardar.*{cuanto}"
    else:
        if simulacro:
            print("sana" if sana else f"caída (ya avisado): {motivo}")
        return

    if simulacro:
        print(f"Mandaría al grupo de Ventas:\n\n{texto}")
        return

    if not mandar(texto):
        return  # se reintenta en la próxima corrida; el estado no cambia
    guardar_estado({"caida": not sana,
                    "desde": datetime.utcnow().isoformat() if not sana else ""})
    print("Caída avisada." if not sana else "Recuperación avisada.")


if __name__ == "__main__":
    main()
