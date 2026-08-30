# De quem é o dado, e o que acontece ao trocar de nutricionista

**Para a sessão do sistema web.** Hoje o paciente que se vincula não tem como se
desvincular, não pode ter duas profissionais, e o exame que ele mesmo importou
fica arquivado dentro da carteira de quem pediu — se ele trocar, perde o acesso
a um resultado que saiu do próprio sangue.

Este documento é a regra combinada com o Helton em 30/08/2026 e o que o banco
precisa entregar para ela valer. Nada aqui pede mudança de tela no app; a tela
eu faço depois, quando as colunas existirem.

---

## A regra, em uma linha

**Fato sobre o corpo dele é dele. Trabalho dela é dela.**

| coisa | de quem | viaja com ele? |
| --- | --- | --- |
| resultado de exame (o arquivo, os valores) | **dele** | **sim**, para quem ele escolher |
| peso, medidas, diário, ciclo, treino | **dele** | sim, por escolha dele |
| **a análise** que ela fez do exame | **dela** | **não** |
| o plano alimentar que ela montou | **dela** | não — congela e fica legível para ele |
| anamnese, cálculo energético | **dela** | não |

O exame é o caso que motivou tudo, e o argumento é curto: **ela pediu, mas não
produziu.** O laboratório produziu, a partir do sangue dele, e ele pagou. Um
valor de hemoglobina não é propriedade intelectual de quem assinou o pedido — é
um fato sobre uma pessoa, e essa pessoa tem cópia disso no laboratório, no
convênio e no papel.

A análise é o oposto: ela não existia antes de a profissional pensar. É o que
ele contratou, e é o que distingue uma nutricionista de um leitor de PDF.

---

## O que muda no banco

### 1. O vínculo precisa de fim

Hoje `app_vinculos` tem só `conta_id`, `nutricionista_id`, `criado_em`.
**Não há `ativo`, não há `fim`, não há `id`.** Sem fim, não existe desvincular
nem trocar: o paciente fica preso na primeira que aceitar.

- coluna de encerramento (`fim timestamptz`, nulo enquanto ativo)
- `app_desvincular()` para o paciente
- `nutri_desvincular(p_conta_id)` para ela

**Os dois lados podem desvincular** — decisão do Helton, e concordo: obrigar
alguém a continuar acompanhado por quem não quer é errado nas duas direções.

**Encerrar não apaga nada.** Plano, metas, histórico e conversa continuam
existindo e legíveis para ele. O plano congela como "prescrito por Fulana, de
12/03 a 28/08 — encerrado", fora das metas do dia e fora do cartão da próxima
refeição.

### 2. O exame passa a pendurar na PESSOA

Hoje:

```
exames_laboratoriais  →  paciente_id  +  nutricionista_id
pacientes             →  id  +  nutricionista_id  +  user_id
```

Uma linha de `pacientes` não é uma pessoa — é *uma pessoa na carteira de uma
nutricionista*. O mesmo ser humano atendido por duas vira duas linhas. E o exame
pendura na linha, então **ele nasce dentro da carteira de quem pediu**.

Precisa passar a pendurar na conta do app, com a profissional virando um
**atributo** do exame, e não o dono dele:

```
exames_laboratoriais
  conta_id           -- o dono, e é ele
  pedido_por         -- qual nutricionista pediu (atributo, pode ser nulo)
  importado_por      -- 'paciente' | 'nutricionista'
  data_coleta        -- OBRIGATÓRIO, ver abaixo
```

**`data_coleta` não é detalhe.** Exame de seis meses lido como se fosse de hoje
é erro clínico. Se o arquivo viaja, a data viaja junto — compartilhar o
resultado sem ela seria pior do que não compartilhar.

### 3. Quem importa, o outro lado recebe

Nos dois sentidos, e é o mesmo arquivo:

- ele importa no app → ela vê no sistema
- ela importa no sistema → **ele recebe no app**, porque o exame é dele

O segundo caso é o que hoje não acontece, e é o mais comum: ela recebe o PDF por
e-mail e sobe do lado dela.

### 4. A análise é uma coisa à parte

Não é campo do exame — é registro dela, referenciando o exame:

```
analises_de_exame
  exame_id
  nutricionista_id
  texto
  publicada_em       -- nulo enquanto for rascunho dela
```

Três regras:

- **Ela escolhe publicar.** Enquanto não publicar, é anotação de trabalho.
- **Publicada, ele lê para sempre** — inclusive depois de o vínculo acabar.
  Ele contratou aquilo.
- **Ele não pode repassar a análise** para outra profissional pelo app. O exame
  ele repassa; a análise, não.

> **Ajuste que eu proponho, e é o único ponto onde eu não sigo o combinado ao
> pé da letra.** Ficou dito que "ela pode até compartilhar a análise se ela
> quiser" — o que, lido literalmente, deixaria ela decidir se o PACIENTE vê.
> Eu separaria: o que ela **entrega** a ele (parecer, conduta) é dele para ler,
> porque foi o serviço prestado; o que fica em rascunho é dela. O que ele não
> pode é **repassar** aquilo a uma concorrente como se fosse um bem portátil —
> e é isso que a regra protege de verdade.
>
> Vale um "sim" ou "não" do Helton antes de virar migração.

E uma honestidade sobre o alcance disso: "não pode repassar" vale **dentro do
app**. Ninguém impede uma captura de tela. A regra existe para o produto não
transformar o trabalho dela em moeda de troca, não para criar cadeado — e não
vale construir cadeado, que só incomoda quem cumpre a regra.

### 5. Compartilhar é por ITEM, nunca em bloco

```
app_compartilhamentos
  conta_id
  nutricionista_id
  tipo               -- 'exame' | 'ciclo' | 'peso' | 'treino' | ...
  referencia_id      -- nulo quando o tipo é o assunto inteiro
  criado_em
```

Um botão "liberar meu histórico" não serve. **Tem coisa que ele conta para uma e
não para a outra** — o ciclo menstrual é o exemplo extremo, mas vale para exame
de saúde mental, para peso, para o que for.

Isso responde a pergunta que só aparece quando existem duas profissionais: *"o
ciclo vai para as duas ou para uma?"* Vai para quem ele marcar, e para mais
ninguém.

### 6. Dois vínculos ativos — por último

O esquema **já permite**: nada em `app_vinculos` impede duas linhas. Quem
bloqueia é a função `app_solicitar_vinculo`, com a frase "Você já é acompanhada
por uma nutricionista". É trava de regra, não de estrutura.

Mas abrir isso obriga **todo dado do paciente a ter destinatário**, e hoje
`app_ciclo_registros`, `app_intencoes` e `app_treino_exercicios` só sabem o
`conta_id` — nenhum sabe para quem vai.

Por isso é o último: com o desvincular (1) e o compartilhamento por item (5)
prontos, dá para medir se alguém realmente quer duas ao mesmo tempo. A maioria
quer **trocar**, e trocar já estará resolvido.

**Não confundir com conta de dependente.** "Uma nutricionista para mim e outra
para meu filho" são duas PESSOAS, cada uma com o próprio diário e o próprio
peso. Resolver isso com dois vínculos somaria a comida dos dois no mesmo anel.
É outro assunto, e maior.

---

## Ordem sugerida

1. **fim do vínculo + desvincular dos dois lados** — pequeno, e destrava o
   paciente que hoje está preso
2. **exame pendurando na pessoa, com `data_coleta`** — é a correção de fundo
3. **análise como registro à parte**
4. **compartilhamento por item**
5. **dois vínculos ativos**, se o uso pedir

Do lado do app eu faço a tela de "quem vê o quê" e a de desvincular assim que 1
e 4 existirem. Antes disso não há o que ligar.
