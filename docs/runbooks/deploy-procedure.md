# Caminho das pedras , deploy do nexus-odoo (rota ÚNICA e validada)

> Regra: **sempre o MESMO caminho.** Nada de improviso. Toda subida pra produção
> passa por aqui. Se algo falhar, conserta-se O CAMINHO, não se inventa um novo.

## O comando único

Da pasta do projeto, com a branch já commitada e **pushada**:

```bash
python3 scripts/ship.py "titulo do PR"
```

Ele faz, em ordem, sempre igual:
1. acha/cria o PR (`feat/nex-reconstrucao` -> `main`);
2. **espera o CI `validate` (ci.yml) ficar verde** (lint+typecheck+jest+build) , se não ficar, **aborta o merge**;
3. **squash-merge**;
4. **espera o `Build and Push`** (build-app + build-mcp + deploy) na `main`; se o `deploy` falhar por blip de rede, **faz 1 rerun automático** (o deploy já tem retry calibrado);
5. **verifica prod** `https://agentenex.nexusai360.com/api/health` == `{"ok":true}`.

Sai com 0 só se deploy E prod estão OK. Variante: `python3 scripts/ship.py --merge-only <PR#>`.

## Por que esse script existe (as 2 dores que já deram problema)

1. **Deploy instável (emails de falha):** a causa foi um retry-storm que foi introduzido
   no `build.yml` (curl --retry 4 dentro de laço 12x = centenas de conexões martelando o
   Portainer). Corrigido: deploy hoje é **1 passada com retry modesto** (até 3 tentativas),
   igual em confiabilidade ao nexus-insights. Não mexer nisso à toa.
2. **API do GitHub inalcançável desta máquina:** `api.github.com` às vezes resolve pra um IP
   Azure (`4.228.31.149`) que a rota desta rede não alcança; os IPs clássicos (`140.82.x`)
   funcionam. O `gh` cai no IP ruim e trava. **`ship.py` fala com a API direto nos IPs que
   funcionam** (SNI=api.github.com), então independe do `gh`/`/etc/hosts`. Sintoma do
   problema: `dial tcp 4.228.31.149:443: i/o timeout`. (Fix opcional permanente, 1x com sudo:
   `echo "140.82.112.6 api.github.com" | sudo tee -a /etc/hosts` , remover quando a rota normalizar.)

## Regra pro Claude (e pra qualquer sessão)

- Para subir pra produção, **use `scripts/ship.py`**. Não recriar o fluxo na mão com `gh pr
  create`/`gh pr merge` (quebra no bug de IP acima) nem improvisar.
- `git push` (github.com) funciona sempre; o problema é só `api.github.com` , por isso o
  push é normal e o resto vai pelo `ship.py`.
- Deploy é resiliente: 1 rerun cobre blip. Só investigar o servidor se falhar DEPOIS do rerun.
