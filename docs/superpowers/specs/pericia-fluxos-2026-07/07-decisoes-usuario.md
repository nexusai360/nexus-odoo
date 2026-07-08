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

4. **Venda Futura (CFOP 5922/6922) , decisão do Claude (delegada pelo usuário):**
   - **Faturamento:** conta **na emissão da nota de simples faturamento** (5922/6922).
     A remessa de entrega futura posterior NÃO conta de novo (evita duplicar receita).
   - **Estoque/demanda:** a mercadoria segue comprometida até a saída física, então
     **sai do estoque disponível** (tratada como reservada) até a remessa de entrega
     futura. Revisável se a Mariane enxergar diferente.

5. **Buckets de etapa "(confirmar)":** o Claude resolve por conta própria cruzando
   os gatilhos (`finaliza_faturamento`/`finaliza_pedido_confirmando`/
   `finaliza_estoque`) e o histórico real; só leva à Mariane se sobrar dúvida real.
   Não é bloqueante.

6. **Autorização de construção:** o usuário liberou construir os fatos e tools
   necessários. Seguir a metodologia do projeto (SPEC v1→v3, PLAN, execução TDD,
   E2E contra o dado real). Tudo LOCAL; merge para `main` só com "sim" explícito
   (merge dispara deploy de produção).
