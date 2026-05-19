/**
 * Definição da fila BullMQ `agent` para processamento de mensagens WhatsApp.
 *
 * Exporta o nome da fila e o tipo do job data para uso compartilhado
 * entre o worker (processor) e o endpoint receptor (inbound route).
 */

export const AGENT_QUEUE_NAME = "agent";
