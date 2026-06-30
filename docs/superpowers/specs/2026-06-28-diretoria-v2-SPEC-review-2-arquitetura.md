# Review adversarial #2 (arquitetura) , SPEC Diretoria v2

> Revisor: arquitetura de software / frontend, modo adversarial.
> Alvo: `2026-06-28-diretoria-v2-SPEC.md` (v1/v2).
> Base de verificação: perícia MESTRE, VISAO, e o código real da worktree
> (`src/lib/diretoria/**`, `src/components/diretoria/**`, `prisma/schema.prisma`,
> `package.json`).
> Foco: buracos de arquitetura, viabilidade, consistência e risco de execução.
> Regra: sem o caractere travessão.

## Placar de achados

| Severidade | Qtde |
|---|---|
| CRÍTICO | 6 |
| ALTO | 7 |
| MÉDIO | 5 |
| BAIXO | 3 |
| **Total** | **21** |

Verificações de campo que embasam vários achados:
- O grid/drag NÃO tem biblioteca instalada: o `package.json` só tem
  `framer-motion`. Nada de `react-grid-layout`, `@dnd-kit`, `gridstack`,
  `react-sortable`. A onda 1 constrói o motor de grid do zero (ou adiciona dep).
- Já existem assets que a SPEC trata como "a construir": `src/lib/diretoria/queries/{vendas,estoque,pedidos}.ts` (com testes), `src/components/diretoria/brazil-map/` (mapa pronto, com teste), `vendas-charts.tsx`, `vendas-mapa-comparativo.tsx`, `diretoria-period-bar.tsx`, `freshness-badge.tsx`, `agenda-calendar.tsx`, `pedidos-pendentes-table.tsx`, e `src/lib/diretoria/{periodo,uf,cores,access,capabilities,freshness}.ts`.
- RBAC nível 1 hoje é SÓ por usuário: `UserDiretoriaAccess (userId, capability @@unique)` + `UserDiretoriaUf`. Não há grant por papel no schema, nem capability por componente. As capabilities existentes são por área (`diretoria.vendas.view`, `diretoria.estoque.view`, `diretoria.pedidos.view`, `diretoria.agenda.view/manage`, `diretoria.*.export`, `diretoria.vendas.pagamentos.view`, `diretoria.sync.force`). NÃO existem `diretoria.relatorio.editar` nem `diretoria.permissoes.gerenciar`.
- Tabelas `diretoria_relatorio`, `diretoria_relatorio_bloco`, `diretoria_permissao` ainda não existem no schema.

---

## CRÍTICO

### C1. Modelo de posicionamento do bloco é ambíguo: `x,y` (absoluto) E `ordem` (fluxo) coexistem sem regra de qual vence
`diretoria_relatorio_bloco (x, y, largura, altura, ordem)` mistura dois paradigmas incompatíveis: posição absoluta em grid (x,y) e ordenação de fluxo (ordem). Ou o layout é grid posicional (e `ordem` é redundante/conflitante), ou é fluxo empacotado (e `y` é derivado, não armazenado). Sem a regra de precedência, dois renderizadores (server render vs editor) podem desenhar a mesma linha em lugares diferentes, e o reflow no resize fica indefinido.
**Correção:** escolher UM modelo e documentá-lo. Recomendado: grid posicional empacotado estilo react-grid-layout , armazenar só `(x, larguraEmColunas, alturaEmU)` e derivar `y` por compactação vertical determinística (top-pack). Remover `ordem` OU mantê-lo apenas como desempate de empacotamento/ordem mobile (ver C2). Definir a função de empacotamento (algoritmo, sentido, estabilidade) na SPEC.

### C2. Sem regra de colisão / empacotamento / z-order: blocos de alturas diferentes podem sobrepor
A SPEC pergunta e não responde "falta z-order/empacotamento". Com larguras de 3/6/9/12 col e alturas 1u/2u/3u/4u/6u em posições absolutas, sobreposição e buracos são inevitáveis sem um compactador. Não há campo nem algoritmo de colisão; não há z-order (e nem deveria haver, blocos não devem empilhar em Z).
**Correção:** especificar compactação top-left determinística e proibição de overlap (resolver colisão empurrando para baixo). Sem z-order (decisão explícita: blocos nunca se sobrepõem). Definir o comportamento quando um bloco encolhe (puxa os de baixo para cima) e quando cresce (empurra). Cobrir com teste de unidade do compactador antes da UI.

### C3. Contradição de granularidade: catálogo trata "grupo de N KPIs" como UM bloco `kpi`, mas as travas dizem `kpi = 1/4 a 2/4`
G-01 ("KPIs executivos , faturamento, a receber, a pagar, estoque, demandas" = 5 KPIs), C-01 (4 KPIs), K-03 (6 KPIs) são catalogados como um único bloco tipo `kpi`. A trava `kpi` permite no máximo 2/4 (6 col) e 1u a 2u, o que não comporta 5 ou 6 KPIs legíveis. Ou o `kpi` é um cartão único (e o catálogo está errado ao empacotar 5), ou é um "grupo de KPIs" (e a trava está errada).
**Correção:** introduzir distinção explícita: `kpi` (cartão único, 1/4) vs `kpi-grupo`/`kpi-row` (faixa de KPIs, 4/4, 1u-2u, com auto-wrap interno). Reclassificar G-01/C-01/K-03 como `kpi-grupo`. Ajustar a tabela de travas.

### C4. RBAC: "nível 2 nunca amplia nível 1" não tem algoritmo de resolução, e `diretoria_permissao.permitido` (bool) permite tanto conceder quanto negar
A SPEC diz "só pode CONCEDER dentro do nível 1", mas o schema proposto tem `permitido boolean` por (sujeito, recurso), com sujeito user OU papel. Faltam: (a) precedência user-vs-papel; (b) precedência allow-vs-deny; (c) garantia formal de interseção com nível 1. Um `permitido=true` para componente cuja área o usuário não tem no nível 1 ampliaria o acesso se a checagem não for interseção.
**Correção:** definir o efetivo como `acessoEfetivo(comp) = nivel1Permite(area/cap do comp) AND nivel2Permite(comp)`, onde `nivel2Permite` parte de "default = herda nível 1" e só pode RESTRINGIR (deny) ou reafirmar dentro do teto. Precedência: deny vence allow; user vence papel. Tornar isso uma função pura única (`resolveDiretoriaComponentAccess`) testada, usada por paleta E por render server. A UI de Permissões deve ocultar/desabilitar componentes fora do nível 1 (não oferecer o que não pode conceder).

### C5. Gating só na paleta não basta: o dado do bloco precisa ser barrado no SERVIDOR no render, senão vaza
A SPEC diz que o componente "só aparece na paleta/relatório se passar nos 2 níveis", mas um layout salvo pode conter blocos de componentes que o usuário perdeu acesso depois, ou que outro usuário (dono do layout padrão) incluiu. Se o render busca os dados e só esconde no client, há vazamento. Também falta o filtro UF (`UserDiretoriaUf`) por componente que carrega dado geográfico (mapa, vendas por estado).
**Correção:** no render server de cada relatório, filtrar a lista de blocos por `resolveDiretoriaComponentAccess(user, comp)` ANTES de disparar qualquer query; o data-loader de cada componente recebe o escopo (capabilities + UFs) e nunca consulta fora dele. Nenhuma query roda para bloco proibido. Documentar que paleta e render compartilham o mesmo gate.

### C6. Faltam tabelas de CONFIGURAÇÃO de negócio (Estoque Ideal A-06, Alertas por fornecedor K-06); `config_json` no bloco não serve
A-06 (estoque ideal por modelo, overPct, alertas de cobertura) e K-06 (alertas por fornecedor, com persistência , a perícia confirma persistência no HTML) são CONFIG de negócio compartilhada, não config de layout por usuário. Pô-los em `diretoria_relatorio_bloco.config_json` significa que a config morre se o bloco sai do layout, e diverge entre layouts/usuários. A SPEC não modela onde essa config vive.
**Correção:** criar tabelas dedicadas: `diretoria_estoque_ideal (modelo/produto_id, ideal, over_pct, updated...)` e `diretoria_fornecedor_alerta (fornecedor_id, regra, limiar, ...)`. `config_json` do bloco fica só para preferências de exibição do bloco (colunas visíveis, ordenação inicial). Distinguir na SPEC "config de layout" vs "config de negócio".

---

## ALTO

### A1. Decisão de biblioteca de grid/drag está ausente , o maior risco técnico não tem dono
Não há dep instalada e a SPEC não decide entre (a) `react-grid-layout` (pronto, mas pesado, com atrito conhecido em React 19/Next 16 e não-RSC, precisa wrapper client), (b) `@dnd-kit` + motor de grid próprio (mais controle, mais trabalho, melhor a11y/teclado), ou (c) tudo do zero com CSS Grid + framer-motion. Drag + teclado + colisão + responsivo do zero é semanas de trabalho escondido na "onda 1".
**Correção:** decidir agora, com justificativa de compatibilidade Next 16/React 19, e fazer um SPIKE isolado (ver A2) antes de comprometer o resto. Recomendação: `@dnd-kit` (a11y/teclado nativos) + compactador próprio testável; CSS Grid para o layout estático (render server). Evitar `react-grid-layout` se o spike mostrar atrito de RSC/React 19.

### A2. Onda 1 é grande demais e empacota 4 entregáveis de risco diferente
"Catálogo TS + motor de grid com travas + render do layout salvo + schema cirúrgico" são quatro frentes; o motor de grid (a parte mais arriscada, reconhecida na §12) está enterrado junto com tarefas de baixo risco. Se o grid derrapar, trava tudo.
**Correção:** quebrar: Onda 0.5 = SPIKE do motor de grid (render estático de um layout hardcoded; validar travas, responsivo, colisão e compactador no browser, sem persistência nem editor). Só depois Onda 1 = catálogo TS + schema + render do layout salvo. Editor (drag/teclado) continua onda separada. Prototipar o grid primeiro reduz o risco mais cedo.

### A3. Dependência entre ondas quebrada: componentes-mapa (onda 2) precisam do mapa (onda 3); mapa já existe
B-03, C-02 e G-03 são componentes tipo `mapa` entregues na onda 2, mas o "Mapa do Brasil definitivo" é a onda 3 , a onda 2 dependeria de algo que só vem depois. Pior: o mapa JÁ EXISTE (`src/components/diretoria/brazil-map/`, com teste). Tratá-lo como onda nova é retrabalho.
**Correção:** mover o mapa para a onda 1/2 como componente reutilizável (refinar o existente: tooltip confinado/tracking/glow), não criar do zero numa onda 3. Reordenar para que todo componente da onda 2 tenha suas dependências (mapa, charts) já prontas.

### A4. Capabilities por componente e as duas novas (`relatorio.editar`, `permissoes.gerenciar`) não existem e não estão na onda 1
O catálogo declara `capability` por componente, mas o namespace atual é por ÁREA (`diretoria.vendas.view`...). Não há mapeamento componente→capability, nem as capabilities `diretoria.relatorio.editar` / `diretoria.permissoes.gerenciar` citadas em §5/§7. Se a onda 2 constrói componentes sem o gate cabeado, nasce dado sem RBAC.
**Correção:** na onda 1, definir o mapa estável componente→capability (no próprio catálogo TS), adicionar as 2 capabilities novas ao conjunto do nível 1 (e ao seed/UI da tela de Usuários), e cravar que todo componente referencia uma capability existente. Teste que rejeita componente com capability órfã.

### A5. Integridade referencial catálogo (TS) ↔ banco: `componente_id` e `recurso_id` são strings sem FK; renomear/remover id órfã blocos e permissões
`diretoria_relatorio_bloco.componente_id` e `diretoria_permissao.recurso_id` apontam para ids do catálogo TS (`A-01`, `C-03`...), que não é tabela. Não há FK; mudar um id no catálogo deixa blocos/permissões pendurados, e o render quebra ao não achar o componente.
**Correção:** (a) declarar os ids do catálogo como IMUTÁVEIS (regra durável) e versionados; (b) no render, ignorar com segurança bloco cujo `componente_id` não existe mais no catálogo (degradar, não quebrar) e logar; (c) validação/migração que detecta blocos/permissões órfãos; (d) opcional: tabela `diretoria_componente` espelhando o catálogo para ganhar FK real.

### A6. Schema proposto sem chaves, índices, tipos e unicidade , vira inconsistência de dado
A §9 lista campos mas não define: tipo de id (o projeto usa quê? alinhar com `UserDiretoriaAccess`), `@map` snake_case, `@db.Uuid` ou cuid, FKs com onDelete, e principalmente UNICIDADE: (a) `diretoria_relatorio` precisa de unique parcial garantindo no máximo 1 layout por (tela, dono_user_id) e no máximo 1 `é_padrao=true` por tela; (b) `diretoria_relatorio_bloco` precisa de unique (relatorio_id, componente_id) se um componente não pode repetir (a paleta assume "já está na tela"); (c) `diretoria_permissao` precisa de unique (sujeito_tipo, sujeito_id, recurso_tipo, recurso_id) + índice de leitura por sujeito.
**Correção:** especificar o DDL completo (tipos, @map, FKs, índices, uniques parciais) na SPEC, alinhado ao padrão dos models existentes, e gerar via SQL cirúrgico idempotente (nunca db push), seguindo o protocolo de schema em banco dev compartilhado (`agente schema-changed`, avisar outras worktrees).

### A7. Performance: "paralelizar e cachear" sem estratégia concreta para N blocos = N queries
Um relatório montável tem layout arbitrário por usuário, então não dá para otimizar estaticamente. Sem registry de loaders por componente, dedupe de inputs compartilhados (período, UFs) e batching, cada bloco vira uma query independente e o page-load explode. Trocar período/UF re-dispara tudo.
**Correção:** definir: (a) um registry `componente_id → loader(scope, periodo)` server-side; (b) coletar os loaders dos blocos visíveis e rodar em `Promise.all` com dedupe de inputs iguais; (c) `Suspense` por bloco para streaming progressivo; (d) memoização por request (React `cache()`) e/ou TTL curto para agregações pesadas repetidas; (e) já que o dado vem do cache Postgres, padronizar as agregações como SQL único por componente. Endereçar isso na onda 1 (arquitetura de loading), não deixar para o polimento.

---

## MÉDIO

### M1. Inconsistências numéricas entre SPEC e VISAO (u e travas de KPI)
SPEC §4: `u ≈ 132px`, `kpi 1u-2u`. VISAO §4: `u ≈ 140px`, `kpi 1u`. Divergência trava a implementação (qual valor vale?).
**Correção:** cravar um único valor de `u` e uma única tabela de travas na SPEC v3; marcar a VISAO como superada nesse ponto.

### M2. Estado de período/comparação não está modelado: global da tela ou por bloco?
VISAO cita "Comparação"; C-08 compara 2 estados; vários KPIs dependem de período. Não está definido se o período é único por tela (period-bar global, que já existe em `diretoria-period-bar.tsx`) ou por bloco (config_json). C-08 precisa de estado próprio (2 UFs).
**Correção:** definir período como estado GLOBAL da tela (reusar `diretoria-period-bar`), propagado a todos os loaders; exceções com estado local (C-08, B-08 modal de período) declaram seus parâmetros em `config_json` do bloco. Documentar o contrato.

### M3. Reuso subestimado: a SPEC manda "adicionar o que falta" sem inventariar o que já existe
Existem queries de vendas/estoque/pedidos, mapa, charts, period-bar, freshness, agenda-calendar, cores/uf/periodo. A SPEC não lista o reaproveitável vs o novo, arriscando reescrever o mapa (onda 3) e charts. Por outro lado, K-* (compras), a-receber/a-pagar e idade/giro NÃO têm query de diretoria ainda (só `FatoCompra`/`FatoSerial` no schema e queries MCP de outro shape).
**Correção:** anexar à SPEC um inventário "reusar / refatorar / criar" por componente, citando os arquivos reais. Marcar explicitamente o que é novo (loaders de compras/financeiro de diretoria) para dimensionar a onda 2.

### M4. Mobile: colapso para 4/4 empilhado não define a ORDEM de empilhamento
"<768px todos viram 4/4 empilhados" , mas a ordem vertical em 1 coluna precisa de regra (por `y` depois `x`? por `ordem`? leitura top-left?). Sem isso, o mobile embaralha.
**Correção:** definir ordem mobile = ordenar por (y asc, x asc) do layout desktop (ou por `ordem` se mantido). Cobrir com teste. Isso também justifica manter um campo de ordem (ver C1).

### M5. Agenda: contradição anexos , schema existe, SPEC diz "gap sem storage"
`DiretoriaEventoAnexo` já está no schema e o HTML usava base64 ≤3MB; a §11 lista "upload real sem storage" como fora de escopo. Há um meio-termo não decidido (base64 no banco como o HTML fazia).
**Correção:** decidir explicitamente: manter anexos via base64 no `DiretoriaEventoAnexo` (igual HTML, limite 3MB) OU adiar para storage. Remover a ambiguidade da §11.

---

## BAIXO

### B1. "Layout por usuário" sem reset-para-padrão nem fallback explícito
Falta o fluxo de "voltar ao layout padrão" e a regra de fallback quando o usuário nunca salvou (assume padrão, ok, mas não está escrito o que acontece se o padrão muda depois).
**Correção:** especificar: sem layout próprio → usa o `é_padrao` da tela; botão "restaurar padrão" apaga o layout do usuário. Documentar.

### B2. Viewer sem permissão de edição: pode reordenar localmente (efêmero) ou é estritamente read-only?
Não definido se quem não tem `diretoria.relatorio.editar` enxerga só o padrão fixo.
**Correção:** cravar read-only puro para quem não tem a capability (sem reordenação client efêmera), para não confundir com "salvar".

### B3. Saneamento de texto e selo de fonte são citados mas sem critério de aceite
§8 e perícia pedem selo quando `fonteDado != real` e remoção de travessões/typos, mas não há checklist verificável.
**Correção:** adicionar critério de aceite: todo bloco `estimado`/`sem_fonte` renderiza selo visível; lint/teste que falha se sobrar `—` ou texto mock conhecido.

---

## Síntese executável (o que muda da v2 para a v3)
1. Resolver o modelo de grid (C1+C2): escolher empacotado posicional, remover ambiguidade x/y/ordem, definir compactador e ordem mobile.
2. Corrigir granularidade `kpi` vs `kpi-grupo` (C3) e unificar números u/travas (M1).
3. Especificar o RBAC efetivo como função pura de interseção, com precedência, gate no servidor e UF-scoping (C4+C5+A4).
4. Modelar as tabelas faltantes: config de negócio (C6) e DDL completo com uniques/índices/FKs (A6), mais integridade catálogo↔banco (A5).
5. Decidir a lib de grid e fazer um spike isolado antes de comprometer a onda 1; reordenar mapa para cedo (A1+A2+A3).
6. Definir a arquitetura de loading (registry + Promise.all + Suspense + cache) na onda 1 (A7).
7. Anexar inventário reusar/criar (M3) e resolver período global (M2) e anexos da agenda (M5).
