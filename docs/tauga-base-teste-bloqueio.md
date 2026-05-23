# Base de teste Tauga — bloqueio de autenticação (investigação)

> Data: 2026-05-21/22, atualizado 2026-05-23. Contexto: F4 Onda 2 (escrita no
> MCP). Documenta o que foi testado contra a base de teste, os erros
> encontrados, a solução aplicada e o que ainda falta destravar.

## Status (2026-05-23)

- **Bloqueio 1, autenticação (resolvido).** A Tauga refez a base de teste com
  dump da produção. Novos parâmetros:
  - `ODOO_URL = https://grupojht.teste.tauga.online`
  - `ODOO_DB  = teste_grupojht`
  - `ODOO_USER = joaozanini` (mesmo da prod)
  - `ODOO_PASS = 123456` (senha de teste, NÃO é a de prod)

  E2E validado em `scripts/e2e/test-write-partner.ts`: auth uid=11, create
  `res.partner` id=16426 + snapshot completo + cleanup, tudo verde.
- **Bloqueio 2, base sem módulos de operação (parcial).** A base de teste
  hoje só tem `res.users` (41), `res.partner` (6531) e `pedido.operacao`
  (119, com 1 só `url_api` preenchido, `prospecto_teste`). Os modelos
  `product.product`, `stock.quant`, `account.move`, `sale.order`,
  `purchase.order` **não existem**. Sem isso, as ondas seguintes (vendas,
  estoque, financeiro, compras, fiscal, contábil) não podem ser exercidas
  E2E. A Onda 1 (CRM completo, `res.partner` + `crm.*`) é a única que dá
  pra executar sem depender desse refresh.
- **Próximo passo com a Tauga.** Mandar a lista de write tools da F4 Onda 2
  para eles (a) garantirem que a base de teste passe a ter os módulos
  correspondentes, (b) preencherem os `url_api` em `pedido.operacao` para
  cada tipo de documento que vamos escrever, (c) confirmarem que o usuário
  de integração pode chamar `tauga_api_post` na base de teste.
- **Defesa do nosso lado.** `clientFromEnv("write")` agora exige todas as
  `ODOO_WRITE_*` preenchidas (sem fallback silencioso para `ODOO_*` de
  produção). Se faltar qualquer uma, lança erro e a tool falha de forma
  alta. Vide `src/worker/odoo/client.ts:292-312` e o teste em
  `src/worker/odoo/__tests__/client-writes.test.ts` ("sem fallback para
  ODOO_*"). Aplicado em 2026-05-23.

## 1. Contexto

A Tauga forneceu o script `teste_integracao_odoorpc_grupojht.py`, que mostra
como integrar com o Odoo via API: biblioteca `odoorpc`, protocolo
`jsonrpc+ssl` na porta 443, e a chamada de escrita
`execute_kw(OBJETO, 'tauga_api_post', kwargs={url_api, dados_api})`.

A escrita do MCP (F4 Onda 2) deve ser validada na base de **teste**
`grupojht.teste.tauga.online` antes de ir para produção. Não temos (nem
teremos) acesso ao banco de dados; todo acesso é pela API.

## 2. O que foi testado

Sondas JSON-RPC contra `https://grupojht.teste.tauga.online/jsonrpc`:

- `common.version` → responde: **Odoo 17.0**, o servidor está no ar.
- `db.list` (RPC) → `Access Denied`.
- `/web/database/list` (controller web) → `Access Denied`.
- `/web/session/authenticate` com db inexistente → `Database not found`.
- `common.authenticate` em ~21 nomes de banco candidatos
  (`grupojht_teste`, `grupojht-teste`, `grupojht_test`, `grupojht_homolog`,
  `teste`, etc.) → todos retornam **"banco de dados ... não existe"**, exceto
  um: `grupojht`.
- `common.authenticate` no banco `grupojht`, com o usuário `joaozanini` e
  também com o usuário de produção → **ambos falham com o mesmo erro** (ver
  abaixo).

Comparação de controle: a base de **produção** (`grupojht.tauga.online`,
banco `grupojht`) autentica normalmente pela mesma API, com o mesmo usuário.
Logo, o problema é específico da instância de teste.

## 3. Erro encontrado

Toda tentativa de autenticar na base de teste retorna, da própria API:

```
ERRO: permissão negada para esquema public
```

Características do erro:

- É um erro de **Postgres**, não do Odoo.
- Acontece **antes** da validação de login (na primeira consulta que o Odoo
  faz à tabela de usuários). Por isso falha para **qualquer** usuário.
- Não é credencial errada e não é nome de banco errado: o banco `grupojht`
  existe no host de teste, mas o papel (role) Postgres que a instância de
  teste do Odoo usa para se conectar a esse banco **não tem privilégio no
  schema `public`**.

## 4. Diagnóstico

O role de Postgres usado pela instância de teste do Odoo perdeu (ou nunca
teve) `USAGE`/`CREATE` no schema `public` do banco `grupojht`. É o sintoma
clássico de:

- base restaurada de um dump com mapeamento de role/owner diferente, ou
- Postgres 15+, onde o schema `public` deixou de conceder privilégio por
  padrão a quem não é o dono.

Sem isso, nenhuma query roda — daí a API inteira ficar inacessível.

## 5. Segundo ponto: a escrita via `tauga_api_post`

Mesmo com a autenticação corrigida, a escrita ainda depende de configuração.
A API de escrita (`tauga_api_post`) é roteada pelo campo `url_api` das
operações de pedido (`pedido.operacao`). Verificado em produção: **nenhuma**
operação tem `url_api` preenchido. Ou seja, não há endpoint de integração
configurado. Para testar a escrita na base de teste, a Tauga precisa
preencher os `url_api` (ex.: `venda_teste`, `compra_teste`, `prospecto_teste`,
como no script de exemplo).

## 6. Texto para enviar à equipe técnica da Tauga

> **Assunto: Base de teste `grupojht.teste.tauga.online` — erro de permissão
> impede qualquer autenticação via API**
>
> Pessoal, estamos integrando com a base de **teste** pela API JSON-RPC do
> Odoo, do mesmo jeito que o script de integração que vocês nos passaram
> (`odoorpc`, `jsonrpc+ssl`, `execute_kw`). Contra a base de **produção**
> (`grupojht.tauga.online`) funciona normalmente. Contra a base de **teste**,
> qualquer tentativa de autenticar falha.
>
> **O erro exato retornado pela API, em toda tentativa de login:**
>
> ```
> ERRO: permissão negada para esquema public
> ```
>
> **O que já verificamos do nosso lado:**
> - O servidor de teste responde (Odoo 17.0, JSON-RPC ativo).
> - O erro acontece com **qualquer usuário** e com o nome de banco correto. O
>   único banco que existe nesse host é o `grupojht`.
> - O erro é de **Postgres**, não do Odoo: estoura **antes** da validação de
>   login, na primeira consulta à tabela de usuários. Não é credencial errada,
>   é permissão de banco.
>
> **Diagnóstico:** o papel (role) de Postgres que a instância de teste do
> Odoo usa para se conectar ao banco `grupojht` **não tem privilégio no schema
> `public`**. Típico de base restaurada de dump ou criada no Postgres 15+.
>
> **O que precisamos que vocês façam na base de teste** (no Postgres da
> instância de teste, conectados ao banco `grupojht`, como superusuário):
>
> ```sql
> GRANT USAGE, CREATE ON SCHEMA public TO <role_do_odoo>;
> GRANT ALL ON ALL TABLES    IN SCHEMA public TO <role_do_odoo>;
> GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO <role_do_odoo>;
> ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO <role_do_odoo>;
> ```
>
> O mais simples e definitivo costuma ser garantir que o schema `public`
> pertença ao role do Odoo:
>
> ```sql
> ALTER SCHEMA public OWNER TO <role_do_odoo>;
> ```
>
> Não precisamos de acesso ao banco de vocês — só que a base de teste passe a
> autenticar pela API, como a de produção já faz.
>
> **Segundo ponto, depois que a autenticação voltar:** para conseguirmos
> testar a **escrita** (criação de documentos via `tauga_api_post`), precisamos
> que vocês configurem os endpoints de integração na base de teste, ou seja,
> preencham o campo `url_api` nas operações de pedido (`pedido.operacao`) que
> vamos usar — por exemplo `venda_teste`, `compra_teste`, `prospecto_teste`,
> como no script de exemplo. Hoje, em produção, nenhuma operação tem `url_api`
> configurado. E, se possível, confirmem que o usuário de integração pode
> chamar `tauga_api_post` na base de teste e nos enviem a documentação do
> formato do `dados_api` por tipo de documento.
>
> Resumindo: **(1)** corrigir a permissão do schema `public` na base de teste
> para a API voltar a autenticar, e **(2)** configurar os `url_api` de teste
> nas operações para podermos exercer a escrita.
