"""Camada de acesso ao Odoo via XML-RPC. Único módulo que faz I/O de rede."""
import os
import time
import socket
import xmlrpc.client
import urllib.request
import urllib.error

from dotenv import load_dotenv


class OdooError(Exception):
    """Erro genérico de comunicação com o Odoo."""


class OdooAuthError(OdooError):
    """Falha de autenticação."""


def is_access_error(exc: Exception) -> bool:
    """True se a exceção for um AccessError do Odoo (sem permissão de leitura)."""
    if isinstance(exc, xmlrpc.client.Fault):
        texto = (exc.faultString or "").lower()
        return (
            "accesserror" in texto
            or "not allowed" in texto
            or "sorry, you are not allowed" in texto
        )
    return False


class OdooClient:
    """Cliente XML-RPC do Odoo com timeout, retry com backoff e throttle."""

    def __init__(self, url, db, username, password, timeout=30, throttle=0.15):
        self.url = url.rstrip("/")
        self.db = db
        self.username = username
        self.password = password
        self.timeout = timeout
        self.throttle = throttle
        self.uid = None
        self._common = None
        self._models = None

    def connect(self):
        socket.setdefaulttimeout(self.timeout)
        self._common = xmlrpc.client.ServerProxy(f"{self.url}/xmlrpc/2/common")
        self._models = xmlrpc.client.ServerProxy(f"{self.url}/xmlrpc/2/object")

    def version(self) -> dict:
        return self._common.version()

    def authenticate(self) -> int:
        uid = self._common.authenticate(self.db, self.username, self.password, {})
        if not uid:
            raise OdooAuthError(
                "Autenticação falhou — verifique ODOO_* no .env.local"
            )
        self.uid = uid
        return uid

    def probe_json2(self) -> bool:
        """Testa se o endpoint /json/2 responde. Endpoint existente devolve
        erro de auth/método (400/401/405); ausente devolve 404."""
        req = urllib.request.Request(f"{self.url}/json/2/", method="GET")
        try:
            urllib.request.urlopen(req, timeout=self.timeout)
            return True
        except urllib.error.HTTPError as exc:
            return exc.code != 404
        except urllib.error.URLError:
            return False

    def execute_kw(self, model, method, args, kwargs=None, retries=3):
        """Chama um método de modelo. Faz retry em erro de rede; Fault do
        Odoo (ex.: AccessError) sobe imediatamente para o caller tratar."""
        kwargs = kwargs or {}
        last_exc = None
        for attempt in range(retries):
            try:
                result = self._models.execute_kw(
                    self.db, self.uid, self.password, model, method, args, kwargs
                )
                time.sleep(self.throttle)
                return result
            except xmlrpc.client.Fault:
                raise
            except (socket.timeout, xmlrpc.client.ProtocolError, ConnectionError, OSError) as exc:
                last_exc = exc
                time.sleep(2 ** attempt)
        raise OdooError(f"{model}.{method} falhou após {retries} tentativas: {last_exc}")


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
