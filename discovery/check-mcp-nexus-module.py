#!/usr/bin/env python3
"""
Bloco A Task A9: verifica se o módulo 'mcp_nexus' está livre em ir.model.data
no Odoo Tauga (base de teste) antes de a F4 Onda 2 começar a usá-lo para
registrar external_ids de partners criados via MCP.

Uso:
    export ODOO_WRITE_URL=https://grupojht.teste.tauga.online
    export ODOO_WRITE_DB=grupojht_teste
    export ODOO_WRITE_USER=<from-vault>
    export ODOO_WRITE_PASSWORD=<from-vault>
    python3 discovery/check-mcp-nexus-module.py

Saída esperada:
- Exit 0 + mensagem "OK: mcp_nexus livre" → seguir com module="mcp_nexus".
- Exit 1 + mensagem "OCUPADO: ..." + listagem dos registros → escolher alternativa
  ('nexus_mcp_external' por exemplo).
"""

import os
import sys

try:
    import odoorpc  # type: ignore
except ImportError:
    print("ERROR: odoorpc não instalado. Rode: pip install odoorpc", file=sys.stderr)
    sys.exit(2)


def main() -> int:
    url = os.environ.get("ODOO_WRITE_URL")
    db = os.environ.get("ODOO_WRITE_DB")
    user = os.environ.get("ODOO_WRITE_USER")
    pw = os.environ.get("ODOO_WRITE_PASSWORD")

    missing = [n for n, v in [
        ("ODOO_WRITE_URL", url), ("ODOO_WRITE_DB", db),
        ("ODOO_WRITE_USER", user), ("ODOO_WRITE_PASSWORD", pw),
    ] if not v]
    if missing:
        print(f"ERROR: ENVs ausentes: {', '.join(missing)}", file=sys.stderr)
        return 2

    # Extrai host:port do URL (https://host)
    host = url.replace("https://", "").replace("http://", "").rstrip("/")
    is_ssl = url.startswith("https://")

    print(f"Conectando em {host} (SSL={is_ssl}) DB={db} USER={user}...")
    odoo = odoorpc.ODOO(host, protocol="jsonrpc+ssl" if is_ssl else "jsonrpc", port=443 if is_ssl else 80)
    odoo.login(db, user, pw)
    print(f"Autenticado como uid={odoo.env.uid}")

    Records = odoo.env["ir.model.data"]
    ids = Records.search([("module", "=", "mcp_nexus")], limit=10)
    if not ids:
        print("OK: módulo 'mcp_nexus' está LIVRE em ir.model.data — pode usar.")
        return 0
    else:
        print(f"OCUPADO: encontrados {len(ids)} registros com module='mcp_nexus':")
        rows = Records.read(ids, ["name", "model", "res_id"])
        for r in rows:
            print(f"  - {r['name']} (modelo={r['model']}, res_id={r['res_id']})")
        print("\nEscolha alternativa: 'nexus_mcp_external', 'mcp_nexusai360', etc.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
