# F4 Onda 4 , 13 read-tools restantes (precisam fix de handler)

> Gerado da investigacao dos workflows. Cada uma exige editar o HANDLER (nao so registrar formatador): ou (a) nao usa o envelope canonico (nao monta _RESPOSTA/_DESTAQUE via enriquecerEnvelope), ou (b) KPI page-scoped (soma a pagina, classe d987060). Depois do fix de handler: registrar o formatador em FORMATADORES + TOOLS_QUE_PRECISAM_FORMATADOR, remover da allowlist, E2E baseline write conferindo KPI x SELECT. Allowlist deve chegar a [].

## fiscal_carta_correcao
- callsEnriquecer=false buildsRespostaInline=false aggregatesFullSet=false
- destaqueKeys: ["totalCartas","totalDocumentos","documentoId"]
- EVIDENCIA/FIX: O handler de carta-correcao.ts NAO computa _DESTAQUE nem _agregado e NAO chama enriquecerEnvelope. Ele retorna dados crus de queryCartaCorrecao (linhas paginadas via take/skip) + _PAGINACAO. O unico numero full-set que existe hoje e dados.total / _PAGINACAO.total, que vem de prisma.fatoCartaCorrecao.count({ where }) (conjunto inteiro, NAO a pagina). SELECT confirma: SELECT count(*) FROM fato_carta_correcao = 12 (total full-set), 11 documento_id distintos. Como nao ha _DESTAQUE, o formatador real precisa que o handler passe a expor _DESTAQUE full-set. Recomendacao de correcao no handler (voce corrige): apos montar paginacao, calcular totalDocumentos full-set com prisma.fatoCartaCorrecao.findMany({ where, select: { documentoId: true }, distinct: ['documentoId'] }) .length OU um groupBy, e montar _DESTAQUE = { totalCartas: d.total, totalDocumentos: <count distinct full-set>, ...(input.documentoId != null ? { documentoId: input.documentoId } : {}) }. CRITICO: totalCartas DEVE ser d.total (count full-set), NUNCA d.linhas.length (pagina, sob LIMIT). totalDocumentos DEVE ser distinct full-set, nao distinct da pagina. Marco aggregatesFullSet=false porque hoje o handler nao monta esses agregados de _DESTAQUE; o count em si ja e full-set (correto), o que falta e expor em _DESTAQUE.
- NOTAS: ARQUETIPO: nem A nem B puro. O handler (mcp/tools/fiscal/carta-correcao.ts) e uma read-tool de LISTA simples: chama queryCartaCorrecao, embrulha com withFreshness, anexa _PAGINACAO via montarPaginacaoMeta e retorna. NAO chama enriquecerEnvelope (callsEnriquecer=false) e NAO monta _RESPOSTA inline (buildsRespostaInline=false). Hoje a tool esta em TOOLS_SEM_FORMATADOR_REAL (linha 884 de mcp/lib/responder.ts), usando fmtGenerico. Para promover a formatador real, registrar em FORMATADORES (responder.ts) com chave 'fiscal_carta_correcao' e REMOVER 'fiscal_carta_correcao' de TOOLS_SEM_FORMATADOR_REAL. ATENCAO: fiscal_carta_correcao NAO esta em TOOLS_QUE_PRECISAM_FORMATADOR, entao nao ha teste de contrato exigindo (mas o teste envelope-contract exige que TOOLS_SEM_FORMATADOR_REAL == conjunto de genericas, entao remover da lista E registrar o fmt e obrigatorio fazer junto). TEST: mcp/tools/fiscal/carta-correcao.test.ts so testa paginacao (take/skip/orderBy/_PAGINACAO), NAO asserta _RESPOSTA (respostaAssertedInTest=false). DADOS REAIS (SELECT em fato_carta_correcao): 12 cartas, 11 documento_id distintos, todas com data_autorizacao; linha mais recente = odoo_id 12, documento_id 53424, 2026-05-21, sequencia 1. Como a tool tem inputSchema com documentoId OPCIONAL (sem campo obrigatorio), baselineArgsNeeded=false (chamar sem args lista as 12). O formatador trata: estado vazio (total 0, com mensagem por-documento quando ha filtro), recorte por documento (documentoId presente em _DESTAQUE), e listagem geral (total + totalDocumentos + carta mais recente das linhas + 'Listando N'). Le linhas[0] como a mais recente porque o orderBy e dataAutorizacao desc, odooId asc (pagina 0). Sem travessao, pt-br com acentos. Tipo FormatadorCanonico (com t). Usa formatBRL nao se aplica (sem valores monetarios nesta tool); humanizeName tambem nao se aplica (sem nomes de participante, so ids e datas).

```ts
const fmtFiscalCartaCorrecao: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  // Total do CONJUNTO INTEIRO (full-set). O handler expoe via _DESTAQUE.totalCartas
  // (espelho de dados.total / _PAGINACAO.total). Fallbacks defensivos para
  // _agregado.contagem e tamanho da pagina, nesta ordem.
  const total = Number(
    d.totalCartas ?? env._agregado?.contagem ?? env.linhas?.length ?? 0,
  );
  if (total === 0) {
    const doc = d.documentoId !== undefined ? Number(d.documentoId) : undefined;
    return doc !== undefined
      ? `Nenhuma carta de correcao encontrada para o documento ${doc}.`
      : "Nenhuma carta de correcao registrada.";
  }
  const totalDocs = Number(d.totalDocumentos ?? 0);
  const exibidas = Number(env.linhas?.length ?? 0);
  const cartaPlural = total === 1 ? "carta de correcao" : "cartas de correcao";

  // Recorte por documento: o filtro documentoId esta presente.
  if (d.documentoId !== undefined) {
    const doc = Number(d.documentoId);
    return `${total} ${cartaPlural} para o documento ${doc}.`;
  }

  const partes: string[] = [`${total} ${cartaPlural} registradas`];
  if (totalDocs > 0) {
    const docPlural = totalDocs === 1 ? "documento" : "documentos";
    partes[0] += ` em ${totalDocs} ${docPlural}`;
  }
  partes[0] += ".";

  // Carta mais recente do conjunto (linhas vem ordenada data desc na pagina 0).
  const top = env.linhas?.[0] as
    | { documentoId?: number | null; dataAutorizacao?: string | null; protocoloAutorizacao?: string | null }
    | undefined;
  if (top && top.documentoId != null) {
    const dataTxt = top.dataAutorizacao ? ` em ${String(top.dataAutorizacao)}` : "";
    partes.push(`Mais recente: documento ${Number(top.documentoId)}${dataTxt}.`);
  }

  if (exibidas > 0 && exibidas < total) {
    partes.push(`Listando ${exibidas}.`);
  }
  return partes.join(" ");
};
```

## fiscal_certificados
- callsEnriquecer=true buildsRespostaInline=false aggregatesFullSet=false
- destaqueKeys: ["totalCertificados","vencidos","vence30Dias","proximoProprietario","proximoVencimento"]
- EVIDENCIA/FIX: O handler atual NAO computa nenhum agregado e NAO chama enriquecerEnvelope. queryCertificados (src/lib/reports/queries/fiscal-complementar.ts:172-186) retorna apenas { linhas (com take/skip), total (count() full-set), truncado }; o handler (mcp/tools/fiscal/certificados.ts:64-76) so adiciona _listaTruncada/_PAGINACAO. Nao existe _DESTAQUE nem _agregado nem _RESPOSTA hoje (tool cai no fmtGenerico e esta listada em TOOLS_SEM_FORMATADOR_REAL, responder.ts:886). Para o formatador real funcionar (LIVE), o handler precisa computar _DESTAQUE FULL-SET via SELECT/count adicionais sobre fato_certificado inteiro (nao sobre d.linhas, que tem LIMIT). SELECT real no DB (nexus_odoo_l1): SELECT count(*) total=11, count(*) FILTER (WHERE data_fim_validade < now()) vencidos=0, count(*) FILTER (WHERE data_fim_validade BETWEEN now() AND now()+interval '30 days') vence_30d=4, min(data_fim_validade)=2026-06-12. Logo o handler deve preencher _DESTAQUE = { totalCertificados: 11 (== dados.total, ja full-set), vencidos: 0, vence30Dias: 4, proximoProprietario: <proprietario do menor data_fim_validade>, proximoVencimento: '2026-06-12' }. vencidos e vence30Dias precisam de count() proprio com where de data (full-set), NAO reduce sobre d.linhas. proximo* vem do primeiro row do orderBy data_fim_validade asc (valido apenas em offset 0; idealmente um findFirst dedicado). Marquei aggregatesFullSet=false porque o handler hoje nao agrega nada; ao implementar, garantir contagens via count(where) full-set.
- NOTAS: Arquivo: mcp/tools/fiscal/certificados.ts (handler) + src/lib/reports/queries/fiscal-complementar.ts:172-186 (queryCertificados). Tool de LISTA (sem topPorParticipante; ordena por dataFimValidade asc + odooId asc). Arquetipo A (handler DEVE chamar enriquecerEnvelope), mas hoje NAO o faz: retorna o envelope cru de withFreshness sem _RESPOSTA/_DESTAQUE/_agregado, caindo no fmtGenerico (esta em TOOLS_SEM_FORMATADOR_REAL, responder.ts:886). Teste irmao (certificados.test.ts) so afirma paginacao (take/skip/orderBy/_PAGINACAO), NAO afirma _RESPOSTA -> respostaAssertedInTest=false. inputSchema = apenas paginacaoInputShape (limit/offset, ambos opcionais) -> sem campo obrigatorio, baselineArgsNeeded=false; chamada sem args ja retorna dados (default limit=50, 11 certificados). SELECT real (nexus_odoo_l1.fato_certificado): total=11, vencidos=0, vence_30d=4, min(data_fim_validade)=2026-06-12. Para o formatador ficar LIVE o handler precisa: (1) chamar enriquecerEnvelope com _RESPOSTA derivado deste formatador; (2) computar _DESTAQUE FULL-SET { totalCertificados (=dados.total), vencidos (count where data_fim_validade<now), vence30Dias (count where data_fim_validade between now e now+30d), proximoProprietario + proximoVencimento (primeiro do orderBy asc / findFirst) }. As contagens devem usar count(where) sobre a tabela inteira, nunca reduce sobre d.linhas (LIMIT). O formatador trata estado vazio (total=0), singular/plural, e o caso 'nenhum vencido nem proximo de vencer'. Sem travessao, pt-br com acentos. Usa humanizeName no proprietario (CNPJ/razao social) e nao usa formatBRL (tool nao tem valor monetario).

```ts
const fmtFiscalCertificados: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  const total = Number(d.totalCertificados ?? env._agregado?.contagem ?? env.linhas.length ?? 0);
  if (total === 0) {
    return "Nenhum certificado digital cadastrado no Odoo da Matrix.";
  }
  const vencidos = Number(d.vencidos ?? 0);
  const vence30 = Number(d.vence30Dias ?? 0);
  const certPlural = total === 1 ? "certificado digital cadastrado" : "certificados digitais cadastrados";
  const partes: string[] = [`${total} ${certPlural}.`];
  if (vencidos > 0) {
    const vp = vencidos === 1 ? "1 ja vencido" : `${vencidos} ja vencidos`;
    partes.push(`${vp}.`);
  }
  if (vence30 > 0) {
    const v30 = vence30 === 1 ? "1 vence nos proximos 30 dias" : `${vence30} vencem nos proximos 30 dias`;
    partes.push(`${v30}.`);
  }
  if (vencidos === 0 && vence30 === 0) {
    partes.push("Nenhum vencido nem proximo de vencer.");
  }
  const prox = d.proximoProprietario !== undefined ? humanizeName(String(d.proximoProprietario)) : "";
  const proxVenc = d.proximoVencimento !== undefined ? String(d.proximoVencimento) : "";
  if (prox && proxVenc) {
    partes.push(`Proximo a vencer: ${prox} em ${proxVenc}.`);
  } else if (proxVenc) {
    partes.push(`Proximo vencimento em ${proxVenc}.`);
  }
  return partes.join(" ");
};
```

## fiscal_faturamento_por_marca
- callsEnriquecer=false buildsRespostaInline=true aggregatesFullSet=false
- destaqueKeys: ["totalGeral","totalMarcas","totalItens","topMarca","valorTopMarca"]
- EVIDENCIA/FIX: O handler deriva totalGeral/totalItens/totalMarcas via reduce sobre d.linhas, e d.linhas vem da query com LIMIT $3 (limite, default 20). Logo os agregados sao da PAGINA, nao do conjunto inteiro. SELECT comprova: existem 31 grupos de marca (30 non-null + 1 null) com SUM(vr_produtos) full-set = 1784683672.64; o top-20 por valor soma 1783327237.74 e conta 20 marcas. Diferenca de R$ 1.356.434,90 e totalMarcas 20 vs 31. _DESTAQUE.totalMarcas, _DESTAQUE.totalGeral, _DESTAQUE.totalItens e _agregado.soma/contagem ficam errados sempre que houver mais marcas que o limite (ou valor concentrado fora do top-N). Correcao no handler: rodar uma agregacao full-set separada (sem LIMIT) para totalGeral/totalItens/totalMarcas e usar o LIMIT so para linhas/top.
- NOTAS: Arquetipo B: handler monta _RESPOSTA inline no return (linhas 125-127), NAO chama enriquecerEnvelope; o formatador e espelho (contrato exige existir, nunca invocado LIVE). Reproduzi fielmente a mensagem do handler: "Faturamento por marca: total <BRL> em <N> marcas. Top: <marca> <BRL>." e o caso vazio "Nao ha faturamento por marca no periodo.". O handler usa top.marca ?? "(sem marca)" no texto, mas grava topMarca: top?.marca ?? "" em _DESTAQUE (string vazia quando o top e a marca null); o espelho trata "" como "(sem marca)" para manter paridade visual. Sem .test.ts irmao (so existe faturamento-por-marca.ts). inputSchema nao tem campo obrigatorio (todos optional), entao baselineArgsNeeded=false; default cobre mes atual. Dado real do mes atual: top marca = MATRIX (R$ 11.986.719,42). REGRA DE OURO violada: aggregatesFullSet=false, ver aggregatesSelectEvidence. formatBRL e humanizeName usados conforme o escopo de responder.ts.

```ts
const fmtFiscalFaturamentoPorMarca: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  const totalGeral = Number(d.totalGeral ?? env._agregado?.soma ?? 0);
  const totalMarcas = Number(d.totalMarcas ?? env._agregado?.contagem ?? 0);
  const topMarca = String(d.topMarca ?? "");
  const valorTopMarca = Number(d.valorTopMarca ?? 0);

  if (totalMarcas === 0 || (totalGeral === 0 && !topMarca)) {
    return "Nao ha faturamento por marca no periodo.";
  }

  const marcaLabel = topMarca ? humanizeName(topMarca) : "(sem marca)";
  return `Faturamento por marca: total ${formatBRL(totalGeral)} em ${totalMarcas} marcas. Top: ${marcaLabel} ${formatBRL(valorTopMarca)}.`;
};
```

## fiscal_faturamento_por_uf
- callsEnriquecer=false buildsRespostaInline=true aggregatesFullSet=false
- destaqueKeys: ["totalGeral","totalNotas","totalUfs","notasSemUf","topUf","valorTopUf"]
- EVIDENCIA/FIX: O handler calcula totalGeral/totalNotas/totalUfs/notasSemUf via reduce/filter sobre d.linhas, que e a PAGINA apos LIMIT ${limite} (default 20). SELECT no DB (maio/2026, entrada_saida=1, situacao_nfe=autorizada) retorna 22 grupos (21 UFs distintas + "(sem UF)"), full-set: 877 notas e R$ 122.424.773,64. A pagina de 20 linhas soma apenas 875 notas e R$ 122.424.223,64. Logo totalGeral, totalNotas e _agregado.soma/contagem subnotificam quando ha mais de `limite` grupos de UF. Corrigir o handler para computar totalGeral/totalNotas/totalUfs/notasSemUf por SELECT agregado do conjunto inteiro (sem LIMIT), mantendo o LIMIT apenas em d.linhas (o ranking exibido). topUf/valorTopUf vem da primeira linha ordenada por valor DESC, entao o top permanece correto mesmo com LIMIT.
- NOTAS: Arquetipo B: o handler NAO chama enriquecerEnvelope; monta _RESPOSTA/_DESTAQUE/_agregado inline no return (linhas 126-144). Usa withFreshness apenas para envelopar o resultado da query e injetar freshness. Logo o formatador e espelho (nunca invocado em runtime), mas o contrato exige existir e nao ser generico. Chaves EXATAS de _DESTAQUE: totalGeral (number), totalNotas (number), totalUfs (number), notasSemUf (number), topUf (string, UF crua tipo "Alagoas (BR)" ou "" se vazio), valorTopUf (number). _agregado = { contagem: totalNotas, soma: totalGeral }. Sem .test.ts irmao (respostaAssertedInTest=false). inputSchema sem campos obrigatorios (todos optional): periodoDe/periodoAte default mes corrente, limite default 20, empresaRef opcional => baselineArgsNeeded=false, {} retorna dado. Mensagem inline do handler (linha 132): "Faturamento por UF: <fmt(totalGeral)> em <totalNotas> notas, <totalUfs> UFs com UF identificada[ + <notasSemUf> notas sem UF]. Top: <topUf|(sem UF)> <fmt(valorTopUf)>." O espelho reproduz fielmente essa estrutura; humanizei "com UF identificada" para "UFs identificadas" e apliquei humanizeName(topUf) (o handler imprime a UF crua sem humanizar). REGRA DE OURO violada: aggregatesFullSet=false (LIMIT trunca os agregados, ver aggregatesSelectEvidence). Arquivo: mcp/tools/fiscal/faturamento-por-uf.ts. Tipo FormatadorCanonico e helpers formatBRL/humanizeName em mcp/lib/responder.ts (humanizeName via @/lib/agent/text-normalize.js). Sem travessao.

```ts
const fmtFiscalFaturamentoPorUf: FormatadorCanonico = (env) => {
  const totalGeral = Number(env._DESTAQUE?.totalGeral ?? env._agregado?.soma ?? 0);
  const totalNotas = Number(env._DESTAQUE?.totalNotas ?? env._agregado?.contagem ?? 0);
  const totalUfs = Number(env._DESTAQUE?.totalUfs ?? 0);
  const notasSemUf = Number(env._DESTAQUE?.notasSemUf ?? 0);
  const topUfRaw = env._DESTAQUE?.topUf ? String(env._DESTAQUE.topUf) : "";
  const valorTopUf = Number(env._DESTAQUE?.valorTopUf ?? 0);

  if (totalNotas === 0 && totalGeral === 0) {
    return "Nao ha faturamento no periodo.";
  }

  const semUfStr = notasSemUf > 0 ? `, mais ${notasSemUf} notas sem UF` : "";
  const topStr = topUfRaw
    ? ` Top: ${humanizeName(topUfRaw)} com ${formatBRL(valorTopUf)}.`
    : "";

  return `Faturamento por UF: ${formatBRL(totalGeral)} em ${totalNotas} notas, ${totalUfs} UFs identificadas${semUfStr}.${topStr}`;
};
```

## fiscal_mdfe_manifestos
- callsEnriquecer=false buildsRespostaInline=true aggregatesFullSet=false
- destaqueKeys: ["totalMdfe","valorNotas"]
- EVIDENCIA/FIX: No handler de mdfe-manifestos.ts, valorTotal e calculado por d.linhas.reduce((s,l)=>s+l.vrNf,0) (linha 82), e d.linhas vem de queryMdfeManifestos com take=limit/skip=offset (PAGINADO, LIMIT aplicado em fato_mdfe.findMany). Logo _DESTAQUE.valorNotas e _agregado.soma refletem APENAS a pagina atual, nao o conjunto inteiro (bug d987060). Ja _DESTAQUE.totalMdfe e _agregado.contagem usam d.total = prisma.fatoMdfe.count({where}) (full-set, correto). SELECT confirma fato_mdfe vazio hoje: count=0, SUM(vr_nf)=0, entao o sintoma nao aparece com o dado atual, mas o codigo somaria a pagina assim que houver manifestos. Correcao sugerida: o handler deve agregar a SOMA de vr_nf via prisma.fatoMdfe.aggregate({_sum:{vrNf:true}, where}) com o MESMO where da query (periodo/situacao), nao por reduce sobre d.linhas paginadas.
- NOTAS: Arquetipo B: o handler monta _RESPOSTA inline no return (mcp/tools/fiscal/mdfe-manifestos.ts linhas 88-93), nao chama enriquecerEnvelope; o formatador e espelho (nunca invocado em runtime hoje) mas o contrato exige existir e nao ser fmtGenerico. Tool esta atualmente listada em TOOLS_SEM_FORMATADOR_REAL (responder.ts linha 895) e cai no fmtGenerico , o trabalho da Onda 4 e registrar fmtMdfeManifestos em FORMATADORES (key fiscal_mdfe_manifestos, junto aos demais fiscal_* em ~linha 750) e REMOVER fiscal_mdfe_manifestos de TOOLS_SEM_FORMATADOR_REAL. Tres ramos do _RESPOSTA original: (1) total===0 (fatoMdfeCount full, tabela vazia) -> mensagem NAO_OPERADO; (2) d.total>0 -> `${d.total} MDF-e no periodo.`; (3) recorte vazio -> "Sem MDF-e nesse recorte (periodo/situacao)." O formatador espelho usa _DESTAQUE.totalMdfe como discriminante (==0 => nao operado) e enriquece o caso com dado citando valorNotas via formatBRL, alinhado ao padrao dos outros fiscal_* (que mostram contagem + valor). Chaves EXATAS de _DESTAQUE: totalMdfe (number, full-set), valorNotas (number, PAGE-only). _agregado: {contagem: full-set, soma: page-only}. Sem topPorParticipante. humanizeName nao se aplica (sem nome de participante no destaque). inputSchema sem campo obrigatorio (todos optional) -> baselineArgs vazio. Teste irmao (mdfe-manifestos.test.ts) so assere paginacao (_PAGINACAO.total/temMais/proximoOffset/orderBy/take/skip), NAO assere _RESPOSTA. SELECT em fato_mdfe: count=0, SUM(vr_nf)=0 (modulo MDF-e nao operado, confirma a resposta honesta). FormatadorCanonico assinatura: (env: Omit<ToolEnvelope,"_RESPOSTA">) => string. Sem travessao no codigo/textos.

```ts
const fmtMdfeManifestos: FormatadorCanonico = (env) => {
  const dest = (env._DESTAQUE ?? {}) as Record<string, string | number>;
  const totalMdfe = Number(dest.totalMdfe ?? env._agregado?.contagem ?? 0);
  const valorNotas = Number(dest.valorNotas ?? env._agregado?.soma ?? 0);
  if (totalMdfe === 0) {
    return (
      "O MDF-e (manifesto de transporte) ainda nao e operado no Odoo da Matrix (sem manifestos). " +
      "Esta consulta passa a responder quando os MDF-e forem emitidos no ERP."
    );
  }
  const plural = totalMdfe === 1 ? "MDF-e" : "MDF-e";
  return `${totalMdfe} ${plural} no periodo, valor das notas ${formatBRL(valorNotas)}.`;
};
```

## preco_produto
- callsEnriquecer=false buildsRespostaInline=false aggregatesFullSet=true baselineArgs={"termo":"G7S13 V2 SUPINO"}
- destaqueKeys: ["total","produto","termo"]
- EVIDENCIA/FIX: fato_preco dimensao=produto tem 11867 regras / 2991 produtos distintos; cada produto aparece em ate 6 tabelas (ex.: G7S13 V2 SUPINO: 6 regras, uma por tabela Custo/0,3, Custo/0,95, Custo Padrao, Custo Smart/0,95, Venda Padrao/0,3, Venda Smart). O handler/query calcula total via prisma.fatoPreco.count({where}) SEM take/skip (queryPrecoProduto: count e independente de offset/limit), portanto a contagem e do CONJUNTO INTEIRO, nao da pagina. operacao sempre 'fixo', preco_base sempre vazio. NAO existe agregado monetario valido: somar valores de tabelas distintas (Custo 83026,37 vs Venda 42824,78 vs Smart 31529,00 para o mesmo produto) seria sem sentido de negocio, por isso o unico agregado full-set e a contagem de regras.
- NOTAS: ARQUETIPO B (lista inline), porem com ressalva importante: hoje a tool NAO usa o envelope canonico. O handler (mcp/tools/comercial/preco-produto.ts) chama withFreshness(queryPrecoProduto) e devolve dados={linhas,total,truncado,_listaTruncada,_PAGINACAO}. NAO ha _RESPOSTA, NAO ha _DESTAQUE, NAO ha _agregado, NAO chama enriquecerEnvelope nem buildEnvelope. Por isso esta na allowlist TOOLS_SEM_FORMATADOR_REAL (responder.ts:874) usando fmtGenerico. O teste irmao (preco-produto.test.ts) so cobre paginacao (take/skip/orderBy/_PAGINACAO); NAO assere _RESPOSTA. CONSEQUENCIA / TRATAMENTO ESPECIAL: para o fmtPrecoProduto produzir texto correto, o handler precisa passar a expor o destaque no envelope. Hoje os campos uteis sao: (a) dados.total (passthrough, full-set, vem do count) e (b) dados.linhas (a pagina). O formatador que devolvi le _DESTAQUE.total/_DESTAQUE.produto/_DESTAQUE.termo PRIMEIRO (caso voce enriqueça o handler com esses tres campos), mas tem fallback defensivo lendo o passthrough env.total (cast) e env.linhas[0].produtoNome / linhas[].tabelaNome+valor, entao funciona mesmo antes do enriquecimento. RECOMENDACAO ao integrador: no handler, adicionar _RESPOSTA (via fmtPrecoProduto) e _DESTAQUE={total, produto: linhas[0]?.produtoNome ?? '', ...(termo?{termo}:{})} dentro de dados, e remover preco_produto da allowlist TOOLS_SEM_FORMATADOR_REAL. baselineArgs: termo 'G7S13 V2 SUPINO' (existe, 6 regras em 6 tabelas distintas). chave de input: 'termo' (string, ILIKE em produto_nome; o codigo entre colchetes [103] tambem casa). Sem travessao. FormatadorCanonico tem assinatura (env: Omit<ToolEnvelope,'_RESPOSTA'>)=>string; helpers formatBRL e humanizeName ja estao no escopo do responder.ts. Fiz cast de env para Record para ler o passthrough 'total' que nao esta tipado em ToolEnvelope.

```ts
const fmtPrecoProduto: FormatadorCanonico = (env) => {
  // preco_produto: regras de preco de um PRODUTO em todas as tabelas onde ele
  // aparece (dimensao=produto, operacao sempre "fixo"). NAO ha agregado
  // monetario: somar precos de tabelas distintas (Custo, Venda, Smart, ...) nao
  // tem sentido de negocio. O numero canonico do conjunto inteiro e a CONTAGEM
  // de regras, que vem de prisma.fatoPreco.count({where}) -> dados.total
  // (full-set, independente da pagina). Por isso o destaque e a contagem + o
  // produto + uma amostra de "tabela: valor" das linhas da pagina.
  const d = (env as unknown as Record<string, unknown>) ?? {};
  const linhas = (env.linhas ?? []) as Array<{
    tabelaNome?: string | null;
    produtoNome?: string | null;
    valor?: number | null;
    quantidadeMinima?: number | null;
  }>;

  // total full-set: _DESTAQUE.total (se o handler enriquecer) ou o passthrough
  // dados.total (count absoluto do where), nunca o tamanho da pagina.
  const total = Number(
    env._DESTAQUE?.total ?? (typeof d.total === "number" ? d.total : linhas.length),
  );

  if (total === 0 || linhas.length === 0) {
    const termoVazio = env._DESTAQUE?.termo ? ` para '${String(env._DESTAQUE.termo)}'` : "";
    return `Nenhuma regra de preco encontrada${termoVazio}.`;
  }

  // Nome do produto: do destaque, senao da primeira linha.
  const produtoRaw =
    env._DESTAQUE?.produto != null
      ? String(env._DESTAQUE.produto)
      : (linhas[0]?.produtoNome ?? "");
  const produto = produtoRaw ? humanizeName(produtoRaw) : "produto consultado";

  // Amostra de ate 3 tabelas com o preco, em linguagem natural.
  const amostra = linhas
    .slice(0, 3)
    .filter((l) => l.valor != null)
    .map((l) => {
      const tab = l.tabelaNome ? humanizeName(String(l.tabelaNome)) : "tabela sem nome";
      return `${tab} ${formatBRL(Number(l.valor))}`;
    });

  const cabeca =
    total === 1
      ? `1 regra de preco para ${produto}.`
      : `${total} regras de preco para ${produto} (em diferentes tabelas).`;

  const corpo =
    amostra.length > 0
      ? ` Precos: ${amostra.join(", ")}${total > amostra.length ? ", entre outras." : "."}`
      : "";

  return cabeca + corpo;
};
```

## preco_tabela
- callsEnriquecer=false buildsRespostaInline=false aggregatesFullSet=true baselineArgs={"tabelaId":7}
- destaqueKeys: ["total","tabelaNome"]
- EVIDENCIA/FIX: SELECT tabela_id, tabela_nome, count(*) FROM fato_preco GROUP BY tabela_id, tabela_nome -> tabela 7 (Custo /0,3) tem 2954 regras; tabela 1 (Custo Padrao) 2949; tabela 6 2843; tabela 3 2805; tabela 4 158; tabela 5 158. Total geral fato_preco = 11867. O handler usa prisma.fatoPreco.count({ where: { tabelaId } }) SEM offset, logo `dados.total` reflete o conjunto inteiro da tabela, nao a pagina (take/skip so afetam `linhas`). Por isso o formatador le `total` e nunca `linhas.length`.
- NOTAS: ATENCAO: preco_tabela NAO usa o envelope canonico. O handler (mcp/tools/comercial/preco-tabela.ts) NAO chama enriquecerEnvelope e NAO monta _RESPOSTA/_DESTAQUE/_agregado/topPorParticipante. Ele apenas embrulha queryPrecoTabela (src/lib/reports/queries/precos.ts) em withFreshness e retorna dados = { tabelaNome, linhas[], total, truncado, _listaTruncada, _PAGINACAO }. Logo o formatador recebe `env` = esse objeto `dados` (passthrough) e precisa ler chaves NAO declaradas em ToolEnvelope (tabelaNome, total, linhas), o que exige o cast `env as unknown as {...}` no formatterCode (mesmo padrao seguro dos demais fmt que so leem chaves conhecidas). Arquetipo B (espelho/inline), mas sem _RESPOSTA pre-pronto: o handler nao produz texto, entao o formatador eh a UNICA fonte da frase humana. REGRA DE OURO respeitada: `dados.total` vem de count({where:{tabelaId}}) sem offset = conjunto inteiro (full set), enquanto `linhas` eh so a pagina (take/skip). Por isso uso `total`, com fallback defensivo para linhas.length so se total faltar. tabelaNome tambem eh resolvido fora da pagina no handler (findFirst), entao eh seguro. Tool atualmente esta em TOOLS_SEM_FORMATADOR_REAL (responder.ts:875) usando fmtGenerico; ao registrar fmtPrecoTabela no map FORMATADORES com a chave "preco_tabela" (= registrationKey), remover "preco_tabela" daquela allowlist (eu, orquestrador, faco isso inline). baselineArgs={tabelaId:7} eh real (Custo /0,3, 2954 regras), bate com o valor ja usado no preco-tabela.test.ts. O teste irmao so verifica paginacao (_PAGINACAO.total/temMais/proximoOffset), nunca _RESPOSTA, entao respostaAssertedInTest=false. Sem travessao no texto gerado. Nao computo soma/media de valor porque o handler nao expoe agregado de valor e a tool eh de listagem de regras (a metrica natural eh contagem de regras da tabela, que ja eh full-set via `total`).

```ts
const fmtPrecoTabela: FormatadorCanonico = (env) => {
  // preco_tabela NAO usa o envelope canonico (sem _RESPOSTA/_DESTAQUE/_agregado).
  // O handler devolve dados = { tabelaNome, linhas, total, truncado, _PAGINACAO }.
  // `total` ja eh a contagem do CONJUNTO INTEIRO (Prisma count(where), sem offset),
  // entao usamos `total`, nunca linhas.length (que eh so a pagina atual).
  const d = env as unknown as {
    tabelaNome?: string | null;
    total?: number;
    linhas?: Array<{ tabelaNome?: string | null }>;
  };
  const total = Number(d.total ?? d.linhas?.length ?? 0);
  const nomeBruto = d.tabelaNome ?? d.linhas?.[0]?.tabelaNome ?? null;

  if (total === 0) {
    return "Nenhuma regra de preco encontrada para essa tabela.";
  }

  const nome = nomeBruto ? humanizeName(String(nomeBruto)) : "tabela informada";
  const plural = total === 1 ? "regra de preco" : "regras de preco";
  return `Tabela ${nome}: ${total} ${plural} cadastrada(s).`;
};
```

## referencia_buscar
- callsEnriquecer=false buildsRespostaInline=false aggregatesFullSet=true baselineArgs={"tabela":"cfop","termo":"venda"}
- destaqueKeys: ["tabela","termo","total","linhasExibidas","codigo","descricao"]
- EVIDENCIA/FIX: O total vem de prisma.fatoReferencia.count({where}) sobre o conjunto inteiro filtrado (queryReferenciaBuscar linha 42), e truncado/_PAGINACAO derivam desse mesmo total, nunca da pagina (take/skip aplicados so no findMany). SELECT por tabela confirma full-set: ncm=12032, municipio=5829, cnae=1301, cest=924, nbs=920, cfop=604, pais=242, cst_cibs=159, natureza_operacao=104, unidade=73, cst_pis_cofins=33, estado=28, cst_icms=15, cst_ipi=14, cst_icms_sn=10. Logo o _DESTAQUE.total proposto = dados.total (full-set), e a pagina entra so como linhasExibidas.
- NOTAS: ATENCAO , esta tool NAO usa o envelope canonico do jeito padrao. mcp/tools/fiscal/referencia-buscar.ts retorna um output proprio: { estado: "preparando" } | { estado: "ok"|"vazio", dados: { linhas: [{tabela,codigo,descricao}], total, truncado, _listaTruncada, _PAGINACAO }, atualizadoEm, fonteStatus }. O handler atualmente NAO chama enriquecerEnvelope nem monta _RESPOSTA/_DESTAQUE/_agregado/topPorParticipante. Por isso a tool esta em TOOLS_SEM_FORMATADOR_REAL (responder.ts:877) e cai no fmtGenerico. Arquetipo = B (espelho de consulta/lista, analogo direto a fmtPlanoDeContas em responder.ts:285). Para ligar o formatador real, o orquestrador precisa fazer o handler chamar enriquecerEnvelope(envelope, "referencia_buscar", { destaque, paginacao }) montando _DESTAQUE com as chaves: tabela (input.tabela), termo (input.termo), total (= d.total, FULL-SET via count, ja existe), linhasExibidas (= d.linhas.length) e, no caso de match unico, codigo+descricao (= d.linhas[0]). O formatador ja faz fallback robusto para env.linhas[0] caso o handler nao popule _DESTAQUE. Full-set confirmado por SELECT (ver aggregatesSelectEvidence) , total vem de prisma.fatoReferencia.count({where}), nunca da pagina; aggregatesFullSet=true, sem o bug d987060. Teste irmao (referencia-buscar.test.ts) NAO asserta _RESPOSTA (so paginacao). registrationKey = "referencia_buscar" (id da tool no FORMATADORES de responder.ts), e remover esse id de TOOLS_SEM_FORMATADOR_REAL ao registrar. baselineArgs sugeridos {tabela:"cfop",termo:"venda"} sao valores reais (cfop tem 604 linhas, ha descricoes contendo "venda"). Tabela enum obrigatoria; termo opcional. Sem travessao no codigo/textos.

```ts
const fmtReferenciaBuscar: FormatadorCanonico = (env) => {
  // Espelho fiel (arquetipo B). Tool de consulta as tabelas de referencia
  // fiscais/cadastrais/geograficas (NCM, CFOP, CEST, CNAE, ...). O handler hoje
  // NAO chama enriquecerEnvelope; quando for ligado, deve montar _DESTAQUE com:
  //   total          = count({where}) do CONJUNTO INTEIRO (full-set, ja existe
  //                    em dados.total via prisma.fatoReferencia.count)
  //   linhasExibidas = dados.linhas.length (tamanho da pagina)
  //   tabela         = nome tecnico da tabela consultada (ncm, cfop, ...)
  //   termo          = termo buscado (opcional)
  //   codigo/descricao = preenchidos quando ha match unico
  // O formatador tambem cai para env.linhas[0] (que carrega {tabela,codigo,descricao}).
  const rotulos: Record<string, string> = {
    ncm: "NCM",
    cfop: "CFOP",
    cest: "CEST",
    cnae: "CNAE",
    nbs: "NBS",
    natureza_operacao: "natureza de operacao",
    unidade: "unidade",
    cst_icms: "CST de ICMS",
    cst_icms_sn: "CST de ICMS (Simples Nacional)",
    cst_ipi: "CST de IPI",
    cst_pis_cofins: "CST de PIS/COFINS",
    cst_cibs: "CST de CIBS",
    municipio: "municipio",
    pais: "pais",
    estado: "estado",
  };
  const primeira = (env.linhas?.[0] ?? {}) as {
    tabela?: string;
    codigo?: string;
    descricao?: string | null;
  };
  const tabelaTecnica = String(
    env._DESTAQUE?.tabela ?? primeira.tabela ?? "",
  );
  const rotuloTabela =
    rotulos[tabelaTecnica] ??
    (tabelaTecnica ? humanizeName(tabelaTecnica) : "tabela de referencia");
  const total = Number(
    env._DESTAQUE?.total ?? env._DESTAQUE?.contagem ?? env.linhas?.length ?? 0,
  );
  const exibidas = Number(
    env._DESTAQUE?.linhasExibidas ?? env.linhas?.length ?? 0,
  );
  const termoRaw = env._DESTAQUE?.termo;
  const termo = termoRaw != null ? String(termoRaw).trim() : "";

  if (total === 0) {
    return termo
      ? `Nenhum codigo encontrado na tabela ${rotuloTabela} para '${termo}'.`
      : `A tabela ${rotuloTabela} esta vazia no cache.`;
  }

  if (total === 1) {
    const codigo = String(
      env._DESTAQUE?.codigo ?? primeira.codigo ?? "",
    ).trim();
    const descricao = String(
      env._DESTAQUE?.descricao ?? primeira.descricao ?? "",
    ).trim();
    const corpo = codigo
      ? `${rotuloTabela} ${codigo}${descricao ? `: ${descricao}` : ""}.`
      : descricao
        ? `${rotuloTabela}: ${descricao}.`
        : `1 registro na tabela ${rotuloTabela}.`;
    return termo ? `${corpo}` : corpo;
  }

  const cabeca = termo
    ? `${total} codigos na tabela ${rotuloTabela} batem com '${termo}'.`
    : `${total} codigos cadastrados na tabela ${rotuloTabela}.`;
  if (exibidas > 0 && exibidas < total) {
    return `${cabeca} Listando ${exibidas}.`;
  }
  return cabeca;
};
```

## servico_buscar
- callsEnriquecer=false buildsRespostaInline=false aggregatesFullSet=true baselineArgs={"termo":"transporte"}
- destaqueKeys: ["termo","totalEncontrados","linhasExibidas","codigo","descricao"]
- EVIDENCIA/FIX: fato_servico tem 336 linhas no total. queryServicoBuscar usa total = prisma.fatoServico.count({where}) sobre o MESMO where ILIKE da busca (codigo/codigoFormatado/descricao), ou seja, o total e do CONJUNTO INTEIRO que casa com o termo, nao da pagina (que vem de take/skip). SELECT de verificacao com termo 'transporte': count(*) WHERE codigo/descricao/codigo_formatado ILIKE '%transporte%' = 6, batendo com o total esperado pleno (independente de limit/offset). Logo totalEncontrados (=d.total) e full-set.
- NOTAS: ARQUETIPO A (deveria ser LIVE), mas HOJE o handler NAO esta enriquecido. Estado atual: servico-buscar.ts (mcp/tools/cadastros/servico-buscar.ts) NAO chama enriquecerEnvelope nem monta _RESPOSTA/_DESTAQUE inline. Ele retorna o envelope custom de freshness/paginacao: {estado:'ok'|'vazio'|'preparando', dados:{linhas, total, truncado, _listaTruncada, _PAGINACAO}, atualizadoEm, fonteStatus}. NAO usa o envelope canonico (_RESPOSTA/_DESTAQUE/_agregado/topPorParticipante ausentes). Por isso a tool esta em TOOLS_SEM_FORMATADOR_REAL e hoje cai no fmtGenerico. PARA O FORMATADOR FUNCIONAR (passo de integracao que voce, orquestrador, faz no handler): apos resolver `paginacao`, o handler deve chamar enriquecerEnvelope(envelope, 'servico_buscar', { destaque: {...}, paginacao }) com destaque = { termo: input.termo, totalEncontrados: d.total, linhasExibidas: d.linhas.length, ...(d.total===1 ? { codigo: d.linhas[0].codigo, descricao: d.linhas[0].descricao } : {}) }. Passar `paginacao` faz o calcularExtras gerar _listaTruncada e _AVISO_TRUNCAMENTO automaticamente (o caso n>exibidas ja e coberto). O formatador acima le SO _DESTAQUE.totalEncontrados (full-set), _DESTAQUE.linhasExibidas (pagina) e _DESTAQUE.termo, com fallback para env.linhas.length. Espelha o estilo de fmtBuscarParceiro e fmtPlanoDeContas (cadastros). Quando enriquecido, calcularExtras anexa o aviso de paginacao no fim do _RESPOSTA, evitando duplicar "Listando N" (mas o formatador trata o caso defensivamente). Sem travessao. termo real para baseline: 'transporte' (6 servicos no catalogo). Tipo FormatadorCanonico (com 't'); usa formatBRL nao necessario aqui (sem valor monetario). Registrar em FORMATADORES com a chave exata 'servico_buscar' e remover 'servico_buscar' de TOOLS_SEM_FORMATADOR_REAL (linha 878 de responder.ts).

```ts
const fmtServicoBuscar: FormatadorCanonico = (env) => {
  // Busca de servicos no catalogo fiscal (fato_servico) por termo.
  // _DESTAQUE.totalEncontrados vem do COUNT do conjunto inteiro que casa
  // com o termo (count sobre o mesmo where), nao do tamanho da pagina.
  // linhasExibidas e o tamanho da fatia retornada.
  const n = Number(env._DESTAQUE?.totalEncontrados ?? env.linhas.length);
  const exibidas = Number(env._DESTAQUE?.linhasExibidas ?? env.linhas.length);
  const termo = env._DESTAQUE?.termo ? String(env._DESTAQUE.termo) : "criterio";
  if (n === 0) {
    return `Nenhum servico encontrado com o termo '${termo}'.`;
  }
  if (n === 1) {
    const codigo = env._DESTAQUE?.codigo ? String(env._DESTAQUE.codigo) : "";
    const descricao = env._DESTAQUE?.descricao
      ? String(env._DESTAQUE.descricao)
      : "";
    const cab = `Servico ${codigo}: ${descricao}`.trim();
    return cab.endsWith(":") ? cab.slice(0, -1).trim() + "." : cab + ".";
  }
  const cabeca = `${n} servicos encontrados com o termo '${termo}'.`;
  if (exibidas > 0 && exibidas < n) {
    return `${cabeca} Listando ${exibidas}.`;
  }
  return cabeca;
};
```

## servico_listar
- callsEnriquecer=false buildsRespostaInline=false aggregatesFullSet=true
- destaqueKeys: []
- EVIDENCIA/FIX: SELECT count(*) FROM fato_servico => 336. O handler usa prisma.fatoServico.count() SEM where (queryServicoListar, src/lib/reports/queries/servicos.ts:104), portanto dados.total e o total do CONJUNTO INTEIRO (336), nao da pagina. As linhas[] sao a pagina (take/skip). O formatador usa total para o numero principal e linhas so como amostra. REGRA DE OURO atendida.
- NOTAS: ATENCAO , esta tool NAO usa o envelope canonico (arquetipo B "espelho", mas atipico). Arquivo: mcp/tools/cadastros/servico-listar.ts. O handler NAO chama enriquecerEnvelope NEM monta _RESPOSTA inline. Ele retorna FreshnessEnvelope { estado, dados, atualizadoEm, fonteStatus } onde dados = { linhas, total, truncado, _listaTruncada, _PAGINACAO }. Nao ha _DESTAQUE, _agregado, topPorParticipante nem _RESPOSTA. Logo o formatador NAO tem chaves de _DESTAQUE para ler (destaqueKeys=[]); ele le env.total (count full-set) e env.linhas (pagina, com campos codigo/codigoFormatado/descricao via toLinha em servicos.ts). Acesso a total/truncado/linhas exige cast (env as unknown as {...}) porque o tipo Omit<ToolEnvelope,"_RESPOSTA"> nao tipa esses campos , mas eles existem em runtime (passthrou via withFreshness). Registro: id da tool deve ser REMOVIDO de TOOLS_SEM_FORMATADOR_REAL (mcp/lib/responder.ts:880) e ADICIONADO ao Record FORMATADORES (apos cadastro_contar_parceiros na secao cadastros) com chave "servico_listar" (= toolId, sem prefixo dominio; confirmado pelo padrao do registry e pelo envelope-contract.test.ts que casa por catalogo). O teste irmao servico-listar.test.ts so valida paginacao, NAO assere _RESPOSTA. Full-set: 336 servicos, todos com codigo_formatado e codigo_tributacao preenchidos. Input: so paginacao opcional, sem arg obrigatorio (baselineArgsNeeded=false). humanizeName aplicado na descricao; formatBRL nao se aplica (catalogo nao tem valor monetario , al_inss_retido e aliquota 0.0000, irrelevante para a frase). Sem travessao.

```ts
const fmtServicoListar: FormatadorCanonico = (env) => {
  // servico_listar NAO usa o envelope canonico: o handler devolve
  // dados = { linhas, total, truncado, _listaTruncada, _PAGINACAO } e NAO
  // monta _RESPOSTA, _DESTAQUE, _agregado nem topPorParticipante. O formatador
  // le `total` (count do conjunto inteiro, REGRA DE OURO atendida pelo handler:
  // prisma.fatoServico.count() roda sobre a tabela toda, nao sobre a pagina) e
  // amostra algumas descricoes de `linhas` (a pagina atual).
  const d = env as unknown as {
    total?: number;
    truncado?: boolean;
    linhas?: Array<{
      codigo?: string;
      codigoFormatado?: string | null;
      descricao?: string;
    }>;
  };
  const total = Number(d.total ?? (env.linhas?.length ?? 0));
  const linhas = Array.isArray(d.linhas) ? d.linhas : [];

  if (total === 0) {
    return "Nenhum servico fiscal cadastrado no catalogo.";
  }

  const partes: string[] = [];
  partes.push(
    `${total} servico(s) fiscal(is) no catalogo, ordenado(s) por codigo.`,
  );

  const amostra = linhas.slice(0, 3).map((l) => {
    const cod = String(l.codigoFormatado ?? l.codigo ?? "").trim();
    const desc = humanizeName(String(l.descricao ?? "")).trim();
    return cod ? `${cod} ${desc}`.trim() : desc;
  }).filter((s) => s.length > 0);

  if (amostra.length > 0) {
    partes.push(`Exemplos: ${amostra.join("; ")}.`);
  }

  if (d.truncado && linhas.length < total) {
    partes.push(`Mostrando ${linhas.length} de ${total}; ha mais para listar.`);
  }

  return partes.join(" ");
};
```

## crm.res_partner.get
- callsEnriquecer=false buildsRespostaInline=false aggregatesFullSet=true baselineArgs={"id":1}
- destaqueKeys: []
- EVIDENCIA/FIX: Tool de get unitario por ID (findUnique where odooId), nao agrega conjunto, logo nao ha risco do bug d987060. SELECT confirmou estrutura: raw_res_partner tem colunas odoo_id, data (jsonb do Odoo), synced_at, odoo_write_date, raw_deleted. Amostra do data: id=1 name='JHT Brasilia - Matriz DF 07.390.039/0001-01', is_company=true, email=false, phone='+55 (61) 3567-7177', city='Brasilia', vat='BR-07.390.039/0001-01'. Campos vazios vem como booleano false (estilo Odoo).
- NOTAS: TRATAMENTO ESPECIAL NECESSARIO. Esta tool NAO usa o envelope canonico ToolEnvelope. O handler (mcp/tools/crm/res-partner-get.ts, linhas 38-48) retorna { found: boolean, record: row | null } cru, sem _RESPOSTA, _DESTAQUE, _agregado, linhas[] ou topPorParticipante. record e o row do cache rawResPartner (Prisma camelCase: odooId, data, odooWriteDate, syncedAt, rawDeleted; DB snake_case: odoo_id, data, odoo_write_date, synced_at, raw_deleted). O payload util e record.data, JSON bruto sincronizado do res.partner do Odoo. Arquetipo: nem A nem B classicos , e um raw-get cru. Nao chama enriquecerEnvelope e nao monta _RESPOSTA inline (callsEnriquecer=false, buildsRespostaInline=false). O teste irmao (mcp/tools/crm/__tests__/res-partner-get.test.ts) NAO afirma nenhum _RESPOSTA , so valida shape {found,record}, chamada findUnique({where:{odooId}}) e o outputSchema (respostaAssertedInTest=false). PONTO DE ATENCAO PARA QUEM INTEGRAR: o tipo FormatadorCanonico espera Omit<ToolEnvelope,'_RESPOSTA'>, mas o output desta tool nao casa com esse tipo. O formatador proposto faz cast (env as unknown as {found,record}) para ler o output cru , avalie se o pipeline de _RESPOSTA realmente roda sobre tools sem envelope canonico, ou se esta tool deve ficar fora do registry de formatadores (usar o fmtGenerico/sem formatador). Estilo Odoo: campos ausentes chegam como o booleano false (email:false, phone:false, vat:''), por isso o helper txt() trata false/null/undefined como vazio. humanizeName aplicado ao name. formatBRL nao se aplica (sem valores monetarios). aggregatesFullSet=true por vacuidade (get unitario, sem agregacao). baselineArgs {id:1} validado por SELECT (registro existe e nao deletado). Sem travessao no texto gerado.

```ts
// ATENCAO: crm.res_partner.get NAO usa o envelope canonico ToolEnvelope.
// O handler retorna { found, record } cru, onde record e o row do cache
// rawResPartner: { odooId, data (JSON do Odoo), odooWriteDate, syncedAt, rawDeleted }.
// O campo data segue o estilo Odoo: campos vazios vem como false (ex.: email:false).
// Por isso este formatador le o output via cast (nao ha _DESTAQUE/_agregado/linhas).
// Mantemos a assinatura FormatadorCanonico por consistencia do registry, mas
// tratamos env como o objeto de saida cru desta tool.
const fmtCrmResPartnerGet: FormatadorCanonico = (env) => {
  const out = env as unknown as {
    found?: boolean;
    record?: { odooId?: number; data?: Record<string, unknown> } | null;
  };

  if (!out || out.found !== true || !out.record) {
    return "Nenhum parceiro encontrado no cache com esse ID.";
  }

  const data = (out.record.data ?? {}) as Record<string, unknown>;

  // No Odoo, campos textuais ausentes chegam como o booleano false.
  const txt = (v: unknown): string => {
    if (v === false || v === null || v === undefined) return "";
    return String(v).trim();
  };

  const id = out.record.odooId;
  const nomeBruto = txt(data["name"]);
  const nome = nomeBruto ? humanizeName(nomeBruto) : "(sem nome)";
  const isEmpresa = data["is_company"] === true;
  const rotulo = isEmpresa ? "Empresa" : "Pessoa/contato";

  const partes: string[] = [];
  partes.push(`${rotulo}: ${nome} (ID ${id}).`);

  const detalhes: string[] = [];
  const vat = txt(data["vat"]);
  if (vat) detalhes.push(`CNPJ/CPF ${vat}`);
  const email = txt(data["email"]);
  if (email) detalhes.push(`e-mail ${email}`);
  const phone = txt(data["phone"]);
  if (phone) detalhes.push(`telefone ${phone}`);
  const mobile = txt(data["mobile"]);
  if (mobile) detalhes.push(`celular ${mobile}`);
  const city = txt(data["city"]);
  if (city) detalhes.push(`cidade ${city}`);

  if (detalhes.length > 0) {
    partes.push(`Dados: ${detalhes.join(", ")}.`);
  }

  return partes.join(" ");
};
```

## contabil_saldo_conta
- callsEnriquecer=true buildsRespostaInline=true aggregatesFullSet=false
- destaqueKeys: ["contagem"]
- EVIDENCIA/FIX: SELECT count(*) FROM fato_contabil_lancamento_item -> 0 linhas (contabilidade nao operada). querySaldoConta usa groupBy com take: limite ?? 250, e o handler passa destaque: { contagem: envelope.dados.total }, onde total = linhas.length (numero de grupos retornados na fatia), NAO um count(distinct contaId) absoluto. Nao ha soma global de debito/credito em _DESTAQUE nem _agregado. Logo, qualquer somatorio que o formatador faca a partir de env.linhas reflete apenas a pagina (max 250 contas), nao o conjunto inteiro. Hoje inocuo (0 lancamentos); na ativacao, se o balancete passar de 250 contas, handler precisa expor contagem absoluta e somas globais em _DESTAQUE/_agregado.
- NOTAS: Arquivo: mcp/tools/contabil/saldo-conta.ts. Handler (linha 80) chama enriquecerEnvelope(envelope, "contabil_saldo_conta", { destaque: { contagem: envelope.dados.total }, listaTruncada: false }). Quando estado==="vazio" o handler sobrescreve out.dados._RESPOSTA com mensagemContabilGestaoVazia(n) (src/lib/reports/queries/contabil.ts:160), entao na pratica HOJE o texto vem do handler (espelho do caso vazio) e o formatador canonico so atua se o balancete tiver dados. Por isso classifico como hibrido: callsEnriquecer=true (arquetipo A) E buildsRespostaInline=true (handler tem o caminho honesto inline para vazio). REGISTRO: contabil_saldo_conta NAO esta em FORMATADORES (mcp/lib/responder.ts:710-790), entao hoje cai em fmtGenerico. Esta listada em TOOLS_QUE_PRECISAM_FORMATADOR (linha 912), ou seja o contrato exige formatador real (nao-fallback). registrationKey = "contabil_saldo_conta" (igual ao toolId, sem pontos). _DESTAQUE so tem a chave "contagem" (numero de contas com movimento na fatia). topPorParticipante NAO e populado (handler nao passa titulos). _agregado NAO e populado. linhas[] segue SaldoContaLinha: { contaId, contaCodigo, contaNome, contaNatureza, debito, credito, saldo }. aggregatesFullSet=false: ver aggregatesSelectEvidence. O formatador soma debito/credito de env.linhas que e a pagina (take 250); _DESTAQUE.contagem tambem e o tamanho da fatia, nao count absoluto. Corrigir no handler na ativacao da contabilidade (expor soma/contagem globais). Helpers usados (em escopo no responder.ts): formatBRL (linha 31) e humanizeName. Sem travessao. Sem .test.ts irmao para esta tool (so existe detalhar-conta.test.ts), entao respostaAssertedInTest=false. baselineArgsNeeded=false (todos os inputs sao opcionais: termo/dataInicio/dataFim/limite). IMPORTANTE: ao registrar o formatador, alinhar a mensagem de vazio do formatador com a do handler nao e estritamente necessario (o handler ja sobrescreve no caso vazio), mas mantive uma mensagem honesta coerente no formatador para o caso de futuramente o caminho vazio do handler mudar.

```ts
const fmtContabilSaldoConta: FormatadorCanonico = (env) => {
  // Arquetipo A: handler chama enriquecerEnvelope com destaque { contagem }.
  // Quando o fato esta vazio (contabilidade nao operada hoje, 0 lancamentos),
  // o proprio handler sobrescreve _RESPOSTA com a mensagem honesta; este
  // formatador cobre o caso de existir balancete (futuro/ativacao).
  const linhas = (env.linhas ?? []) as Array<{
    contaCodigo?: string | null;
    contaNome?: string | null;
    debito?: number;
    credito?: number;
    saldo?: number;
  }>;
  const totalContas = Number(env._DESTAQUE?.contagem ?? linhas.length ?? 0);

  if (totalContas === 0 || linhas.length === 0) {
    return "Nao ha saldos contabeis para esse recorte. A contabilidade ainda nao tem lancamentos lançados no Odoo da Matrix; esta consulta passa a responder assim que os lançamentos existirem.";
  }

  // ATENCAO: somatorios derivados da fatia exibida (handler nao expoe soma
  // global do conjunto). Quando o balancete passar de 250 contas, ajustar o
  // handler para mandar somas absolutas em _DESTAQUE/_agregado.
  let totalDebito = 0;
  let totalCredito = 0;
  for (const l of linhas) {
    totalDebito += Number(l.debito ?? 0);
    totalCredito += Number(l.credito ?? 0);
  }
  const saldoLiquido = totalDebito - totalCredito;

  // Conta de maior saldo em modulo, para dar um destaque util.
  let maior: (typeof linhas)[number] | undefined;
  let maiorAbs = -1;
  for (const l of linhas) {
    const abs = Math.abs(Number(l.saldo ?? 0));
    if (abs > maiorAbs) {
      maiorAbs = abs;
      maior = l;
    }
  }

  const plural = totalContas === 1 ? "conta" : "contas";
  const cabeca =
    `Balancete: ${totalContas} ${plural} com movimento. ` +
    `Debitos ${formatBRL(totalDebito)}, creditos ${formatBRL(totalCredito)}, ` +
    `saldo liquido ${formatBRL(saldoLiquido)}.`;

  let tail = "";
  if (maior) {
    const codigo = maior.contaCodigo ? String(maior.contaCodigo) : "";
    const nome = maior.contaNome ? humanizeName(String(maior.contaNome)) : "(sem conta)";
    const rotulo = [codigo, nome].filter(Boolean).join(" ").trim() || "(sem conta)";
    tail = ` Maior saldo: ${rotulo} (${formatBRL(Number(maior.saldo ?? 0))}).`;
  }

  return cabeca + tail;
};
```

## contabil_movimento_conta
- callsEnriquecer=true buildsRespostaInline=false aggregatesFullSet=false baselineArgs={"contaCodigo":"1.1.01.01"}
- destaqueKeys: ["contagem"]
- EVIDENCIA/FIX: fato_contabil_lancamento_item tem 0 linhas (SELECT count(*) = 0): contabilidade nao operada, so o estado "vazio" e alcancavel hoje. Na query (src/lib/reports/queries/contabil.ts:248-268), o handler expoe em _DESTAQUE APENAS { contagem: total }, e total = prisma.fatoContabilLancamentoItem.count({ where }) com os MESMOS filtros (conta + periodo) das linhas, ou seja contagem e do CONJUNTO INTEIRO (correto, nao da pagina). POReM o handler NAO calcula soma de debito/credito do conjunto inteiro , so a contagem. Logo qualquer soma de valores no formatador so pode vir das linhas[] (pagina atual). O formatador trata isso explicitamente: lidera com a contagem full-set e rotula as somas de debito/credito como "nas partidas exibidas", nunca como total da conta. Por isso aggregatesFullSet=false (a soma monetaria nao tem fonte full-set no envelope).
- NOTAS: Arquetipo A (LIVE): o handler chama enriquecerEnvelope("contabil_movimento_conta", { destaque: { contagem: total }, paginacao }). HOJE a tool NAO esta no registry FORMATADORES (responder.ts:710-790), entao cai em fmtGenerico; mas JA consta em TOOLS_QUE_PRECISAM_FORMATADOR (responder.ts:913), logo o contrato exige um formatador real. Registrar fmtContabilMovimentoConta sob a chave "contabil_movimento_conta" no objeto FORMATADORES, secao // contabil (junto de contabil_plano_de_contas e contabil_estrutura_conta). Chaves de _DESTAQUE disponiveis: APENAS "contagem" (full-set count). Nao ha soma/valor de debito/credito no _DESTAQUE nem no _agregado (o handler so passa contagem). linhas[] (LancamentoItem) trazem: odooId, lancamentoId, dataLancamento (ISO string), contaCodigo, contaNome, centroCustoNome, historico, debito, credito. Sem topPorParticipante (nao e tool financeira de saldo). REGRA DE OURO respeitada: contagem e do conjunto inteiro (count({where}) com os mesmos filtros, query contabil.ts:267); as somas de debito/credito que o formatador exibe sao das partidas listadas (pagina) e o texto deixa isso explicito ("nas partidas exibidas" / "Listando N") , NAO apresenta a pagina como total da conta. Quando quiser um total monetario full-set de verdade, o handler precisaria agregar (groupBy _sum valorDebito/valorCredito sobre o where) e expor em _DESTAQUE (ex.: debitoTotal/creditoTotal); fica para o orquestrador decidir (eu nao edito). Estado atual do dado: fato_contabil_lancamento_item = 0 linhas. So o ramo "vazio" e exercivel, no qual o proprio handler sobrescreve _RESPOSTA via mensagemContabilGestaoVazia(n) (contabil.ts:160). O formatador real cobre o ramo "ok" (futuro, quando lancamentos chegarem) e tambem degrada para mensagem honesta quando contagem=0/linhas vazias. Sem .test.ts irmao; nenhum teste assere _RESPOSTA desta tool (so aparece em mcp/__tests__/integration.test.ts:208 como id do catalogo). baselineArgs: input exige contaId OU contaCodigo (refine). Como o fato esta vazio, nao ha valor real no DB; usei um contaCodigo plausivel ("1.1.01.01") apenas para satisfazer o refine , qualquer chamada hoje retorna "vazio". Tipo: FormatadorCanonico (com t), assinatura (env: Omit<ToolEnvelope,"_RESPOSTA">) => string. Usa formatBRL e humanizeName do escopo de responder.ts. Sem travessao.

```ts
const fmtContabilMovimentoConta: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  const linhas = (env.linhas ?? []) as Array<{
    contaCodigo?: string | null;
    contaNome?: string | null;
    dataLancamento?: string | null;
    historico?: string | null;
    debito?: number | null;
    credito?: number | null;
  }>;

  // _DESTAQUE.contagem vem do handler como o total do CONJUNTO INTEIRO
  // (count({ where }) na query, com os mesmos filtros), nunca da pagina.
  const totalPartidas = Number(d.contagem ?? env._agregado?.contagem ?? 0);

  if (totalPartidas === 0 || linhas.length === 0) {
    // Estado honesto: contabilidade nao operada ou recorte sem partidas.
    // O handler ja preenche _RESPOSTA nesse caso; o formatador espelha.
    return "Nao encontrei lancamentos contabeis nesse recorte (conta ou periodo). Ajuste o filtro e consulte de novo.";
  }

  // Identifica a conta a partir da primeira partida listada.
  const primeira = linhas[0];
  const codigo = primeira?.contaCodigo ? String(primeira.contaCodigo) : "";
  const nome = primeira?.contaNome ? humanizeName(String(primeira.contaNome)) : "";
  const rotuloConta = codigo && nome ? `${codigo} ${nome}` : codigo || nome || "conta informada";

  // ATENCAO (regra de ouro): o handler NAO expoe soma de debito/credito do
  // conjunto inteiro (so a contagem). Por isso os totais de debito/credito
  // abaixo sao das PARTIDAS LISTADAS (a pagina atual), e o texto deixa isso
  // explicito para nao passar a pagina como se fosse o total da conta.
  const somaDebitoPagina = linhas.reduce((s, l) => s + Number(l.debito ?? 0), 0);
  const somaCreditoPagina = linhas.reduce((s, l) => s + Number(l.credito ?? 0), 0);

  const plural = totalPartidas === 1 ? "partida" : "partidas";
  const cabeca = `Razao da conta ${rotuloConta}: ${totalPartidas} ${plural} no periodo.`;

  const mostrando =
    totalPartidas > linhas.length
      ? ` Listando ${linhas.length}: debito ${formatBRL(somaDebitoPagina)}, credito ${formatBRL(somaCreditoPagina)} nas partidas exibidas.`
      : ` Debito ${formatBRL(somaDebitoPagina)}, credito ${formatBRL(somaCreditoPagina)}.`;

  return cabeca + mostrando;
};
```
