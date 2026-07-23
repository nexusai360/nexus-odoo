#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Proposta comercial , Desenvolvimento de Dashboard Analytics (Matrix Group).
Documento construido em HTML e exportado para PDF (Chrome headless) + numeracao de paginas.
Norte visual: skill nexus-orcamento (cores, logo, fontes) + diretrizes ui-ux-pro-max.
"""
import base64, io, os, pathlib, subprocess
from datetime import date, timedelta

SKILL_DIR = pathlib.Path.home() / ".claude/skills/nexus-orcamento"
LOGO = "data:image/png;base64," + base64.b64encode((SKILL_DIR / "assets/icon.png").read_bytes()).decode()
OUT_DIR = pathlib.Path(__file__).parent
HTML_PATH = OUT_DIR / "_proposta.html"
PDF_PATH = OUT_DIR / os.environ.get("OUT", "Proposta-Dashboard-Analytics-Matrix.pdf")

ROXO, ROXO2, ROXO3, TINTA = "#7C3AED", "#5438B8", "#3D2685", "#2A1F5C"
CORPO, SUAVE, CLARO, BORDA = "#4A4565", "#6B6585", "#FAF9FE", "#E8E4F5"

VALOR_HORA = int(os.environ.get("VH", 60))
MERCADO_MIN, MERCADO_MAX = int(os.environ.get("MM", 120)), 350
EMISSAO = date(2026, 7, 21)
VALIDADE = EMISSAO + timedelta(days=15)
INICIO = date(2026, 8, 3)
ENTREGA = date(2026, 10, 13)
VIS_FIM = date(2026, 10, 31)  # eixo do cronograma mostra ate o fim de outubro
EMPRESA_RAZAO = "(JHT SP Comércio de Produtos e Equipamentos<br>Esportivos Ltda)"

# ── Inventario ──
# Arquitetura: (nome, desc, horas, tag)  tag em {None, "config", "acao", "custom"}
ARQUITETURA = [
    ("Classificação de produtos por linha e tipo", "Organizar o catálogo por linha (Magnum, Ultra, Versa, Aura) e por tipo, base das composições dos painéis.", 20, "config"),
    ("Estrutura de ciclos de estoque", "A lógica que organiza o estoque por períodos (ciclos), com previsão, consumo e cobertura por produto.", 16, None),
    ("Régua de status dos produtos", "Regra única que classifica cada produto em ruptura, risco, saudável ou acumulado, usada por todos os relatórios.", 10, None),
    ("Consolidação de compras a receber", "Trazer a quantidade comprada que ainda não chegou, para compor o estoque projetado.", 12, None),
    ("Histórico diário de estoque e demanda", "Registro diário que permite comparar períodos e montar a evolução mês a mês.", 14, None),
    ("Arquivamento de ciclos encerrados", "Congelar o ciclo fechado num relatório fixo, consultável a qualquer momento.", 18, None),
    ("Cadastro de metas de faturamento", "Leitura das metas mensais por empresa e por vendedor.", 8, None),
    ("Agrupamento de clientes e construtoras", "Reunir os vários CNPJs de um mesmo cliente ou construtora num só grupo.", 10, "acao"),
    ("Classificação de clientes por segmento", "Organizar os clientes por segmento (academia, condomínio, hotel, estúdio).", 8, "acao"),
    ("Estruturação do plano de contas gerencial", "Organizar as contas em categorias de despesa para a análise financeira.", 10, "config"),
    ("Registro de estado (UF) nas despesas", "Associar o estado a cada despesa, para a visão por região.", 8, "custom"),
]
TAGS = {"config": "requer configuração no Odoo", "acao": "requer ação da equipe Matrix Group", "custom": "requer customização e configuração no Odoo"}

ESTOQUE_REL = [
    ("Indicadores gerais de estoque", "12 indicadores (valor total, médio por local, ticket, em demanda, disponível, a chegar e quantidades) com variação de 30 dias.", 6),
    ("Distribuição por local", "Um card por local (Jarinu, Valinhos, Ceilândia): valor, participação e quantidade.", 5),
    ("Composição do estoque", "Composição por marca, linha e tipo, com seletor único e escolha de gráfico.", 7),
    ("Demanda contra disponível", "Duas visões (por quantidade e por valor), sempre a custo.", 5),
    ("Tabela de estoque por produto", "Modelo, quantidade, em demanda e disponível, com busca, filtros e ordenação.", 8),
    ("Ciclo ativo: indicadores", "8 indicadores do ciclo (ruptura, risco, saudáveis, acumulados, previsto, previsão restante e valores).", 6),
    ("Ciclo ativo: distribuição por status", "Gráfico da distribuição dos produtos por status, com filtros.", 5),
    ("Ciclo ativo: tabela do ciclo", "10 colunas (previsão, consumido, previsão restante, cobertura e status) por produto.", 9),
    ("Ciclos encerrados: indicadores", "14 indicadores do ciclo fechado, incluindo a acurácia da previsão.", 6),
    ("Ciclos encerrados: evolução mensal", "Primeiro e último dia de cada mês: quantidade, valor, demanda, disponível e consumo.", 6),
    ("Ciclos encerrados: análise por status", "Ao clicar no status, a lista dos produtos com estoque inicial, entradas, previsão, consumo e saldo.", 5),
    ("Ciclos encerrados: comparativo entre ciclos", "Indicadores lado a lado, com variação e a duração de cada ciclo.", 5),
    ("Ciclos encerrados: previsto contra real", "Precisão da previsão por produto (previsto, real, diferença, acurácia).", 5),
    ("Ciclos encerrados: mudança de status", "Quadro melhorou, piorou ou manteve, produto a produto.", 5),
]
ESTOQUE_GESTAO = [
    ("Definição de ciclos", "Criar o ciclo, definir a duração (2, 3 ou 4 meses), o período e os produtos.", 8),
    ("Importação da previsão", "Tela para lançar ou importar a previsão de compra por produto.", 8),
    ("Configuração de status por produto", "Definir, por produto, as faixas de risco, saudável e acumulado (em unidade ou %).", 10),
    ("Consulta de ciclos encerrados", "Lista dos ciclos arquivados, para abrir qualquer um a qualquer momento.", 6),
]
VENDAS_REL = [
    ("Indicadores de vendas", "6 indicadores (valor vendido, pedidos, produtos, ticket, margem, meta atingida) com variação e período.", 6),
    ("Composição e margem", "5 recortes (linha, marca, tipo de cliente, forma de pagamento, CNPJ) com valor, participação e margem.", 8),
    ("Produtos vendidos", "Quantidade, valor e participação por produto, com busca e ordenação.", 5),
    ("Ranking por estado", "UF, valor, participação, pedidos, ticket e margem.", 5),
    ("Ranking por vendedor", "Mesmo recorte por vendedor, com a meta individual.", 5),
    ("Condições de pagamento", "Forma mais usada, prazo médio de recebimento, entrada média e distribuição por tipo de cliente.", 8),
    ("Curva ABC (Pareto)", "Classes A, B e C, com o gráfico de concentração e a tabela por classe.", 8),
    ("Carteira a faturar", "O que foi vendido e ainda não faturou, em unidades, pedidos e reais.", 5),
    ("Comparação geral de estados", "Todos os estados numa tabela ordenável, com os destaques (maior faturamento, margem, ticket).", 8),
    ("Comparação geral: destaques", "Cards com os líderes de cada indicador entre os estados.", 4),
    ("Comparativo entre dois estados", "Dois estados lado a lado, com períodos independentes e variação relativa.", 14),
    ("Comparativo: composições e rankings", "Composições, rankings de vendedor e condições espelhadas nos dois lados.", 8),
]
VENDAS_GESTAO = [
    ("Definição de metas", "Lançar a meta mensal por empresa e por vendedor.", 6),
    ("Configuração da curva ABC", "Definir a faixa da curva (80/20 ou 10/20/30% do acumulado).", 5),
    ("Agrupamento de clientes", "Reunir os CNPJs de um mesmo cliente ou construtora e buscar por nome.", 8),
    ("Recorte por grupo de cliente", "Chaves que recalculam o painel isolando ou incluindo grupos de clientes.", 6),
]
FIN_REL = [
    ("Resumo consolidado do grupo", "6 indicadores (faturamento total, gastos, resultado e os líderes entre as empresas).", 5),
    ("Resultado por empresa", "Por CNPJ: faturamento, gastos, resultado e percentual de gasto, com o indicador de lucro ou prejuízo (6 empresas).", 7),
    ("Composição das despesas", "Distribuição das despesas por categoria, em gráfico.", 6),
    ("Detalhamento da categoria", "Ao selecionar a categoria: valor total, participação nos gastos e número de lançamentos.", 5),
    ("Ranking de despesas por fornecedor", "As maiores despesas da categoria, por fornecedor.", 5),
    ("Tabela de despesas por fornecedor", "Fornecedor, valor e participação na categoria.", 4),
    ("Despesas por estado", "Visão das despesas por estado e por empresa.", 5),
]
FIN_GESTAO = [
    ("Configuração do plano de contas", "Organizar as contas em categorias de despesa e definir o nível de análise.", 10),
    ("Registro de estado nas despesas", "Associar o estado a cada despesa lançada.", 6),
    ("Vínculo empresa e CNPJ", "Ajustar o vínculo para exibir o CNPJ correto de cada empresa.", 5),
]
DEM_REL = [
    ("Resumo de demandas", "8 indicadores (valor pendente, abertos, atrasados, itens pendentes, cobertura e valores).", 5),
    ("Lista de pedidos pendentes", "Agrupada por pedido (cliente, modelo, estado, prazo, status e valor), com filtros e busca.", 6),
    ("Mapa de demandas por estado", "Mapa do Brasil que, ao clicar, filtra a lista de pedidos.", 7),
    ("Detalhe do pedido", "Ao selecionar um pedido: valor, quantidade, percentual entregue e pendente, prazo.", 5),
    ("Visão geral", "Pedidos ativos, valor médio, pedido mais caro e a divisão atrasados contra no prazo.", 4),
    ("Estoque contra demanda", "Por modelo: disponível, demanda e percentual em demanda.", 5),
    ("Itens em pedidos ativos", "Por modelo: entregues, a entregar e atrasados, com filtro de período.", 5),
    ("Concentração de atrasos", "Ranking dos modelos em atraso e os três que mais concentram.", 5),
]
DEM_GESTAO = [
    ("Configuração das etapas", "Definir quais etapas do pedido contam como demanda em aberto.", 6),
    ("Organização de entrega", "Leitura da carteira pensada para organizar a entrega.", 4),
]
QUALIDADE = [
    ("Conferência dos números", "Ao fim de cada módulo, cada painel é conferido contra o dado real do sistema.", 45),
    ("Testes e homologação", "Testes de cada módulo e homologação com o cliente antes da entrega.", 35),
]

def hh(itens): return sum(i[2] for i in itens)
h_arq = hh(ARQUITETURA)
h_est = hh(ESTOQUE_REL) + hh(ESTOQUE_GESTAO)
h_ven = hh(VENDAS_REL) + hh(VENDAS_GESTAO)
h_fin = hh(FIN_REL) + hh(FIN_GESTAO)
h_dem = hh(DEM_REL) + hh(DEM_GESTAO)
h_qua = hh(QUALIDADE)
h_modulos = h_est + h_ven + h_fin + h_dem
h_total = h_arq + h_modulos + h_qua
n_rel = len(ESTOQUE_REL) + len(VENDAS_REL) + len(FIN_REL) + len(DEM_REL)
n_gestao = len(ESTOQUE_GESTAO) + len(VENDAS_GESTAO) + len(FIN_GESTAO) + len(DEM_GESTAO)
n_itens = len(ARQUITETURA) + n_rel + n_gestao
valor_cobrado = h_modulos * VALOR_HORA
h_cortesia = h_arq + h_qua
valor_mercado = h_total * MERCADO_MIN
desconto = round((valor_mercado - valor_cobrado) * 100 / valor_mercado)
parcela = valor_cobrado // 2
def brl(v): return "R$ " + f"{v:,.0f}".replace(",", ".")

# ── Cronograma ──
FASES = [("Fase 1", "Arquitetura e integração de dados", h_arq),
         ("Fase 2", "Módulo Estoque", h_est),
         ("Fase 3", "Módulo Vendas", h_ven),
         ("Fase 4", "Módulo Financeiro", h_fin),
         ("Fase 5", "Módulo Demandas", h_dem)]
span_trab = (ENTREGA - INICIO).days
span_vis = (VIS_FIM - INICIO).days
peso = sum(h for *_, h in FASES)
def fases_datas():
    out, acc = [], 0
    for k, (nome, ent, h) in enumerate(FASES):
        d0 = round(acc / peso * span_trab); acc += h
        d1 = span_trab if k == len(FASES) - 1 else round(acc / peso * span_trab)
        ini = INICIO + timedelta(days=d0); fim = INICIO + timedelta(days=d1 - 1)
        out.append((nome, ent, h, ini, fim, d0 / span_vis * 100, (d1 - d0) / span_vis * 100))
    return out
FASES_D = fases_datas()
MESES = {8: "Agosto", 9: "Setembro", 10: "Outubro"}
def mes_pos(m): return (date(2026, m, 1) - INICIO).days / span_vis * 100 if m != 8 else 0.0
SEPS = [mes_pos(9), mes_pos(10)]

def selo_sep():
    return "".join(f'<span class="g-sep" style="left:{p:.1f}%"></span>' for p in SEPS)

# ─────────────────────────── HTML ───────────────────────────
def tabela(titulo, subtitulo, itens, idx=True, arq=False):
    rows = ""
    for i, it in enumerate(itens, 1):
        nome, desc, h = it[0], it[1], it[2]
        tag = ""
        if arq and len(it) > 3 and it[3]:
            tag = f'<span class="odoo-tag">{TAGS[it[3]]}</span>'
        num = f'<span class="idx">{i:02d}</span>' if idx else ""
        rows += f'<tr><td class="c-item">{num}<span class="i-nome">{nome}</span></td><td class="c-desc">{desc}{tag}</td><td class="c-h">{h}h</td></tr>'
    return f"""<div class="bloco">
      <div class="bloco-hd">{titulo}<span class="bloco-sub">{subtitulo}</span></div>
      <table class="tbl"><thead><tr><th style="width:30%">Item</th><th>O que entrega</th><th class="right" style="width:8%">Horas</th></tr></thead>
      <tbody>{rows}</tbody>
      <tfoot><tr><td colspan="2" class="tf">{len(itens)} itens</td><td class="tf right">{hh(itens)}h</td></tr></tfoot></table></div>"""

def modulo(kick, nome, sub, rel, gestao):
    return f"""<section class="page">
      <div class="mod-hd"><span class="kick">{kick}</span><h2>{nome}</h2><div class="mod-sub">{sub}</div></div>
      {tabela("Relatórios", "as telas de análise", rel)}
      <div class="keep"><div class="mod-tag">Módulo {nome}</div>{tabela("Telas de gerenciamento", "onde se cadastra e se define a regra", gestao)}</div>
    </section>"""

def gantt():
    linhas = ""
    for nome, ent, h, ini, fim, left, width in FASES_D:
        linhas += f'<div class="g-row"><div class="g-lbl"><strong>{nome}</strong> {ent}</div><div class="g-track">{selo_sep()}<div class="g-bar" style="left:{left:.1f}%;width:{max(width,2):.1f}%"></div></div></div>'
    cw = span_trab / span_vis * 100
    linhas += f'<div class="g-row"><div class="g-lbl"><strong>Contínuo</strong> Conferência e homologação</div><div class="g-track">{selo_sep()}<div class="g-bar cont" style="left:0;width:{cw:.1f}%"></div></div></div>'
    return linhas

def eixo():
    t = ""
    for m in (8, 9, 10):
        t += f'<span class="g-tick" style="left:{mes_pos(m):.1f}%">{MESES[m]}</span>'
    return t

fases_rows = "".join(f'<tr><td class="c-item"><span class="i-nome">{n}</span></td><td class="c-desc">{e}</td><td class="c-h" style="white-space:nowrap">{i.strftime("%d/%m")} a {f.strftime("%d/%m")}</td><td class="c-h">{int(h)}h</td></tr>' for n, e, h, i, f, *_ in FASES_D)

SUMARIO = [("Visão geral do que será entregue", 2), ("Arquitetura e integração de dados", 3),
           ("Módulo Estoque (atual e ciclos)", 4), ("Módulo Vendas (painel e comparativos)", 6),
           ("Módulo Financeiro (resultado por empresa)", 8), ("Módulo Demandas (carteira e entregas)", 9),
           ("Conferência e homologação", 10), ("Escopo do desenvolvimento", 10),
           ("Cronograma de implementação", 11), ("Proposta comercial", 12)]
sumario_html = "".join(f'<div class="sm-row"><span class="sm-dot"></span><span class="sm-t">{t}</span><span class="sm-lead"></span><span class="sm-p">página {p}</span></div>' for t, p in SUMARIO)

HERO_SVG = f"""<svg viewBox="0 0 520 150" width="100%" style="display:block">
  <rect x="0" y="0" width="150" height="150" rx="14" fill="{CLARO}" stroke="{BORDA}"/><rect x="24" y="96" width="16" height="34" rx="3" fill="{ROXO}" opacity="0.35"/><rect x="50" y="78" width="16" height="52" rx="3" fill="{ROXO}" opacity="0.5"/><rect x="76" y="54" width="16" height="76" rx="3" fill="{ROXO}" opacity="0.7"/><rect x="102" y="34" width="16" height="96" rx="3" fill="{ROXO}"/><rect x="24" y="24" width="60" height="8" rx="4" fill="{BORDA}"/>
  <g transform="translate(185,0)"><rect x="0" y="0" width="150" height="150" rx="14" fill="{CLARO}" stroke="{BORDA}"/><polyline points="18,110 46,84 74,96 102,52 130,30" fill="none" stroke="{ROXO}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="130" cy="30" r="5" fill="{ROXO}"/><rect x="18" y="24" width="60" height="8" rx="4" fill="{BORDA}"/></g>
  <g transform="translate(370,0)"><rect x="0" y="0" width="150" height="150" rx="14" fill="{CLARO}" stroke="{BORDA}"/><circle cx="75" cy="82" r="34" fill="none" stroke="{BORDA}" stroke-width="14"/><circle cx="75" cy="82" r="34" fill="none" stroke="{ROXO}" stroke-width="14" stroke-dasharray="150 214" stroke-linecap="round" transform="rotate(-90 75 82)"/><rect x="18" y="24" width="60" height="8" rx="4" fill="{BORDA}"/></g>
</svg>"""

def mini_modulos():
    cards = [("Estoque", len(ESTOQUE_REL), "Estoque atual e ciclos"), ("Vendas", len(VENDAS_REL), "Painel e comparativos"),
             ("Financeiro", len(FIN_REL), "Resultado por empresa"), ("Demandas", len(DEM_REL), "Carteira e entregas")]
    return "".join(f'<div class="mc"><div class="mc-n">0{i}</div><div class="mc-t">{n}</div><div class="mc-r">{r} relatórios</div><div class="mc-d">{d}</div></div>' for i, (n, r, d) in enumerate(cards, 1))

HTML = f"""<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><style>
  @page {{ size:A4; margin:15mm 15mm 16mm 15mm; }}
  * {{ box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }}
  html,body {{ font-family:-apple-system,"Helvetica Neue",Arial,sans-serif; color:{TINTA}; }}
  .page {{ page-break-before:always; }} .page:first-child {{ page-break-before:auto; }}
  .keep {{ page-break-inside:avoid; }}
  .kick {{ font-size:8.5pt; font-weight:700; letter-spacing:1.5px; color:{ROXO2}; text-transform:uppercase; display:block; margin-bottom:6px; }}
  h1 {{ font-size:30pt; font-weight:800; letter-spacing:-0.9px; line-height:1.08; }}
  h2 {{ font-size:19pt; font-weight:800; letter-spacing:-0.4px; }}
  .lead {{ font-size:10.5pt; color:{CORPO}; line-height:1.6; }}

  .capa-top {{ display:flex; justify-content:space-between; align-items:center; }}
  .lockup {{ display:flex; align-items:center; gap:11px; }}
  .lockup img {{ height:44px; display:block; }}
  .lockup .wm {{ font-size:15.5pt; font-weight:800; color:{TINTA}; letter-spacing:-0.2px; }}
  .eyebrow {{ font-size:8.5pt; font-weight:700; letter-spacing:1.6px; color:{ROXO2}; text-transform:uppercase; }}
  .kdot {{ display:inline-block; width:6px; height:6px; border-radius:50%; background:{ROXO2}; margin-right:8px; vertical-align:middle; }}
  .capa h1 {{ margin:32mm 0 14px; }}
  .capa .sub {{ font-size:12.5pt; color:{CORPO}; line-height:1.55; max-width:158mm; }}
  .metabox {{ display:flex; gap:12px; margin-top:13mm; }}
  .metabox .cell {{ flex:1; background:{CLARO}; border-radius:12px; padding:16px 20px; }}
  .meta-lbl {{ font-size:8.5pt; font-weight:700; letter-spacing:1.3px; color:{ROXO2}; text-transform:uppercase; display:block; margin-bottom:8px; }}
  .meta-row {{ font-size:10pt; color:{CORPO}; line-height:1.65; }} .meta-row strong {{ color:{TINTA}; }}
  .meta-sub {{ font-size:9pt; color:{SUAVE}; line-height:1.4; margin:2px 0 4px; }}
  .hero-viz {{ margin-top:36mm; text-align:center; }}
  .hero-inner {{ width:58%; margin:0 auto; }}

  .sec-hd {{ margin-bottom:7mm; }} .sec-hd h2 {{ margin-top:3px; }}
  .sec-hd.line {{ border-bottom:2px solid {BORDA}; padding-bottom:10px; }}
  .intro {{ font-size:11pt; color:{CORPO}; line-height:1.7; }} .intro strong {{ color:{TINTA}; }}

  .mcs {{ display:flex; gap:12px; margin-top:9mm; }}
  .mc {{ flex:1; background:{CLARO}; border:1.5px solid {BORDA}; border-radius:14px; padding:16px; }}
  .mc-n {{ font-size:10pt; font-weight:800; color:{ROXO}; font-variant-numeric:tabular-nums; }}
  .mc-t {{ font-size:13pt; font-weight:800; color:{TINTA}; margin-top:8px; }}
  .mc-r {{ font-size:9pt; font-weight:700; color:{ROXO2}; margin-top:3px; }}
  .mc-d {{ font-size:9pt; color:{SUAVE}; margin-top:6px; line-height:1.4; }}
  .flow {{ margin-top:9mm; }}
  .flow-step {{ display:flex; gap:14px; margin-bottom:11px; align-items:flex-start; }}
  .flow-num {{ flex:0 0 27px; height:27px; border-radius:50%; background:{ROXO}; color:#fff; font-weight:800; font-size:10pt; display:flex; align-items:center; justify-content:center; }}
  .flow-txt {{ font-size:10.2pt; color:{CORPO}; line-height:1.5; padding-top:3px; }} .flow-txt strong {{ color:{TINTA}; }}

  .sumario {{ margin-top:9mm; border-top:1.5px solid {BORDA}; padding-top:7mm; }}
  .sm-hd {{ font-size:8.5pt; font-weight:700; letter-spacing:1.4px; color:{ROXO2}; text-transform:uppercase; margin-bottom:5mm; }}
  .sm-row {{ display:flex; align-items:center; margin-bottom:11px; }}
  .sm-dot {{ width:7px; height:7px; border-radius:50%; background:{ROXO}; margin-right:12px; flex:0 0 auto; }}
  .sm-t {{ font-size:10.5pt; color:{TINTA}; font-weight:600; }}
  .sm-lead {{ flex:1; border-bottom:1px dotted {BORDA}; margin:0 10px; height:1px; align-self:flex-end; margin-bottom:4px; }}
  .sm-p {{ font-size:9.5pt; color:{SUAVE}; font-weight:600; white-space:nowrap; }}

  .mod-hd {{ border-bottom:2px solid {BORDA}; padding-bottom:11px; margin-bottom:7mm; }}
  .mod-sub {{ font-size:10.5pt; color:{SUAVE}; margin-top:5px; }}
  .mod-tag {{ display:inline-block; font-size:8pt; font-weight:800; letter-spacing:1px; text-transform:uppercase; color:#fff; background:{ROXO}; padding:4px 12px; border-radius:999px; margin:10mm 0 6mm; }}

  .bloco {{ margin-bottom:8mm; }}
  .bloco-hd {{ font-size:12pt; font-weight:800; color:{TINTA}; margin-bottom:9px; padding-left:11px; border-left:3px solid {ROXO}; page-break-after:avoid; }}
  .bloco-sub {{ font-size:9pt; font-weight:600; color:{SUAVE}; margin-left:9px; }}
  table.tbl {{ width:100%; border-collapse:separate; border-spacing:0 4px; }}
  .tbl thead th {{ text-align:left; font-size:8pt; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:{SUAVE}; padding:0 12px 5px; }}
  .tbl thead th.right {{ text-align:right; }}
  .tbl tr {{ page-break-inside:avoid; }}
  .tbl tfoot {{ display:table-row-group; }}
  .tbl tbody td {{ background:{CLARO}; padding:9px 12px; vertical-align:top; font-size:9.5pt; color:{CORPO}; line-height:1.4; }}
  .tbl tbody td.c-item {{ border-top-left-radius:9px; border-bottom-left-radius:9px; }}
  .tbl tbody td.c-desc {{ padding-right:16px; }}
  .tbl tbody td.c-h {{ border-top-right-radius:9px; border-bottom-right-radius:9px; text-align:right; font-weight:800; color:{TINTA}; white-space:nowrap; font-variant-numeric:tabular-nums; }}
  .idx {{ display:inline-block; min-width:22px; font-weight:800; color:{ROXO}; font-size:8.5pt; font-variant-numeric:tabular-nums; }}
  .i-nome {{ font-weight:700; color:{TINTA}; }}
  .odoo-tag {{ display:inline-block; margin-top:5px; font-size:6.8pt; font-weight:700; letter-spacing:0.3px; text-transform:uppercase; color:{ROXO2}; background:#EDE7F5; padding:2px 8px; border-radius:999px; white-space:nowrap; }}
  .tf {{ font-size:10pt; font-weight:800; color:{ROXO2}; text-transform:uppercase; letter-spacing:0.5px; padding:7px 12px 0; }}
  .tf.right {{ text-align:right; font-variant-numeric:tabular-nums; }}

  .g-axis {{ position:relative; height:15px; margin:0 0 3mm 42%; }}
  .g-tick {{ position:absolute; font-size:8.5pt; font-weight:700; color:{SUAVE}; }}
  .g-row {{ display:flex; align-items:center; margin-bottom:9px; }}
  .g-lbl {{ width:42%; font-size:9.5pt; color:{CORPO}; padding-right:12px; line-height:1.3; }} .g-lbl strong {{ color:{ROXO}; }}
  .g-track {{ flex:1; position:relative; height:20px; background:{CLARO}; border-radius:6px; border:1px solid {BORDA}; overflow:hidden; }}
  .g-sep {{ position:absolute; top:0; bottom:0; width:1px; background:{BORDA}; }}
  .g-bar {{ position:absolute; top:2px; height:14px; background:linear-gradient(90deg,{ROXO},{ROXO2}); border-radius:5px; }}
  .g-bar.cont {{ background:repeating-linear-gradient(45deg,{ROXO}33,{ROXO}33 5px,{ROXO}22 5px,{ROXO}22 10px); border:1px solid {ROXO}55; }}

  .cards {{ display:flex; gap:14px; margin-top:6mm; }}
  .card {{ flex:1; border-radius:14px; padding:18px 22px; }}
  .card.out {{ background:#fff; border:1.5px solid {BORDA}; }}
  .card.fill {{ background:{ROXO3}; color:#fff; position:relative; }}
  .card .lbl {{ font-size:9pt; font-weight:700; letter-spacing:1.4px; text-transform:uppercase; display:block; margin-bottom:8px; }}
  .card.out .lbl {{ color:{ROXO2}; }} .card.fill .lbl {{ color:#C9BEED; }}
  .card .val {{ font-size:27pt; font-weight:800; letter-spacing:-1px; line-height:1; display:block; font-variant-numeric:tabular-nums; }}
  .card.out .val {{ color:{SUAVE}; text-decoration:line-through; opacity:.6; }} .card.fill .val {{ color:#fff; }}
  .val .mult {{ font-size:14pt; font-weight:800; letter-spacing:0; margin-right:8px; }}
  .card .cap {{ font-size:8.8pt; line-height:1.45; display:block; margin-top:9px; }} .card.out .cap {{ color:{SUAVE}; }} .card.fill .cap {{ color:#E5DCFC; }}
  .badge {{ position:absolute; top:16px; right:18px; background:#FFD84D; color:{TINTA}; font-size:9pt; font-weight:800; padding:5px 12px; border-radius:999px; }}
  .invtab {{ width:100%; border-collapse:separate; border-spacing:0 5px; margin-top:5mm; }}
  .invtab td {{ background:{CLARO}; padding:11px 18px; font-size:10pt; color:{CORPO}; }}
  .invtab td:first-child {{ border-radius:9px 0 0 9px; font-weight:700; color:{TINTA}; }}
  .invtab td:last-child {{ border-radius:0 9px 9px 0; text-align:right; font-weight:800; color:{TINTA}; white-space:nowrap; font-variant-numeric:tabular-nums; }}
  .invtab td.free {{ color:{ROXO2}; font-weight:800; }}
  .risco {{ text-decoration:line-through; color:{SUAVE}; font-weight:700; margin-right:9px; }}
  .semcusto {{ color:{ROXO2}; font-weight:800; }}
  .invtab tr.tot td {{ background:{ROXO3}; color:#fff; font-size:11pt; }} .invtab tr.tot td:last-child {{ color:#fff; }}
  .tmult {{ font-size:8pt; margin-right:6px; opacity:.85; }}
  .notes {{ display:flex; flex-direction:column; gap:8px; margin-top:6mm; }}
  .note {{ padding:11px 15px; background:{CLARO}; border-left:3px solid {ROXO2}; border-radius:6px; font-size:9pt; color:{CORPO}; line-height:1.5; }}
  .note strong {{ color:{TINTA}; }}
  .foot {{ margin-top:9mm; padding-top:10px; border-top:1px solid {BORDA}; font-size:8.5pt; color:{SUAVE}; display:flex; justify-content:space-between; }}
</style></head><body>

<!-- 1. CAPA -->
<section class="page capa">
  <div class="capa-top">
    <span class="eyebrow"><span class="kdot"></span>Proposta Comercial</span>
    <div class="lockup"><img src="{LOGO}"><span class="wm">Nexus AI</span></div>
  </div>
  <h1>Desenvolvimento de<br>Dashboard Analytics</h1>
  <div class="sub">Desenvolvimento de dashboard analytics completo para a empresa Matrix Group, com painéis customizados e otimizados para a gestão de estoque, vendas, financeiro e demandas.</div>
  <div class="metabox">
    <div class="cell"><span class="meta-lbl">Cliente</span>
      <div class="meta-row"><strong>Empresa:</strong> Matrix Group</div>
      <div class="meta-sub">{EMPRESA_RAZAO}</div>
      <div class="meta-row"><strong>CNPJ:</strong> 34.161.829/0001-98</div>
      <div class="meta-row"><strong>Responsável:</strong> Ícaro Lucena</div>
    </div>
    <div class="cell"><span class="meta-lbl">Proposta</span>
      <div class="meta-row"><strong>Emissão:</strong> {EMISSAO.strftime('%d/%m/%Y')}</div>
      <div class="meta-row"><strong>Validade:</strong> {VALIDADE.strftime('%d/%m/%Y')} (15 dias)</div>
      <div class="meta-row"><strong>Modalidade:</strong> Desenvolvimento por módulos</div>
    </div>
  </div>
  <div class="hero-viz"><div class="hero-inner">{HERO_SVG}</div></div>
</section>

<!-- 2. VISAO GERAL -->
<section class="page">
  <div class="sec-hd line"><span class="kick">Visão geral</span><h2>O que será entregue</h2></div>
  <div class="intro">Quatro módulos de dashboard que reúnem, num só lugar e prontos para decisão, os números que hoje estão espalhados: <strong>estoque</strong> (incluindo o acompanhamento por ciclos), <strong>vendas</strong>, <strong>financeiro por empresa</strong> e <strong>demandas</strong>. A entrega é <strong>por módulos</strong>: assim que um módulo fica pronto, ele já entra em uso, sem esperar o projeto inteiro terminar.</div>
  <div class="mcs">{mini_modulos()}</div>
  <div class="flow">
    <div class="flow-step"><div class="flow-num">1</div><div class="flow-txt"><strong>Arquitetura e integração de dados.</strong> A preparação que organiza a informação e sustenta todos os painéis, base de todo o projeto.</div></div>
    <div class="flow-step"><div class="flow-num">2</div><div class="flow-txt"><strong>Os quatro módulos, um a um.</strong> Cada módulo traz seus relatórios (as telas de análise) e as telas de gerenciamento (onde se cadastra e se define a regra que o relatório usa).</div></div>
    <div class="flow-step"><div class="flow-num">3</div><div class="flow-txt"><strong>Cronograma e proposta comercial.</strong> O plano de implementação em cerca de dois meses e o investimento, ao final do documento.</div></div>
  </div>
  <div class="sumario"><div class="sm-hd">Neste documento</div>{sumario_html}</div>
</section>

<!-- 3. ARQUITETURA -->
<section class="page">
  <div class="sec-hd line"><span class="kick">Base do projeto</span><h2>Arquitetura e integração de dados</h2></div>
  {tabela("Itens de arquitetura", "sustentam todos os módulos", ARQUITETURA, arq=True)}
</section>

<!-- 4-7. MODULOS -->
{modulo("Módulo 1 &middot; Prioridade 1", "Estoque", "Painéis do estoque atual e os relatórios por ciclo.", ESTOQUE_REL, ESTOQUE_GESTAO)}
{modulo("Módulo 2 &middot; Prioridade 2", "Vendas", "Painel de vendas, comparação geral e comparativo entre estados.", VENDAS_REL, VENDAS_GESTAO)}
{modulo("Módulo 3 &middot; Prioridade 3", "Financeiro", "Faturamento, gastos e resultado de cada empresa do grupo.", FIN_REL, FIN_GESTAO)}
{modulo("Módulo 4 &middot; Prioridade 4", "Demandas", "A carteira de pedidos ativos, para organizar a entrega.", DEM_REL, DEM_GESTAO)}

<!-- 8. QUALIDADE + ESCOPO -->
<section class="page">
  <div class="sec-hd line"><span class="kick">Validação por módulo</span><h2>Conferência e homologação</h2></div>
  <div class="intro" style="margin-bottom:7mm">Garante que cada número está batendo e que o módulo está pronto para uso real. É uma validação completa de cada módulo: conferir se os dados estão corretos e se os painéis entregam as informações de forma coerente. As horas abaixo são o somatório desses momentos de conferência e testes ao longo de todos os módulos.</div>
  {tabela("Atividades", "ao final de cada módulo, antes da entrega", QUALIDADE, idx=False)}

  <div class="sec-hd line" style="margin-top:9mm"><span class="kick">Escopo do desenvolvimento</span><h2>Tudo o que será desenvolvido</h2></div>
  <table class="invtab">
    <tr><td>Arquitetura e integração de dados &middot; {len(ARQUITETURA)} itens</td><td>{h_arq}h</td></tr>
    <tr><td>Módulo Estoque &middot; {len(ESTOQUE_REL)+len(ESTOQUE_GESTAO)} itens ({len(ESTOQUE_REL)} relatórios)</td><td>{h_est}h</td></tr>
    <tr><td>Módulo Vendas &middot; {len(VENDAS_REL)+len(VENDAS_GESTAO)} itens ({len(VENDAS_REL)} relatórios)</td><td>{h_ven}h</td></tr>
    <tr><td>Módulo Financeiro &middot; {len(FIN_REL)+len(FIN_GESTAO)} itens ({len(FIN_REL)} relatórios)</td><td>{h_fin}h</td></tr>
    <tr><td>Módulo Demandas &middot; {len(DEM_REL)+len(DEM_GESTAO)} itens ({len(DEM_REL)} relatórios)</td><td>{h_dem}h</td></tr>
    <tr><td>Conferência e homologação</td><td>{h_qua}h</td></tr>
    <tr class="tot"><td>TOTAL &middot; {n_itens} itens &middot; {n_rel} relatórios</td><td>{h_total}h</td></tr>
  </table>
</section>

<!-- 9. CRONOGRAMA -->
<section class="page">
  <div class="sec-hd line"><span class="kick">Cronograma</span><h2>Plano de implementação</h2></div>
  <div class="intro" style="margin-bottom:8mm">Entrega por módulos, com equipe dedicada. Início em <strong>{INICIO.strftime('%d/%m/%Y')}</strong> e conclusão em <strong>{ENTREGA.strftime('%d/%m/%Y')}</strong>, cerca de <strong>dois meses</strong>. Cada módulo é entregue e validado assim que fica pronto; a conferência e a homologação acontecem de forma contínua, ao final de cada módulo.</div>
  <div class="g-axis">{eixo()}</div>
  <div style="margin-bottom:8mm">{gantt()}</div>
  <table class="tbl"><thead><tr><th style="width:14%">Fase</th><th>Entrega</th><th class="right" style="width:22%">Janela</th><th class="right" style="width:9%">Horas</th></tr></thead><tbody>{fases_rows}</tbody></table>
  <div class="intro" style="margin-top:7mm"><strong>Conclusão prevista:</strong> {ENTREGA.strftime('%d/%m/%Y')}.</div>
</section>

<!-- 10. PROPOSTA COMERCIAL -->
<section class="page">
  <div class="sec-hd line"><span class="kick"><span class="kdot"></span>Investimento</span><h2>Proposta comercial</h2></div>
  <div class="intro">A hora de desenvolvimento custa entre <strong>{brl(MERCADO_MIN)} e {brl(MERCADO_MAX)}</strong>, conforme a complexidade. Como a Matrix já é nossa cliente em outros projetos, praticaremos um valor bem abaixo disso: <strong>{brl(VALOR_HORA)} a hora</strong>. Além disso, a arquitetura de dados e integração, junto com a conferência e homologação ({h_cortesia}h no total), não terão custo, por já estarem contempladas no nosso contrato. O que será cobrado serão as horas de desenvolvimento dos módulos do projeto ({h_modulos}h).</div>

  <div class="cards">
    <div class="card out"><span class="lbl">A preço de mercado</span><span class="val">{brl(valor_mercado)}</span><span class="cap">As {h_total}h do projeto a {brl(MERCADO_MIN)}/h, o piso praticado no mercado.</span></div>
    <div class="card fill"><div class="badge">{desconto}% abaixo</div><span class="lbl">Condição de cliente</span><span class="val"><span class="mult">2x</span>{brl(parcela)}</span><span class="cap">Duas parcelas mensais iguais. Arquitetura, integração, conferência e homologação já contempladas no contrato.</span></div>
  </div>

  <table class="invtab">
    <tr><td>Módulo Estoque &middot; {h_est}h</td><td>{brl(h_est*VALOR_HORA)}</td></tr>
    <tr><td>Módulo Vendas &middot; {h_ven}h</td><td>{brl(h_ven*VALOR_HORA)}</td></tr>
    <tr><td>Módulo Financeiro &middot; {h_fin}h</td><td>{brl(h_fin*VALOR_HORA)}</td></tr>
    <tr><td>Módulo Demandas &middot; {h_dem}h</td><td>{brl(h_dem*VALOR_HORA)}</td></tr>
    <tr><td>Arquitetura, integração, conferência e homologação &middot; {h_cortesia}h</td><td><span class="risco">{brl(h_cortesia*VALOR_HORA)}</span><span class="semcusto">sem custo</span></td></tr>
    <tr><td>Projeto para controle de estoque interno</td><td class="free">não incluso (orçar à parte)</td></tr>
    <tr class="tot"><td>INVESTIMENTO TOTAL</td><td>{brl(valor_cobrado)}</td></tr>
  </table>

  <div class="notes">
    <div class="note"><strong>Condição de pagamento.</strong> O projeto dura cerca de dois meses: a primeira parcela é paga no ato da assinatura e a segunda no mês seguinte. Serão duas parcelas iguais de {brl(parcela)}, totalizando {brl(valor_cobrado)}.</div>
    <div class="note"><strong>Depende do cliente.</strong> O prazo depende de o cliente cadastrar e alimentar corretamente os dados no ERP Odoo e de estar disponível para as reuniões de implantação e alinhamento de dados, dentro da competência da Matrix Group.</div>
    <div class="note"><strong>Fora deste orçamento.</strong> A aplicação de controle de estoque interno, com leitor de código de barras para conferência e inventário, é uma solução de maior complexidade e não está incluída nesta proposta. Caso haja interesse, deve ser orçada separadamente.</div>
  </div>

  <div class="foot"><div><strong>NEXUS AI</strong> &middot; CNPJ 64.420.135/0001-99</div><div>João Zanini &middot; WhatsApp (61) 98440-9067</div></div>
</section>

</body></html>"""

HTML_PATH.write_text(HTML, encoding="utf-8")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                f"--print-to-pdf={PDF_PATH}", f"file://{HTML_PATH}"], check=True, capture_output=True)

# ── numeracao de paginas (canto inferior direito, a partir da pagina 2) ──
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
reader = PdfReader(str(PDF_PATH)); writer = PdfWriter()
for i, pg in enumerate(reader.pages, 1):
    if i > 1:
        buf = io.BytesIO(); c = canvas.Canvas(buf, pagesize=A4)
        c.setFont("Helvetica", 8); c.setFillColorRGB(0.42, 0.40, 0.52)
        c.drawRightString(A4[0] - 15 * mm, 9 * mm, str(i)); c.save(); buf.seek(0)
        pg.merge_page(PdfReader(buf).pages[0])
    writer.add_page(pg)
with open(PDF_PATH, "wb") as f: writer.write(f)

print("PDF:", PDF_PATH.name, "| paginas:", len(reader.pages))
print(f"itens={n_itens} rel={n_rel} (fin{len(FIN_REL)}) | horas total={h_total} modulos={h_modulos} cortesia={h_cortesia}")
print(f"cobrado={valor_cobrado} parcela={parcela} mercado={valor_mercado} desc={desconto}%")
