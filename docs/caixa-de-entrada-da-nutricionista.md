# A caixa de entrada da nutricionista

**Para quem for mexer no sistema web.**

> **Estado em 30/08/2026:** as seis funções pedidas aqui **já existem** no banco
> — conferidas uma a uma, com a assinatura exata. O que sobrou de aberto está
> marcado como tal, e são duas coisas que só se conferem testando de ponta a
> ponta: se o aceite cria o vínculo, e se a RLS deixa ela ler as mensagens.
>
> O resto do documento fica como está: é o contrato, e ele continua valendo
> para quem for mexer nisso depois.

Nada aqui pede mudança no app.

---

## O que já existe e não precisa ser criado

Tudo isto está no banco e o app já usa:

Os nomes abaixo foram conferidos **coluna por coluna contra o banco**, e não
tirados da memória de quem escreveu a migração. A primeira versão deste
documento errou o nome da tabela e o da coluna do paciente; se você leu aquela,
use esta.

```
app_solicitacoes_de_vinculo      -- e NÃO "solicitacoes_de_vinculo"
  id
  conta_id                       -- quem pediu; e NÃO "conta_app_id"
  nutricionista_id
  mensagem                       -- a frase que o paciente escreveu, opcional
  status                         -- 'enviada' | 'aceita' | 'recusada' | 'cancelada'
  criada_em
  respondida_em
```

```
app_mensagens
  id
  conta_id
  nutricionista_id
  de                             -- 'paciente' | 'nutricionista'
  texto
  criada_em
  lida_em                        -- null enquanto o outro lado não leu
```

Funções que o **app** chama, e que o sistema web não deve usar:

| função | quem chama |
| --- | --- |
| `app_solicitar_vinculo(p_nutricionista_id, p_mensagem)` | app |
| `app_minhas_solicitacoes()` | app |
| `app_cancelar_solicitacao_vinculo(p_id)` | app |
| `app_enviar_mensagem(p_texto)` | app |
| `app_marcar_mensagens_lidas()` | app |

Todas recusam `anon`: só respondem a quem está com sessão. O mesmo vale desde
hoje para `app_nutricionistas`, que era a única porta aberta e foi fechada.

### O lado dela — conferido em 30/08/2026, e já existe

Este documento pedia seis coisas e as seis foram entregues. Conferidas uma a
uma contra o banco, com a assinatura exata (nome do argumento errado é falha em
tempo de execução, não de compilação):

| função | argumentos |
| --- | --- |
| `nutri_solicitacoes_recebidas()` | nenhum |
| `nutri_aceitar_solicitacao(p_id)` | `p_id` |
| `nutri_recusar_solicitacao(p_id)` | `p_id` |
| `nutri_conversas()` | nenhum |
| `nutri_enviar_mensagem(p_texto, p_conta_id)` | `p_texto`, `p_conta_id` |
| `nutri_marcar_lidas(p_conta_id)` | `p_conta_id` |

Não há função para LER as mensagens de uma conversa, e isso está certo: a
leitura é direta na tabela com RLS, porque é o que o realtime exige. Ver o item
4 abaixo.

**As duas dúvidas que ficaram foram respondidas em 30/08/2026**, lendo o corpo
no banco: o aceite cria o vínculo, e a política de SELECT em `app_mensagens`
para a nutricionista existe. Nenhum dos dois buracos que eu temia era real.

**Mas apareceu um terceiro, e é o pior dos três.** O vínculo nasce com
`nutricionista_id = auth.uid()` — o uuid de QUEM CLICOU. Aceite feito por
funcionária grava o vínculo apontando para o login dela, e não para a carteira
do consultório. Do lado do app isso é indistinguível de "não vinculou":
`app_nutricionistas` não acha nenhuma nutricionista com aquele uuid, e o
paciente lê "Pedido aceito" e continua sem ninguém na tela.

E é silencioso e intermitente — funciona quando a dona clica, falha quando a
funcionária clica. Ninguém vai suspeitar de quem apertou o botão.

**O contrato é `get_nutricionista_id()`, nunca `auth.uid()`, em toda função que
grava vínculo, mensagem ou resposta de pedido.** A exceção é a política do lado
do PACIENTE, onde `auth.uid()` é o próprio sujeito e está correta — quem for
varrer as policies precisa saber disso, ou derruba o app dele.

Detalhes e o teste que confere a correção estão em
[perguntas-para-o-sistema.md](perguntas-para-o-sistema.md).

---

## O que precisa existir

### 1. A lista de pedidos dela

Uma tela que mostre as solicitações **onde `nutricionista_id` é ela**, com
`status = 'enviada'` em destaque e as já respondidas abaixo.

Cada linha precisa de: nome do paciente, a frase que ele escreveu, e há quanto
tempo pediu. Nada além disso — ela decide com o nome e a frase.

### 2. Aceitar

Aceitar faz **duas** coisas, e as duas na mesma transação:

- `status = 'aceita'`, `respondida_em = now()`
- **cria o vínculo**

Se o vínculo não nascer junto, o paciente vê "Pedido aceito" no app e continua
sem nutricionista — que é a pior combinação possível, porque parece que o app
está quebrado quando o que faltou foi metade da operação.

**Um paciente tem uma nutricionista ativa.** Se ele já tiver vínculo quando ela
aceitar, o aceite precisa falhar com mensagem, e não criar o segundo. O app lê a
primeira linha que voltar e esconde o resto em silêncio — não é ele que vai
proteger essa regra.

### 3. Recusar

`status = 'recusada'`, `respondida_em = now()`. Nada mais. Sem campo de motivo:
recusa com justificativa obrigatória é conversa que ninguém quer ter, e recusa
com justificativa opcional é campo que fica vazio.

O app já sabe mostrar isso — diz "Não pôde atender" e convida a procurar outra.

### 4. Ler e responder a conversa

A tabela `app_mensagens` já recebe o que o paciente escreve — o app grava, e o
realtime entrega ao outro lado na hora. **Não há tela do lado dela**, então a
mensagem chega ao banco e ninguém lê.

Do lado dela é preciso:

- listar as mensagens do par (`conta_id` + `nutricionista_id`), em ordem de
  `criada_em`
- escrever com `de = 'nutricionista'`
- marcar `lida_em` no que o paciente mandou, quando ela abrir a conversa

**Escrever tem que passar por função `security definer`, e não por INSERT
direto.** É lá que o vínculo é conferido e que se decide de quem é a mensagem:
se o `de` viesse do cliente, um lado poderia escrever se passando pelo outro.

**Ler pode ser direto na tabela, com RLS** — e para o realtime funcionar do lado
dela, precisa ser: o realtime entrega o que a política deixa ler, não o que uma
função devolve. É assim que o app faz.

O `lida_em` não é enfeite: é ele que apaga o ponto de "mensagem nova" no
aparelho do paciente, e vale entre aparelhos — o que ele leu no celular não
pisca de novo no tablet.

---

## Três regras que o app já aplica, e que precisam valer dos dois lados

**A direção é de mão única.** Ela não navega paciente, não busca ninguém e não
vê quem usa o app. Enxerga quem pediu por ela e quem já é dela. Não crie tela de
busca de pacientes, nem lista de "pacientes disponíveis" — é decisão de produto,
não lacuna.

**Recusar não bloqueia.** O paciente pode pedir de novo depois de um "não". O
banco impede só um segundo pedido EM ABERTO para a MESMA nutricionista.

**O paciente pode pedir para várias ao mesmo tempo.** Consultar três antes de
escolher é o normal. A caixa dela vai ter gente que também pediu para outras, e
isso não é problema a resolver.

---

## O que o app faz sozinho depois do aceite

Nada precisa ser avisado ao aparelho — não há push. O app descobre relendo:

- ao abrir a tela
- ao voltar do segundo plano
- ao puxar para atualizar

O caso comum é o paciente estar com o app na mão quando ela aceita. A tela do
catálogo, a de mensagens e o sino todas releem ao voltar do segundo plano, então
ele vê em segundos.

**A exceção é a conversa**, que tem realtime de verdade em `app_mensagens`. Se
ela escrever a primeira mensagem logo depois de aceitar, o paciente recebe na
hora, com o app aberto.

---

## O canal de contato

`nutricionistas.canal_de_contato` decide como o paciente fala com ela:

| valor | o que o app faz |
| --- | --- |
| `'sistema'` (padrão) | conversa dentro do app; o banco **não devolve o telefone dela** |
| `'whatsapp'` | mostra o botão verde e o número |

Se o sistema web ganhar uma tela de parâmetros para isso, é este campo. E o
padrão continua sendo `'sistema'` — a conversa é parte do acompanhamento e é a
prova de que o paciente veio pelo aplicativo.

## Duas coisas soltas, do mesmo lado

**As logos não estão no bucket.** Quatro perfis têm `usar_logo_documentos = true`
e `logo_doc_url` preenchido apontando para
`avatares/documentos/<id>/logo_doc.png`, e o servidor responde `Object not
found` para esses caminhos. A foto de rosto, em `avatares/avatares/<id>/foto.jpg`,
abre normalmente.

Não é permissão e não é código do app — o app assina o endereço corretamente
desde a correção de `lib/arquivos.ts`. É arquivo que não subiu ou foi apagado. A
suspeita mais provável é o upload gravar num caminho e a coluna registrar outro;
vale conferir onde o sistema web escreve o arquivo antes de reenviar tudo.

Enquanto não resolver, o app desenha as iniciais num círculo — não fica buraco.

**A porta aberta foi fechada.** `app_nutricionistas` respondia sem login: com a
chave pública do app e sem sessão nenhuma, voltavam todas as nutricionistas com
nome, CRN e cidade. Conferido hoje — agora responde `permission denied`, como as
outras. Fica registrado porque o padrão vale para toda função nova: `revoke ...
from public` não basta, o Supabase concede EXECUTE a `anon` explicitamente e o
revoke precisa nomeá-lo.
