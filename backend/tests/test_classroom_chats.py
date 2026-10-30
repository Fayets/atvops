from datetime import datetime, timedelta, timezone

from src.services import classroom_chats_services as cc
from src.services import transcripts_services as ts

AR = timezone(timedelta(hours=-3))


def _msg(dia, autor, texto, **extra):
    return {"fecha_at": datetime(2026, 10, dia, 12, tzinfo=AR), "autor": autor, "contenido": texto,
            "adjuntos": [], **extra}


def _discord(*mensajes, vivo=True):
    msgs = [dict(m, indice=i) for i, m in enumerate(mensajes)]
    return {"id": "boost/ana", "canal": "ana", "categoria": "boost", **ts._agregados(msgs), "archivo": "x.txt",
            "bytes": 1, "completo": True, "actualizado_at": None, "en_discord": vivo, "_mensajes": msgs}


def test_suma_los_del_classroom_en_orden_sin_tocar_el_canal_de_discord():
    discord = _discord(_msg(20, "Ana", "hola"), _msg(27, "Juan", "dale"), vivo=False)
    classroom = {"canal": "ana", "categoria": "boost", "inactivo": False,
                 "mensajes": [_msg(29, "Ana", "ya estoy en la app", origen="classroom")]}
    r = ts._con_classroom(discord, classroom)
    assert [m["contenido"] for m in r["_mensajes"]] == ["hola", "dale", "ya estoy en la app"]
    assert [m["indice"] for m in r["_mensajes"]] == [0, 1, 2]
    assert r["mensajes"] == 3 and r["ultimo_texto"] == "ya estoy en la app"
    # El canal de Discord cerrado sigue vivo: el cliente habla por el classroom.
    assert r["en_discord"] and r["en_classroom"]
    assert discord["mensajes"] == 2 and len(discord["_mensajes"]) == 2


def test_el_cliente_que_solo_habla_en_el_classroom_tiene_su_canal():
    classroom = {"canal": "gabriel", "categoria": "principiantes", "inactivo": False,
                 "mensajes": [_msg(29, "Gabriel", "buenas", origen="classroom")]}
    r = ts._con_classroom(None, classroom)
    assert r["id"] == "principiantes/gabriel" and r["archivo"] is None and r["mensajes"] == 1


def test_sin_classroom_el_canal_queda_igual():
    discord = _discord(_msg(20, "Ana", "hola"))
    assert ts._con_classroom(discord, None) is discord


def test_el_slug_es_el_de_discord():
    assert cc.slug("Laura Grasseler") == "laura-grasseler"
    assert cc.slug("Benat y Vicente") == "benat-y-vicente"
    assert cc.slug("Ñandú Pérez") == "nandu-perez"
