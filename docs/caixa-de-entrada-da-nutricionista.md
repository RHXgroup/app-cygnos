# A caixa de entrada da nutricionista

**Para quem for mexer no sistema web.** O app do paciente já manda pedido de
contato. Do lado de lá não existe tela que os receba — então o pedido sai do
aparelho, entra na tabela, e fica lá. O funil inteiro para nesse ponto.

Este documento é o que falta, e só isso. Nada aqui pede mudança no app.

---

## O que já existe e não precisa ser criado

Tudo isto está no banco e o app já usa:

```
solicitacoes_de_vinculo
  id
  conta_app_id        -- quem pediu (app_contas.id)
  nutricionista_id
  mensagem            -- a frase que o paciente escreveu, opcional
  status              -- 'enviada' | 'aceita' | 'recusada' | 'cancelada'
  criada_em
  respondida_em
```

Funções que o **app** chama, e que o sistema web não deve usar:

| função | quem chama |
| --- | --- |
| `app_solicitar_vinculo(p_nutricionista_id, p_mensagem)` | app |
| `app_minhas_solicitacoes()` | app |
| `app_cancelar_solicitacao_vinculo(p_id)` | app |

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

---

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

**Uma porta aberta demais.** `app_nutricionistas` responde sem login: com a
chave pública do app, sem sessão nenhuma, voltam todas as nutricionistas com
nome, CRN e cidade. As funções mais novas já barram o `anon` corretamente.

```sql
revoke all on function public.app_nutricionistas() from anon;
```

`revoke ... from public` não basta — o Supabase concede EXECUTE a `anon`
explicitamente, e o revoke precisa nomeá-lo.
