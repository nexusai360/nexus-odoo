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

## Achados — execução de 2026-05-15

### Servidor e protocolo

- **Versão do Odoo Tauga: 17.0.** Instância customizada com forte camada
  SPED brasileira (`/home/grupojht/base/padrao/odoo`).
- **Protocolo para o worker (F2): JSON-RPC** (`POST /jsonrpc`).
  - XML-RPC **não serve**: o Odoo serializa as respostas com
    `allow_none=False` e o `fields_get` de modelos SPED customizados contém
    metadados `None` — a chamada quebra com `TypeError: cannot marshal None`.
  - JSON/2 (Odoo 19+) **não existe** no 17.0.
  - JSON-RPC funciona, serializa `None` como `null`, e é estável no 17.0.

### Censo

- **650 modelos** no total. 118 sem acesso para o usuário atual
  (`joaozanini`), 20 sem contagem (timeout).
- Áreas dominantes: Fiscal (`sped.*`, 254 modelos), Financeiro (`finan.*`),
  Estoque (`estoque.*`), Vendas/Pedidos (`pedido.*`), Cadastros.
- Modelos mais volumosos: `sped.documento.item` (211k), `sped.documento`
  (3,7k — os documentos fiscais/NF-e), `estoque.extrato` (13k),
  `finan.lancamento.item` (7,8k).
- **RH e comissões:** não há modelos dedicados visíveis no censo acessível —
  esta instância não usa o módulo de RH do Odoo, e comissão não aparece como
  modelo próprio. A confirmar com a Tauga se forem requisito de relatório.

### Camada 2 — 37 modelos mapeados

Todos os 37 modelos selecionados tiveram a estrutura (campos) capturada.
**36 aptos a delta** via `write_date`; 1 em "verificar"
(`sped.produto.variante` — é uma view de banco, sem `write_date` confiável).

**2 modelos com amostra de dados vazia** (estrutura OK, dados não lidos):
- `pedido.documento` (1094 campos) — um campo armazenado referencia
  `chamado.mensagem`, modelo restrito ao grupo Chamado/Contratos.
- `res.users` (344 campos) — campo referencia `res.users.log`, restrito a
  Administração.

### Implicações para as próximas fases

- **F2 (worker):** usar **JSON-RPC**. Para `pedido.documento` — modelo-núcleo
  de pedidos — a leitura de registros falha ao incluir o campo relacional de
  `chamado.mensagem`; o worker deve **selecionar explicitamente os campos
  relevantes** (não usar `fields` vazio) ou obter da Tauga uma credencial com
  mais permissão. O mesmo vale para os 118 modelos `sem-acesso` do censo, se
  algum deles vier a ser necessário.
- **F2 (delta):** `write_date` é utilizável como cursor de sincronização em
  36 dos 37 modelos — o polling delta é viável.
- Detalhe de campos, relações e amostras por modelo:
  `discovery/output/modelos/<modelo>.json` e `output/mapa-profundo.md`
  (não versionados — contêm dados reais).
