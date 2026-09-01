# O que a escada precisa do sistema

**Para a sessão do repositório web.** O app já tem a escada de aceitação pronta:
a lógica, as cores, os desenhos e as duas telas — a da mãe e a que ela vira para
o filho. Ver `src/lib/escadaDaAceitacao.ts` e
`src/screens/RegistrarExposicaoScreen.tsx`, com 140 casos de teste e uma sonda de
20 propriedades.

**Falta a ponte, e ela é toda do lado de lá.** O app tem 37 RPCs e nenhuma toca
planejamento terapêutico. Este documento é o que precisa existir para a mãe
enxergar o plano e registrar em casa.

Contexto e o porquê de cada decisão: `docs/planejamento-terapeutico.md`.

---

## A convenção, que vale para as três

Como todas as outras: **`security definer`, e o app NUNCA manda `paciente_id`.**
O paciente sai da sessão, pelo mesmo caminho de
`app_conteudo_da_nutricionista`. Uma função que aceite o id do paciente como
argumento deixa qualquer pessoa ler o prontuário de qualquer criança.

E a permissão, que já custou duas rodadas aqui (armadilha 14 do `AGENTS.md`): o
Supabase concede EXECUTE a **`PUBLIC`** por padrão, e `anon` herda disso. As duas
formas óbvias rodam com "Success" e não fecham nada. O que fecha:

```sql
revoke all on function public.app_registrar_exposicao(...) from public, anon;
grant execute on function public.app_registrar_exposicao(...) to authenticated;
```

`npm run contrato`, do lado do app, confere depois se cada função existe com a
assinatura exata e se alguma executa sem sessão.

---

## 1. `app_plano_terapeutico()` — a mãe vê o plano

**O que quebra hoje:** a nutricionista prescreve "ofereça cenoura cozida em
cubos, três vezes na semana, em casa" — `atividades_terapeuticas` já nasce com
`ambiente = 'casa'` e `responsavel = 'familia'` — e a mãe sai do consultório com
isso na memória, ou num papel.

**Precisa devolver**, do plano ATIVO do paciente da sessão:

| campo | de onde | por quê |
| --- | --- | --- |
| `objetivo_id` | `objetivos_terapeuticos.id` | chave para registrar depois |
| `alimento` | `alimentos_base.nome` | é o que a tela pergunta: "Como foi com a cenoura?" |
| `alimento_base_id` | idem | vai de volta no registro |
| `preparacao_id`, `preparacao` | `preparacoes_alimento` | "cozida em cubos" — quem aceita cozida recusa crua |
| `texturas_alvo` | `objetivos_terapeuticos` | |
| `orientacoes` | `atividades_terapeuticas` | o que a mãe deve fazer |
| `frequencia` | idem | |
| `status` | `objetivos_terapeuticos.status` | some da lista quando não é `em_andamento` |
| `nome_da_crianca` | primeiro nome do paciente | o botão diz "Mostrar ao Téo", e não "à criança" |

**Só objetivos `em_andamento`.** Objetivo atingido ou encerrado não é tarefa: se
aparecer na lista, a mãe continua oferecendo o que já foi resolvido.

**Não devolva `objetivo_principal` nem `criterio_evolucao`.** Os dois são texto
livre escrito por profissional para profissional, e jargão sobre o filho dela é
pior que silêncio, porque ela não pergunta. O app monta a frase a partir dos
campos estruturados. Ver o commit `6b93f10`.

**O app já tem:** as telas, esperando exatamente estes campos.

---

## 2. `app_exposicoes_do_objetivo(p_objetivo_id int)` — o histórico

**O que quebra hoje:** sem histórico, o app não sabe se é a 1ª ou a 5ª oferta, e
o limite das cinco exposições — o ponto em que o ganho estabiliza e o app **para
de pedir a próxima** — não tem como funcionar.

**Precisa devolver**, para aquele objetivo, do paciente da sessão:

```
data_exposicao, aceitacao, reacao_emocional
```

Só isso. O app calcula o resto (`resumoDoAlimento` em
`src/lib/escadaDaAceitacao.ts`): quantas ofertas, degrau atual, recorde,
direção, e o alerta de duas reações difíceis em três.

**Uma chamada por objetivo é aceitável** — são poucos objetivos ativos. Se
preferir devolver tudo junto com o item 1, melhor ainda: o app se adapta.

**Ordem não importa**, o app ordena. Mas **datas inválidas não precisam ser
filtradas**: o app já descarta o que não dá para ler, sem derrubar a tela.

---

## 3. `app_registrar_exposicao(...)` — a mãe registra em casa

**A peça que muda o tratamento.** Hoje `registros_exposicao` é preenchido por
ela, no consultório, a partir do que a mãe lembra um mês depois.

**Assinatura proposta:**

```sql
app_registrar_exposicao(
  p_objetivo_id      int,
  p_alimento_base_id int,
  p_preparacao_id    int,        -- pode ser null
  p_aceitacao        text,       -- a categoria
  p_reacao           text,       -- pode ser null: a mãe pode pular
  p_observacao       text        -- pode ser null
)
```

**Os valores de `p_aceitacao`**, exatamente estes sete — o app os tem travados
num teste que compara com esta lista escrita à mão, para uma divergência de
grafia quebrar no app em vez de falhar no `insert`:

```
recusou · tolerar · interagir · cheirar · tocar · provar · comer
```

**Os de `p_reacao`:** `positiva`, `neutra`, `negativa`. O app oferece três
opções, não quatro — `agitada` continua existindo para quando **ela** registra.
Juntar não quebra o alerta de vocês, que trata `negativa` e `agitada` como a
mesma coisa.

**O que a função deve preencher sozinha:**

- `data_exposicao` = hoje
- `ambiente` = `'casa'`
- `passos_alcancados` = **vazio**. A mãe não vai distinguir o passo 22 do 23 no
  fim de uma refeição, e obrigá-la a isso produziria número inventado. A
  categoria basta; o passo exato é ela quem crava na consulta.

**Recusar precisa ser aceito como registro normal.** `aceitacao = 'recusou'` com
`passos_alcancados` vazio é o degrau 1 da Escalada, não uma linha vazia — se a
função rejeitar ou ignorar, os dias de recusa somem e o progresso de quem só
recusou aparece inflado.

---

## A pergunta que é decisão de vocês, não minha

**O registro da mãe entra no prontuário com o mesmo peso que o dela?**

Recomendo que **não** — que exista uma marca de origem (`'familia'` /
`'consultorio'`), para a nutricionista saber que aquilo é relato da família e
poder confirmar. Custa uma coluna e evita que um dado de casa vire conduta sem
passar por ela.

Mas é decisão clínica, e o app funciona dos dois jeitos. Se decidirem por essa
marca, ela é responsabilidade da função — o app não manda origem.

---

## E o que o app NÃO vai pedir

Para vocês não construírem à toa:

- **Nada de escrever objetivo, atividade ou plano.** O app só lê o plano e
  escreve exposição. Montar plano é trabalho dela.
- **Nada de `passos_alcancados` numerado.** Ver acima.
- **Nada de apagar ou editar exposição.** Se a mãe errar o degrau, ela registra
  de novo — corrigir prontuário é dela. (Se acharem que a mãe precisa desfazer
  nos primeiros minutos, me digam e eu desenho.)
- **Nada de notificação.** A frequência não muda o resultado — duas vezes por
  semana, uma, ou quinzenal, dá no mesmo —, então cobrar ritmo seria pressão sem
  ganho clínico. E pressão reforça a rejeição, que é o oposto do tratamento.

---

## Depois de subir

Do lado do app é rápido: uma lib nova que chama as três funções, e ligar a tela
ao App. As telas já existem e já foram exercitadas com dado de mentira.

Rodem `npm run contrato` no app depois: ele chama toda RPC com a chave pública e
separa "existe e barrada" de "existe e executa sem sessão".
