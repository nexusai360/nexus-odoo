# 03 , Classificação de DEMANDA EM ABERTA e FATURAMENTO DE VENDA REAL

> **CORREÇÃO (2026-07-07, pós-review):** o §5 abaixo manda "excluir SIMPLES
> FATURAMENTO futuro" do faturamento. Decisão canônica revista (07 #4 + SPEC v2):
> a nota de simples faturamento de venda futura (CFOP 5922/6922) ENTRA no
> faturamento (na emissão); a REMESSA de entrega futura posterior é que sai (evita
> duplicar). Além disso, `isVendaExterna` deve filtrar por `modelo IN ('55','65')`,
> `finalidade_nfe NOT IN ('4')`, classificação por CFOP/`natureza_operacao_id` (não
> substring), e intragrupo por join `fato_parceiro.documento_digits` (não regex no
> nome). Ver SPEC v2 §3.

## 1. Definição de negócio (Mariane + usuário)
- **Demanda em aberta** = pedido de **venda a cliente final** que foi **aprovado**
  e **ainda não teve a NF de venda ao consumidor final emitida**. Cobre todo o
  caminho: Aprovado → Input financeiro → Gera boleto → Reserva/Fracionamento →
  Separação → Confirma movimentação → (antes de) Emite NF Consumidor Final.
- **Sai da demanda** quando a etapa emite a NF de venda ao cliente final
  (`Emite NF Consumidor Final` e equivalentes por regime/venda futura).

## 2. Motor de classificação da demanda (determinístico, sem lista de nomes à mão)
Um pedido está em **DEMANDA ABERTA** quando, cumulativamente:
1. `classificaOperacao(...)` = VENDA_EXTERNA (venda a cliente final; peças/venda
   futura conforme decisão pendente) , exclui transferência, remessa, bonificação,
   demonstração, armazenagem, produção, inventário, compra, devolução, intragrupo;
2. o pedido **já passou pela aprovação** (existe `data_aprovacao`, ou passou por
   etapa com `aprova_pedido=true` no histórico);
3. a **etapa ATUAL não é terminal de venda** , NÃO tem `finaliza_faturamento=true`
   de emissão ao consumidor final NEM `finaliza_pedido_confirmando=true`;
4. **não** está cancelada (`finaliza_pedido_cancelando=true`).

**DEMANDA FECHADA** = passou pela etapa que emite a NF de venda ao cliente final.

**EXCEÇÃO 1 (conta como aberta mesmo com NF):** etapa `Nota emitida e não
entregue.` (a observação da própria etapa no Odoo diz: "Foi emitido nota fiscal
por alguma necessidade e a mercadoria ainda precisa ser entregue e constar
demanda"). Regra: se a etapa atual é essa, força DEMANDA ABERTA.

**EXCEÇÃO 2 (nota sem movimento de estoque, conta como aberta):** às vezes emitem
NF só para o banco/cliente destravar algo, **sem movimentar estoque** (gambiarra,
rara). Regra: se a nota/pedido não teve `finaliza_estoque=true` (estoque não
confirmado) OU não há linha em `fato_estoque_movimento`, tratar como aberta e não
contar como venda finalizada. Detectável via flags de estoque do pedido
(`estoque_iniciado/estoque_finalizado` em `raw_pedido_documento`) e
`fato_estoque_movimento`.

## 3. Por que NÃO usar `vr_nf` (o erro do plano antigo)
No dado real quase todo pedido tem `vr_nf>0`, inclusive claramente abertos:
`Aprovado` (32/32 com vr_nf>0), `Input financeiro` (54/54), `GERA BOLETO`
(136/136), `Fracionar` (70/70). `vr_nf` no `fato_pedido` é valor faturável, não
prova de emissão. **Descartar `vr_nf=0` como critério.** Usar etapa + gatilho.

## 4. Buckets das etapas em uso (aplicando o motor)
> Preliminar; as `(confirmar)` dependem do mapa fino da Mariane.

**A) ABERTA (venda externa, aprovado, sem NF ao cliente):** Aprovado,
Aprovação dono, Aprovação diretoria, Input financeiro, GERA BOLETO, Reserva de
Estoque - DEFINE ARMAZEM, Reserva de Estoque - CONFIRMA MOVIMENTAÇÃO, SEPARAÇÃO
ESTOQUE CONCLUIDO, Fracionar, Novo Fracionamento, Fracionamento concluído, FAT
Cliente final, VF - Fat Cliente Final (Real/Presumido/Simples), VF - Input
Financeiro, VF - SEGUIR COM RESERVA/FRACIONAMENTO, Nota emitida e não entregue.
(exceção 1).

**B) FECHADA (NF de venda ao cliente emitida):** Emite NF Consumidor Final,
VF - Emite NF, Emite NF - Peças (confirmar), Gera Boleto - Peças (confirmar).

**C) IGNORAR (não é venda a cliente externo):**
- Pré-aprovação/cotação: Venda direta consumidor final, Aguardando Autorização,
  Em cotação/provisório, EM ANÁLISE.
- Triangulação intragrupo: FAT JDS x GRUPO, FAT JDS X GRUPO CONFIRMA, TRANSF
  LP/LR Matriz-Filial, FAT TRANSF CONFIRMA, Transf. DF x Sergipe (Preview/confirma),
  Retorno transferência SERGIPE x DF, [SMARTFIT] FAT JDS X GRUPO.
- Simples Remessa: Pedido/Preview/Emite NF - SIMPLES REMESSA.
- Bonificação: REMESSA/PREVIEW/EMITE NF BONIFICAÇÃO, BONIFICAÇÃO RESERVA/CONFIRMA.
- Armazenagem: Remessa de Armazenagem, ESTOQUE ARMAZENAGEM RESERVA, Armazenagem -
  NF (CONFIRMA), Retorno de Armazenagem, AJUSTE FRACIONADO ARMAZENAGEM.
- Demonstração: Pedido demonstração, Reserva/Preview/Demonstração confirma,
  Retorno Demonstração, Emite NF Retorno Demo, (DEMO) TRANSF/MOV/CONFIRMA.
- Transferência (todos), Produção (Aguardando montagem, Em montagem, Concluída),
  Inventário (Em contagem, Em conferência, Confirmado), Compra (Em cotação,
  Aguardando autorização, Aprovado[compra]), Devolução, Garantia, Exposição/feira.
- Cancelados: Cancelado/Cancelada (qualquer tipo).

## 5. Faturamento de VENDA REAL (fato_nota_fiscal)
Uma nota entra no faturamento de venda quando, cumulativamente:
- `entrada_saida = '1'` (saída);
- `situacao_nfe` autorizada (excluir cancelada/denegada , validar domínio real);
- `natureza_operacao_nome` de **VENDA** (excluir TRANSFERENCIA, REMESSA,
  DEMONSTRACAO, DEVOLUCAO, BONIFICACAO, SIMPLES FATURAMENTO futuro, conserto,
  garantia, armazém);
- participante **externo** (CNPJ base fora do grupo);
- (por caso) houve movimento de estoque real.

Evidência do problema: notas de saída no cache misturam VENDA, TRANSFERENCIA
(intragrupo, centenas), REMESSA DEMONSTRACAO, DEVOLUCAO, BONIFICACAO, SIMPLES
FATURAMENTO. Somar tudo infla o faturamento (foi o exemplo das 15 notas do dia:
só as de venda contam; triangulação e transferência entram no bruto e precisam
sair). Consolidar num helper `isVendaExterna(nota)` reusado em toda a plataforma.

## 6. Contadores de referência (fotografia atual, para validar depois)
`fato_pedido` = 2316; `(venda)` = 1276; `Emite NF Consumidor Final` = 581 pedidos.
Ao construir a tool, o total de demanda aberta deve bater com um SELECT manual
aplicando o motor (E2E obrigatório).
