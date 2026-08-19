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
• Agenda consultas com a sua nutricionista
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

## Acesso ao app

O app é todo atrás de login, então o revisor precisa de credenciais. Criar uma
conta de demonstração já vinculada a um paciente fictício com plano, registros
e peso lançados. Conta vazia gera rejeição por funcionalidade incompleta.

Instrução a informar: "Faça login com as credenciais acima. A conta já está
vinculada a um paciente de demonstração e vai direto para a tela inicial com
dados preenchidos."

## Segurança de dados

| Pergunta | Resposta |
| --- | --- |
| Coleta ou compartilha dados? | Coleta. Não compartilha com terceiros |
| Criptografado em trânsito? | Sim |
| Usuário pode pedir exclusão? | Sim, com a URL de exclusão acima |

Tipos de dados, todos **coletados**, **não compartilhados**, finalidade
**funcionalidade do app** e **gerenciamento de conta**:

- Informações pessoais: nome e e-mail. Obrigatórios
- Fotos e vídeos: fotos. Opcional (foto de perfil)
- Saúde e fitness: informações de saúde e de atividade física. Opcional.
  Cobre peso, medidas, registros alimentares, água e sono
- Identificadores: ID do usuário. Obrigatório

Não marcar localização, contatos, mensagens, arquivos, dados financeiros nem
histórico de navegação. O app não toca em nada disso.

## Resto do checklist

- Anúncios: não contém
- Classificação de conteúdo: questionário de Utilitários e Saúde, não para
  todas as perguntas de violência, sexo, drogas e apostas. Sai Livre
- Público-alvo: apenas 18 anos ou mais. Incluir faixas menores aciona as
  regras de Famílias
- App de saúde: não é app médico regulado nem faz medição clínica
- Imagens que faltam produzir: ícone 512x512, gráfico de destaque 1024x500 e
  no mínimo 2 capturas de tela de celular

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
