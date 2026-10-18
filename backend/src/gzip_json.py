"""Comprime las respuestas JSON de la API.

El nginx del host manda /api directo al backend, sin pasar por el nginx del frontend que
comprime: los datos de las vistas viajaban enteros (Audiencia, 503 KB). Solo JSON a propósito:
bajo /api también salen audios y adjuntos, que ya vienen comprimidos o se piden por partes
(adelantar un audio), y comprimirlos los rompía o gastaba CPU en nada.
"""

import gzip

from starlette.datastructures import Headers, MutableHeaders

MINIMO = 1024  # por debajo de esto comprimir no ahorra nada


class GZipJson:
    def __init__(self, app, minimo: int = MINIMO, nivel: int = 6):
        self.app, self.minimo, self.nivel = app, minimo, nivel

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or "gzip" not in Headers(scope=scope).get("accept-encoding", ""):
            await self.app(scope, receive, send)
            return
        inicio = None
        partes: list[bytes] = []

        async def enviar(mensaje):
            nonlocal inicio
            if mensaje["type"] == "http.response.start":
                cabeceras = Headers(raw=mensaje["headers"])
                if cabeceras.get("content-type", "").startswith("application/json") and "content-encoding" not in cabeceras:
                    inicio = mensaje  # se manda con el cuerpo, ya comprimido
                    return
                await send(mensaje)
                return
            if inicio is None or mensaje["type"] != "http.response.body":
                await send(mensaje)
                return
            partes.append(mensaje.get("body", b""))
            if mensaje.get("more_body"):
                return
            cuerpo = b"".join(partes)
            cabeceras = MutableHeaders(raw=inicio["headers"])
            if len(cuerpo) >= self.minimo:
                cuerpo = gzip.compress(cuerpo, self.nivel)
                cabeceras["content-encoding"] = "gzip"
                cabeceras["content-length"] = str(len(cuerpo))
                cabeceras.add_vary_header("Accept-Encoding")
            await send(inicio)
            await send({"type": "http.response.body", "body": cuerpo})

        await self.app(scope, receive, enviar)
