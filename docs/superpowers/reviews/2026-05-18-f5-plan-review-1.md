# F5 — Review #1 do PLAN v1 → achados para a v2

> Review #1 (de 2): lacunas, ordem, premissas. Auditoria adversarial do plano.

## Achados materiais

**P1 — Tarefa de `transcribe.ts` ausente (LACUNA).** O mapa de arquivos lista
`src/lib/agent/transcribe.ts`, mas **nenhuma task o cria**. É dependência da
onda 3 (áudio in-app) e da onda 4 (áudio de WhatsApp). v2: adicionar task de
porte do `transcribe.ts` na onda 1 (núcleo).

**P2 — Config de LLM (credencial+modelo ativo) chega tarde demais (ORDEM).** O
chat da onda 3 só funciona com uma `LlmConfig` ativa. Mas a UI que gerencia
credenciais LLM e seleção de modelo está na Task 7.5 (onda 7). Um usuário real
não consegue usar o chat da onda 3 sem essa UI. v2: **separar** a Task 7.5 — a
parte de **credenciais LLM + seleção de provider/modelo + edição de prompt** vira
uma task na **onda 3** (ou início da onda 5); só a **gestão de KB** fica na onda
7. As verificações e2e das ondas 1–2 podem usar config seedada por script, mas a
UI de config tem de existir a partir da onda 3.

**P3 — Ordem de streaming invertida (ORDEM).** A Task 3.1 (endpoint SSE) testa
eventos `token`, mas o streaming token-a-token só existe após a Task 3.2
(adapter Anthropic). v2: **3.2 antes de 3.1**; ou a 3.1 declara explicitamente
que entrega em bloco e a 3.2 acrescenta o token-a-token.

**P4 — Risco de `prisma migrate dev` (PREMISSA).** Há registro de que a config
de migration do projeto teve `datasource.url` ausente (observação interna
2026-05-18). v2: a Task 1.1 deve, no Step 0, **verificar que o `prisma.config` /
datasource tem a URL** antes de migrar — senão o `migrate dev` falha.

**P5 — Origem da credencial de embedding indefinida (LACUNA).** A Task 7.2 usa
OpenAI para embedding, mas `get-active-config` resolve a config de **chat**, não
de embedding. v2: definir de onde vem a credencial de embedding — uma
`LlmCredential` de provider `openai` designada via `AppSetting`
(`embedding_credential_id`), ou um campo em `AgentSettings`. Especificar.

**P6 — Tratamento de áudio do WhatsApp não está cabeado (LACUNA).** A Task 4.4
(inbound) e a 4.3 (processor) não dizem **onde** o fluxo `type=audio` →
`downloadMedia` → `transcribe` acontece. v2: o **processor** (Task 4.3) deve, ao
receber job de áudio, baixar a mídia (`cloud-client.downloadMedia`) e transcrever
antes de chamar `runAgent`. Tornar explícito.

**P7 — "Rotação" do `MCP_SERVICE_TOKEN` pela UI é irreal (CONCEITO).** A Task 6.5
promete rotacionar o token na UI, mas o token é **variável de ambiente** — a UI
não muda env. v2: a tela Integrações→MCP **exibe** o token (mascarado) em modo
leitura + instrução de como rotacionar via env/Portainer; "rotação pela UI" só
seria possível movendo o token para o banco (fora do escopo da F5 — não mexer no
contrato da F4). Corrigir a Task 6.5.

**P8 — `tsx` pode não estar instalado (PREMISSA).** Os scripts
`verify-f5-onda*.ts` assumem `npx tsx`. v2: confirmar como a F4 rodou seus
scripts de verificação (`scripts/` da F4) e usar o mesmo mecanismo; se não houver
runner TS, ajustar.

## Achados menores

- **P9 — Passe de design upfront.** As ondas 3, 5 e 6 têm muita UI. O plano
  invoca `ui-ux-pro-max` por task (correto), mas um passe de design no início da
  onda 3 (sistema visual do chat e do menu Integrações) evitaria retrabalho. v2:
  adicionar uma task de design no início da onda 3.
- **P10 — Registro da fila no worker.** A Task 4.3 diz "checar o entrypoint
  existente" — aceitável, mas v2 pode citar o arquivo concreto do entrypoint do
  worker para tirar a ambiguidade.
- **P11 — Item de menu do `/agente`.** A Task 3.5 adiciona "Agente" ao sidebar;
  confirmar o ícone e a posição com `ui-ux-pro-max`.

## Veredito
O plano cobre a SPEC e tem ondas coerentes, mas tem **uma lacuna de dependência
séria** (P2 — config de LLM tarde demais), **duas lacunas de tarefa** (P1
transcribe, P6 áudio WhatsApp), **uma ordem invertida** (P3) e **um conceito
irreal** (P7 rotação de token). A v2 resolve P1–P8 e considera P9–P11. A
granularidade fina (decomposição das tasks de porte) é alvo da review #2.
