/* O que ela digita virando data -- e o relógio parado, que é o ponto.
 *
 * A regra do ano só dá para exercitar de verdade com o relógio na mão: metade
 * dos casos que importam acontecem em 28 de dezembro, e esperar dezembro não é
 * plano de teste. */

import { interpretarRemarcacao, mascaraDeData, mascaraDeHora } from './remarcacao.ts'

let passou = 0
const falhas: string[] = []

function ok(nome: string, condicao: boolean) {
  if (condicao) passou++
  else falhas.push(nome)
}

const SETEMBRO = new Date(2026, 8, 9, 11, 0, 0)   // 09/09/2026, quarta, 11:00
const DEZEMBRO = new Date(2026, 11, 28, 20, 0, 0) // 28/12/2026, 20:00

// ──── As máscaras ────
ok('data: 1 digito', mascaraDeData('1') === '1')
ok('data: 2 digitos', mascaraDeData('16') === '16')
ok('data: a barra entra sozinha', mascaraDeData('160') === '16/0')
ok('data: dia e mes', mascaraDeData('1609') === '16/09')
ok('data: com ano', mascaraDeData('16092026') === '16/09/2026')
ok('data: letra nao entra', mascaraDeData('16a09') === '16/09')
ok('data: nao passa de 8 digitos', mascaraDeData('1609202699') === '16/09/2026')
ok('data: vazio continua vazio', mascaraDeData('') === '')
ok('data: apagar a barra apaga o digito', mascaraDeData('16/') === '16')
ok('hora: 2 digitos', mascaraDeHora('14') === '14')
ok('hora: os dois pontos entram sozinhos', mascaraDeHora('143') === '14:3')
ok('hora: completa', mascaraDeHora('1430') === '14:30')
ok('hora: virgula nao entra', mascaraDeHora('14,30') === '14:30')
ok('hora: nao passa de 4 digitos', mascaraDeHora('143099') === '14:30')

// ──── O caminho feliz ────
const r1 = interpretarRemarcacao('16/09', '14:30', SETEMBRO)
ok('setembro: 16/09 14:30 aceita', r1.tipo === 'ok')
ok('setembro: vira 16 de setembro', r1.tipo === 'ok' && r1.quando.getDate() === 16 && r1.quando.getMonth() === 8)
ok('setembro: guarda a hora', r1.tipo === 'ok' && r1.quando.getHours() === 14 && r1.quando.getMinutes() === 30)
ok('setembro: ano corrente', r1.tipo === 'ok' && r1.quando.getFullYear() === 2026)
ok('setembro: segundos zerados', r1.tipo === 'ok' && r1.quando.getSeconds() === 0)

// ──── A REGRA DO ANO ────
const r2 = interpretarRemarcacao('05/01', '09:00', DEZEMBRO)
ok('dezembro: 05/01 vira o ANO QUE VEM', r2.tipo === 'ok' && r2.quando.getFullYear() === 2027)
ok('dezembro: 05/01 e 5 de janeiro', r2.tipo === 'ok' && r2.quando.getMonth() === 0 && r2.quando.getDate() === 5)

const r3 = interpretarRemarcacao('30/12', '09:00', DEZEMBRO)
ok('dezembro: 30/12 continua neste ano', r3.tipo === 'ok' && r3.quando.getFullYear() === 2026)

const r4 = interpretarRemarcacao('01/09', '09:00', SETEMBRO)
ok('setembro: 01/09 ja passou, vai para 2027', r4.tipo === 'ok' && r4.quando.getFullYear() === 2027)

/* Hoje mais tarde continua sendo hoje: 09/09 as 18:00, pedido as 11:00, e o ano
   NAO pula. Este e o caso que uma regra escrita as pressas erra -- ela olharia
   so a data e mandaria para 2027. */
const r5 = interpretarRemarcacao('09/09', '18:00', SETEMBRO)
ok('hoje mais tarde continua sendo hoje', r5.tipo === 'ok' && r5.quando.getFullYear() === 2026 && r5.quando.getDate() === 9)

/* E hoje mais CEDO vai para o ano que vem, o que parece estranho e esta certo:
   o banco recusaria o passado, e a recusa dele ("so da para remarcar para uma
   data que ainda nao passou") diz mais do que uma recusa daqui. */
const r6 = interpretarRemarcacao('09/09', '08:00', SETEMBRO)
ok('hoje mais cedo nao vira passado silencioso', r6.tipo === 'ok' && r6.quando.getFullYear() === 2027)

// ──── O ANO DIGITADO ganha ────
const r7 = interpretarRemarcacao('16/09/2028', '14:30', SETEMBRO)
ok('ano digitado vale', r7.tipo === 'ok' && r7.quando.getFullYear() === 2028)
const r8 = interpretarRemarcacao('16/09/2020', '14:30', SETEMBRO)
ok('ano digitado no passado NAO e corrigido escondido', r8.tipo === 'ok' && r8.quando.getFullYear() === 2020)

// ──── O TRANSBORDO, que e o defeito caro ────
/* `new Date(2026, 1, 31)` nao estoura: vira 03/03. Sem a conferencia de volta,
   31/02 viraria uma consulta em marco -- marcada, sem erro, sem ninguem ver. */
const r9 = interpretarRemarcacao('31/02', '14:30', SETEMBRO)
ok('31 de fevereiro e recusado, e nao vira marco', r9.tipo === 'erro')
const r10 = interpretarRemarcacao('31/04', '14:30', SETEMBRO)
ok('31 de abril e recusado', r10.tipo === 'erro')
const r11 = interpretarRemarcacao('31/09', '14:30', SETEMBRO)
ok('31 de setembro e recusado', r11.tipo === 'erro')
const r12 = interpretarRemarcacao('30/01', '14:30', SETEMBRO)
ok('30 de janeiro existe', r12.tipo === 'ok' && r12.quando.getMonth() === 0)

/* 29/02: 2027 nao e bissexto, 2028 e. Digitado sem ano em 2026 (bissexto), o
   ano corrente ja passou (fevereiro < setembro), entao tenta 2027 -- e recusa.
   Esta e a fronteira da regra, e ela esta documentada em vez de escondida. */
const r13 = interpretarRemarcacao('29/02/2028', '14:30', SETEMBRO)
ok('29/02/2028 existe (bissexto)', r13.tipo === 'ok')
const r14 = interpretarRemarcacao('29/02/2027', '14:30', SETEMBRO)
ok('29/02/2027 nao existe', r14.tipo === 'erro')

// ──── Entrada torta ────
ok('data vazia pede a data', interpretarRemarcacao('', '14:30', SETEMBRO).tipo === 'erro')
ok('hora vazia pede a hora', interpretarRemarcacao('16/09', '', SETEMBRO).tipo === 'erro')
ok('data pela metade pede a data', interpretarRemarcacao('16/', '14:30', SETEMBRO).tipo === 'erro')
ok('hora pela metade pede a hora', interpretarRemarcacao('16/09', '14:', SETEMBRO).tipo === 'erro')
ok('mes 00 recusado', interpretarRemarcacao('16/00', '14:30', SETEMBRO).tipo === 'erro')
ok('mes 13 recusado', interpretarRemarcacao('16/13', '14:30', SETEMBRO).tipo === 'erro')
ok('dia 00 recusado', interpretarRemarcacao('00/09', '14:30', SETEMBRO).tipo === 'erro')
ok('dia 32 recusado', interpretarRemarcacao('32/09', '14:30', SETEMBRO).tipo === 'erro')
ok('hora 24 recusada', interpretarRemarcacao('16/09', '24:00', SETEMBRO).tipo === 'erro')
ok('minuto 60 recusado', interpretarRemarcacao('16/09', '14:60', SETEMBRO).tipo === 'erro')
ok('hora 23:59 aceita', interpretarRemarcacao('16/09', '23:59', SETEMBRO).tipo === 'ok')
ok('meia-noite aceita', interpretarRemarcacao('16/09', '00:00', SETEMBRO).tipo === 'ok')
ok('ano 1899 recusado', interpretarRemarcacao('16/09/1899', '14:30', SETEMBRO).tipo === 'erro')
ok('ano 2101 recusado', interpretarRemarcacao('16/09/2101', '14:30', SETEMBRO).tipo === 'erro')

/* Nenhuma mensagem de erro pode sair com podridao de JavaScript dentro -- ela
   le essa frase inteira, e "undefined" nela e o app dizendo que quebrou. */
for (const [dt, hr] of [['', ''], ['aa', 'bb'], ['99/99', '99:99'], ['31/02', '25:00']]) {
  const r = interpretarRemarcacao(dt, hr, SETEMBRO)
  ok('sem podridao em "' + dt + ' ' + hr + '"',
    r.tipo === 'erro' && !/undefined|null|NaN|\[object/.test(r.mensagem) && r.mensagem.length > 5)
}

console.log(passou + ' passaram, ' + falhas.length + ' falharam')
if (falhas.length) {
  for (const f of falhas) console.log('  FALHOU: ' + f)
  process.exit(1)
}
