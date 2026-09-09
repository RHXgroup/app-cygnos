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
 * coisa divergem sempre; esta é a única. */
export const O_QUE_ELA_FAZ =
  'Eu respondo sobre a sua agenda, o dinheiro do dia e quem está pedindo atenção — ' +
  'e agendo consulta e lanço conta a receber, sempre com a sua confirmação. ' +
  'Remarcar, cancelar e o resto continuam no sistema, no computador.'

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
 * dez segundos que não serve para nada. Quatro exemplos do que ela responde
 * HOJE valem mais que qualquer texto de ajuda. */
export const PERGUNTAS_DE_EXEMPLO = [
  'Quem é o meu próximo paciente?',
  'Quanto eu recebi hoje?',
  'Quem está sem retorno?',
  'Agenda um retorno para amanhã às 15h',
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
