#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gera a Proposta de Desenvolvimento (Matrix Fitness Group) em PDF multi-pagina,
usando a identidade visual da skill nexus-orcamento como norte (cores, logo,
fontes), mas com conteudo proprio: inventario de relatorios por modulo, horas,
entregaveis, cronograma com datas e investimento.

Renderiza via Google Chrome headless (--print-to-pdf).
"""
import base64, pathlib, subprocess
from datetime import date, timedelta

SKILL_DIR = pathlib.Path.home() / ".claude/skills/nexus-orcamento"
LOGO = "data:image/png;base64," + base64.b64encode((SKILL_DIR / "assets/icon.png").read_bytes()).decode()
OUT_DIR = pathlib.Path(__file__).parent
HTML_PATH = OUT_DIR / "_proposta.html"
PDF_PATH = OUT_DIR / "Proposta-Matrix-Dashboards-2026-07-21.pdf"

# Paleta (norte: skill nexus-orcamento)
ROXO, ROXO2, ROXO3, TINTA = "#7C3AED", "#5438B8", "#3D2685", "#2A1F5C"
CORPO, SUAVE, CLARO, BORDA, TAGBG = "#4A4565", "#6B6585", "#FAF9FE", "#E8E4F5", "#EDE7F5"

VALOR_HORA = 60
INICIO = date(2026, 8, 4)  # premissa: inicio do desenvolvimento
CAP_SEMANA = 32            # premissa: horas efetivas/semana (1 dev senior)

# ── Inventario (cada relatorio/tela/integracao e um item; horas de desenvolvimento) ──
# grupos: relatorios, apoio (apoio+parametrizacao), fundacao (motores/dados)
FUNDACAO = [
    ("Atributo de linha e tipo do produto", "Pipeline Odoo -> cache para as composicoes por linha (Magnum/Ultra/Versa/Aura) e por tipo.", 20),
    ("Motor de ciclos", "Engine que calcula consumido, previsao restante e cobertura por produto.", 16),
    ("Motor de status unico", "Regra unica de status (ruptura/risco/saudavel/acumulado) que os relatorios consomem.", 10),
    ("Estrutura de quantidade a chegar", "Registro de itens de compra (a quantidade a chegar nao existe hoje no cache).", 12),
    ("Foto diaria de estoque e demanda", "Serie historica que alimenta variacoes e colunas mes a mes.", 14),
    ("Snapshot imutavel de fechamento de ciclo", "Congela o ciclo encerrado num relatorio arquivado e imutavel.", 18),
    ("Estrutura de metas de faturamento", "Base que guarda as metas mensais importadas por empresa e vendedor.", 8),
    ("Mapeamento de CNPJs em grupos e construtoras", "De-para que agrupa varios CNPJs por cliente/construtora e por recorte (Smart/Aztec).", 10),
    ("Segmento do cliente", "Pipeline do segmento (academia/condominio/hotel/estudio) para as composicoes.", 8),
    ("Plano de contas gerencial", "Estrutura que mapeia contas do Odoo em categorias de despesa da rosca.", 10),
    ("UF na despesa", "Estrutura que associa o estado ao lancamento de conta a pagar.", 8),
]

ESTOQUE_REL = [
    ("Indicadores gerais de estoque", "12 indicadores (valor total, medio por local, ticket, em demanda, disponivel, a chegar, quantidades e ultima atualizacao) com variacao de 30 dias.", 6),
    ("Distribuicao por local de estoque", "Um card por local (Jarinu, Valinhos, Ceilandia...): valor, % do valor, % da quantidade, ticket e quantidade.", 5),
    ("Composicao do estoque", "Composicao por marca, linha e tipo com seletor unico e escolha de grafico.", 7),
    ("Demanda x Disponivel", "Duas visoes (por quantidade e por valor), sempre a custo.", 5),
    ("Tabela de estoque por produto", "Modelo, quantidade, em demanda e disponivel, com busca, filtros e ordenacao por coluna.", 8),
    ("Ciclo ativo: indicadores", "8 indicadores do ciclo (ruptura, risco, saudaveis, acumulados, previsto, previsao restante, valor em risco, valor em excesso).", 6),
    ("Ciclo ativo: distribuicao por status", "Rosca da distribuicao dos produtos por status, com filtros.", 5),
    ("Ciclo ativo: tabela do ciclo", "10 colunas (previsao, consumido, previsao restante, cobertura, status) por produto.", 9),
    ("Ciclos fechado: indicadores", "14 indicadores do ciclo encerrado, incluindo acuracia da previsao.", 6),
    ("Ciclos fechado: abertura e fechamento mensal", "Primeiro e ultimo dia de cada mes: quantidade, valor, demanda, disponivel, a chegar e consumo.", 6),
    ("Ciclos fechado: rosca por status com drill", "Clicar na fatia lista os produtos daquele status com estoque inicial, entradas, previsao, consumido e saldo.", 5),
    ("Ciclos fechado: comparativo atual x anterior", "Indicadores lado a lado com variacao e coluna de duracao do ciclo.", 5),
    ("Ciclos fechado: acuracia previsto x real", "Precisao da previsao por produto (previsto, real, diferenca, acuracia).", 5),
    ("Ciclos fechado: mudanca de status entre ciclos", "Quadro melhorou / piorou / manteve, produto a produto.", 5),
]
ESTOQUE_APOIO = [
    ("Cadastro e definicao de ciclos", "Criar ciclo, definir duracao configuravel (2/3/4 meses), inicio, fim e produtos.", 8),
    ("Importacao da previsao do ciclo", "Tela para imputar/importar a previsao de compra por produto.", 8),
    ("Parametrizacao de status por produto", "Pop-up dos 3 pontinhos: faixas de risco, saudavel e acumulado por produto (unidade ou %).", 10),
    ("Gestao e arquivo de ciclos fechados", "Lista dos ciclos congelados, abrir qualquer um a qualquer momento.", 6),
]

VENDAS_REL = [
    ("Indicadores principais de vendas", "6 indicadores (valor vendido, pedidos, produtos, ticket, margem media, meta atingida) com variacao e filtro de periodo.", 6),
    ("Composicao e margem", "5 angulos (linha, marca, tipo de cliente, forma de pagamento, CNPJ) com valor, % e margem.", 8),
    ("Produtos vendidos por item", "Quantidade, valor e % do faturamento, com busca e ordenacao.", 5),
    ("Ranking de vendas por estado", "UF, valor, % do total, pedidos, produtos, ticket e margem.", 5),
    ("Ranking de vendas por vendedor", "Mesmo recorte por vendedor, com meta individual atingida.", 5),
    ("Condicoes de pagamento", "Forma mais usada, prazo medio de recebimento (PMR), entrada media e distribuicao por tipo de cliente.", 8),
    ("Curva ABC / Pareto", "Classes A/B/C, faixas 80%/95%, barras + linha acumulada e tabela por classe.", 8),
    ("Carteira a faturar", "Vendido ainda nao faturado, em unidades, pedidos e reais.", 5),
    ("Comparacao geral: cards de destaque", "Maior faturamento, maior margem, maior ticket, menor prazo e totais.", 4),
    ("Comparacao geral: tabela por UF", "Todas as UFs (vendedores, faturamento, margem, PMR, % da receita, ticket, pedidos) com ordenacao.", 8),
    ("Comparativo estado A x B", "Dois estados com periodos independentes, indicadores espelhados e variacao relativa.", 14),
    ("Comparativo A x B: composicoes e rankings", "Composicoes, rankings de vendedor e condicoes espelhadas nos dois lados.", 8),
]
VENDAS_APOIO = [
    ("Definicao de metas de faturamento", "Tela para imputar a meta mensal por empresa e por vendedor.", 6),
    ("Parametrizacao da curva ABC", "Definir a faixa da curva (80/20 ou 10/20/30% do acumulado).", 5),
    ("Busca e mapeamento de construtoras/grupos", "Campo que reune varios CNPJs de um mesmo cliente e traz todos os pedidos.", 8),
    ("Recorte grupo / Smart / Aztec", "Chaves no topo que recalculam o painel isolando ou incluindo clientes.", 6),
]

FIN_REL = [
    ("Resumo consolidado do grupo", "6 cards (faturamento total, gastos, resultado, maior faturamento, maior gasto, melhor resultado).", 5),
    ("Blocos por empresa (6 CNPJs)", "Faturamento, gastos, resultado e % gasto/faturamento por empresa.", 6),
    ("Composicao das despesas", "Rosca de despesas por categoria do plano de contas.", 6),
    ("Drill lateral por categoria e fornecedor", "Ao clicar na categoria: total, %, lancamentos e tabela despesa/fornecedor.", 6),
    ("Recorte por UF das despesas", "Visao das despesas por estado e por CNPJ + UF.", 5),
]
FIN_APOIO = [
    ("Parametrizacao do plano de contas gerencial", "Mapear contas do Odoo em categorias de despesa e definir o nivel da categoria.", 10),
    ("Imputacao de UF na despesa", "Tela para associar o estado a cada lancamento de conta a pagar.", 6),
    ("De-para empresa e CNPJ", "Resolver o vinculo para exibir o CNPJ real de cada empresa.", 5),
]

DEM_REL = [
    ("B1 - Resumo de demandas", "8 indicadores (valor pendente, abertos, atrasados, itens pendentes, ticket, % coberto, valor descoberto, valor atrasado).", 5),
    ("B2 - Lista de pedidos pendentes", "Agrupada por pedido (cliente, modelo, UF, prazo, status, reserva, valor) com filtros e busca.", 6),
    ("B4 - Mapa de demandas por estado", "Heatmap do Brasil clicavel que filtra a lista de pedidos.", 7),
    ("B5 - Indicadores do pedido selecionado", "Drill do pedido: valor, quantidade, % entregue e % pendente, prazo.", 5),
    ("B6 - Visao geral das demandas", "Ativos, valor medio, pedido mais caro e rosca atrasados x no prazo.", 4),
    ("B7 - Maquinas em estoque x demanda", "Disponivel, demanda e % em demanda por modelo.", 5),
    ("B8 - Itens em pedidos ativos", "Por modelo: entregues, a entregar e atrasados, com periodo proprio.", 5),
    ("B9 - Concentracao de atrasos por produto", "Ranking dos modelos em atraso + Top 3 de concentracao.", 5),
]
DEM_APOIO = [
    ("Configuracao das etapas de demanda", "Definir quais etapas do pedido contam como demanda em aberto (rege os 8 blocos).", 6),
    ("Lista de organizacao de entrega", "Leitura da carteira pensada para organizar a entrega.", 4),
]

CONF_TELAS = [
    ("Selecao do local de conferencia", "Escolher o estoque; o sistema carrega todos os seriais que o Odoo aponta naquele local.", 6),
    ("Sessao de bipagem / conferencia", "Nucleo da aplicacao: seriais pendentes em vermelho viram confirmados; captura por leitor e por digitacao, com tipo, autor, horario e ordem.", 20),
    ("Painel de indicadores ao vivo", "Total, escaneados, digitados e pendentes (% e quantidade) e rosca escaneado x nao.", 8),
    ("Detalhe do serial e observacoes", "Modal por item para observacao (caixa arrebentada, desmontada, peca faltando).", 6),
    ("Contagem de volumes sem serie", "Itens sem serial: contador incremental que soma sem recontar, com editar/apagar.", 6),
    ("Quadro de divergencias", "Serial em local errado e serial vinculado a outro pedido, destacados como alerta.", 8),
    ("Finalizacao com dupla confirmacao", "Confirmar duas vezes e congelar o inventario.", 5),
    ("Historico de conferencias", "A gaveta: inventarios finalizados, arquivados e consultaveis, com quem fez e quando.", 8),
    ("Trilha de auditoria", "Registro de cada acao (usuario, item, tipo, horario, ordem) para auditar a contagem.", 6),
]
CONF_INT = [
    ("Integracao com leitor de codigo de barras", "Captura via hardware (USB HID) sincronizada com a tela de bipagem.", 8),
    ("Sincronizacao de seriais por local", "Puxar do cache a lista do que deveria estar naquele estoque.", 6),
    ("Regra de ja bipado ou nao", "Marcar em tempo real o que foi conferido e o que falta.", 4),
    ("Regra de divergencia de localizacao", "Detectar serial que esta num local diferente do apontado pelo sistema.", 5),
    ("Regra de serial vinculado a outro pedido", "Alertar quando o item contado ja esta comprometido com outra venda.", 6),
    ("Persistencia da sessao de inventario", "Estrutura que guarda linhas conferidas, volumes, observacoes e divergencias.", 8),
    ("Controle de acesso e alertas", "Quem pode conferir e os avisos ao operador (pendencias, divergencias, conclusao).", 6),
]

TRANSVERSAIS = [
    ("QA, reconciliacao e testes E2E", "Conferencia de cada painel contra o dado real do Odoo e testes ponta a ponta.", 45),
    ("Gestao, parametrizacao e homologacao", "Reunioes de parametrizacao (status, plano de contas, mapeamentos) e homologacao com o cliente.", 35),
]

def soma(itens): return sum(h for _, _, h in itens)

# Totais
h_fund = soma(FUNDACAO)
h_estoque = soma(ESTOQUE_REL) + soma(ESTOQUE_APOIO)
h_vendas = soma(VENDAS_REL) + soma(VENDAS_APOIO)
h_fin = soma(FIN_REL) + soma(FIN_APOIO)
h_dem = soma(DEM_REL) + soma(DEM_APOIO)
h_conf = soma(CONF_TELAS) + soma(CONF_INT)
h_trans = soma(TRANSVERSAIS)
h_total = h_fund + h_estoque + h_vendas + h_fin + h_dem + h_conf + h_trans
h_dash = h_total - h_conf  # dashboards = tudo menos a aplicacao de conferencia

n_relatorios = len(ESTOQUE_REL) + len(VENDAS_REL) + len(FIN_REL) + len(DEM_REL)
n_apoio = len(ESTOQUE_APOIO) + len(VENDAS_APOIO) + len(FIN_APOIO) + len(DEM_APOIO)
n_fund = len(FUNDACAO)
n_conf = len(CONF_TELAS) + len(CONF_INT)
n_itens = n_relatorios + n_apoio + n_fund + n_conf

valor_total = h_total * VALOR_HORA
valor_dash = h_dash * VALOR_HORA
valor_conf = h_conf * VALOR_HORA
valor_reposicao = 66000

def brl(v): return "R$ " + f"{v:,.0f}".replace(",", ".")

# ── Cronograma (fases na ordem de prioridade da reuniao) ──
# (nome, entrega, horas, semanas)
FASES = [
    ("Fase 1", "Fundacao de dados + Modulo Estoque atual", 90, 3),
    ("Fase 2", "Aplicacao de Conferencia de estoque (bipador)", h_conf, 4),
    ("Fase 3", "Modulo Vendas (painel + comparativos)", 130, 4.5),
    ("Fase 4", "Relatorio de estoque por ciclos (ativo + fechado)", 132, 4.5),
    ("Fase 5", "Modulo Financeiro por CNPJ", 78, 2.5),
    ("Fase 6", "Modulo Demandas", h_total - (90 + h_conf + 130 + 132 + 78), 2.5),
]
total_sem = sum(s for *_, s in FASES)

def fase_datas():
    linhas, acc = [], 0.0
    d0 = INICIO
    for nome, entrega, horas, sem in FASES:
        ini = d0 + timedelta(days=int(acc * 7))
        fim = d0 + timedelta(days=int((acc + sem) * 7) - 1)
        left = acc / total_sem * 100
        width = sem / total_sem * 100
        linhas.append((nome, entrega, horas, sem, ini, fim, left, width))
        acc += sem
    return linhas

FASES_D = fase_datas()
data_fim = FASES_D[-1][5]

# ─────────────────────────── HTML ───────────────────────────
def tabela(titulo, subtitulo, itens, cor_tag=ROXO2, mostrar_idx=True):
    linhas = ""
    for i, (nome, desc, h) in enumerate(itens, 1):
        idx = f'<span class="idx">{i:02d}</span>' if mostrar_idx else ""
        linhas += f"""<tr>
          <td class="c-item">{idx}<span class="i-nome">{nome}</span></td>
          <td class="c-desc">{desc}</td>
          <td class="c-h">{h}h</td>
        </tr>"""
    sub = soma(itens)
    return f"""<div class="bloco">
      <div class="bloco-hd">{titulo}<span class="bloco-sub">{subtitulo}</span></div>
      <table class="tbl"><thead><tr>
        <th style="width:31%">Item</th><th>O que entrega</th><th class="right" style="width:9%">Horas</th>
      </tr></thead><tbody>{linhas}</tbody>
      <tfoot><tr><td colspan="2" class="tf">Subtotal ({len(itens)} itens)</td><td class="tf right">{sub}h</td></tr></tfoot>
      </table></div>"""

def barra_gantt():
    linhas = ""
    for nome, entrega, horas, sem, ini, fim, left, width in FASES_D:
        linhas += f"""<div class="g-row">
          <div class="g-lbl"><strong>{nome}</strong> {entrega}</div>
          <div class="g-track"><div class="g-bar" style="left:{left:.1f}%;width:{width:.1f}%">{ini.strftime('%d/%m')} a {fim.strftime('%d/%m')}</div></div>
        </div>"""
    return linhas

def linha_fase(nome, entrega, horas, sem, ini, fim):
    return f"""<tr>
      <td class="c-item"><span class="i-nome">{nome}</span></td>
      <td class="c-desc">{entrega}</td>
      <td class="c-h" style="white-space:nowrap">{ini.strftime('%d/%m/%Y')} a {fim.strftime('%d/%m/%Y')}</td>
      <td class="c-h">{int(horas)}h</td>
    </tr>"""

fases_rows = "".join(linha_fase(n, e, h, s, i, f) for n, e, h, s, i, f, *_ in FASES_D)

HTML = f"""<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><style>
  @page {{ size:A4; margin:14mm 14mm 16mm 14mm; }}
  * {{ box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }}
  html,body {{ font-family:-apple-system,"Helvetica Neue",Arial,sans-serif; color:{TINTA}; background:#fff; }}
  .eyebrow {{ font-size:9pt; font-weight:700; letter-spacing:1.6px; color:{ROXO2}; text-transform:uppercase; }}
  .dot {{ display:inline-block; width:6px; height:6px; border-radius:50%; background:{ROXO2}; margin-right:7px; vertical-align:middle; }}
  h1 {{ font-size:30pt; font-weight:800; letter-spacing:-0.8px; line-height:1.08; margin:10px 0; }}
  h2 {{ font-size:16pt; font-weight:800; letter-spacing:-0.3px; margin:0 0 3px; }}
  .lead {{ font-size:10.5pt; color:{CORPO}; line-height:1.5; }}

  /* Capa */
  .capa {{ page-break-after:always; padding-top:6mm; }}
  .capa-hd {{ display:flex; justify-content:space-between; align-items:center; }}
  .ico {{ height:54px; }} .wm {{ font-size:16pt; font-weight:800; margin-left:12px; vertical-align:middle; }}
  .metabox {{ display:flex; gap:12px; margin-top:9mm; }}
  .metabox .cell {{ flex:1; background:{CLARO}; border-radius:12px; padding:14px 18px; }}
  .meta-lbl {{ font-size:8.5pt; font-weight:700; letter-spacing:1.3px; color:{ROXO2}; text-transform:uppercase; display:block; margin-bottom:6px; }}
  .meta-row {{ font-size:10pt; color:{CORPO}; line-height:1.55; }} .meta-row strong {{ color:{TINTA}; }}
  .nums {{ display:flex; gap:10px; margin-top:9mm; }}
  .num {{ flex:1; background:{CLARO}; border:1.5px solid {BORDA}; border-radius:14px; padding:16px 14px; text-align:center; }}
  .num .v {{ font-size:23pt; font-weight:800; color:{ROXO}; letter-spacing:-1px; line-height:1; }}
  .num .l {{ font-size:8pt; font-weight:700; letter-spacing:0.8px; color:{SUAVE}; text-transform:uppercase; margin-top:8px; }}

  .sec {{ margin-top:8mm; }}
  .sec-hd {{ border-bottom:2px solid {BORDA}; padding-bottom:8px; margin-bottom:6mm; }}
  .sec-kick {{ font-size:8.5pt; font-weight:700; letter-spacing:1.4px; color:{ROXO2}; text-transform:uppercase; }}

  .bloco {{ margin-bottom:6mm; page-break-inside:avoid; }}
  .bloco-hd {{ font-size:11.5pt; font-weight:800; color:{TINTA}; margin-bottom:8px; padding-left:10px; border-left:3px solid {ROXO}; }}
  .bloco-sub {{ font-size:9pt; font-weight:600; color:{SUAVE}; margin-left:9px; }}
  table.tbl {{ width:100%; border-collapse:separate; border-spacing:0 4px; }}
  .tbl thead th {{ text-align:left; font-size:8pt; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:{SUAVE}; padding:0 12px 4px; }}
  .tbl thead th.right {{ text-align:right; }}
  .tbl tbody td {{ background:{CLARO}; padding:9px 12px; vertical-align:top; font-size:9.4pt; color:{CORPO}; line-height:1.35; }}
  .tbl tbody td.c-item {{ border-top-left-radius:9px; border-bottom-left-radius:9px; }}
  .tbl tbody td.c-h {{ border-top-right-radius:9px; border-bottom-right-radius:9px; text-align:right; font-weight:800; color:{TINTA}; white-space:nowrap; }}
  .idx {{ display:inline-block; min-width:20px; font-weight:800; color:{ROXO}; font-size:8.5pt; }}
  .i-nome {{ font-weight:700; color:{TINTA}; }}
  .tf {{ font-size:8.5pt; font-weight:700; color:{ROXO2}; text-transform:uppercase; letter-spacing:0.6px; padding:4px 12px 0; }}
  .tf.right {{ text-align:right; }}

  /* Gantt */
  .g-row {{ display:flex; align-items:center; margin-bottom:7px; page-break-inside:avoid; }}
  .g-lbl {{ width:44%; font-size:9pt; color:{CORPO}; padding-right:10px; }} .g-lbl strong {{ color:{ROXO}; }}
  .g-track {{ flex:1; position:relative; height:22px; background:{CLARO}; border-radius:6px; }}
  .g-bar {{ position:absolute; top:0; height:22px; background:{ROXO}; border-radius:6px; color:#fff; font-size:7.5pt; font-weight:700; display:flex; align-items:center; justify-content:center; white-space:nowrap; }}

  /* Cards investimento */
  .cards {{ display:flex; gap:14px; margin-top:6mm; }}
  .card {{ flex:1; border-radius:14px; padding:18px 22px; }}
  .card.out {{ background:#fff; border:1.5px solid {BORDA}; }}
  .card.fill {{ background:{ROXO3}; color:#fff; position:relative; }}
  .card .lbl {{ font-size:9pt; font-weight:700; letter-spacing:1.4px; text-transform:uppercase; display:block; margin-bottom:8px; }}
  .card.out .lbl {{ color:{ROXO2}; }} .card.fill .lbl {{ color:#C9BEED; }}
  .card .val {{ font-size:27pt; font-weight:800; letter-spacing:-1px; line-height:1; display:block; }}
  .card.out .val {{ color:{TINTA}; text-decoration:line-through; opacity:.5; }} .card.fill .val {{ color:#fff; }}
  .card .cap {{ font-size:9pt; line-height:1.4; display:block; margin-top:8px; }} .card.out .cap {{ color:{SUAVE}; }} .card.fill .cap {{ color:#E5DCFC; }}
  .badge {{ position:absolute; top:14px; right:16px; background:#FFD84D; color:{TINTA}; font-size:8.5pt; font-weight:800; padding:4px 10px; border-radius:999px; }}
  .invtab {{ width:100%; border-collapse:separate; border-spacing:0 5px; margin-top:5mm; }}
  .invtab td {{ background:{CLARO}; padding:11px 16px; font-size:10pt; color:{CORPO}; }}
  .invtab td:first-child {{ border-radius:9px 0 0 9px; font-weight:700; color:{TINTA}; }}
  .invtab td:last-child {{ border-radius:0 9px 9px 0; text-align:right; font-weight:800; color:{TINTA}; }}
  .invtab tr.tot td {{ background:{ROXO3}; color:#fff; }} .invtab tr.tot td:last-child {{ color:#fff; }}

  .cond {{ margin-top:6mm; padding:12px 16px; background:{CLARO}; border-left:3px solid {ROXO2}; border-radius:6px; font-size:9.3pt; color:{CORPO}; line-height:1.5; }}
  .cond strong {{ color:{TINTA}; }}
  .foot {{ margin-top:8mm; padding-top:8px; border-top:1px solid {BORDA}; font-size:8pt; color:{SUAVE}; display:flex; justify-content:space-between; }}
  .pb {{ page-break-before:always; }}
</style></head><body>

<!-- CAPA -->
<div class="capa">
  <div class="capa-hd">
    <div><div class="eyebrow"><span class="dot"></span>NEXUS AI &middot; PROPOSTA DE DESENVOLVIMENTO</div></div>
    <div><img class="ico" src="{LOGO}"><span class="wm">Nexus AI</span></div>
  </div>
  <h1>Plataforma de Dashboards<br>+ Aplicacao de Conferencia de Estoque</h1>
  <div class="lead">Desenvolvimento sob medida sobre a plataforma analitica que ja le o ERP Odoo do grupo. Cobre quatro modulos de dashboard (Estoque com relatorios de ciclo, Vendas, Financeiro e Demandas) e uma aplicacao operacional de conferencia de estoque com leitor de codigo de barras. Escopo levantado na reuniao de 20/07/2026 e no prototipo apresentado.</div>

  <div class="metabox">
    <div class="cell"><span class="meta-lbl">Cliente</span>
      <div class="meta-row"><strong>Empresa:</strong> Matrix Fitness Group</div>
      <div class="meta-row"><strong>Grupo:</strong> Icaro / JHT</div>
      <div class="meta-row"><strong>Contato:</strong> Victor Icaro</div>
    </div>
    <div class="cell"><span class="meta-lbl">Proposta</span>
      <div class="meta-row"><strong>Emissao:</strong> {INICIO.strftime('%d/%m/%Y')}</div>
      <div class="meta-row"><strong>Modalidade:</strong> Projeto por fases</div>
      <div class="meta-row"><strong>Base:</strong> reuniao 20/07 + prototipo</div>
    </div>
  </div>

  <div class="nums">
    <div class="num"><div class="v">{n_itens}</div><div class="l">Itens a desenvolver</div></div>
    <div class="num"><div class="v">{n_relatorios}</div><div class="l">Relatorios</div></div>
    <div class="num"><div class="v">{int(h_total)}h</div><div class="l">Horas de desenvolvimento</div></div>
    <div class="num"><div class="v">~{round(total_sem/4.3)} meses</div><div class="l">Prazo estimado</div></div>
    <div class="num"><div class="v">{brl(valor_total)}</div><div class="l">Investimento</div></div>
  </div>

  <div class="sec">
    <div class="sec-hd"><span class="sec-kick">O que este documento mostra</span></div>
    <div class="lead">Cada relatorio, cada tela de apoio e cada tela de parametrizacao esta listada individualmente, com o que entrega e as horas de desenvolvimento. Alem dos dashboards, ha uma <strong>fundacao de dados</strong> (motores e estruturas que hoje nao existem no sistema) e uma <strong>aplicacao de conferencia</strong> a parte. Ao final: o cronograma por fases (na ordem de prioridade definida na reuniao) e o investimento.</div>
  </div>

  <div class="foot"><div><strong>NEXUS AI</strong> &middot; CNPJ 64.420.135/0001-99</div><div>Joao Zanini &middot; WhatsApp (61) 98440-9067</div></div>
</div>

<!-- FUNDACAO -->
<div class="sec">
  <div class="sec-hd"><span class="sec-kick">Camada base</span><h2>Fundacao de dados e integracoes</h2>
  <div class="lead" style="margin-top:6px">Motores e estruturas que os relatorios consomem e que <strong>nao existem hoje</strong> no sistema. E o alicerce: sem eles, metade dos indicadores pedidos nao tem de onde sair.</div></div>
  {tabela("Motores e estruturas de dados", "servem a varios modulos", FUNDACAO)}
</div>

<!-- ESTOQUE -->
<div class="sec pb">
  <div class="sec-hd"><span class="sec-kick">Modulo 1 &middot; Prioridade 1</span><h2>Estoque (atual + relatorios de estoque por ciclo)</h2></div>
  {tabela("Relatorios", "as telas de analise, tres telas de estoque", ESTOQUE_REL)}
  {tabela("Telas de apoio e parametrizacao", "onde se cadastra e se define a regra", ESTOQUE_APOIO)}
</div>

<!-- VENDAS -->
<div class="sec pb">
  <div class="sec-hd"><span class="sec-kick">Modulo 2 &middot; Prioridade 3</span><h2>Vendas</h2></div>
  {tabela("Relatorios", "painel + comparacao geral + comparativo A x B", VENDAS_REL)}
  {tabela("Telas de apoio e parametrizacao", "metas, curva ABC, grupos de CNPJ", VENDAS_APOIO)}
</div>

<!-- FINANCEIRO -->
<div class="sec pb">
  <div class="sec-hd"><span class="sec-kick">Modulo 3 &middot; Prioridade 5</span><h2>Financeiro por CNPJ</h2></div>
  {tabela("Relatorios", "consolidado do grupo + por empresa + despesas", FIN_REL)}
  {tabela("Telas de apoio e parametrizacao", "plano de contas, UF, de-para de CNPJ", FIN_APOIO)}
</div>

<!-- DEMANDAS -->
<div class="sec pb">
  <div class="sec-hd"><span class="sec-kick">Modulo 4 &middot; Prioridade 6</span><h2>Demandas</h2></div>
  {tabela("Relatorios", "um painel com 8 blocos, cada bloco e um relatorio", DEM_REL)}
  {tabela("Telas de apoio e parametrizacao", "etapas de demanda e organizacao de entrega", DEM_APOIO)}
</div>

<!-- CONFERENCIA -->
<div class="sec pb">
  <div class="sec-hd"><span class="sec-kick">Aplicacao a parte &middot; Prioridade 2</span><h2>Aplicacao de Conferencia de Estoque (bipador)</h2>
  <div class="lead" style="margin-top:6px">Nao e um dashboard: e uma <strong>aplicacao operacional</strong> com captura de hardware (leitor de codigo de barras), sessao de inventario, trilha de quem fez o que e regras de alerta (serial em local errado, serial vinculado a outro pedido).</div></div>
  {tabela("Telas da aplicacao", "o fluxo de conferencia", CONF_TELAS)}
  {tabela("Integracoes e regras tecnicas", "hardware, sincronizacao, alertas e auditoria", CONF_INT)}
</div>

<!-- TRANSVERSAIS + RESUMO -->
<div class="sec pb">
  <div class="sec-hd"><span class="sec-kick">Qualidade e gestao</span><h2>Transversais</h2></div>
  {tabela("Atividades transversais", "aplicam a todos os modulos", TRANSVERSAIS, mostrar_idx=False)}

  <div class="sec-hd" style="margin-top:8mm"><span class="sec-kick">Consolidado</span><h2>O tamanho da obra</h2></div>
  <table class="invtab">
    <tr><td>Fundacao de dados e integracoes ({n_fund} itens)</td><td>{int(h_fund)}h</td></tr>
    <tr><td>Modulo Estoque ({len(ESTOQUE_REL)+len(ESTOQUE_APOIO)} itens: {len(ESTOQUE_REL)} relatorios)</td><td>{int(h_estoque)}h</td></tr>
    <tr><td>Modulo Vendas ({len(VENDAS_REL)+len(VENDAS_APOIO)} itens: {len(VENDAS_REL)} relatorios)</td><td>{int(h_vendas)}h</td></tr>
    <tr><td>Modulo Financeiro ({len(FIN_REL)+len(FIN_APOIO)} itens: {len(FIN_REL)} relatorios)</td><td>{int(h_fin)}h</td></tr>
    <tr><td>Modulo Demandas ({len(DEM_REL)+len(DEM_APOIO)} itens: {len(DEM_REL)} relatorios)</td><td>{int(h_dem)}h</td></tr>
    <tr><td>Aplicacao de Conferencia ({n_conf} itens: 9 telas + 7 integracoes)</td><td>{int(h_conf)}h</td></tr>
    <tr><td>Transversais (QA, reconciliacao, gestao)</td><td>{int(h_trans)}h</td></tr>
    <tr class="tot"><td>TOTAL &middot; {n_itens} itens &middot; {n_relatorios} relatorios</td><td>{int(h_total)}h</td></tr>
  </table>
</div>

<!-- CRONOGRAMA -->
<div class="sec pb">
  <div class="sec-hd"><span class="sec-kick">Cronograma</span><h2>Plano de implementacao por fases</h2>
  <div class="lead" style="margin-top:6px">Entrega incremental, painel a painel, na ordem de prioridade definida na reuniao (Estoque, Conferencia, Vendas, Ciclos, Financeiro, Demandas). Premissa: inicio em {INICIO.strftime('%d/%m/%Y')}, 1 desenvolvedor senior a {CAP_SEMANA}h uteis por semana. Com um segundo desenvolvedor, o prazo comprime para cerca da metade.</div></div>

  <div style="margin:6mm 0">{barra_gantt()}</div>

  <table class="tbl"><thead><tr>
    <th style="width:12%">Fase</th><th>Entrega</th><th class="right" style="width:26%">Janela</th><th class="right" style="width:10%">Horas</th>
  </tr></thead><tbody>{fases_rows}</tbody></table>
  <div class="lead" style="margin-top:5mm"><strong>Entrega prevista da ultima fase:</strong> {data_fim.strftime('%d/%m/%Y')}. Cada fase e entregue e validada isoladamente, entao o cliente comeca a usar o Estoque muito antes do projeto terminar.</div>
</div>

<!-- INVESTIMENTO -->
<div class="sec pb">
  <div class="sec-hd"><span class="sec-kick">Investimento</span><h2>Proposta comercial</h2></div>
  <div class="cards">
    <div class="card out"><span class="lbl">Valor de reposicao</span><span class="val">{brl(valor_reposicao)}</span><span class="cap">O que custaria construir tudo do zero, sem a plataforma que ja existe.</span></div>
    <div class="card fill"><div class="badge">{round((valor_reposicao-valor_total)*100/valor_reposicao)}% abaixo</div><span class="lbl">Seu investimento</span><span class="val">{brl(valor_total)}</span><span class="cap">{int(h_total)}h a {brl(VALOR_HORA)}/h. Aproveita toda a fundacao ja construida.</span></div>
  </div>

  <table class="invtab">
    <tr><td>Plataforma de dashboards (4 modulos + fundacao + qualidade)</td><td>{brl(valor_dash)}</td></tr>
    <tr><td>Aplicacao de Conferencia de estoque (pode ser contratada a parte)</td><td>{brl(valor_conf)}</td></tr>
    <tr class="tot"><td>INVESTIMENTO TOTAL</td><td>{brl(valor_total)}</td></tr>
  </table>

  <div class="cond"><strong>Condicoes:</strong> projeto cobrado por fase, com faixa de horas por pacote (nao preco fechado por item), devido a conciliacao de dados. Pagamento por marco de entrega de cada fase. Os valores dependem de o cliente cadastrar no Odoo os dados de origem hoje inexistentes (atributo linha e tipo, meta mensal, previsao de ciclo, plano de contas, UF na despesa, segmento e vendedor). A aplicacao de Conferencia pode ser contratada junto ou separadamente.</div>

  <div class="foot"><div><strong>NEXUS AI</strong> &middot; CNPJ 64.420.135/0001-99</div><div>Joao Zanini &middot; WhatsApp (61) 98440-9067</div></div>
</div>

</body></html>"""

HTML_PATH.write_text(HTML, encoding="utf-8")

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                f"--print-to-pdf={PDF_PATH}", f"file://{HTML_PATH}"],
               check=True, capture_output=True)
print("PDF:", PDF_PATH)
print(f"itens={n_itens} relatorios={n_relatorios} apoio={n_apoio} fundacao={n_fund} conferencia={n_conf}")
print(f"horas total={h_total} (dash={h_dash} conf={h_conf}) valor={valor_total}")
print(f"cronograma: {total_sem} semanas, fim {data_fim}")
