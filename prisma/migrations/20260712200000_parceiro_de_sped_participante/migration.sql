-- fato_parceiro passa a vir de sped.participante (a entidade que TODO documento referencia).
--
-- Antes vinha de res.partner, e o join era pela pessoa ERRADA: sped.participante e res.partner
-- tem numeracao independente. Em julho/2026, 116 das 136 notas apareciam no estado errado no
-- mapa, e uma nota foi excluida do faturamento por colisao de id com um parceiro do grupo.
--
-- Aditiva: a coluna nova guarda o vinculo com o contato do Odoo. O proximo ciclo do worker
-- reconstroi a tabela inteira com os ids corretos (deleteMany + createMany em transacao).
ALTER TABLE "fato_parceiro" ADD COLUMN IF NOT EXISTS "partner_id" INTEGER;
