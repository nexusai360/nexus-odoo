#!/usr/bin/env bash
# Diagnóstico SERVIDOR (VPS Hostinger 82.29.61.175) para a falha intermitente
# do deploy GitHub -> Portainer (curl 28 / blackhole em :443).
#
# Rodar como root na VPS (SSH ou terminal do hPanel):
#   bash deploy-server-diag.sh 2>&1 | tee /tmp/deploy-diag.txt
#
# Objetivo: nomear o mecanismo do blackhole (fail2ban DROP vs firewall hPanel vs
# null-route/DDoS Hostinger vs Traefik). Read-only: NÃO altera nada.
set +e
echo "===== DATA ====="; date -u; echo

echo "===== 1) fail2ban (DROP bane => timeout no runner) ====="
command -v fail2ban-client >/dev/null && {
  fail2ban-client status
  for j in $(fail2ban-client status | sed -n 's/.*Jail list:\s*//p' | tr ',' ' '); do
    echo "--- jail $j ---"; fail2ban-client status "$j"
  done
  echo "--- bantime/findtime configurados ---"
  grep -rhsE '^(bantime|findtime|maxretry)' /etc/fail2ban/ 2>/dev/null | sort -u
} || echo "fail2ban NAO instalado"
echo

echo "===== 2) Regras de firewall (DROP em :443 por IP/CIDR?) ====="
{ iptables-save 2>/dev/null || nft list ruleset 2>/dev/null; } | grep -iE 'drop|reject|443|f2b|recent' | head -80
echo "--- ufw ---"; command -v ufw >/dev/null && ufw status verbose 2>/dev/null | head -40 || echo "sem ufw"
echo

echo "===== 3) Kernel/null-route/conntrack drops (DDoS Hostinger?) ====="
ip route show table all 2>/dev/null | grep -iE 'blackhole|unreachable|prohibit' | head
dmesg 2>/dev/null | grep -iE 'drop|martian|conntrack|nf_conntrack: table full|rp_filter' | tail -30
echo

echo "===== 4) Traefik/Portainer logs no horario das falhas (14:00-14:13Z) ====="
echo "(ajuste o nome do container/serviço se preciso)"
for c in $(docker ps --format '{{.Names}}' 2>/dev/null | grep -iE 'traefik|portainer'); do
  echo "--- logs $c (ultimas 2h, grep porta/erro) ---"
  docker logs --since 2h "$c" 2>&1 | grep -iE 'TLS|443|EOF|timeout|denied|forbidden|429|rate' | tail -40
done
echo

echo "===== 5) Quem esta escutando :443 e :22 ====="
ss -ltnp 2>/dev/null | grep -E ':443|:22'
echo

echo "===== 6) Conexões/contagem por IP agora (rate?) ====="
ss -tn state established 2>/dev/null | awk 'NR>1{split($4,a,":"); print a[1]}' | sort | uniq -c | sort -rn | head
echo

echo "===== 7) AAAA publicado de verdade? (IPv6) ====="
dig +short manager01.nexusai360.com AAAA 2>/dev/null || echo "(sem dig)"
echo
echo "===== FIM ====="
