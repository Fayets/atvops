"""La API comprime el JSON y deja como está todo lo demás (audios, adjuntos)."""

import gzip

from fastapi import FastAPI
from fastapi.responses import JSONResponse, Response
from fastapi.testclient import TestClient

from src.gzip_json import GZipJson

app = FastAPI()
app.add_middleware(GZipJson)


@app.get("/grande")
def grande():
    return JSONResponse({"x": "a" * 5000})


@app.get("/chico")
def chico():
    return {"ok": True}


@app.get("/audio")
def audio():
    return Response(b"a" * 5000, media_type="audio/mpeg")


def test_comprime_el_json_grande():
    r = TestClient(app).get("/grande", headers={"Accept-Encoding": "gzip"})
    assert r.headers["content-encoding"] == "gzip" and r.json() == {"x": "a" * 5000}
    assert int(r.headers["content-length"]) < 200


def test_no_toca_lo_chico_ni_lo_que_no_es_json_ni_a_quien_no_acepta_gzip():
    c = TestClient(app)
    assert "content-encoding" not in c.get("/chico", headers={"Accept-Encoding": "gzip"}).headers
    assert "content-encoding" not in c.get("/audio", headers={"Accept-Encoding": "gzip"}).headers
    assert "content-encoding" not in c.get("/grande", headers={"Accept-Encoding": "identity"}).headers
