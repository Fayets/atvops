"""
Tests del registro de llamadas.

Lo que se prueba es el cruce entre el calendario y el CRM —donde estaban los bugs— y la
serialización de la fila guardada. No tocan la base ni Google: son funciones sobre listas.
"""

from datetime import date, datetime

from src.services import gcal_services as gcal
from src.services import llamadas_services as ll
from src.services import ventas_services as v


# ------------------------------------------------------------------ identidad

def test_la_llamada_se_identifica_por_su_evento_del_calendario():
    assert ll._clave({"id": 12, "eventoId": "abc123"}) == "abc123"


def test_sin_evento_manda_el_id_del_crm():
    """Una llamada que el calendario no tiene sigue siendo la misma entre corridas."""
    assert ll._clave({"id": 12, "eventoId": ""}) == "lead:12"


def test_la_cargada_a_mano_conserva_su_id():
    assert ll._clave({"id": "ops:7", "eventoId": ""}) == "ops:7"


# ------------------------------------------------------------------ el email del equipo

class _Fila:
    """Lo mínimo de una fila guardada para poder serializarla."""

    def __init__(self, **kw):
        base = dict(id=1, lead_id=0, fuente="calendario", evento_id="ev1", prospecto="Fulano",
                    inicio_at=datetime(2026, 9, 10, 15, 0), email=None, telefono=None, ig=None,
                    setter=None, origen=None, calificacion=None, segunda=False, titulo=None,
                    url=None, link_llamada=None, agendo_at=None, agendo_en=None,
                    ingresos_rango=None, vino_de_ads=False, lead_creado_at=None,
                    resultado="", closer="", programa="", cash_usd=0.0, saldo_usd=0.0,
                    nota="", descartada=False)
        base.update(kw)
        for k, val in base.items():
            setattr(self, k, val)


def test_la_llamada_del_crm_se_muestra_con_su_id_de_siempre():
    """El frontend carga el resultado con ese id: no puede cambiar al mudar la fuente."""
    d = ll._a_dict(_Fila(lead_id=3293, evento_id="ev9"))
    assert d["id"] == 3293
    assert d["eventoId"] == "ev9"


def test_la_que_solo_esta_en_el_calendario_se_muestra_como_cal():
    assert ll._a_dict(_Fila(evento_id="ev9"))["id"] == "cal:ev9"


def test_la_cargada_a_mano_se_muestra_como_ops():
    assert ll._a_dict(_Fila(id=7, fuente="manual", evento_id="ops:xyz"))["id"] == "ops:7"
    # Y no expone un eventoId que Google no conoce.
    assert ll._a_dict(_Fila(id=7, fuente="manual", evento_id="ops:xyz"))["eventoId"] == ""


def test_la_descartada_se_lee_como_descartada():
    assert ll._a_dict(_Fila(descartada=True, resultado="Cerrado"))["resultado"] == "descartada"


def test_deja_de_ser_solo_del_calendario_cuando_tiene_resultado():
    assert ll._a_dict(_Fila())["soloCalendario"] is True
    assert ll._a_dict(_Fila(resultado="Cerrado"))["soloCalendario"] is False
    assert ll._a_dict(_Fila(lead_id=5))["soloCalendario"] is False


# ------------------------------------------------------------------ el cruce

def _sin_base(monkeypatch):
    """El cruce toca la base para lo que ya se cargó; acá se prueba el cruce solo."""
    monkeypatch.setattr(v, "_llamadas_propias", lambda *a, **k: [])
    monkeypatch.setattr(v, "_referencias", lambda *a, **k: {})
    monkeypatch.setattr(v, "_aplicar_lo_propio", lambda filas: filas)
    monkeypatch.setattr(v, "_duenio_de_cada_lead", lambda *a, **k: {})


def _reunion(evento, cuando, prospecto, invitados):
    return {"eventoId": evento, "inicioAt": cuando, "prospecto": prospecto, "titulo": prospecto,
            "segunda": False, "invitados": invitados, "url": None, "tipo": ""}


def test_el_email_del_equipo_no_aparea_a_nadie(monkeypatch):
    """El closer está invitado a todas las reuniones: su email no identifica al prospecto.

    Con un lead que tenga ese email —el CRM los crea solos— el cruce le ataba cualquier
    reunión, y la llamada de un prospecto terminaba mostrándose con el nombre de otro.
    """
    equipo = "closer@atv.com"
    reuniones = [
        _reunion("ev1", "2026-09-01T15:00:00-03:00", "Ana", ["ana@mail.com", equipo]),
        _reunion("ev2", "2026-09-02T15:00:00-03:00", "Bruno", ["bruno@mail.com", equipo]),
        _reunion("ev3", "2026-09-03T15:00:00-03:00", "Carla", ["carla@mail.com", equipo]),
        _reunion("ev4", "2026-09-04T15:00:00-03:00", "Dora", ["dora@mail.com", equipo]),
        _reunion("ev5", "2026-09-05T15:00:00-03:00", "Eze", ["eze@mail.com", equipo]),
    ]
    _sin_base(monkeypatch)
    monkeypatch.setattr(gcal, "configurado", lambda: True)
    monkeypatch.setattr(gcal, "reuniones_venta", lambda *a, **k: reuniones)

    # El lead basura: lleva el email del equipo y una fecha que no es la de ninguna reunión.
    lead = {"id": 99, "nombre": "closer", "email": equipo, "telefono": "", "ig": "",
            "origen": "", "closer": "", "setter": "", "call": datetime(2026, 9, 20, 15, 0),
            "agendo": None, "agendo_en": "", "pago": 0, "debe": 0, "ingresos_rango": "",
            "programa_ofrecido": "", "vino_de_ads": False, "notas": "", "created_at": None,
            "closer_report": "", "link_llamada": "", "resultado": "agendado", "calificacion": ""}

    filas = v._armar_desde_las_fuentes([dict(lead)], date(2026, 9, 1), date(2026, 10, 1))
    suyo = next(f for f in filas if f["id"] == 99)
    # Se queda con su fecha del CRM en vez de robarle el evento a un prospecto.
    assert suyo["call"] == datetime(2026, 9, 20, 15, 0)
    assert not suyo.get("eventoId")
    # Y las cinco reuniones siguen siendo de quien son.
    assert {f["nombre"] for f in filas if f.get("eventoId")} == {"Ana", "Bruno", "Carla", "Dora", "Eze"}


def test_el_email_del_prospecto_si_aparea(monkeypatch):
    """Un email que está en una sola reunión es el del prospecto y tiene que unir."""
    reuniones = [_reunion("ev1", "2026-09-10T16:00:00-03:00", "Ana Pérez", ["ana@mail.com"])]
    _sin_base(monkeypatch)
    monkeypatch.setattr(gcal, "configurado", lambda: True)
    monkeypatch.setattr(gcal, "reuniones_venta", lambda *a, **k: reuniones)

    lead = {"id": 5, "nombre": "Ana Pérez and Aumenta Tu Valor", "email": "ana@mail.com",
            "telefono": "", "ig": "", "origen": "", "closer": "Nick", "setter": "",
            "call": datetime(2026, 9, 9, 12, 0), "agendo": None, "agendo_en": "", "pago": 0,
            "debe": 0, "ingresos_rango": "", "programa_ofrecido": "", "vino_de_ads": False,
            "notas": "", "created_at": None, "closer_report": "", "link_llamada": "",
            "resultado": "", "calificacion": ""}

    filas = v._armar_desde_las_fuentes([dict(lead)], date(2026, 9, 1), date(2026, 10, 1))
    suyo = next(f for f in filas if f["id"] == 5)
    assert suyo["eventoId"] == "ev1"
    # La fecha buena es la del calendario: ahí se ven las reprogramaciones.
    assert suyo["call"] == datetime(2026, 9, 10, 16, 0)
    assert len(filas) == 1        # una reunión, una fila


# ------------------------------------------------------------------ varias filas por lead

class _FilaLead:
    def __init__(self, evento_id, lead_id, resultado="", inicio=None, creado=None):
        self.evento_id, self.lead_id, self.resultado = evento_id, lead_id, resultado
        self.inicio_at = inicio
        self.creado_at = creado or datetime(2026, 1, 1)


def test_entre_varias_filas_del_mismo_lead_gana_la_que_tiene_resultado(monkeypatch):
    """Un lead puede tener dos reuniones guardadas: una 1ra y una 2da, o un evento que
    Google duplicó. `.get()` de Pony revienta con varias, y elegir cualquiera perdía el
    resultado ya cargado."""
    filas = [_FilaLead("ev1", 42, "", datetime(2026, 9, 20)),
             _FilaLead("ev2", 42, "Cerrado", datetime(2026, 9, 10))]

    class _Modelo:
        @staticmethod
        def select():
            return filas

    monkeypatch.setitem(__import__("sys").modules, "src.models",
                        type("m", (), {"ReunionCrm": _Modelo})())
    assert v._fila_del_lead(42).evento_id == "ev2"


def test_sin_filas_del_lead_no_devuelve_nada(monkeypatch):
    class _Modelo:
        @staticmethod
        def select():
            return []

    monkeypatch.setitem(__import__("sys").modules, "src.models",
                        type("m", (), {"ReunionCrm": _Modelo})())
    assert v._fila_del_lead(42) is None
    assert v._fila_del_lead(0) is None
