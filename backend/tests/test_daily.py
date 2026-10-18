"""
Tests de la daily.

Las reglas que se fijan acá son las que hacen que Theo y Backbone digan la verdad:
- las tareas del rol están siempre y no se borran;
- no se guarda un día con tareas sin marcar o sin motivo;
- guardar un día viejo después no lo vuelve "a tiempo";
- Theo cuenta a quien guardó, no a quien hizo todo.
"""

from datetime import date, datetime

import pytest
from fastapi import HTTPException
from pony.orm import db_session

import src.models  # noqa: F401 — registra las entidades
from src.db import db
from src.services import daily_services as d

JUEVES = date(2026, 10, 22)
LUNES = date(2026, 10, 19)


@pytest.fixture(scope="module", autouse=True)
def base():
    # Base en memoria: sin las migraciones de init_db, que suponen una base que ya existe.
    if db.provider is not None:
        # Otro test (audiencia, zoom) ya ató la base de la Mac con init_db: escribir acá
        # ensuciaría la base local. Estos tests se corren solos: pytest tests/test_daily.py
        pytest.skip("La base ya está atada a un archivo; correr test_daily.py solo.")
    db.bind(provider="sqlite", filename=":sharedmemory:")
    db.generate_mapping(create_tables=True)
    d.ensure_equipo()


@pytest.fixture(autouse=True)
def reloj(monkeypatch):
    monkeypatch.setattr(d, "hoy", lambda: JUEVES)
    monkeypatch.setattr(d, "ahora", lambda: datetime(2026, 10, 22, 21, 14))


def _marcar_todo(semana: dict, fecha: date, estado="hecha", motivo=None):
    dia = fecha.weekday()
    return [{"tarea_id": t["id"], "estado": estado, "motivo": motivo} for t in semana["tareas"]
            if t["frecuencia"] == "diaria" or (t["frecuencia"] == "semanal" and t["dia"] == dia)]


def test_la_semana_trae_las_tareas_del_rol():
    s = d.ver_semana("lucas", LUNES)
    textos = [t["texto"] for t in s["tareas"] if t["origen"] == "rol"]
    assert "Revisión del pipeline" in textos
    assert "Conclusión de ventas para marketing" in textos


def test_las_del_rol_no_se_borran_y_las_propias_si():
    s = d.ver_semana("lucas", LUNES)
    rol = next(t for t in s["tareas"] if t["origen"] == "rol")
    with pytest.raises(HTTPException) as e:
        d.borrar_tarea("lucas", rol["id"])
    assert e.value.status_code == 400
    propia = d.agregar_tarea("lucas", LUNES, "Guion para no-shows", "desplazamiento")
    d.borrar_tarea("lucas", propia["id"])
    assert propia["id"] not in [t["id"] for t in d.ver_semana("lucas", LUNES)["tareas"]]


def test_no_se_guarda_un_dia_a_medias():
    s = d.ver_semana("nick", LUNES)
    marcas = _marcar_todo(s, JUEVES)[:-1]
    with pytest.raises(HTTPException) as e:
        d.guardar_dia("nick", JUEVES, marcas)
    assert "Falta marcar" in e.value.detail


def test_no_la_hice_sin_motivo_no_pasa():
    s = d.ver_semana("nick", LUNES)
    with pytest.raises(HTTPException):
        d.guardar_dia("nick", JUEVES, _marcar_todo(s, JUEVES, estado="no"))
    d.guardar_dia("nick", JUEVES, _marcar_todo(s, JUEVES, estado="no", motivo="Sin tiempo entre llamadas"))


def test_theo_cuenta_quien_guardo_no_quien_hizo_todo():
    t = d.theo(JUEVES)
    nick = next(p for p in t["personas"] if p["nombre"] == "Nick")
    juampi = next(p for p in t["personas"] if p["nombre"] == "Juampi")
    assert nick["completada"] is True  # guardó, aunque no hizo nada
    assert juampi["completada"] is False
    assert "Nick ✅" in t["mensaje"] and "Juampi ❌" in t["mensaje"]
    assert all(p["nombre"] != "Juan" for p in t["personas"])


def test_un_dia_viejo_guardado_despues_queda_tarde():
    s = d.ver_semana("maite", LUNES)
    d.guardar_dia("maite", LUNES, _marcar_todo(s, LUNES))
    with db_session:
        c = d.CierreDaily.get(usuario="maite", fecha=LUNES)
        assert c.a_tiempo is False
    b = d.backbone(LUNES)
    maite = next(p for p in b["personas"] if p["username"] == "maite")
    assert maite["dias"][0]["estado"] == "tarde"


def test_backbone_marca_la_entrega_cortada():
    s = d.ver_semana("cris", LUNES)
    marcas = _marcar_todo(s, JUEVES)
    reporte = next(t for t in s["tareas"] if t["texto"].startswith("Reporte diario a Lucas"))
    for m in marcas:
        if m["tarea_id"] == reporte["id"]:
            m["estado"], m["motivo"] = "no", "Día de muchas agendas"
    d.guardar_dia("cris", JUEVES, marcas)
    b = d.backbone(LUNES)
    e = next(e for e in b["entregas"] if e["id"] == reporte["id"])
    assert e["de"] == "cris" and e["a"] == "lucas"
    assert e["estado"] == "alert"  # lunes a miércoles sin daily, jueves no la hizo


def test_un_dia_que_no_llego_no_se_guarda():
    s = d.ver_semana("ale", LUNES)
    with pytest.raises(HTTPException):
        d.guardar_dia("ale", date(2026, 10, 23), _marcar_todo(s, date(2026, 10, 23)))


def test_el_fin_de_semana_theo_no_manda():
    assert d.theo(date(2026, 10, 24))["habil"] is False


# ------------------------------------------------------------------ la API, con permisos
# Mismo módulo a propósito: Pony ata la base una sola vez por proceso.

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from src.controllers import webhooks_controller  # noqa: E402
from src.controllers.auth_controller import router as auth_router  # noqa: E402
from src.controllers.daily_controller import router as daily_router  # noqa: E402

_app = FastAPI()
_app.include_router(auth_router, prefix="/api/auth")
_app.include_router(daily_router, prefix="/api/daily")
api = TestClient(_app)


def _token(username):
    from src.models import Usuario
    from src.services.auth_services import _emitir_token
    with db_session:
        return _emitir_token(Usuario.get(username=username))["token"]


def _h(username):
    return {"Authorization": f"Bearer {_token(username)}"}


def test_sin_sesion_no_entra():
    assert api.get("/api/daily/semana").status_code == 401


def test_cada_uno_ve_su_semana():
    r = api.get(f"/api/daily/semana?semana={LUNES}", headers=_h("cris"))
    assert r.status_code == 200
    assert r.json()["persona"]["username"] == "cris"


def test_backbone_es_solo_de_direccion():
    assert api.get("/api/daily/backbone", headers=_h("cris")).status_code == 403
    assert api.get("/api/daily/backbone", headers=_h("juan")).status_code == 200  # founder
    assert api.get("/api/daily/backbone", headers=_h("franco")).status_code == 200


def test_solo_el_admin_edita_el_equipo():
    r = api.patch("/api/daily/equipo/janner", headers=_h("juan"), json={"cargo": "x"})
    assert r.status_code == 403
    r = api.patch("/api/daily/equipo/janner", headers=_h("franco"), json={"emails": ["janner@gmail.com"]})
    assert r.status_code == 200 and r.json()["emails"] == ["janner@gmail.com"]


def test_un_mail_no_puede_ser_de_dos():
    r = api.patch("/api/daily/equipo/janner", headers=_h("franco"), json={"emails": ["lucasruarte688@gmail.com"]})
    assert r.status_code == 409


def test_las_tareas_del_rol_nuevas_aparecen_en_la_semana():
    r = api.put("/api/daily/equipo/janner/rol", headers=_h("franco"), json=[
        {"texto": "Guiones de la semana", "frecuencia": "semanal", "dia": 1, "destinatario": "ignacio"}])
    assert r.status_code == 200
    s = api.get(f"/api/daily/semana?semana={LUNES}", headers=_h("janner")).json()
    assert any(t["texto"] == "Guiones de la semana" and t["origen"] == "rol" for t in s["tareas"])
    # Sacarla de la plantilla la saca de la semana (no tenía marcas).
    api.put("/api/daily/equipo/janner/rol", headers=_h("franco"), json=[])
    s = api.get(f"/api/daily/semana?semana={LUNES}", headers=_h("janner")).json()
    assert not any(t["texto"] == "Guiones de la semana" for t in s["tareas"])


def test_dia_de_semana_invalido_en_la_plantilla():
    r = api.put("/api/daily/equipo/janner/rol", headers=_h("franco"), json=[
        {"texto": "x", "frecuencia": "diaria", "dia": 2}])
    assert r.status_code == 400


def test_entrar_como_solo_admin_y_no_encadenado():
    assert api.post("/api/auth/entrar-como", headers=_h("juan"), json={"username": "cris"}).status_code == 403
    r = api.post("/api/auth/entrar-como", headers=_h("franco"), json={"username": "cris"})
    assert r.status_code == 200
    j = r.json()
    assert j["user"]["username"] == "cris" and j["user"]["por"] == "franco"
    otra = {"Authorization": f"Bearer {j['token']}"}
    assert api.get("/api/auth/me", headers=otra).json()["por"] == "franco"
    # Adentro de la cuenta de Cris no se puede saltar a otra.
    assert api.post("/api/auth/entrar-como", headers=otra, json={"username": "nick"}).status_code == 403


def test_google_sin_mail_cargado_o_token_falso(monkeypatch):
    from src.services import auth_services as a
    monkeypatch.setattr(a, "_verificar_google", lambda c: {"sub": "1", "email": "nadie@gmail.com", "foto": None})
    r = api.post("/api/auth/google", json={"credencial": "x"})
    assert r.status_code == 403 and "no está en el equipo" in r.json()["detail"]
    monkeypatch.setattr(a, "_verificar_google", lambda c: {"sub": "g-mauri", "email": "S_35@live.com".lower(), "foto": "f.jpg"})
    r = api.post("/api/auth/google", json={"credencial": "x"})
    assert r.status_code == 200 and r.json()["user"]["username"] == "mauri"
    # El segundo mail de Mauri entra a la misma cuenta; otra cuenta de Google con ese mail no.
    monkeypatch.setattr(a, "_verificar_google", lambda c: {"sub": "otro", "email": "mauriw35@gmail.com", "foto": None})
    assert api.post("/api/auth/google", json={"credencial": "x"}).status_code == 403


def test_google_sin_client_id_no_rompe(monkeypatch):
    monkeypatch.setattr("src.services.auth_services.google_client_id", lambda: "")
    r = api.post("/api/auth/google", json={"credencial": "x"})
    assert r.status_code == 503


def test_theo_pide_la_clave_de_agente(monkeypatch):
    monkeypatch.setattr(webhooks_controller, "AGENT_KEY", "clave-test")
    assert api.get("/api/daily/theo").status_code == 401
    r = api.get(f"/api/daily/theo?fecha={JUEVES}", headers={"X-Agent-Key": "clave-test"})
    assert r.status_code == 200 and r.json()["mensaje"].startswith("Daily completada · jueves 22/10")


def test_guardar_por_api_valida_motivo():
    s = api.get(f"/api/daily/semana?semana={LUNES}", headers=_h("juampi")).json()
    marcas = _marcar_todo(s, JUEVES, estado="no_aplica")
    r = api.put("/api/daily/dia", headers=_h("juampi"), json={"fecha": str(JUEVES), "marcas": marcas})
    assert r.status_code == 400
    for m in marcas:
        m["motivo"] = "Feriado de clases"
    r = api.put("/api/daily/dia", headers=_h("juampi"), json={"fecha": str(JUEVES), "marcas": marcas})
    assert r.status_code == 200
    assert next(d for d in r.json()["dias"] if d["fecha"] == str(JUEVES))["a_tiempo"] is True


def test_una_abierta_hecha_cuenta_una_vez():
    s = d.ver_semana("ale", LUNES)
    abierta = next(t for t in s["tareas"] if t["frecuencia"] == "semanal" and t["dia"] is None)
    marcas = _marcar_todo(s, JUEVES) + [{"tarea_id": abierta["id"], "estado": "hecha", "motivo": None}]
    d.guardar_dia("ale", JUEVES, marcas)
    ale = next(p for p in d.backbone(LUNES)["personas"] if p["username"] == "ale")
    assert not any(f["texto"] == abierta["texto"] for f in ale["faltas"])
