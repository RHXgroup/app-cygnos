# Segurança dos Dados — rascunho para o Play Console

> **Isto é rascunho. Nada foi enviado, e nenhuma política do site foi alterada.**
> Levantado em 31/08/2026 a partir do código, para ser conferido e preenchido à
> mão no Play Console.

O formulário de *Data safety* é declaração, não configuração: o Google não
verifica na hora, mas **suspende depois** quando o que está declarado não bate
com o que o app faz. Por isso este documento diz de onde cada resposta saiu.

Duas coisas facilitam muito aqui, e as duas foram conferidas no código:

- **Não há nenhum SDK de análise, telemetria, publicidade ou rastreamento.**
  Nada de Firebase Analytics, Sentry, Amplitude, Meta, AppsFlyer. Isso elimina
  as seções mais espinhosas do formulário.
- **Nada sai do aparelho direto para um terceiro.** Toda chamada de IA passa
  pelo backend do próprio app (Edge Functions do Supabase). A única exceção é o
  Open Food Facts, e ali só trafega **o código de barras** — nenhum dado de
  pessoa.

---

## 1. Os dados, na taxonomia do Google

Marcar **Coletado: sim** para todos abaixo. **Compartilhado** e a coluna de
finalidade estão discutidos na seção 2.

### Informações pessoais

| Campo do formulário | O que é, aqui | Obrigatório? |
|---|---|---|
| Nome | cadastro | sim |
| Endereço de e-mail | login | sim |
| IDs do usuário | id da conta, nome de usuário | sim |
| Número de telefone | cadastro | **opcional** |
| Outras informações | **CPF**, data de nascimento, gênero | CPF: conferir* |

\* O CPF entra como "Outras informações" — o formulário não tem uma linha para
documento de identidade. **Confira se ele é mesmo obrigatório no cadastro**: um
identificador nacional obrigatório aumenta o escrutínio, e se ele não for
necessário para o app funcionar, o mais seguro é declarar como opcional (e, se
possível, tornar opcional de verdade).

### Saúde e fitness — a categoria mais sensível deste app

| Campo | O que é |
|---|---|
| Informações de saúde | peso e objetivo de peso, sono, **ciclo menstrual**, exames, medidas, cálculos energéticos, consumo alimentar |
| Informações de fitness | treinos, séries, sessões, passos |

O **ciclo menstrual** merece atenção separada. É dado de saúde sensível sob a
LGPD, e o Google trata categorias reprodutivas com rigor maior. Ele está no app
(`app_ciclo_registros`, `app_ciclo_dias`) e precisa ser declarado.

### Fotos e vídeos

| Campo | O que é |
|---|---|
| Fotos | foto de perfil, fotos de refeição (`fotos-diario`), fotos de progresso corporal, foto da ficha de treino |

### Áudio

| Campo | O que é |
|---|---|
| Gravações de voz ou som | o ditado, para registrar refeição falando em vez de digitando |

**Aqui há uma pergunta em aberto** — ver a seção 4. Se o áudio for transcrito e
descartado sem ser gravado, ele pode ser declarado como **"processado de forma
efêmera"**, que no formulário significa **não coletado**. Isso é melhor para a
declaração e é verdade *se* a função no servidor não guardar o arquivo. Não dá
para responder isso de fora.

### Arquivos e documentos

| Campo | O que é |
|---|---|
| Arquivos e documentos | exames enviados pelo paciente (`documentos-paciente`) |

### Mensagens

| Campo | O que é |
|---|---|
| Outras mensagens no app | a conversa com a nutricionista (`app_mensagens`) |

### O que NÃO marcar

Conferido no código, e cada um destes é "não" com razão:

- **Localização** — o app não pede nem usa.
- **Informações financeiras** — não há pagamento no app.
- **Contatos, agenda, histórico de navegação** — nada disso é acessado.
- **Informações e desempenho do app** (registros de falha, diagnóstico) — não há
  SDK que colete. *Cuidado:* se um dia entrar Sentry ou Crashlytics, esta linha
  muda no mesmo dia.
- **IDs de dispositivo** — não são coletados.

---

## 2. As duas decisões que são suas, não minhas

O formulário separa **coletado** de **compartilhado**, e "compartilhado" tem
definição estreita: transferir para um **terceiro**. O Google exclui dessa
definição dois casos, e os dois aparecem aqui.

### a) O fornecedor de IA

Foto do prato, ficha de treino e áudio do ditado vão para o backend do app, que
chama um serviço de IA do lado do servidor.

**Recomendo declarar como NÃO compartilhado.** O Google exclui explicitamente a
transferência para *prestador de serviço que processa em nome do desenvolvedor*
— que é o caso. O dado continua sendo **coletado**, e isso é declarado.

### b) A nutricionista

Este é o de verdade, e não tem resposta óbvia. Quando o paciente digita o código
dela, os dados dele passam a ser vistos por outra pessoa — e a sua própria
política diz, com todas as letras, que **ela passa a ser controladora**.

**Recomendo declarar como NÃO compartilhado**, e o motivo é específico: o Google
também exclui a transferência que acontece **por ação deliberada da pessoa, com
aviso na hora**. Pedir contato é exatamente isso — não acontece sozinho.

**Mas a defesa dependia de um aviso que não existia, e isso foi corrigido.** A
tela de "Pedir contato" dizia só *"Ela recebe o seu pedido e responde quando
puder"*. Quem lia entendia "ela me responde", e não "ela vê o meu diário" — ou
seja, a ação existia e o aviso não, o que derrubaria a exclusão do Google e, pior
que isso, deixava a pessoa entregar peso, refeição e sono a uma estranha sem a
tela dizer isso em lugar nenhum.

A tela agora diz, antes de o pedido sair:

> Se ela aceitar, passa a acompanhar o que você registra aqui — peso, refeições,
> água, sono e treinos. O ciclo menstrual fica de fora: ele só é compartilhado se
> você ligar isso na tela dele. Você encerra o acompanhamento quando quiser, sem
> precisar dar motivo.

O ciclo é citado porque é a **exceção real**: ele tem interruptor próprio
(`app_ciclo_compartilhar`), nasce desligado e continua desligado depois do
vínculo. Omitir isso prometeria a mais — quem lesse "ela vê o que você registra"
poderia concluir que o ciclo já está indo.

---

## 3. Finalidades e práticas de segurança

**Finalidade** de tudo: `Funcionalidade do app` e `Gerenciamento de contas`.
Nada aqui é para análise, publicidade ou personalização — e não marcar essas
duas é o que mantém a declaração verdadeira.

**Práticas de segurança:**

| Pergunta | Resposta | Por quê |
|---|---|---|
| Dados criptografados em trânsito | **Sim** | tudo passa por HTTPS/TLS do Supabase |
| A pessoa pode pedir a exclusão dos dados | **Sim** | há os dois caminhos, e a página pública existe |
| Revisão de segurança independente | **Não** | não houve |
| Política para Famílias | **Não se aplica** | o app não é dirigido a crianças |

Na URL de exclusão, use exatamente `https://cygnos-nutri.com/app/excluir-conta`
— ela já existe, foi conferida no navegador, e traz os dois caminhos, o prazo da
LGPD e o que é apagado.

---

## 4. O que eu NÃO consegui verificar, e por que importa

Três perguntas ficaram abertas porque a resposta mora no servidor, e daqui eu só
tenho a chave pública.

### a) A exclusão apaga tudo mesmo?

**Esta é a mais importante do documento.** A página pública lista dez coisas que
são apagadas. O app guarda mais do que dez.

Comparando a lista da página com as tabelas que o app usa, **não aparecem na
página**:

| No app | Na página de exclusão |
|---|---|
| `app_ciclo_registros`, `app_ciclo_dias` — ciclo menstrual | não citado |
| `app_treino_*` — treinos, sessões, séries | não citado |
| `app_mensagens` — conversa com a nutricionista | não citado |
| `app_intencoes` — propósitos do dia | não citado |
| `app_receitas` — receitas | não citado |
| `fotos-diario` — fotos de refeição | não citado |
| `documentos-paciente` — exames do paciente | citado só como o que **fica com ela** |

**Isso pode ser só a página incompleta, ou pode ser dado sobrevivendo à
exclusão.** São coisas muito diferentes:

- se `app-excluir-conta` apaga tudo em cascata, o que falta é **redação**;
- se ela apaga só o que a página lista, então ciclo menstrual e conversa
  **sobrevivem** ao pedido de exclusão — o que é problema de LGPD e, declarado
  como "pode pedir exclusão: sim", vira declaração falsa no Play.

**Quem consegue ler `app-excluir-conta` precisa responder isto antes de sexta.**
Enquanto não souber, não dá para marcar a caixa de exclusão com segurança.

### b) O áudio do ditado é guardado?

Se `app-transcrever` transcreve e descarta, declara-se **efêmero** (= não
coletado). Se ela guarda o arquivo, é coleta de gravação de voz. Muda uma linha
inteira do formulário.

### c) O CPF é obrigatório para usar o app?

Se for, tem de ser declarado como obrigatório. Se não for necessário, o melhor
caminho não é mudar a declaração — é deixar de exigi-lo.

---

## 5. A ordem que eu seguiria na sexta

1. Responder a pergunta (a) — é a única que pode transformar a declaração em
   informação falsa.
2. Responder (b) e (c), que mudam uma linha cada.
3. Preencher o formulário com este documento ao lado.

A tela de vínculo, que sustenta a resposta da seção 2b, **já foi corrigida** e
não precisa entrar nessa lista.

Nada disso depende do `.aab`: dá para preencher a Segurança dos Dados antes de
existir build, e é melhor assim — o formulário é o que costuma segurar o envio
depois que o pacote já está pronto.
