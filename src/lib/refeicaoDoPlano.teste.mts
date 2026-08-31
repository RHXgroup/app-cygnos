/* Achar a refeicao do plano a partir do rotulo que a tela usa.
 *
 * Os dois lados vem de lugares diferentes: a tela oferece uma lista FECHADA de
 * seis, e o plano tem TEXTO LIVRE escrito pela nutricionista no sistema dela.
 * O que se exercita aqui e o descompasso entre os dois.
 *
 * Rode com: node --experimental-strip-types src/lib/refeicaoDoPlano.teste.mts */

import { refeicaoDoPlano } from './refeicaoDoPlano.ts'

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

const plano = (...rotulos: string[]) => rotulos.map(rotulo => ({ rotulo }))
const achou = (rs: { rotulo: string }[], alvo: string) => refeicaoDoPlano(rs, alvo)?.rotulo ?? null

/* As seis que a tela oferece, e que a nutricionista TAMBEM costuma escrever. */
const SEIS = plano('Café da manhã', 'Lanche da manhã', 'Almoço', 'Lanche da tarde', 'Jantar', 'Ceia')

console.log('\nO caso comum: os dois lados escreveram igual')

{
  ok('acha o almoco', achou(SEIS, 'Almoço') === 'Almoço')
  ok('acha o cafe da manha', achou(SEIS, 'Café da manhã') === 'Café da manhã')
  ok('acha a ceia', achou(SEIS, 'Ceia') === 'Ceia')
  ok('distingue os dois lanches', achou(SEIS, 'Lanche da tarde') === 'Lanche da tarde')
  ok('e o outro lanche', achou(SEIS, 'Lanche da manhã') === 'Lanche da manhã')
}

console.log('\nO que fazia a comparacao exata falhar calada')

{
  /* Era isto: `plano.refeicoes.find(r => r.rotulo === refeicao)`. */
  ok('espaco sobrando no fim', achou(plano('Almoço '), 'Almoço') === 'Almoço ')
  ok('espaco sobrando no comeco', achou(plano('  Almoço'), 'Almoço') === '  Almoço')
  ok('minuscula', achou(plano('almoço'), 'Almoço') === 'almoço')
  ok('maiuscula', achou(plano('ALMOÇO'), 'Almoço') === 'ALMOÇO')
  ok('sem acento do lado dela', achou(plano('Almoco'), 'Almoço') === 'Almoco')
  ok('sem acento do nosso lado', achou(plano('Almoço'), 'Almoco') === 'Almoço')
  ok('dois espacos no meio', achou(plano('Lanche  da  tarde'), 'Lanche da tarde') !== null)
}

console.log('\nQuando ela escreve mais do que o nome')

{
  ok('"Almoço 12h" casa com "Almoço"', achou(plano('Almoço 12h'), 'Almoço') === 'Almoço 12h')
  ok('"Jantar leve" casa com "Jantar"', achou(plano('Jantar leve'), 'Jantar') === 'Jantar leve')
  ok(
    'e o contrario tambem: "Lanche" casa com "Lanche da tarde"',
    achou(plano('Lanche'), 'Lanche da tarde') === 'Lanche',
  )
}

console.log('\nQuando NAO da para saber, nao chuta')

{
  /* Contexto errado e pior do que contexto nenhum: sem ele o erro do modelo e
     aleatorio e a pessoa desconfia; com ele o erro fica PLAUSIVEL -- bate com um
     plano de verdade, so que o da refeicao errada -- e passa. */
  const dois = plano('Lanche da manhã', 'Lanche da tarde')
  ok('"Lanche" casando com dois nao devolve nenhum', achou(dois, 'Lanche') === null)
}

{
  const repetido = plano('Lanche', 'Lanche')
  ok('o mesmo rotulo duas vezes no plano nao devolve nenhum', achou(repetido, 'Lanche') === null)
}

{
  /* Repetido depois de normalizar tambem conta como repetido. */
  const quase = plano('Almoço', 'almoco ')
  ok('duas grafias do mesmo nome tambem nao', achou(quase, 'Almoço') === null)
}

{
  ok('refeicao que o plano nao tem', achou(SEIS, 'Pré-treino') === null)
  ok('e nada parecido casa por acidente', achou(SEIS, 'Ceia da madrugada') === 'Ceia')
}

console.log('\nO comeco tem de ser palavra inteira, e nao pedaco')

{
  /* Sem isso, quatro letras casariam com qualquer coisa que comece com elas. */
  ok('"Ceia" nao casa com "Ceias de festa"', achou(plano('Ceias de festa'), 'Ceia') === null)
  ok('"Almoço" nao casa com "Almoçorama"', achou(plano('Almoçorama'), 'Almoço') === null)
  ok('mas casa com "Almoço da familia"', achou(plano('Almoço da família'), 'Almoço') !== null)
}

{
  /* Rotulo curto demais nao e evidencia de nada. */
  ok('duas letras nao casam por comeco', achou(plano('Ca fé especial'), 'Ca') === null)
  ok('e nem tres', achou(plano('Cei nova'), 'Cei') === null)
  ok('quatro ja valem', achou(plano('Ceia tardia'), 'Ceia') === 'Ceia tardia')
}

console.log('\nO que chega torto')

{
  ok('plano nulo', refeicaoDoPlano(null, 'Almoço') === null)
  ok('plano indefinido', refeicaoDoPlano(undefined, 'Almoço') === null)
  ok('plano vazio', refeicaoDoPlano([], 'Almoço') === null)
  ok('refeicao vazia', achou(SEIS, '') === null)
  ok('refeicao so de espaco', achou(SEIS, '   ') === null)
}

{
  /* O rotulo vem do banco, e a coluna aceita nulo. */
  const sujo = [{ rotulo: '' }, { rotulo: '   ' }, { rotulo: 'Almoço' }] as { rotulo: string }[]
  ok('rotulo vazio no plano nao atrapalha', achou(sujo, 'Almoço') === 'Almoço')
  const pior = [{ rotulo: null }, { rotulo: 42 }, { rotulo: 'Jantar' }] as unknown as {
    rotulo: string
  }[]
  ok('rotulo que nem e texto tambem nao', achou(pior, 'Jantar') === 'Jantar')
  ok('e nao estoura', achou(pior, 'Almoço') === null)
}

{
  const naoELista = refeicaoDoPlano('Almoço' as unknown as { rotulo: string }[], 'Almoço')
  ok('texto no lugar da lista nao estoura', naoELista === null)
}

console.log('\nDevolve o objeto, e nao so o rotulo')

{
  /* Quem chama precisa dos ITENS da refeicao, e nao do nome dela. Devolver o
     rotulo obrigaria a segunda busca, e a segunda busca e onde as duas
     divergem. */
  const comItens = [
    { rotulo: 'Almoço 12h', itens: [{ nome: 'Arroz' }, { nome: 'Feijão' }] },
    { rotulo: 'Jantar', itens: [{ nome: 'Sopa' }] },
  ]
  const r = refeicaoDoPlano(comItens, 'Almoço')
  ok('volta a refeicao inteira', r?.itens.length === 2)
  ok('e e a certa', r?.itens[0].nome === 'Arroz')
}

console.log(`\n${passaram} passaram, ${falharam} falharam`)
if (falharam > 0) process.exit(1)
