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
