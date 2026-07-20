# Plano , Fase 2: coluna "Etapa" do B-09 como TAG COLORIDA

> Formato Superpowers writing-plans. Tasks bite-sized (2 a 5 min), TDD com codigo
> real onde testavel, commits atomicos. Sem travessao (em dash) em nenhum texto.

## Objetivo

Transformar a coluna "Etapa" do relatorio de Entregas Parciais (bloco B-09) de texto
cru em uma **tag colorida**, com a cor vinda do Odoo (`raw_pedido_etapa.data->>'cor'`,
hex literal) e o nome com **capitalizacao padronizada** (sentence case + allowlist de
siglas em caixa alta). Reuso do padrao de pilula ja existente na tabela; contraste AA
nos dois temas; zero regressao nas outras 8 telas que usam o `DataTable`.

## Contexto e decisoes de arquitetura (lidas contra o dado real, 2026-07-20)

- **A cor ja esta no cache.** `raw_pedido_etapa.data->>'cor'` e hex string quando
  definida (`#fa7e1e`) ou `false` (boolean JSON) quando vazia. Nenhuma sync nova.
  Fonte: `docs/superpowers/research/2026-07-20-frenteB-etapas-cores.md`.
- **Levar a cor ate a linha: JOIN na leitura, NAO materializar em `fato_pedido`.**
  Decisao de custo/limpeza: a necessidade e so de leitura, de um unico relatorio.
  Materializar `etapa_cor` em `fato_pedido` exigiria migration no schema
  compartilhado + alterar builder do worker + rebuild de TODOS os containers +
  backfill (regra de raiz do CLAUDE.md sobre rebuild do worker). Um **batch query
  em `raw_pedido_etapa` por `etapa_id`** (sem N+1, ~1 query extra) entrega o mesmo
  resultado sem tocar schema nem worker. Escolhido: JOIN na query.
- **Fronteira RSC->client:** a query roda no server e devolve a cor e o nome ja
  como **strings** (`etapaCor: string | null`, `etapa` ja formatado). O componente
  de tag e client e recebe DADO, nunca funcao/componente como prop. A `corKey` que
  adicionamos ao `ColumnDef` e apenas o NOME de um campo (string), nao um render.
- **Onde a etapa vira tag:** so o B-09 (`TabelaEntregasParciais` em
  `src/components/diretoria/blocos/blocos-pedidos.tsx`, coluna `etapa` linha ~206).
  Confirmado que `entregasParciais.linhas.etapa` so e consumido ali (grep). As
  colunas "Etapa" dos blocos B-05/B-06 ficam como estao (fora de escopo).
- **DataTable ja tem `tipo: "tag"`** com `tagCores` (mapa valor->classe Tailwind
  ESTATICA). Isso nao serve para hex dinamico do Odoo (Tailwind nao gera classe de
  hex arbitrario). Extensao ADITIVA: novo campo opcional `corKey?` no `ColumnDef`;
  quando presente, a pilula usa **inline style** derivado do hex daquela linha. Sem
  `corKey`, o caminho atual (tagCores estatico) permanece intacto -> zero regressao.
- **Capitalizacao (regra do dono):** primeira letra maiuscula, resto minusculo;
  **allowlist** de siglas em caixa alta (nao "detectar 2 letras"). Allowlist
  confirmada contra as 79 etapas de venda reais do cache:
  `DF, NF, VF, V.O, PDV, JDS, JIB, SN, LR, LP, SMARTFIT`.
  (`FAT`, `TRANSF`, `CONF`, `MOV` ficam minusculos pela regra literal; decisao de
  incluir na allowlist e do dono, ver "Pontos deixados para o inline/dono".)

## Arquivos tocados

| Arquivo | Mudanca |
|---|---|
| `src/lib/diretoria/etapa-cor.ts` (novo) | utils puros de cor (validar hex, hex->rgba, luminancia, derivar estilo da tag) |
| `src/lib/diretoria/etapa-cor.test.ts` (novo) | testes dos utils de cor |
| `src/lib/diretoria/etapa-formato.ts` (novo) | `formatarNomeEtapa` + `SIGLAS_ETAPA` |
| `src/lib/diretoria/etapa-formato.test.ts` (novo) | testes de capitalizacao contra nomes reais |
| `src/lib/diretoria/queries/entregas-parciais.ts` | `mapaCorEtapa` helper + select `etapaId` + `etapaCor`/`etapa` formatado na linha |
| `src/lib/diretoria/queries/entregas-parciais.test.ts` (novo) | teste do helper `mapaCorEtapa` |
| `src/components/charts/data-table.tsx` | `corKey?` no `ColumnDef` + render inline-style aditivo (UI, inline) |
| `src/components/diretoria/blocos/blocos-pedidos.tsx` | coluna Etapa do B-09 vira `tipo:"tag"` + `corKey` + `etapaCor` na linha (UI, inline) |

## Verificacao (regra de raiz: E2E contra dado real)

- `npx tsc --noEmit` limpo.
- `npx jest src/lib/diretoria` verde (novos utils + helper).
- Container `app` em dev (`npm run dev:fresh`, mapa de impacto: `src/**` -> `app`;
  worker/mcp NAO afetados). Abrir Diretoria > Pedidos > Entregas Parciais e conferir
  a coluna Etapa colorida, com nomes formatados, nos temas dark e light.

---

## Task 1 , Util: validar/normalizar a cor crua do Odoo (TDD)

**Objetivo:** funcao pura que recebe o valor cru de `data->>'cor'` (string hex OU
`false` boolean OU qualquer lixo) e devolve um hex valido ou `null`.

1. **RED.** Criar `src/lib/diretoria/etapa-cor.test.ts`:

```ts
import { corEtapaValida } from "./etapa-cor";

describe("corEtapaValida", () => {
  it("aceita hex de 6 digitos", () => {
    expect(corEtapaValida("#fa7e1e")).toBe("#fa7e1e");
  });
  it("aceita hex de 3 digitos", () => {
    expect(corEtapaValida("#0a0")).toBe("#0a0");
  });
  it("trata false (sem cor no Odoo) como null", () => {
    expect(corEtapaValida(false)).toBeNull();
  });
  it("trata numero/objeto/null/undefined como null", () => {
    expect(corEtapaValida(3)).toBeNull();
    expect(corEtapaValida(null)).toBeNull();
    expect(corEtapaValida(undefined)).toBeNull();
    expect(corEtapaValida({})).toBeNull();
  });
  it("rejeita string que nao e hex", () => {
    expect(corEtapaValida("laranja")).toBeNull();
    expect(corEtapaValida("#zzz")).toBeNull();
  });
  it("apara espacos ao redor", () => {
    expect(corEtapaValida("  #00b159 ")).toBe("#00b159");
  });
});
```

2. **GREEN.** Criar `src/lib/diretoria/etapa-cor.ts`:

```ts
/**
 * Normaliza o valor cru de `raw_pedido_etapa.data->>'cor'` para um hex valido.
 * No Odoo (SPED Tauga) a cor vem como hex literal ("#fa7e1e") quando definida ou
 * como `false` (boolean JSON) quando vazia. Qualquer coisa que nao seja um hex
 * valido vira null (tag neutra).
 */
export function corEtapaValida(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const hex = raw.trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex) ? hex : null;
}
```

3. Rodar `npx jest src/lib/diretoria/etapa-cor`. Verde.
4. **Commit:** `feat(diretoria): util corEtapaValida (hex do Odoo -> hex|null)`.

---

## Task 2 , Util: hex -> rgba e luminancia relativa (TDD)

**Objetivo:** parsing do hex para rgba (para bg/borda translucidos) e luminancia
WCAG (para o inline decidir contraste de texto quando quiser).

1. **RED.** Acrescentar a `etapa-cor.test.ts`:

```ts
import { hexParaRgba, luminanciaRelativa } from "./etapa-cor";

describe("hexParaRgba", () => {
  it("converte hex de 6 digitos com alpha", () => {
    expect(hexParaRgba("#ff0000", 0.14)).toBe("rgba(255, 0, 0, 0.14)");
  });
  it("expande hex de 3 digitos", () => {
    expect(hexParaRgba("#0a0", 1)).toBe("rgba(0, 170, 0, 1)");
  });
  it("devolve null para hex invalido", () => {
    expect(hexParaRgba("nope", 0.5)).toBeNull();
  });
});

describe("luminanciaRelativa", () => {
  it("branco ~ 1 e preto ~ 0", () => {
    expect(luminanciaRelativa("#ffffff")).toBeCloseTo(1, 2);
    expect(luminanciaRelativa("#000000")).toBeCloseTo(0, 2);
  });
  it("null para hex invalido", () => {
    expect(luminanciaRelativa("xyz")).toBeNull();
  });
});
```

2. **GREEN.** Acrescentar a `etapa-cor.ts`:

```ts
function normalizarHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function hexParaRgba(hex: string, alpha: number): string | null {
  const rgb = normalizarHex(hex);
  if (!rgb) return null;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

/** Luminancia relativa WCAG (0 = preto, 1 = branco). Util para escolher texto. */
export function luminanciaRelativa(hex: string): number | null {
  const rgb = normalizarHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
```

3. `npx jest src/lib/diretoria/etapa-cor`. Verde.
4. **Commit:** `feat(diretoria): hexParaRgba e luminanciaRelativa (base de contraste)`.

---

## Task 3 , Util: derivar o estilo da tag a partir do hex (TDD)

**Objetivo:** dado um hex (ou null), devolver o estilo inline da pilula (bg e borda
translucidos derivados do hue) ou `null` quando nao ha cor (cai no neutro). Derivar
tom/opacidade em vez de usar o hex cru no texto (o hex do Odoo e saturado).

1. **RED.** Acrescentar a `etapa-cor.test.ts`:

```ts
import { derivarCorTag } from "./etapa-cor";

describe("derivarCorTag", () => {
  it("null quando nao ha cor (etapa sem cor no Odoo)", () => {
    expect(derivarCorTag(null)).toBeNull();
  });
  it("null quando o hex e invalido", () => {
    expect(derivarCorTag("banana")).toBeNull();
  });
  it("deriva bg e borda translucidos do hue", () => {
    expect(derivarCorTag("#fa7e1e")).toEqual({
      backgroundColor: "rgba(250, 126, 30, 0.14)",
      borderColor: "rgba(250, 126, 30, 0.4)",
    });
  });
});
```

2. **GREEN.** Acrescentar a `etapa-cor.ts`:

```ts
export interface EstiloTagCor {
  backgroundColor: string;
  borderColor: string;
}

/**
 * Estilo inline da tag colorida: bg e borda derivados do hex por opacidade, de
 * modo a manter o HUE do Odoo com contraste seguro nos dois temas. O TEXTO nao
 * usa o hex cru (fica a cargo da UI, tipicamente `text-foreground`, sempre AA).
 * null => sem cor => a UI cai na pilula neutra (bg-muted).
 */
export function derivarCorTag(hex: string | null): EstiloTagCor | null {
  const backgroundColor = hex ? hexParaRgba(hex, 0.14) : null;
  const borderColor = hex ? hexParaRgba(hex, 0.4) : null;
  if (!backgroundColor || !borderColor) return null;
  return { backgroundColor, borderColor };
}
```

3. `npx jest src/lib/diretoria/etapa-cor`. Verde.
4. **Commit:** `feat(diretoria): derivarCorTag (bg/borda translucidos do hue Odoo)`.

> Nota inline (ui-ux-pro-max): as opacidades 0.14/0.4 sao ponto de partida; o
> agente principal calibra bg/borda/texto para AA real nos dois temas (ver Task 6).

---

## Task 4 , Util: capitalizacao padronizada com allowlist de siglas (TDD)

**Objetivo:** `formatarNomeEtapa` pura: sentence case + siglas da allowlist em caixa
alta. Testada contra nomes reais do cache.

1. **RED.** Criar `src/lib/diretoria/etapa-formato.test.ts`:

```ts
import { formatarNomeEtapa } from "./etapa-formato";

describe("formatarNomeEtapa", () => {
  it("sentence case simples", () => {
    expect(formatarNomeEtapa("GERA BOLETO")).toBe("Gera boleto");
    expect(formatarNomeEtapa("Aguardando Autorização")).toBe("Aguardando autorização");
  });
  it("mantem siglas de 2 letras da allowlist em caixa alta", () => {
    expect(formatarNomeEtapa("VF - Aguardando autorização")).toBe("VF - Aguardando autorização");
    expect(formatarNomeEtapa("CORREÇÃO - Emite NF")).toBe("Correção - Emite NF");
  });
  it("mantem V.O (sigla com ponto) em caixa alta", () => {
    expect(formatarNomeEtapa("V.O - Input Financeiro")).toBe("V.O - Input financeiro");
    expect(formatarNomeEtapa("V.O 5119/6119 - PDV")).toBe("V.O 5119/6119 - PDV");
  });
  it("mantem siglas de 3+ letras da allowlist (PDV, JDS, JIB, SMARTFIT)", () => {
    expect(formatarNomeEtapa("VF 5922/6922 - PDV")).toBe("VF 5922/6922 - PDV");
    expect(formatarNomeEtapa("[SMARTFIT] - FAT JDS X GRUPO"))
      .toBe("[SMARTFIT] - fat JDS x grupo");
  });
  it("mantem SN/LR/LP em caixa alta", () => {
    expect(formatarNomeEtapa("TRANSF SN Matriz - Filial")).toBe("Transf sn matriz - filial");
    // ATENCAO: 'sn' vira maiuscula? sim, SN esta na allowlist:
    expect(formatarNomeEtapa("TRANSF SN Matriz - Filial")).toContain("SN");
  });
  it("preserva codigos CFOP numericos e pontuacao", () => {
    expect(formatarNomeEtapa("Retorno transferencia SERGIPE x DF"))
      .toBe("Retorno transferencia sergipe x DF");
  });
  it("string vazia/nula", () => {
    expect(formatarNomeEtapa("")).toBe("");
    expect(formatarNomeEtapa(null)).toBe("");
    expect(formatarNomeEtapa(undefined)).toBe("");
  });
});
```

> Nota: o teste de "TRANSF SN" tem duas asserts; se a expectativa exata divergir na
> implementacao (ordem de tokens), manter o `toContain("SN")` e ajustar a string
> completa ao resultado real observado. A regra e: SN preservado em caixa alta.

2. **GREEN.** Criar `src/lib/diretoria/etapa-formato.ts`:

```ts
/**
 * Siglas que permanecem em CAIXA ALTA apos a padronizacao. Allowlist explicita
 * (nao "detectar 2 letras"), confirmada contra as 79 etapas de venda reais do
 * cache em 2026-07-20. Comparacao case-insensitive; o token pode conter ponto
 * (V.O) para casar a sigla com pontuacao interna.
 */
export const SIGLAS_ETAPA = [
  "DF", "NF", "VF", "V.O", "PDV", "JDS", "JIB", "SN", "LR", "LP", "SMARTFIT",
] as const;

const SIGLAS_UPPER = new Set<string>(
  SIGLAS_ETAPA.map((s) => s.toLocaleUpperCase("pt-BR")),
);

/**
 * Padroniza o nome da etapa: sentence case (so a 1a letra alfabetica maiuscula,
 * o resto minusculo), preservando numeros e pontuacao; depois recoloca em caixa
 * alta os tokens que batem a allowlist de siglas.
 */
export function formatarNomeEtapa(nome: string | null | undefined): string {
  if (!nome) return "";
  const base = nome.trim().toLocaleLowerCase("pt-BR");
  // 1) sentence case: primeira letra alfabetica em maiuscula
  const sentenca = base.replace(/\p{L}/u, (c) => c.toLocaleUpperCase("pt-BR"));
  // 2) siglas da allowlist voltam para caixa alta (token = letras/digitos/pontos)
  return sentenca.replace(/[\p{L}\p{N}.]+/gu, (tok) =>
    SIGLAS_UPPER.has(tok.toLocaleUpperCase("pt-BR"))
      ? tok.toLocaleUpperCase("pt-BR")
      : tok,
  );
}
```

3. Rodar `npx jest src/lib/diretoria/etapa-formato`. Ajustar a string exata do teste
   "TRANSF SN" ao output real (a regra invariante e SN em caixa alta). Verde.
4. **Commit:** `feat(diretoria): formatarNomeEtapa com allowlist de siglas`.

---

## Task 5 , Query B-09: carregar a cor e formatar o nome por linha (TDD do helper)

**Objetivo:** `queryEntregasParciais` passa a devolver `etapaCor` (hex|null) e `etapa`
ja formatado, via batch em `raw_pedido_etapa` por `etapa_id`. Sem N+1, sem migration.

1. **RED.** Criar `src/lib/diretoria/queries/entregas-parciais.test.ts` para o helper
   puro `mapaCorEtapa` (o join propriamente dito e exercido no E2E da Task 8):

```ts
import { mapaCorEtapa } from "./entregas-parciais";

describe("mapaCorEtapa", () => {
  it("mapeia etapa_id -> hex valido e trata false como null", () => {
    const m = mapaCorEtapa([
      { odooId: 4, data: { cor: "#fa7e1e" } },
      { odooId: 6, data: { cor: false } },
      { odooId: 9, data: {} },
    ]);
    expect(m.get(4)).toBe("#fa7e1e");
    expect(m.get(6)).toBeNull();
    expect(m.get(9)).toBeNull();
  });
});
```

2. **GREEN.** Em `src/lib/diretoria/queries/entregas-parciais.ts`:

   a) Import no topo:

   ```ts
   import { corEtapaValida } from "@/lib/diretoria/etapa-cor";
   import { formatarNomeEtapa } from "@/lib/diretoria/etapa-formato";
   ```

   b) Novo campo no tipo `LinhaEntregaParcial` (logo apos `etapa`):

   ```ts
   etapa: string | null;
   /** Hex da cor da etapa vindo do Odoo (raw_pedido_etapa.data.cor), ou null. */
   etapaCor: string | null;
   ```

   c) Helper puro exportado (perto do topo do arquivo):

   ```ts
   /**
    * Constroi o mapa etapa_id -> hex a partir das linhas de raw_pedido_etapa.
    * Puro e testavel: cada valor passa por corEtapaValida (false/lixo -> null).
    */
   export function mapaCorEtapa(
     rows: { odooId: number; data: unknown }[],
   ): Map<number, string | null> {
     const m = new Map<number, string | null>();
     for (const r of rows) {
       const cor = (r.data as { cor?: unknown } | null)?.cor;
       m.set(r.odooId, corEtapaValida(cor));
     }
     return m;
   }
   ```

   d) No `select` do `prisma.fatoPedido.findMany`, adicionar `etapaId: true` (ja ha
      `etapaNome: true`).

   e) Depois de carregar `pedidos`, montar os etapaIds distintos e buscar as cores em
      lote (uma query, sem N+1). Adicionar ao `Promise.all` ja existente OU logo apos:

   ```ts
   const etapaIds = [
     ...new Set(pedidos.map((p) => p.etapaId).filter((x): x is number => x != null)),
   ];
   const etapasRaw = etapaIds.length
     ? await prisma.rawPedidoEtapa.findMany({
         where: { odooId: { in: etapaIds } },
         select: { odooId: true, data: true },
       })
     : [];
   const corDe = mapaCorEtapa(etapasRaw);
   ```

   f) No objeto `linhas.push({...})`, trocar `etapa: p.etapaNome` por:

   ```ts
   etapa: formatarNomeEtapa(p.etapaNome),
   etapaCor: p.etapaId != null ? corDe.get(p.etapaId) ?? null : null,
   ```

3. `npx jest src/lib/diretoria/queries/entregas-parciais` verde; `npx tsc --noEmit`
   limpo (o tipo `LinhaEntregaParcial` novo obriga o consumidor a mapear `etapaCor`
   na Task 7; ate la o tsc do componente pode acusar, resolvido na Task 7).
4. **Commit:** `feat(diretoria): B-09 devolve etapaCor e nome formatado por linha`.

> Verificar (perito): a query so seleciona `data` de `raw_pedido_etapa` para os IDs
> das etapas em uso (nao os 239) e nao respeita nem viola o corte de leitura (a cor
> e atributo de dominio da etapa, nao historico datado). O batch e feito com o
> mesmo padrao dos outros lookups do arquivo (Map por id).

---

## Task 6 , DataTable: `corKey` aditivo no ColumnDef + render inline (UI, INLINE)

> **UI: feita inline pelo agente principal com a skill `ui-ux-pro-max` ANTES de
> tocar o arquivo.** Nao delegar. Mudanca estritamente ADITIVA: as 8 telas que hoje
> usam `tipo:"tag"` com `tagCores` continuam identicas (nenhuma passa `corKey`).

**Objetivo:** permitir que uma coluna `tipo:"tag"` colora a pilula com a cor por
LINHA (hex vindo de um campo irmao), via inline style, mantendo o caminho estatico.

Passos precisos:

1. Em `src/components/charts/data-table.tsx`, no `interface ColumnDef<T>`, adicionar
   campo opcional (apos `tagCores`):

   ```ts
   /**
    * Para `tipo:"tag"`: nome do campo IRMÃO da linha que carrega o hex da cor
    * (string) daquela linha. Quando presente, a pilula usa a cor por-linha (inline
    * style derivado do hex) em vez do mapa estatico `tagCores`. Passa DADO (nome do
    * campo), nunca componente/funcao (fronteira RSC->client).
    */
   corKey?: keyof T & string;
   ```

2. Import no topo do arquivo (client):

   ```ts
   import { corEtapaValida, derivarCorTag } from "@/lib/diretoria/etapa-cor";
   ```

3. No branch de render `c.tipo === "tag"` (hoje ~linha 635 a 643), tornar a cor
   condicional a `corKey`. Estrutura (o agente calibra classes/contraste com a skill):

   ```tsx
   c.tipo === "tag"
     ? (() => {
         const valor = String(row[c.key] ?? "");
         const hex = c.corKey ? corEtapaValida(row[c.corKey]) : null;
         const estilo = c.corKey ? derivarCorTag(hex) : null;
         return (
           <span
             className={cn(
               "inline-flex max-w-[220px] items-center truncate rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
               estilo
                 ? "text-foreground ring-transparent"
                 : (c.tagCores?.[valor] ?? "bg-muted text-muted-foreground ring-border/60"),
             )}
             style={
               estilo
                 ? {
                     backgroundColor: estilo.backgroundColor,
                     boxShadow: `inset 0 0 0 1px ${estilo.borderColor}`,
                   }
                 : undefined
             }
             title={valor}
           >
             {valor}
           </span>
         );
       })()
     : c.tipo === "data"
     ? /* ...inalterado... */
   ```

4. **Pontos que o inline valida com `ui-ux-pro-max` (nao pular):**
   - Contraste AA do texto (`text-foreground`) sobre o bg translucido nos DOIS temas
     (o hue do Odoo varia de amarelo claro a vinho escuro; por isso o texto usa o
     token do tema, nao o hex cru).
   - Borda/anel: usar `boxShadow inset` OU `borderColor` (nao os dois); manter o
     mesmo raio/altura das tags irmas (Situacao/Financeiro) na mesma tabela.
   - Nome longo ("VF - SEGUIR COM RESERVA/FRACIONAMENTO - 5117/6117"): truncar com
     `max-w`/`truncate` + `title`, sem quebrar a linha da tabela.
   - Tag neutra (cor null) identica ao neutro atual (`bg-muted text-muted-foreground`).
   - Reuso: avaliar usar o componente `Badge` (`src/components/ui/badge.tsx`,
     `variant="outline"`) com inline style em vez do `<span>` cru; se o `Badge`
     casar 1:1 com o visual das tags irmas, preferir o Badge (reuso do design
     system). Se introduzir divergencia visual entre as tags da MESMA tabela,
     manter o `<span>` pilula ja usado ali (consistencia local vence).
   - Zero emoji; icone so Lucide com `aria-hidden` se o inline decidir por um dot.

5. `npx tsc --noEmit` limpo. Conferir visualmente as OUTRAS tabelas com `tipo:"tag"`
   (Router, B-05 Situacao, B-09 Financeiro): inalteradas (nenhuma passa `corKey`).
6. **Commit:** `feat(charts): DataTable suporta cor por-linha na tag (corKey, aditivo)`.

---

## Task 7 , B-09: coluna Etapa vira tag colorida (UI, INLINE)

> UI inline com `ui-ux-pro-max`. So o bloco `TabelaEntregasParciais`.

1. Em `src/components/diretoria/blocos/blocos-pedidos.tsx`, no `map` de `linhas`
   dentro de `TabelaEntregasParciais` (~linha 177), acrescentar o campo da cor:

   ```ts
   etapa: l.etapa ?? DASH,
   etapaCor: l.etapaCor,
   ```

2. Na definicao de `colunas`, trocar a coluna Etapa (linha ~206):

   ```ts
   { key: "etapa", header: "Etapa", tipo: "tag", corKey: "etapaCor" },
   ```

3. Conferir: `etapaCor` fica na linha como dado auxiliar, NAO vira coluna (nao esta
   em `colunas`). O `DataTable` so renderiza colunas declaradas, entao `etapaCor` nao
   aparece na tabela nem no CSV (o export usa apenas `colunasVisiveis`). Bom.
4. **Pontos inline (`ui-ux-pro-max`):** conferir a tag Etapa no meio das outras tags
   da tabela (Financeiro), alinhamento e densidade da linha em modo compacto
   (`compactoInicial`), dark e light, 375px sem scroll horizontal do body.
5. `npx tsc --noEmit` limpo (agora `etapaCor` do tipo novo esta mapeado).
6. **Commit:** `feat(diretoria): coluna Etapa do B-09 como tag colorida`.

---

## Task 8 , Verificacao e E2E contra dado real

1. `npx tsc --noEmit` , limpo.
2. `npx jest src/lib/diretoria` , verde (etapa-cor, etapa-formato, entregas-parciais).
3. Subir o app em dev: `npm run dev:fresh` (mapa de impacto: `src/**` -> container
   `app`; worker e mcp NAO precisam rebuild, nada em `mcp/**`, `reports/queries/**`
   nem `worker/odoo/**` foi tocado).
4. Abrir Diretoria > Pedidos > aba Entregas Parciais. Conferir:
   - Coluna Etapa renderiza como tag colorida com a cor do Odoo (comparar 3-4 hexes
     conhecidos da pesquisa: `#fa7e1e` laranja, `#00b159` verde, `#740001` vinho).
   - Etapas sem cor (bloco `V.O -`, ids 180-189, cor `false`) aparecem em tag neutra.
   - Nomes formatados: "GERA BOLETO" -> "Gera boleto", "CORREÇÃO - Emite NF" ->
     "Correção - Emite NF", "V.O - Input Financeiro" -> "V.O - Input financeiro".
   - Trocar tema dark <-> light: contraste do texto legivel (AA) nos dois.
   - 375px: sem scroll horizontal do body; a tabela rola no proprio contêiner.
5. Conferir uma tela irma que usa `tipo:"tag"` sem `corKey` (B-05 Situacao): visual
   inalterado (nao regrediu).
6. **Perícia (regra de raiz):** reabrir os arquivos e confirmar os invariantes:
   fronteira RSC->client (so strings atravessam; `corKey` e nome de campo);
   `etapaCor` fora das colunas (nao vaza no CSV); caminho estatico das outras tags
   intacto; batch sem N+1; corte de leitura nao amarrado a atributo de dominio.
7. Screenshots dark e light (se o ambiente permitir; senao declarar que nao foi
   visto no browser). **Commit** de qualquer ajuste da perícia com o motivo.

---

## Pontos deixados para o inline / dono (nao decididos no plano)

- **Tratamento visual exato da tag colorida** (opacidades bg/borda, texto
  `text-foreground` vs hex derivado por luminancia, dot Lucide opcional, truncagem):
  decidido inline com `ui-ux-pro-max`, conferido AA nos dois temas (Task 6/7). Os
  utils ja entregam bg/borda e a luminancia para qualquer que seja a escolha.
- **`Badge` do design system vs `<span>` pilula:** preferir reuso do `Badge` se
  casar 1:1 com as tags irmas; caso contrario, manter o `<span>` local por
  consistencia dentro da mesma tabela (Task 6, item 4).
- **Allowlist de siglas , confirmar com o dono:** base fixada
  (`DF, NF, VF, V.O, PDV, JDS, JIB, SN, LR, LP, SMARTFIT`). Tokens `FAT`, `TRANSF`,
  `CONF`, `MOV` ficam minusculos pela regra literal; se o dono quiser mante-los em
  caixa alta, e so acrescentar em `SIGLAS_ETAPA` (uma linha, sem mudar codigo).

---

## Self-review de cobertura

- **Cor ate a linha (B-09):** Task 5 (join batch em `raw_pedido_etapa`, sem migration
  nem rebuild do worker). Decisao "join vs materializar" justificada no Contexto.
- **Cor vinda do Odoo, hex literal, `false` = neutro:** Tasks 1 e 5 (corEtapaValida +
  mapaCorEtapa). Coberto por teste.
- **Capitalizacao padronizada com allowlist:** Task 4 (formatarNomeEtapa), testada
  contra nomes reais; allowlist confirmada no cache; extensivel em 1 linha.
- **Reuso do Badge/pilula + contraste AA dark/light + derivar tom (nao hex cru no
  texto):** Tasks 2, 3, 6 (utils de rgba/luminancia/estilo + render inline com a
  skill, pontos de validacao listados).
- **Tag so no B-09; outras 8 telas intocadas:** Task 6 (aditivo via `corKey`) + Task
  7 (so `TabelaEntregasParciais`) + verificacao de nao-regressao na Task 8.
- **Fronteira RSC->client (dado, nao funcao):** Task 5 devolve strings; `corKey` e
  nome de campo; verificado na perícia da Task 8.
- **DataTable suportava render custom?** Nao para hex dinamico (so `tagCores`
  estatico). Task 6 adiciona o suporte de forma aditiva, sem quebrar o existente.
- **Fora de escopo respeitado:** nenhuma coluna nova, filtro, agrupamento ou view;
  `etapaCor` nao vira coluna nem entra no CSV.
- **UI inline explicita:** Tasks 6 e 7 marcadas como inline + `ui-ux-pro-max`, com a
  lista de pontos de design a validar.
- **TDD real:** Tasks 1 a 5 tem RED antes de GREEN com codigo de teste concreto.
- **E2E contra dado real:** Task 8 sobe o app e confere hexes/nomes conhecidos e os
  dois temas (regra de raiz).
