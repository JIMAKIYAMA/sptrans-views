"""Cliente da API Olho Vivo: token e cookie ficam exclusivamente no servidor."""

from __future__ import annotations

import threading
from typing import Any
from urllib.parse import urlsplit

import requests


DEFAULT_API_URL = "https://api.olhovivo.sptrans.com.br/v2.1"


class SPTransError(Exception):
    """Erro público, com mensagem controlada que nunca contém o token."""

    def __init__(self, message: str, status_code: int = 502, code: str = "sptrans_error"):
        super().__init__(message)
        self.status_code = status_code
        self.code = code


class SPTransClient:
    """Reutiliza a sessão autenticada e a renova uma vez quando expira.

    Uma única sessão requests é compartilhada pelo aplicativo. O lock evita
    que pedidos simultâneos alterem o cookie durante outra consulta.
    """

    def __init__(
        self,
        token: str = "",
        base_url: str = DEFAULT_API_URL,
        session: requests.Session | None = None,
        timeout: tuple[float, float] = (4, 15),
    ):
        self._token = token.strip()
        parsed_url = urlsplit(base_url)
        if (
            parsed_url.scheme != "https"
            or not parsed_url.hostname
            or parsed_url.username
            or parsed_url.password
            or parsed_url.query
            or parsed_url.fragment
        ):
            raise ValueError("SPTRANS_API_URL deve ser uma URL HTTPS, sem credenciais ou parâmetros.")
        self.base_url = base_url.rstrip("/")
        self.session = session or requests.Session()
        self.session.headers.update({"Accept": "application/json", "User-Agent": "SPTrans-Visualizador/1.0"})
        self.timeout = timeout
        self._authenticated = False
        self._lock = threading.RLock()

    @property
    def configured(self) -> bool:
        return bool(self._token)

    def _request(self, method: str, path: str, params: dict | None = None):
        try:
            # Não seguir redirecionamentos: o token pertence apenas a esta API.
            return self.session.request(
                method,
                f"{self.base_url}/{path.lstrip('/')}",
                params=params,
                timeout=self.timeout,
                allow_redirects=False,
            )
        except requests.Timeout:
            raise SPTransError(
                "A SPTrans demorou para responder. Tente novamente em instantes.",
                504,
                "upstream_timeout",
            ) from None
        except requests.RequestException:
            # str(exc) pode conter a URL de autenticação e o token.
            raise SPTransError(
                "Não foi possível conectar à SPTrans. Confira sua conexão e tente novamente.",
                502,
                "upstream_unavailable",
            ) from None

    @staticmethod
    def _check_status(response) -> None:
        if response.status_code == 429:
            raise SPTransError(
                "A SPTrans limitou temporariamente as consultas. Aguarde e tente novamente.",
                503,
                "upstream_rate_limit",
            )
        if not 200 <= response.status_code < 300:
            raise SPTransError(
                "A SPTrans não conseguiu atender à consulta. Tente novamente em instantes.",
                502,
                "upstream_response",
            )

    @staticmethod
    def _json(response) -> Any:
        try:
            return response.json()
        except (ValueError, requests.exceptions.JSONDecodeError):
            raise SPTransError(
                "A SPTrans retornou uma resposta em formato inesperado.",
                502,
                "invalid_upstream_json",
            ) from None

    def _authenticate_locked(self) -> None:
        if not self.configured:
            raise SPTransError(
                "Configure SPTRANS_TOKEN no arquivo .env e reinicie o aplicativo.",
                503,
                "missing_token",
            )
        self._authenticated = False
        response = self._request("POST", "/Login/Autenticar", {"token": self._token})
        self._check_status(response)
        if self._json(response) is not True:
            raise SPTransError(
                "A SPTrans recusou a autenticação. Confira o token configurado no arquivo .env.",
                401,
                "authentication_failed",
            )
        self._authenticated = True

    def authenticate(self) -> None:
        with self._lock:
            if not self._authenticated:
                self._authenticate_locked()

    def _get_authenticated_locked(self, path: str, params: dict | None = None):
        if not self._authenticated:
            self._authenticate_locked()
        response = self._request("GET", path, params)
        if response.status_code in (401, 403):
            self._authenticate_locked()
            response = self._request("GET", path, params)
        if response.status_code in (401, 403):
            self._authenticated = False
            raise SPTransError(
                "A sessão da SPTrans foi recusada. Confira o token e tente novamente.",
                401,
                "authentication_failed",
            )
        self._check_status(response)
        return response

    def get_json(self, path: str, params: dict | None = None) -> Any:
        with self._lock:
            response = self._get_authenticated_locked(path, params)
            payload = self._json(response)
            # Algumas respostas de sessão expirada usam HTTP 200 com `false`.
            if payload is False:
                self._authenticate_locked()
                response = self._get_authenticated_locked(path, params)
                payload = self._json(response)
                if payload is False:
                    self._authenticated = False
                    raise SPTransError(
                        "A sessão da SPTrans foi recusada. Confira o token e tente novamente.",
                        401,
                        "authentication_failed",
                    )
            return payload

    def get_kmz(self, path: str) -> bytes:
        with self._lock:
            response = self._get_authenticated_locked(path)
            data = response.content
            # KMZ é um arquivo ZIP; não devolver HTML de indisponibilidade como mapa.
            if not data.startswith(b"PK"):
                raise SPTransError(
                    "O mapa KMZ não está disponível nesta resposta da SPTrans. Tente novamente mais tarde.",
                    502,
                    "invalid_upstream_kmz",
                )
            return data
