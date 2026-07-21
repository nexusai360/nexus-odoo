#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Proposta de Desenvolvimento (Matrix Fitness Group) em PDF multipagina A4.
Norte visual: skill nexus-orcamento (cores, logo, fontes) + diretrizes ui-ux-pro-max.
Conteudo: inventario de relatorios por modulo + horas + entregaveis + cronograma + investimento.
Render: Google Chrome headless (--print-to-pdf).
"""
import base64, pathlib, subprocess
from datetime import date, timedelta

SKILL_DIR = pathlib.Path.home() / ".claude/skills/nexus-orcamento"
LOGO = "data:image/png;base64," + base64.b64encode((SKILL_DIR / "assets/icon.png").read_bytes()).decode()
OUT_DIR = pathlib.Path(__file__).parent
HTML_PATH = OUT_DIR / "_proposta.html"
PDF_PATH = OUT_DIR / "Proposta-Matrix-Dashboards-2026-07-21.pdf"

ROXO, ROXO2, ROXO3, TINTA = "#7C3AED", "#5438B8", "#3D2685", "#2A1F5C"
CORPO, SUAVE, CLARO, BORDA = "#4A4565", "#6B6585", "#FAF9FE", "#E8E4F5"

VALOR_HORA = 60
INICIO = date(2026, 8, 4)
CAP_SEMANA = 32
VALOR_REPOSICAO = 75000

# ── Inventario (nome, o que entrega, horas) ──
FUNDACAO = [
    ("Atributo de linha e tipo do produto", "Pipeline Odoo para o cache das composições por linha (Magnum/Ultra/Versa/Aura) e por tipo de produto.", 20),
    ("Motor de ciclos", "Engine que calcula consumido, previsão restante e cobertura por produto.", 16),
    ("Motor de status único", "Regra única de status (ruptura/risco/saudável/acumulado) que os relatórios consomem.", 10),
    ("Estrutura de quantidade a chegar", "Registro de itens de compra: a quantidade a chegar não existe hoje no cache.", 12),
    ("Foto diária de estoque e demanda", "Série histórica que alimenta as variações e as colunas mês a mês.", 14),
    ("Snapshot imutável de fechamento de ciclo", "Congela o ciclo encerrado num relatório arquivado e imutável.", 18),
    ("Estrutura de metas de faturamento", "Base que guarda as metas mensais importadas por empresa e vendedor.", 8),
    ("Mapeamento de CNPJs em grupos e construtoras", "De-para que agrupa vários CNPJs por cliente e por recorte (Smart / Aztec).", 10),
    ("Segmento do cliente", "Pipeline do segmento (academia, condomínio, hotel, estúdio) para as composições.", 8),
    ("Plano de contas gerencial", "Estrutura que mapeia as contas do Odoo nas categorias de despesa da rosca.", 10),
    ("UF na despesa", "Estrutura que associa o estado ao lançamento de conta a pagar.", 8),
]
ESTOQUE_REL = [
    ("Indicadores gerais de estoque", "12 indicadores (valor total, médio por local, ticket, em demanda, disponível, a chegar, quantidades e última atualização) com variação de 30 dias.", 6),
    ("Distribuição por local de estoque", "Um card por local (Jarinu, Valinhos, Ceilândia): valor, % do valor, % da quantidade, ticket e quantidade.", 5),
    ("Composição do estoque", "Composição por marca, linha e tipo, com seletor único e escolha de gráfico.", 7),
    ("Demanda x Disponível", "Duas visões (por quantidade e por valor), sempre a custo.", 5),
    ("Tabela de estoque por produto", "Modelo, quantidade, em demanda e disponível, com busca, filtros e ordenação por coluna.", 8),
    ("Ciclo ativo: indicadores", "8 indicadores do ciclo (ruptura, risco, saudáveis, acumulados, previsto, previsão restante, valor em risco e em excesso).", 6),
    ("Ciclo ativo: distribuição por status", "Rosca da distribuição dos produtos por status, com filtros.", 5),
    ("Ciclo ativo: tabela do ciclo", "10 colunas (previsão, consumido, previsão restante, cobertura, status) por produto.", 9),
    ("Ciclos fechado: indicadores", "14 indicadores do ciclo encerrado, incluindo a acurácia da previsão.", 6),
    ("Ciclos fechado: abertura e fechamento mensal", "Primeiro e último dia de cada mês: quantidade, valor, demanda, disponível, a chegar e consumo.", 6),
    ("Ciclos fechado: rosca por status com drill", "Clicar na fatia lista os produtos daquele status com estoque inicial, entradas, previsão, consumido e saldo.", 5),
    ("Ciclos fechado: comparativo atual x anterior", "Indicadores lado a lado com variação e coluna de duração do ciclo.", 5),
    ("Ciclos fechado: acurácia previsto x real", "Precisão da previsão por produto (previsto, real, diferença, acurácia).", 5),
    ("Ciclos fechado: mudança de status entre ciclos", "Quadro melhorou / piorou / manteve, produto a produto.", 5),
]
ESTOQUE_APOIO = [
    ("Cadastro e definição de ciclos", "Criar o ciclo, definir a duração configurável (2/3/4 meses), início, fim e os produtos.", 8),
    ("Importação da previsão do ciclo", "Tela para imputar ou importar a previsão de compra por produto.", 8),
    ("Parametrização de status por produto", "Pop-up dos três pontinhos: faixas de risco, saudável e acumulado por produto (unidade ou %).", 10),
    ("Gestão e arquivo de ciclos fechados", "Lista dos ciclos congelados, abrir qualquer um a qualquer momento.", 6),
]
VENDAS_REL = [
    ("Indicadores principais de vendas", "6 indicadores (valor vendido, pedidos, produtos, ticket, margem média, meta atingida) com variação e filtro de período.", 6),
    ("Composição e margem", "5 ângulos (linha, marca, tipo de cliente, forma de pagamento, CNPJ) com valor, % e margem.", 8),
    ("Produtos vendidos por item", "Quantidade, valor e % do faturamento, com busca e ordenação.", 5),
    ("Ranking de vendas por estado", "UF, valor, % do total, pedidos, produtos, ticket e margem.", 5),
    ("Ranking de vendas por vendedor", "Mesmo recorte por vendedor, com a meta individual atingida.", 5),
    ("Condições de pagamento", "Forma mais usada, prazo médio de recebimento (PMR), entrada média e distribuição por tipo de cliente.", 8),
    ("Curva ABC / Pareto", "Classes A/B/C, faixas 80%/95%, barras com linha acumulada e tabela por classe.", 8),
    ("Carteira a faturar", "Vendido ainda não faturado, em unidades, pedidos e reais.", 5),
    ("Comparação geral: cards de destaque", "Maior faturamento, maior margem, maior ticket, menor prazo e totais.", 4),
    ("Comparação geral: tabela por UF", "Todas as UFs (vendedores, faturamento, margem, PMR, % da receita, ticket, pedidos) com ordenação.", 8),
    ("Comparativo estado A x B", "Dois estados com períodos independentes, indicadores espelhados e variação relativa.", 14),
    ("Comparativo A x B: composições e rankings", "Composições, rankings de vendedor e condições espelhadas nos dois lados.", 8),
]
VENDAS_APOIO = [
    ("Definição de metas de faturamento", "Tela para imputar a meta mensal por empresa e por vendedor.", 6),
    ("Parametrização da curva ABC", "Definir a faixa da curva (80/20 ou 10/20/30% do acumulado).", 5),
    ("Busca e mapeamento de construtoras e grupos", "Campo que reúne vários CNPJs de um mesmo cliente e traz todos os pedidos.", 8),
    ("Recorte grupo / Smart / Aztec", "Chaves no topo que recalculam o painel isolando ou incluindo clientes.", 6),
]
FIN_REL = [
    ("Resumo consolidado do grupo", "6 cards (faturamento total, gastos, resultado, maior faturamento, maior gasto, melhor resultado).", 5),
    ("Blocos por empresa (6 CNPJs)", "Faturamento, gastos, resultado e % gasto sobre faturamento por empresa.", 6),
    ("Composição das despesas", "Rosca das despesas por categoria do plano de contas.", 6),
    ("Drill lateral por categoria e fornecedor", "Ao clicar na categoria: total, %, lançamentos e a tabela despesa por fornecedor.", 6),
    ("Recorte por UF das despesas", "Visão das despesas por estado e por CNPJ mais UF.", 5),
]
FIN_APOIO = [
    ("Parametrização do plano de contas gerencial", "Mapear as contas do Odoo nas categorias de despesa e definir o nível da categoria.", 10),
    ("Imputação de UF na despesa", "Tela para associar o estado a cada lançamento de conta a pagar.", 6),
    ("De-para de empresa e CNPJ", "Resolver o vínculo para exibir o CNPJ real de cada empresa.", 5),
]
DEM_REL = [
    ("B1 · Resumo de demandas", "8 indicadores (valor pendente, abertos, atrasados, itens pendentes, ticket, % coberto, valor descoberto e atrasado).", 5),
    ("B2 · Lista de pedidos pendentes", "Agrupada por pedido (cliente, modelo, UF, prazo, status, reserva, valor) com filtros e busca.", 6),
    ("B4 · Mapa de demandas por estado", "Heatmap do Brasil clicável que filtra a lista de pedidos.", 7),
    ("B5 · Indicadores do pedido selecionado", "Drill do pedido: valor, quantidade, % entregue e % pendente, prazo.", 5),
    ("B6 · Visão geral das demandas", "Ativos, valor médio, pedido mais caro e rosca de atrasados contra no prazo.", 4),
    ("B7 · Máquinas em estoque contra demanda", "Disponível, demanda e % em demanda por modelo.", 5),
    ("B8 · Itens em pedidos ativos", "Por modelo: entregues, a entregar e atrasados, com período próprio.", 5),
    ("B9 · Concentração de atrasos por produto", "Ranking dos modelos em atraso e o Top 3 de concentração.", 5),
]
DEM_APOIO = [
    ("Configuração das etapas de demanda", "Definir quais etapas do pedido contam como demanda em aberto (rege os 8 blocos).", 6),
    ("Lista de organização de entrega", "Leitura da carteira pensada para organizar a entrega.", 4),
]
CONF_TELAS = [
    ("Seleção do local de conferência", "Escolher o estoque; o sistema carrega todos os seriais que o Odoo aponta naquele local.", 6),
    ("Sessão de bipagem e conferência", "Núcleo da aplicação: seriais pendentes em vermelho viram confirmados; captura por leitor e por digitação, com tipo, autor, horário e ordem.", 20),
    ("Painel de indicadores ao vivo", "Total, escaneados, digitados e pendentes (% e quantidade) e rosca de escaneado contra não escaneado.", 8),
    ("Detalhe do serial e observações", "Modal por item para observação (caixa arrebentada, desmontada, peça faltando).", 6),
    ("Contagem de volumes sem série", "Itens sem serial: contador incremental que soma sem recontar, com editar e apagar.", 6),
    ("Quadro de divergências", "Serial em local errado e serial vinculado a outro pedido, destacados como alerta.", 8),
    ("Finalização com dupla confirmação", "Confirmar duas vezes e congelar o inventário.", 5),
    ("Histórico de conferências", "A gaveta: inventários finalizados, arquivados e consultáveis, com quem fez e quando.", 8),
    ("Trilha de auditoria", "Registro de cada ação (usuário, item, tipo, horário, ordem) para auditar a contagem depois.", 6),
]
CONF_INT = [
    ("Integração com leitor de código de barras", "Captura via hardware (USB HID) sincronizada com a tela de bipagem.", 8),
    ("Sincronização de seriais por local", "Puxar do cache a lista do que deveria estar naquele estoque.", 6),
    ("Regra de já bipado ou não", "Marcar em tempo real o que foi conferido e o que ainda falta.", 4),
    ("Regra de divergência de localização", "Detectar o serial que está num local diferente do apontado pelo sistema.", 5),
    ("Regra de serial vinculado a outro pedido", "Alertar quando o item contado já está comprometido com outra venda.", 6),
    ("Persistência da sessão de inventário", "Estrutura que guarda linhas conferidas, volumes, observações e divergências.", 8),
    ("Controle de acesso e alertas", "Quem pode conferir e os avisos ao operador (pendências, divergências, conclusão).", 6),
]
TRANSVERSAIS = [
    ("QA, reconciliação e testes ponta a ponta", "Conferência de cada painel contra o dado real do Odoo e testes de ponta a ponta.", 45),
    ("Gestão, parametrização e homologação", "Reuniões de parametrização (status, plano de contas, mapeamentos) e homologação com o cliente.", 35),
]

def soma(itens): return sum(h for _, _, h in itens)

h_fund = soma(FUNDACAO)
h_estoque = soma(ESTOQUE_REL) + soma(ESTOQUE_APOIO)
h_vendas = soma(VENDAS_REL) + soma(VENDAS_APOIO)
h_fin = soma(FIN_REL) + soma(FIN_APOIO)
h_dem = soma(DEM_REL) + soma(DEM_APOIO)
h_conf = soma(CONF_TELAS) + soma(CONF_INT)
h_trans = soma(TRANSVERSAIS)
h_total = h_fund + h_estoque + h_vendas + h_fin + h_dem + h_conf + h_trans
h_dash = h_total - h_conf

n_relatorios = len(ESTOQUE_REL) + len(VENDAS_REL) + len(FIN_REL) + len(DEM_REL)
n_apoio = len(ESTOQUE_APOIO) + len(VENDAS_APOIO) + len(FIN_APOIO) + len(DEM_APOIO)
n_fund = len(FUNDACAO)
n_conf = len(CONF_TELAS) + len(CONF_INT)
n_itens = n_relatorios + n_apoio + n_fund + n_conf

valor_total = h_total * VALOR_HORA
valor_dash = h_dash * VALOR_HORA
valor_conf = h_conf * VALOR_HORA
desconto = round((VALOR_REPOSICAO - valor_total) * 100 / VALOR_REPOSICAO)

# ── Cronograma: horas por fase somam h_total (assercao) ──
FASES = [
    ("Fase 1", "Fundação de dados + Estoque atual", 85, 3.0),
    ("Fase 2", "Aplicação de Conferência de estoque (bipador)", 128, 4.0),
    ("Fase 3", "Módulo Vendas (painel + comparativos)", 149, 4.5),
    ("Fase 4", "Relatório de estoque por ciclos (ativo + fechado)", 142, 4.5),
    ("Fase 5", "Módulo Financeiro por CNPJ", 79, 2.5),
    ("Fase 6", "Módulo Demandas", 72, 2.5),
]
assert sum(h for *_, h, _ in FASES) == h_total, f"fases {sum(h for *_,h,_ in FASES)} != {h_total}"
total_sem = sum(s for *_, s in FASES)
meses = round(total_sem / 4.345)

def fases_datas():
    linhas, acc = [], 0.0
    for nome, entrega, horas, sem in FASES:
        ini = INICIO + timedelta(days=int(acc * 7))
        fim = INICIO + timedelta(days=int((acc + sem) * 7) - 1)
        linhas.append((nome, entrega, horas, sem, ini, fim, acc / total_sem * 100, sem / total_sem * 100))
        acc += sem
    return linhas
FASES_D = fases_datas()
data_fim = FASES_D[-1][5]
total_dias = (data_fim - INICIO).days

MESES_PT = {8: "Ago", 9: "Set", 10: "Out", 11: "Nov", 12: "Dez"}
def eixo_meses():
    ticks = ""
    for m in (8, 9, 10, 11, 12):
        d = INICIO if m == 8 else date(2026, m, 1)
        left = (d - INICIO).days / total_dias * 100
        ticks += f'<span class="g-tick" style="left:{max(0,left):.1f}%">{MESES_PT[m]}</span>'
    return ticks

def brl(v): return "R$ " + f"{v:,.0f}".replace(",", ".")

# ─────────────────────────── HTML ───────────────────────────
def tabela(titulo, subtitulo, itens, mostrar_idx=True):
    linhas = ""
    for i, (nome, desc, h) in enumerate(itens, 1):
        idx = f'<span class="idx">{i:02d}</span>' if mostrar_idx else ""
        linhas += f'<tr><td class="c-item">{idx}<span class="i-nome">{nome}</span></td><td class="c-desc">{desc}</td><td class="c-h">{h}h</td></tr>'
    return f"""<div class="bloco">
      <div class="bloco-hd">{titulo}<span class="bloco-sub">{subtitulo}</span></div>
      <table class="tbl"><thead><tr><th style="width:31%">Item</th><th>O que entrega</th><th class="right" style="width:9%">Horas</th></tr></thead>
      <tbody>{linhas}</tbody>
      <tfoot><tr><td colspan="2" class="tf">Subtotal &middot; {len(itens)} itens</td><td class="tf right">{soma(itens)}h</td></tr></tfoot>
      </table></div>"""

def gantt():
    linhas = ""
    for nome, entrega, horas, sem, ini, fim, left, width in FASES_D:
        linhas += f"""<div class="g-row"><div class="g-lbl"><strong>{nome}</strong> {entrega}</div>
          <div class="g-track"><div class="g-bar" style="left:{left:.1f}%;width:{width:.1f}%"></div></div></div>"""
    return linhas

def fase_row(nome, entrega, horas, ini, fim):
    return f'<tr><td class="c-item"><span class="i-nome">{nome}</span></td><td class="c-desc">{entrega}</td><td class="c-h" style="white-space:nowrap">{ini.strftime("%d/%m/%Y")} a {fim.strftime("%d/%m/%Y")}</td><td class="c-h">{int(horas)}h</td></tr>'
fases_rows = "".join(fase_row(n, e, h, i, f) for n, e, h, s, i, f, *_ in FASES_D)

HTML = f"""<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><style>
  @page {{ size:A4; margin:15mm 15mm 16mm 15mm; }}
  * {{ box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }}
  html,body {{ font-family:-apple-system,"Helvetica Neue",Arial,sans-serif; color:{TINTA}; background:#fff; }}
  .tnum {{ font-variant-numeric:tabular-nums; }}
  .eyebrow {{ font-size:9pt; font-weight:700; letter-spacing:1.6px; color:{ROXO2}; text-transform:uppercase; }}
  .dot {{ display:inline-block; width:6px; height:6px; border-radius:50%; background:{ROXO2}; margin-right:7px; vertical-align:middle; }}
  h1 {{ font-size:29pt; font-weight:800; letter-spacing:-0.8px; line-height:1.1; margin:12px 0; }}
  h2 {{ font-size:16pt; font-weight:800; letter-spacing:-0.3px; margin:0 0 3px; }}
  .lead {{ font-size:10.5pt; color:{CORPO}; line-height:1.55; }}

  .capa {{ page-break-after:always; padding-top:4mm; }}
  .capa-hd {{ display:flex; justify-content:space-between; align-items:center; }}
  .ico {{ height:52px; }} .wm {{ font-size:15pt; font-weight:800; margin-left:11px; vertical-align:middle; }}
  .metabox {{ display:flex; gap:12px; margin-top:10mm; }}
  .metabox .cell {{ flex:1; background:{CLARO}; border-radius:12px; padding:15px 18px; }}
  .meta-lbl {{ font-size:8.5pt; font-weight:700; letter-spacing:1.3px; color:{ROXO2}; text-transform:uppercase; display:block; margin-bottom:7px; }}
  .meta-row {{ font-size:10pt; color:{CORPO}; line-height:1.6; }} .meta-row strong {{ color:{TINTA}; }}
  .nums {{ display:flex; gap:10px; margin-top:9mm; }}
  .num {{ flex:1; background:{CLARO}; border:1.5px solid {BORDA}; border-radius:14px; padding:18px 12px; text-align:center; }}
  .num .v {{ font-size:22pt; font-weight:800; color:{ROXO}; letter-spacing:-1px; line-height:1; font-variant-numeric:tabular-nums; }}
  .num .l {{ font-size:7.5pt; font-weight:700; letter-spacing:0.8px; color:{SUAVE}; text-transform:uppercase; margin-top:9px; line-height:1.3; }}

  .sec {{ margin-top:9mm; }}
  .sec-hd {{ border-bottom:2px solid {BORDA}; padding-bottom:9px; margin-bottom:6mm; }}
  .sec-kick {{ font-size:8.5pt; font-weight:700; letter-spacing:1.4px; color:{ROXO2}; text-transform:uppercase; display:block; margin-bottom:5px; }}

  .bloco {{ margin-bottom:7mm; page-break-inside:avoid; }}
  .bloco-hd {{ font-size:11.5pt; font-weight:800; color:{TINTA}; margin-bottom:9px; padding-left:10px; border-left:3px solid {ROXO}; }}
  .bloco-sub {{ font-size:9pt; font-weight:600; color:{SUAVE}; margin-left:9px; }}
  table.tbl {{ width:100%; border-collapse:separate; border-spacing:0 4px; }}
  .tbl thead th {{ text-align:left; font-size:8pt; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:{SUAVE}; padding:0 12px 5px; }}
  .tbl thead th.right {{ text-align:right; }}
  .tbl tbody td {{ background:{CLARO}; padding:10px 12px; vertical-align:top; font-size:9.4pt; color:{CORPO}; line-height:1.4; }}
  .tbl tbody td.c-item {{ border-top-left-radius:9px; border-bottom-left-radius:9px; }}
  .tbl tbody td.c-desc {{ padding-right:16px; }}
  .tbl tbody td.c-h {{ border-top-right-radius:9px; border-bottom-right-radius:9px; text-align:right; font-weight:800; color:{TINTA}; white-space:nowrap; font-variant-numeric:tabular-nums; }}
  .idx {{ display:inline-block; min-width:22px; font-weight:800; color:{ROXO}; font-size:8.5pt; font-variant-numeric:tabular-nums; }}
  .i-nome {{ font-weight:700; color:{TINTA}; }}
  .tf {{ font-size:8.5pt; font-weight:700; color:{ROXO2}; text-transform:uppercase; letter-spacing:0.6px; padding:5px 12px 0; }}
  .tf.right {{ text-align:right; font-variant-numeric:tabular-nums; }}

  .g-axis {{ position:relative; height:16px; margin:2mm 0 3mm 44%; }}
  .g-tick {{ position:absolute; font-size:8pt; font-weight:700; color:{SUAVE}; letter-spacing:0.5px; }}
  .g-row {{ display:flex; align-items:center; margin-bottom:8px; page-break-inside:avoid; }}
  .g-lbl {{ width:44%; font-size:9pt; color:{CORPO}; padding-right:12px; line-height:1.3; }} .g-lbl strong {{ color:{ROXO}; }}
  .g-track {{ flex:1; position:relative; height:20px; background:{CLARO}; border-radius:6px; border:1px solid {BORDA}; }}
  .g-bar {{ position:absolute; top:2px; height:14px; background:linear-gradient(90deg,{ROXO},{ROXO2}); border-radius:5px; }}

  .cards {{ display:flex; gap:14px; margin-top:6mm; }}
  .card {{ flex:1; border-radius:14px; padding:18px 22px; }}
  .card.out {{ background:#fff; border:1.5px solid {BORDA}; }}
  .card.fill {{ background:{ROXO3}; color:#fff; position:relative; }}
  .card .lbl {{ font-size:9pt; font-weight:700; letter-spacing:1.4px; text-transform:uppercase; display:block; margin-bottom:9px; }}
  .card.out .lbl {{ color:{ROXO2}; }} .card.fill .lbl {{ color:#C9BEED; }}
  .card .val {{ font-size:27pt; font-weight:800; letter-spacing:-1px; line-height:1; display:block; font-variant-numeric:tabular-nums; }}
  .card.out .val {{ color:{TINTA}; text-decoration:line-through; opacity:.45; }} .card.fill .val {{ color:#fff; }}
  .card .cap {{ font-size:9pt; line-height:1.45; display:block; margin-top:9px; }} .card.out .cap {{ color:{SUAVE}; }} .card.fill .cap {{ color:#E5DCFC; }}
  .badge {{ position:absolute; top:16px; right:18px; background:#FFD84D; color:{TINTA}; font-size:8.5pt; font-weight:800; padding:4px 11px; border-radius:999px; }}
  .invtab {{ width:100%; border-collapse:separate; border-spacing:0 5px; margin-top:6mm; }}
  .invtab td {{ background:{CLARO}; padding:12px 16px; font-size:10pt; color:{CORPO}; }}
  .invtab td:first-child {{ border-radius:9px 0 0 9px; font-weight:700; color:{TINTA}; }}
  .invtab td:last-child {{ border-radius:0 9px 9px 0; text-align:right; font-weight:800; color:{TINTA}; font-variant-numeric:tabular-nums; }}
  .invtab tr.tot td {{ background:{ROXO3}; color:#fff; font-size:11pt; }} .invtab tr.tot td:last-child {{ color:#fff; }}

  .cond {{ margin-top:7mm; padding:13px 16px; background:{CLARO}; border-left:3px solid {ROXO2}; border-radius:6px; font-size:9.3pt; color:{CORPO}; line-height:1.55; }}
  .cond strong {{ color:{TINTA}; }}
  .foot {{ margin-top:9mm; padding-top:9px; border-top:1px solid {BORDA}; font-size:8pt; color:{SUAVE}; display:flex; justify-content:space-between; }}
  .pb {{ page-break-before:always; }}
</style></head><body>

<div class="capa">
  <div class="capa-hd">
    <div class="eyebrow"><span class="dot"></span>NEXUS AI &middot; PROPOSTA DE DESENVOLVIMENTO</div>
    <div><img class="ico" src="{LOGO}"><span class="wm">Nexus AI</span></div>
  </div>
  <h1>Plataforma de Dashboards<br>e Aplicação de Conferência de Estoque</h1>
  <div class="lead">Desenvolvimento sob medida sobre a plataforma analítica que já lê o ERP Odoo do grupo. Cobre quatro módulos de dashboard (Estoque com os relatórios de ciclo, Vendas, Financeiro e Demandas) e uma aplicação operacional de conferência de estoque com leitor de código de barras. Escopo levantado na reunião de 20/07/2026 e no protótipo apresentado.</div>

  <div class="metabox">
    <div class="cell"><span class="meta-lbl">Cliente</span>
      <div class="meta-row"><strong>Empresa:</strong> Matrix Fitness Group</div>
      <div class="meta-row"><strong>Grupo:</strong> Icaro / JHT</div>
      <div class="meta-row"><strong>Contato:</strong> Victor Icaro</div>
    </div>
    <div class="cell"><span class="meta-lbl">Proposta</span>
      <div class="meta-row"><strong>Emissão:</strong> {INICIO.strftime('%d/%m/%Y')}</div>
      <div class="meta-row"><strong>Modalidade:</strong> Projeto por fases</div>
      <div class="meta-row"><strong>Base:</strong> reunião 20/07 e protótipo</div>
    </div>
  </div>

  <div class="nums">
    <div class="num"><div class="v">{n_itens}</div><div class="l">Itens a<br>desenvolver</div></div>
    <div class="num"><div class="v">{n_relatorios}</div><div class="l">Relatórios</div></div>
    <div class="num"><div class="v">{int(h_total)}h</div><div class="l">Horas de<br>desenvolvimento</div></div>
    <div class="num"><div class="v">~{meses}</div><div class="l">Meses<br>estimados</div></div>
    <div class="num"><div class="v">{brl(valor_total)}</div><div class="l">Investimento</div></div>
  </div>

  <div class="sec">
    <div class="sec-hd"><span class="sec-kick">O que este documento mostra</span></div>
    <div class="lead">Cada relatório, cada tela de apoio e cada tela de parametrização está listada individualmente, com o que entrega e as horas de desenvolvimento. Além dos dashboards, há uma <strong>fundação de dados</strong> (motores e estruturas que hoje não existem no sistema) e uma <strong>aplicação de conferência</strong> à parte. Ao final: o cronograma por fases, na ordem de prioridade definida na reunião, e o investimento.</div>
  </div>

  <div class="foot"><div><strong>NEXUS AI</strong> &middot; CNPJ 64.420.135/0001-99</div><div>João Zanini &middot; WhatsApp (61) 98440-9067</div></div>
</div>

<div class="sec">
  <div class="sec-hd"><span class="sec-kick">Camada base</span><h2>Fundação de dados e integrações</h2>
  <div class="lead" style="margin-top:6px">Motores e estruturas que os relatórios consomem e que <strong>não existem hoje</strong> no sistema. É o alicerce: sem eles, metade dos indicadores pedidos não tem de onde sair.</div></div>
  {tabela("Motores e estruturas de dados", "servem a vários módulos", FUNDACAO)}
</div>

<div class="sec pb">
  <div class="sec-hd"><span class="sec-kick">Módulo 1 &middot; Prioridade 1</span><h2>Estoque (atual e relatórios de estoque por ciclo)</h2></div>
  {tabela("Relatórios", "as telas de análise, três telas de estoque", ESTOQUE_REL)}
  {tabela("Telas de apoio e parametrização", "onde se cadastra e se define a regra", ESTOQUE_APOIO)}
</div>

<div class="sec pb">
  <div class="sec-hd"><span class="sec-kick">Módulo 2 &middot; Prioridade 3</span><h2>Vendas</h2></div>
  {tabela("Relatórios", "painel, comparação geral e comparativo A x B", VENDAS_REL)}
  {tabela("Telas de apoio e parametrização", "metas, curva ABC, grupos de CNPJ", VENDAS_APOIO)}
</div>

<div class="sec pb">
  <div class="sec-hd"><span class="sec-kick">Módulo 3 &middot; Prioridade 5</span><h2>Financeiro por CNPJ</h2></div>
  {tabela("Relatórios", "consolidado do grupo, por empresa e despesas", FIN_REL)}
  {tabela("Telas de apoio e parametrização", "plano de contas, UF e de-para de CNPJ", FIN_APOIO)}
</div>

<div class="sec pb">
  <div class="sec-hd"><span class="sec-kick">Módulo 4 &middot; Prioridade 6</span><h2>Demandas</h2></div>
  {tabela("Relatórios", "um painel com 8 blocos, cada bloco é um relatório", DEM_REL)}
  {tabela("Telas de apoio e parametrização", "etapas de demanda e organização de entrega", DEM_APOIO)}
</div>

<div class="sec pb">
  <div class="sec-hd"><span class="sec-kick">Aplicação à parte &middot; Prioridade 2</span><h2>Aplicação de Conferência de Estoque (bipador)</h2>
  <div class="lead" style="margin-top:6px">Não é um dashboard: é uma <strong>aplicação operacional</strong> com captura de hardware (leitor de código de barras), sessão de inventário, trilha de quem fez o que e regras de alerta (serial em local errado, serial vinculado a outro pedido).</div></div>
  {tabela("Telas da aplicação", "o fluxo de conferência", CONF_TELAS)}
  {tabela("Integrações e regras técnicas", "hardware, sincronização, alertas e auditoria", CONF_INT)}
</div>

<div class="sec pb">
  <div class="sec-hd"><span class="sec-kick">Qualidade e gestão</span><h2>Atividades transversais</h2></div>
  {tabela("Aplicam a todos os módulos", "qualidade e conciliação contra o dado real", TRANSVERSAIS, mostrar_idx=False)}

  <div class="sec-hd" style="margin-top:9mm"><span class="sec-kick">Consolidado</span><h2>O tamanho da obra</h2></div>
  <table class="invtab">
    <tr><td>Fundação de dados e integrações ({n_fund} itens)</td><td>{int(h_fund)}h</td></tr>
    <tr><td>Módulo Estoque ({len(ESTOQUE_REL)+len(ESTOQUE_APOIO)} itens, sendo {len(ESTOQUE_REL)} relatórios)</td><td>{int(h_estoque)}h</td></tr>
    <tr><td>Módulo Vendas ({len(VENDAS_REL)+len(VENDAS_APOIO)} itens, sendo {len(VENDAS_REL)} relatórios)</td><td>{int(h_vendas)}h</td></tr>
    <tr><td>Módulo Financeiro ({len(FIN_REL)+len(FIN_APOIO)} itens, sendo {len(FIN_REL)} relatórios)</td><td>{int(h_fin)}h</td></tr>
    <tr><td>Módulo Demandas ({len(DEM_REL)+len(DEM_APOIO)} itens, sendo {len(DEM_REL)} relatórios)</td><td>{int(h_dem)}h</td></tr>
    <tr><td>Aplicação de Conferência ({n_conf} itens: 9 telas e 7 integrações)</td><td>{int(h_conf)}h</td></tr>
    <tr><td>Transversais (QA, reconciliação e gestão)</td><td>{int(h_trans)}h</td></tr>
    <tr class="tot"><td>TOTAL &middot; {n_itens} itens &middot; {n_relatorios} relatórios</td><td>{int(h_total)}h</td></tr>
  </table>
</div>

<div class="sec pb">
  <div class="sec-hd"><span class="sec-kick">Cronograma</span><h2>Plano de implementação por fases</h2>
  <div class="lead" style="margin-top:6px">Entrega incremental, painel a painel, na ordem de prioridade definida na reunião (Estoque, Conferência, Vendas, Ciclos, Financeiro, Demandas). Premissa: início em {INICIO.strftime('%d/%m/%Y')}, um desenvolvedor sênior a {CAP_SEMANA}h úteis por semana. Com um segundo desenvolvedor, o prazo comprime para cerca da metade.</div></div>

  <div class="g-axis">{eixo_meses()}</div>
  <div style="margin-bottom:7mm">{gantt()}</div>

  <table class="tbl"><thead><tr><th style="width:12%">Fase</th><th>Entrega</th><th class="right" style="width:26%">Janela</th><th class="right" style="width:10%">Horas</th></tr></thead><tbody>{fases_rows}</tbody></table>
  <div class="lead" style="margin-top:6mm"><strong>Entrega prevista da última fase:</strong> {data_fim.strftime('%d/%m/%Y')}. Cada fase é entregue e validada isoladamente, então o cliente começa a usar o Estoque muito antes de o projeto terminar.</div>
</div>

<div class="sec pb">
  <div class="sec-hd"><span class="sec-kick">Investimento</span><h2>Proposta comercial</h2></div>
  <div class="cards">
    <div class="card out"><span class="lbl">Valor de referência</span><span class="val">{brl(VALOR_REPOSICAO)}</span><span class="cap">O que custaria construir tudo do zero, sem a plataforma que já existe.</span></div>
    <div class="card fill"><div class="badge">{desconto}% abaixo</div><span class="lbl">Seu investimento</span><span class="val">{brl(valor_total)}</span><span class="cap">{int(h_total)}h a {brl(VALOR_HORA)}/h. Aproveita toda a fundação já construída.</span></div>
  </div>

  <table class="invtab">
    <tr><td>Plataforma de dashboards (4 módulos, fundação e qualidade)</td><td>{brl(valor_dash)}</td></tr>
    <tr><td>Aplicação de Conferência de estoque (pode ser contratada à parte)</td><td>{brl(valor_conf)}</td></tr>
    <tr class="tot"><td>INVESTIMENTO TOTAL</td><td>{brl(valor_total)}</td></tr>
  </table>

  <div class="cond"><strong>Condições:</strong> projeto cobrado por fase, com faixa de horas por pacote (não preço fechado por item), devido à conciliação de dados. Pagamento por marco de entrega de cada fase. Os valores pressupõem que o cliente cadastre no Odoo os dados de origem hoje inexistentes (atributo linha e tipo, meta mensal, previsão de ciclo, plano de contas, UF na despesa, segmento e vendedor). A aplicação de Conferência pode ser contratada junto ou separadamente.</div>

  <div class="foot"><div><strong>NEXUS AI</strong> &middot; CNPJ 64.420.135/0001-99</div><div>João Zanini &middot; WhatsApp (61) 98440-9067</div></div>
</div>

</body></html>"""

HTML_PATH.write_text(HTML, encoding="utf-8")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                f"--print-to-pdf={PDF_PATH}", f"file://{HTML_PATH}"], check=True, capture_output=True)
print("PDF:", PDF_PATH.name)
print(f"itens={n_itens} relatorios={n_relatorios} apoio={n_apoio} fundacao={n_fund} conf={n_conf}")
print(f"horas total={h_total} dash={h_dash} conf={h_conf} | valor={valor_total} (dash={valor_dash} conf={valor_conf}) desc={desconto}%")
print(f"cronograma {total_sem} semanas (~{meses} meses), fim {data_fim}")
