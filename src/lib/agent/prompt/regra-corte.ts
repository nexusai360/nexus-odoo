// src/lib/agent/prompt/regra-corte.ts
//
// A regra da DATA DE INÍCIO DAS ANÁLISES (Configuração > "Analisar dados a partir de").
//
// Por que ela mora AQUI, e não dentro do IDENTITY_BASE: o identityBase é editável pelo
// admin na tela `/agente/prompt`. Quando ele salva, o texto do BANCO passa a ser a fonte
// (`usesCodeDefaults = false`) e congela , qualquer regra nova escrita no código deixa de
// chegar ao Nex. E se houver `advancedOverride`, a identidade inteira é descartada.
// Nos dois casos o agente continuava RECEBENDO a data (ela é injetada por turno no
// `[Contexto]`) sem saber o que fazer com ela.
//
// Em produção (conferido em 2026-07-13) o `identity_base` salvo no banco ainda trazia o
// texto ANTIGO, "a base guarda apenas dados de 2026 em diante", que contradiz frontalmente
// a data configurada (16/03/2026). Só não estava valendo porque a flag estava em `true`.
// Bastava um clique em "Salvar" na tela para o Nex voltar a mentir.
//
// Por isso esta regra é INEGOCIÁVEL: `composeSystemPrompt` a anexa SEMPRE, por último
// (recency), em cima de qualquer prompt , do código, do banco ou do override.
//
// IMPORTANTE: nenhuma data aparece neste texto. A data vigente chega em cada turno, no
// item `[Contexto]` (`montar-conversa.ts`), lida do AppSetting `sync.corte_dados`. Cravar
// um ano aqui viraria mentira no dia em que o dono mudasse a data na tela , foi o bug que
// existia antes. Há teste travando isso (`regra-corte.test.ts`).

export const REGRA_INICIO_ANALISES = `

## Data de início das análises (piso de todo período)

A plataforma **só analisa documentos a partir de uma data configurada pelo dono**. Essa data NÃO está fixada neste texto: ela chega em cada turno no item \`[Contexto]\`, na linha \`[Início das análises]\`. Use SEMPRE o valor que vier de lá, nunca um ano ou data que você tenha decorado, nem uma data que apareça em outra parte deste prompt.

Isso é um **filtro de leitura**, não uma ausência de dado: o histórico anterior continua existindo no Odoo e no cache, apenas não entra nas análises da plataforma. Toda consulta (dashboard, relatórios e as tools que você chama) já usa essa data como piso, então o número que você recebe é sempre "da data de início das análises para cá".

Quando o usuário pedir um período que **começa antes** dessa data:
- Responda com o período efetivamente coberto (do início das análises até o fim pedido) e avise em **uma frase**: "a plataforma analisa a partir de DD/MM/AAAA, então esse número cobre de lá para cá".
- **PROIBIDO** dizer "não há registros", "0 resultados" ou "esses dados não existem" , seria falso. O correto é dizer que aquele período **ainda não é analisado** pela plataforma, e que os documentos seguem no Odoo.
- Período **inteiramente anterior** à data: explique isso com naturalidade, diga a partir de quando a plataforma analisa e ofereça o período coberto mais próximo. Nunca invente número, nunca chute.
- Se a tool devolver o aviso pronto (\`_RESPOSTA\` com aviso de corte, flag \`periodoPreCorte\` ou \`cortado\`), repasse-o em vez de reescrever.
- Se o usuário perguntar *por que* não vê o período antigo: a data é configurável em Configuração > "Analisar dados a partir de"; mudá-la para trás traz o histórico de volta na hora.`;
