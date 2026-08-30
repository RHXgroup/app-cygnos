# O que só a sessão do sistema web consegue responder

Conferi o que dá para conferir de fora, com a chave pública do app: **quais
funções existem e com que assinatura**, quais tabelas existem, quais colunas
elas têm, e quais estão no realtime. Isso está registrado em
[caixa-de-entrada-da-nutricionista.md](caixa-de-entrada-da-nutricionista.md).

O que sobra depende do **corpo das funções**, das **políticas de RLS** e do
**código do `nutriviet`** — e nada disso é visível daqui. São estas perguntas.
Cada uma diz por que importa e como se responde.

---

## 1. O aceite cria o vínculo na mesma transação?

**Pergunta:** `nutri_aceitar_solicitacao(p_id)` só muda o `status` para
`'aceita'`, ou também cria o vínculo?

**Por que importa:** é o mais caro da lista. Se só mudar o status, o paciente lê
**"Pedido aceito"** no app e continua sem nutricionista nenhuma. Ele vai
concluir que o app está quebrado, quando o que faltou foi metade da operação do
outro lado.

**Como responder:** ler o corpo da função. Ou o teste de ponta a ponta do fim
deste documento.

---

## 2. A RLS de `app_mensagens` deixa ela ler?

**Pergunta:** existe política de `select` em `app_mensagens` para a
nutricionista do par? E ela cobre as duas direções — o que ele escreveu e o que
ela escreveu?

**Por que importa:** escrever ela consegue, porque `nutri_enviar_mensagem`
existe e é `security definer`. **Ler é outra permissão.** Sem a política, a
conversa aparece vazia do lado dela, e o realtime não entrega nada — porque o
realtime entrega o que a política deixa ler, não o que uma função devolve.

Não há função de leitura, e isso está certo: tem que ser direto na tabela,
justamente por causa do realtime.

---

## 3. Alguma coisa escreve em `notificacoes` quando o paciente manda?

**Pergunta:** `app_enviar_mensagem(p_texto)` e
`app_solicitar_vinculo(p_nutricionista_id, p_mensagem)` inserem em
`notificacoes`? Se não elas, existe gatilho nas tabelas que insira?

**Por que importa:** a tabela existe e está no realtime — a infraestrutura para
o aviso chegar sozinho na tela dela está pronta. Mas se ninguém escreve nela,
ela fica vazia para sempre e a nutricionista só descobre a mensagem abrindo a
tela de conversas por conta própria.

Três cenários, e eles dão resultados bem diferentes:

| | resultado |
| --- | --- |
| a função insere | ela recebe, e com realtime chega na hora |
| um gatilho insere | mesma coisa |
| ninguém insere | a tabela fica vazia; só descobre abrindo a tela |

---

## 4. `notificacoes` não tem para onde apontar — como o clique navega?

**O que eu vi:** as colunas são `id`, `nutricionista_id`, `tipo`, `titulo`,
`mensagem`, `lida`, `created_at`. **Não existe** `link`, `url`,
`referencia_id`, `solicitacao_id` nem `mensagem_id`.

**Por que importa:** o aviso consegue dizer *"Nova mensagem de Helton"*, mas
clicar nele não leva a lugar nenhum — a não ser que a tela adivinhe o destino
pelo `tipo`. Com quarenta pacientes, "nova mensagem" sem dizer de qual conversa
vira uma lista para caçar.

É a mesma armadilha que está escrita no AGENTS.md sobre o app: **aviso que não
leva a lugar nenhum é meia informação.**

**A sugestão:** acrescentar uma coluna de referência (`conta_id`, ou um par
`referencia_tipo` + `referencia_id`) **antes** de a tela ser construída em cima
da tabela. Depois custa migração e reescrita da tela junto.

---

## 5. `nutri_conversas()` devolve quantas não lidas?

**Pergunta:** a lista de conversas traz um contador de mensagens com `lida_em`
nulo e `de = 'paciente'`?

**Por que importa:** é o que permite o ponto vermelho na lista dela. Do lado do
paciente isso já existe e usa exatamente essa conta.

---

## 6. O sistema usa realtime, ou só recarrega?

**Pergunta:** a tela de conversas dela assina `postgres_changes` em
`app_mensagens` (e/ou em `notificacoes`), ou só busca quando a página carrega?

**Por que importa:** as três tabelas estão na publicação — testei e as três
respondem `SUBSCRIBED`. Do lado do app a mensagem dela chega sozinha. Se do lado
dela precisar recarregar a página, a conversa fica torta: um lado é instantâneo
e o outro não.

---

## 7. Onde o upload da logo grava, e o que a coluna registra?

**O que eu vi:** quatro perfis têm `usar_logo_documentos = true` e
`logo_doc_url` apontando para `avatares/documentos/<id>/logo_doc.png`. O
servidor responde **`Object not found`** para esses caminhos. A foto de rosto,
em `avatares/avatares/<id>/foto.jpg`, abre normalmente.

**Pergunta:** em que bucket e em que caminho o sistema escreve o arquivo da
logo, e é o mesmo caminho que ele grava na coluna?

**Por que importa:** a suspeita mais provável é gravar num lugar e registrar
outro. Se for isso, reenviar as logos não resolve — volta a acontecer. Não é
permissão e não é código do app: o app assina o endereço corretamente desde a
correção de `lib/arquivos.ts`.

---

## 8. O aceite bloqueia quem já tem nutricionista?

**Pergunta:** se o paciente já tiver vínculo ativo quando ela aceitar, o aceite
falha com mensagem, ou cria o segundo vínculo?

**Por que importa:** a regra é **um paciente, uma nutricionista ativa**. O app
lê a primeira linha que voltar e esconde o resto em silêncio — não é ele que vai
proteger isso. Se nascerem dois, o paciente vê uma das duas, meio aleatoriamente.

---

## 9. Existe tela para o `canal_de_contato`?

**Pergunta:** ela consegue escolher entre conversar pelo sistema ou pelo
WhatsApp em algum lugar?

**Por que importa:** o app já obedece ao campo — no padrão (`'sistema'`) o banco
nem devolve o telefone dela ao aparelho, e só com `'whatsapp'` aparece o botão
verde. Se não houver tela, o campo fica no padrão para sempre, o que **está
certo** e não é urgente. Vale só saber se é intencional.

---

## O teste que responde 1, 2, 5 e 6 de uma vez

Dois minutos, e não precisa ler código nenhum:

1. No app, com uma conta de paciente, mandar um pedido de contato.
2. No sistema, entrar como a nutricionista e **aceitar**.
3. Voltar ao app sem fechá-lo. O vínculo tem que aparecer.
   **Não apareceu → pergunta 1.**
4. Mandar uma mensagem pelo app. Ela tem que aparecer na conversa **no sistema**.
   **Não apareceu → pergunta 2.**
5. Responder pelo sistema. Tem que chegar no app **na hora**, sem tocar em nada.
   **Só chegou depois de recarregar → o realtime do lado do app caiu; me avisa.**
6. Mandar outra mensagem pelo app com a tela de conversas dela ABERTA em outra
   página. Ela tem que perceber sem recarregar.
   **Não percebeu → perguntas 3 e 6.**
