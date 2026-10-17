"""
Audiencia con historias: quién respondió una historia por mensaje directo pasa a ser un
lead, igual que quien comenta un reel. Sin Instagram real: la bandeja se simula.
"""

import json
from datetime import datetime, timedelta

import pytest
from pony.orm import db_session

from src.db import db, init_db
from src.services import audiencia_services as a


@pytest.fixture()
def base(monkeypatch):
    if db.provider is None:
        init_db()
    from src.models import AjusteAudiencia, LeadAudiencia, PublicacionIg

    ahora = datetime.utcnow()
    with db_session:
        for x in list(LeadAudiencia.select()):
            if x.ig_usuario.startswith("prueba_"):
                x.delete()
        for x in list(PublicacionIg.select()):
            if x.ig_id.startswith("hist_prueba"):
                x.delete()
        marca = AjusteAudiencia.get(clave="dm_leido_hasta")
        if marca:
            marca.delete()
        PublicacionIg(ig_id="hist_prueba_1", tipo="historia", publicado_at=ahora - timedelta(days=5),
                      permalink="https://instagram.com/stories/x/1", metricas=json.dumps({"replies": 9}))
    monkeypatch.setattr(a, "_credenciales", lambda: ("token", "uid"))
    monkeypatch.setattr(a, "_cuenta_propia", lambda token, uid: "atv")
    monkeypatch.setattr(a, "_pagina", lambda token: ("pagina", "token_pagina"))
    monkeypatch.setattr(a, "_guardar_historias_vivas", lambda token, uid: 0)
    yield ahora
    with db_session:
        for x in list(LeadAudiencia.select()):
            if x.ig_usuario.startswith("prueba_"):
                x.delete()
        for x in list(PublicacionIg.select()):
            if x.ig_id.startswith("hist_prueba"):
                x.delete()
        marca = AjusteAudiencia.get(clave="dm_leido_hasta")
        if marca:
            marca.delete()


def _mensaje(mid, usuario, historia, cuando, igsid="111"):
    return {"id": mid, "created_time": cuando.strftime("%Y-%m-%dT%H:%M:%S+0000"),
            "from": {"username": usuario, "id": igsid}, **({"story": {"reply_to": {"id": historia}}} if historia else {})}


def test_cada_persona_que_responde_una_historia_es_un_lead(base, monkeypatch):
    ahora = base
    bandeja = {"data": [
        {"updated_time": ahora.strftime("%Y-%m-%dT%H:%M:%S+0000"), "messages": {"data": [
            _mensaje("m1", "prueba_ana", "hist_prueba_1", ahora - timedelta(hours=1), "201"),
            _mensaje("m2", "prueba_ana", "hist_prueba_1", ahora - timedelta(hours=1)),   # la misma persona otra vez
            _mensaje("m3", "atv", "hist_prueba_1", ahora),                                # la cuenta propia
            _mensaje("m4", "prueba_beto", None, ahora),                                   # un mensaje común
            _mensaje("m5", "prueba_caro", "historia_de_otro", ahora),                     # historia que Ops no guardó
        ]}},
    ], "paging": {}}
    monkeypatch.setattr(a, "_pedir", lambda token, path, **p: bandeja)
    r = a.sincronizar_historias()
    assert r["nuevos"] == 1 and r["completo"]
    from src.models import LeadAudiencia

    with db_session:
        ana = [x for x in list(LeadAudiencia.select()) if x.ig_usuario == "prueba_ana"]
        assert len(ana) == 1 and ana[0].creado_por == "historia" and ana[0].media_id == "hist_prueba_1"
        assert ana[0].comentario is None  # el texto de un mensaje directo no se guarda
        assert json.loads(ana[0].perfil)["igsid"] == "201"
    # La segunda corrida no duplica.
    assert a.sincronizar_historias()["nuevos"] == 0

    listado = a.listar()
    sec = next(s for s in listado["historias"] if any(p["id"] == "hist_prueba_1" for p in s["piezas"]))
    assert sec["personas"] == 1 and sec["respuestas"] == 9 and sec["sin_analizar"] == 1
    lead = next(l for l in listado["leads"] if l["usuario"] == "prueba_ana")
    assert lead["fuente"] == "historia" and lead["secuencia"] == sec["id"] and "igsid" not in (lead["perfil"] or {})
    assert all(r["id"] != "hist_prueba_1" for r in listado["reels"])  # las historias no se mezclan con los reels


def test_pedir_menos_datos_reintenta_con_menos_conversaciones(base, monkeypatch):
    pedidos = []

    def pedir(token, path, **p):
        pedidos.append(p.get("limit"))
        if p.get("limit", 0) > 5:
            return {"_error": '{"error":{"code":1,"message":"Please reduce the amount of data"}}'}
        return {"data": [], "paging": {}}

    monkeypatch.setattr(a, "_pedir", pedir)
    assert a.sincronizar_historias()["completo"]
    assert pedidos[:2] == [10, 5]


def test_guarda_las_historias_vivas_que_faltan(base, monkeypatch):
    """Una respuesta a una historia recién subida (todavía sin guardar) igual se cruza."""
    from src.services import instagram_services

    monkeypatch.undo()
    monkeypatch.setattr(a, "_credenciales", lambda: ("token", "uid"))
    guardadas = []
    monkeypatch.setattr(instagram_services, "_insights", lambda token, mid, metricas: {"replies": 2})
    monkeypatch.setattr(instagram_services, "_guardar", lambda tipo, item, metricas: guardadas.append(item["id"]) or True)
    monkeypatch.setattr(a, "_pedir", lambda token, path, **p: {"data": [{"id": "hist_prueba_1", "timestamp": "x"}, {"id": "hist_prueba_nueva", "timestamp": "x"}]})
    assert a._guardar_historias_vivas("token", "uid") == 1 and guardadas == ["hist_prueba_nueva"]


def test_el_perfil_por_mensajes_trae_el_verificado(monkeypatch):
    monkeypatch.setattr(a, "_guardar_foto", lambda url, usuario: "/foto.jpg" if url else None)
    monkeypatch.setattr(a, "_pedir", lambda token, path, **p: {"name": "Ana", "profile_pic": "x", "follower_count": 5400,
                                                                  "is_verified_user": True, "is_user_follow_business": True})
    p = a.perfil_por_mensajes("t", "201", "prueba_ana")
    assert p == {"foto": "/foto.jpg", "nombre": "Ana", "seguidores": 5400, "verificado": True, "teSigue": True}
    monkeypatch.setattr(a, "_pedir", lambda token, path, **p: {"_error": '{"error":{"code":4,"message":"limit"}}'})
    with pytest.raises(a.LimiteInstagram):
        a.perfil_por_mensajes("t", "201", "prueba_ana")
