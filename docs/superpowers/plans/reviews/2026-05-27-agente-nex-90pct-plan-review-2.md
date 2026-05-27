# Review #2 (ainda mais profunda) — PLAN v2 Agente Nex ≥90%

**Reviewer:** Claude Code (Opus 4.7), modo crítico máximo
**Plan revisado:** PLAN v2

## Achados (foco no que escapou da Review #1)

### CRIT-α: CRIT-B v1 só metade endereçado — falta o teste de contrato real
`TOOLS_QUE_PRECISAM_FORMATADOR` foi adicionado, mas **não existe teste em `responder.test.ts` que falha quando PR2 esquecer**. Lista hard-coded sem assertiva = ornamentação.

**Fix v3:** adicionar bloco de teste explícito que será executado durante o **PR2** (não durante PR1), verificando que ao final do PR2 nenhuma tool da lista cai no fmtGenerico. Documentar como contrato obrigatório do PR2.

```typescript
// Em responder.test.ts (já criado em PR1, mas com o teste skip()):
describe.skip("contrato pré-PR2", () => {
  it("nenhuma tool da TOOLS_QUE_PRECISAM_FORMATADOR ainda usa fmtGenerico", () => {
    for (const tool of TOOLS_QUE_PRECISAM_FORMATADOR) {
      const fmt = formatadorPorTool(tool);
      expect(ehFormatadorGenerico(fmt)).toBe(false);
    }
  });
});
// PR2 remove o .skip e o teste vira blocking.
```

### CRIT-β: Mapeamento `acerto_objetividade` no `PATTERN_TO_FIXES` está errado
O laudo mostra 26 casos PARCIAL com `acerto_objetividade` (R13 inteira). Eles são **PARCIAL real**, não legítimos. O pattern foi reusado pelo judge para "padrão de erro reconhecido" em alguns casos. Mapear todos como `legítimo` esconde 18 % dos casos.

**Fix v3:** quando `status != FORA_DO_ESCOPO`, ignorar `acerto_objetividade` e usar próximo pattern negativo. Ajustar script.

### HIGH-γ: Schema delta deveria ser PR isolado, não dentro de PR4a
Migration aditiva + Prisma generate é mudança de infra com risco específico (regenera client, possíveis breaking changes em consumidores Prisma). Misturar com AutoValidator atrapalha revisão.

**Fix v3:** novo PR4-pre (schema delta + migration + prisma generate) antes do PR4a.

### HIGH-δ: Bloqueio formal de PR2 em research R-1/R-2 ausente
Plan v2 menciona "bloqueado por research" mas não tem mecanismo. Se executor pula research e vai direto para PR2, pode escolher limiar arbitrário.

**Fix v3:** Task -1 em `Onda 1.B` explícita: "rodar R-1, R-2, R-3 e checar arquivos existem". PR2 não inicia sem isso.

### HIGH-ε: Helper `addDays` chama `partsBR` que chama `Intl.DateTimeFormat`
Performance: cada `addDays` faz 1 alocação Intl. Em loop (`addDays(seg, 6)`), são 6 alocações. Aceitável para uso baixo-tráfego, mas pode ser otimizado.

**Fix v3 (opcional):** cachear `Intl.DateTimeFormat` em variável module-level. Marca como dívida se não fizer agora.

### HIGH-ζ: Script `build-casos-x-fixes.py` é Python; outros scripts são TS
Mistura linguagens no diretório `scripts/quality-audit/`. Pequena inconsistência.

**Fix v3:** reescrever em TS (`build-casos-x-fixes.ts`) para coerência. Custo: ~30min.

### MED-η: Falta teste de "amanha em domingo vira segunda"
Edge case não coberto.

**Fix v3:** adicionar 1 teste.

### MED-θ: Comunicação pós-PR1 (MED-L v1) sem mecanismo automatizado
Plan v2 diz "aguardar aprovação humana" mas não diz como. Ferramenta hook? Pause manual?

**Fix v3:** registrar como step explícito ao final: "produzir mensagem-resumo com link para PR1 e aguardar mensagem do usuário antes de invocar writing-plans para PR2".

---

## Resumo

| Severidade | Quantidade |
|-------------|------------|
| CRIT | 2 (mapping CSV + teste de contrato) |
| HIGH | 4 |
| MED | 2 |

PLAN v3 deve endereçar 2 CRIT (mapping CSV + teste de contrato real) e os HIGH/MED são polimento.
