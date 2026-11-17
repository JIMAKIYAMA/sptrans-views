"""Servidor local do visualizador SPTrans. Execute: python app.py."""

from __future__ import annotations

import os
from io import BytesIO
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request, send_file

from sptrans_client import DEFAULT_API_URL, SPTransClient, SPTransError


ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")


def create_app(client: SPTransClient | None = None) -> Flask:
    app = Flask(__name__)
    app.json.ensure_ascii = False
    app.config["MAX_CONTENT_LENGTH"] = 16_384
    api = client if client is not None else SPTransClient(
        token=os.getenv("SPTRANS_TOKEN", ""),
        base_url=os.getenv("SPTRANS_API_URL", DEFAULT_API_URL),
    )
    app.extensions["sptrans"] = api

    def error(message: str):
        raise SPTransError(message, 400, "invalid_parameter")

    def optional_int(name: str, *, minimum: int = 1) -> int | None:
        raw = request.args.get(name, "").strip()
        if not raw:
            return None
        # Limite explícito evita inteiros gigantes e entradas ambíguas.
        if not raw.isascii() or not raw.isdigit() or len(raw) > 10:
            error(f"O parâmetro {name} deve ser um número inteiro.")
        value = int(raw)
        if value < minimum or value > 2_147_483_647:
            error(f"O parâmetro {name} deve estar entre {minimum} e 2147483647.")
        return value

    def query_text() -> str:
        value = request.args.get("q", "").strip()
        if not value or len(value) > 100:
            error("Digite um termo de busca entre 1 e 100 caracteres.")
        return value

    @app.after_request
    def response_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.errorhandler(SPTransError)
    def handle_sptrans_error(exc):
        body = {"error": str(exc), "code": exc.code}
        if request.path == "/api/status":
            body.update(ok=False, configured=api.configured, mode="live")
        return jsonify(body), exc.status_code

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/api/status")
    def status():
        api.authenticate()
        return jsonify(ok=True, configured=api.configured, mode="live")

    @app.get("/api/linhas")
    def linhas():
        params = {"termosBusca": query_text()}
        sentido = optional_int("sentido")
        if sentido is not None:
            if sentido not in (1, 2):
                error("O sentido deve ser 1 ou 2.")
            params["sentido"] = sentido
        path = "/Linha/BuscarLinhaSentido" if sentido is not None else "/Linha/Buscar"
        return jsonify(api.get_json(path, params))

    @app.get("/api/posicoes")
    def posicoes():
        codigo = optional_int("codigo_linha")
        if codigo is None:
            return jsonify(api.get_json("/Posicao"))
        return jsonify(api.get_json("/Posicao/Linha", {"codigoLinha": codigo}))

    @app.get("/api/paradas")
    def paradas():
        linha = optional_int("codigo_linha")
        corredor = optional_int("codigo_corredor")
        has_query = bool(request.args.get("q", "").strip())
        if sum((linha is not None, corredor is not None, has_query)) != 1:
            error("Informe apenas um filtro: q, codigo_linha ou codigo_corredor.")
        if linha is not None:
            result = api.get_json("/Parada/BuscarParadasPorLinha", {"codigoLinha": linha})
        elif corredor is not None:
            result = api.get_json("/Parada/BuscarParadasPorCorredor", {"codigoCorredor": corredor})
        else:
            result = api.get_json("/Parada/Buscar", {"termosBusca": query_text()})
        return jsonify(result)

    @app.get("/api/previsoes")
    def previsoes():
        linha = optional_int("codigo_linha")
        parada = optional_int("codigo_parada")
        if linha is None and parada is None:
            error("Informe codigo_parada, codigo_linha ou ambos.")
        if linha is not None and parada is not None:
            path, params = "/Previsao", {"codigoParada": parada, "codigoLinha": linha}
        elif parada is not None:
            path, params = "/Previsao/Parada", {"codigoParada": parada}
        else:
            path, params = "/Previsao/Linha", {"codigoLinha": linha}
        return jsonify(api.get_json(path, params))

    @app.get("/api/corredores")
    def corredores():
        return jsonify(api.get_json("/Corredor"))

    @app.get("/api/empresas")
    def empresas():
        return jsonify(api.get_json("/Empresa"))

    @app.get("/api/garagens")
    def garagens():
        empresa = optional_int("codigo_empresa", minimum=0)
        linha = optional_int("codigo_linha")
        if empresa is None:
            error("Informe codigo_empresa para consultar os veículos na garagem.")
        params = {"codigoEmpresa": empresa}
        if linha is not None:
            params["codigoLinha"] = linha
        return jsonify(api.get_json("/Posicao/Garagem", params))

    @app.get("/api/velocidades")
    def velocidades():
        tipo = request.args.get("tipo", "geral").strip()
        sentido = request.args.get("sentido", "").strip().upper()
        paths = {"geral": "/KMZ", "corredor": "/KMZ/Corredor", "outras": "/KMZ/OutrasVias"}
        if tipo not in paths:
            error("O tipo deve ser geral, corredor ou outras.")
        if sentido not in ("", "BC", "CB"):
            error("O sentido do KMZ deve ser BC ou CB.")
        path = paths[tipo] + (f"/{sentido}" if sentido else "")
        data = api.get_kmz(path)
        suffix = f"-{sentido.lower()}" if sentido else ""
        return send_file(
            BytesIO(data),
            mimetype="application/vnd.google-earth.kmz",
            as_attachment=True,
            download_name=f"sptrans-velocidades-{tipo}{suffix}.kmz",
            max_age=0,
        )

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", "5000")), debug=False)
