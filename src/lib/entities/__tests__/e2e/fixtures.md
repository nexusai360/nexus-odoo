# Fixtures E2E (Bloco G) , ancorados no cache real nexus_odoo_l1 (2026-06-07)

> Cada resolvedor exercido contra o banco real (`nexus-odoo-db-1`). 1 caso unica
> (chave forte), 1 ambigua (nome/descricao com N>1 linhas) e 1 nenhuma por entidade.
> Roda com `set -a; . ./.env.local; set +a; E2E=1 npx jest src/lib/entities/__tests__/e2e/resolvers.e2e.test.ts`.

| Entidade | unica (chave forte) | ambigua (N>1) | nenhuma |
|---|---|---|---|
| Armazem | nome_unico "proprio" => odoo_id=1; id 1 => odoo_id=1 | (sem ambiguidade natural; cardinalidade baixa, documentado) | "inexistente-xyz"; codigo longo `7891234567895` (CS4) |
| Produto | codigo_unico "964" => odoo_id=1 | nome "CARENAGEM DO CROSS LONG LIFE" (3 linhas) | EAN `9999999999999` inexistente (CS4, nunca fuzzy) |
| Nota Fiscal | chave `41260304028797000196550040000007371694680452` => odoo_id=43213 | (chave e unica por NF; sem ambigua) | chave 50 digitos; id `999999999` |
| Conta Contabil | codigo "1.1.1" => odoo_id=6; "1.1" => odoo_id=5 | nome "COMPENSAÇÃO ATIVA" (5 linhas) | codigo "9.9.9.9.9" |
| Conta Referencial | codigo unico "3.01.01.05.01.47" => odoo_id=2214 | codigo "1.01" duplicado (odoo_id 2 e 1104) => ambigua criterio codigo | codigo "9.99.99" |
| Pedido | numero "DV-0001/26" => odoo_id=45 | (numero unico no cache; sem ambigua natural) | "pedido 123" (fora do formato); "ZZ-9999/99" |
| Natureza Operacao | codigo "001" => "VENDA DE MERCADORIA ADQUIRIDA OU RECEBIDA DE TERCEIROS" | descricao "DEVOLUÇÃO" (N>1) | codigo "999" |
| Centro Resultado | id 1 => "Logística - Logística"; nome fuzzy "Logística - Logística" => odoo_id=1 | (sem 2 nomes quase-iguais; ambigua nao natural) | id "9999999" |
| Parceiro | doc 3 formatos de digits `00000000584401` (odoo_id=13585): `BR-00.000.000/5844-01`, `00.000.000/5844-01`, `00000000584401` (CS5) | nome "Smartfit" (73 linhas) | doc `99999999999999` |

## Invariantes provados
- **CS5 (parceiro, 3 formatos):** os 3 formatos do CNPJ normalizam para o mesmo `documentoDigits` e retornam o MESMO odoo_id (prova o backfill do Bloco C).
- **CS4 (produto/armazem):** codigo numerico longo inexistente => `nenhuma`, nunca fuzzy de substring.
- **Namespace (natureza):** `codigo` e string em `fato_referencia`; ref "1" NAO retorna a entidade de odoo_id=1 de outra tabela (resolve so por codigo string dentro de natureza_operacao).
- **Anti-falso-positivo (conta contabil):** codigo exato "1.1" => odoo_id=5, nunca o prefixo-mais-longo "1.1.1" (odoo_id=6).

## Notas
- Parceiro com documento duplicado no cache (ambiguidade real de documento): digits `07390039000101` aparece em odoo_id 1 (JHT Brasilia Matriz) e 13766 (Matrix Fitness) => `ambigua` criterio documento. Usado no teste unitario; no E2E o caso unica usa um digits unico (`00000000584401`).
