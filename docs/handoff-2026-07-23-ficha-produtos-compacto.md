# Handoff , frente "Ficha do pedido + Tabela de produtos + menu Compacto/Filtros/Favoritos" (B-09)

> Branch: `feat/entregas-parciais-base-calculo`. Sessão encerrada em 2026-07-23 por
> contexto cheio. Retomar a partir do **Item 15** (abaixo). Há **outras sessões
> Claude ativas na MESMA branch** , ver "Coordenação".

## Minha frente (arquivos que EU mexo)
- `src/components/tabela-avancada/entregas-catalogo.tsx` , a ficha do pedido (`DetalheEntrega`).
- `src/components/tabela-avancada/produtos-catalogo.tsx` , catálogo/tabela de produtos (arquivo meu, exclusivo).
- `src/components/tabela-avancada/tabela-avancada.tsx` , SÓ nas regiões: popover **Compacto**, painel **Filtrar e agrupar**, **Favoritos**, `EditorModeloCompacto` (topo do arquivo), overlay/scroll das views, hidratação de favoritos/modelos.

## Coordenação (NÃO mexer , território das outras sessões)
- `src/components/tabela-avancada/ui.tsx` , resize de coluna, duplo-clique, `SeletorColunas`.
- Em `tabela-avancada.tsx`: partes de **resize/larguras** e **somas de grupo (`valorSoma`/memoização)**.
- Regra: antes de commitar, `git log`/`git status`; commit atômico e rápido; se colidir, resolver preservando os dois lados. Mesmo arquivo, regiões diferentes , git vinha empilhando linear sem conflito.

## Entregue nesta sessão (tudo commitado, tsc/eslint verdes)
- **Ficha do pedido** reestruturada: seções Dados do Pedido / Venda / Cliente e Endereço / Financeiro do Pedido (Valores, Tributos, Resultado); "Prevista"→"Entrega" com bolinha de prazo + "(há/em X dias)"; CNPJ só número + botão copiar; margem corrigida (÷ Valor Pedido); resumo em uma linha (quantidades + valores custo, toggle Mostrar venda local); reordenações e maiúsculas conforme o dono.
- **Modo "Pedido"** (ficha) no view switcher; **Voltar preserva view/página/scroll** (overlay em vez de troca de tela); **scroll chaining** lista→página.
- **Tabela de produtos** = reuso da `TabelaAvancada` (cabeçalho/total fixos, scroll próprio ~85vh, colunas/sort/resize/busca/filtros/agrupar/compacto/mostrar venda), sem view switcher, código como tag, altura 2x, inicia compacta.
- **Menu Compacto** redesenhado (lista simples, cabeçalho, "Novo modelo" pontilhado, "Meus modelos", editor com estado local = sem lag + busca de coluna, coluna fixa com cadeado, tag de contagem ao lado do nome, nome único + limite 20, botão sempre "Compacto", atalho "x" translúcido roxo para desligar).
- **Filtrar e agrupar**: ícones pequenos neutros no lugar de checkbox (Filter/Layers), "Filtro avançado" em texto com leve destaque.
- **Favoritos**: salvar inline (sem modal), nome único + limite 20, renomear só o nome (lápis), estrela oca, foco âmbar, X vermelho no hover, seção "Meus favoritos".
- Fix: ids duplicados (`vc0`) de modelo/favorito após reload (dedup + avança contador na hidratação).

## ITEM 15 , CANCELADO (decisão do dono, 2026-07-23)
> **Não será mais implementado.** Não haverá truncagem por contagem de caracteres em JS.
> Em seu lugar, o modo COMPACTO passou a dimensionar as colunas por CSS (`table-auto` +
> cap de `32ch` por célula + autosize ao conteúdo, considerando cabeçalho e total),
> ignorando as larguras do usuário e reaplicando sozinho, com uma coluna preenchedora
> levando o cinza do cabeçalho/total até o fim. Implementado em `tabela-avancada.tsx`.
> A descrição original abaixo fica só como registro histórico.

**O que ERA (histórico):** quando a tabela tiver **6+ colunas visíveis** (a coluna Pedido é obrigatória/fixa + 5), abreviar o **texto das células de TEXTO** a **32 caracteres**.

**Regra de corte:**
1. Texto com até 32 caracteres → mostra inteiro.
2. Acima de 32 → pega os primeiros 32; se o 32º for **espaço**, remove esse espaço; concatena "…".
3. Texto completo disponível no **tooltip** (`title`) , ninguém perde informação.
4. **NUNCA** abreviar o **código** (é tag) nem valores (R$), quantidades ou datas.

**Onde implementar:**
- Célula de produto: `celula` em `produtos-catalogo.tsx` (branches de texto: produto, família, marca).
- (Se valer também para pedidos: `celula` em `entregas-catalogo.tsx`.)
- Contar colunas visíveis para ligar o modo (>=6). Como a célula não recebe a contagem hoje, provavelmente passar um flag/valor via contexto (há `OpcoesTabelaContext`) ou calcular no catálogo.

**Pergunta em aberto (o dono decide na retomada):** vale para **todas** as colunas de texto (produto, família, marca) ou só uma específica? E vale só na tabela de **produtos** ou também na de **pedidos**?

**Cuidado:** hoje as células já truncam por CSS (`truncate`, reticências por largura). O item 15 é corte por **contagem de caracteres** (fixo em 32), diferente , decidir se substitui ou soma ao truncate CSS.
