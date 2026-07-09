# Banco de dados , como não quebrar (ler antes de mexer em schema)

> Escrito em 2026-07-09, depois de auditar dev e produção de ponta a ponta.
> Produção estava (e está) íntegra. O banco de **dev** tinha acumulado sujeira
> silenciosa que um dia ia cobrar caro. As regras abaixo existem para que isso
> não volte.

## Checagem rápida

```bash
python3 scripts/db-health.py          # banco de dev
python3 scripts/db-health.py --prod   # banco de produção (read-only)
```

Sai com código 1 se achar problema, então pode entrar em CI ou virar hábito
antes de um deploy. O que ele não cobre é o **drift** (a estrutura real do banco
divergindo do `schema.prisma`), que o próprio Prisma mede:

```bash
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma
# "No difference detected." = ok
```

---

## As duas regras que evitam 90% da dor

### 1. Migration aplicada é imutável. Nunca edite.

Se uma migration já rodou em qualquer banco, o arquivo dela está congelado.
Precisa corrigir alguma coisa? **Crie uma migration nova** que faz a correção.

Por que isso importa, com os números reais deste projeto:

- O Prisma guarda um checksum (uma impressão digital) de cada migration que
  aplicou. Editar o arquivo muda a digital.
- `prisma migrate deploy`, que é o que roda em **produção** no boot do container,
  **ignora** a divergência. Ou seja: editar não derruba prod, e é justamente por
  isso que o problema passa despercebido.
- `prisma migrate dev`, que é o comando que se usa para **criar uma migration
  nova**, se recusa a rodar e responde:

  > The migration `X` was modified after it was applied.
  > We need to reset the "public" schema. **All data will be lost.**

  No nosso dev, "all data" é o cache inteiro do Odoo. Horas de sincronização.

Isso foi verificado experimentalmente, não presumido: num banco descartável,
editar uma migration aplicada deixou `migrate deploy` passar liso e fez
`migrate dev` exigir reset.

**Corolário:** não vale a pena "melhorar" uma migration antiga, nem para torná-la
idempotente. Ela já rodou onde precisava rodar. Um banco novo aplica todas do
zero sem drama (confirmado: as 105 migrations aplicam limpo num banco vazio).

### 2. Toda mudança de schema nasce como migration. Nunca DDL solto.

Nada de `prisma db execute`, nada de `psql -c "ALTER TABLE ..."` no dev "só para
destravar". Foi assim que o banco de dev juntou:

- 11 migrations com checksum divergente (editadas depois de aplicadas);
- 4 registros de tentativas que falharam no meio;
- 1 linha inserida à mão, com o checksum literal `manual-applied`;
- índices com nome trocado e uma coluna com tipo diferente do schema.

Nenhuma dessas coisas quebrava nada no dia a dia. Todas juntas significavam que
o próximo `prisma migrate dev` pediria para apagar o banco.

Se a migration falhar no meio e o banco ficar num estado esquisito, o certo é
resolver o estado e registrar, não contornar com SQL manual.

---

## Receitas

### O deploy trouxe schema novo?

Se a mudança está em `prisma/migrations/`, o entrypoint do container `app` roda
`prisma migrate deploy` no boot e aplica sozinho. Não precisa fazer nada.
Confirme depois:

```bash
python3 scripts/db-health.py --prod
```

### `migrate deploy` falhou numa migration (estado parcial)

Acontece quando o banco já tem o objeto que a migration tenta criar (tipicamente
porque alguém aplicou DDL à mão antes). O Prisma marca a migration como falha e
trava as seguintes.

1. Confirme que o estado que a migration queria criar **já existe** de fato.
2. Marque como aplicada:

```bash
npx prisma migrate resolve --applied <nome_da_migration>
npx prisma migrate deploy
```

3. Depois confira que não sobrou drift:

```bash
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma
```

### O dev acumulou sujeira (checksum divergente, linhas de falha)

Não resete o banco. O estado das tabelas costuma estar certo; o que está velho é
a tabela de controle `_prisma_migrations`. Antes de qualquer coisa, prove que o
estado está certo:

```bash
# 1. as migrations, aplicadas do zero, produzem o schema esperado?
#    (cria um banco descartável, aplica tudo, compara)
npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma

# 2. o banco de dev bate com o schema?
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma
```

Se as duas respostas forem "No difference detected", então é seguro reconciliar
a tabela de controle: apagar as linhas revertidas/duplicadas e atualizar o
checksum de cada migration para o hash do arquivo atual. Foi o que se fez em
2026-07-09, sem perder um único registro do cache.

Se houver drift, corrija o drift primeiro (`migrate diff --script` gera o SQL) e
só então reconcilie.

---

## O que estava errado, e o que foi feito (2026-07-09)

| Onde | Achado | Ação |
|---|---|---|
| Produção | 105/105 migrations aplicadas, zero divergência, zero drift | Nada. Estava íntegra. |
| Migrations do repo | Aplicadas do zero, reproduzem o `schema.prisma` exatamente | Nada. Estão corretas. |
| Dev | 11 checksums divergentes, 4 tentativas falhas, 1 linha manual, drift em 2 índices e 1 coluna | Drift corrigido com o SQL do `migrate diff`; tabela de controle reconciliada. Dados preservados. |

Decisão registrada: **a migration `20260709000000_diretoria_completa` NÃO foi
editada**, apesar de não ser idempotente no `ADD CONSTRAINT`. Ela já rodou em
produção e no dev, um banco novo a aplica sem erro, e editá-la só criaria uma
12ª divergência de checksum, cujo preço é `migrate dev` pedindo reset do dev.
O ganho seria zero. A proteção real é a regra 2 acima: não existir DDL manual
que crie o estado parcial em que ela tropeça.
