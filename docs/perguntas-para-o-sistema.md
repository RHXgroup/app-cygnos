# O que só a sessão do sistema web consegue responder

> **Sobre os blocos de código deste documento:** os que aparecem dentro de um
> bloco citado (`>`) são TRECHOS do que já existe no banco, colados para mostrar
> um defeito — não são comandos para executar, e vários nem são SQL válido
> porque estão cortados no meio. Comando para rodar está sempre solto, completo,
> e com uma frase antes dizendo o que ele faz.

Conferi o que dá para conferir de fora, com a chave pública do app: **quais
funções existem e com que assinatura**, quais tabelas existem, quais colunas
elas têm, e quais estão no realtime. Isso está registrado em
[caixa-de-entrada-da-nutricionista.md](caixa-de-entrada-da-nutricionista.md).

O que sobra depende do **corpo das funções**, das **políticas de RLS** e do
**código do `nutriviet`** — e nada disso é visível daqui. São estas perguntas.
Cada uma diz por que importa e como se responde.

---

## 1. O aceite cria o vínculo — RESPONDIDA, e apareceu outra coisa

**Pergunta:** `nutri_aceitar_solicitacao(p_id)` só muda o `status` para
`'aceita'`, ou também cria o vínculo?

**Por que importa:** é o mais caro da lista. Se só mudar o status, o paciente lê
**"Pedido aceito"** no app e continua sem nutricionista nenhuma. Ele vai
concluir que o app está quebrado, quando o que faltou foi metade da operação do
outro lado.

**Resposta (30/08/2026, sessão do Nutriviet, lendo o corpo):** cria, sim. A
função tem `insert into app_vinculos (conta_id, nutricionista_id)`. O "Pedido
aceito" não fica órfão.

**Mas o segundo argumento é `auth.uid()`** — o vínculo nasce sob o uuid de QUEM
CLICOU. Se quem aceita é uma funcionária, e não a nutricionista dona da
carteira, o vínculo aponta para o login dela.

**O que isso faz no app**, que é o lado que este documento cobre: `app_vinculos`
passa a ter uma linha cujo `nutricionista_id` não corresponde a nenhuma
nutricionista do catálogo. `app_nutricionistas` junta as duas coisas para
devolver a vinculada — e não acha. **O paciente vê "Pedido aceito" e continua
sem nutricionista na tela**, que é exatamente o sintoma que esta pergunta
existia para evitar, chegando por outro caminho.

Pior: é silencioso e intermitente. Aceite feito pela dona funciona; o mesmo
aceite feito pela funcionária não. Ninguém vai suspeitar de QUEM CLICOU.

**O contrato certo:** o vínculo nasce por `get_nutricionista_id()`, e nunca por
`auth.uid()`.

**CORRIGIDA** — conferido no corpo em 30/08/2026: o insert usa a carteira. As
três funções de pedido estão certas hoje:

| função | estado |
| --- | --- |
| `nutri_solicitacoes_recebidas` | ✔ por carteira |
| `nutri_aceitar_solicitacao` | ✔ por carteira |
| `nutri_recusar_solicitacao` | ✔ por carteira |

---

## 1b. As três funções de mensagem — RESOLVIDAS

Ficaram como abertas por algumas horas neste documento, com base num relato de
que ainda usavam `auth.uid()`. **Estava desatualizado.** O corpo real, lido com
`pg_get_functiondef` em 30/08/2026, mostra as três por carteira:

| função | como resolve a nutricionista |
| --- | --- |
| `nutri_conversas` | `where v.nutricionista_id = (select public.get_nutricionista_id())` |
| `nutri_enviar_mensagem` | `v_carteira uuid := public.get_nutricionista_id()` — e o insert usa `v_carteira` |
| `nutri_marcar_lidas` | `and nutricionista_id = (select public.get_nutricionista_id())` |

Nenhum `auth.uid()` nas três. **As seis funções do lado dela estão por
carteira**, e nada aqui está aberto.

E o corpo mostrou três coisas boas que não estavam sendo pedidas:

- **As três checam `func_pode('{pacientes,acessar}')`.** Carteira certa e
  permissão são coisas diferentes, e as duas estão no lugar.
- **`nutri_enviar_mensagem` confere o vínculo antes de gravar**, e recusa com
  frase em português — "Este paciente não está vinculado a você." Também recusa
  texto vazio. É o mesmo padrão do lado do app, onde a frase do banco é
  repassada em vez de traduzida.
- **`nutri_conversas` já devolve `nao_lidas`**, contando `de = 'paciente' and
  lida_em is null`. Isso responde a pergunta 5 deste documento, que sai da lista.

Uma observação de desempenho, e é só isso — não é defeito: `nutri_conversas`
faz quatro subconsultas correlacionadas por paciente e não tem `limit`. Com
carteira grande isso cresce por multiplicação. Se um dia ficar lenta, é aí.

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

## 5. `nutri_conversas()` devolve quantas não lidas — RESPONDIDA

Devolve: a coluna `nao_lidas` conta `de = 'paciente' and lida_em is null`, que é
exatamente a mesma conta que o app do paciente usa do lado dele. O ponto
vermelho na lista dela tem de onde sair.

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

## O teste que responde 3 e 6, e confere as seis funções de uma vez

As perguntas 1, 1b, 2 e 5 foram respondidas lendo o corpo no banco. O teste
abaixo continua valendo como conferência de ponta a ponta. **Faça o passo 2 com
o login de uma FUNCIONÁRIA**, não com o da dona: é com ele que erro de carteira
aparece, e é o único jeito de provar que a correção pegou.

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
