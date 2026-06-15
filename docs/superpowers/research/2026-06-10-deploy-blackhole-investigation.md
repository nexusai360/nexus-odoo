# Investigação , falha intermitente do job `deploy` (GitHub -> Portainer)

> Metodologia: `superpowers:systematic-debugging`. **Causa raiz encontrada por
> comparação com a referência que FUNCIONA (nexus-insights).** #88 NÃO mergear:
> vai na direção errada (mais retry/martelo).

## Sintoma

Job `deploy` do `.github/workflows/build.yml` falhava de forma intermitente com:

```
curl: (28) Failed to connect to painel.nexusai360.com port 443 after 15002 ms: Timeout was reached
```

Builds passavam e publicavam as imagens no GHCR. Da máquina local o painel
respondia HTTP 200 em ~0,3s.

## Fato decisivo (do usuário): o servidor NÃO é o problema

O **nexus-insights** (mesmo cliente) deploya no **MESMO Portainer/VPS
(`painel.nexusai360.com` / 82.29.61.175)** sem nenhuma falha, o tempo todo.
Logo, o Portainer/Traefik/firewall **não** está bloqueando deploy do GitHub em
geral. O problema estava **no nosso workflow**.

## Causa raiz , comparação com a referência que funciona

| | nexus-insights (FUNCIONA) | nexus-odoo (FALHAVA) |
|---|---|---|
| curl | `curl --silent --insecure` (sem timeout/retry) | `curl ... --connect-timeout 15 --max-time 120 --retry 4 --retry-delay 6 --retry-connrefused` |
| laço externo | nenhum (passada única) | **laço de até 12 tentativas** (#88 ampliava p/ ~30min) |
| requests por deploy | ~4 (1 pull + stack + services + 1 update) | 2 pulls + stack + services + **3 updates**, cada um com `--retry 4` (até ~5x) |

Quando há um **blip de rede pontual**, o `--retry 4 --retry-connrefused` por
chamada + o laço de 12 tentativas transformam isso numa **rajada de
dezenas/centenas de conexões martelando o Portainer por 13-30 min**, que termina
em job vermelho e no email "Build and Push falhou". A evidência do run 27281405411
(attempt 1, 14:00-14:13Z) mostra exatamente isso: todo curl batendo no teto de
`--connect-timeout 15` (15002 ms), 5 retries por chamada, 5 tentativas externas,
~13 min de martelo. O rerun manual (14:41) passou em ~3,5 min.

O insights, com 1 passada calma de curl simples, **nunca** vira esse martelo:
ou passa de primeira, ou um rerun de 1 clique resolve. A complexidade que **nós**
adicionamos (commits #85/#88) é que transformava um pisco num desastre vermelho ,
e plausivelmente ainda piorava as coisas se houver qualquer rate-limit no painel
(martelar = pior).

## Correção aplicada (commit nesta branch)

`.github/workflows/build.yml`, job `deploy` reescrito para **espelhar o padrão
mínimo e comprovado do insights**: `curl --silent --insecure`, **uma passada,
sem `--retry`, sem `--connect-timeout`, sem laço**. Mantém o que é legítimo do
nosso caso (2 imagens + 3 services: app/mcp/worker), mas de forma calma. Se um
deploy falhar pontualmente, o rerun manual resolve , exatamente como no insights.

## #88 , descartar

O #88 só ampliava o laço de retry de 13 para ~30 min: **mais martelo, direção
oposta à correção**. Fechar sem merge.

## Diagnóstico de servidor (opcional, só se reincidir)

`scripts/diag/deploy-server-diag.sh` (read-only) continua disponível caso, MESMO
com o deploy calmo, volte a falhar , aí sim valeria olhar fail2ban/firewall no
servidor. Mas, dado que o insights prova o servidor saudável, a expectativa é que
o deploy calmo resolva.
