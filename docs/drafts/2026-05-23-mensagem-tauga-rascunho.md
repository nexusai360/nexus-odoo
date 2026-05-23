# Mensagem para a Tauga (rascunho arquivado)

> Status: rascunho, **não enviar ainda**. Arquivado em 2026-05-23 enquanto
> validamos se a ressalva "documentos criados pela API JSON-RPC oficial
> pulam hooks do `tauga_api_post` e ficam incompletos" é verdadeira ou não.
> Se os testes mostrarem que a rota direta basta, essa mensagem provavelmente
> não precisa ser enviada (ou vira muito mais curta).

---

> Pessoal, fechando alguns pontos da integração com a base de teste
> (`grupojht.teste.tauga.online` / banco `teste_grupojht`):
>
> **1. O que já está funcionando.** Autenticação JSON-RPC com usuário e
> senha funciona normal. Conseguimos `create`/`read`/`unlink` em `res.partner`
> ponta a ponta. Mais importante: depois de copiar o shape de uma venda
> real de produção (47 campos editáveis), conseguimos criar uma
> `pedido.documento` (`tipo=venda`) na base de teste **pela API JSON-RPC
> oficial** (sem usar o `tauga_api_post`). Cleanup ok, registro id=1805
> criado e removido.
>
> **2. Pergunta de implicação.** Documentos criados pela API JSON-RPC
> oficial passam pelo `create()` do modelo, mas pulam o caminho do
> controller `tauga_api_post`. Para vocês está OK isso, ou tem alguma
> rotina (cálculo fiscal, integração externa, hook contábil, geração de
> número de pedido, etc.) que **só roda via `tauga_api_post`** e que
> documentos criados pela rota direta vão ficar incompletos? Concretamente:
> o documento que criei na teste (`pedido.documento` venda) ficou com
> `display_name="sem número"`. Isso é normal pra um documento na etapa
> inicial, ou indica que faltou rodar algum hook que numere?
>
> **3. Sobre o `tauga_api_post`.** Continuamos sem o script de exemplo
> `teste_integracao_odoorpc_grupojht.py`. Pelo que sondamos
> (`AttributeError` ao chamar `tauga_api_post` em qualquer modelo via
> JSON-RPC), confirmamos que ele é um **controller HTTP custom** de vocês,
> não um método de modelo. Se em algum momento a gente precisar usar o
> caminho `tauga_api_post` (caso vocês confirmem em (2) que a rota direta
> deixa documento incompleto), precisaríamos do path HTTP exato, o método
> aceito, e a autenticação esperada.
>
> **4. Sobre as `pedido.operacao` na teste.** Hoje só a operação id=202
> (`prospecto_teste`) tem `url_api`. Para que documentos criados na teste
> disparem o mesmo fluxo externo que disparariam em produção, vocês
> precisariam preencher os `url_api` correspondentes nas operações que
> entrarem no escopo (definidas junto com vocês).
