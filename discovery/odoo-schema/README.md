# Snapshot do schema do Odoo da Tauga

Capturado em **2026-05-28** via exportacao manual de 11 telas da
**Administracao → Estrutura do banco de dados** do Odoo da Tauga
(`grupojht.tauga.online`).

## Conteudo

- `raw/` (5 MB) — 11 xlsx exportados pela UI do Odoo.
- `normalized/` (gerado) — cada xlsx convertido para JSON. Nao versionado.
- `schema.json` (108 KB) — visao consolidada por modelo: nome tecnico,
  descricao, type, transient, campos (com tipo/label/relation), contagem de
  xml_ids. Indexado por modelo.
- `stats.json` — estatisticas (prefixos, tipos de campo, totais).
- `ingest.py` — converte raw → normalized + schema.json + stats.json.
- `audit.py` — cruza schema.json × prisma/schema.prisma × mcp/tools.
  Saida em `docs/discovery/2026-05-28-gap-odoo-mcp.md`.

## Reproduzir do zero

```bash
# Pre-requisito: openpyxl
pip3 install openpyxl

# Gera normalized/, schema.json e stats.json
python3 ingest.py

# Gera o relatorio de gap
python3 audit.py
```

## Numeros (snapshot)

- **Modelos:** 652
- **Campos:** 36.532
- **Selections:** 6.368
- **XML IDs:** 106.899
- **Sequences:** 73
- **Crons:** 38

Customizacao da Tauga (nao-padrao Odoo): `sped.*` 256, `finan.*` 44,
`contabil.*` 29, `pedido.*` 26, `estoque.*` 16, `relatorio.*` 19.

## Como o roadmap usa esse snapshot

`docs/superpowers/specs/2026-05-28-roadmap-cobertura-completa-odoo.md` (§3)
define 3 baldes (A com dado, B legitimo vazio, C inutil tecnico). O
Sub-projeto R2 (Discovery enxuto) extende este snapshot com chamadas
`search_count` JSON-RPC contra a Tauga e produz a classificacao final.
