/* O peso de um item, e de onde ele saiu.
 *
 * Os primeiros casos são o defeito que fez o arquivo existir: "2 pão e 1 ovo,
 * iogurte" entrava no plano com os três "sem peso", porque o código exigia
 * `medida_caseira` — que existe em 9% da base — para usar `porcao_g`, que
 * existe em 95%.
 *
 * Rode com: node --experimental-strip-types src/lib/pesoDoItem.teste.mts */

import { ehEstimado, ehMesmaMedida, pesoDoItem, separarRotulo } from './pesoDoItem.ts'

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

console.log('\n1. o caso da tela: "2 pao e 1 ovo, iogurte"')

{
  /* Iogurte na base: porcao_g 150, medida_caseira NULA. Era este o que ficava
     de fora da soma. */
  const p = pesoDoItem({ quantidade: 1, medida: 'unidade', medidaDaBase: null, porcaoG: 150 })
  ok('iogurte sem medida_caseira agora pesa', p?.gramas === 150, JSON.stringify(p))
  ok('e a origem diz que e porcao', p?.origem === 'porcao')
  ok('logo, e estimado', ehEstimado(p))
}

{
  const p = pesoDoItem({ quantidade: 2, medida: 'unidade', medidaDaBase: null, porcaoG: 50 })
  ok('2 paes = 2x a porcao', p?.gramas === 100, JSON.stringify(p))
}

{
  /* Sem medida escrita, o interpretador ja entrega 'unidade'. Mas string vazia
     tambem chega, de chamada que nao passa pelo interpretador. */
  ok('medida vazia conta como contagem',
    pesoDoItem({ quantidade: 1, medida: '', porcaoG: 50 })?.gramas === 50)
  ok('medida ausente tambem',
    pesoDoItem({ quantidade: 1, porcaoG: 50 })?.gramas === 50)
}

console.log('\n2. o que a regra antiga protegia continua protegido')

{
  /* Duas colheres de iogurte NAO sao 300 g. Medida nomeada que a base nao
     confirma fica sem peso -- inventar com cara de medida e pior que nao
     saber. */
  const p = pesoDoItem({
    quantidade: 2, medida: 'colher de sopa', medidaDaBase: null, porcaoG: 150,
  })
  ok('2 colheres de iogurte nao viram 300 g', p === null, JSON.stringify(p))

  ok('fatia sem confirmacao da base tambem fica sem peso',
    pesoDoItem({ quantidade: 1, medida: 'fatia', medidaDaBase: null, porcaoG: 400 }) === null)
  ok('xicara idem',
    pesoDoItem({ quantidade: 1, medida: 'xícara', medidaDaBase: null, porcaoG: 400 }) === null)
}

{
  /* Mas se a base CONFIRMA que a porcao e uma fatia, o peso vale -- e nao e
     estimativa, porque as duas pontas concordam. */
  const p = pesoDoItem({
    quantidade: 2, medida: 'fatia', medidaDaBase: 'Fatia', porcaoG: 25,
  })
  ok('2 fatias com a base confirmando', p?.gramas === 50, JSON.stringify(p))
  ok('origem e medida, nao porcao', p?.origem === 'medida')
  ok('e nao conta como estimado', !ehEstimado(p))
}

console.log('\n3. a ordem das fontes')

{
  /* O que ela fixou vence tudo, inclusive o que escreveu. */
  const p = pesoDoItem({ escolhido: 80, escrito: 200, quantidade: 3, porcaoG: 150 })
  ok('escolhido vence escrito', p?.gramas === 80 && p.origem === 'escolhido', JSON.stringify(p))

  const q = pesoDoItem({ escrito: 200, quantidade: 3, porcaoG: 150 })
  ok('escrito vence porcao', q?.gramas === 200 && q.origem === 'escrito', JSON.stringify(q))

  const r = pesoDoItem({
    quantidade: 2, medida: 'fatia', medidaDaBase: 'Fatia', porcaoG: 25,
  })
  ok('medida da base vence a contagem', r?.origem === 'medida')
}

console.log('\n4. sem porcao_g nao ha o que estimar')

{
  ok('porcao nula', pesoDoItem({ quantidade: 2, medida: 'unidade', porcaoG: null }) === null)
  ok('porcao zero', pesoDoItem({ quantidade: 2, medida: 'unidade', porcaoG: 0 }) === null)
  ok('porcao negativa', pesoDoItem({ quantidade: 2, medida: 'unidade', porcaoG: -50 }) === null)
  ok('entrada vazia', pesoDoItem({}) === null)
  /* Mas escrito sozinho basta: alimento fora do catalogo tambem tem peso. */
  ok('escrito sem alimento nenhum', pesoDoItem({ escrito: 200 })?.gramas === 200)
}

console.log('\n5. numeros que nao sao numeros')

{
  ok('porcao NaN', pesoDoItem({ quantidade: 1, porcaoG: NaN }) === null)
  ok('porcao Infinity', pesoDoItem({ quantidade: 1, porcaoG: Infinity }) === null)
  ok('quantidade NaN cai em 1',
    pesoDoItem({ quantidade: NaN, porcaoG: 50 })?.gramas === 50)
  ok('quantidade Infinity cai em 1',
    pesoDoItem({ quantidade: Infinity, porcaoG: 50 })?.gramas === 50)
  ok('quantidade zero cai em 1',
    pesoDoItem({ quantidade: 0, porcaoG: 50 })?.gramas === 50)
  ok('escolhido NaN nao vence',
    pesoDoItem({ escolhido: NaN, escrito: 200 })?.origem === 'escrito')
  /* numeric(10,2) chega como string pelo PostgREST. */
  ok('porcao como texto do Postgres',
    pesoDoItem({ quantidade: 2, porcaoG: '22.50' as unknown as number })?.gramas === 45)
  ok('e com virgula',
    pesoDoItem({ quantidade: 2, porcaoG: '22,50' as unknown as number })?.gramas === 45)
}

console.log('\n6. o teto, que existe porque o cadastro erra')

{
  /* porcao_g e numeric(10,2): um ponto no lugar errado -- 1500 em vez de 150 --
     vezes uma quantidade grande atravessa a conta do dia inteira. */
  ok('acima de 10 kg nao passa',
    pesoDoItem({ quantidade: 100, medida: 'unidade', porcaoG: 1500 }) === null)
  ok('exatamente 10 kg passa',
    pesoDoItem({ quantidade: 100, medida: 'unidade', porcaoG: 100 })?.gramas === 10000)
  /* O escolhido e o escrito NAO passam pelo teto: quem digitou 20 kg de arroz
     digitou o que quis, e o interpretador ja tem teto proprio. */
  ok('escolhido grande passa', pesoDoItem({ escolhido: 50000 })?.gramas === 50000)
}

console.log('\n7. arredonda, porque grama fracionado nao existe na tela')

{
  ok('22,5 x 2 = 45', pesoDoItem({ quantidade: 2, porcaoG: 22.5 })?.gramas === 45)
  ok('22,5 x 1 = 23', pesoDoItem({ quantidade: 1, porcaoG: 22.5 })?.gramas === 23)
  ok('nunca zera para zero',
    pesoDoItem({ quantidade: 1, porcaoG: 0.4 }) === null)
}

console.log('\n8. ehMesmaMedida')

{
  ok('igual', ehMesmaMedida('Fatia', 'fatia'))
  ok('plural do texto', ehMesmaMedida('Fatia', 'fatias'))
  ok('acento na base', ehMesmaMedida('Colher de chá', 'colher de cha'))
  ok('prefixo: colher x colher de sopa', ehMesmaMedida('Colher de sopa', 'colher'))
  ok('diferente', !ehMesmaMedida('Fatia', 'colher de sopa'))
  ok('base vazia nao casa com nada', !ehMesmaMedida('', 'fatia'))
  ok('texto vazio idem', !ehMesmaMedida('Fatia', ''))
  /* Prefixo curto demais casaria com tudo: "c" contra "colher". A funcao e
     frouxa de propósito, e isto documenta o limite dela. */
  ok('prefixo de uma letra ainda casa (documentado)', ehMesmaMedida('Colher de sopa', 'c'))
}

console.log('\n9. o rotulo da base as vezes conta mais de um')

{
  /* Dado real da base: Pao frances tem medida_caseira '1,5 unidade' e
     porcao_g 77. Um pao nao pesa 77 g -- pesa 51. Sem separar a contagem do
     rotulo, "2 paes" virava 154 g em vez de 103. */
  const p = pesoDoItem({
    quantidade: 2, medida: 'unidade', medidaDaBase: '1,5 unidade', porcaoG: 77,
  })
  ok('2 paes frances = 103 g, e nao 154', p?.gramas === 103, JSON.stringify(p))
  ok('e conta como medida confirmada', p?.origem === 'medida')
  ok('logo nao e estimativa', !ehEstimado(p))
}

{
  /* 'Duas fatias' com porcao 50 quer dizer 25 g por fatia. 59 alimentos assim. */
  const p = pesoDoItem({
    quantidade: 1, medida: 'fatia', medidaDaBase: 'Duas fatias', porcaoG: 50,
  })
  ok('1 fatia de "Duas fatias = 50 g" e 25 g', p?.gramas === 25, JSON.stringify(p))

  const q = pesoDoItem({
    quantidade: 2, medida: 'colher de sopa', medidaDaBase: '3 colheres de sopa', porcaoG: 60,
  })
  ok('2 de "3 colheres = 60 g" sao 40 g', q?.gramas === 40, JSON.stringify(q))
}

{
  /* A divisao SO vale quando a medida dela bate com a do rotulo. Na contagem
     generica nao da para saber se ela quis o pacote ou a porcao. */
  const p = pesoDoItem({
    quantidade: 1, medida: 'unidade', medidaDaBase: 'Meio pacote', porcaoG: 40,
  })
  ok('contagem generica nao divide pelo rotulo', p?.gramas === 40, JSON.stringify(p))
  ok('e sai como estimativa', p?.origem === 'porcao')
}

{
  /* Rotulo com qualificador a mais continua casando. */
  const p = pesoDoItem({
    quantidade: 2, medida: 'unidade', medidaDaBase: '1 unidade media', porcaoG: 120,
  })
  ok('"1 unidade media" casa com "unidade"', p?.gramas === 240, JSON.stringify(p))
  ok('e e medida, nao porcao', p?.origem === 'medida')
}

console.log('\n10. separarRotulo')

{
  ok('numero com virgula', separarRotulo('1,5 unidade').conta === 1.5)
  ok('e a unidade sobra limpa', separarRotulo('1,5 unidade').unidade === 'unidade')
  ok('numero inteiro', separarRotulo('3 colheres de sopa').conta === 3)
  ok('escrito por extenso', separarRotulo('Duas fatias').conta === 2)
  ok('meio', separarRotulo('Meio pacote').conta === 0.5)
  ok('sem contagem e um', separarRotulo('Fatia').conta === 1)
  ok('e a unidade e o rotulo inteiro', separarRotulo('Colher de sopa').unidade === 'Colher de sopa')
  ok('vazio', separarRotulo('').conta === 1 && separarRotulo('').unidade === '')
  /* Uma palavra que POR ACASO e um numero escrito nao vira contagem sozinha:
     um rotulo "Um" nao descreve unidade nenhuma. */
  ok('so o numero, sem unidade', separarRotulo('Duas').unidade === 'Duas')
  /* Zero nao divide: viraria Infinity e atravessaria a conta do dia. */
  ok('zero nao vira contagem', separarRotulo('0 fatias').conta === 1)
}

console.log('\n11. ehMesmaMedida com plural no meio')

{
  ok('colheres x colher de sopa', ehMesmaMedida('3 colheres de sopa'.slice(2), 'colher de sopa'))
  ok('unidades x unidade', ehMesmaMedida('unidades', 'unidade'))
  ok('rotulo com qualificador', ehMesmaMedida('unidade media', 'unidade'))
  ok('fatia x fatias', ehMesmaMedida('fatias', 'fatia'))
  /* Colher de sopa NAO e colher de cha: uma tem o triplo da outra, e confundir
     as duas erra a conta por 200%. O interpretador ja separa as duas por isso,
     e aqui a comparacao precisa manter a separacao. */
  ok('colher de sopa nao casa com colher de cha',
    !ehMesmaMedida('colher de sopa', 'colher de cha'))
  ok('fatia nao casa com colher', !ehMesmaMedida('fatia', 'colher de sopa'))
  ok('pote nao casa com unidade', !ehMesmaMedida('pote', 'unidade'))
}

console.log(`\n${passaram} passaram, ${falharam} falharam`)
if (falharam > 0) process.exit(1)
