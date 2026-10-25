"""
Prueba en producción que cada uno del equipo carga su daily sin mezclarse con la de otro,
y después borra todo lo que creó.

    docker exec atv-ops-backend python scripts/probar_daily.py

Pasa por la API de verdad (http://127.0.0.1:8000 adentro del contenedor), con la sesión de
cada persona, en la semana que viene: así no toca la daily de hoy ni el aviso de Theo.
Las tareas de prueba llevan el texto "PRUEBA-AISLAMIENTO" y solo esas se borran, con sus
marcas. Al final compara cuántas tareas tenía cada uno antes y después: tienen que ser las
mismas.
"""

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pony.orm import db_session  # noqa: E402

from src.db import init_db  # noqa: E402

API = os.environ.get("OPS_API", "http://127.0.0.1:8000")
MARCA = "PRUEBA-AISLAMIENTO"
errores: list[str] = []


def pedir(metodo: str, ruta: str, token: str, cuerpo: dict | None = None) -> tuple[int, dict]:
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(f"{API}{ruta}", data=datos, method=metodo,
                                 headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, {}


def chequear(ok: bool, que: str) -> None:
    print(f"  {'✓' if ok else '✗'} {que}")
    if not ok:
        errores.append(que)


def contar(semana) -> dict[str, int]:
    from src.models import TareaSemana
    with db_session:
        out: dict[str, int] = {}
        for t in list(TareaSemana.select(lambda t: t.semana == semana)):
            if MARCA not in t.texto:
                out[t.usuario] = out.get(t.usuario, 0) + 1
        return out


def limpiar() -> int:
    from src.models import MarcaDaily, TareaSemana
    with db_session:
        tareas = [t for t in list(TareaSemana.select()) if t.texto.startswith(MARCA)]
        for t in tareas:
            for m in list(MarcaDaily.select(lambda m: m.tarea == t)):
                m.delete()
            t.delete()
        return len(tareas)


def main() -> None:
    init_db()
    from src.models import CierreDaily, Usuario
    from src.services import daily_services as d
    from src.services.auth_services import _emitir_token

    semana = d.lunes_de(d.hoy()) + timedelta(days=7)
    lunes = semana.isoformat()
    with db_session:
        gente = sorted(Usuario.select(lambda u: u.area is not None), key=lambda u: (u.orden, u.username))
        tokens = {u.username: _emitir_token(u)["token"] for u in gente}
        mails = {u.username: d._emails(u) for u in gente}
        cierres_antes = CierreDaily.select().count()
    antes = contar(semana)
    print(f"Equipo: {len(tokens)} personas · semana de prueba {lunes}\n")

    print("1. Cada mail entra a su propia cuenta")
    for u, ms in mails.items():
        for m in ms:
            with db_session:
                x = d.usuario_por_email(m)
                quien = x.username if x is not None else None
            chequear(quien == u, f"{m} → {u}")
        if not ms:
            print(f"  · {u} no tiene mail cargado: no puede entrar con Google")

    print("\n2. Cada uno carga una tarea y la marca")
    mias: dict[str, int] = {}
    for u, tok in tokens.items():
        st, t = pedir("POST", "/api/daily/tareas", tok,
                      {"semana": lunes, "texto": f"{MARCA} de {u}", "tipo": "velocidad", "dia": 0})
        chequear(st == 200, f"{u} agrega su tarea")
        if st == 200:
            mias[u] = t["id"]
            st, _ = pedir("PUT", "/api/daily/dia", tok,
                          {"fecha": lunes, "parcial": True, "marcas": [{"tarea_id": t["id"], "estado": "hecha"}]})
            chequear(st == 200, f"{u} la marca hecha")

    print("\n3. Cada uno ve solo lo suyo")
    for u, tok in tokens.items():
        st, s = pedir("GET", f"/api/daily/semana?semana={lunes}", tok)
        prueba = [t["texto"] for t in s.get("tareas", []) if t["texto"].startswith(MARCA)]
        chequear(prueba == [f"{MARCA} de {u}"], f"{u} ve {prueba}")

    print("\n4. Nadie toca lo de otro")
    nombres = list(mias)
    for i, u in enumerate(nombres):
        otro = nombres[(i + 1) % len(nombres)]
        tid, tok = mias[otro], tokens[u]
        st, _ = pedir("PUT", "/api/daily/dia", tok, {"fecha": lunes, "parcial": True,
                                                     "marcas": [{"tarea_id": tid, "estado": "no"}]})
        chequear(st == 400, f"{u} no puede marcar la de {otro}")
        st, _ = pedir("PATCH", f"/api/daily/tareas/{tid}", tok, {"texto": "pisada"})
        chequear(st == 404, f"{u} no puede editar la de {otro}")
        st, _ = pedir("DELETE", f"/api/daily/tareas/{tid}", tok)
        chequear(st == 404, f"{u} no puede borrar la de {otro}")
    for u, tid in mias.items():
        st, s = pedir("GET", f"/api/daily/semana?semana={lunes}", tokens[u])
        t = next((x for x in s.get("tareas", []) if x["id"] == tid), {})
        chequear(t.get("texto") == f"{MARCA} de {u}" and (t.get("marcas", {}).get(lunes) or {}).get("estado") == "hecha",
                 f"la de {u} sigue intacta")

    print("\n5. Limpieza")
    borradas = limpiar()
    chequear(borradas == len(mias), f"se borraron {borradas} tareas de prueba con sus marcas")
    chequear(contar(semana) == antes, "nadie perdió ni ganó tareas reales")
    with db_session:
        chequear(CierreDaily.select().count() == cierres_antes, "no se cerró ninguna daily")

    print(f"\n{'TODO OK' if not errores else f'FALLARON {len(errores)}:'}")
    for e in errores:
        print(f"  - {e}")
    sys.exit(1 if errores else 0)


if __name__ == "__main__":
    try:
        main()
    finally:
        try:
            limpiar()  # pase lo que pase, no queda nada de prueba
        except Exception:  # noqa: BLE001
            pass
