"""
Prepara el webhook de mensajes de Instagram.

Genera el token de verificación —el que Meta repite al dar de alta la URL para probar que
es nuestra— y guarda la clave secreta de la app, con la que Meta firma cada aviso. Las dos
quedan junto al resto de las credenciales, en la base de ATV Ops.

    python scripts/webhook_instagram.py <app_secret>

La clave secreta está en el panel de Meta, en Configuración de la app → Información
básica, detrás del botón "Mostrar". Si no se pasa, se genera igual el token y los avisos
se aceptan sin validar la firma.
"""

import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.db import init_db  # noqa: E402


def main() -> None:
    init_db()
    from src.services import conexiones_services

    secreto = sys.argv[1].strip() if len(sys.argv) > 1 else ""
    cred = dict(conexiones_services.obtener("instagram"))
    if not cred:
        print("No hay credenciales de Instagram cargadas en ATV Ops.")
        raise SystemExit(1)

    # Si ya había uno, se conserva: cambiarlo obliga a dar de alta la URL de nuevo.
    token = str(cred.get("webhook_verify_token") or "").strip() or secrets.token_hex(16)
    cred["webhook_verify_token"] = token
    if secreto:
        cred["app_secret"] = secreto
    conexiones_services.guardar("instagram", cred, quien="scripts/webhook_instagram")

    print()
    print("En el panel de Meta → Webhooks → Instagram:")
    print()
    print("  URL de devolución de llamada:  https://ops.atvos.io/api/webhooks/instagram")
    print(f"  Token de verificación:         {token}")
    print()
    print("  Campos a suscribir: messages, messaging_postbacks")
    print()
    if secreto:
        print("Clave secreta guardada: los avisos se validan contra la firma de Meta.")
    else:
        print("Sin clave secreta: los avisos se aceptan sin validar la firma.")
        print("Para cargarla: python scripts/webhook_instagram.py <app_secret>")
    print()


if __name__ == "__main__":
    main()
