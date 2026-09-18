"""
Trae lo que Cris tiene en SetSystem a la base de ATV Ops: los pitches y las sesiones de
notas, con su audio.

    python scripts/importar_setsystem.py                 # muestra lo que haría
    python scripts/importar_setsystem.py --aplicar       # lo hace
    python scripts/importar_setsystem.py --aplicar --sin-audio   # sin bajar los audios

Se puede correr las veces que haga falta: cada pitch y cada sesión entran una sola vez,
identificados por su id de SetSystem; lo que ya está se actualiza con lo de allá.

Los pitches quedan a nombre del setter que se indique (--setter cris). Las sesiones,
igual. Es lo que hace que aparezcan en su vista.
"""

import json
import sys
import tempfile
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.db import init_db  # noqa: E402

API = "https://cc-setsystem-api.i-d-a-soluciones-business.workers.dev/api"


def _pedir(path: str) -> dict:
    # Cloudflare rechaza al cliente de Python sin User-Agent: contesta 403.
    pedido = urllib.request.Request(f"{API}{path}", headers={"User-Agent": "atv-ops", "Accept": "application/json"})
    with urllib.request.urlopen(pedido, timeout=60) as r:
        return json.loads(r.read()) or {}


def _bajar_audio(sesion_externa: str, pista: str, destino: Path) -> bool:
    sufijo = f"?pista={pista}" if pista else ""
    pedido = urllib.request.Request(f"{API}/sesiones/{sesion_externa}/audio{sufijo}",
                                    headers={"User-Agent": "atv-ops"})
    try:
        with urllib.request.urlopen(pedido, timeout=300) as r:
            destino.write_bytes(r.read())
        return destino.stat().st_size > 0
    except Exception as e:  # noqa: BLE001
        print(f"    no se pudo bajar el audio de {sesion_externa[:8]}: {str(e)[:80]}")
        return False


def main() -> None:
    aplicar = "--aplicar" in sys.argv
    sin_audio = "--sin-audio" in sys.argv
    setter = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--setter=")), "cris")
    init_db()
    from pony.orm import db_session

    from src.models import PitchSetting, SesionNota
    from src.services import notas_services, setting_services

    leads = [l for l in (_pedir("/leads").get("leads") or []) if l.get("pitch_date") and not l.get("deleted_at")]
    sesiones = [s for s in (_pedir("/sesiones").get("sesiones") or []) if not s.get("deleted_at")]
    print(f"SetSystem: {len(leads)} pitches, {len(sesiones)} sesiones")

    with db_session:
        pitches_ya = {p.externo_id for p in list(PitchSetting.select()) if p.externo_id}
        sesiones_ya = {s.externo_id: s.id for s in list(SesionNota.select()) if s.externo_id}
    print(f"  pitches nuevos:   {sum(1 for l in leads if l['id'] not in pitches_ya)} (ya estaban {sum(1 for l in leads if l['id'] in pitches_ya)})")
    print(f"  sesiones nuevas:  {sum(1 for s in sesiones if s['id'] not in sesiones_ya)} (ya estaban {sum(1 for s in sesiones if s['id'] in sesiones_ya)})")
    con_audio = [s for s in sesiones if s.get("audio_key")]
    print(f"  sesiones con audio: {len(con_audio)}{' (no se bajan: --sin-audio)' if sin_audio else ''}")
    if not aplicar:
        print("\nAgregá --aplicar para guardarlos.")
        return

    usuario = {"username": setter, "rol": "setter"}
    # Los leads que el setter no asignó a un pitch: el nombre del lead es el contacto.
    id_por_externo: dict[str, int] = {}
    resultado = setting_services.importar({"leads": leads}, usuario)
    with db_session:
        id_por_externo = {p.externo_id: p.id for p in list(PitchSetting.select()) if p.externo_id}
    print(f"\n  pitches: {resultado['pitches']}")

    filas = []
    for s in sesiones:
        filas.append({
            "externoId": s["id"], "contacto": s.get("contacto") or s.get("lead_name"),
            "tipo": s.get("tipo") or "call", "fecha": s.get("fecha"), "origen": s.get("origen") or "subida",
            "duracionSeg": s.get("duracion_seg"), "transcripcion": s.get("transcripcion"),
            "segmentos": (json.loads(s["segmentos"]) if isinstance(s.get("segmentos"), str) and s["segmentos"] else s.get("segmentos")),
            "diarizado": s.get("diarizado"), "motor": "whisper" if s.get("audio_key") else "pegado",
            "resumen": s.get("resumen"),
        })
    res_sesiones = notas_services.importar(filas, usuario)
    print(f"  sesiones: {res_sesiones}")

    # Enlazar cada sesión con su pitch y bajar el audio que falte.
    with db_session:
        propias = {s.externo_id: s for s in list(SesionNota.select()) if s.externo_id}
        for s in sesiones:
            fila = propias.get(s["id"])
            if fila is None:
                continue
            if s.get("lead_id") and id_por_externo.get(s["lead_id"]):
                fila.pitch_id = id_por_externo[s["lead_id"]]
    if sin_audio:
        return
    bajados = 0
    with tempfile.TemporaryDirectory() as tmp:
        for s in con_audio:
            with db_session:
                fila = propias_id = SesionNota.get(externo_id=s["id"])
                if fila is None or fila.audio_path:
                    continue
                sid = fila.id
            ext = Path(s["audio_key"]).suffix or ".webm"
            destino = Path(tmp) / f"{s['id']}{ext}"
            if _bajar_audio(s["id"], "", destino):
                notas_services.guardar_audio_importado(sid, destino)
                bajados += 1
            if s.get("audio_key_mic"):
                destino_mic = Path(tmp) / f"{s['id']}-mic{Path(s['audio_key_mic']).suffix or '.webm'}"
                if _bajar_audio(s["id"], "mic", destino_mic):
                    notas_services.guardar_audio_importado(sid, destino_mic, pista="mic")
            print(f"    audio {bajados}/{len(con_audio)}: {s.get('lead_name') or s.get('contacto') or s['id'][:8]}")
    print(f"\n  audios bajados: {bajados}")


if __name__ == "__main__":
    main()
