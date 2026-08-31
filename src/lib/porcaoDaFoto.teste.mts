/* Reescalar a estimativa da foto: as frações da porção.
 *
 * `comFator` mora em consumo.ts, que puxa o Supabase -- então o teste chama uma
 * cópia da regra com a mesma forma. Não é ideal, e está escrito aqui para quem
 * mexer saber: se `comFator` mudar, este arquivo tem de mudar junto. O corte
 * certo seria a função morar numa lib pura; ela ficou em consumo.ts porque o
 * tipo `Estimativa` mora lá, e mover o tipo arrastaria meia dúzia de telas.
 *
 * Rode com: node --experimental-strip-types src/lib/porcaoDaFoto.teste.mts */

type Estimativa = {
  descricao: string
  porcaoEstimada: string
  calorias: number | null
  proteinas: number | null
  carboidratos: number | null
  gorduras: number | null
  fibras: number | null
  confianca: 'alta' | 'media' | 'baixa'
}

const FRACOES_DA_PORCAO = [
  { fator: 0.5, rotulo: 'metade' },
  { fator: 1, rotulo: 'tudo' },
  { fator: 1.5, rotulo: 'uma vez e meia' },
  { fator: 2, rotulo: 'o dobro' },
] as const

function comFator(e: Estimativa, fator: number): Estimativa {
  if (!Number.isFinite(fator) || fator <= 0 || fator === 1) return e
  const x = (v: number | null) => (v === null ? null : Math.round(v * fator))
  const nome = FRACOES_DA_PORCAO.find(f => f.fator === fator)?.rotulo
  return {
    ...e,
    calorias: x(e.calorias),
    proteinas: x(e.proteinas),
    carboidratos: x(e.carboidratos),
    gorduras: x(e.gorduras),
    fibras: x(e.fibras),
    porcaoEstimada:
      e.porcaoEstimada && nome ? `${nome} de ${e.porcaoEstimada}` : e.porcaoEstimada,
  }
}

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

const PRATO: Estimativa = {
  descricao: 'Arroz, feijão e frango grelhado',
  porcaoEstimada: '1 prato',
  calorias: 620,
  proteinas: 41,
  carboidratos: 72,
  gorduras: 15,
  fibras: 8,
  confianca: 'media',
}

console.log('\n1. a conta')

{
  const m = comFator(PRATO, 0.5)
  ok('metade divide as calorias', m.calorias === 310, String(m.calorias))
  ok('e os macros junto', m.proteinas === 21 && m.carboidratos === 36 && m.gorduras === 8,
    JSON.stringify([m.proteinas, m.carboidratos, m.gorduras]))
  ok('a fibra tambem', m.fibras === 4, String(m.fibras))

  const d = comFator(PRATO, 2)
  ok('o dobro dobra', d.calorias === 1240, String(d.calorias))

  const meio = comFator(PRATO, 1.5)
  ok('uma vez e meia', meio.calorias === 930, String(meio.calorias))
}

{
  /* Arredonda: grama fracionado nao existe na tela. 41 * 0,5 = 20,5 -> 21. */
  ok('arredonda os macros', comFator(PRATO, 0.5).proteinas === 21)
  ok('e nao deixa decimal escapar',
    Object.values(comFator(PRATO, 0.5))
      .filter(v => typeof v === 'number')
      .every(v => Number.isInteger(v)))
}

console.log('\n2. null continua null')

{
  /* Item 6 do AGENTS.md: zero no lugar do desconhecido soma como se fosse
     verdade. O que a IA nao soube dizer nao vira numero por ser multiplicado. */
  const semNada: Estimativa = {
    ...PRATO, calorias: null, proteinas: null, carboidratos: null, gorduras: null, fibras: null,
  }
  const d = comFator(semNada, 2)
  ok('calorias null continua null', d.calorias === null)
  ok('macros null continuam null',
    d.proteinas === null && d.carboidratos === null && d.gorduras === null && d.fibras === null)
}

{
  /* Zero E um fato medido: um cha sem acucar tem 0 kcal. Dobrar zero da zero,
     e nao null. */
  const zerado: Estimativa = { ...PRATO, calorias: 0 }
  ok('zero continua zero, e nao vira null', comFator(zerado, 2).calorias === 0)
}

console.log('\n3. a descricao acompanha o numero')

{
  /* E ela que a pessoa rele depois no diario. "1 prato" que virou metade
     precisa dizer isso, senao o item guarda um texto que contradiz os
     proprios numeros. */
  ok('metade renomeia a porcao',
    comFator(PRATO, 0.5).porcaoEstimada === 'metade de 1 prato',
    comFator(PRATO, 0.5).porcaoEstimada)
  ok('o dobro tambem',
    comFator(PRATO, 2).porcaoEstimada === 'o dobro de 1 prato')
  ok('tudo nao renomeia nada', comFator(PRATO, 1).porcaoEstimada === '1 prato')
  /* Sem porcao original nao ha o que renomear. */
  ok('sem porcao escrita, continua vazia',
    comFator({ ...PRATO, porcaoEstimada: '' }, 0.5).porcaoEstimada === '')
}

console.log('\n4. fator torto nao estraga a estimativa')

{
  ok('fator 1 devolve o mesmo objeto', comFator(PRATO, 1) === PRATO)
  ok('zero nao zera o prato', comFator(PRATO, 0).calorias === 620)
  ok('negativo nao inverte', comFator(PRATO, -2).calorias === 620)
  ok('NaN nao contamina', comFator(PRATO, NaN).calorias === 620)
  ok('Infinity nao estoura', comFator(PRATO, Infinity).calorias === 620)
}

console.log('\n5. as fracoes sao as que se usam falando')

{
  ok('sao quatro', FRACOES_DA_PORCAO.length === 4)
  ok('"tudo" e uma delas, e vale 1',
    FRACOES_DA_PORCAO.some(f => f.fator === 1 && f.rotulo === 'tudo'))
  ok('estao em ordem crescente',
    FRACOES_DA_PORCAO.every((f, i) => i === 0 || f.fator > FRACOES_DA_PORCAO[i - 1].fator))
  /* Nenhuma fracao produz porcentagem quebrada na tela: sao numeros que a
     pessoa fala. Nada de 0,87. */
  ok('nenhuma e um numero estranho',
    FRACOES_DA_PORCAO.every(f => [0.5, 1, 1.5, 2].includes(f.fator)))
  ok('todas tem rotulo em portugues',
    FRACOES_DA_PORCAO.every(f => f.rotulo.length > 3 && f.rotulo === f.rotulo.toLowerCase()))
}

console.log(`\n${passaram} passaram, ${falharam} falharam`)
if (falharam > 0) process.exit(1)
