/**
 * Cliente da Graph API do WhatsApp Cloud (Meta).
 *
 * Referência: SPEC §6.1.1 e §6.2 modo 1.
 *
 * Responsabilidades:
 * - `sendText`: envia mensagem de texto para um número via Graph API.
 * - `downloadMedia`: busca URL do media e baixa o binário (2 fetches).
 *
 * As credenciais são injetadas externamente (decifradas antes de chamar),
 * permitindo mock em testes sem depender do banco.
 */

/** Versão da Graph API usada. */
const GRAPH_API_VERSION = "v20.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export interface WhatsappCredentials {
  /** Token de acesso da Graph API (em claro — já decifrado). */
  apiToken: string;
  /** ID do número de telefone do WhatsApp Business. */
  phoneNumberId: string;
}

export interface MediaDownloadResult {
  /** Buffer do arquivo de mídia. */
  buffer: ArrayBuffer;
  /** MIME type retornado pela Graph API (ex.: "audio/ogg; codecs=opus"). */
  mimeType: string;
}

export interface WhatsappCloudClient {
  /**
   * Envia uma mensagem de texto para o número `to`.
   * Lança erro se a Graph API retornar status não-2xx.
   */
  sendText(to: string, text: string): Promise<void>;

  /**
   * Baixa um arquivo de mídia do WhatsApp.
   * Passo 1: GET /{media-id} → obtém URL temporária + mimeType.
   * Passo 2: GET <url> → baixa o binário.
   * Lança erro em qualquer etapa com falha.
   */
  downloadMedia(mediaId: string): Promise<MediaDownloadResult>;
}

/**
 * Constrói um cliente da Graph API com as credenciais fornecidas.
 * Usar `buildCloudClientFromDb` para carregar as credenciais do banco.
 */
export function buildCloudClient(creds: WhatsappCredentials): WhatsappCloudClient {
  const { apiToken, phoneNumberId } = creds;
  const authHeader = { Authorization: `Bearer ${apiToken}` };

  return {
    async sendText(to: string, text: string): Promise<void> {
      const url = `${GRAPH_API_BASE}/${phoneNumberId}/messages`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          ...authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { body: text },
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(
          `Graph API sendText falhou (${response.status}): ${JSON.stringify(err)}`,
        );
      }
    },

    async downloadMedia(mediaId: string): Promise<MediaDownloadResult> {
      // Passo 1: resolve URL temporária do media
      const metaUrl = `${GRAPH_API_BASE}/${mediaId}`;
      const metaResponse = await fetch(metaUrl, { headers: authHeader });

      if (!metaResponse.ok) {
        const err = await metaResponse.json().catch(() => ({}));
        throw new Error(
          `Graph API downloadMedia (meta) falhou (${metaResponse.status}): ${JSON.stringify(err)}`,
        );
      }

      const meta = (await metaResponse.json()) as { url: string; mime_type: string };

      // Passo 2: baixa o binário
      const binResponse = await fetch(meta.url, { headers: authHeader });

      if (!binResponse.ok) {
        throw new Error(
          `Graph API downloadMedia (binário) falhou (${binResponse.status})`,
        );
      }

      const buffer = await binResponse.arrayBuffer();
      return { buffer, mimeType: meta.mime_type };
    },
  };
}

/**
 * Carrega as credenciais do banco (WhatsappChannel) e constrói o cliente.
 * Lança erro se o canal não estiver configurado ou não estiver habilitado.
 */
export async function buildCloudClientFromDb(): Promise<WhatsappCloudClient> {
  // Import dinâmico para evitar dependência em testes (o banco não está disponível)
  const { prisma } = await import("@/lib/prisma");
  const { decrypt } = await import("@/lib/encryption");

  const channel = await prisma.whatsappChannel.findUnique({ where: { id: "global" } });

  if (!channel || !channel.enabled) {
    throw new Error("Canal WhatsApp não configurado ou desabilitado");
  }
  if (!channel.encryptedApiToken || !channel.phoneNumberId) {
    throw new Error("Credenciais Meta incompletas (token ou phoneNumberId ausente)");
  }

  return buildCloudClient({
    apiToken: decrypt(channel.encryptedApiToken),
    phoneNumberId: channel.phoneNumberId,
  });
}
