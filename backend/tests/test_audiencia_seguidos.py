"""Analizar la audiencia de un reel es manual y permanente: se activa una vez y la corrida de
cada dos horas sigue ese reel para siempre, de cualquier fecha, releyéndolo solo si sumó
comentarios. Sin Instagram real."""

import json

import pytest
from pony.orm import db_session

from src.db import db, init_db
from src.services import audiencia_services as a


@pytest.fixture()
def base(monkeypatch):
    if db.provider is None:
        init_db()
    from src.models import AjusteAudiencia

    def limpiar():
        with db_session:
            for x in list(AjusteAudiencia.select()):
                if x.clave.startswith("seguir:"):
                    x.delete()
    limpiar()
    monkeypatch.setattr(a, "_credenciales", lambda: ("tok", "uid"))
    monkeypatch.setattr(a, "_cuenta_propia", lambda t, u: "juanxcarrizo")
    leidos = []
    monkeypatch.setattr(a, "_comentarios_de_reel", lambda t, p, m: leidos.append(m["id"]) or (2, 0))
    yield leidos
    limpiar()


def test_sin_reels_seguidos_no_lee_nada(base, monkeypatch):
    monkeypatch.setattr(a, "_pedir", lambda *x, **k: pytest.fail("no debería pedir nada a Instagram"))
    assert a.sincronizar_comentarios() == {"reels": 0, "leidos": 0, "nuevos": 0, "sinUsuario": 0}


def test_un_reel_seguido_se_relee_solo_si_sumo_comentarios(base, monkeypatch):
    conteo = {"111": 23, "222": 40}
    monkeypatch.setattr(a, "_pedir", lambda t, path, **k: {i: {"id": i, "comments_count": conteo[i], "permalink": f"https://x/{i}"}
                                                           for i in k["ids"].split(",")})
    a.seguir_reel("111", por="franco")                    # de octubre: lo activó Franco
    a.seguir_reel("222", por="franco", visto=40, atados=True)   # ya leído con 40, después del arreglo
    r = a.sincronizar_comentarios()
    assert r["reels"] == 2 and r["leidos"] == 1 and base == ["111"]
    assert a.reels_seguidos()["111"]["visto"] == 23 and a.reels_seguidos()["111"]["por"] == "franco"
    # En diciembre alguien comenta el reel de octubre: entra.
    conteo["111"] = 24
    assert a.sincronizar_comentarios()["leidos"] == 1 and base == ["111", "111"]
    # Sin comentarios nuevos, no se relee.
    assert a.sincronizar_comentarios()["leidos"] == 0


def test_activar_dos_veces_no_pisa_quien_ni_cuando(base):
    a.seguir_reel("333", por="franco")
    antes = a.reels_seguidos()["333"]
    a.seguir_reel("333", por="mauri")
    assert a.reels_seguidos()["333"]["por"] == "franco" and a.reels_seguidos()["333"]["desde"] == antes["desde"]


def test_un_reel_leido_antes_de_anotar_a_los_leads_en_cada_reel_se_relee_una_vez(base, monkeypatch):
    # «como alterar tu realidad»: 170 comentarios leídos con el código viejo, que salteaba a los
    # que ya eran lead. Sin comentarios nuevos igual se relee una vez para anotarlos; después no.
    monkeypatch.setattr(a, "_pedir", lambda t, path, **k: {i: {"id": i, "comments_count": 170, "permalink": "x"}
                                                           for i in k["ids"].split(",")})
    a.seguir_reel("444", por="franco", visto=170)
    assert a.sincronizar_comentarios()["leidos"] == 1 and base == ["444"]
    assert a.reels_seguidos()["444"]["atados"] is True
    assert a.sincronizar_comentarios()["leidos"] == 0
