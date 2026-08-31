/* Trocar item do plano pela variacao da nutricionista, com a conta se refazendo.
 *
 * Rode com: node --experimental-strip-types src/lib/trocaNoPlano.teste.mts */

import {
  diferencaDoOriginal,
  escolhidaDe,
  houveTroca,
  proxima,
  totaisDe,
  type ItemComTrocas,
  type Opcao,
} from './trocaNoPlano.ts'

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

const op = (
  nome: string,
  kcal: number | null,
  gramas: number | null,
  prot = 20,
): Opcao => ({
  id: nome,
  nome,
  descricao: '',
  alimentoId: null,
  caloriasPor100g: kcal,
  proteinasPor100g: prot,
  carboidratosPor100g: 10,
  gordurasPor100g: 5,
  fibrasPor100g: 2,
  gramasTotais: gramas,
})

/* Frango 165 kcal/100g em 150 g = 247,5. Peixe 120 em 150 = 180. */
const frangoOuPeixe: ItemComTrocas = {
  opcoes: [op('Frango grelhado', 165, 150), op('Tilapia', 120, 150)],
  escolhida: 0,
}
/* Arroz 130 em 200 g = 260. Sem alternativa. */
const arroz: ItemComTrocas = { opcoes: [op('Arroz cozido', 130, 200)], escolhida: 0 }

console.log('\n1. a conta se refaz')

{
  const t = totaisDe([frangoOuPeixe, arroz])
  ok('total do plano original', t.calorias === 508, String(t.calorias))

  const trocado = [{ ...frangoOuPeixe, escolhida: 1 }, arroz]
  ok('trocando frango por tilapia, o total cai', totaisDe(trocado).calorias === 440,
    String(totaisDe(trocado).calorias))
  /* E a diferenca aparece com sinal, para a tela mostrar "-68 kcal". */
  ok('a diferenca e negativa', diferencaDoOriginal(trocado) === -68,
    String(diferencaDoOriginal(trocado)))
}

{
  /* Trocar para algo MAIS calorico tambem e dito. O app nao esconde a troca
     cara -- e com o numero na frente que a pessoa aprende o custo das proprias
     substituicoes. */
  const caro: ItemComTrocas = {
    opcoes: [op('Peito de frango', 165, 150), op('Picanha', 290, 150)],
    escolhida: 1,
  }
  /* 187, e nao 187,5: a diferenca sai da subtracao dos totais ARREDONDADOS,
     que sao os numeros que aparecem na tela. Se ela ve 435 e 248, a conta que
     ela faz de cabeca da 187 -- e o app dizer 188 seria o app discordar da
     propria tela por meio quilocaloria. */
  ok('troca mais calorica sai positiva', diferencaDoOriginal([caro]) === 187,
    String(diferencaDoOriginal([caro])))

  /* E esta e a propriedade, travada: a diferenca SEMPRE bate com a subtracao
     dos dois numeros mostrados. */
  const comTroca = totaisDe([caro]).calorias
  const semTroca = totaisDe([{ ...caro, escolhida: 0 }]).calorias
  ok('a diferenca bate com o que a tela mostra',
    diferencaDoOriginal([caro]) === comTroca - semTroca,
    `${diferencaDoOriginal([caro])} vs ${comTroca} - ${semTroca}`)
}

{
  ok('sem troca, diferenca zero', diferencaDoOriginal([frangoOuPeixe, arroz]) === 0)
  ok('e houveTroca e falso', !houveTroca([frangoOuPeixe, arroz]))
  ok('com troca, verdadeiro', houveTroca([{ ...frangoOuPeixe, escolhida: 1 }]))
}

{
  /* Os macros acompanham, e nao so a caloria. */
  const t = totaisDe([frangoOuPeixe, arroz])
  ok('proteina soma as duas', t.proteinas === 70, String(t.proteinas))
  ok('carboidrato tambem', t.carboidratos === 35, String(t.carboidratos))
}

console.log('\n2. circular entre as opcoes')

{
  let i = frangoOuPeixe
  ok('comeca no principal', escolhidaDe(i)?.nome === 'Frango grelhado')
  i = proxima(i)
  ok('avanca para a alternativa', escolhidaDe(i)?.nome === 'Tilapia')
  i = proxima(i)
  ok('e volta para o principal', escolhidaDe(i)?.nome === 'Frango grelhado')
}

{
  /* Item sem alternativa nao muda ao ser tocado -- e o toque nao pode quebrar. */
  const antes = arroz
  const depois = proxima(arroz)
  ok('item sem alternativa fica igual', depois === antes)
  ok('e continua escolhendo o unico', escolhidaDe(depois)?.nome === 'Arroz cozido')
}

console.log('\n3. o que nao pode quebrar a conta')

{
  /* Indice fora da lista: sem trava, devolveria undefined e a tela desenharia
     "undefined" no lugar do alimento -- e o total sairia sem ele, calado. */
  const torto: ItemComTrocas = { ...frangoOuPeixe, escolhida: 99 }
  ok('indice alto e aparado', escolhidaDe(torto)?.nome === 'Tilapia', escolhidaDe(torto)?.nome)
  const negativo: ItemComTrocas = { ...frangoOuPeixe, escolhida: -5 }
  ok('indice negativo tambem', escolhidaDe(negativo)?.nome === 'Frango grelhado')
  ok('e o total nao estoura', totaisDe([torto]).calorias === 180, String(totaisDe([torto]).calorias))
}

{
  ok('item sem opcao nenhuma', escolhidaDe({ opcoes: [], escolhida: 0 }) === null)
  ok('e nao entra no total', totaisDe([{ opcoes: [], escolhida: 0 }]).calorias === 0)
  ok('lista vazia', totaisDe([]).calorias === 0)
}

console.log('\n4. null e zero nao sao a mesma coisa')

{
  /* Item 6 do AGENTS.md: alimento sem caloria conhecida NAO soma zero -- ele e
     contado a parte, e a tela DIZ quantos ficaram de fora. Um total calado
     sobre o que faltou e um total em que nao se pode confiar. */
  const semKcal: ItemComTrocas = { opcoes: [op('Cha sem acucar', null, 200)], escolhida: 0 }
  const t = totaisDe([frangoOuPeixe, semKcal])
  ok('o item sem caloria nao vira zero na soma', t.calorias === 248, String(t.calorias))
  ok('e e contado a parte', t.semCalorias === 1, String(t.semCalorias))
}

{
  /* Sem gramas, nao da para aplicar o por-100g. */
  const semPeso: ItemComTrocas = { opcoes: [op('Salada', 25, null)], escolhida: 0 }
  const t = totaisDe([semPeso])
  ok('sem gramas nao soma', t.calorias === 0)
  ok('e conta como sem caloria', t.semCalorias === 1)
}

{
  /* Zero E um fato: cha sem acucar tem 0 kcal em 200 ml. Isso NAO conta como
     desconhecido. */
  const zero: ItemComTrocas = { opcoes: [op('Cha', 0, 200)], escolhida: 0 }
  ok('zero medido nao entra em semCalorias', totaisDe([zero]).semCalorias === 0)
}

{
  const nan: ItemComTrocas = { opcoes: [op('Lixo', NaN, 100)], escolhida: 0 }
  ok('NaN nao contamina', totaisDe([nan]).calorias === 0)
  ok('e conta como desconhecido', totaisDe([nan]).semCalorias === 1)
  const inf: ItemComTrocas = { opcoes: [op('Lixo', 100, Infinity)], escolhida: 0 }
  ok('Infinity nas gramas tambem', totaisDe([inf]).calorias === 0)
}

console.log(`\n${passaram} passaram, ${falharam} falharam`)
if (falharam > 0) process.exit(1)
