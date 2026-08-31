/* As metas calculadas: as contas fecham, e o que nao da para calcular fica de
 * fora.
 *
 * Rode com: node --experimental-strip-types src/lib/metasSugeridas.teste.mts */

import { comoFoiCalculado, metasSugeridas } from './metasSugeridas.ts'

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

const MULHER = { pesoKg: 65, alturaCm: 165, idade: 32, sexo: 'F' as const }
const HOMEM = { pesoKg: 82, alturaCm: 178, idade: 35, sexo: 'M' as const }

console.log('\n1. a conta fecha')

{
  /* Mifflin para mulher: 10*65 + 6.25*165 - 5*32 - 161 = 650 + 1031,25 - 160 - 161
     = 1360,25. Vezes 1,375 = 1870,3 -> 1870. */
  const s = metasSugeridas(MULHER)!
  ok('as calorias saem da Mifflin', s.calorias === 1870, String(s.calorias))
  ok('proteina e 1,6 g/kg', s.proteinas === 104, String(s.proteinas))
  ok('a origem e o corpo', s.origem === 'corpo')
}

{
  /* A conta que a pessoa vai fazer no papel: os tres macros TEM de somar a
     caloria alvo. Uma tela que mostra 1870 de meta e macros que dao 2100 perde
     a confianca no primeiro dia. */
  for (const corpo of [MULHER, HOMEM]) {
    const s = metasSugeridas(corpo)!
    const somaDosMacros = s.proteinas * 4 + s.carboidratos * 4 + s.gorduras * 9
    /* Tolerancia de 4 kcal: e o arredondamento de um grama de carboidrato. */
    ok(`os macros somam a caloria alvo (${corpo.sexo})`,
      Math.abs(somaDosMacros - s.calorias) <= 4,
      `${somaDosMacros} vs ${s.calorias}`)
  }
}

{
  const s = metasSugeridas(MULHER)!
  /* 65 kg * 35 ml = 2275, arredondado para os 50 mais proximos = 2300. */
  ok('agua e 35 ml/kg, arredondada', s.aguaMl === 2300, String(s.aguaMl))
  ok('e sempre multipla de 50', metasSugeridas(HOMEM)!.aguaMl % 50 === 0)
  /* 14 g por 1000 kcal. */
  ok('fibra escala com a caloria', s.fibras === 26, String(s.fibras))
}

console.log('\n2. o calculo dela vence o padrao')

{
  const s = metasSugeridas(MULHER, 2200)!
  ok('usa o alvo do calculo energetico', s.calorias === 2200, String(s.calorias))
  ok('e diz que veio de la', s.origem === 'calculo')
  /* A proteina continua saindo do PESO, e nao da caloria: e por kg. */
  ok('a proteina continua por quilo', s.proteinas === 104, String(s.proteinas))
  /* E os macros continuam fechando na caloria nova. */
  const soma = s.proteinas * 4 + s.carboidratos * 4 + s.gorduras * 9
  ok('e os macros fecham na caloria nova', Math.abs(soma - 2200) <= 4, String(soma))
}

{
  /* Com o calculo pronto, altura, idade e sexo deixam de ser necessarios:
     o numero ja veio pronto de la. */
  const s = metasSugeridas({ pesoKg: 70, alturaCm: null, idade: null, sexo: null }, 2000)
  ok('com o calculo, so o peso basta', s !== null && s.calorias === 2000, JSON.stringify(s))
}

console.log('\n3. sem dado nao inventa')

{
  ok('sem peso, nada', metasSugeridas({ ...MULHER, pesoKg: null }) === null)
  ok('sem altura e sem calculo, nada', metasSugeridas({ ...MULHER, alturaCm: null }) === null)
  ok('sem idade, nada', metasSugeridas({ ...MULHER, idade: null }) === null)
  ok('sem sexo, nada', metasSugeridas({ ...MULHER, sexo: null }) === null)
  ok('tudo nulo, nada',
    metasSugeridas({ pesoKg: null, alturaCm: null, idade: null, sexo: null }) === null)
}

{
  /* Dado torto nao vira meta. Altura em METROS e o erro classico. */
  ok('altura 1,65 (em metros) e recusada',
    metasSugeridas({ ...MULHER, alturaCm: 1.65 }) === null)
  ok('altura de 300 cm e recusada', metasSugeridas({ ...MULHER, alturaCm: 300 }) === null)
  ok('idade 5 e recusada', metasSugeridas({ ...MULHER, idade: 5 }) === null)
  ok('idade 130 e recusada', metasSugeridas({ ...MULHER, idade: 130 }) === null)
  ok('peso de 500 kg e recusado', metasSugeridas({ ...MULHER, pesoKg: 500 }) === null)
  ok('peso zero e recusado', metasSugeridas({ ...MULHER, pesoKg: 0 }) === null)
  ok('peso negativo e recusado', metasSugeridas({ ...MULHER, pesoKg: -65 }) === null)
}

{
  ok('NaN no peso', metasSugeridas({ ...MULHER, pesoKg: NaN }) === null)
  ok('Infinity na altura', metasSugeridas({ ...MULHER, alturaCm: Infinity }) === null)
  ok('NaN no alvo cai na conta propria',
    metasSugeridas(MULHER, NaN)?.origem === 'corpo')
  ok('alvo zero tambem cai na conta propria',
    metasSugeridas(MULHER, 0)?.origem === 'corpo')
}

console.log('\n4. o piso e o teto, que existem para o dado torto nao virar meta')

{
  /* Uma senhora muito pequena e muito idosa: a Mifflin pode descer demais.
     Nenhum app deve sugerir menos de 1200 kcal sozinho. */
  const s = metasSugeridas({ pesoKg: 38, alturaCm: 145, idade: 92, sexo: 'F' })
  ok('nunca sugere abaixo de 1200 kcal', s !== null && s.calorias >= 1200, String(s?.calorias))
}

{
  /* E o calculo dela tambem passa pelo teto: um alvo de 20.000 e erro de
     digitacao la, e nao pode atravessar para ca. */
  const s = metasSugeridas(HOMEM, 20000)
  ok('o teto vale tambem para o alvo do calculo', s !== null && s.calorias === 4500,
    String(s?.calorias))
}

{
  /* Carboidrato nunca fica negativo. Com caloria no piso e peso alto, a
     proteina sozinha pode passar do total. */
  const s = metasSugeridas({ pesoKg: 150, alturaCm: 150, idade: 90, sexo: 'F' })
  ok('carboidrato nunca e negativo', s !== null && s.carboidratos >= 0, String(s?.carboidratos))
}

console.log('\n5. o que NAO e calculado, e por que')

{
  /* Passos, treinos por semana e sono nao saem de peso e altura -- saem da vida
     dela. Sugerir "4 treinos por semana" para quem nunca treinou e inventar uma
     meta que ela falha na primeira semana, e falhar numa meta que ela nao
     escolheu e o jeito mais rapido de o app virar fonte de culpa. */
  const s = metasSugeridas(MULHER)! as unknown as Record<string, unknown>
  ok('nao sugere passos', !('passos' in s))
  ok('nao sugere treinos por semana', !('treinosSemana' in s))
  ok('nao sugere horas de sono', !('sonoHoras' in s))
}

console.log('\n6. a frase diz de onde veio')

{
  const doCorpo = comoFoiCalculado(metasSugeridas(MULHER)!)
  const doCalculo = comoFoiCalculado(metasSugeridas(MULHER, 2200)!)
  ok('as duas frases sao diferentes', doCorpo !== doCalculo)
  ok('a do corpo cita peso e altura',
    doCorpo.includes('peso') && doCorpo.includes('altura'), doCorpo)
  ok('e avisa que atividade maior muda o numero',
    doCorpo.toLowerCase().includes('treina'), doCorpo)
  ok('a do calculo cita o calculo energetico',
    doCalculo.toLowerCase().includes('cálculo energético'), doCalculo)
  /* Nenhuma promete precisao que a conta nao tem. */
  for (const f of [doCorpo, doCalculo]) {
    ok('nao promete exatidao', !f.toLowerCase().includes('exat') && !f.includes('preciso'), f)
  }
}

console.log(`\n${passaram} passaram, ${falharam} falharam`)
if (falharam > 0) process.exit(1)
