/* O "quando" do aviso, com o relógio parado.
 *
 * Rode com: node --experimental-strip-types src/lib/quandoDoAviso.teste.mts */

import { quandoDoAviso, quandoPorExtenso } from './quandoDoAviso.ts'

let passou = 0
const falhas: string[] = []
function ok(nome: string, condicao: boolean) {
  if (condicao) passou++
  else falhas.push(nome)
}

/* Quarta, 09/09/2026, 14:00. */
const AGORA = new Date(2026, 8, 9, 14, 0, 0)
const certo = (txt: string) => {
  const r = quandoDoAviso(txt, AGORA)
  return r.tipo === 'ok' ? r.quando : null
}
const hhmm = (x: Date | null) =>
  x ? String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0') : ''
const dma = (x: Date | null) =>
  x ? String(x.getDate()).padStart(2, '0') + '/' + String(x.getMonth() + 1).padStart(2, '0') : ''

// ──── DAQUI A TANTO ────
ok('2h', hhmm(certo('2h')) === '16:00')
ok('2 h com espaco', hhmm(certo('2 h')) === '16:00')
ok('2hs', hhmm(certo('2hs')) === '16:00')
ok('2 horas', hhmm(certo('2 horas')) === '16:00')
ok('daqui 2h', hhmm(certo('daqui 2h')) === '16:00')
ok('daqui a 2h', hhmm(certo('daqui a 2h')) === '16:00')
ok('2h30', hhmm(certo('2h30')) === '16:30')
ok('1h05 zera a esquerda', hhmm(certo('1h05')) === '15:05')
ok('30min', hhmm(certo('30min')) === '14:30')
ok('90 min atravessa a hora', hhmm(certo('90 min')) === '15:30')
ok('45 minutos', hhmm(certo('45 minutos')) === '14:45')
ok('MAIUSCULA tambem', hhmm(certo('2H')) === '16:00')

/* A virada do DIA e a do ANO, que sao o que uma conta feita a mao erra. */
ok('12h atravessa a meia-noite', dma(certo('12h')) === '10/09')
{
  const reveillon = new Date(2026, 11, 31, 23, 0, 0)
  const r = quandoDoAviso('2h', reveillon)
  ok('ano novo: 31/12 as 23h mais 2h vira 01/01',
    r.tipo === 'ok' && r.quando.getFullYear() === 2027 && r.quando.getDate() === 1)
}

// ──── O NUMERO SOLTO e ambiguo, e a funcao PERGUNTA ────
{
  const r = quandoDoAviso('2', AGORA)
  ok('so o numero nao e adivinhado', r.tipo === 'erro')
  ok('e a recusa diz o que escrever',
    r.tipo === 'erro' && r.mensagem.includes('2h'))
}

// ──── RELOGIO ────
ok('16:30 e hoje', hhmm(certo('16:30')) === '16:30' && dma(certo('16:30')) === '09/09')
ok('as 16:30 com "as"', dma(certo('as 16:30')) === '09/09')
ok('09:00 ja passou, entao e amanha', dma(certo('09:00')) === '10/09')
ok('e a hora continua a mesma', hhmm(certo('09:00')) === '09:00')
{
  /* O minuto EXATO em que se esta: um aviso para agora nasce vencido e o
     sistema nao o dispara -- ela esperaria um alerta que nunca vem. */
  ok('14:00 agora mesmo vai para amanha', dma(certo('14:00')) === '10/09')
  ok('14:01 ainda e hoje', dma(certo('14:01')) === '09/09')
}
ok('00:00 vai para amanha', dma(certo('00:00')) === '10/09')
ok('23:59 ainda e hoje', dma(certo('23:59')) === '09/09')
ok('24:00 nao existe', quandoDoAviso('24:00', AGORA).tipo === 'erro')
ok('16:60 nao existe', quandoDoAviso('16:60', AGORA).tipo === 'erro')

// ──── AMANHA ────
ok('amanha 09:00', dma(certo('amanha 09:00')) === '10/09' && hhmm(certo('amanha 09:00')) === '09:00')
ok('amanha as 9', hhmm(certo('amanha as 9')) === '09:00')
ok('amanha 9h', hhmm(certo('amanha 9h')) === '09:00')
ok('amanha com til', dma(certo('amanhã 09:00')) === '10/09')
ok('amanha às com acento', hhmm(certo('amanhã às 09:00')) === '09:00')
ok('amanha 25:00 nao existe', quandoDoAviso('amanha 25:00', AGORA).tipo === 'erro')
{
  /* Amanha atravessando o mes. */
  const ultimoDia = new Date(2026, 8, 30, 14, 0, 0)
  const r = quandoDoAviso('amanha 09:00', ultimoDia)
  ok('30/09 + amanha = 01/10', r.tipo === 'ok' && r.quando.getDate() === 1 && r.quando.getMonth() === 9)
}

// ──── O TETO ────
ok('10000h e recusado', quandoDoAviso('10000h', AGORA).tipo === 'erro')
/* O ERRO DE DIGITACAO que o teto existe para pegar: `1000h` no lugar de
   `10:00`. Sao 41 dias -- passava com o teto de um ano que eu tinha escrito, e
   o proprio comentario da constante dizia que nao devia passar. O teste bateu
   nos dois e mostrou que nao concordavam. */
ok('1000h (o erro de digitacao) e recusado', quandoDoAviso('1000h', AGORA).tipo === 'erro')
ok('e a recusa manda para a agenda',
  (() => { const r = quandoDoAviso('1000h', AGORA); return r.tipo === 'erro' && r.mensagem.includes('agenda') })())
ok('720h (30 dias em ponto) ainda cabe', quandoDoAviso('720h', AGORA).tipo === 'ok')
ok('721h nao cabe', quandoDoAviso('721h', AGORA).tipo === 'erro')
ok('0h nao e "daqui a algum tempo"', quandoDoAviso('0h', AGORA).tipo === 'erro')
ok('0min tambem nao', quandoDoAviso('0min', AGORA).tipo === 'erro')

// ──── O QUE ELA NAO FAZ, e recusa dizendo ────
for (const frase of ['depois do almoco', 'quando eu chegar', 'mais tarde', 'segunda']) {
  const r = quandoDoAviso(frase, AGORA)
  ok('nao adivinha "' + frase + '"', r.tipo === 'erro')
}

// ──── Entrada torta: nada pode virar frase quebrada nem data invalida ────
for (const lixo of ['', '   ', 'abc', '::', '99:99', '-2h', 'NaN', 'undefined', '2h99']) {
  const r = quandoDoAviso(lixo, AGORA)
  ok('sem podridao em "' + lixo + '"',
    r.tipo === 'erro'
      ? !/undefined|NaN|Invalid|\[object/.test(r.mensagem) && r.mensagem.length > 5
      : !Number.isNaN(r.quando.getTime()))
}

// ──── quandoPorExtenso ────
ok('hoje', quandoPorExtenso(new Date(2026, 8, 9, 16, 30), AGORA) === 'hoje às 16:30')
ok('amanha', quandoPorExtenso(new Date(2026, 8, 10, 9, 0), AGORA) === 'amanhã às 09:00')
ok('dentro da semana traz o dia', quandoPorExtenso(new Date(2026, 8, 15, 14, 0), AGORA).startsWith('terça, 15/09'))
ok('longe traz so a data', quandoPorExtenso(new Date(2026, 11, 3, 14, 0), AGORA) === '03/12 às 14:00')
ok('data invalida devolve vazio', quandoPorExtenso(new Date('lixo'), AGORA) === '')
{
  /* Meia-noite e hoje ate as 23:59, e amanha a partir das 00:00 -- a conta e
     por DIA do calendario, e nao por 24 horas. */
  const quaseMeiaNoite = new Date(2026, 8, 9, 23, 50, 0)
  ok('00:10 visto de 23:50 e AMANHA, e nao "daqui 20 min"',
    quandoPorExtenso(new Date(2026, 8, 10, 0, 10), quaseMeiaNoite) === 'amanhã às 00:10')
}

console.log(passou + ' passaram, ' + falhas.length + ' falharam')
if (falhas.length) {
  for (const f of falhas) console.log('  FALHOU: ' + f)
  process.exit(1)
}
