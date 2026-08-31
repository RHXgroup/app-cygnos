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

/* 8752 → "8.752" */
export const milhar = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

/* 1.8 → "1,8" */
export const decimal = (n: number, casas = 1) => n.toFixed(casas).replace('.', ',')

/* "Quinta-feira, 26 de Outubro" */
export const dataPorExtenso = (d: Date) =>
  `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`

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
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/* "26/10/2026" */
export const dataNumerica = (d: Date) =>
  [
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
  `${DIAS_CURTOS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()].slice(0, 3)}.`
