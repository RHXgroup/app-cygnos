# Publicação na Play Store

Anotações do processo de publicação do Cygnos. Conta pessoal, pacote
`com.cygnosnutri.app`, faixa de teste fechado Alpha.

## Ficha da loja

**Nome do app** (máx. 30): `Cygnos`

**Descrição curta** (máx. 80):

```
Acompanhe seu plano alimentar, água, peso e metas com sua nutricionista.
```

**Descrição completa**:

```
O Cygnos é o aplicativo dos pacientes acompanhados por nutricionistas que usam a plataforma Cygnos. Ele conecta você ao seu profissional e reúne em um só lugar tudo o que faz parte do seu acompanhamento.

O que você faz no app:

• Consulta o plano alimentar montado pela sua nutricionista, com as refeições do dia e as porções recomendadas
• Registra o que comeu e acompanha o total de calorias e macronutrientes
• Busca alimentos em uma base completa para montar seus registros
• Anota o consumo de água ao longo do dia
• Registra peso e medidas e acompanha a evolução em gráficos
• Marca as horas de sono
• Define metas e acompanha o progresso
• Vê relatórios do seu período de acompanhamento
• Pede horário de consulta e acompanha a resposta da sua nutricionista
• Mantém seu perfil atualizado, com foto e dados pessoais

Como começar:

Você cria sua conta no próprio app com e-mail e senha. Para vincular a conta ao seu acompanhamento, basta informar o código de vínculo que a sua nutricionista fornece. A partir daí, tudo o que ela monta no consultório aparece para você.

Sobre privacidade:

Seus dados de saúde são visíveis apenas para você e para a nutricionista responsável pelo seu acompanhamento. Você pode excluir sua conta e seus dados a qualquer momento pelo próprio aplicativo.

O Cygnos é uma ferramenta de acompanhamento e não substitui a consulta com um profissional de saúde.
```

**Notas da primeira versão**:

```
Primeira versão de teste do Cygnos.

Crie sua conta, informe o código de vínculo fornecido pela sua nutricionista e explore o plano alimentar, os registros de água, peso e sono, e as metas.

Qualquer erro ou sugestão, envie para o contato do teste.
```

## URLs públicas exigidas

| Campo | URL |
| --- | --- |
| Política de privacidade | `https://www.cygnos-nutri.com/app/privacidade` |
| Termos | `https://www.cygnos-nutri.com/app/termos` |
| Exclusão de conta e dados | `https://www.cygnos-nutri.com/app/excluir-conta` |

## Detalhes do login (o antigo "Acesso ao app")

O app é todo atrás de login, então o revisor precisa de credenciais. A conta de
demonstração tem que estar **já vinculada** a um paciente com plano e registros
lançados, e a senha tem que funcionar direto, sem confirmação de e-mail
pendente. Conta vazia, ou que caia na tela do código de vínculo, gera rejeição
por funcionalidade incompleta.

O formulário exige os textos **em inglês**.

**Nome** (máx. 60):

```
Demo patient account
```

**Qualquer outra informação necessária** (máx. 500):

```
The entire app is behind a login. Use the email and password above. There is no two-step verification, no biometric login and no location restriction. The account is already linked to a demo patient, so the linking-code step is skipped: the app opens on the home screen with a meal plan and with food, water, weight and sleep entries already filled in. Every screen is reachable from the bottom tab bar and the "Mais" (More) menu. The app is free and has no paid or premium content.
```

O e-mail e a senha da conta ficam só no Play Console. Não guardar aqui.

## Segurança de dados

| Pergunta | Resposta |
| --- | --- |
| Coleta ou compartilha dados? | Coleta. Não compartilha com terceiros |
| Criptografado em trânsito? | Sim |
| Usuário pode pedir exclusão? | Sim, com a URL de exclusão acima |

Tipos de dados, todos **coletados**, **não compartilhados**, finalidade
**funcionalidade do app** e **gerenciamento de conta**. A lista saiu da tela de
cadastro e das colunas de `app_contas`, não de memória:

| Categoria | Item | Obrigatório | De onde vem |
| --- | --- | --- | --- |
| Informações pessoais | Nome | Sim | `nome_completo`, no cadastro |
| Informações pessoais | Endereço de e-mail | Sim | login |
| Informações pessoais | Número de telefone | Sim | `telefone`, no cadastro |
| Informações pessoais | IDs de usuário | Sim | `username` e o id do Auth |
| Informações pessoais | Outras informações | Sim | CPF, data de nascimento e gênero |
| Fotos e vídeos | Fotos | Não | foto de perfil, opcional |
| Saúde e fitness | Informações de saúde | Não | peso, medidas, registros alimentares, água |
| Saúde e fitness | Informações de atividade física | Não | sono e metas |

O CPF, a data de nascimento e o gênero entram em "Outras informações" porque a
lista do Google não tem categoria própria para documento nacional, data de
nascimento nem gênero.

Não marcar localização, contatos, mensagens, arquivos, dados financeiros nem
histórico de navegação. O app não toca em nada disso.

## Resto do checklist

- Anúncios: não contém
- Classificação de conteúdo: questionário de Utilitários e Saúde, não para
  todas as perguntas de violência, sexo, drogas e apostas. Sai Livre
- Público-alvo: apenas 18 anos ou mais. Incluir faixas menores aciona as
  regras de Famílias
- App de saúde: não é app médico regulado nem faz medição clínica
- Imagens: o ícone 512x512 e o gráfico de destaque 1024x500 estão prontos em
  `docs/loja`, gerados a partir da logo sobre o fundo #0C0F0B do tema escuro.
  Faltam no mínimo 2 capturas de tela de celular, que só saem com o app
  instalado num aparelho

## Regra dos 14 dias

Conta pessoal exige teste fechado com 12 testadores em opt-in contínuo por 14
dias antes de solicitar acesso à produção.

- Publicar atualizações durante o período não zera a contagem
- O que zera: cair abaixo de 12 em opt-in, pausar a faixa ou migrar para outra
- Recrutar 14 ou 15 pessoas dá margem para desistência
- Não há exigência de uso diário, mas o formulário de solicitação é lido por
  uma pessoa e pergunta o que foi testado e que feedback apareceu. Vale anotar
  os problemas e sugestões ao longo das duas semanas

## Atualizar o app depois

1. Commit
2. `npx eas-cli@latest build --platform android --profile production`
   (o `autoIncrement` cuida do versionCode)
3. Subir o `.aab` na faixa e publicar

Subir o campo `version` no `app.json` só quando a mudança for perceptível ao
usuário, porque é o número que aparece na loja.

O keystore fica na conta Expo. Baixar o backup com
`npx eas-cli@latest credentials` e guardar fora do computador. Sem ele, perder
a conta Expo significa perder a capacidade de atualizar o app.

## Lista de testadores da faixa Alpha

Os 14 e-mails entregues em 19/08/2026 estão em `docs/testadores-alpha.csv`,
um por linha, tudo em minúsculo. No Play Console: Teste fechado > Alpha >
aba Testadores > Criar lista de e-mails, nome `Alpha Cygnos`, e colar os
e-mails separados por vírgula ou enviar o CSV.


São 14 para uma exigência de 12, ou seja, dois de folga. Cada pessoa precisa
abrir o link de opt-in com a conta Google da lista e aceitar; quem não aceita
não conta. A contagem dos 14 dias só começa depois que a versão estiver
disponível na faixa e o opt-in acontecer.

## Imagens da ficha, em `docs/loja`

Geradas por script a partir de `assets/cygnos-icon.png`. Nenhuma das duas tem
canal alfa, porque a Play recusa o ícone com transparência.

As duas usam o creme da marca, `#FDFBF6` (o `sano.cream`). O gráfico de
destaque é só a logo centralizada, sem texto, ocupando 72% da altura, o que
deixa margem para a Play cortar as bordas em tela estreita sem encostar no
desenho. Se um dia o creme parecer lavado demais na grade da loja, o
`sano.mist`, `#F4EFE4`, é o mesmo creme um tom mais quente e dá mais separação
para a pena branca.

| Arquivo | Onde entra |
| --- | --- |
| `icone-512.png` | Ícone do app na ficha da loja |
| `destaque-1024x500.png` | Gráfico de destaque |

**Escala do ícone adaptativo, corrigida em 20/08/2026.** O Android mostra só as
72 unidades centrais de um ícone de 108, ou seja, o recorte central de 66,7%.
Numa tela de 1024 px, o que aparece são 683 px, e tudo é ampliado 1,5 vez. A
logo estava em 620 px achando que tinha folga; depois da ampliação ela ocupava
91% do ícone visível e a máscara redonda cortava a borda do círculo dourado.
Agora está em 440 px, que dá 64% do visível.

Para conferir isso corretamente: recortar o centro de 683 px ANTES de aplicar a
máscara. Mascarar a imagem de 1024 inteira mostra um ícone que ninguém vê, e foi
esse o erro que deixou o problema passar para a loja.

O ícone do launcher também foi refeito: até 19/08/2026 o `adaptiveIcon` ainda
apontava para o "A" azul do template do Expo sobre fundo `#E6F4FE`, que é o
que apareceria na tela inicial dos testadores. Agora a camada de frente é a
logo dentro do círculo seguro de 66%, sobre `#0C0F0B`. A camada monocromática
foi removida de propósito: a silhueta da pena vira um borrão branco, e sem o
arquivo o Android usa o ícone normal em vez de aplicar o tema do papel de
parede.

## Permissões do Android

O que o pacote pede depois da limpeza de 19/08/2026: `INTERNET`, `CAMERA`,
`READ_EXTERNAL_STORAGE` e `VIBRATE`. A `DUMP` que aparece no manifesto não é
pedido do app, é o receptor do `androidx.profileinstaller` se protegendo.

Três foram removidas, e nenhuma delas vinha do `app.json`:

- `RECORD_AUDIO`: o plugin do `expo-image-picker` adiciona sozinho, a menos
  que receba `microphonePermission: false`. Passar `false` também bloqueia a
  permissão no merge, então nenhum outro pacote consegue trazer de volta
- `SYSTEM_ALERT_WINDOW` e `WRITE_EXTERNAL_STORAGE`: vêm do modelo base de
  manifesto do Expo, num bloco marcado como opcional. Sem pasta `android`
  própria não dá para editar o arquivo, então saem por `blockedPermissions`

`READ_EXTERNAL_STORAGE` ficou de propósito: em Android 12 e anteriores é ela
que deixa escolher foto da galeria. `VIBRATE` ficou porque é inofensiva e a
notificação de horário das refeições vai precisar.

Conferir depois de cada build novo, porque plugin adiciona permissão sem
avisar:

```
unzip -o -q app.aab base/manifest/AndroidManifest.xml -d man
grep -a -o "android\.permission\.[A-Z_]*" man/base/manifest/AndroidManifest.xml | sort -u
```

### Capricho pendente: recursos obrigatórios

O manifesto não declara `uses-feature` nenhum, mas a Play deduz três recursos
obrigatórios a partir das permissões: pedir `CAMERA` sem declarar
`android.hardware.camera` como `required="false"` faz o app ser marcado como
exigindo câmera. Não muda o alcance na prática e não justifica um build só para
isso. Se algum dia for arrumar, precisa de um config plugin próprio, porque o
plugin do `expo-image-picker` não declara o `uses-feature`.

## Classificação de conteúdo: respostas

Respondido em 19/08/2026. O questionário é refeito a qualquer momento e a
classificação é recalculada, então ele descreve a versão que está sendo
enviada, nunca o roteiro futuro.

| Pergunta | Resposta | Por quê |
| --- | --- | --- |
| Aplicação transferida | Não | Nada de sexo, violência ou linguagem dentro do pacote |
| Partilha de conteúdos dos utilizadores | Não | Não há chat nem troca de conteúdo no app; a conversa acontece no WhatsApp, fora dele |
| Conteúdo online | Não | O catálogo de nutricionistas só tem campos estruturados (nome, foto, especialidades, telefone, CRN, cidade). Sem biografia livre, sem feed, sem mídia |
| Produtos com restrição de idade | Não | Não promove cigarro, álcool, arma nem aposta |

### Quando a troca de fotos com a nutricionista existir

Aí a partilha de conteúdos dos utilizadores passa a ser **sim**, e isso não é
só trocar um radio button. Conteúdo de usuário obriga, pela política do Google,
a existir dentro do app um jeito de denunciar conteúdo impróprio e de bloquear
o outro lado, mais uma política de conteúdo publicada. Vale desenhar a
funcionalidade já com isso, em vez de descobrir na hora do envio.

## Rejeição de 20/08/2026: categoria médica exige conta de organização

O primeiro envio foi **reprovado por sistema automatizado**, sem revisão
humana. Motivo, na área "Developer Account": desde 31/08/2024 contas novas
precisam ser de organização para publicar **health apps, como apps médicos**.

A causa foi a declaração de Apps de saúde, onde havia sido marcado
**"Serviços e gerenciamento de saúde"**, do bloco **Medicina**, por causa do
catálogo de nutricionistas e do pedido de consulta.

**A regra, que não estava anotada aqui antes:**

- O bloco de **bem-estar** da declaração (nutrição, peso, sono, hidratação)
  NÃO exige conta de organização
- O bloco **Medicina** exige, e conta de organização exige CNPJ e D-U-N-S,
  que é exatamente o que esta conta não tem (ver [[playstore-conta-pessoal]])

O Cygnos não é app médico: não diagnostica, não trata, não faz medição
clínica, não guarda prontuário médico e não marca consulta com médico. A
declaração correta é só bem-estar.

**Nenhuma caixa do bloco Medicina pode ser marcada enquanto a conta for
pessoal.** O mesmo vale para a categoria da ficha da loja, que precisa ser
"Saúde e fitness" e nunca "Medicina".

Corrigir a declaração e reenviar pela Visão geral da publicação. Recurso só
faz sentido se a reprovação se repetir depois da correção, porque recorrer
mantendo a declaração que causou o problema dá negativa quase certa.
