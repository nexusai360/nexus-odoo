# F0 — Discovery do Odoo — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir os scripts Python de Discovery que mapeiam o Odoo Tauga (versão, modelos, campos, relações, amostras, aptidão para delta) e executá-los para produzir o mapa que alimenta F2 e F4.

**Architecture:** Módulo Python standalone em `discovery/`. Lógica de I/O (acesso XML-RPC) isolada em `odoo_client.py`. Lógica pura e testável (classificação, renderização de relatórios) isolada em `classificacao.py` e `relatorios.py`. Três scripts de etapa — `handshake.py`, `censo.py`, `mapa_profundo.py` — orquestram. TDD aplica-se à lógica pura; os scripts de etapa são verificados por execução real contra o Odoo (Parte 2).

**Tech Stack:** Python 3.10+, `xmlrpc.client` e `urllib` (stdlib), `python-dotenv`. Testes com `pytest`.

**Spec:** `docs/superpowers/specs/2026-05-15-discovery-odoo-design.md`

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `discovery/requirements.txt` | Dependências (`python-dotenv`, `pytest`) |
| `discovery/odoo_client.py` | `OdooClient`: conexão, auth, `execute_kw`, timeout, retry, throttle. Único arquivo que faz I/O de rede. |
| `discovery/classificacao.py` | Funções puras: tipo do modelo, área de negócio, campos temporais, veredito de aptidão delta. Testável. |
| `discovery/relatorios.py` | Funções puras: renderização de `censo.md` e `mapa-profundo.md`. Testável. |
| `discovery/handshake.py` | Etapa 0 — versão, protocolos, auth. |
| `discovery/censo.py` | Etapa A — inventário de modelos. |
| `discovery/mapa_profundo.py` | Etapa B — mapeamento profundo dos modelos de `camada2.json`. |
| `discovery/README.md` | Como configurar e rodar, na ordem. |
| `discovery/tests/test_classificacao.py` | Testes de `classificacao.py`. |
| `discovery/tests/test_relatorios.py` | Testes de `relatorios.py`. |
| `docs/runbooks/discovery-odoo.md` | Runbook operacional + resumo sanitizado dos achados. |

`camada2.json` e `discovery/output/` não são criados pelo plano — o primeiro nasce no checkpoint (Task 10), o segundo é gerado em runtime e é gitignored.

---

## PARTE 1 — Construção dos scripts

### Task 1: Estrutura do módulo `discovery/`

**Files:**
- Create: `discovery/requirements.txt`
- Create: `discovery/__init__.py` (vazio)
- Create: `discovery/tests/__init__.py` (vazio)

- [ ] **Step 1: Criar `discovery/requirements.txt`**

```
python-dotenv>=1.0.0
pytest>=8.0.0
```

- [ ] **Step 2: Criar os arquivos `__init__.py` vazios**

Criar `discovery/__init__.py` e `discovery/tests/__init__.py`, ambos sem conteúdo.

- [ ] **Step 3: Criar o virtualenv e instalar dependências**

Run:
```bash
cd discovery && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```
Expected: instala `python-dotenv` e `pytest` sem erro.

- [ ] **Step 4: Adicionar `.venv` ao gitignore**

Verificar que `.gitignore` (raiz) ignora `node_modules/` etc. Adicionar a linha `discovery/.venv/` ao `.gitignore` da raiz se ainda não coberta.

- [ ] **Step 5: Commit**

```bash
git add discovery/requirements.txt discovery/__init__.py discovery/tests/__init__.py .gitignore
git commit -m "chore: estrutura inicial do módulo discovery"
```

---

### Task 2: `odoo_client.py` — camada de acesso XML-RPC

**Files:**
- Create: `discovery/odoo_client.py`

- [ ] **Step 1: Escrever `discovery/odoo_client.py` completo**

```python
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
        return "accesserror" in texto or "not allowed" in texto or "sorry, you are not allowed" in texto
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
        erro de auth (400/401/405); ausente devolve 404."""
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
```

- [ ] **Step 2: Verificar que o arquivo compila**

Run: `cd discovery && .venv/bin/python -m py_compile odoo_client.py`
Expected: sem saída (sucesso).

- [ ] **Step 3: Commit**

```bash
git add discovery/odoo_client.py
git commit -m "feat: cliente XML-RPC do Odoo com retry e throttle"
```

---

### Task 3: `classificacao.py` — lógica pura de classificação (TDD)

**Files:**
- Create: `discovery/tests/test_classificacao.py`
- Create: `discovery/classificacao.py`

- [ ] **Step 1: Escrever os testes que falham**

`discovery/tests/test_classificacao.py`:

```python
from discovery.classificacao import (
    classificar_tipo, area_de_negocio, campos_temporais, veredito_aptidao_delta,
)


def test_classificar_tipo_transient():
    assert classificar_tipo({"transient": True}) == "transient"


def test_classificar_tipo_persistente():
    assert classificar_tipo({"transient": False}) == "persistente"


def test_area_de_negocio_por_prefixo():
    assert area_de_negocio("pedido.documento") == "Vendas/Compras"
    assert area_de_negocio("sped.documento") == "Fiscal"
    assert area_de_negocio("estoque.saldo.hoje") == "Estoque"
    assert area_de_negocio("finan.lancamento") == "Financeiro"
    assert area_de_negocio("hr.employee") == "RH"


def test_area_de_negocio_desconhecida():
    assert area_de_negocio("xpto.coisa") == "Outros"


def test_campos_temporais_identifica_create_e_write():
    fields = {
        "create_date": {"type": "datetime"},
        "write_date": {"type": "datetime"},
        "data_orcamento": {"type": "date"},
        "numero": {"type": "char"},
    }
    resultado = campos_temporais(fields)
    assert resultado["create_date"] is True
    assert resultado["write_date"] is True
    assert "data_orcamento" in resultado["campos_de_data"]
    assert "numero" not in resultado["campos_de_data"]


def test_veredito_apto():
    assert veredito_aptidao_delta(tem_write_date=True, ordenacao_ok=True) == "apto"


def test_veredito_verificar():
    assert veredito_aptidao_delta(tem_write_date=False, ordenacao_ok=True) == "verificar"
    assert veredito_aptidao_delta(tem_write_date=True, ordenacao_ok=False) == "verificar"
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `discovery/.venv/bin/python -m pytest discovery/tests/test_classificacao.py -v` (a partir da raiz)
Expected: FAIL — `ModuleNotFoundError: discovery.classificacao`.

- [ ] **Step 3: Escrever `discovery/classificacao.py`**

```python
"""Funções puras de classificação de modelos e campos do Odoo."""

# Prefixo do nome técnico do modelo -> área de negócio.
# Ajustável após o censo revelar os prefixos reais da instância Tauga.
_AREAS = {
    "pedido": "Vendas/Compras",
    "sale": "Vendas/Compras",
    "purchase": "Vendas/Compras",
    "sped": "Fiscal",
    "l10n_br": "Fiscal",
    "estoque": "Estoque",
    "stock": "Estoque",
    "finan": "Financeiro",
    "account": "Financeiro",
    "hr": "RH",
    "crm": "Comercial",
    "res": "Cadastros",
}


def classificar_tipo(modelo_meta: dict) -> str:
    """'transient' (wizard) ou 'persistente', a partir do registro de ir.model."""
    return "transient" if modelo_meta.get("transient") else "persistente"


def area_de_negocio(model_name: str) -> str:
    """Mapeia o prefixo do nome técnico para uma área de negócio."""
    prefixo = model_name.split(".")[0]
    return _AREAS.get(prefixo, "Outros")


def campos_temporais(fields: dict) -> dict:
    """Identifica campos temporais no retorno de fields_get().
    Retorna create_date/write_date (bool) e a lista de campos date/datetime."""
    campos_de_data = [
        nome for nome, meta in fields.items()
        if meta.get("type") in ("date", "datetime")
    ]
    return {
        "create_date": "create_date" in fields,
        "write_date": "write_date" in fields,
        "campos_de_data": campos_de_data,
    }


def veredito_aptidao_delta(tem_write_date: bool, ordenacao_ok: bool) -> str:
    """'apto' se o modelo tem write_date e a ordenação por ele é coerente;
    'verificar' caso contrário."""
    return "apto" if (tem_write_date and ordenacao_ok) else "verificar"
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `discovery/.venv/bin/python -m pytest discovery/tests/test_classificacao.py -v` (a partir da raiz)
Expected: PASS — 7 testes.

- [ ] **Step 5: Commit**

```bash
git add discovery/classificacao.py discovery/tests/test_classificacao.py
git commit -m "feat: funções de classificação de modelos e campos"
```

---

### Task 4: `relatorios.py` — renderização de relatórios (TDD)

**Files:**
- Create: `discovery/tests/test_relatorios.py`
- Create: `discovery/relatorios.py`

- [ ] **Step 1: Escrever os testes que falham**

`discovery/tests/test_relatorios.py`:

```python
from discovery.relatorios import render_censo_md, render_mapa_profundo_md


def test_render_censo_md_tem_resumo_e_areas():
    modelos = [
        {"model": "pedido.documento", "name": "Pedido", "area": "Vendas/Compras",
         "tipo": "persistente", "acesso": "ok", "registros": 1200},
        {"model": "estoque.saldo.hoje", "name": "Saldo", "area": "Estoque",
         "tipo": "persistente", "acesso": "ok", "registros": 340},
        {"model": "x.wiz", "name": "Wizard", "area": "Outros",
         "tipo": "transient", "acesso": "ok", "registros": None},
    ]
    resumo = {"total": 3, "sem_acesso": 0, "sem_contagem": 0}
    md = render_censo_md(modelos, resumo)
    assert "# Censo" in md
    assert "Total de modelos: 3" in md
    assert "## Vendas/Compras" in md
    assert "## Estoque" in md
    assert "pedido.documento" in md


def test_render_mapa_profundo_md_lista_modelos_e_veredito():
    modelos = [
        {"model": "pedido.documento",
         "campos": [{"nome": "numero", "tipo": "char", "relacao": None}],
         "veredito_delta": "apto",
         "qtd_amostra": 8},
    ]
    md = render_mapa_profundo_md(modelos)
    assert "# Mapa Profundo" in md
    assert "pedido.documento" in md
    assert "apto" in md
    assert "numero" in md
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `discovery/.venv/bin/python -m pytest discovery/tests/test_relatorios.py -v` (a partir da raiz)
Expected: FAIL — `ModuleNotFoundError: discovery.relatorios`.

- [ ] **Step 3: Escrever `discovery/relatorios.py`**

```python
"""Renderização dos relatórios Markdown do Discovery."""
from collections import defaultdict


def render_censo_md(modelos: list, resumo: dict) -> str:
    """Gera o censo.md: resumo no topo, modelos agrupados por área."""
    linhas = ["# Censo de Modelos do Odoo Tauga", ""]
    linhas.append(f"- Total de modelos: {resumo['total']}")
    linhas.append(f"- Sem acesso: {resumo['sem_acesso']}")
    linhas.append(f"- Sem contagem (timeout): {resumo['sem_contagem']}")
    linhas.append("")

    por_area = defaultdict(list)
    for m in modelos:
        por_area[m["area"]].append(m)

    for area in sorted(por_area):
        linhas.append(f"## {area}")
        linhas.append("")
        linhas.append("| Modelo | Rótulo | Tipo | Acesso | Registros |")
        linhas.append("|---|---|---|---|---|")
        for m in sorted(por_area[area], key=lambda x: x["model"]):
            registros = "—" if m["registros"] is None else m["registros"]
            linhas.append(
                f"| `{m['model']}` | {m['name']} | {m['tipo']} "
                f"| {m['acesso']} | {registros} |"
            )
        linhas.append("")
    return "\n".join(linhas)


def render_mapa_profundo_md(modelos: list) -> str:
    """Gera o mapa-profundo.md: um bloco por modelo com campos e veredito."""
    linhas = ["# Mapa Profundo dos Modelos Selecionados", ""]
    for m in modelos:
        linhas.append(f"## `{m['model']}`")
        linhas.append("")
        linhas.append(f"- Aptidão para delta: **{m['veredito_delta']}**")
        linhas.append(f"- Registros na amostra: {m['qtd_amostra']}")
        linhas.append("")
        linhas.append("| Campo | Tipo | Relação |")
        linhas.append("|---|---|---|")
        for c in m["campos"]:
            relacao = c["relacao"] or "—"
            linhas.append(f"| `{c['nome']}` | {c['tipo']} | {relacao} |")
        linhas.append("")
    return "\n".join(linhas)
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `discovery/.venv/bin/python -m pytest discovery/tests/test_relatorios.py -v` (a partir da raiz)
Expected: PASS — 2 testes.

- [ ] **Step 5: Commit**

```bash
git add discovery/relatorios.py discovery/tests/test_relatorios.py
git commit -m "feat: renderização dos relatórios markdown do discovery"
```

---

### Task 5: `handshake.py` — Etapa 0

**Files:**
- Create: `discovery/handshake.py`

- [ ] **Step 1: Escrever `discovery/handshake.py` completo**

```python
"""Etapa 0 do Discovery — versão do Odoo, protocolos disponíveis, auth."""
import json
import os

from discovery.odoo_client import client_from_env, OdooError

OUTPUT_DIR = "discovery/output"


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    client = client_from_env()
    client.connect()

    versao = client.version()
    uid = client.authenticate()
    json2 = client.probe_json2()

    # Confirma leitura nos modelos meta necessários para o censo.
    try:
        client.execute_kw("ir.model", "search_count", [[]])
        ir_model_ok = True
    except OdooError:
        ir_model_ok = False

    server_serie = versao.get("server_serie", "")
    resultado = {
        "server_version": versao.get("server_version"),
        "server_serie": server_serie,
        "protocol_version": versao.get("protocol_version"),
        "uid": uid,
        "xmlrpc": True,
        "json2_endpoint_responde": json2,
        "json2_por_versao": server_serie >= "19.0",
        "ir_model_legivel": ir_model_ok,
    }

    caminho = os.path.join(OUTPUT_DIR, "handshake.json")
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(resultado, f, indent=2, ensure_ascii=False)

    print(f"Odoo {resultado['server_version']} (série {server_serie}) — uid {uid}")
    print(f"JSON/2 endpoint responde: {json2} | ir.model legível: {ir_model_ok}")
    print(f"Saída: {caminho}")

    if not ir_model_ok:
        raise SystemExit(
            "ERRO: o usuário não tem leitura em ir.model — o censo não pode rodar. "
            "Solicitar permissão à Tauga."
        )


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Verificar que compila**

Run: `cd discovery && .venv/bin/python -m py_compile handshake.py`
Expected: sem saída.

- [ ] **Step 3: Commit**

```bash
git add discovery/handshake.py
git commit -m "feat: etapa 0 do discovery — handshake"
```

---

### Task 6: `censo.py` — Etapa A

**Files:**
- Create: `discovery/censo.py`

- [ ] **Step 1: Escrever `discovery/censo.py` completo**

```python
"""Etapa A do Discovery — inventário completo dos modelos do Odoo."""
import json
import os
import xmlrpc.client

from discovery.odoo_client import client_from_env, is_access_error
from discovery.classificacao import classificar_tipo, area_de_negocio
from discovery.relatorios import render_censo_md

OUTPUT_DIR = "discovery/output"


def coletar(client) -> list:
    """Lê ir.model e, para cada modelo persistente, obtém a contagem."""
    registros = client.execute_kw(
        "ir.model", "search_read", [[]],
        {"fields": ["model", "name", "modules", "transient"]},
    )
    modelos = []
    for r in registros:
        tipo = classificar_tipo(r)
        item = {
            "model": r["model"],
            "name": r["name"],
            "modules": r.get("modules") or "",
            "tipo": tipo,
            "area": area_de_negocio(r["model"]),
            "acesso": "ok",
            "registros": None,
        }
        if tipo == "persistente":
            try:
                item["registros"] = client.execute_kw(
                    r["model"], "search_count", [[]]
                )
            except xmlrpc.client.Fault as exc:
                item["acesso"] = "sem-acesso" if is_access_error(exc) else "contagem-falhou"
            except Exception:
                item["acesso"] = "contagem-falhou"
        modelos.append(item)
    return modelos


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    client = client_from_env()
    client.connect()
    client.authenticate()

    modelos = coletar(client)
    resumo = {
        "total": len(modelos),
        "sem_acesso": sum(1 for m in modelos if m["acesso"] == "sem-acesso"),
        "sem_contagem": sum(1 for m in modelos if m["acesso"] == "contagem-falhou"),
    }

    with open(os.path.join(OUTPUT_DIR, "censo.json"), "w", encoding="utf-8") as f:
        json.dump({"resumo": resumo, "modelos": modelos}, f, indent=2, ensure_ascii=False)
    with open(os.path.join(OUTPUT_DIR, "censo.md"), "w", encoding="utf-8") as f:
        f.write(render_censo_md(modelos, resumo))

    print(f"Censo: {resumo['total']} modelos | "
          f"{resumo['sem_acesso']} sem acesso | "
          f"{resumo['sem_contagem']} sem contagem")
    print(f"Saídas: {OUTPUT_DIR}/censo.json e censo.md")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Verificar que compila**

Run: `cd discovery && .venv/bin/python -m py_compile censo.py`
Expected: sem saída.

- [ ] **Step 3: Commit**

```bash
git add discovery/censo.py
git commit -m "feat: etapa A do discovery — censo de modelos"
```

---

### Task 7: `mapa_profundo.py` — Etapa B

**Files:**
- Create: `discovery/mapa_profundo.py`

- [ ] **Step 1: Escrever `discovery/mapa_profundo.py` completo**

```python
"""Etapa B do Discovery — mapeamento profundo dos modelos de camada2.json."""
import json
import os
import xmlrpc.client

from discovery.odoo_client import client_from_env, is_access_error
from discovery.classificacao import campos_temporais, veredito_aptidao_delta
from discovery.relatorios import render_mapa_profundo_md

OUTPUT_DIR = "discovery/output"
MODELOS_DIR = os.path.join(OUTPUT_DIR, "modelos")
CAMADA2 = "discovery/camada2.json"


def ler_lista_modelos() -> list:
    if not os.path.exists(CAMADA2):
        raise SystemExit(
            f"ERRO: {CAMADA2} não encontrado. Gere-o no checkpoint (Task 10)."
        )
    with open(CAMADA2, encoding="utf-8") as f:
        return json.load(f)["modelos"]


def mapear_modelo(client, model: str) -> dict:
    fields = client.execute_kw(model, "fields_get", [], {})
    temporais = campos_temporais(fields)

    campos = [
        {
            "nome": nome,
            "tipo": meta.get("type"),
            "rotulo": meta.get("string"),
            "relacao": meta.get("relation"),
            "obrigatorio": meta.get("required", False),
            "somente_leitura": meta.get("readonly", False),
        }
        for nome, meta in sorted(fields.items())
    ]

    amostra = client.execute_kw(
        model, "search_read", [[]],
        {"limit": 8, "order": "id desc"},
    )

    ordenacao_ok = False
    if temporais["write_date"]:
        try:
            client.execute_kw(
                model, "search", [[]], {"limit": 5, "order": "write_date desc"}
            )
            ordenacao_ok = True
        except Exception:
            ordenacao_ok = False

    veredito = veredito_aptidao_delta(temporais["write_date"], ordenacao_ok)

    return {
        "model": model,
        "campos": campos,
        "campos_temporais": temporais,
        "veredito_delta": veredito,
        "qtd_amostra": len(amostra),
        "amostra": amostra,
    }


def main():
    os.makedirs(MODELOS_DIR, exist_ok=True)
    client = client_from_env()
    client.connect()
    client.authenticate()

    lista = ler_lista_modelos()
    detalhados = []
    for model in lista:
        try:
            dados = mapear_modelo(client, model)
        except xmlrpc.client.Fault as exc:
            motivo = "sem-acesso" if is_access_error(exc) else "erro"
            print(f"  {model}: {motivo} — pulado")
            continue
        with open(os.path.join(MODELOS_DIR, f"{model}.json"), "w", encoding="utf-8") as f:
            json.dump(dados, f, indent=2, ensure_ascii=False, default=str)
        detalhados.append(dados)
        print(f"  {model}: {len(dados['campos'])} campos | delta {dados['veredito_delta']}")

    with open(os.path.join(OUTPUT_DIR, "mapa-profundo.md"), "w", encoding="utf-8") as f:
        f.write(render_mapa_profundo_md(detalhados))

    print(f"Mapa profundo: {len(detalhados)}/{len(lista)} modelos mapeados.")
    print(f"Saídas: {MODELOS_DIR}/*.json e {OUTPUT_DIR}/mapa-profundo.md")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Verificar que compila**

Run: `cd discovery && .venv/bin/python -m py_compile mapa_profundo.py`
Expected: sem saída.

- [ ] **Step 3: Rodar a suíte de testes completa**

Run: `discovery/.venv/bin/python -m pytest discovery/tests/ -v` (a partir da raiz)
Expected: PASS — 9 testes (7 de classificação + 2 de relatórios).

- [ ] **Step 4: Commit**

```bash
git add discovery/mapa_profundo.py
git commit -m "feat: etapa B do discovery — mapa profundo"
```

---

### Task 8: `README.md` e runbook

**Files:**
- Create: `discovery/README.md`
- Create: `docs/runbooks/discovery-odoo.md`

- [ ] **Step 1: Escrever `discovery/README.md`**

````markdown
# Discovery do Odoo Tauga

Scripts de mapeamento do Odoo. Rodam localmente, sob demanda.

## Pré-requisitos

1. `.env.local` na raiz do projeto com `ODOO_URL`, `ODOO_DB`,
   `ODOO_USERNAME`, `ODOO_PASSWORD` preenchidos com valores reais.
2. Ambiente Python:

   ```bash
   cd discovery
   python3 -m venv .venv
   .venv/bin/pip install -r requirements.txt
   ```

## Ordem de execução

Sempre rodar a partir da raiz do projeto, como módulo:

```bash
# Etapa 0 — handshake
discovery/.venv/bin/python -m discovery.handshake | tee discovery/output/discovery.log

# Etapa A — censo
discovery/.venv/bin/python -m discovery.censo | tee -a discovery/output/discovery.log

# >>> CHECKPOINT: revisar output/censo.md e gerar discovery/camada2.json <<<

# Etapa B — mapa profundo
discovery/.venv/bin/python -m discovery.mapa_profundo | tee -a discovery/output/discovery.log
```

O `tee` grava o registro persistente em `output/discovery.log` sem código extra.

## camada2.json

Gerado no checkpoint. Formato:

```json
{ "modelos": ["pedido.documento", "estoque.saldo.hoje", "..."] }
```

## Saídas

Tudo em `discovery/output/` (gitignored): `handshake.json`, `censo.json`,
`censo.md`, `modelos/<modelo>.json`, `mapa-profundo.md`, `discovery.log`.

## Testes

```bash
# a partir da raiz do projeto
discovery/.venv/bin/python -m pytest discovery/tests/ -v
```
````

- [ ] **Step 2: Escrever `docs/runbooks/discovery-odoo.md`**

```markdown
# Runbook — Discovery do Odoo

Procedimento operacional do F0. O resumo dos achados é preenchido após a
execução (Task 11).

## Como executar

Ver `discovery/README.md` para pré-requisitos e ordem de execução.

## Etapas

1. **Handshake** — confirma versão do Odoo e protocolos. Se `ir.model` não
   for legível, parar e solicitar permissão à Tauga.
2. **Censo** — inventário de modelos. Revisar `output/censo.md`.
3. **Checkpoint** — classificar modelos por área, decidir a lista da Camada 2
   (gravar em `discovery/camada2.json`) e o protocolo do worker (F2).
4. **Mapa profundo** — detalha os modelos selecionados.

## Achados (preenchido na Task 11)

- Versão do Odoo Tauga: _a preencher_
- Protocolo recomendado para o worker (F2): _a preencher_
- Total de modelos / sem acesso: _a preencher_
- Modelos da Camada 2 e veredito de aptidão delta: _a preencher_
```

- [ ] **Step 3: Commit**

```bash
git add discovery/README.md docs/runbooks/discovery-odoo.md
git commit -m "docs: README do discovery e runbook do F0"
```

---

## PARTE 2 — Execução do Discovery

> Estas tarefas **executam** os scripts contra o Odoo real. Requerem o
> `.env.local` preenchido com a senha verdadeira. A Task 10 é o checkpoint
> humano — não é código.

### Task 9: Executar handshake e censo

- [ ] **Step 1: Confirmar `.env.local`**

Garantir que `.env.local` na raiz tem `ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`
e `ODOO_PASSWORD` com valores reais. (O usuário fornece a senha.)

- [ ] **Step 2: Rodar o handshake**

Run: `discovery/.venv/bin/python -m discovery.handshake`
Expected: imprime versão do Odoo e uid; cria `discovery/output/handshake.json`.
Se `ir.model` não for legível, o script aborta — escalar para o usuário.

- [ ] **Step 3: Rodar o censo**

Run: `discovery/.venv/bin/python -m discovery.censo`
Expected: cria `discovery/output/censo.json` e `censo.md`; imprime o resumo.

- [ ] **Step 4: Commit dos scripts (saídas NÃO são commitadas — gitignored)**

Nada a commitar se a Parte 1 já foi commitada. Verificar com `git status` que
`discovery/output/` não aparece (deve estar ignorado).

---

### Task 10: Checkpoint — gerar `camada2.json`

> Checkpoint humano. Não há código de produto aqui.

- [ ] **Step 1: Revisar o censo**

Abrir `discovery/output/censo.md`. Classificar os modelos por área de negócio
(RH, comissões, financeiro, estoque, contratos, empresas, usuários, vendas,
fiscal). Apresentar ao usuário.

- [ ] **Step 2: Decidir a lista da Camada 2 e o protocolo do worker**

Com o usuário: definir quais modelos entram no mapa profundo e se o worker
(F2) usará XML-RPC ou JSON/2 (com base no `handshake.json`).

- [ ] **Step 3: Criar `discovery/camada2.json`**

```json
{ "modelos": ["pedido.documento", "sped.documento.item", "estoque.saldo.hoje"] }
```
(Conteúdo real definido no checkpoint.)

- [ ] **Step 4: Commit**

```bash
git add discovery/camada2.json
git commit -m "chore: lista de modelos da Camada 2 do discovery"
```

---

### Task 11: Executar mapa profundo e consolidar achados

- [ ] **Step 1: Rodar o mapa profundo**

Run: `discovery/.venv/bin/python -m discovery.mapa_profundo`
Expected: cria `discovery/output/modelos/*.json` e `mapa-profundo.md`.

- [ ] **Step 2: Preencher o runbook com os achados**

Editar `docs/runbooks/discovery-odoo.md`, seção "Achados": versão do Odoo,
protocolo recomendado, total de modelos, e a tabela de modelos da Camada 2
com o veredito de aptidão delta de cada um. **Sanitizado** — só estrutura,
sem dados de clientes.

- [ ] **Step 3: Commit**

```bash
git add docs/runbooks/discovery-odoo.md
git commit -m "docs: consolida achados do discovery no runbook"
```

- [ ] **Step 4: Verificação final**

Confirmar os critérios de sucesso da spec (§10): handshake com versão, censo
completo, `camada2.json` gerado, mapa profundo cobrindo 100% dos selecionados,
nenhuma credencial ou dado de cliente commitado (`git log --stat` e revisar).

---

## Self-Review

**Cobertura da spec:**
- §4.1 Handshake → Task 5 + Task 9.
- §4.2 Censo → Task 6 + Task 9.
- §4.3 Checkpoint → Task 10.
- §4.4 Mapa profundo → Task 7 + Task 11.
- §5 Estrutura de arquivos → Tasks 1–8.
- §6 Decisões técnicas → Task 1 (deps), Task 2 (xmlrpc), Task 7 (camada2.json).
- §7 Error handling/throttle/log → Task 2 (retry, throttle no `OdooClient`).
- §8 Segurança → `.gitignore` já cobre `output/`; verificação na Task 11.
- §9 Entregáveis → Tasks 1–8 (scripts), Task 8 + Task 11 (runbook).
- §10 Critérios de sucesso → Task 11 Step 4.
- §11 Riscos → tratados: handshake aborta sem `ir.model`; censo marca `sem-acesso`.

**Logging (§7):** os scripts imprimem progresso e erros no terminal; o
registro persistente em `discovery/output/discovery.log` é obtido via `tee`
na linha de comando (ver `README.md`, Task 8) — sem `FileHandler` dedicado,
coerente com a §7 da spec para uma ferramenta de uso pontual.

**Placeholder scan:** sem TBD/TODO em código. O `camada2.json` (Task 10) e os
"Achados" do runbook (Task 11) são preenchidos em runtime por natureza — não
são placeholders de plano.

**Consistência de tipos:** `OdooClient.execute_kw`, `is_access_error`,
`client_from_env` usados de forma consistente nas Tasks 5–7. Funções de
`classificacao.py` e `relatorios.py` chamadas com as assinaturas definidas
nas Tasks 3 e 4.
