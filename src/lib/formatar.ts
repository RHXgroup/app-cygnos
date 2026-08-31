/* Formatação escrita à mão de propósito: o Hermes (motor JS do React Native)
   sai de fábrica sem a tabela completa do Intl, e toLocaleString/DateTimeFormat
   podem cair no inglês ou ignorar o separador dependendo do aparelho. Aqui o
   resultado é o mesmo em todo lugar. */

const DIAS = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
]

/* Na ordem de Date.getDay(): 0 = domingo. É esse índice que o plano guarda. */
export const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/* Por extenso, para cabeçalho de tela. "Segunda-feira" no topo diz onde a
   pessoa está sem ela precisar conferir o relógio — e é o que faz a tela
   parecer que sabe do dia dela, em vez de esperar ser informada. */
export const DIAS_LONGOS = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
  'Quinta-feira', 'Sexta-feira', 'Sábado',
]

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

/* Data que o `Date` não conseguiu entender.
 *
 * `new Date('lixo')` não estoura: devolve um Date em que TODO getter é NaN. Aí
 * `MESES[NaN]` é `undefined`, e o `.slice(0, 3)` do `dataCurta` estoura de
 * verdade — a tela inteira morre por causa de uma string torta numa coluna.
 *
 * É a armadilha 10 outra vez, com um vetor no lugar do `Record`: valor vindo do
 * banco indexando direto. Os dois caminhos que chegam aqui leem data crua —
 * `new Date(m.criadaEm)` na conversa e `new Date(s.criadaEm)` na lista de
 * pedidos —, e um `null` numa dessas colunas derrubaria a tela toda.
 *
 * Achado por caso de mesa depois que a função virou testável, não em uso. */
const naoEhData = (d: Date) => Number.isNaN(d.getTime())

/* O que aparece no lugar quando a data não dá para ler.
 *
 * Não é "hoje" e não é uma data chutada: inventar dia numa tela de consulta faz
 * alguém aparecer no consultório no dia errado. Admitir que o app não sabe é a
 * única resposta honesta. */
const SEM_DATA = 'Data desconhecida'

/* 8752 → "8.752" */
export const milhar = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

/* 1.8 → "1,8" */
export const decimal = (n: number, casas = 1) => n.toFixed(casas).replace('.', ',')

/* "Quinta-feira, 26 de Outubro" */
export const dataPorExtenso = (d: Date) =>
  naoEhData(d) ? SEM_DATA : `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`

/* "2026-10-26" — o dia do calendário DO APARELHO, para mandar ao banco.
 *
 * Montada campo a campo, e não com toISOString(): aquele converte para UTC
 * antes de cortar, então às 21h de Brasília ele já devolveria o dia seguinte —
 * e o copo de água registrado à noite cairia no dia errado. */
export const dataISO = (d: Date) =>
  [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')

/* "14:32" */
export const horaCurta = (d: Date) =>
  naoEhData(d)
    ? '--:--' /* guarda o formato, para não desmontar linha apertada */
    : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/* "26/10/2026" */
export const dataNumerica = (d: Date) =>
  naoEhData(d) ? '--/--/----' : [
    String(d.getDate()).padStart(2, '0'),
    String(d.getMonth() + 1).padStart(2, '0'),
    d.getFullYear(),
  ].join('/')

/* "Hoje", "Ontem", ou "Qui, 26 de Out." para o resto.
 *
 * Serve para separar dias numa conversa. Sem isso, a conversa mostra só a hora —
 * e "18:05" de hoje é idêntico a "18:05" de semana passada. Num acompanhamento
 * nutricional isso não é detalhe: "ela respondeu ontem" e "ela respondeu há dez
 * dias" mudam completamente o que a pessoa conclui do silêncio.
 *
 * `hoje` entra por parâmetro para a função não depender do relógio — é o que
 * permite exercitá-la com casos de mesa. */
export function rotuloDoDia(d: Date, hoje: Date): string {
  const mesmoDia = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()

  if (mesmoDia(d, hoje)) return 'Hoje'

  /* Ontem pela DATA, e não por 24 horas: às duas da manhã, uma mensagem das
     dez da noite anterior é de ontem, e não de "hoje há quatro horas". */
  const ontem = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1)
  if (mesmoDia(d, ontem)) return 'Ontem'

  return dataCurta(d)
}

/* "Qui, 26 de Out." */
export const dataCurta = (d: Date) =>
  naoEhData(d)
    ? SEM_DATA
    : `${DIAS_CURTOS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()].slice(0, 3)}.`
