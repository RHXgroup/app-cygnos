/* A evolucao de uma circunferencia.
 *
 * Rode com: node --experimental-strip-types src/lib/evolucaoDaMedida.teste.mts */

import {
  evolucaoDaMedida,
  fraseDaVariacao,
  serieDaMedida,
  valorDa,
} from './evolucaoDaMedida.ts'
import type { Medida } from './medidas'

let passaram = 0
let falharam = 0

function ok(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) {
    passaram++
    console.log('  ok    ' + nome)
  } else {
    falharam++
    console.log('  FALHA ' + nome + (detalhe ? '  -> ' + detalhe : ''))
  }
}

const m = (
  data: string,
  cintura: number | null = null,
  quadril: number | null = null,
  braco: number | null = null,
): Medida => ({ id: data, data, cinturaCm: cintura, quadrilCm: quadril, bracoCm: braco })

console.log('\nQual coluna e qual parte')

{
  const x = m('2026-09-01', 84, 100, 32)
  ok('cintura', valorDa(x, 'cintura') === 84)
  ok('quadril', valorDa(x, 'quadril') === 100)
  ok('braco', valorDa(x, 'braco') === 32)
}

console.log('\nA evolucao')

{
  const ms = [m('2026-07-01', 90), m('2026-08-01', 87), m('2026-09-01', 84.5)]
  const e = evolucaoDaMedida(ms, 'cintura')
  ok('pega a mais recente como atual', e?.atual === 84.5)
  ok('e a mais antiga como primeira', e?.primeira === 90)
  ok('a variacao e negativa quando diminuiu', e?.variacaoCm === -5.5)
  ok('conta quantas entraram', e?.quantas === 3)
  ok('e diz as datas das pontas', e?.dataPrimeira === '2026-07-01' && e?.dataAtual === '2026-09-01')
}

{
  /* A ordem da lista nao decide: `carregarMedidas` devolve da mais recente para
     a mais antiga, e um dia alguem inverte. */
  const ms = [m('2026-09-01', 84.5), m('2026-07-01', 90), m('2026-08-01', 87)]
  const e = evolucaoDaMedida(ms, 'cintura')
  ok('a ordem da lista nao muda o resultado', e?.atual === 84.5 && e?.primeira === 90)
}

{
  const ms = [m('2026-07-01', null, null, 30), m('2026-09-01', null, null, 33)]
  const e = evolucaoDaMedida(ms, 'braco')
  ok('aumentar tambem e evolucao', e?.variacaoCm === 3)
}

console.log('\nSo conta a parte que foi medida')

{
  /* Quem mediu a cintura em tres dias e o braco em um tem evolucao de cintura e
     nao de braco. Misturar compararia a cintura de julho com o braco de agosto. */
  const ms = [m('2026-07-01', 90), m('2026-08-01', 87), m('2026-09-01', 84, null, 32)]
  ok('cintura tem tres', evolucaoDaMedida(ms, 'cintura')?.quantas === 3)
  ok('braco tem uma, entao nao tem evolucao', evolucaoDaMedida(ms, 'braco') === null)
  ok('quadril nao tem nenhuma', evolucaoDaMedida(ms, 'quadril') === null)
}

{
  /* Com uma so nao ha evolucao -- ha um numero. Mostrar "0,0 cm" como
     estabilidade seria afirmar sobre um periodo que nao foi observado. */
  ok('uma medicao nao vira evolucao', evolucaoDaMedida([m('2026-09-01', 84)], 'cintura') === null)
  ok('nenhuma tambem nao', evolucaoDaMedida([], 'cintura') === null)
}

console.log('\nA frase, e o que ela NAO diz')

{
  ok('diminuiu', fraseDaVariacao(evolucaoDaMedida([m('2026-07-01', 90), m('2026-09-01', 84.5)], 'cintura')) === '5,5 cm a menos')
  ok('aumentou', fraseDaVariacao(evolucaoDaMedida([m('2026-07-01', 30, null, null), m('2026-09-01', 32)], 'cintura')) === '2,0 cm a mais')
}

{
  /* Meio centimetro e a precisao de quem mede com fita em casa: abaixo disso a
     diferenca e a mao, e nao o corpo. */
  const quase = evolucaoDaMedida([m('2026-07-01', 84), m('2026-09-01', 84.3)], 'cintura')
  ok('0,3 cm e "sem mudanca"', fraseDaVariacao(quase) === 'Sem mudança no período')
  const meio = evolucaoDaMedida([m('2026-07-01', 84), m('2026-09-01', 84.5)], 'cintura')
  ok('0,5 cm ja e mudanca', fraseDaVariacao(meio) === '0,5 cm a mais')
}

{
  /* Sem julgamento nenhum: aumentar braco e objetivo de gente, diminuir cintura
     e objetivo de outra. Quem interpreta e ela com a profissional. */
  const proibidas = ['parabéns', 'parabens', 'ótimo', 'otimo', 'ruim', 'piorou', 'melhorou', 'cuidado']
  const frases = [
    fraseDaVariacao(evolucaoDaMedida([m('2026-07-01', 90), m('2026-09-01', 84)], 'cintura')),
    fraseDaVariacao(evolucaoDaMedida([m('2026-07-01', 84), m('2026-09-01', 92)], 'cintura')),
  ].filter((f): f is string => f !== null)
  ok('nenhuma julga', frases.every(f => !proibidas.some(x => f.toLowerCase().includes(x))))
  ok('e as duas existem', frases.length === 2)
}

{
  ok('sem evolucao, sem frase', fraseDaVariacao(null) === null)
}

console.log('\nA serie do grafico')

{
  const ms = [m('2026-09-01', 84), m('2026-07-01', 90), m('2026-08-01', 87)]
  const s = serieDaMedida(ms, 'cintura')
  ok('sai da mais antiga para a mais recente', s[0] === 90 && s[2] === 84)
  ok('e so a parte pedida', serieDaMedida(ms, 'braco').length === 0)
}

{
  /* Sem preencher buraco: medicao e quinzenal, e inventar os treze dias entre
     duas desenharia uma reta que ninguem mediu. */
  const ms = [m('2026-07-01', 90), m('2026-09-01', 84)]
  ok('dois pontos continuam dois', serieDaMedida(ms, 'cintura').length === 2)
}

console.log('\nO que chega torto')

{
  ok('lista nula nao estoura', evolucaoDaMedida(null as unknown as Medida[], 'cintura') === null)
  ok('serie de lista nula tambem', serieDaMedida(null as unknown as Medida[], 'cintura').length === 0)
}

{
  const sujo = [
    null,
    { id: 'x', data: 42, cinturaCm: 84, quadrilCm: null, bracoCm: null },
    m('2026-07-01', 90),
    m('2026-09-01', 84),
  ] as unknown as Medida[]
  const e = evolucaoDaMedida(sujo, 'cintura')
  ok('linha nula e data que nao e texto ficam de fora', e?.quantas === 2)
  ok('e o resultado continua certo', e?.variacaoCm === -6)
}

{
  /* Duas medidas dentro da faixa ainda podem produzir variacao absurda se uma
     delas vier torta -- e um numero nao finito atravessaria a tela. */
  const infinita = [m('2026-07-01', Infinity), m('2026-09-01', 84)]
  const e = evolucaoDaMedida(infinita, 'cintura')
  ok('variacao nao finita vira nulo', e === null || Number.isFinite(e.variacaoCm))
}

console.log(`\n${passaram} passaram, ${falharam} falharam`)
if (falharam > 0) process.exit(1)
