# 07 , Decisões do usuário (2026-07-07) , CANÔNICAS

Respostas às pendências do dossiê. Passam a valer como decisão fechada.

1. **Produto com mais demanda = por QUANTIDADE** (soma de unidades), não por valor.
   (Demanda em valor R$ segue existindo como total; o RANKING de produto é por qtd.)

2. **Demanda consolidada por GRUPO e também por EMPRESA.** O padrão é o total
   consolidado do grupo; a tool/relatório precisa saber responder por empresa
   quando pedido. O Agente Nex deve, na resposta, **sugerir os cortes** ("quer que
   eu separe por empresa? por cliente?"), avaliando o que faz sentido no momento e
   oferecendo nos follow-ups. Vale também para cliente/vendedor quando fizer sentido.

3. **Peças ENTRAM no faturamento de venda** (Venda de Peças é venda real). Incluir
   `Venda de Peças` e o subfluxo de peças (`Emite NF - Peças`) como venda.

4. **Venda Futura (CFOP 5922/6922) , REVISADO (2026-07-08, decisão do usuário):**
   - **Faturamento:** a receita é reconhecida **na REMESSA (x117: 5117/6117)**, NÃO na
     emissão da nota de simples faturamento (5922/6922) , escolha contábil que evita
     contar a mesma venda duas vezes. As notas 5922/6922 ficam FORA do faturamento
     (`is_venda_externa=false`). [Antes o dossiê propunha contar na emissão; o código
     já reconhecia no x117 e o usuário confirmou manter assim em 2026-07-08.]
   - **Estoque/demanda:** por padrão a venda futura já faturada **NÃO** é reservada no
     estoque disponível (segue como disponível). Pendente de definição da Mariane (ver
     `09-PERGUNTA-MARIANE-VENDA-FUTURA.md`).
   - **ENGATILHADO:** ambos os pontos são um toggle em
     `src/lib/fiscal/regras/venda-futura-policy.ts` (`RECONHECE_FATURAMENTO_NA_EMISSAO`
     e `RESERVA_ESTOQUE_ATE_REMESSA`, padrão `false`). Basta trocar a flag para mudar,
     que propaga para Nex + relatórios + diretoria.

5. **Buckets de etapa "(confirmar)":** o Claude resolve por conta própria cruzando
   os gatilhos (`finaliza_faturamento`/`finaliza_pedido_confirmando`/
   `finaliza_estoque`) e o histórico real; só leva à Mariane se sobrar dúvida real.
   Não é bloqueante.

6. **Autorização de construção:** o usuário liberou construir os fatos e tools
   necessários. Seguir a metodologia do projeto (SPEC v1→v3, PLAN, execução TDD,
   E2E contra o dado real). Tudo LOCAL; merge para `main` só com "sim" explícito
   (merge dispara deploy de produção).
