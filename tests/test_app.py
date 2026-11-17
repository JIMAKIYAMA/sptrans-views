"""Testes sem tráfego externo: autenticação, sessão, falhas e contratos da API."""

from __future__ import annotations

from unittest.mock import Mock

import pytest
import requests

from app import create_app
from sptrans_client import SPTransClient, SPTransError


TOKEN = "token-de-teste-nao-real"


def response(payload=None, status=200, content=b""):
    result = Mock()
    result.status_code = status
    result.json.return_value = payload
    result.content = content
    return result


def setup_http(*responses):
    session = Mock(spec=requests.Session)
    session.headers = {}
    session.request.side_effect = list(responses)
    client = SPTransClient(TOKEN, session=session)
    return client, session


def test_authentication_is_reused_and_cookie_session_is_preserved():
    client, session = setup_http(response(True), response([]), response({"hr": "12:00", "l": []}))
    assert client.get_json("/Linha/Buscar", {"termosBusca": "Lapa"}) == []
    assert client.get_json("/Posicao") == {"hr": "12:00", "l": []}
    calls = session.request.call_args_list
    assert [call.args[0] for call in calls] == ["POST", "GET", "GET"]
    assert calls[0].kwargs["params"] == {"token": TOKEN}
    assert all(call.kwargs["timeout"] == (4, 15) for call in calls)
    assert all(call.kwargs["allow_redirects"] is False for call in calls)


def test_expired_session_reauthenticates_once_before_repeating_original_request():
    client, session = setup_http(
        response(True), response(status=401), response(True), response([{"cl": 1273}])
    )
    assert client.get_json("/Linha/Buscar", {"termosBusca": "8000"}) == [{"cl": 1273}]
    calls = session.request.call_args_list
    assert [call.args[0] for call in calls] == ["POST", "GET", "POST", "GET"]
    assert calls[1].kwargs["params"] == calls[3].kwargs["params"]


def test_repeated_refusal_stops_instead_of_retrying_forever():
    client, session = setup_http(response(True), response(status=403), response(True), response(status=401))
    with pytest.raises(SPTransError) as exc:
        client.get_json("/Posicao")
    assert exc.value.status_code == 401
    assert session.request.call_count == 4


def test_legacy_false_response_is_treated_as_expired_session():
    client, session = setup_http(response(True), response(False), response(True), response([]))
    assert client.get_json("/Corredor") == []
    assert session.request.call_count == 4


def test_rejected_token_does_not_query_data_or_expose_credential():
    client, session = setup_http(response(False))
    app = create_app(client)
    result = app.test_client().get("/api/status")
    assert result.status_code == 401
    assert result.json["configured"] is True
    assert result.json["ok"] is False
    assert result.json["code"] == "authentication_failed"
    assert TOKEN not in result.get_data(as_text=True)
    assert session.request.call_count == 1


@pytest.mark.parametrize(
    ("exception", "status", "code"),
    [
        (requests.ConnectionError(f"POST https://example.org?token={TOKEN}"), 502, "upstream_unavailable"),
        (requests.Timeout(f"POST https://example.org?token={TOKEN}"), 504, "upstream_timeout"),
    ],
)
def test_network_exceptions_are_sanitized(exception, status, code):
    client, session = setup_http(exception)
    result = create_app(client).test_client().get("/api/status")
    assert result.status_code == status
    assert result.json["code"] == code
    assert TOKEN not in result.get_data(as_text=True)
    assert "example.org" not in result.get_data(as_text=True)


def test_missing_token_is_an_actionable_error_without_network_request():
    session = Mock(spec=requests.Session)
    session.headers = {}
    client = SPTransClient("", session=session)
    result = create_app(client).test_client().get("/api/status")
    assert result.status_code == 503
    assert result.json["configured"] is False
    assert result.json["code"] == "missing_token"
    session.request.assert_not_called()


def test_insecure_or_credential_bearing_base_url_is_rejected():
    for url in ["http://api.olhovivo.sptrans.com.br/v2.1", "https://user:pass@example.org", "https://example.org?token=x"]:
        with pytest.raises(ValueError):
            SPTransClient(TOKEN, url)


def test_non_json_response_is_not_forwarded_to_browser():
    bad = response()
    bad.json.side_effect = ValueError(f"invalid response {TOKEN}")
    client, session = setup_http(response(True), bad)
    result = create_app(client).test_client().get("/api/corredores")
    assert result.status_code == 502
    assert result.json["code"] == "invalid_upstream_json"
    assert TOKEN not in result.get_data(as_text=True)


def test_null_and_empty_upstream_payloads_are_preserved():
    client, session = setup_http(response(True), response(None), response([]))
    web = create_app(client).test_client()
    assert web.get("/api/posicoes?codigo_linha=1273").json is None
    assert web.get("/api/paradas?codigo_linha=1273").json == []


@pytest.mark.parametrize(
    "url",
    [
        "/api/linhas", "/api/linhas?q=Lapa&sentido=3", "/api/linhas?q=" + "a" * 101,
        "/api/posicoes?codigo_linha=8000-10", "/api/posicoes?codigo_linha=-1",
        "/api/posicoes?codigo_linha=99999999999999", "/api/paradas",
        "/api/paradas?q=Lapa&codigo_linha=1273", "/api/paradas?codigo_linha=1&codigo_corredor=2",
        "/api/previsoes", "/api/previsoes?codigo_parada=0", "/api/garagens",
        "/api/velocidades?tipo=inexistente", "/api/velocidades?sentido=1",
    ],
)
def test_invalid_parameters_are_rejected_before_any_network_request(url):
    api = Mock(spec=SPTransClient)
    result = create_app(api).test_client().get(url)
    assert result.status_code == 400
    assert result.json["code"] == "invalid_parameter"
    api.get_json.assert_not_called()
    api.get_kmz.assert_not_called()


@pytest.mark.parametrize(
    ("url", "upstream_path", "upstream_params"),
    [
        ("/api/linhas?q=Lapa&sentido=2", "/Linha/BuscarLinhaSentido", {"termosBusca": "Lapa", "sentido": 2}),
        ("/api/posicoes?codigo_linha=1273", "/Posicao/Linha", {"codigoLinha": 1273}),
        ("/api/paradas?codigo_corredor=8", "/Parada/BuscarParadasPorCorredor", {"codigoCorredor": 8}),
        ("/api/previsoes?codigo_parada=4200953&codigo_linha=1989", "/Previsao", {"codigoParada": 4200953, "codigoLinha": 1989}),
        ("/api/previsoes?codigo_parada=4200953", "/Previsao/Parada", {"codigoParada": 4200953}),
        ("/api/previsoes?codigo_linha=1989", "/Previsao/Linha", {"codigoLinha": 1989}),
        ("/api/garagens?codigo_empresa=0&codigo_linha=1273", "/Posicao/Garagem", {"codigoEmpresa": 0, "codigoLinha": 1273}),
    ],
)
def test_public_parameters_map_to_sptrans_codes_and_preserve_nested_payload(url, upstream_path, upstream_params):
    api = Mock(spec=SPTransClient)
    payload = {"hr": "12:00", "nested": [{"py": -23.5, "px": -46.6}]}
    api.get_json.return_value = payload
    result = create_app(api).test_client().get(url)
    assert result.status_code == 200
    assert result.json == payload
    api.get_json.assert_called_once_with(upstream_path, upstream_params)
    assert result.headers["Cache-Control"] == "no-store"


def test_kmz_is_downloaded_as_binary_and_direction_is_in_path():
    api = Mock(spec=SPTransClient)
    api.get_kmz.return_value = b"PK\x03\x04test-kmz"
    result = create_app(api).test_client().get("/api/velocidades?tipo=corredor&sentido=BC")
    assert result.status_code == 200
    assert result.data == b"PK\x03\x04test-kmz"
    assert result.mimetype == "application/vnd.google-earth.kmz"
    assert "attachment" in result.headers["Content-Disposition"]
    api.get_kmz.assert_called_once_with("/KMZ/Corredor/BC")


def test_html_error_response_is_not_downloaded_as_kmz():
    client, session = setup_http(response(True), response(content=b"<html>Unavailable</html>"))
    result = create_app(client).test_client().get("/api/velocidades")
    assert result.status_code == 502
    assert result.json["code"] == "invalid_upstream_kmz"
