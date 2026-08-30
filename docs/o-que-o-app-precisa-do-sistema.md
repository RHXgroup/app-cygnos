# O que o app precisa do sistema

Tudo o que falta no aplicativo do paciente para alcançar Dietbox, WebDiet e
Nutrium **começa no banco**, não aqui. Este documento é a lista do que o repo do
sistema precisa entregar, em ordem, e o que o app já tem pronto esperando.

Cada item diz três coisas: **o que quebra hoje**, **o que precisa existir do lado
de lá** e **o que o app já tem**. Quem escreve a migração não precisa abrir o
código do app para saber o que devolver.

Convenção: as funções que o app chama são `security definer` e recebem o
paciente pela sessão — o app **nunca** manda `paciente_id`. Ver
`lib/nutricionista.ts` e `lib/conteudoNutri.ts`.

---

## Parte 1 — Consertos (dias, não semanas)

### 1.1 As logos das nutricionistas não carregam

**Hoje:** três das seis fichas do catálogo respondem `Object not found` ao
tentar assinar. O caminho gerado é
`avatares/documentos/<id>/logo_doc.jpeg`, e a listagem do bucket `avatares` só
mostra a pasta `avatares` — a pasta `documentos` não aparece.

O Supabase devolve a mesma mensagem para "não existe" e para "você não pode ver",
de propósito. Então são duas hipóteses, e a verificação é olhar o bucket no
painel:

- existe a pasta `documentos` → é **permissão**: a policy de `storage.objects`
  cobre o prefixo `avatares/` e não cobre `documentos/`
- não existe → o sistema está **gerando caminho para arquivo que não subiu**

**Precisa:** o sistema parar de montar URL pública para bucket privado.
`getPublicUrl` devolve um endereço que o servidor recusa com `Bucket not found`.
Troque por `createSignedUrl` na origem, como o app já faz.

**Cuidado que o Helton pediu por escrito:** não mover, não renomear, não copiar
arquivo nenhum enquanto relatórios e PDFs antigos não forem conferidos. Assinar
na origem resolve **sem tocar em arquivo**. Separar bucket público de privado é
outra decisão, para outro dia, e aí a ordem é copiar → apontar → conferir →
só então apagar.

**O app já tem:** assina por conta própria o que consegue (`lib/nutricionista.ts`),
e desenha as iniciais no que falhar. Quando o sistema assinar na origem, o app
continua funcionando sem mudar uma linha.

### 1.2 O fuso das consultas marcadas

**Hoje:** `app_horarios_livres` devolve `dia` e `hora` prontos, no fuso da
**nutricionista** — certíssimo, porque é o fuso em que a consulta acontece.
`app_minhas_consultas` devolve só `data_hora`, e o app formata no fuso do
**aparelho**. Duas réguas na mesma tela. Só aparece com paciente viajando, mas
aparece.

**Precisa:** `app_minhas_consultas` devolver também:

| coluna | formato | observação |
| --- | --- | --- |
| `dia` | `YYYY-MM-DD` | dia local da nutricionista |
| `hora` | `HH:MM` | hora local da nutricionista |

É uma linha no `SELECT`, igual à que `app_horarios_livres` já faz.

**O app já tem:** tudo. Recebendo os dois campos, apaga-se `consultaLegivel` e
`consultaCompacta` de `lib/agenda.ts` e o app para de fazer conta de data.

### 1.3 A recusa some calada

**Hoje:** quando a nutricionista recusa, a linha para de voltar em
`app_minhas_consultas`. O pedido desaparece da tela e o paciente fica esperando
uma resposta que já chegou.

**Precisa:** devolver a consulta recusada **pelo menos uma vez**, com status
próprio (`recusada`), e um campo opcional de motivo. O app decide quando parar de
mostrar.

**Precisa também:** a lista fechada de valores que a coluna `status` pode assumir,
escrita em algum lugar. Hoje o app conhece `solicitada`, `pendente` e
`confirmada`.

**O app já tem:** `estadoDaConsulta` cai num genérico para qualquer palavra
desconhecida, então uma quarta não derruba a tela. Mas o genérico só sabe dizer
"confirme com a sua nutricionista" — para a tela explicar a recusa de verdade, o
status precisa chegar.

### 1.4 Duas portas mais abertas do que precisam

`app_nutricionistas` responde **sem login**, e as fotos podem ser assinadas com a
chave anônima — que viaja dentro do APK. As outras funções da agenda exigem
autenticação, como deveriam.

Não é vazamento grave: é informação profissional pública. Mas o app só mostra o
catálogo depois do login, então a permissão está mais larga que o uso. Se um dia
a vitrine for pública de propósito (site, link compartilhável), que seja um
endereço público desenhado para isso — não a chave do aplicativo.

**Ainda aberta em 29/08/2026.** Conferido chamando a função com a chave pública
e sem sessão nenhuma: voltaram as seis nutricionistas com nome, CRN e cidade. As
funções novas — pedido, mensagem — já respondem `permission denied` a `anon`,
então o padrão certo está sendo seguido; falta só a antiga.

```sql
revoke all on function public.app_nutricionistas() from anon;
```

`revoke ... from public` não basta: o Supabase concede EXECUTE a `anon`
explicitamente, e o revoke precisa nomeá-lo.

---

## Parte 2 — O funil (a razão de o app existir)

### 2.1 Solicitação de contato do paciente — ENTREGUE

Existe `solicitacoes_de_vinculo`, com `app_solicitar_vinculo(p_nutricionista_id,
p_mensagem)`, `app_minhas_solicitacoes()` e `app_cancelar_solicitacao_vinculo(p_id)`.

No app: o cartão do catálogo virou botão, abre a ficha dela com um campo de
frase opcional, e "Meus pedidos" fica acima da lista com o estado de cada um e o
desfazer. Ver `lib/solicitacoes.ts` e `NutricionistasScreen`.

As regras que ficaram valendo, porque valem para os dois lados:

- **Sem limite de quantas profissionais** ele procura — consultar três antes de
  escolher é o normal, e é direito dele. O que o banco impede é um segundo
  pedido EM ABERTO para a MESMA pessoa.
- **A direção é de mão única.** Ela não navega paciente, não busca ninguém e não
  vê quem usa o app: enxerga quem pediu por ela e quem já é dela. Nenhuma função
  lista paciente solto, e essa é uma decisão de produto, não uma pendência.
- **Solicitação não é vínculo.** O vínculo nasce quando ela aceita, e só então.
- **Recusa não trava o cartão.** Pedir de novo depois de um "não" é direito
  dele; só o pedido em aberto bloqueia.

**Falta do lado do sistema:** a caixa de entrada dela — a tela onde os pedidos
chegam e são aceitos ou recusados. Sem ela, o pedido sai do app e não chega a
lugar nenhum que alguém olhe.

### 2.2 Um vínculo ativo, com história

**Decidido:** um paciente tem **uma** nutricionista ativa. Trocar é permitido;
ter duas ao mesmo tempo, não.

**Precisa:** que isso seja **garantia do banco**, e não esperança do app. Hoje
nada impede dois vínculos, e o app assume que só existe um — ele lê a primeira
linha que voltar e esconde o resto em silêncio.

- índice único parcial sobre os vínculos ativos
- vínculo com `inicio` e `fim`, e não apagado na troca

**A decisão que falta:** o que o paciente enxerga do histórico da anterior. As
três saídas possíveis:

1. **ele continua vendo, a nova não vê** ← recomendada, e a que o Helton escolheu
2. ele continua vendo e a nova também
3. some junto com o vínculo

Hoje o app cairia na **3 por acidente**, porque busca "o conteúdo da
nutricionista" pelo vínculo atual. O histórico de saúde é dele e ele não pode
perder o acesso ao próprio corpo medido; a nova profissional não deve herdar a
ficha que outra levantou. Se ele quiser compartilhar, que seja um ato dele.

**Sobre o plano ao fim do vínculo:** ele **congela**, não some e não é revogável.
Vira "plano prescrito por Fulana, de 12/03 a 28/08 — encerrado": legível, fora
das metas do dia, fora do cartão de próxima refeição. Isso protege a
nutricionista mais do que um botão de desabilitar, porque ninguém segue como
orientação atual uma prescrição que a tela declara encerrada — e é automático, não
depende de ela lembrar de clicar.

---

## Parte 3 — Alcançar os concorrentes

Em ordem de valor por esforço. As três primeiras são o que separa o Cygnos dos
dois maiores do Brasil.

### 3.1 Mural de avisos — JÁ EXISTE no app, numa versão derivada

**Não comecem por aqui.** O app já tem a tela (`AvisosScreen`) e o sino já
funciona, sem depender de nada do sistema.

Como: `lib/avisos.ts` guarda no aparelho um retrato do que a pessoa viu na última
visita — quais consultas, em que status, qual vínculo, qual plano — e compara
com o que está lá agora. A diferença é o aviso. Vínculo novo, plano novo, pedido
aceito, consulta que ela marcou, pedido ainda esperando resposta.

**O que a versão derivada não faz**, e é o que a tabela resolveria um dia:

- não avisa com o app fechado (sem push, o aviso nasce quando a pessoa abre)
- não vê o que aconteceu e desaconteceu entre duas visitas
- não sabe de nada que o app não lê — comentário no diário, mensagem, receita

**Se um dia a tabela de eventos existir**, `carregarAvisos` troca de fonte e as
telas continuam iguais. Mas ela deixou de ser bloqueio, e há coisa mais urgente
na frente.

**O que ela ainda precisa do sistema:** a recusa (item 1.3). Hoje a tela sabe
dizer "a sua consulta mudou" para um status que não conhece, mas não sabe dizer
que foi recusada — porque o status não chega.

### 3.2 O laço do diário — ela vê e comenta o que ele comeu

**Esta é a maior lacuna competitiva.** É a funcionalidade central do Dietbox e do
WebDiet, e é a mesma nos dois: o paciente fotografa a refeição, manda, e a
nutricionista comenta.

O Cygnos registra o que a pessoa comeu — mas esse registro **morre no aparelho
dela**. Ninguém do outro lado vê, ninguém responde. É o que separa um diário de
um acompanhamento, e é a razão pela qual o paciente volta ao app amanhã.

**Precisa:**

- bucket privado para foto de refeição, com URL **assinada** (ver 1.1 — não
  repita o erro do `getPublicUrl`)
- coluna de foto em `app_consumo_itens`, ou tabela irmã
- tabela de comentários da nutricionista sobre um item ou um dia
- leitura do diário do paciente do lado do sistema

**O app já tem:** o diário inteiro, a captura e o redimensionamento de imagem
(`lib/avatar.ts` já faz escolher → recortar → reduzir → enviar) e a tela de
refeições do dia.

### 3.3 Receitas da nutricionista — ENTREGUE

`app_receitas_da_nutricionista()` devolve o que ela publicou, e a tela mora
dentro da ficha dela (`ConteudoNutriScreen`). Ver `lib/receitasDaNutri.ts`.

**Falta:** ligar a receita à REFEIÇÃO do plano. Hoje ela chega como lista solta,
e o valor real é abrir o almoço de quinta e ver o que fazer com aqueles
ingredientes.

### 3.4 Exames laboratoriais — ENTREGUE

`app_exames_do_paciente()`, com os arquivos assinados por `lib/arquivos.ts` —
bucket privado, endereço assinado, nunca `getPublicUrl`. Ver `lib/exames.ts`.

### 3.5 Conversa livre — ENTREGUE

`app_mensagens` com RLS pelo par vinculado, `app_enviar_mensagem(p_texto)`,
`app_marcar_mensagens_lidas()`. **Dentro do sistema, não no WhatsApp** — a
conversa é parte do acompanhamento e é a prova de que o paciente veio pelo
aplicativo.

Três decisões que ficaram, e que o lado de lá precisa respeitar:

- **Ler é direto na tabela, escrever é por função.** O realtime entrega o que a
  política deixa ler, então a leitura precisa passar por RLS. Escrever passa por
  função porque é lá que o vínculo é conferido e que se decide de quem é a
  mensagem — se `de` viesse do cliente, um lado poderia se passar pelo outro.
- **O canal é escolha dela**, no parâmetro `canal_de_contato`. O padrão é o
  sistema, e nesse caso o banco **não devolve o telefone dela ao app**. Só com
  `'whatsapp'` o número vem, e aí o app mostra o botão verde.
- **`lida_em` é do banco**, e é o que faz o ponto de "mensagem nova" valer entre
  aparelhos: o que ele leu no celular não pisca de novo no tablet.

**Falta:** push. Sem ele, a mensagem que chega com o app fechado só aparece na
próxima abertura — o realtime cobre o app aberto, e nada cobre o resto. É a
maior lacuna que sobrou desta parte.

### 3.6 Videoconsulta e pagamento

Os dois maiores em esforço, e os dois com dependência externa (provedor de vídeo,
provedor de pagamento). Ficam por último de propósito.

O pagamento conversa com a decisão da **mensalidade no perfil da nutricionista**:
valor padrão puxado do acordo dela, com a opção de um valor específico para quem
vem pelo aplicativo. Campo **estruturado**, nunca texto livre — "a partir de R$
250", "pacote 4x" e "sob consulta" na mesma coluna deixam a lista impossível de
comparar e de ordenar. E um valor próprio do app é, de quebra, a prova de origem
mais limpa que existe.

---

## O que já está pronto do lado do app

Para o time do sistema saber o que **não** precisa pedir:

- pedir e cancelar consulta, com a agenda dela dentro do app
- catálogo de nutricionistas com foto, CRN, especialidade e cidade
- ficha do acompanhamento: anamnese, antropometria, evolução fotográfica, plano,
  cálculo energético
- diário alimentar com macros e micronutrientes
- água, sono, peso, metas e relatórios
- lista de compras e lembrete de refeição
- código de vínculo e exclusão de conta

- avisos do sino, derivados do que mudou desde a última visita
- pedido de contato do paciente, com "meus pedidos" e desfazer
- conversa dentro do app, com realtime e marca de lida
- receitas dela e exames laboratoriais

Todas as telas que mostram dado do sistema releem sozinhas ao voltar do segundo
plano e aceitam puxar-para-atualizar.

**Realtime existe agora, em um lugar só:** `app_mensagens`. Todo o resto continua
descobrindo o que mudou por releitura. Se o sistema quiser que outra coisa chegue
na hora, isso precisa ser dito aqui — e precisa de política de RLS na tabela, não
só de uma função.
