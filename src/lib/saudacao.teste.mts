/* A saudacao pela hora do dia.
 *
 * As bordas sao o que importa: meia-noite e meio-dia caem em cima de uma
 * fronteira cada um, e um >= trocado por > faz o app dizer "boa noite" ao
 * meio-dia -- erro que ninguem ve escrevendo e todo mundo ve usando.
 *
 * Rode com: node --experimental-strip-types src/lib/saudacao.teste.mts */

import { saudacaoDaHora } from './formatar.ts'

let passou = 0
let falhou = 0
const ok = (nome: string, cond: boolean, extra = '') => {
  if (cond) { passou++; console.log('  ok    ' + nome) }
  else { falhou++; console.log('  FALHOU ' + nome + (extra ? '  -> ' + extra : '')) }
}

/* == AS TRES FAIXAS ==================================================== */
{
  ok('7h e bom dia', saudacaoDaHora(7) === 'Bom dia')
  ok('14h e boa tarde', saudacaoDaHora(14) === 'Boa tarde')
  ok('21h e boa noite', saudacaoDaHora(21) === 'Boa noite')
}

/* == AS BORDAS, que e o que se erra ==================================== */
{
  ok('meia-noite e bom dia', saudacaoDaHora(0) === 'Bom dia', saudacaoDaHora(0))
  ok('11h59 ainda e bom dia', saudacaoDaHora(11) === 'Bom dia')
  // A que mais se erra: meio-dia e TARDE, e nao noite nem dia.
  ok('meio-dia e boa tarde', saudacaoDaHora(12) === 'Boa tarde', saudacaoDaHora(12))
  ok('17h ainda e boa tarde', saudacaoDaHora(17) === 'Boa tarde')
  ok('18h ja e boa noite', saudacaoDaHora(18) === 'Boa noite', saudacaoDaHora(18))
  ok('23h e boa noite', saudacaoDaHora(23) === 'Boa noite')
}

/* == HORA IMPOSSIVEL NAO INVENTA ====================================== */
{
  // Armadilha 10 no espirito: valor fora da faixa nao pode virar uma saudacao
  // errada com cara de certa. "Ola" serve a qualquer hora.
  for (const h of [-1, 24, 99, NaN, Infinity]) {
    ok('hora ' + String(h) + ' cai em Ola', saudacaoDaHora(h) === 'Ola', saudacaoDaHora(h))
  }
}

/* == AS TRES COBREM O DIA INTEIRO ===================================== */
{
  const todas = new Set<string>()
  for (let h = 0; h <= 23; h++) todas.add(saudacaoDaHora(h))
  ok('as 24 horas dao tres saudacoes', todas.size === 3, [...todas].join(', '))
  ok('e nenhuma hora real cai em Ola', !todas.has('Ola'))
}

console.log(`\n${passou} passaram, ${falhou} falharam`)
if (falhou > 0) process.exit(1)
