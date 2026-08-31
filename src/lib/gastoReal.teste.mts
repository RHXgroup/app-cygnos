/* O gasto medido, e nao calculado por formula.
 *
 * A conta e aritmetica simples e os dois lados dela sao frageis. A maior parte
 * destes casos exercita QUANDO ELA NAO PODE SER FEITA.
 *
 * Rode com: node --experimental-strip-types src/lib/gastoReal.teste.mts */

import { fraseDoGasto, gastoReal } from './gastoReal.ts'

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

/* Dias seguidos a partir de 2026-08-01. */
const d = (n: number) => {
  const x = new Date(Date.UTC(2026, 7, 1 + n))
  return x.toISOString().slice(0, 10)
}
const consumoFixo = (quantos: number, kcal: number) =>
  Array.from({ length: quantos }, (_, i) => ({ data: d(i), calorias: kcal }))
const pesoLinear = (quantos: number, de: number, ate: number) =>
  Array.from({ length: quantos }, (_, i) => ({
    data: d(i),
    tendencia: de + ((ate - de) * i) / (quantos - 1),
  }))

console.log('\n1. a conta')

{
  /* Comeu 2000/dia por 28 dias e o peso nao mudou -> o gasto E 2000, nao
     importa o que a formula diga. */
  const g = gastoReal(consumoFixo(28, 2000), pesoLinear(28, 75, 75))!
  ok('peso estavel: gasto = consumo', g.kcal === 2000, String(g.kcal))
  ok('e diz quantos dias entraram', g.diasRegistrados === 28)
  ok('e a media consumida', g.mediaConsumida === 2000)
}

{
  /* Perdeu 2 kg em 28 dias comendo 2000. 2 kg = 15.400 kcal / 28 = 550/dia.
     Gasto = 2000 + 550 = 2550. */
  const g = gastoReal(consumoFixo(28, 2000), pesoLinear(28, 77, 75))!
  ok('perdendo peso, o gasto e MAIOR que o consumo', g.kcal === 2550, String(g.kcal))
  ok('e a variacao aparece negativa', g.variacaoKg === -2, String(g.variacaoKg))
}

{
  /* Ganhou 1 kg em 28 dias comendo 2500. 7700/28 = 275. Gasto = 2500 - 275. */
  const g = gastoReal(consumoFixo(28, 2500), pesoLinear(28, 70, 71))!
  ok('ganhando peso, o gasto e MENOR que o consumo', g.kcal === 2225, String(g.kcal))
}

{
  /* O SINAL. Trocar produziria gasto menor para quem emagrece -- e ninguem
     confere, porque o numero continua plausivel. Este e o caso que pega. */
  const perdendo = gastoReal(consumoFixo(28, 2000), pesoLinear(28, 77, 75))!
  const ganhando = gastoReal(consumoFixo(28, 2000), pesoLinear(28, 75, 77))!
  ok('quem perde tem gasto maior que quem ganha, comendo o mesmo',
    perdendo.kcal > ganhando.kcal, `${perdendo.kcal} vs ${ganhando.kcal}`)
}

console.log('\n2. quando a conta NAO pode ser feita')

{
  ok('13 dias registrados nao bastam',
    gastoReal(consumoFixo(13, 2000), pesoLinear(13, 75, 75)) === null)
  ok('14 ja bastam',
    gastoReal(consumoFixo(14, 2000), pesoLinear(14, 75, 75)) !== null)
}

{
  /* COBERTURA: 14 dias registrados dentro de 60 nao e media -- sao os dias em
     que ela lembrou de registrar, e lembrar correlaciona com ter comido bem. */
  const esparso = Array.from({ length: 14 }, (_, i) => ({ data: d(i * 4), calorias: 1800 }))
  ok('14 dias espalhados em 53 nao viram media',
    gastoReal(esparso, pesoLinear(54, 75, 74)) === null)
  /* Mas 40 dentro de 54 sim (74%). */
  const denso = Array.from({ length: 40 }, (_, i) => ({ data: d(i), calorias: 1800 }))
  ok('40 dias dentro de 54 valem', gastoReal(denso, pesoLinear(54, 75, 74)) !== null)
}

{
  ok('sem peso nenhum', gastoReal(consumoFixo(28, 2000), []) === null)
  ok('um ponto de peso so', gastoReal(consumoFixo(28, 2000), [{ data: d(0), tendencia: 75 }]) === null)
  ok('sem consumo', gastoReal([], pesoLinear(28, 75, 75)) === null)
  ok('tudo vazio', gastoReal([], []) === null)
}

{
  /* Diario e peso em periodos que NAO se cruzam: sem intersecao nao ha conta.
     Sem isso, um mes de diario sem pesagem entraria dividindo por dias em que
     ninguem sabe o que o peso fez. */
  const consumo = Array.from({ length: 20 }, (_, i) => ({ data: d(i), calorias: 2000 }))
  const peso = Array.from({ length: 20 }, (_, i) => ({ data: d(i + 60), tendencia: 75 }))
  ok('periodos que nao se cruzam', gastoReal(consumo, peso) === null)
}

console.log('\n3. numero torto nao vira meta')

{
  const p = pesoLinear(28, 75, 75)
  ok('calorias nulas sao ignoradas',
    gastoReal(consumoFixo(28, 2000).map((x, i) => (i < 20 ? { ...x, calorias: null } : x)), p) === null)
  ok('NaN', gastoReal(consumoFixo(28, NaN), p) === null)
  ok('Infinity', gastoReal(consumoFixo(28, Infinity), p) === null)
  ok('zero nao conta como dia registrado', gastoReal(consumoFixo(28, 0), p) === null)
  ok('data invalida', gastoReal(consumoFixo(28, 2000).map(x => ({ ...x, data: 'lixo' })), p) === null)
}

{
  /* Perda absurda: 20 kg em 28 dias daria um gasto de 7500 kcal. Fora da faixa
     humana -> null, em vez de virar meta. */
  ok('perda absurda nao vira gasto',
    gastoReal(consumoFixo(28, 2000), pesoLinear(28, 95, 75)) === null)
  /* E consumo absurdo tambem. */
  ok('consumo absurdo nao vira gasto',
    gastoReal(consumoFixo(28, 9000), pesoLinear(28, 75, 75)) === null)
  /* Diario quase vazio com peso caindo: gasto abaixo do minimo. */
  ok('gasto abaixo de 1000 e recusado',
    gastoReal(consumoFixo(28, 900), pesoLinear(28, 75, 75)) === null)
}

{
  /* Tendencia com valor invalido nao entra. */
  const p = pesoLinear(28, 75, 74).map((x, i) => (i === 5 ? { ...x, tendencia: NaN } : x))
  const g = gastoReal(consumoFixo(28, 2000), p)
  ok('ponto de peso NaN e descartado sem derrubar', g !== null, JSON.stringify(g))
}

console.log('\n4. a frase diz de onde o numero veio')

{
  const g = gastoReal(consumoFixo(28, 2000), pesoLinear(28, 77, 75))!
  const f = fraseDoGasto(g)
  /* A entrada e o diario, que subestima de 20 a 30% em qualquer populacao
     medida. Dizer isso nao enfraquece o numero -- e o que o torna utilizavel.
     Quem nao sabe disso conclui que o app esta errado ao comparar com outra
     fonte. */
  ok('diz que veio do que ela REGISTROU', f.includes('registrou'), f)
  ok('e que NAO e formula', f.toLowerCase().includes('fórmula'), f)
  ok('traz o gasto', f.includes('2550'), f)
  ok('traz a media consumida', f.includes('2000'), f)
  ok('e diz o movimento do peso', f.includes('perdendo'), f)
  ok('em semanas, e nao em dias soltos', f.includes('4 semanas'), f)
}

{
  const estavel = fraseDoGasto(gastoReal(consumoFixo(28, 2000), pesoLinear(28, 75, 75))!)
  ok('peso estavel e dito como estavel', estavel.includes('estável'), estavel)
  const ganho = fraseDoGasto(gastoReal(consumoFixo(28, 2500), pesoLinear(28, 70, 71))!)
  ok('ganho e dito como ganho', ganho.includes('ganhando'), ganho)
  /* Nenhuma culpa: ganhar peso nao e erro, e a frase e sobre metabolismo. */
  const proibidas = ['exagerou', 'errou', 'culpa', 'descuido', 'deveria']
  ok('a frase de ganho nao culpa',
    !proibidas.some(x => ganho.toLowerCase().includes(x)), ganho)
}

console.log(`\n${passaram} passaram, ${falharam} falharam`)
if (falharam > 0) process.exit(1)
