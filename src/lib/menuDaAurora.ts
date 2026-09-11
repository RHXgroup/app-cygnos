/* O começo da conversa com a Aurora: o que ela oferece, e como voltar para lá.
 *
 * ──────────────────── Por que isto é um arquivo à parte ────────────────────
 * Porque `auroraDaNutri.ts` importa o Supabase, e quem importa o Supabase não
 * roda no Node -- arrasta o aparelho inteiro junto. Aqui não há nada de
 * runtime, então dá para exercitar de verdade em `menuDaAurora.teste.mts`. É o
 * mesmo corte de `sugestaoParaPlano` para fora de `planoIA`: lá o que fala com
 * a rede, aqui o que decide.
 *
 * ──────────────────── "Manu principal" ────────────────────
 * Ela terminou um agendamento, quis voltar para as perguntas do começo, e
 * digitou "Manu principal". A Aurora leu "Manu" como nome de gente e devolveu
 * cinco pacientes parecidas -- Emanuele, Emanuelle, Manuella --, perguntando
 * qual era. Quem procurava a saída recebeu uma lista de gente, e não havia
 * saída nenhuma: os exemplos do começo só existiam enquanto a conversa estava
 * vazia.
 *
 * O prompt do servidor também aprendeu a regra, e é ele que cobre o que for
 * escrito de um jeito que ninguém previu. Mas para as poucas frases que só
 * podem querer dizer "volta ao começo", responder AQUI é melhor por três
 * motivos: é instantâneo, não custa uma ida ao modelo, e não tem como ser
 * reinterpretado -- que é exatamente o que deu errado. */

/* O que ela faz, numa frase, e num lugar só.
 *
 * A tela de abertura dizia "Agendar, remarcar e lançar continuam no sistema, no
 * computador" -- verdade quando foi escrita, e mentira desde o dia em que a
 * Aurora ganhou as ferramentas de agendar e lançar. Duas descrições da mesma
 * coisa divergem sempre; esta é a única.
 *
 * ──────────────────── E ela envelhece de novo A CADA FERRAMENTA NOVA ────────────────────
 * Quem manda no que a Aurora faz é o registro do servidor
 * (`supabase/functions/_shared/ferramentas.ts`, no Nutriviet), e o aplicativo
 * não tem como importar aquele arquivo -- ele é Deno, e nada aqui alcança.
 * Então esta frase é uma CÓPIA À MÃO, e a única defesa dela é ser lembrada:
 * quando uma ferramenta entrar lá, ela entra aqui.
 *
 * Já aconteceu no mesmo dia em que este comentário foi escrito: três horas
 * depois de eu consertar a mentira acima, o servidor ganhou conta a pagar e
 * esta frase virou a mentira seguinte. */
/* Três linhas, e não uma frase: com treze ferramentas, enumerar tudo numa
   frase só é a mesma coisa que não dizer nada. O corte é por NATUREZA -- o que
   ela lê, o que ela grava, e o que não é com ela --, que é a pergunta que a
   nutricionista tem na cabeça quando abre a tela.

   Fornecedor, categoria de despesa e forma de pagamento existem e NÃO estão
   aqui de propósito: são o que completa um lançamento, e não coisa que alguém
   pede. Frase de abertura que lista ferramenta interna vira lista de sistema, e
   lista de sistema ninguém lê. */
/* "quem", e não "quantos" -- e esta linha já foi as duas coisas no mesmo dia.
 *
 * Enquanto a triagem mandava só a contagem ao modelo, prometer nomes seria
 * mentira, e a frase dizia "quantos ... os nomes ficam na tela Hoje". Com a
 * recomposição no ar (o servidor manda `#412` à IA e troca pelo nome na volta),
 * ela responde quem -- e nenhum nome sai do país. Ver o commit `deab1fef` do
 * Nutriviet.
 *
 * Fica registrado porque a frase certa depende de uma decisão do servidor que
 * não se enxerga daqui: quem trocar isto sem olhar lá vai errar para um dos
 * dois lados. */
/* ──────────────────── POR ASSUNTO, e nunca mais por item ────────────────────
 * Esta frase mentiu TRÊS vezes em dois dias, sempre do mesmo jeito: o servidor
 * ganhava ferramenta e a lista daqui continuava a de ontem. Começou com duas
 * ferramentas, e hoje são vinte.
 *
 * Enquanto ela enumerava, cada ferramenta nova era uma correção aqui -- e a
 * correção só acontecia quando alguém lembrava. Por ASSUNTO, ferramenta nova
 * dentro de um assunto que já está escrito não muda nada: "responder pedido de
 * consulta" já cabe em "cuido da sua agenda".
 *
 * Assunto NOVO ainda exige mexer aqui. Mas assunto novo é raro, e a lista de
 * assuntos é curta o bastante para caber numa tela -- que era o outro problema
 * de enumerar vinte coisas. */
export const O_QUE_ELA_FAZ =
  'Eu leio a sua agenda, o dinheiro do dia, a ficha do paciente (peso, plano e ' +
  'histórico) e quem está pedindo atenção na sua carteira.\n\n' +
  'E eu faço, sempre com a sua confirmação antes de gravar: cuido da agenda ' +
  '(marcar, remarcar, cancelar e responder pedido de consulta), lanço o que ' +
  'entra e o que sai, cadastro paciente, alimento e fornecedor, marco tags e ' +
  'crio lembrete no seu telefone.\n\n' +
  'Gerar relatório continua no sistema, no computador.'

export const RESPOSTA_DO_MENU = 'Voltamos ao começo. ' + O_QUE_ELA_FAZ

/* A pergunta que fecha o assunto depois de uma ação gravada.
 *
 * Vai num balão SEPARADO do texto que a RPC escreveu, e não emendada nele: o
 * "Consulta agendada para..." é o relato de quem gravou, e misturar uma frase
 * nossa ali dentro apagaria essa fronteira no dia em que alguém for ler o
 * histórico para saber o que de fato aconteceu. */
export const FECHAMENTO = 'Precisa de mais alguma coisa?'

/* O que oferecer antes de ela digitar qualquer coisa -- e depois também.
 *
 * Não é enfeite: uma caixa de texto vazia com "pergunte alguma coisa" não diz o
 * que a Aurora SABE, e a primeira pergunta de quem não sabe costuma ser
 * justamente a que ela não responde -- "remarca a Maria" --, o que ensina em
 * dez segundos que não serve para nada. Exemplos do que ela responde HOJE valem
 * mais que qualquer texto de ajuda.
 *
 * Três de leitura e três de ação, nesta ordem: quem chega não desconfia que uma
 * caixa de conversa GRAVA coisa, e são os últimos que contam isso -- sem eles,
 * "agenda um retorno" nunca é a primeira coisa que alguém escreve.
 *
 * O cadastro de alimento é o que menos se adivinha e o que mais economiza o dia
 * dela: é a tarefa que hoje exige abrir o computador no meio do consultório. Se
 * um dia esta lista precisar encolher, esse não é o que sai. */
export const PERGUNTAS_DE_EXEMPLO = [
  'Quem é o meu próximo paciente?',
  'Quanto eu recebi hoje?',
  'Quem está sem retorno?',
  'Agenda um retorno para amanhã às 15h',
  'Lança uma despesa de R$ 80 de material',
  'Cadastra um alimento novo na minha base',
]

/* O acento sai por CÓDIGO, e não por uma classe de regex com o intervalo dos
   sinais combinantes escrito literalmente: aquele intervalo é feito de dois
   caracteres invisíveis, e um dia alguém "limpa" a linha sem ver o que apagou.
   `NFD` separa o sinal da letra, e o que fica entre 0300 e 036F é sinal. */
const semAcento = (texto: string): string =>
  [...texto.normalize('NFD')]
    .filter(c => {
      const n = c.codePointAt(0) ?? 0
      return n < 0x300 || n > 0x36f
    })
    .join('')

/* Minúsculas, sem acento, sem pontuação, espaços colapsados. A pontuação vira
   ESPAÇO e não some: sem isso "menu-principal" viraria uma palavra só. */
const achatar = (texto: string): string =>
  semAcento(texto.toLowerCase())
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/* As frases que só podem querer dizer "volta ao começo".
 *
 * A lista é curta de propósito, e a comparação é com a MENSAGEM INTEIRA. Um
 * "contém" acharia "menu" dentro de qualquer frase, e "voltar" dentro de
 * "quando ela vai voltar?" -- que é pergunta sobre paciente, e não sobre
 * navegação. */
const PEDIDOS = new Set([
  'menu',
  'menu principal',
  'principal',
  'inicio',
  'comeco',
  'voltar',
  'voltar ao inicio',
  'volta ao inicio',
  'voltar ao menu',
  'volta ao menu',
  'voltar ao comeco',
  'tela inicial',
  'opcoes',
  'ajuda',
  'me ajuda',
  'o que voce faz',
  'oque voce faz',
  'o que voce sabe fazer',
  'o que voce pode fazer',
  'o que da para fazer',
])

export function ehPedidoDeMenu(texto: string): boolean {
  const limpo = achatar(texto)
  if (!limpo) return false

  /* O erro de digitação que originou tudo isto, e só na frase inteira: "manu"
     sozinho continua sendo a Manuella, que existe e é paciente. */
  const normal = limpo.replace(/^m[ae]nu principal$/, 'menu principal')

  return PEDIDOS.has(normal)
}

/* O que NUNCA deveria chegar à tela, e chega quando o modelo desobedece.
 *
 * O contexto manda o número de cada consulta como `[ID: 57]`, e o prompt diz
 * para usar o número dentro da ferramenta e nunca na resposta. Prompt não é
 * garantia: basta uma volta em que ele resolva "ser útil" e a nutricionista lê
 * "confirmei a consulta [ID: 57] às 13:00".
 *
 * Tirar na hora de desenhar custa uma expressão regular e não depende de o
 * modelo colaborar. O espaço que sobra em volta some junto, senão fica "às
 * 13:00  ." com dois espaços e um ponto solto. */
export const semRestos = (texto: string): string =>
  texto
    .replace(/\s*\[ID:\s*\d+\]\s*/g, ' ')
    .replace(/ +([.,;:!?])/g, '$1')
    .replace(/ {2,}/g, ' ')
    .trim()

/* ──────────────────── A PRIMEIRA LINHA, ANTES DE ELA PERGUNTAR ────────────────────
 *
 * A tela abria com "O que você quer saber?" -- uma pergunta feita a quem abriu a
 * tela justamente por não saber. A Aurora já tinha os números do dia em mãos
 * (são os mesmos que montam os chips) e não dizia nenhum.
 *
 * Uma frase só, e de fatos: quantas consultas, quantas sem confirmar, quantos
 * pedidos esperando. É o que ela responderia se fosse perguntada, dito antes de
 * ser perguntada -- e é o que explica por que os chips embaixo oferecem
 * justamente aquilo.
 *
 * NÃO vira painel: o painel é a tela do lado, com a agenda inteira. Aqui é a
 * frase que justifica a conversa começar. Se um dia isto crescer para três
 * linhas, cresceu para o lugar errado. */
export function resumoDoDia(dia: {
  consultas: number
  semConfirmar: number
  pedidos: number
}): string | null {
  const partes: string[] = []

  /* Dia sem consulta NÃO é dia livre -- ela pode ter mil coisas que o app não
     enxerga. A frase diz o que o app sabe, e nada além. */
  if (dia.consultas > 0) {
    partes.push(dia.consultas === 1 ? '1 consulta hoje' : dia.consultas + ' consultas hoje')
    if (dia.semConfirmar > 0) {
      partes.push(dia.semConfirmar === 1 ? '1 sem confirmar' : dia.semConfirmar + ' sem confirmar')
    }
  }

  if (dia.pedidos > 0) {
    partes.push(dia.pedidos === 1 ? '1 pedido esperando você' : dia.pedidos + ' pedidos esperando você')
  }

  /* Nada a dizer é melhor do que "nenhuma consulta e nenhum pedido": uma frase
     que só existe para dizer que não há nada vira ruído em todo dia calmo. */
  if (partes.length === 0) return null

  return partes.join(', ') + '.'
}
