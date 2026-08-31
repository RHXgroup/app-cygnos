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

### 1. Desvincular já existe — o que falta é o vínculo TERMINAR em vez de sumir

`app_desvincular(p_paciente_id)` existe. Uma versão anterior deste documento
dizia que não, e o erro foi meu: sondei a função sem argumento, o PostgREST
respondeu "Could not find the function", e eu li isso como "não existe". Chamar
com o argumento certo mostra a função rodando. É a armadilha que eu já tinha
anotado nesta mesma investigação e repeti mesmo assim.

O corpo faz `delete from app_vinculos`. E é aí que está o problema de verdade:

```
app_vinculos  →  conta_id, nutricionista_id, paciente_id, criado_em
                 (sem id, sem ativo, sem fim)
```

**O vínculo some, não termina.** Com a linha apagada, some junto a informação de
que aquele acompanhamento existiu entre tais datas — e isso derruba a regra que
o próprio Helton definiu: o plano deveria congelar como *"prescrito por Fulana,
de 12/03 a 28/08 — encerrado"*, e depois do `delete` não sobra nem o 12/03 nem
o 28/08.

**E a que existe é DELA, não dele.** O corpo resolve a profissional pela sessão
(`v_nutri`) e apaga o vínculo de um paciente da carteira — serve para ela
dispensar alguém. Procurados quatro nomes plausíveis do lado do paciente
(`app_sair_do_acompanhamento`, `app_encerrar_acompanhamento`,
`app_desvincular_minha_nutricionista`, `app_remover_meu_vinculo`): **nenhum
existe**.

Hoje o paciente entra e não sai. Ele relatou isso como falta ao usar o app.

Então o pedido não é uma função nova. É:

- **`fim timestamptz`** em `app_vinculos`, nulo enquanto ativo
- `app_desvincular` passa a **marcar o fim**, e não a apagar a linha
- `nutri_desvincular(p_conta_id)` para o outro lado — **os dois podem
  desvincular**, porque obrigar alguém a continuar acompanhado por quem não
  quer é errado nas duas direções
- tudo que hoje pergunta "tem vínculo?" passa a perguntar "tem vínculo **sem
  fim**?"

O último item é o que dá trabalho e é onde mora o risco: qualquer lugar que
esqueça o `fim is null` volta a mostrar como atual um acompanhamento encerrado.

**Encerrar não apaga nada.** Plano, metas, histórico e conversa continuam
existindo e legíveis para ele. O plano congela como "prescrito por Fulana, de
12/03 a 28/08 — encerrado", fora das metas do dia e fora do cartão da próxima
refeição.

### 1b. O catálogo some assim que ele vincula

`app_nutricionistas` devolve **todas** quando não há vínculo e **só a dele**
quando há. O app não escolhe — recebe uma linha só e mostra uma só.

O efeito, no relato de quem usou: *"quando eu escolhi o nutricionista não
aparece os outros, tinha que aparecer os outros também"*.

E ele tem razão por dois motivos, um de produto e um de mecânica:

- **A vitrine some junto com a escolha.** O catálogo é o que faz o app parecer
  uma rede de profissionais; depois do vínculo ele vira um app de um contato só.
  Quem quiser saber quem mais existe precisa desvincular para poder olhar.
- **Trocar fica impossível na prática.** Mesmo com o desvincular do item 1
  pronto, ele desvincula ÀS CEGAS: só depois de sair é que a lista volta, e aí
  ele já está sem ninguém. Escolher antes de sair é o caminho natural, e ele
  está fechado.

**Pedido:** a função devolve sempre todas as ativas, com a flag `vinculada`
marcando qual é a dele. A flag já existe e o app já a lê — hoje ela vem
verdadeira na única linha devolvida.

Não é mudança de regra: continua **um paciente, uma nutricionista ativa**. É a
diferença entre "não pode ter duas" e "não pode nem ver as outras".

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

As colunas de hoje, conferidas uma a uma:

```
exames_laboratoriais
  id, nutricionista_id, paciente_id, nome, arquivo_url, tipo_arquivo,
  tamanho, data_exame, observacoes, importado_por, importado_por_nome,
  created_at, analise, analisado_em
```

Boa parte do que eu ia pedir **já existe**: `data_exame`, `importado_por` e
`importado_por_nome` estão lá. O que falta é só:

- **`conta_id`**, para o exame pendurar na pessoa e não na carteira
- `nutricionista_id` virar `pedido_por`, um atributo, e poder ser nulo

E uma regra em vez de uma coluna: **`data_exame` obrigatória**. Hoje é
convenção — os 23 exames existentes têm data, nenhum está sem —, e convenção
não sobrevive ao primeiro import automático. Exame de seis meses lido como se
fosse de hoje é erro clínico, e se o arquivo viaja, a data viaja junto.

### 3. Quem importa, o outro lado recebe

Nos dois sentidos, e é o mesmo arquivo:

- ele importa no app → ela vê no sistema
- ela importa no sistema → **ele recebe no app**, porque o exame é dele

O segundo caso é o que hoje não acontece, e é o mais comum: ela recebe o PDF por
e-mail e sobe do lado dela.

### 4. A análise precisa SAIR de dentro do exame

E aqui está o motivo estrutural, que eu não tinha visto: `analise` e
`analisado_em` são **colunas da própria linha do exame**.

Isso quer dizer que, do jeito que está, **compartilhar o exame compartilha a
análise junto** — a menos que cada consulta lembre de não trazer aquela coluna.
Uma regra que depende de todo mundo lembrar não é uma regra; é uma espera.

Por isso a análise vira registro à parte, referenciando o exame. Não é
preciosismo de modelagem: é o que faz a fronteira existir na estrutura em vez de
na disciplina de quem escreve a próxima consulta.

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

> **O ponto que ficou em aberto, e a leitura que chegou.** Ficou dito que "ela
> pode até compartilhar a análise se ela quiser" — o que, lido ao pé da letra,
> deixaria a profissional decidir se o PACIENTE vê.
>
> A sessão do sistema leu assim, e eu concordo: **isso não é um poder que ela
> tem.** Dois caminhos independentes chegam no mesmo lugar. A análise entregue é
> o serviço que ele contratou e pagou — negar acesso ao produto do serviço é
> contratual antes de ser regulatório. E é dado pessoal DELE tratado por ela: o
> art. 18 da LGPD dá ao titular acesso aos dados tratados, e uma interpretação
> laboratorial é dado sobre a saúde dele, não opinião sobre um terceiro.
>
> Rascunho é outra coisa: anotação em elaboração, ainda não entregue, e não há
> direito de acesso a documento que ainda não é documento. **O que não pode é o
> rascunho virar gaveta onde a entrega some** — nem depois do vínculo acabar,
> que é justamente quando a tentação de reter aparece.
>
> Nenhum de nós dois é advogado, e os documentos legais do projeto ainda esperam
> parecer. Mas a separação entregue/rascunho é a única que se sustenta pelos dois
> caminhos ao mesmo tempo, e é ela que vai para a migração.

E o caso que faltava, levantado do outro lado: **e se ela ERRAR a análise e ele
quiser levar a outra profissional?**

Bloquear o repasse pelo app não impede a circulação — empurra para a captura de
tela. Só impede a circulação **rastreável**. E o cenário não é comercial, é de
segurança: segunda opinião sobre um laudo mal lido é exatamente o que o paciente
precisa poder buscar.

Por isso o bloqueio é de PRODUTO, e não cadeado: o app não oferece "encaminhar a
análise" porque não quer transformar o trabalho dela em moeda de troca. Não vale
construir mecanismo de retenção — ele só incomoda quem cumpre a regra, e não
segura quem não cumpre.

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

**E isto tem pressa, por um motivo específico:** o ciclo já ganhou mecanismo
PRÓPRIO — existe `app_contas.compartilha_ciclo`, uma chave booleana criada numa
migração recente. Se a tabela genérica nascer depois, vão existir dois
mecanismos respondendo à mesma pergunta, e o caso mais sensível de todos fica no
que foi feito às pressas.

Decidir a forma genérica **antes do segundo caso** é o que impede o terceiro de
nascer com um terceiro mecanismo. Quando `app_compartilhamentos` existir, o
ciclo migra para ela e a chave em `app_contas` sai — e a Política de
Privacidade passa a descrever um mecanismo só, em vez de um por assunto.

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

---

## Ordem sugerida

1. **`fim` no vínculo, e uma função de desvincular PARA O PACIENTE** — a
   `app_desvincular` que existe é dela, e apaga a linha. Hoje ele entra e não
   sai.
1b. **o catálogo continuar completo depois do vínculo** — pequeno, e é o que
   torna trocar possível em vez de às cegas
2. **`conta_id` no exame, e `data_exame` obrigatória** — é a correção de fundo
3. **análise como registro à parte**
4. **compartilhamento por item**
5. **dois vínculos ativos**, se o uso pedir

Do lado do app eu faço a tela de "quem vê o quê" e a de desvincular assim que 1
e 4 existirem. Antes disso não há o que ligar.
