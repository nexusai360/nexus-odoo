# PLANO , Fase 1A: Definicao consistente de "demanda a entregar" (whitelist 27 + tipo=venda + janela por pilula)

> Spec fonte: `docs/superpowers/specs/2026-07-20-fase1-base-calculo-entregas-parciais.md` (secao 3, Fase 1A). Ignora Fase 1B.
> Pesquisa/decisoes: `docs/superpowers/research/2026-07-20-entregas-parciais-repaginacao-pesquisa.md` (D3, D4, D5, D7, D8, D9).
> Impacto: `docs/superpowers/research/2026-07-20-impacto-base-demanda.md`.
> Regra do projeto: SEM travessao (em dash) em nenhum texto, codigo ou commit. Responder em pt-BR.

## Goal

Fazer "demanda a entregar" virar UMA metrica, com UM numero, IGUAL em toda ponta (relatorio de Entregas Parciais, card da Visao geral, blocos de Pedidos & Entregas, Nex/MCP, Relatorios 1.0/2.0), corrigindo a definicao e a janela:

1. **Definicao unica (GLOBAL):** `bucket_demanda = 'ABERTA'` passa a ser `op.entraDemanda && tipo === 'venda' && ETAPAS_DEMANDA_ABERTA.has(etapa_id)`. A whitelist de 27 etapas curadas vence os flags dinamicos da etapa. Some o vazamento de "Cancelado" (6/123 fora dos 27), das ~17 etapas de cauda longa, de pecas e de venda a consumidor final (D7, com TODO do dono). O gate de OPERACAO (intragrupo/remessa/transferencia fora) fica preservado.
2. **Janela unica (GLOBAL para esta metrica):** demanda a entregar NAO e recortada pelo corte de leitura (`sync.corte_dados`). A janela vem da PILULA de periodo do topo (Hoje / Esta semana / Este mes / Este ano / Tudo / Personalizado), aplicada por `data_orcamento`; "Tudo" abre do primeiro pedido ate hoje/futuro. O corte de leitura segue valendo para as OUTRAS metricas (faturamento, a receber).

Fase 1A cobre so o que ja esta no cache (2026-01-04 em diante). Trazer os ~51 pedidos pre-2026 e Fase 1B (fora deste plano).

## Architecture

- **Fonte unica materializada:** `fato_pedido.bucket_demanda` (`ABERTA` | `FECHADA` | `IGNORAR`), preenchida pelo builder `src/worker/fatos/fato-pedido-classificacao.ts`, que tem DUAS funcoes gemeas: `classificarPedidosDoRaw` (nasce classificado no rebuild do fato) e `rebuildFatoPedidoClassificacao` (pos-passo do ciclo). As duas classificam identico hoje por copia-e-cola; este plano extrai a decisao para UM helper puro `bucketDoPedido`, matando o risco de deriva entre as gemeas.
- **Dois gates ORTOGONAIS:** OPERACAO (`src/lib/fiscal/regras/classifica-operacao.ts`, por CFOP + intragrupo, `entraDemanda`) e ETAPA (agora a whitelist `ETAPAS_DEMANDA_ABERTA`). Adiciona-se um terceiro guard leve: TIPO do pedido (`tipo === 'venda'`), espelhando o `pd.tipo = 'venda'` do SQL oficial (ID 28).
- **Janela de leitura:** `src/lib/corte-dados.ts` ja tem `janelaClampada(de, ate, corte)` (grampeia `de` ao `corte`). Adiciona-se `janelaDemandaAberta(de, ate)` = `janelaClampada(de, ate, PISO_DEMANDA_ABERTA)` com piso `2000-01-01` (na pratica "abre tudo"), para a metrica de demanda nunca regrampear no corte. O resolvedor de periodo da Diretoria (`src/lib/diretoria/periodo.ts`) hoje grampeia `de` no corte e faz "Tudo" = do corte ate hoje; adiciona-se `resolverJanelaDemanda` que NAO grampeia e faz "Tudo" = janela aberta.
- **4 pontas leitoras** (todas leem a coluna, ninguem reimplementa): Diretoria (`pedidos.ts`, `entregas-parciais.ts`), Relatorios/Nex (`src/lib/reports/queries/comercial.ts` `queryDemandaEmAberta` + tool `mcp/tools/comercial/demanda-em-aberta.ts`), estoque/necessidade de compra (`queryDemandaPorProduto`, `queryEstoqueDisponivel` , ver RISCO R-DEMANDA-ESTOQUE).

## Tech Stack

- TypeScript + Prisma v7 (`@prisma/adapter-pg`), Postgres cache `nexus_odoo_l1` (container `nexus-odoo-db-1`, porta 5436).
- Jest (unit; mocks de `prisma` com `jest.fn()`, ja e o padrao dos testes vizinhos).
- Worker BullMQ (container `worker`, imagem `nexus-odoo:local` construida pelo servico `app`), servidor MCP (container `mcp`, build proprio), app Next.js.

## Global Constraints

- **SEM travessao (em dash)** em codigo, comentario, doc, teste ou mensagem de commit.
- **TDD obrigatorio:** cada task escreve o teste que FALHA, roda e ve falhar, implementa o minimo, roda e ve passar, commita. Commits atomicos por task.
- **Whitelist AUTORITATIVA:** fora da whitelist, o bucket NUNCA pode ser `ABERTA` (INV3). Pertencer ao conjunto vence qualquer flag.
- **Corte = filtro, nunca faxina** (regra duravel): nada e apagado; so muda a LEITURA. A demanda a entregar deixa de ser grampeada no corte, mas as demais metricas continuam grampeando.
- **Rebuild obrigatorio pos-mudanca de container** (regra de raiz do projeto): `src/worker/**` e `src/lib/fiscal/regras/**` -> rebuildar `app` (que reconstroi a imagem do `worker`); `src/lib/reports/queries/**` e `mcp/**` -> rebuildar `mcp`; `src/lib/diretoria/**` -> `app`.
- **Verdade contra o dado real:** E2E contra o cache antes de declarar pronto (Task 11).

## As 27 etapas (curadas do relatorio oficial ID 28, verbatim)

`130, 94, 95, 5, 132, 86, 133, 4, 129, 124, 120, 171, 121, 103, 87, 167, 202, 203, 204, 205, 179, 180, 185, 186, 187, 183, 226` (27 ids). 226 = "Nota emitida e nao entregue" (a excecao da Mariane, JA inclusa). 6 e 123 (Cancelado / VF - Cancelado) NAO estao no conjunto.

---

## Task 1 , Constante unica `ETAPAS_DEMANDA_ABERTA`

**Files**
- Create: `src/lib/fiscal/regras/etapas-demanda-aberta.ts`
- Create (Test): `src/lib/fiscal/regras/__tests__/etapas-demanda-aberta.test.ts`
- Modify: `src/lib/fiscal/regras/index.ts` (re-export)

**Interfaces**
- Produces: `export const ETAPAS_DEMANDA_ABERTA: ReadonlySet<number>`

**Steps (TDD)**

1. Escrever o teste que falha (`etapas-demanda-aberta.test.ts`):

```ts
import { ETAPAS_DEMANDA_ABERTA } from "../etapas-demanda-aberta";

describe("ETAPAS_DEMANDA_ABERTA , whitelist curada do relatorio oficial (ID 28)", () => {
  it("tem exatamente as 27 etapas do oficial", () => {
    expect(ETAPAS_DEMANDA_ABERTA.size).toBe(27);
  });

  it("inclui a excecao 'Nota emitida e nao entregue' (226) e a venda futura em aberto (103,171,179)", () => {
    for (const id of [226, 103, 171, 179, 130, 5]) {
      expect(ETAPAS_DEMANDA_ABERTA.has(id)).toBe(true);
    }
  });

  it("NAO inclui Cancelado (6) nem VF - Cancelado (123)", () => {
    expect(ETAPAS_DEMANDA_ABERTA.has(6)).toBe(false);
    expect(ETAPAS_DEMANDA_ABERTA.has(123)).toBe(false);
  });
});
```

2. Rodar e ver falhar (modulo nao existe): `npx jest src/lib/fiscal/regras/__tests__/etapas-demanda-aberta.test.ts`.

3. Implementar o minimo (`etapas-demanda-aberta.ts`):

```ts
// src/lib/fiscal/regras/etapas-demanda-aberta.ts
// Whitelist AUTORITATIVA das etapas que contam como "demanda a entregar" (bucket ABERTA).
// Lista curada a dedo pelo dono no relatorio oficial de Entregas Parciais do Odoo (ID 28),
// reproduzindo o `pd.etapa_id IN (...)` daquele SQL. Pertencer ao conjunto VENCE os flags
// dinamicos da etapa (finaliza_faturamento/confirmando/cancelando): a regra dinamica antiga
// vazava Cancelado, cauda longa, pecas e venda a consumidor final para dentro da demanda.
//
// TODO(dono): revisar inclusao de pecas/consumidor final na demanda (D7)
//   Ao adotar os 27, pecas e venda a consumidor final SAEM da demanda (some o comprometido
//   dessas familias na necessidade de compra). O dono autorizou remover POR ORA para avancar,
//   mas EXIGE a decisao final. Ver PENDENCIA P1 na pesquisa mestre 2026-07-20.
export const ETAPAS_DEMANDA_ABERTA: ReadonlySet<number> = new Set<number>([
  130, 94, 95, 5, 132, 86, 133, 4, 129, 124, 120, 171, 121, 103, 87, 167,
  202, 203, 204, 205, 179, 180, 185, 186, 187, 183, 226,
]);
```

4. Re-exportar em `index.ts` (adicionar apos a linha do `classificaEtapaDemanda`):

```ts
export { ETAPAS_DEMANDA_ABERTA } from "./etapas-demanda-aberta";
```

5. Rodar e ver passar. `npx tsc --noEmit` verde.

6. Commit: `feat(fase1a): constante unica ETAPAS_DEMANDA_ABERTA (whitelist curada de 27 etapas)`.

---

## Task 2 , Helper puro `bucketDoPedido` (whitelist autoritativa + gate tipo + gate operacao)

Extrai a DECISAO de bucket para uma funcao pura, unica fonte usada pelas duas gemeas do builder (Task 3). Mata o risco de deriva entre `classificarPedidosDoRaw` e `rebuildFatoPedidoClassificacao`.

**Files**
- Modify: `src/worker/fatos/fato-pedido-classificacao.ts` (adiciona e exporta `bucketDoPedido`)
- Create (Test): `src/worker/fatos/fato-pedido-classificacao.test.ts`

**Interfaces**
- Consumes: `ETAPAS_DEMANDA_ABERTA` (Task 1).
- Produces:
```ts
export function bucketDoPedido(input: {
  entraDemanda: boolean;          // gate de OPERACAO (classificaOperacao.entraDemanda)
  tipo: string | null;           // tipo do pedido de venda (fato_pedido.tipo / raw data->>'tipo')
  etapaId: number | null;
  finalizaPedidoCancelando: boolean; // gatilho da etapa (so para distinguir IGNORAR de FECHADA fora da whitelist)
}): "ABERTA" | "FECHADA" | "IGNORAR"
```

**Steps (TDD)**

1. Escrever o teste que falha (`fato-pedido-classificacao.test.ts`), cobrindo os invariantes:

```ts
import { bucketDoPedido } from "./fato-pedido-classificacao";

describe("bucketDoPedido , whitelist autoritativa + gates de tipo e operacao", () => {
  const venda = { entraDemanda: true, tipo: "venda", finalizaPedidoCancelando: false };

  it("etapa na whitelist + venda + operacao valida => ABERTA", () => {
    expect(bucketDoPedido({ ...venda, etapaId: 130 })).toBe("ABERTA");
  });

  it("226 (Nota emitida e nao entregue) esta na whitelist => ABERTA mesmo tendo nota", () => {
    // A excecao antiga por NOME sai; a whitelist cobre 226 diretamente.
    expect(bucketDoPedido({ ...venda, etapaId: 226 })).toBe("ABERTA");
  });

  it("Cancelado (6) fora da whitelist => IGNORAR (some o vazamento, mesmo com flag falso)", () => {
    // No dado real a etapa Cancelado tem finaliza_pedido_cancelando=false; a whitelist elimina.
    expect(bucketDoPedido({ ...venda, etapaId: 6, finalizaPedidoCancelando: false })).toBe("FECHADA");
    // e com o flag verdadeiro tambem nao vira ABERTA:
    expect(bucketDoPedido({ ...venda, etapaId: 6, finalizaPedidoCancelando: true })).toBe("IGNORAR");
  });

  it("etapa de cauda longa fora da whitelist (ex.: AJUSTE FRACIONADO) => NUNCA ABERTA", () => {
    expect(bucketDoPedido({ ...venda, etapaId: 999 })).toBe("FECHADA");
  });

  it("whitelist VENCE flags: etapa 226 com finaliza_faturamento nao muda (bucket nao olha esse flag)", () => {
    expect(bucketDoPedido({ ...venda, etapaId: 187 })).toBe("ABERTA");
  });

  it("gate de TIPO: pedido tipo != 'venda' na mesma etapa => IGNORAR", () => {
    expect(bucketDoPedido({ ...venda, tipo: "romaneio", etapaId: 226 })).toBe("IGNORAR");
    expect(bucketDoPedido({ ...venda, tipo: "producao", etapaId: 130 })).toBe("IGNORAR");
  });

  it("gate de OPERACAO: intragrupo/remessa (entraDemanda=false) => IGNORAR mesmo na whitelist", () => {
    expect(bucketDoPedido({ ...venda, entraDemanda: false, etapaId: 130 })).toBe("IGNORAR");
  });

  it("etapaId nulo, venda, dentro da operacao => nunca ABERTA (sem etapa nao ha pertenca)", () => {
    expect(bucketDoPedido({ ...venda, etapaId: null })).toBe("FECHADA");
  });
});
```

2. Rodar e ver falhar (`bucketDoPedido` nao existe): `npx jest src/worker/fatos/fato-pedido-classificacao.test.ts`.

3. Implementar o minimo em `fato-pedido-classificacao.ts` (adicionar o import da whitelist e a funcao exportada, antes de `classificarPedidosDoRaw`):

```ts
import { ETAPAS_DEMANDA_ABERTA } from "../../lib/fiscal/regras";
```

```ts
/**
 * Decisao UNICA do bucket de demanda de um pedido. Usada pelas duas gemeas do builder
 * (classificarPedidosDoRaw e rebuildFatoPedidoClassificacao) para nao derivarem.
 *
 * Precedencia:
 *   1. Gate de OPERACAO: fora da demanda (intragrupo/remessa/transferencia) => IGNORAR.
 *   2. Gate de TIPO: pedido que nao e de venda (romaneio/producao/transferencia) => IGNORAR.
 *      Espelha `pd.tipo = 'venda'` do relatorio oficial (ID 28).
 *   3. Whitelist AUTORITATIVA: etapa nos 27 curados => ABERTA. Pertencer vence os flags.
 *   4. Fora da whitelist NUNCA e ABERTA: cancelado => IGNORAR; o resto => FECHADA.
 */
export function bucketDoPedido(input: {
  entraDemanda: boolean;
  tipo: string | null;
  etapaId: number | null;
  finalizaPedidoCancelando: boolean;
}): "ABERTA" | "FECHADA" | "IGNORAR" {
  if (!input.entraDemanda) return "IGNORAR";
  if (input.tipo !== "venda") return "IGNORAR";
  if (input.etapaId != null && ETAPAS_DEMANDA_ABERTA.has(input.etapaId)) return "ABERTA";
  return input.finalizaPedidoCancelando ? "IGNORAR" : "FECHADA";
}
```

4. Rodar e ver passar. `npx tsc --noEmit` verde.

5. Commit: `feat(fase1a): helper puro bucketDoPedido com whitelist autoritativa e gates tipo/operacao`.

---

## Task 3 , Ligar as duas gemeas ao `bucketDoPedido` (whitelist + tipo nas duas funcoes)

Troca o `if (!op.entraDemanda) ... else classificaEtapaDemanda(...)` inline (duplicado nas duas funcoes) pela chamada unica ao helper. Adiciona a coluna `tipo` nas duas leituras. Remove o import do `classificaEtapaDemanda` do builder.

**Files**
- Modify: `src/worker/fatos/fato-pedido-classificacao.ts`
- Modify (Test): `src/worker/fatos/fato-pedido-classificacao.test.ts` (adiciona teste de fiacao via `classificarPedidosDoRaw`)

**Interfaces**
- Consumes: `bucketDoPedido` (Task 2), `classificaOperacao`, `carregarParticipantesGrupo`.
- Produces (inalterado externamente): `classificarPedidosDoRaw(prisma): Promise<Map<number, ClassificacaoPedido>>`, `rebuildFatoPedidoClassificacao(prisma): Promise<number>`.

**Steps (TDD)**

1. Escrever o teste de fiacao que falha (append em `fato-pedido-classificacao.test.ts`). Ele exercita `classificarPedidosDoRaw` com um `prisma` dublê: `carregarParticipantesGrupo` le `fatoParceiro.findMany`; a funcao chama `$queryRaw` duas vezes (etapas, depois pedidos), nesta ordem.

```ts
import { classificarPedidosDoRaw } from "./fato-pedido-classificacao";

function makePrisma(opts: {
  etapas: { odoo_id: number; nome: string; fin_fat: boolean; fin_conf: boolean; fin_canc: boolean;
            apr_ped: boolean; apr_fin: boolean; apr_est: boolean; apr_fat: boolean; fin_fin: boolean; fin_est: boolean }[];
  pedidos: { odoo_id: number; etapa_id: number | null; participante_id: number | null;
             participante_nome: string | null; cfop: string | null; tipo: string | null }[];
}) {
  const queryRaw = jest
    .fn()
    .mockResolvedValueOnce(opts.etapas)   // 1a chamada: etapas
    .mockResolvedValueOnce(opts.pedidos); // 2a chamada: pedidos
  return {
    fatoParceiro: { findMany: jest.fn().mockResolvedValue([]) }, // sem intragrupo
    $queryRaw: queryRaw,
  } as never;
}

const etapaBase = { fin_fat: false, fin_conf: false, fin_canc: false, apr_ped: false,
  apr_fin: false, apr_est: false, apr_fat: false, fin_fin: false, fin_est: false };

describe("classificarPedidosDoRaw , whitelist + tipo aplicados de ponta a ponta", () => {
  it("venda com CFOP de venda na etapa 130 => ABERTA; romaneio na mesma etapa => IGNORAR", async () => {
    const prisma = makePrisma({
      etapas: [{ odoo_id: 130, nome: "Aguardando Autorizacao", ...etapaBase }],
      pedidos: [
        { odoo_id: 1, etapa_id: 130, participante_id: 10, participante_nome: "Cliente X", cfop: "5102", tipo: "venda" },
        { odoo_id: 2, etapa_id: 130, participante_id: 10, participante_nome: "Cliente X", cfop: "5102", tipo: "romaneio" },
      ],
    });
    const out = await classificarPedidosDoRaw(prisma);
    expect(out.get(1)!.bucketDemanda).toBe("ABERTA");
    expect(out.get(2)!.bucketDemanda).toBe("IGNORAR");
  });

  it("venda com CFOP de venda na etapa Cancelado (6, fora da whitelist) => nao e ABERTA", async () => {
    const prisma = makePrisma({
      etapas: [{ odoo_id: 6, nome: "Cancelado", ...etapaBase }],
      pedidos: [{ odoo_id: 3, etapa_id: 6, participante_id: 10, participante_nome: "Cliente X", cfop: "5102", tipo: "venda" }],
    });
    const out = await classificarPedidosDoRaw(prisma);
    expect(out.get(3)!.bucketDemanda).not.toBe("ABERTA");
  });
});
```

2. Rodar e ver falhar: o teste quebra porque hoje a query de pedidos NAO seleciona `tipo` (campo ausente => `tipo` undefined => gate barra tudo, ou a regra antiga marca 6 como ABERTA). `npx jest src/worker/fatos/fato-pedido-classificacao.test.ts`.

3. Implementar. Em `fato-pedido-classificacao.ts`:

   3a. Adicionar `tipo` na interface `PedidoRow`:
```ts
interface PedidoRow {
  odoo_id: number;
  etapa_id: number | null;
  participante_id: number | null;
  participante_nome: string | null;
  cfop: string | null;
  tipo: string | null;
}
```

   3b. Em `classificarPedidosDoRaw`, adicionar `tipo` ao SELECT dos pedidos (le do RAW `raw_pedido_documento`):
```ts
    select (p.data->>'id')::int as odoo_id,
           (p.data->'etapa_id'->>0)::int as etapa_id,
           (p.data->'participante_id'->>0)::int as participante_id,
           (p.data->'participante_id'->>1) as participante_nome,
           (p.data->>'tipo') as tipo,
           it.cfop
    from raw_pedido_documento p
```

   3c. Em `rebuildFatoPedidoClassificacao`, adicionar `f.tipo` ao SELECT (le de `fato_pedido`):
```ts
    select f.odoo_id, f.etapa_id, f.participante_id, f.participante_nome, f.tipo, it.cfop
    from fato_pedido f
```

   3d. Nas DUAS funcoes, trocar o bloco de decisao de bucket. Substituir, nos dois lugares:
```ts
    let bucket: string;
    if (!op.entraDemanda) {
      bucket = "IGNORAR";
    } else {
      const g = p.etapa_id !== null ? gatilhoPorEtapa.get(p.etapa_id) : undefined;
      bucket = g
        ? classificaEtapaDemanda({
            nome: g.nome ?? "",
            finalizaFaturamento: g.fin_fat,
            finalizaPedidoConfirmando: g.fin_conf,
            finalizaPedidoCancelando: g.fin_canc,
          })
        : "ABERTA";
    }
```
   por:
```ts
    const g = p.etapa_id !== null ? gatilhoPorEtapa.get(p.etapa_id) : undefined;
    const bucket = bucketDoPedido({
      entraDemanda: op.entraDemanda,
      tipo: p.tipo,
      etapaId: p.etapa_id,
      finalizaPedidoCancelando: g?.fin_canc ?? false,
    });
```

   3e. Remover `classificaEtapaDemanda` do import (linha 11-15), deixando `classificaOperacao` e `notaEhVendaExterna`:
```ts
import { classificaOperacao, notaEhVendaExterna } from "../../lib/fiscal/regras";
```

4. Rodar e ver passar (todos os testes do arquivo). `npx tsc --noEmit` verde.

5. Commit: `feat(fase1a): builder aplica bucketDoPedido nas duas gemeas com gate de tipo (whitelist autoritativa)`.

---

## Task 4 , Remover a excecao "Nota emitida e nao entregue" de `classificaEtapaDemanda`

A excecao por NOME sai (226 esta na whitelist e o builder nao usa mais essa funcao para decidir ABERTA). A funcao continua exportada em `regras/index.ts` (API publica), agora sem a excecao.

**Files**
- Modify: `src/lib/fiscal/regras/classifica-etapa-demanda.ts`
- Modify (Test): `src/lib/fiscal/regras/__tests__/classifica-etapa-demanda.test.ts`

**Interfaces**
- Produces (inalterado): `classificaEtapaDemanda(g: GatilhosEtapa): EstagioDemanda`.

**Steps (TDD)**

1. Atualizar o teste para o novo contrato (falha primeiro). Remover os dois casos "Nota emitida e nao entregue => ABERTA" (linhas 56-70) e trocar por um caso que DOCUMENTA a mudanca: com `finalizaFaturamento` a etapa vira FECHADA; a excecao por nome nao existe mais e a demanda de 226 e responsabilidade da whitelist.

```ts
  it("Nota emitida e nao entregue: sem excecao por nome; com nota emitida => FECHADA (a whitelist e quem mantem 226 na demanda)", () => {
    expect(
      classificaEtapaDemanda({
        ...base,
        nome: "Nota emitida e nao entregue.",
        finalizaFaturamento: true,
      }),
    ).toBe("FECHADA");
  });
```

2. Rodar e ver falhar (a funcao ainda tem a excecao, devolve ABERTA): `npx jest src/lib/fiscal/regras/__tests__/classifica-etapa-demanda.test.ts`.

3. Implementar: em `classifica-etapa-demanda.ts`, remover a funcao `ehExcecaoNotaEmitidaNaoEntregue` (linhas 34-40) e a linha que a chama (`if (ehExcecaoNotaEmitidaNaoEntregue(nome)) return "ABERTA";`). O corpo final:

```ts
/**
 * Classifica o estagio da etapa quanto a demanda (por gatilho, sem excecao por nome).
 * Ordem: cancelamento > conclusao/emissao > (fallback) ABERTA.
 *
 * NOTA (Fase 1A): quem decide "demanda a entregar = ABERTA" e a whitelist autoritativa
 * ETAPAS_DEMANDA_ABERTA no builder (bucketDoPedido). Esta funcao continua util como leitura
 * de estagio da etapa, mas NAO e mais a fonte do bucket. A excecao antiga "Nota emitida e nao
 * entregue" saiu: a etapa 226 e mantida na demanda pela whitelist, nao por nome.
 */
export function classificaEtapaDemanda(g: GatilhosEtapa): EstagioDemanda {
  if (g.finalizaPedidoCancelando) return "IGNORAR";
  if (g.finalizaFaturamento || g.finalizaPedidoConfirmando) return "FECHADA";
  return "ABERTA";
}
```

Ajustar o cabecalho do arquivo (linhas 34-40 e o comentario de precedencia) para remover a mencao a `normalizar`/excecao se `normalizar` ficar sem uso. Se `normalizar` ficar orfa, remove-la tambem (o `tsc`/eslint acusa). Verificar apos a edicao.

4. Rodar e ver passar. `npx tsc --noEmit` + eslint verdes (sem imports/funcoes orfas).

5. Commit: `refactor(fase1a): remove excecao por nome de classificaEtapaDemanda (226 vai pela whitelist)`.

---

## Task 5 , Helpers de janela de demanda (piso 2000 + resolvedor sem grampo no corte)

Introduz a janela que NAO grampeia no corte de leitura (para a demanda a entregar) e o resolvedor de periodo da Diretoria correspondente, onde "Tudo" abre a janela inteira.

**Files**
- Modify: `src/lib/corte-dados.ts` (adiciona `PISO_DEMANDA_ABERTA` + `janelaDemandaAberta`)
- Modify: `src/lib/diretoria/periodo.ts` (exporta `resolverPeriodoDirBruto`, adiciona `resolverJanelaDemanda`)
- Modify (Test): `src/lib/corte-dados.test.ts` (se existir; senao criar) e `src/lib/diretoria/periodo.test.ts` (se existir; senao criar)

**Interfaces**
- Produces:
```ts
export const PISO_DEMANDA_ABERTA = "2000-01-01";
export function janelaDemandaAberta(de?: string, ate?: string): Janela; // = janelaClampada(de, ate, PISO_DEMANDA_ABERTA)
export function resolverJanelaDemanda(params: PeriodoDirParams, hoje: Date): { periodoDe?: string; periodoAte?: string };
```

**Steps (TDD)**

1. Verificar se `src/lib/corte-dados.test.ts` e `src/lib/diretoria/periodo.test.ts` existem (`ls`). Criar os que faltarem.

2. Escrever os testes que falham:

   `corte-dados.test.ts` (append):
```ts
import { janelaDemandaAberta, PISO_DEMANDA_ABERTA } from "./corte-dados";

describe("janelaDemandaAberta , demanda a entregar nao grampeia no corte", () => {
  it("sem periodo => abre do piso (2000) ate o fim aberto", () => {
    const j = janelaDemandaAberta();
    expect(j.gte.toISOString().slice(0, 10)).toBe(PISO_DEMANDA_ABERTA);
    expect(j.lt.getUTCFullYear()).toBeGreaterThanOrEqual(2100);
  });

  it("com intervalo anterior ao corte NAO grampeia (recorta exato)", () => {
    const j = janelaDemandaAberta("2024-11-01", "2025-12-31");
    expect(j.gte.toISOString().slice(0, 10)).toBe("2024-11-01");
    expect(j.cortado).toBe(false); // piso 2000, entao nunca "cortado"
  });
});
```

   `periodo.test.ts` (append):
```ts
import { resolverJanelaDemanda } from "./periodo";

const HOJE = new Date("2026-07-20T12:00:00Z");

describe("resolverJanelaDemanda , pilula manda, sem grampo no corte", () => {
  it("'tudo' => janela ABERTA (sem de/ate)", () => {
    const r = resolverJanelaDemanda({ periodo: "tudo" }, HOJE);
    expect(r.periodoDe).toBeUndefined();
    expect(r.periodoAte).toBeUndefined();
  });

  it("'este_mes' => recorta o mes exato (nao grampeia no corte)", () => {
    const r = resolverJanelaDemanda({ periodo: "este_mes" }, HOJE);
    expect(r.periodoDe).toBe("2026-07-01");
    expect(r.periodoAte).toBe("2026-07-31");
  });

  it("'custom' anterior ao corte NAO e puxado para o corte", () => {
    const r = resolverJanelaDemanda({ periodo: "custom", de: "2024-11-01", ate: "2025-01-31" }, HOJE);
    expect(r.periodoDe).toBe("2024-11-01");
    expect(r.periodoAte).toBe("2025-01-31");
  });
});
```

3. Rodar e ver falhar.

4. Implementar:

   `corte-dados.ts` (adicionar apos `janelaClampada`):
```ts
/**
 * Piso da metrica "demanda a entregar": ela NAO e recortada pelo corte de leitura (D8/RF-A5).
 * A janela vem so da pilula de periodo; o piso 2000 e "abre tudo" (na pratica, do primeiro
 * pedido). As OUTRAS metricas continuam usando janelaClampada (piso no corte).
 */
export const PISO_DEMANDA_ABERTA = "2000-01-01";

/** Janela de leitura da demanda a entregar: recorta pela pilula, sem grampear no corte. */
export function janelaDemandaAberta(de?: string, ate?: string): Janela {
  return janelaClampada(de, ate, PISO_DEMANDA_ABERTA);
}
```

   `periodo.ts`: exportar `resolverPeriodoDirBruto` (trocar `function resolverPeriodoDirBruto` por `export function resolverPeriodoDirBruto`) e adicionar:
```ts
/**
 * Janela de periodo da Diretoria PARA A DEMANDA A ENTREGAR: usa a mesma pilula, mas NAO
 * grampeia no corte de leitura (a demanda nao e cortada pelo corte, D8/RF-A5). "Tudo" abre
 * a janela inteira (sem de/ate). Os demais presets recortam pelo intervalo exato.
 */
export function resolverJanelaDemanda(
  params: PeriodoDirParams,
  hoje: Date,
): { periodoDe?: string; periodoAte?: string } {
  const bruto = resolverPeriodoDirBruto(params, hoje);
  if (bruto.preset === "tudo") return {}; // janela aberta: do primeiro pedido ate o futuro
  return { periodoDe: isoDiaUtc(bruto.de), periodoAte: isoDiaUtc(bruto.ate) };
}

/** AAAA-MM-DD de um Date em UTC (o resolvedor bruto ja trabalha em UTC). */
function isoDiaUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}
```

   (Se `periodo.ts` ja tiver um helper de ISO, reusar em vez de criar `isoDiaUtc`.)

5. Rodar e ver passar. `npx tsc --noEmit` verde.

6. Commit: `feat(fase1a): janelaDemandaAberta e resolverJanelaDemanda (demanda segue a pilula, nao o corte)`.

---

## Task 6 , Card/blocos da Diretoria (`pedidos.ts`) leem a janela de demanda

`carregarAbertas` (universo unico de B2/B4/B6/B6b/B7 + card) troca `janelaClampada` por `janelaDemandaAberta`.

**Files**
- Modify: `src/lib/diretoria/queries/pedidos.ts`
- Modify (Test): `src/lib/diretoria/queries/pedidos.test.ts`

**Interfaces**
- Consumes: `janelaDemandaAberta` (Task 5).
- Produces (inalterado): as funcoes `queryDemandas*` / `queryIndicadoresDemandas`.

**Steps (TDD)**

1. Escrever teste que falha: um pedido ABERTA com `dataOrcamento` anterior ao corte (ex.: 2026-01-10, com corte padrao 2026-03-16) e SEM periodo informado deve ENTRAR no resultado (a demanda nao e cortada). Estilo do arquivo: `pedidos.test.ts` mocka `fatoPedido.findMany` capturando o `where`. Assertar que o `where.dataOrcamento.gte` NAO e o corte, e sim o piso 2000 (ou verificar via um pedido pre-corte incluido). Exemplo direto no `where`:

```ts
it("carregarAbertas usa a janela de demanda (piso 2000), nao o corte de leitura", async () => {
  const findMany = jest.fn().mockResolvedValue([]);
  const prisma = {
    fatoPedido: { findMany },
    fatoPedidoItem: { findMany: jest.fn().mockResolvedValue([]) },
    fatoProduto: { findMany: jest.fn().mockResolvedValue([]) },
    fatoBuildState: { findUnique: jest.fn().mockResolvedValue(null) },
    fatoParceiro: { findMany: jest.fn().mockResolvedValue([]) },
  } as never;
  await queryIndicadoresDemandas(prisma, new Date("2026-07-20"), {});
  const where = findMany.mock.calls[0][0].where;
  expect(where.dataOrcamento.gte.toISOString().slice(0, 10)).toBe("2000-01-01");
});
```

2. Rodar e ver falhar (hoje o `gte` e o corte).

3. Implementar: em `pedidos.ts`, trocar o import e a chamada em `carregarAbertas`:
```ts
import { janelaDemandaAberta } from "@/lib/corte-dados";
```
```ts
  const j = janelaDemandaAberta(filtros.periodoDe, filtros.periodoAte);
```
Atualizar o comentario do bloco (linhas 59-70) para dizer que a demanda a entregar segue a pilula, nao o corte.

4. Rodar e ver passar. `npx tsc --noEmit` verde.

5. Commit: `feat(fase1a): demanda da diretoria (pedidos.ts) segue a janela da pilula, sem grampo no corte`.

---

## Task 7 , Relatorio de Entregas Parciais: janela de demanda + filtro de empresa (RF-A8) + estado vazio (RF-A9)

**Files**
- Modify: `src/lib/diretoria/queries/entregas-parciais.ts`
- Modify (Test): `src/lib/diretoria/queries/entregas-parciais.test.ts`

**Interfaces**
- Consumes: `janelaDemandaAberta`.
- Produces (inalterado): `queryEntregasParciais(prisma, hoje, filtros): Promise<EntregasParciaisData>`. `filtros.empresaId` ja e honrado por `buildEmpresaWhere` (nada novo). `ignorarCorteDados` deixa de alterar o resultado (a demanda sempre segue a pilula); mantido no tipo por compat e marcado como obsoleto.

**Steps (TDD)**

1. Escrever testes que falham:

   (a) janela sem grampo:
```ts
it("usa a janela de demanda (piso 2000), nao o corte", async () => {
  const prisma = makePrisma({ pedidos: [], itens: [], produtos: [], parceiros: [] });
  await queryEntregasParciais(prisma, HOJE, {});
  const where = (prisma as any).fatoPedido.findMany.mock.calls[0][0].where;
  expect(where.dataOrcamento.gte.toISOString().slice(0, 10)).toBe("2000-01-01");
});
```
   (b) filtro de empresa (RF-A8): pedido de empresa 2 nao aparece quando `empresaId: 1`. Como `buildEmpresaWhere` injeta `empresaId` no `where` do Prisma e o dublê de `fatoPedido.findMany` retorna a lista fixa, assertar que o `where.empresaId === 1` foi repassado:
```ts
it("RF-A8: repassa o filtro de empresa ao where (recorta B-08/B-09)", async () => {
  const prisma = makePrisma({ pedidos: [], itens: [], produtos: [], parceiros: [] });
  await queryEntregasParciais(prisma, HOJE, { empresaId: 1 });
  const where = (prisma as any).fatoPedido.findMany.mock.calls[0][0].where;
  expect(where.empresaId).toBe(1);
});
```
   (c) estado vazio (RF-A9): empresa sem entregas devolve indicadores zerados + linhas vazias, sem quebrar:
```ts
it("RF-A9: empresa sem entregas => indicadores zerados e linhas vazias (estado vazio representavel)", async () => {
  const prisma = makePrisma({ pedidos: [], itens: [], produtos: [], parceiros: [] });
  const data = await queryEntregasParciais(prisma, HOJE, { empresaId: 999 });
  expect(data.linhas).toHaveLength(0);
  expect(data.indicadores.qtdPedidos).toBe(0);
  expect(data.indicadores.aAtenderCusto).toBe(0);
});
```

2. Rodar e ver falhar (a janela ainda grampeia no corte quando `ignorarCorteDados` e false).

3. Implementar: trocar o calculo de `janela` em `queryEntregasParciais`:
```ts
import { janelaDemandaAberta } from "@/lib/corte-dados";
```
```ts
  // Demanda a entregar segue a pilula de periodo, nunca o corte de leitura (D8/RF-A5).
  // `ignorarCorteDados` ficou obsoleto: a demanda ja abre pela pilula (piso 2000). Mantido
  // no tipo por compat com o toggle da UI, que sai numa fase de frontend.
  const janela = janelaDemandaAberta(filtros.periodoDe, filtros.periodoAte);
```
Remover o import agora ocioso de `corteAtualDate`/`janelaClampada` se ficar sem uso (verificar: `corteAtualDate` ainda e usado por `statusBloqueioPorCliente` , manter; `janelaClampada` some do arquivo se nao usado em outro ponto).

4. Rodar e ver passar (incluindo os testes existentes de UF/reconciliacao). `npx tsc --noEmit` verde.

5. Commit: `feat(fase1a): entregas parciais seguem a pilula (RF-A5), filtro de empresa e estado vazio cobertos (RF-A8/A9)`.

---

## Task 8 , `queryDemandaEmAberta` (Nex/Relatorios) aceita periodo e larga o corte

**Files**
- Modify: `src/lib/reports/queries/comercial.ts`
- Modify: `mcp/tools/comercial/demanda-em-aberta.ts` (inputSchema recebe periodo)
- Modify (Test): `src/lib/reports/queries/comercial.test.ts`

**Interfaces**
- Consumes: `janelaDemandaAberta`.
- Produces: `queryDemandaEmAberta(prisma, { empresaId?, etapa?, limite?, ordenacao?, periodoDe?, periodoAte? })`. Sem periodo => janela aberta (piso 2000, sem teto) = demanda inteira, NAO cortada pelo corte (D8). Com periodo => recorta por `data_orcamento`.

**Steps (TDD)**

1. Escrever teste que falha. O arquivo `comercial.test.ts` mocka `prisma.$queryRaw`. Como o filtro de data virou parametro do template, o mais robusto e assertar o comportamento: um pedido ABERTA pre-corte (2026-01-10) entra quando nao ha periodo; e um `periodoAte` estreita a janela. Se o teste do arquivo hoje mocka `$queryRaw` devolvendo linhas fixas (ignorando o WHERE), adaptar para capturar os PARAMETROS interpolados e conferir que a data-piso passada e 2000-01-01 (nao o corte). Exemplo capturando os values do tagged template:

```ts
it("sem periodo, a janela de demanda abre no piso 2000 (nao no corte)", async () => {
  const queryRaw = jest.fn().mockResolvedValue([]);
  const prisma = { $queryRaw: queryRaw, fatoBuildState: { findUnique: jest.fn().mockResolvedValue(null) } } as never;
  await queryDemandaEmAberta(prisma, {});
  // O 2o argumento em diante de um tagged template sao os valores interpolados.
  const values = queryRaw.mock.calls[0].slice(1);
  const temPiso2000 = values.some(
    (v: unknown) => v instanceof Date && v.toISOString().slice(0, 10) === "2000-01-01",
  );
  expect(temPiso2000).toBe(true);
});
```

2. Rodar e ver falhar (hoje interpola `corteAtualDate()`).

3. Implementar em `comercial.ts`:
   - Import: `import { janelaDemandaAberta } from "@/lib/corte-dados";` (mantendo `corteAtualDate`/`janelaClampada` para as OUTRAS funcoes do arquivo).
   - Estender o tipo de `filtros`:
```ts
export async function queryDemandaEmAberta(
  prisma: PrismaClient,
  filtros: { empresaId?: number; etapa?: string; limite?: number; ordenacao?: OrdenacaoDemanda;
             periodoDe?: string; periodoAte?: string } = {},
): Promise<{ /* inalterado */ }> {
```
   - Calcular a janela e trocar o filtro de data no SQL:
```ts
  const j = janelaDemandaAberta(filtros.periodoDe, filtros.periodoAte);
```
   - No corpo do `$queryRaw`, trocar:
```ts
      AND f.data_orcamento >= ${corteAtualDate()}
```
   por:
```ts
      -- Demanda a entregar NAO e cortada pelo corte de leitura (D8/RF-A5): a janela vem da
      -- pilula de periodo. Sem periodo, abre a demanda inteira (piso 2000).
      AND f.data_orcamento >= ${j.gte}
      AND f.data_orcamento <  ${j.lt}
```

   `demanda-em-aberta.ts` (MCP): adicionar ao `inputSchema` os campos opcionais e deixar o passthrough (`queryDemandaEmAberta(ctx.prisma, input)`) fluir:
```ts
  periodoDe: z.string().optional().describe("Inicio da janela (AAAA-MM-DD). Ausente = demanda inteira (nao cortada pelo corte de leitura)."),
  periodoAte: z.string().optional().describe("Fim da janela (AAAA-MM-DD). Ausente = ate hoje/futuro."),
```

4. Rodar e ver passar. `npx tsc --noEmit` verde (app + mcp: `npx tsc -p mcp` se houver tsconfig proprio; conferir).

5. Commit: `feat(fase1a): queryDemandaEmAberta e tool MCP aceitam periodo e nao cortam a demanda pelo corte`.

---

## Task 9 , Fiar os callers: pagina Pedidos & Entregas e card da Visao geral

Faz as paginas passarem a JANELA DE DEMANDA (sem grampo, "Tudo" aberto) e a EMPRESA para as consultas de demanda, para o card == relatorio == blocos baterem para a mesma pilula + empresa (D8/D9).

**Files**
- Modify: `src/app/(protected)/diretoria/pedidos/page.tsx`
- Modify: `src/app/(protected)/diretoria/visao-geral/page.tsx`

**Interfaces**
- Consumes: `resolverJanelaDemanda` (Task 5), `queryIndicadoresDemandas` / `queryEntregasParciais` (janela de demanda ja interna).

**Steps**

1. `pedidos/page.tsx`: alem do `periodo` (que segue clampado no corte para OUTRAS metricas, se houver), resolver a janela de demanda e usar nos blocos de demanda. Minimo: montar `fDemanda` a partir de `resolverJanelaDemanda`:
```ts
import { resolverJanelaDemanda } from "@/lib/diretoria/periodo";
```
```ts
  const jd = resolverJanelaDemanda(
    { periodo: param("periodo"), de: param("de"), ate: param("ate") },
    hoje,
  );
  const fDemanda = { ufs, periodoDe: jd.periodoDe, periodoAte: jd.periodoAte, empresaId: empresaSel?.empresaId };
```
   Passar `fDemanda` nas consultas de demanda (indicadores, porUf, pendentes, porEtapa, maisParadas, entregasParciais) no lugar de `f`. Manter `f` (corte padrao) so onde a metrica NAO for demanda a entregar. Remover o `ignorarCorteDados: incluiAntigos` (agora redundante) da chamada de `queryEntregasParciais`, passando `{ ...fDemanda }`.

2. `visao-geral/page.tsx`: o card "Demandas a entregar" chama hoje `queryIndicadoresDemandas(prisma, hoje, { ufs })` , sem periodo nem empresa, entao NAO segue a pilula (viola D9). Trocar para passar a janela de demanda e a empresa:
```ts
  const jd = resolverJanelaDemanda(
    { periodo: param("periodo"), de: param("de"), ate: param("ate") },
    hoje,
  );
  // ... dentro do Promise.all:
  queryIndicadoresDemandas(prisma, hoje, { ufs, periodoDe: jd.periodoDe, periodoAte: jd.periodoAte, empresaId: empresaSel?.empresaId }),
```
   (Confirmar como a visao-geral resolve `empresaSel`; reusar o mesmo padrao ja presente no arquivo.)

3. Verificacao: `npx tsc --noEmit` verde. Paginas RSC nao tem teste unitario; a paridade card==relatorio==blocos e checada no E2E (Task 11).

4. Commit: `feat(fase1a): paginas de Pedidos e Visao geral passam janela de demanda e empresa (card == relatorio, D8/D9)`.

---

## Task 10 , Documentacao (mesmo commit da regra, RF-A7)

**Files**
- Modify: `docs/kpis-diretoria.md` (secao 6, "Demandas a entregar")
- Modify: `src/lib/agent/bi-schema-reference.ts` (comentario de `fato_pedido` / bucket_demanda)

**Steps**

1. `docs/kpis-diretoria.md` secao 6: trocar a definicao de ABERTA. Onde hoje diz que "ABERTA e decidido pelos gatilhos da propria etapa", passar a explicar:
   - ABERTA = `op.entraDemanda` (gate de operacao, intragrupo/remessa fora) **E** `tipo = 'venda'` **E** `etapa_id` na **whitelist curada de 27 etapas** do relatorio oficial (ID 28). A whitelist VENCE os flags.
   - Cancelado (6/123) sai pela whitelist; pecas e venda a consumidor final saem (TODO(dono) D7).
   - A demanda a entregar NAO e cortada pelo corte de leitura: a janela vem da pilula de periodo; "Tudo" abre do primeiro pedido. As demais metricas seguem o corte.
   Atualizar a fonte na abertura da secao para: `fato_pedido` com `bucket_demanda='ABERTA'`, janela pela pilula (nao `data_orcamento >= corte`).

2. `bi-schema-reference.ts`: no comentario da tabela `fato_pedido` (e no trecho L332-334 sobre "produto com mais demanda"), acrescentar a definicao de `bucket_demanda`:
```
-- bucket_demanda: ABERTA | FECHADA | IGNORAR. ABERTA = demanda a entregar = pedido de VENDA
-- (tipo='venda'), operacao que entra na demanda (nao intragrupo/remessa), e etapa_id na
-- whitelist curada de 27 etapas do relatorio oficial. A whitelist VENCE os flags da etapa.
-- A demanda a entregar NAO e recortada pelo corte de leitura (segue a pilula de periodo).
```
   Como `fato_pedido` no schema-reference nao lista as colunas materializadas (bucket_demanda/categoria_operacao/pendencia_etapa), adicionar essas 3 colunas ao bloco `TABLE fato_pedido (...)` com o comentario acima em `bucket_demanda`.

3. Rodar `npx jest src/lib/agent/bi-schema-reference.test.ts` (garante que o texto do schema nao quebrou asserts existentes). Ajustar o teste se ele fixar o conteudo do schema.

4. Commit: `docs(fase1a): kpis-diretoria e bi-schema-reference documentam a demanda (whitelist 27 + tipo + janela pela pilula)`.

---

## Task 11 , Rebuild dos fatos + containers e verificacao E2E contra o cache real

**Files**
- Nenhum arquivo de codigo (task de operacao/verificacao). Registrar achados na conversa e, se algo ficar pendente, em `docs/RADAR.md`.

**Steps**

1. Suite completa verde antes de tocar container:
```
npx tsc --noEmit && npx jest && npx eslint .
```

2. Rebuild dos containers (regra de raiz , o `worker` nao tem build proprio; a imagem sai do `app`):
```
docker compose build app
docker compose up -d --force-recreate worker app
docker compose up -d --build mcp
# conferir que a imagem e de AGORA:
docker image inspect nexus-odoo:local --format '{{.Created}}'
```

3. Forcar o rebuild do `fato_pedido_classificacao` (o builder roda por ultimo no ciclo incremental do worker). Reiniciar o worker ja dispara um ciclo; aguardar o marcador de build avancar:
```
docker logs -f nexus-odoo-worker-1   # esperar o ciclo classificar e o markFatoBuilt("fato_pedido_classificacao")
```
   (Se houver script one-off de rebuild de fatos no repo, usa-lo; senao, o ciclo do worker repopula a coluna.)

4. Verificacao E2E contra o cache (`docker exec nexus-odoo-db-1 psql -U nexus -d nexus_odoo_l1 -c "..."`). Hipoteses a confirmar:

   4a. **Cancelado e nao-venda somem da demanda:**
```sql
-- Deve dar 0 linhas: nenhuma etapa fora dos 27 pode estar ABERTA.
select etapa_id, count(*) from fato_pedido
where bucket_demanda='ABERTA'
  and etapa_id not in (130,94,95,5,132,86,133,4,129,124,120,171,121,103,87,167,202,203,204,205,179,180,185,186,187,183,226)
group by 1;
-- Deve dar 0: Cancelado (6) / VF-Cancelado (123) fora da demanda.
select count(*) from fato_pedido where bucket_demanda='ABERTA' and etapa_id in (6,123);
-- Deve dar 0: nenhum ABERTA com tipo != venda.
select tipo, count(*) from fato_pedido where bucket_demanda='ABERTA' group by 1;
```

   4b. **Pecas / consumidor final fora** (spot check dos PVs citados na pesquisa: PV-1532/0738/2346 pecas, PV-1810/1811/1091 consumidor final): confirmar que nao aparecem como ABERTA.
```sql
select numero, etapa_nome, bucket_demanda from fato_pedido
where numero in ('PV-1532/26','PV-1810/26','PV-2666/26','PV-1446/26','PV-1057/26');
-- esperado: nenhum com bucket_demanda='ABERTA'.
```

   4c. **Paridade das 3 pontas para o MESMO periodo + empresa.** Escolher uma janela (ex.: "Tudo" = sem recorte de data para a demanda) e uma empresa (ou todas). Comparar:
   - **Relatorio** (`queryEntregasParciais`): total de custo a atender e qtd de pedidos.
   - **Card / blocos** (`queryIndicadoresDemandas`): `valorAEntregar` e `totalPendentes`.
   - **Nex** (`queryDemandaEmAberta`): `valorCusto` e `totalPedidos`.
   Como as tres leem `bucket_demanda='ABERTA'` + `aAtenderDoItem` + a MESMA janela de demanda, os numeros de custo/qtd tem que bater (INV1). Conferir com SQL espelho:
```sql
-- Qtd de pedidos ABERTA sem recorte de data (equivale a "Tudo"):
select count(*) from fato_pedido where bucket_demanda='ABERTA';
```
   Rodar as tres funcoes via um script/tsx apontando para o cache (ou pelas telas + tool MCP) e conferir igualdade dentro de tolerancia de centavos.

   4d. **Nao-regressao das OUTRAS metricas:** `queryPedidosPeriodo`, `queryContarPedidos`, faturamento e a receber continuam grampeando no corte (nao mudaram). Conferir que os totais dessas metricas NAO se moveram com esta entrega.

5. Se algum numero nao bater, investigar ate a certeza (regra de raiz) e corrigir antes de fechar. Registrar o que foi verificado e descartado.

6. Commit (se houver ajuste) ou nota de verificacao. Abrir/atualizar o PR com a autoavaliacao (completude vs. spec, evidencias de tsc/jest/E2E).

---

## Self-review , cobertura da spec (Fase 1A)

| Requisito da spec (secao 3) | Task(s) | Status no plano |
|---|---|---|
| RF-A1 , Constante `ETAPAS_DEMANDA_ABERTA` (27 ids) + TODO(dono) D7 | T1 | Coberto (arquivo dedicado, re-export, TODO verbatim) |
| RF-A2 , Whitelist AUTORITATIVA + tipo=venda nas 2 gemeas; remover `ehExcecaoNotaEmitidaNaoEntregue` | T2, T3, T4 | Coberto (helper puro `bucketDoPedido` usado pelas duas; excecao removida; 226 pela whitelist) |
| RF-A3 , Gate de operacao preservado | T2, T3 | Coberto (`entraDemanda` continua sendo o 1o guard; risco M2 registrado abaixo) |
| RF-A4 , Cancelado sai (6/123 fora dos 27); validar 4 pontas | T2, T11 | Coberto (whitelist elimina; E2E confere nas pontas) |
| RF-A5 , Demanda respeita a PILULA, nao o corte; "Tudo" abre do primeiro pedido | T5, T6, T7, T8, T9 | Coberto (janelaDemandaAberta + resolverJanelaDemanda + callers; corte mantido nas outras metricas) |
| RF-A8 , Filtro de empresa em Entregas Parciais | T7, T9 | Coberto (query ja honra `empresaId`; teste + fiacao da pagina) |
| RF-A9 , Estado vazio por empresa sem entregas (dado/contrato) | T7 | Coberto (retorno zerado representavel + teste; UI fina fica p/ fase de frontend) |
| RF-A6 , Restaurar KPI==card (hints) | T9, T11 | Coberto (card passa a seguir pilula+empresa; paridade validada no E2E) |
| RF-A7 , Documentacao no mesmo commit | T10 | Coberto (kpis-diretoria + bi-schema-reference) |
| Aceite: tsc + jest + drift verdes; docs atualizados | T10, T11 | Coberto |

### Riscos mapeados

- **R-DEMANDA-ESTOQUE (o mais importante a decidir):** `queryDemandaPorProduto` e `queryEstoqueDisponivel` (comercial.ts) e `estoque.ts` A12/necessidade de compra ainda grampeiam a demanda em `data_orcamento >= corteAtualDate()`. A spec (secao 1) diz que a JANELA e GLOBAL para a metrica de demanda; o pedido do usuario para a Task 3 nomeou so relatorio + card + `queryDemandaEmAberta`. Consequencia: com o corte padrao (2026-03-16) acima do primeiro pedido do cache (2026-01-04), o comprometido usado na necessidade de compra pode DIVERGIR do card/relatorio (que passam a incluir jan a mar/2026). **Recomendacao:** aplicar `janelaDemandaAberta` tambem a essas 3 leituras numa task de fast-follow desta mesma fase, para nao violar INV1. Nao alterado aqui por respeito ao escopo nomeado; registrado como risco alto e a confirmar com o dono. Se o E2E (T11.4c) mostrar divergencia material, promover o fast-follow antes de fechar a fase.
- **M2 (spec RF-A3):** as 27 etapas hoje vazias podem no futuro receber pedido com CFOP de transferencia e cair em IGNORAR mesmo estando na whitelist (o gate de operacao vem antes). Comportamento correto, mas registrar para nao surpreender.
- **Deriva das gemeas:** mitigada extraindo `bucketDoPedido` (fonte unica). Se uma gemea deixar de chamar o helper, o teste de fiacao (T3) nao pega a outra; a perícia de T11 confere o dado real das duas via a coluna materializada.
- **`classificaEtapaDemanda` orfa:** apos T3 o builder nao a usa mais; ela segue exportada (API publica de `regras/index.ts`) e testada. Se a perícia mostrar que ninguem mais a consome, avaliar deprecacao numa fase futura (fora do escopo 1A).
- **Mock fragil de `$queryRaw` (T8):** o teste captura os valores do tagged template. Se o estilo do `comercial.test.ts` existente for outro (retorno fixo ignorando WHERE), adaptar para o padrao do arquivo em vez de forcar o meu.
- **Rebuild do worker:** armadilha conhecida , `docker compose build worker` e no-op; usar `docker compose build app` (T11).
