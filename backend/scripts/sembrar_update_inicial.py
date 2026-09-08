"""
Carga en el registro de pedidos abiertos el último update manual del equipo
(8 sep 2026), para que la primera ronda de Claude arranque con contexto.

Uso (en el VPS):  docker compose exec backend python scripts/sembrar_update_inicial.py
Local:            .venv/bin/python scripts/sembrar_update_inicial.py

Idempotente: no duplica un pedido si ya existe uno abierto con el mismo canal y tema.
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pony.orm import db_session  # noqa: E402

from src.db import init_db  # noqa: E402
from src.models import PedidoAbierto  # noqa: E402
from src.services.transcripts_services import AR_TZ  # noqa: E402

# (responsable, canal, tipo, tema, horas_esperando o None, estado, nota)
ITEMS = [
    ("Juan Pablo", "mateo-malvasi", "agenda", "Coordinar horario de llamada", None, "esperando_equipo", None),
    ("Juan Pablo", "alicia-damian", "entregable", "Feedback de Métricas", 20, "esperando_equipo", None),
    ("Juan Pablo", "paul-vega", "consulta", "Anuncios ganadores", 18, "esperando_equipo", None),
    ("Juan Pablo", "miguel-diego", "consulta", "Webinar (Procesos internos)", 13, "esperando_equipo", None),
    ("Juan Pablo", "premia2", "consulta", "Adelantar llamada", None, "esperando_equipo", "Empezó como agenda, ahora es consulta"),
    ("Juan Pablo", "valentino-y-gaston", "entregable", "Roadmap", None, "en_proceso", "Upsell"),
    ("Juan Pablo", "patric-hlosta", "entregable", "Enviar Roadmap", None, "esperando_equipo", "Por interno"),
    ("Juan Pablo", "martin-zuniga", "agenda", "Coordinar horario de llamada", None, "esperando_equipo", None),
    ("Juan Pablo", "alan-klein", "seguimiento", "MIRO", None, "esperando_equipo", None),
    ("Juan Pablo", "sofia-valentina", "consulta", "Publicidad", None, "esperando_equipo", None),
    ("Juan Pablo", "leandro-aaron", "feedback", "Loom", None, "esperando_equipo", None),
    ("Juan Pablo", "alvaro-larraz", "consulta", "Gestión de leads", None, "esperando_equipo", "Llevado por WhatsApp"),
    ("Juan Pablo", "nico-martin", "feedback", "Reels (Datos obtenidos)", None, "esperando_equipo", None),
    ("Lucas", "alvaro-larraz", "consulta", "Procesos de prospección (Update)", 21, "esperando_equipo", None),
    ("Lucas", "oriol-ortega", "consulta", "Agenda promedio en YouTube", 15, "esperando_equipo", None),
    ("Lucas", "gretelukz", "entregable", "Plantilla de trackeo Setting", None, "esperando_equipo", None),
    ("Alejandro Ramírez", "nati-y-marce", "entregable", "Guía sobre Mecanismo único", 17, "esperando_equipo", None),
    ("Alejandro Ramírez", "oriol-ortega", "seguimiento", "Update de consultas", 15, "esperando_equipo", None),
    ("Alejandro Ramírez", "martin-zuniga", "feedback", "Estructura VSL Post-Agenda", 10, "esperando_equipo", None),
    ("Alejandro Ramírez", "giuliano-sicardi", "feedback", "Loom Sistemas (Oferta)", 3, "esperando_equipo", None),
    ("Alejandro Ramírez", "joaquin-castello", "consulta", "Avances en Roadmap (Webinars)", None, "esperando_equipo", None),
    ("Alejandro Ramírez", "vicente-dicapore", "feedback", "Avatar, Oferta, Método Único", None, "esperando_equipo", "También @Juan Pablo"),
    ("Emi", "julian-lucero", "entregable", "Weekly Marketing", 22, "esperando_equipo", None),
    ("Emi", "patric-hlosta", "entregable", "Video Main", 20, "esperando_equipo", None),
    ("Emi", "felipe-francesco", "feedback", "VSL", 15, "esperando_equipo", None),
    ("Emi", "vicente-dicapore", "feedback", "Estrategia de Contenidos", None, "esperando_equipo", None),
    ("Nick Xanderz", "facundo-martinez", "feedback", "Llamadas de ventas", None, "esperando_equipo", None),
    ("Franco", "facundo-martinez", "feedback", "Construcción de landing page", None, "esperando_equipo", None),
]
HORAS_DEFAULT = 24  # los ítems sin ⏳ en el update manual no traían hora


def main() -> None:
    init_db()
    from src.controllers.clientes_controller import service as clientes_service

    data = clientes_service.listar()
    por_canal = {(c.get("canalId") or "").split("/")[-1]: c for c in data["clientes"]}
    ahora = datetime.now(AR_TZ)
    creados = saltados = 0
    faltan: list[str] = []
    with db_session:
        for responsable, canal, tipo, tema, horas, estado, nota in ITEMS:
            cliente = por_canal.get(canal)
            if cliente is None:
                faltan.append(canal)
                continue
            existe = PedidoAbierto.select(lambda p: p.canal_id == cliente["canalId"] and p.tema == tema and p.estado != "resuelto").first()
            if existe is not None:
                saltados += 1
                continue
            creado = (ahora - timedelta(hours=horas if horas is not None else HORAS_DEFAULT)).astimezone(timezone.utc).replace(tzinfo=None)
            campos = dict(
                cliente_id=cliente["id"], canal_id=cliente["canalId"], tipo=tipo, tema=tema, estado=estado,
                responsable=responsable, creado_at=creado, actualizado_at=datetime.utcnow(),
            )
            nota_final = nota if horas is not None else " · ".join(x for x in (nota, "hora de origen aproximada") if x)
            if nota_final:
                campos["nota"] = nota_final
            PedidoAbierto(**campos)
            creados += 1
    print(f"Creados {creados}, ya existían {saltados}.")
    if faltan:
        print("Canales que no están en la cartera activa (no cargados):", ", ".join(faltan))
    try:
        from src.services.pedidos_services import exportar_cerebro
        print("Cerebro exportado en", exportar_cerebro())
    except Exception as e:  # noqa: BLE001
        print("No se pudo exportar el cerebro:", e)


if __name__ == "__main__":
    main()
