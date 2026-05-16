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
# Garante o diretório de saída antes do tee
mkdir -p discovery/output

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
