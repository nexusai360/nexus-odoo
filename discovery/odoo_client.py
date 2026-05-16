"""Camada de acesso ao Odoo via JSON-RPC. Único módulo que faz I/O de rede.

Usa JSON-RPC, não XML-RPC: o XML-RPC do Odoo serializa as respostas com
allow_none=False e quebra no fields_get de modelos com metadados None —
comum na customização SPED da Tauga. JSON-RPC serializa None como null.
"""
import os
import json
import time
import socket
import urllib.request
import urllib.error

from dotenv import load_dotenv


class OdooError(Exception):
    """Erro genérico de comunicação com o Odoo."""


class OdooAuthError(OdooError):
    """Falha de autenticação."""


class OdooRpcFault(OdooError):
    """Erro de negócio retornado pelo Odoo (campo 'error' da resposta)."""

    def __init__(self, error: dict):
        self.error = error or {}
        data = self.error.get("data") or {}
        msg = data.get("message") or self.error.get("message") or json.dumps(self.error)
        super().__init__(str(msg)[:500])


def is_access_error(exc: Exception) -> bool:
    """True se a exceção indicar AccessError do Odoo (sem permissão)."""
    texto = str(exc).lower()
    if isinstance(exc, OdooRpcFault):
        data = exc.error.get("data") or {}
        texto += " " + str(data.get("name", "")).lower()
        texto += " " + str(data.get("debug", "")).lower()
    return (
        "accesserror" in texto
        or "not allowed" in texto
        or "you are not allowed" in texto
    )


class OdooClient:
    """Cliente JSON-RPC do Odoo com timeout, retry com backoff e throttle."""

    def __init__(self, url, db, username, password, timeout=60, throttle=0.15):
        self.url = url.rstrip("/")
        self.db = db
        self.username = username
        self.password = password
        self.timeout = timeout
        self.throttle = throttle
        self.uid = None

    def connect(self):
        socket.setdefaulttimeout(self.timeout)

    def _rpc(self, service, method, args, retries=3):
        """Chamada JSON-RPC crua. Retry em erro de rede; OdooRpcFault em erro
        de negócio do Odoo."""
        payload = json.dumps({
            "jsonrpc": "2.0",
            "method": "call",
            "params": {"service": service, "method": method, "args": args},
            "id": 1,
        }).encode("utf-8")
        last_exc = None
        for attempt in range(retries):
            body = None
            try:
                req = urllib.request.Request(
                    f"{self.url}/jsonrpc", data=payload,
                    headers={"Content-Type": "application/json"},
                )
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    body = json.loads(resp.read())
            except urllib.error.HTTPError as exc:
                # O Odoo pode devolver o erro JSON-RPC com status != 200.
                try:
                    body = json.loads(exc.read())
                except Exception:
                    last_exc = exc
                    time.sleep(2 ** attempt)
                    continue
            except (socket.timeout, urllib.error.URLError, ConnectionError, OSError) as exc:
                last_exc = exc
                time.sleep(2 ** attempt)
                continue

            time.sleep(self.throttle)
            if "error" in body:
                raise OdooRpcFault(body["error"])
            return body.get("result")
        raise OdooError(f"{service}.{method} falhou após {retries} tentativas: {last_exc}")

    def version(self) -> dict:
        return self._rpc("common", "version", [])

    def authenticate(self) -> int:
        uid = self._rpc(
            "common", "authenticate",
            [self.db, self.username, self.password, {}],
        )
        if not uid:
            raise OdooAuthError(
                "Autenticação falhou — verifique ODOO_* no .env.local"
            )
        self.uid = uid
        return uid

    def probe_json2(self) -> bool:
        """Testa se o endpoint /json/2 (Odoo 19+) responde. Endpoint existente
        devolve erro de auth/método; ausente devolve 404."""
        req = urllib.request.Request(f"{self.url}/json/2/", method="GET")
        try:
            urllib.request.urlopen(req, timeout=self.timeout)
            return True
        except urllib.error.HTTPError as exc:
            return exc.code != 404
        except urllib.error.URLError:
            return False

    def execute_kw(self, model, method, args, kwargs=None):
        """Chama um método de modelo via JSON-RPC."""
        kwargs = kwargs or {}
        return self._rpc(
            "object", "execute_kw",
            [self.db, self.uid, self.password, model, method, args, kwargs],
        )


def client_from_env(env_path=".env.local") -> OdooClient:
    """Constrói o OdooClient a partir do .env.local. Falha cedo se faltar
    alguma variável."""
    load_dotenv(env_path)
    faltando = [
        v for v in ("ODOO_URL", "ODOO_DB", "ODOO_USERNAME", "ODOO_PASSWORD")
        if not os.getenv(v)
    ]
    if faltando:
        raise OdooError(f"Variáveis ausentes no {env_path}: {', '.join(faltando)}")
    return OdooClient(
        url=os.getenv("ODOO_URL"),
        db=os.getenv("ODOO_DB"),
        username=os.getenv("ODOO_USERNAME"),
        password=os.getenv("ODOO_PASSWORD"),
    )
