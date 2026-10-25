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

# La mayoría de estas reglas son de las tareas fijas del rol, apagadas mientras la Daily es
# libre: se prueban prendidas para que sigan andando el día que vuelvan.
d.ROL_EN_LA_DAILY = True

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
    assert "Pasada de Discord" in textos
    assert "Envío de conclusiones de ventas al área de marketing" in textos


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


def test_un_dia_viejo_guardado_despues_cuenta_como_guardado():
    s = d.ver_semana("maite", LUNES)
    d.guardar_dia("maite", LUNES, _marcar_todo(s, LUNES))
    b = d.backbone(LUNES)
    maite = next(p for p in b["personas"] if p["username"] == "maite")
    assert maite["dias"][0]["estado"] == "ok"  # ya no existe "cargada tarde"


def test_backbone_marca_la_entrega_cortada(monkeypatch):
    viernes = date(2026, 10, 23)
    monkeypatch.setattr(d, "hoy", lambda: viernes)
    s = d.ver_semana("cris", LUNES)
    marcas = _marcar_todo(s, viernes)
    reporte = next(t for t in s["tareas"] if t["texto"].startswith("Envío del reporte semanal de setting a Lucas"))
    for m in marcas:
        if m["tarea_id"] == reporte["id"]:
            m["estado"], m["motivo"] = "no", "Día de muchas agendas"
    d.guardar_dia("cris", viernes, marcas)
    b = d.backbone(LUNES)
    e = next(e for e in b["entregas"] if e["id"] == reporte["id"])
    assert e["de"] == "cris" and e["a"] == "lucas"
    assert e["estado"] == "alert"  # el viernes no la hizo


def test_un_dia_que_no_llego_no_cuenta_como_daily():
    """Se puede adelantar todo el viernes, pero la daily del viernes se guarda el viernes."""
    s = d.ver_semana("ale", LUNES)
    d.guardar_dia("ale", date(2026, 10, 23), _marcar_todo(s, date(2026, 10, 23)))
    with db_session:
        assert d.CierreDaily.get(usuario="ale", fecha=date(2026, 10, 23)) is None


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
    d.agregar_tarea("ale", LUNES, "Abierta de prueba", "velocidad", None)
    s = d.ver_semana("ale", LUNES)
    abierta = next(t for t in s["tareas"] if t["frecuencia"] == "semanal" and t["dia"] is None)
    marcas = _marcar_todo(s, JUEVES) + [{"tarea_id": abierta["id"], "estado": "hecha", "motivo": None}]
    d.guardar_dia("ale", JUEVES, marcas)
    ale = next(p for p in d.backbone(LUNES)["personas"] if p["username"] == "ale")
    assert not any(f["texto"] == abierta["texto"] for f in ale["faltas"])


# ------------------------------------------------------------------ la vista Theo
# Mismo módulo: comparte la base en memoria.

from src.controllers.theo_controller import router as theo_router  # noqa: E402
from src.services import fathom_services, theo_services as th  # noqa: E402

_app.include_router(theo_router, prefix="/api/theo")
GRUPO_EQUIPO = "120363000000000000@g.us"


@pytest.fixture
def theo_listo(monkeypatch):
    th.ensure_envios()
    monkeypatch.setattr(webhooks_controller, "AGENT_KEY", "clave-test")
    th.actualizar_envio("daily", {"grupo_jid": GRUPO_EQUIPO}, "franco")


def _a_las(monkeypatch, hora, minuto=0):
    monkeypatch.setattr(d, "ahora", lambda: datetime(2026, 10, 22, hora, minuto))


def test_la_daily_de_hoy_espera_a_las_23(theo_listo, monkeypatch):
    _a_las(monkeypatch, 21)
    p = th.listar("pendientes")["mensajes"]
    daily = next(m for m in p if m["envio"] == "daily")
    assert daily["sale_at"] == "2026-10-22T23:30" and daily["se_arma_al_salir"]
    assert daily["texto"].startswith("Daily completada · jueves 22/10")
    assert not [m for m in th.cola() if m["envio"] == "daily"]  # todavía no


def test_a_las_2330_sale_con_la_lista_de_ese_momento(theo_listo, monkeypatch):
    _a_las(monkeypatch, 23, 31)
    c = [m for m in th.cola() if m["envio"] == "daily"]
    assert len(c) == 1 and c[0]["jid"] == GRUPO_EQUIPO and "Nick ✅" in c[0]["texto"]
    th.resultado(c[0]["id"], True, c[0]["texto"], None)
    assert not [m for m in th.cola() if m["envio"] == "daily"]
    enviada = next(m for m in th.listar("enviados")["mensajes"] if m["envio"] == "daily")
    assert enviada["estado"] == "enviado"
    with pytest.raises(HTTPException):
        th.editar(enviada["id"], "otro texto", "franco")  # ya salió


def test_sin_grupo_no_sale(monkeypatch):
    th.ensure_envios()
    from src.models import TheoMensaje
    with db_session:
        for m in TheoMensaje.select():
            m.delete()
    th.actualizar_envio("daily", {"grupo_jid": ""}, "franco")
    _a_las(monkeypatch, 23, 35)
    assert th.cola() == []
    assert next(m for m in th.listar("pendientes")["mensajes"] if m["envio"] == "daily")["sin_grupo"]


def test_editar_frenar_y_volver(theo_listo, monkeypatch):
    _a_las(monkeypatch, 23, 40)
    m = next(x for x in th.listar("pendientes")["mensajes"] if x["envio"] == "daily")
    th.editar(m["id"], "Hoy no hay daily: feriado", "franco")
    c = [x for x in th.cola() if x["envio"] == "daily"]
    assert c[0]["texto"] == "Hoy no hay daily: feriado"  # lo editado queda fijo
    th.frenar(m["id"], "franco")
    assert not [x for x in th.cola() if x["envio"] == "daily"]
    th.volver_a_la_cola(m["id"])
    assert [x for x in th.cola() if x["envio"] == "daily"]


def test_si_falla_se_reintenta_y_despues_se_vence(theo_listo, monkeypatch):
    _a_las(monkeypatch, 23, 45)
    c = next(x for x in th.cola() if x["envio"] == "daily")
    th.resultado(c["id"], False, None, "openclaw devolvió 1")
    assert [x for x in th.cola() if x["id"] == c["id"]]  # vuelve a intentar
    _a_las(monkeypatch, 23, 59)
    monkeypatch.setattr(d, "ahora", lambda: datetime(2026, 10, 23, 1, 0))
    assert not [x for x in th.cola() if x["id"] == c["id"]]  # la de ayer ya no sale


def test_plantilla_sin_lista_no_se_guarda(theo_listo):
    with pytest.raises(HTTPException):
        th.actualizar_envio("daily", {"plantilla": "Hola equipo"}, "franco")
    with pytest.raises(HTTPException):
        th.actualizar_envio("daily", {"grupo_jid": "ventas"}, "franco")


def test_las_llamadas_se_editan_y_frenan_en_su_propia_cola(theo_listo):
    from src.models import ReunionCrm
    with db_session:
        ReunionCrm(evento_id="ev-1", prospecto="Martín", reporte_mensaje="📞 Martín · SEÑA",
                   reporte_at=datetime(2026, 10, 22, 16, 40))
    assert [r["eventoId"] for r in fathom_services.pendientes()] == ["ev-1"]
    th.editar("ll-ev-1", "📞 Martín · SEÑA (USD 500)", "franco")
    assert fathom_services.pendientes()[0]["mensaje"] == "📞 Martín · SEÑA (USD 500)"
    th.frenar("ll-ev-1", "franco")
    assert fathom_services.pendientes() == []  # avisar-llamadas.py ya no lo manda
    th.volver_a_la_cola("ll-ev-1")
    th.actualizar_envio("llamadas", {"activo": False}, "franco")
    assert fathom_services.pendientes() == []  # apagado el envío, no sale nada
    th.actualizar_envio("llamadas", {"activo": True}, "franco")
    fathom_services.marcar_enviados(["ev-1"])
    with pytest.raises(HTTPException):
        th.editar("ll-ev-1", "x", "franco")


def test_la_vista_theo_es_de_sistemas_y_operaciones(theo_listo):
    assert api.get("/api/theo/mensajes", headers=_h("juan")).status_code == 403  # founder
    assert api.get("/api/theo/mensajes", headers=_h("cris")).status_code == 403
    assert api.get("/api/theo/mensajes?vista=enviados", headers=_h("franco")).status_code == 200
    assert api.get("/api/theo/cola").status_code == 401
    assert api.get("/api/theo/cola", headers={"X-Agent-Key": "clave-test"}).status_code == 200


def test_otro_script_registra_lo_que_mando(theo_listo):
    r = api.post("/api/theo/registro", headers={"X-Agent-Key": "clave-test"},
                 json={"envio": "landing", "texto": "⚠️ La landing tiene 38 visitas y 0 registros", "ok": True})
    assert r.status_code == 200
    env = th.listar("enviados", envio="landing")["mensajes"]
    assert env and env[0]["texto"].startswith("⚠️")
    assert not [x for x in th.cola() if x["envio"] == "landing"]  # lo registrado no se reenvía


def test_antes_del_inicio_no_hay_rojos(monkeypatch):
    """La semana del 12/10 existió antes que la daily: no se cuenta ni se pinta de rojo."""
    monkeypatch.setattr(d, "hoy", lambda: date(2026, 10, 18))  # domingo
    b = d.backbone(date(2026, 10, 12))
    assert all(p.get("pct") is None for p in b["personas"])
    assert all(not p.get("faltas") for p in b["personas"])
    assert all(e["estado"] == "off" for e in b["entregas"])


def test_el_domingo_backbone_abre_la_semana_que_viene(monkeypatch):
    monkeypatch.setattr(d, "hoy", lambda: date(2026, 10, 18))
    assert d.backbone(None)["semana"] == "2026-10-19"


def test_el_detalle_trae_la_semana_entera():
    lucas = next(p for p in d.backbone(LUNES)["personas"] if p["username"] == "lucas")
    assert any(t["texto"] == "Pasada de Discord" for t in lucas["tareas"])


def test_se_adelanta_una_tarea_de_un_dia_que_no_llego():
    """La tarea del viernes hecha el jueves: se marca ya y el viernes aparece hecha."""
    viernes = date(2026, 10, 23)
    s = d.ver_semana("lucas", LUNES)
    reporte = next(t for t in s["tareas"] if t["texto"] == "Envío del reporte semanal de ventas a Juan")
    r = d.guardar_dia("lucas", viernes, [{"tarea_id": reporte["id"], "estado": "hecha", "motivo": None}])
    t = next(x for x in r["tareas"] if x["id"] == reporte["id"])
    assert t["marcas"]["2026-10-23"]["estado"] == "hecha"
    assert r["dias"][4]["guardado_at"] is None  # no cuenta como la daily del viernes
    with pytest.raises(HTTPException):
        d.guardar_dia("lucas", viernes, [{"tarea_id": reporte["id"], "estado": "no", "motivo": "x"}])
    with pytest.raises(HTTPException):
        d.guardar_dia("lucas", date(2026, 11, 6), [])  # más allá de la semana que viene


def test_una_tarea_propia_de_un_dia_se_marca_ese_dia():
    t = d.agregar_tarea("nick", LUNES, "Llamar a los no-shows del martes", "velocidad", dia=2)
    assert t["dia"] == 2
    s = d.ver_semana("nick", LUNES)
    # El miércoles hay que marcarla para guardar la daily; los otros días no aparece.
    miercoles = date(2026, 10, 21)
    with pytest.raises(HTTPException):
        d.guardar_dia("nick", miercoles, [m for m in _marcar_todo(s, miercoles) if m["tarea_id"] != t["id"]])
    assert t["id"] not in [m["tarea_id"] for m in _marcar_todo(s, date(2026, 10, 20))]
    with pytest.raises(HTTPException):
        d.agregar_tarea("nick", LUNES, "x", "velocidad", dia=5)


# ------------------------------------------------------------------ chats de reels (con base)

def test_cada_persona_que_comento_la_palabra_es_un_chat_una_vez():
    from src.services import chats_reels_services as cr

    comentarios = [
        {"username": "ana", "text": "FORMULARIO", "timestamp": "2026-10-08T15:00:00+0000"},
        {"username": "ana", "text": "formulario!!", "timestamp": "2026-10-08T15:05:00+0000"},
        {"username": "beto", "text": "formulario 🔥", "timestamp": "2026-11-02T10:00:00+0000"},
        {"username": "caro", "text": "genio", "timestamp": "2026-10-08T16:00:00+0000"},
        {"username": "atv", "text": "te lo mandé por DM", "timestamp": "2026-10-08T16:01:00+0000"},
    ]
    assert cr.guardar("reel-1", "formulario", comentarios, propia="atv") == 2
    assert cr.guardar("reel-1", "formulario", comentarios, propia="atv") == 0  # no duplica
    assert cr.por_reel()["reel-1"] == {"chats": 2, "palabra": "formulario"}
    # Cada chat cae en el mes de su comentario: ana en octubre, beto en noviembre.
    octubre = cr.del_periodo(datetime(2026, 10, 1), datetime(2026, 11, 1))
    assert [x[0] for x in octubre] == ["reel-1"]


def test_marcar_un_reel_sin_cta_borra_sus_chats_y_manda(monkeypatch):
    from src.models import PublicacionIg
    from src.services import chats_reels_services as cr

    monkeypatch.setattr(cr, "sincronizar_reel", lambda reel_id, caption=None: {})  # sin red
    with db_session:
        PublicacionIg(ig_id="reel-cta", tipo="reel", publicado_at=datetime(2026, 10, 8), caption="un reel")
    cr.guardar("reel-cta", "papa", [{"username": "x", "text": "papa", "timestamp": "2026-10-08T10:00:00+0000"}], "atv")
    assert cr.estado()["reel-cta"]["esCta"] is True and cr.estado()["reel-cta"]["origen"] == "auto"

    r = cr.corregir("reel-cta", False, None, "Franco")
    assert r == {"origen": "manual", "esCta": False, "por": "Franco", "palabra": None, "chats": 0}
    assert "reel-cta" not in cr.por_reel()  # sus chats ya no suman

    cr.corregir("reel-cta", None, None, "Franco")  # vuelve a decidir Ops
    assert "reel-cta" not in cr.estado() or cr.estado()["reel-cta"]["origen"] == "auto"


def test_la_grilla_de_theo_pinta_lo_que_salio(theo_listo, monkeypatch):
    _a_las(monkeypatch, 23, 50)
    th.listar("pendientes")  # deja la daily del jueves en la cola si no estaba
    from src.models import TheoMensaje
    with db_session:  # los tests de arriba la dejaron en otro estado: acá salió
        m = TheoMensaje.get(clave="daily:2026-10-22")
        m.estado, m.enviado_at, m.expira_at = "enviado", datetime(2026, 10, 22, 23, 30), None
    g = th.semana(JUEVES)
    assert g["desde"] == "2026-10-18"  # arranca el domingo
    atv = next(f for f in g["filas"] if f["grupo"] == "ATV 500K")
    jueves = atv["dias"][4]["items"]
    assert dict((x["clave"], x["estado"]) for x in jueves)["daily"] == "enviado"
    assert [x["clave"] for x in jueves] == ["daily_aviso", "daily"]
    assert atv["dias"][5]["items"][0]["estado"] in ("programado", "pendiente")  # el viernes todavía no salió
    assert atv["dias"][0]["items"][0]["estado"] == "sin_registro"  # el domingo lo manda Theo solo
    health = next(f for f in g["filas"] if f["grupo"] == "Health")
    assert [x["clave"] for x in health["dias"][6]["items"]] == ["caja_manana", "caja"]
    assert health["dias"][6]["items"][1]["hora"] == "22:56" and "CIERRE DE CAJA" in health["dias"][6]["items"][1]["formato"]


def test_resumenes_esperados_segun_las_llamadas_del_dia(theo_listo, monkeypatch):
    """3 llamadas de Nick el miércoles, una no show: se esperan 2 resúmenes."""
    from src.models import ReunionCrm

    with db_session:
        ReunionCrm(evento_id="m1", prospecto="Ana", es_venta=True, inicio_at=datetime(2026, 10, 21, 10, 0),
                   reporte_mensaje="📞 Ana", reporte_enviado_at=datetime(2026, 10, 21, 10, 50))
        ReunionCrm(evento_id="m2", prospecto="Beto", es_venta=True, inicio_at=datetime(2026, 10, 21, 15, 0))
        ReunionCrm(evento_id="m3", prospecto="Caro", es_venta=True, inicio_at=datetime(2026, 10, 21, 17, 0),
                   resultado="no show")
        ReunionCrm(evento_id="v1", prospecto="Dani", es_venta=True, inicio_at=datetime(2026, 10, 23, 11, 0))
    _a_las(monkeypatch, 23, 50)  # jueves
    sales = next(f for f in th.semana(JUEVES)["filas"] if f["grupo"] == "Sales")
    miercoles = next(x for x in sales["dias"][3]["items"] if x["clave"] == "llamadas")
    assert (miercoles["esperadas"], miercoles["enviados"], miercoles["estado"]) == (2, 1, "no_salio")
    assert [x["quien"] for x in miercoles["llamadas"]] == ["Ana", "Beto"]
    viernes = next(x for x in sales["dias"][5]["items"] if x["clave"] == "llamadas")
    assert viernes["estado"] == "programado" and viernes["detalle"] == "1 llamada agendada"


def test_mandar_un_mensaje_a_mano_a_un_grupo(theo_listo, monkeypatch):
    _a_las(monkeypatch, 18, 0)
    with pytest.raises(HTTPException):
        th.guardar_jid_grupo("ATV 500K", "atv500k", "franco")  # no es un ID de grupo
    th.guardar_jid_grupo("ATV 500K", "120363999@g.us", "franco")
    m = th.enviar_ahora("recordatorio_semana", "Mañana preparen sus documentos 💪", "franco")
    assert m["estado"] == "pendiente" and m["grupo"] == "ATV 500K"
    salen = [x for x in th.cola() if x["texto"].startswith("Mañana preparen")]
    assert salen and salen[0]["jid"] == "120363999@g.us"


def test_etiquetar_al_equipo(theo_listo, monkeypatch):
    with pytest.raises(HTTPException):
        d.actualizar_persona("nick", {"whatsapp": "123"})  # sin código de país
    d.actualizar_persona("nick", {"whatsapp": "+54 9 351 111-2222"})
    d.actualizar_persona("lucas", {"whatsapp": "5493513334444"})
    assert next(p for p in d.listar_equipo() if p["username"] == "nick")["whatsapp"] == "5493511112222"

    # A mano: el texto y al final una mención por cada uno; no repite al que ya nombraste.
    _a_las(monkeypatch, 18, 5)
    m = th.enviar_ahora("recordatorio_semana", "Preparen sus documentos @5493513334444", "franco", etiquetar=True)
    assert m["etiquetar"] and m["vista"].startswith("Preparen sus documentos @Lucas")
    sale = next(x for x in th.cola() if x["texto"].startswith("Preparen sus"))
    assert sale["texto"] == "Preparen sus documentos @5493513334444\n\n@5493511112222"

    # La daily: cada uno en la lista va como mención en vez de su nombre.
    th.actualizar_envio("daily", {"etiquetar": True}, "franco")
    monkeypatch.setattr(d, "ahora", lambda: datetime(2026, 10, 23, 23, 31))  # la del jueves ya salió
    daily = next(x for x in th.cola() if x["envio"] == "daily")
    assert "@5493511112222 " in daily["texto"] and "Nick " not in daily["texto"]
    assert daily["texto"].count("@5493513334444") == 1
    th.actualizar_envio("daily", {"etiquetar": False}, "franco")
    d.actualizar_persona("nick", {"whatsapp": ""})
    d.actualizar_persona("lucas", {"whatsapp": None})


def test_vaciar_la_cola_frena_todo_sin_borrar(theo_listo, monkeypatch):
    _a_las(monkeypatch, 18, 10)
    th.guardar_jid_grupo("ATV 500K", "120363999@g.us", "franco")
    th.enviar_ahora("recordatorio_semana", "uno que no tiene que salir", "franco")
    r = th.vaciar_cola("franco")
    assert r["mensajes"] >= 1
    assert th.cola() == [] and th.listar("pendientes")["mensajes"] == []
    frenado = next(m for m in th.listar("enviados")["mensajes"] if m["texto"] == "uno que no tiene que salir")
    assert frenado["estado"] == "frenado" and frenado["frenado_por"] == "franco"


def test_empezar_de_cero_borra_y_cuenta_desde_ahora(theo_listo, monkeypatch):
    _a_las(monkeypatch, 19, 0)
    th.guardar_jid_grupo("ATV 500K", "120363999@g.us", "franco")
    th.enviar_ahora("recordatorio_semana", "viejo", "franco")
    r = th.empezar_de_cero("franco")
    assert r["borrados"] >= 1
    # Solo queda la daily de esta noche, que se programa sola.
    assert sorted(m["envio"] for m in th.listar("pendientes")["mensajes"]) == ["daily", "daily_aviso"]
    assert th.listar("enviados")["mensajes"] == []
    from src.models import TheoAjuste
    with db_session:
        TheoAjuste.get(clave="desde").delete()   # el resto de los tests cuenta todo


def test_lo_que_registra_una_tarea_de_openclaw_pinta_la_celda(theo_listo, monkeypatch):
    th.ensure_envios()
    monkeypatch.setattr(d, "ahora", lambda: datetime(2026, 10, 21, 22, 57))
    th.registrar("caja", "@5493804206496 - *CIERRE DE CAJA — 21/10/2026*", True, None)
    health = next(f for f in th.semana(date(2026, 10, 21))["filas"] if f["grupo"] == "Health")
    caja = next(x for x in health["dias"][3]["items"] if x["clave"] == "caja")
    assert caja["estado"] == "enviado" and caja["mensajeId"]
    assert th.mensaje(caja["mensajeId"])["texto"].startswith("@5493804206496 - *CIERRE")


def test_daily_libre_saca_las_del_rol_sin_marcas_y_deja_borrar(monkeypatch):
    monkeypatch.setattr(d, "ROL_EN_LA_DAILY", False)
    monkeypatch.setattr(d, "hoy", lambda: date(2026, 10, 26))
    semana = d.ver_semana("nick", date(2026, 10, 26))
    assert not [t for t in semana["tareas"] if t["origen"] == "rol"]
    t = d.agregar_tarea("nick", date(2026, 10, 26), "Llamar a los leads de ayer", "velocidad", 0)
    assert t["texto"] == "Llamar a los leads de ayer"


def test_sistemas_ops_edita_el_equipo_y_marketing_no_ve_webinars():
    from src.controllers.webinars_controller import ROLES_WEBINAR
    from src.models import Usuario
    with db_session:
        if Usuario.get(username="ops-test") is None:
            Usuario(username="ops-test", password_hash="x", nombre="Ops", rol="operaciones")
    r = api.patch("/api/daily/equipo/janner", headers=_h("ops-test"), json={"cargo": "Head de Contenido"})
    assert r.status_code == 200
    assert api.patch("/api/daily/equipo/janner", headers=_h("juan"), json={"cargo": "x"}).status_code == 403
    assert "marketing" not in ROLES_WEBINAR


def test_un_equipo_puede_tener_dos_cabezas():
    d.ensure_equipo()
    equipo = {p["username"]: p for p in d.listar_equipo()}
    assert equipo["ale"]["jefe"] == "juampi" and equipo["mauri"]["jefe"] == "juampi"
    assert equipo["janner"]["jefe"] == "maite,ignacio"
    r = api.patch("/api/daily/equipo/janner", headers=_h("franco"), json={"jefe": ["ignacio", "maite"]})
    assert r.status_code == 200 and r.json()["jefe"] == "ignacio,maite"
    assert api.patch("/api/daily/equipo/janner", headers=_h("franco"), json={"jefe": ["nadie"]}).status_code == 400
    d.actualizar_persona("janner", {"jefe": "maite,ignacio"})


def test_los_motivos_de_backbone_los_ve_solo_juan():
    datos = {"personas": [{"faltas": [{"fecha": "2026-10-20", "texto": "x", "motivo": "estaba enfermo", "sin_daily": False}],
                           "no_aplica": [], "tareas": [{"marcas": {"2026-10-20": {"estado": "no", "motivo": "estaba enfermo"}}}]}],
             "entregas": [{"nota": "No se hizo: estaba enfermo"}], "motivos": True}
    out = d.sin_motivos(datos)
    assert out["personas"][0]["faltas"][0]["motivo"] is None
    assert out["personas"][0]["tareas"][0]["marcas"]["2026-10-20"]["motivo"] is None
    assert out["entregas"][0]["nota"] == "No se hizo" and out["motivos"] is False
    assert api.get("/api/daily/backbone", headers=_h("juan")).json()["motivos"] is True
    assert api.get("/api/daily/backbone", headers=_h("franco")).json()["motivos"] is False


def test_guardado_parcial_no_cierra_el_dia(monkeypatch):
    from src.models import CierreDaily
    monkeypatch.setattr(d, "hoy", lambda: date(2026, 10, 21))
    t = d.agregar_tarea("cris", LUNES, "Tarea parcial de prueba", "velocidad", 2)
    # Marcar a medias y un "no la hice" todavía sin motivo: se guarda igual.
    s = d.guardar_dia("cris", date(2026, 10, 21), [{"tarea_id": t["id"], "estado": "no", "motivo": None}], parcial=True)
    marca = next(x for x in s["tareas"] if x["id"] == t["id"])["marcas"]["2026-10-21"]
    assert marca["estado"] == "no"
    with db_session:
        assert CierreDaily.get(usuario="cris", fecha=date(2026, 10, 21)) is None  # no cuenta como guardada
    # Destildar también se guarda.
    s = d.guardar_dia("cris", date(2026, 10, 21), [{"tarea_id": t["id"], "estado": None}], parcial=True)
    assert "2026-10-21" not in next(x for x in s["tareas"] if x["id"] == t["id"])["marcas"]
    d.borrar_tarea("cris", t["id"])


def test_a_las_2230_sale_el_aviso_con_quien_falta(theo_listo, monkeypatch):
    monkeypatch.setattr(d, "ahora", lambda: datetime(2026, 10, 23, 22, 31))
    sale = [m for m in th.cola() if m["envio"] == "daily_aviso"]
    assert len(sale) == 1 and sale[0]["jid"].endswith("@g.us")
    assert sale[0]["texto"].startswith("Recordatorio · viernes 23/10") and "❌" in sale[0]["texto"]
    assert not [m for m in th.cola() if m["envio"] == "daily"]  # el checkeo sigue esperando a las 23:30


def test_cada_uno_carga_su_daily_y_no_se_mezcla(monkeypatch):
    """Todos cargan a la vez: cada uno ve, marca y borra solo lo suyo."""
    monkeypatch.setattr(d, "hoy", lambda: date(2026, 10, 27))
    semana, martes = "2026-10-26", "2026-10-27"
    gente = ["franco", "lucas", "cris", "nick", "maite", "juampi", "ale", "mauri"]
    mias = {}
    for u in gente:
        r = api.post("/api/daily/tareas", headers=_h(u), json={"semana": semana, "texto": f"prueba-aislamiento {u}",
                                                               "tipo": "velocidad", "dia": 1})
        assert r.status_code == 200, r.text
        mias[u] = r.json()["id"]
    for u in gente:
        s = api.get(f"/api/daily/semana?semana={semana}", headers=_h(u)).json()
        textos = [t["texto"] for t in s["tareas"] if t["texto"].startswith("prueba-aislamiento")]
        assert textos == [f"prueba-aislamiento {u}"], (u, textos)
        r = api.put("/api/daily/dia", headers=_h(u), json={"fecha": martes, "parcial": True,
                                                            "marcas": [{"tarea_id": mias[u], "estado": "hecha"}]})
        assert r.status_code == 200
    # Nadie puede marcar, editar ni borrar la tarea de otro.
    otro = mias["nick"]
    r = api.put("/api/daily/dia", headers=_h("cris"), json={"fecha": martes, "parcial": True,
                                                             "marcas": [{"tarea_id": otro, "estado": "no"}]})
    assert r.status_code == 400
    assert api.patch(f"/api/daily/tareas/{otro}", headers=_h("cris"), json={"texto": "pisada"}).status_code == 404
    assert api.delete(f"/api/daily/tareas/{otro}", headers=_h("cris")).status_code == 404
    s = api.get(f"/api/daily/semana?semana={semana}", headers=_h("nick")).json()
    t = next(x for x in s["tareas"] if x["id"] == otro)
    assert t["texto"] == "prueba-aislamiento nick" and t["marcas"][martes]["estado"] == "hecha"
    for u in gente:
        assert api.delete(f"/api/daily/tareas/{mias[u]}", headers=_h(u)).status_code == 200


def test_la_version_nueva_de_roles_reemplaza_la_vieja_una_vez():
    from src.models import TareaRol, TheoAjuste
    with db_session:
        TareaRol(usuario="lucas", texto="Revisión del pipeline", frecuencia="diaria", orden=99)
        TheoAjuste.get(clave="version_roles").valor = "vieja"
    d.ensure_equipo()
    activas = [t["texto"] for t in d.tareas_rol("lucas")]
    assert activas == [t for _, _, t, _ in d.TAREAS_ROL["lucas"]]
    # Ya aplicada: lo que se edite a mano después no se vuelve a pisar.
    d.guardar_tareas_rol("lucas", [*d.tareas_rol("lucas"), {"texto": "Agregada a mano", "frecuencia": "diaria"}])
    d.ensure_equipo()
    assert "Agregada a mano" in [t["texto"] for t in d.tareas_rol("lucas")]


def test_la_nueva_redaccion_renombra_sin_perder_marcas(monkeypatch):
    from src.models import TareaRol, TareaSemana, TheoAjuste
    monkeypatch.setattr(d, "hoy", lambda: date(2026, 10, 27))
    vieja, nueva = "Sweep de Discord y aviso de las 9", "Pasada de Discord 9:00"
    with db_session:
        r = next(x for x in TareaRol.select(lambda x: x.usuario == "mauri" and x.activa) if x.texto == nueva)
        r.texto = vieja
        TheoAjuste.get(clave="version_roles").valor = "2026-10-25"
    s = d.ver_semana("mauri", date(2026, 10, 26))
    t = next(x for x in s["tareas"] if x["texto"] == vieja)
    d.guardar_dia("mauri", date(2026, 10, 27), [{"tarea_id": t["id"], "estado": "hecha"}], parcial=True)
    d.ensure_equipo()
    with db_session:
        ts = TareaSemana[t["id"]]
        assert ts.texto == nueva and not ts.borrada and ts.marcas.count() == 1
    assert nueva in [x["texto"] for x in d.tareas_rol("mauri")]


def test_una_version_que_solo_suma_una_tarea_la_agrega_sin_tocar_las_demas():
    from src.models import TareaRol, TheoAjuste
    nueva = "Reporte de las calls del día en el grupo de Sales"
    with db_session:
        for r in list(TareaRol.select(lambda r: r.usuario == "nick" and r.activa)):
            if r.texto == nueva:
                r.delete()
        ids_antes = {r.id for r in TareaRol.select(lambda r: r.usuario == "nick" and r.activa)}
        TheoAjuste.get(clave="version_roles").valor = "2026-10-25c"
    d.ensure_equipo()
    with db_session:
        activas = list(TareaRol.select(lambda r: r.usuario == "nick" and r.activa))
        assert ids_antes <= {r.id for r in activas}  # las de antes siguen siendo las mismas
        assert [r.texto for r in activas].count(nueva) == 1
