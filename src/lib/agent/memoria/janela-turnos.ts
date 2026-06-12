// src/lib/agent/memoria/janela-turnos.ts
// Onda M (Arquitetura 3.0) T2.1/T2.2 , a correção de raiz do "esquecimento".
//
// A janela de histórico passa a ser contada em TURNOS (user + assistants até o
// próximo user), não em linhas de banco. Dentro da janela, assistant que
// consultou tools vira SÍNTESE TEXTUAL (content + toolDigest) , nunca replay
// de toolCalls crus, que viram tool calls órfãs e quebram os providers (400).
// Fora da janela, os toolDigests SOBREVIVEM em `digestsAnteriores`: é a
// memória determinística de números antigos da conversa (custo ~1 linha/turno).
//
// Plan: docs/superpowers/plans/2026-06-12-nex-arq3-onda-m-plan.md (M.2)

export interface MsgJanela {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  toolCalls: { id: string; name: string; arguments: object }[] | null;
  toolDigest: string | null;
}

export interface MensagemSintetizada {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Sempre null no replay sintetizado (garantia multi-provider). */
  toolCalls: null;
}

export interface JanelaTurnos {
  /** Últimos K turnos, sintetizados, prontos para o replay. */
  mensagens: MensagemSintetizada[];
  /** toolDigests dos turnos ANTERIORES à janela, em ordem cronológica. */
  digestsAnteriores: string[];
}

const CAP_DIGESTS_ANTERIORES = 40;

/**
 * Agrupa o histórico cronológico em turnos, corta os últimos `maxTurnos` para
 * replay verbatim (sintetizado) e preserva os digests dos turnos anteriores.
 */
export function agruparEmTurnosComSintese(
  mensagens: MsgJanela[],
  maxTurnos: number,
  capDigests: number = CAP_DIGESTS_ANTERIORES,
): JanelaTurnos {
  // role=tool e system nunca entram no replay (dado bruto antigo / interno).
  const uteis = mensagens.filter((m) => m.role === "user" || m.role === "assistant");

  // Agrupar em turnos: um turno começa num user e vai até o próximo user.
  const turnos: MsgJanela[][] = [];
  let atual: MsgJanela[] = [];
  for (const m of uteis) {
    if (m.role === "user" && atual.length > 0) {
      turnos.push(atual);
      atual = [];
    }
    atual.push(m);
  }
  if (atual.length > 0) turnos.push(atual);

  const dentro = turnos.slice(-maxTurnos);
  const fora = turnos.slice(0, Math.max(0, turnos.length - maxTurnos));

  const mensagensSintetizadas: MensagemSintetizada[] = dentro.flat().map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    content:
      m.role === "assistant" && m.toolCalls?.length && m.toolDigest
        ? `${m.content}\n\n[consultas do turno: ${m.toolDigest}]`
        : m.content,
    toolCalls: null,
  }));

  const digestsAnteriores = fora
    .flat()
    .filter((m) => m.role === "assistant" && m.toolDigest)
    .map((m) => m.toolDigest as string)
    .slice(-capDigests);

  return { mensagens: mensagensSintetizadas, digestsAnteriores };
}
