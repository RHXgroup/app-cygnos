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

/* "Qui, 26 de Out." */
export const dataCurta = (d: Date) =>
  `${DIAS_CURTOS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()].slice(0, 3)}.`
