# O que falta no sistema, e como saber que ficou certo

**Para a sessão do `Nutriviet`.** Três itens. Cada um diz o que está errado hoje,
o que precisa acontecer, e **como conferir** — porque nos três o defeito é
silencioso: nada quebra, ninguém vê erro, e a coisa simplesmente não acontece.

O lado do app já está pronto para os três. Nada aqui pede mudança no
`app-cygnos`.

---

## 1. O catálogo some quando o paciente vincula

**Hoje:** `app_nutricionistas()` devolve todas as ativas quando não há vínculo e
**só a dele** quando há.

**O efeito:** a vitrine some junto com a escolha. E trocar de profissional vira
salto no escuro — ele precisa encerrar para só então poder olhar quem mais
existe, e nesse intervalo está sem ninguém.

**O que fazer:** devolver sempre todas as ativas, com a flag `vinculada`
marcando qual é a dele. A flag **já existe** na resposta e o app **já a lê**.

Não muda a regra de um vínculo ativo. Muda a diferença entre "não pode ter duas"
e "não pode nem ver as outras".

### Como validar

```sql
-- Como um paciente COM vínculo (rode com a sessão dele, não no editor como dono):
select nome, vinculada from app_nutricionistas();
```

- **Certo:** várias linhas, exatamente uma com `vinculada = true`.
- **Errado:** uma linha só.

E no app: com vínculo, a tela "Nutricionistas" tem que listar todas, com a dele
em destaque. Hoje ela mostra a ficha de uma só.

> **Cuidado com a ordem.** O app lê a flag **linha a linha**, não da primeira —
> foi corrigido ontem justamente porque as nutricionistas vêm em ordem de nome e
> a dele dificilmente é a primeira. Se a função devolver a flag só na primeira
> linha, ou repetida em todas, o app mostra a nutricionista errada como sendo a
> dele. A flag precisa ser verdadeira **apenas** na linha dela.

---

## 1b. A pré-visualização precisa dizer a verdade — e virou pré-requisito

**O que mudou:** o telefone da nutricionista passou a aparecer no app quando ela
tem `mostra_telefone_no_app = true`. Antes só saía com `canal_de_contato =
'whatsapp'`, e por isso não aparecia para ninguém.

**Por que isso torna a prévia urgente.** Hoje o cartão *"E isso que um estranho
vê"* **mente nas duas direções**: promete o telefone (que o app não mostrava) e
omite o que o app mostra — "Acompanha você", "Agendar consulta", "Conversar".

Enquanto ela mente, a chavinha do telefone é consentimento no escuro: a
profissional liga, confere numa prévia que não corresponde, e o número vai para
um catálogo que ela nunca viu de verdade.

**Uma leitura que pesa na decisão:** as 12 profissionais têm
`mostra_telefone_no_app = true`, **nenhuma** com `false`, **nenhuma** nula. Esse
padrão — 12/0/0 — quase sempre quer dizer valor escrito por padrão do sistema, e
não escolha de cada uma. A chavinha aparece no painel delas com o rótulo
"fica visível para qualquer pessoa", então quem abriu aquela tela viu; quem
nunca abriu, não.

Foi por isso que o Helton decidiu publicar **e** deixar a opção com elas: a saída
não é esconder o número, é fazer a prévia mostrar a verdade para a escolha ser
informada.

**O que fazer:** a prévia renderiza exatamente o que `app_nutricionistas()`
devolve, com os mesmos elementos do cartão do app. Se um dado não sai da função,
não aparece na prévia.

### Como validar

Ligar e desligar cada chavinha e conferir que a prévia acompanha. E o teste que
fecha: abrir o app com uma conta de paciente e comparar lado a lado. **Qualquer
diferença é defeito da prévia**, não do app — o app mostra o que a função manda.

---

## 2. `app_desvincular(p_paciente_id)` ainda apaga em vez de encerrar

**Hoje:** o corpo faz `delete`. E `app_vinculos` é uma **view** sobre
`app_vinculos_historico` filtrando `fim is null` — view simples repassa o delete
para a tabela, então o `delete` **apaga a linha do histórico**.

Com a linha somem as datas do acompanhamento, e o plano nunca vai conseguir
congelar como *"prescrito por Fulana, de 12/03 a 28/08 — encerrado"*.

**Isto já aconteceu.** A primeira versão da função do lado do paciente fazia o
mesmo, e apagou histórico antes de ser corrigida.

**O que fazer:** trocar o `delete` por

```sql
update app_vinculos_historico
   set fim = now()
 where <a mesma cláusula que o delete usava> and fim is null;
```

Eu **não escrevi essa cláusula** de propósito: não vi o corpo da função. Ela
resolve a carteira por `get_nutricionista_id()`, e eu não sei se filtra o
paciente por `paciente_id` ou por `conta_id`. Um `update` com a cláusula errada
não apaga e não encerra nada — **falha em silêncio**, que é pior que o defeito
atual. Quem tem o corpo na mão resolve em dois minutos.

### Como validar

O `delete` na view **já foi revogado**, então a função atual não deve nem
conseguir apagar:

```sql
-- Antes de mexer: a função de hoje deve FALHAR, não apagar.
-- Se ela ainda apagar, o revoke não pegou e isso é mais urgente que o resto.
```

Depois de corrigida, encerrando um paciente pelo sistema:

```sql
select conta_id, nutricionista_id, criado_em, fim, motivo
  from app_vinculos_historico
 order by criado_em desc limit 5;
```

- **Certo:** a linha continua lá, com `fim` preenchido.
- **Errado:** a linha sumiu.

E: `select count(*) from app_vinculos where conta_id = '<o paciente>'` tem que
voltar zero, porque a view filtra `fim is null`.

---

## 3. O motivo de quem encerrou não aparece para ela

**Já existe:** `app_vinculos_historico.motivo`, preenchido pelo paciente ao
encerrar. É opcional, e a tela do app avisa antes de ele escrever: *"Quer dizer
o motivo? Ela vai poder ler."*

**Decisão do Helton:** ela lê. Não há chavinha de "mandar para ela?" — o campo
ser opcional já é a escolha, e motivo que ninguém lê é desabafo, não retorno.

**O que fazer:** mostrar em algum lugar do lado dela — ao lado do paciente que
saiu, ou numa lista de encerramentos. Junto com a data do `fim`.

### Como validar

```sql
select conta_id, fim, motivo
  from app_vinculos_historico
 where fim is not null and motivo is not null
 order by fim desc limit 5;
```

Se houver linhas aqui e a tela dela não mostrar nada, o dado está chegando e
ninguém está lendo — que é o estado de hoje.

**Texto em branco não vira linha:** a função grava `null` quando a pessoa não
escreve nada. Uma tela que mostre "Motivo: " vazio está lendo string vazia de
algum lugar que não é esta função.

---

## O teste de ponta a ponta, que cobre os três

1. Paciente **com vínculo** abre "Nutricionistas" no app.
   → tem que ver **todas**, com a dele marcada. **Falhou → item 1.**
2. Ele encerra, escrevendo um motivo.
3. `select * from app_vinculos_historico order by criado_em desc limit 1`
   → linha **presente**, com `fim` e `motivo`. **Sumiu → item 2.**
4. No sistema, a nutricionista vê que ele saiu e o motivo. **Não vê → item 3.**
5. Ele volta ao app e pede contato para outra.
   → tem que funcionar sem desvincular de novo.

---

## Uma coisa que não é item, mas vale saber

`app_desvincular_minha_nutricionista(text)` — a do paciente — **executa sem
sessão**. Ela tem guarda interna e o anônimo bate em "Você precisa estar
logada", então não é buraco aberto. Mas a permissão está mais larga que o uso, e
a causa é a mesma de sempre neste projeto:

```sql
-- não basta, porque a concessão padrão do Supabase é para PUBLIC:
revoke all on function public.f() from anon;

-- o que fecha:
revoke all on function public.f(text) from public, anon;
grant execute on function public.f(text) to authenticated;
```

Com a assinatura, e tirando dos dois. Vale para toda função nova.
