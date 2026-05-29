-- Adiciona coluna de origem da chamada em llm_usage (tag "Origem" do menu de
-- consumo). NULL em linhas antigas (derivam de is_playground). Valores novos:
-- "router" (router de catalogo em producao) e "router_calibracao" (calibragem).
ALTER TABLE "llm_usage" ADD COLUMN "origin" TEXT;
