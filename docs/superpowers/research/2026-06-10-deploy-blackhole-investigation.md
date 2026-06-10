# Investigação , falha intermitente do job `deploy` (GitHub -> Portainer)

> Metodologia: `superpowers:systematic-debugging` (Iron Law: causa raiz antes de
> qualquer correção). Esta nota é o registro da Fase 1 (investigação). NÃO mergear
> o PR #88 (mitigação que mascara) até a raiz ser confirmada no servidor.

## Sintoma

Job `deploy` do `.github/workflows/build.yml` falha com:

```
curl: (28) Failed to connect to painel.nexusai360.com port 443 after 15002 ms: Timeout was reached
```

Builds (`build-app`/`build-mcp`) passam e publicam as imagens no GHCR. Só o
`deploy` cai. Da máquina local o painel responde HTTP 200 em ~0,3s.

## Evidência coletada (lado GitHub , conclusiva)

Run 27281405411 (#87, Fase 4), deploy attempt 1, runner **Azure westus / ubuntu-24.04**:

| Fato | Valor | O que descarta |
|---|---|---|
| 1º curl do job já deu timeout | 14:00:12 -> 14:00:27, **exatamente 15002 ms** (= `--connect-timeout 15`) | **Não é a rajada self-inflicted**: a conexão foi para o buraco no 1º SYN, antes de qualquer request bem-sucedido. O burst (pull de 2 imagens + update de 3 services) **nunca chegou a rodar** (parou no 1º curl, o `STACK_NAME`). |
| TODOS os curls timeout a ~15002 ms | janela inteira 14:00:12 -> 14:13:29 (~13 min) | Blackhole total e contínuo, não lentidão. |
| Mensagem = "Failed to connect ... port 443" (não "Could not resolve host") | DNS resolveu | **Não é DNS.** É **TCP connect blackhole** para `82.29.61.175:443`. |
| `--insecure` no curl + erro pré-handshake (exit 28, não 35/60) | conexão TCP nem abre | **Não é SSL/cert/handshake.** |
| build-app/build-mcp = success (infra GitHub/GHCR) | OK | **Não é GHCR / "unknown blob" / código.** |

### Linha do tempo (intermitência ~30 min)

| Run | Deploy | Resultado |
|---|---|---|
| 27279351591 (Fase 3) | 13:27:13 -> 13:33:04 | success (~6 min, normal) |
| **27281405411 attempt 1 (Fase 4)** | **14:00:10 -> 14:13:29** | **failure , blackhole total** |
| 27281405411 rerun manual | 14:41:03 -> 14:48:27 | success (~3,5 min, normal) |

Sucesso -> ~27 min depois blackhole total -> ~28 min depois sucesso de novo.
Deploys saudáveis são sempre rápidos (~3-6 min). A falha é **tudo-ou-nada**,
por IP de runner, numa janela limitada que se cura sozinha.

### IPv6 (descartado como causa provável)

`painel.nexusai360.com` -> CNAME `manager01.nexusai360.com` -> A `82.29.61.175`.
O AAAA visto localmente (`64:ff9b::521d:3daf`) é o **prefixo NAT64 `64:ff9b::/96`**
embrulhando o MESMO IPv4 (`0x521d3daf` = 82.29.61.175) , ou seja, **DNS64
sintetizado pelo resolver local**, não um AAAA publicado. Runners do GitHub são
IPv4-only e usariam só o A. (Confirmar no probe do runner para fechar 100%.)

## Conclusão da Fase 1 (localização da raiz)

A falha é um **blackhole de TCP em `82.29.61.175:443` para um subconjunto de IPs
de egress dos runners Azure do GitHub**, intermitente, com janela que se cura
sozinha (~13-30 min). **Não é** código nosso, TLS, GHCR, DNS, nem a rajada de
requests do deploy. É **rede/borda do servidor (Hostinger VPS)**.

### Mecanismos candidatos (todos consistentes com a evidência , exigem confirmação NO servidor)

1. **`fail2ban` com ação DROP** banindo o IP do runner (DROP = timeout, não
   refused; bantime ~15-30 min casa com a janela). Gatilho provável: a rajada
   autenticada de um deploy ANTERIOR (jail de Portainer/Traefik/auth).
2. **Firewall do hPanel da Hostinger** bloqueando faixas Azure (intermitente
   conforme o IP/região em que o runner cai , westus aqui).
3. **Mitigação automática de DDoS / null-route da Hostinger** ao detectar o
   padrão de conexões de IPs de nuvem (null-route = blackhole do 1º pacote,
   TTL curto que se cura sozinho , encaixe muito bom).

Discriminar entre (1)/(2)/(3) precisa de UM olhar no servidor (ver bundle abaixo).

## Próximo passo , confirmar no servidor

Rodar `scripts/diag/deploy-server-diag.sh` na VPS (via SSH ou colando no terminal
do hPanel). Artefatos decisivos:
- `fail2ban-client status` + jails + IPs banidos + `bantime`.
- `iptables-save` / `nft list ruleset` , regras DROP em :443.
- Logs do Traefik/Portainer em 14:00-14:13Z: **algum pacote do runner chegou?**
  (se NADA chegou no Traefik -> blackhole é a montante = firewall/null-route;
   se chegou e não respondeu -> Traefik/Portainer.)
- Firewall do hPanel (UI da Hostinger) + eventos de DDoS/mitigação.
- `journalctl -k` / `dmesg` por null-route ou conntrack drops no horário.

## Probe lado-runner (opcional, complementar)

Workflow `workflow_dispatch` que, de um runner, captura: IP público de egress,
DNS (A/AAAA), `curl -v` + `openssl s_client` ao painel, TCP connect cru a 443,
e `traceroute`/`mtr` a 82.29.61.175. Dá o IP de egress (para casar com logs do
servidor) e reproduz ao vivo. Requer registrar o workflow na default branch
(`workflow_dispatch`-only, não roda em push , inócuo).

## Por que NÃO mergear o #88

O #88 só amplia a janela de retry (13 -> 30 min). Se a raiz é fail2ban/DDoS, o
deploy passaria 30 min **martelando um IP null-routed/banido**, podendo
**prolongar** a mitigação/ban (recidiva), além de mascarar o problema. A correção
real provavelmente **inverte a direção** (servidor puxa, em vez de GitHub
empurrar) ou usa runner self-hosted / túnel privado , decisão a tomar APÓS
confirmar a raiz.

## Direções de correção candidatas (decidir após confirmar a raiz)

- **A) Agente de pull no servidor** (Watchtower / systemd-timer que checa digest
  do `:latest` no GHCR e redeploya). GitHub só publica imagem (já 100%); zero
  inbound para a VPS. Mais desacoplado.
- **B) Runner self-hosted na VPS**: o step `deploy` roda localhost -> Portainer.
  Elimina a travessia pública.
- **C) Túnel privado (Tailscale/WireGuard)** runner -> VPS; bater no Portainer
  pelo IP privado, fora da borda pública.
- **D) Whitelist das faixas de egress do GitHub no firewall + isenção de
  fail2ban**. Frágil (faixas enormes e rotativas).
