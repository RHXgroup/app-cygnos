/* A bolinha de "o plano mudou".
 *
 * O que este arquivo protege e o que ja derrubaria a funcionalidade inteira sem
 * dar erro nenhum: o plano da nutricionista chega FILTRADO para hoje, entao uma
 * assinatura ingenua muda da segunda para a terca e a bolinha acende todo dia
 * dizendo "mudou" quando nada mudou. Bolinha que acende sem motivo ensina a
 * pessoa a ignorar o ponto -- e ai ele nao vale mais nada no dia em que ela de
 * fato mexer no plano.
 *
 * Rode com: node --experimental-strip-types src/lib/novidadeNoPlano.teste.mts */

import {
  assinaturaDoPlano,
  marcaAtualizada,
  temNovidade,
  type MarcaDoPlano,
} from './novidadeNoPlano.ts'

let passou = 0
let falhou = 0
function ok(nome: string, condicao: boolean, extra = '') {
  if (condicao) {
    passou++
    console.log('  ok    ' + nome)
  } else {
    falhou++
    console.log('  FALHOU ' + nome + (extra ? '  -> ' + extra : ''))
  }
}

/* O tipo real tem dezenas de campos que esta decisao nao olha. Um objeto com o
   que ela olha, e um `as never` na entrada, e mais honesto do que montar um
   PlanoCompleto de mentira inteiro -- e falharia a compilacao se a funcao
   passasse a depender de outro campo. */
type Item = { id: string; gramasTotais: number | null }
type Refeicao = { id: string; rotulo: string; hora: string; itens: Item[] }
const planoDe = (id: string, refeicoes: Refeicao[]) =>
  ({ id, refeicoes }) as unknown as Parameters<typeof assinaturaDoPlano>[0]

const CAFE: Refeicao = {
  id: 'r1',
  rotulo: 'Cafe da manha',
  hora: '07:00',
  itens: [
    { id: 'i1', gramasTotais: 100 },
    { id: 'i2', gramasTotais: 30 },
  ],
}
const ALMOCO: Refeicao = {
  id: 'r2',
  rotulo: 'Almoco',
  hora: '12:30',
  itens: [{ id: 'i3', gramasTotais: 150 }],
}

const SEGUNDA = planoDe('nutri-7', [CAFE, ALMOCO])
const TERCA = planoDe('nutri-7', [
  { ...CAFE, itens: [{ id: 'i9', gramasTotais: 100 }] },
  ALMOCO,
])

/* == A ASSINATURA OLHA O QUE SE COME ==================================== */
{
  ok('plano nulo nao tem assinatura', assinaturaDoPlano(null) === '')

  // A ordem das linhas vem do banco e nao e garantida. Sem ordenar, uma
  // consulta que voltasse trocada acenderia a bolinha sozinha -- e o defeito
  // seria intermitente, que e o pior tipo.
  ok(
    'ordem das refeicoes nao muda a assinatura',
    assinaturaDoPlano(planoDe('p', [CAFE, ALMOCO])) ===
      assinaturaDoPlano(planoDe('p', [ALMOCO, CAFE])),
  )
  ok(
    'ordem dos itens tambem nao',
    assinaturaDoPlano(planoDe('p', [CAFE])) ===
      assinaturaDoPlano(planoDe('p', [{ ...CAFE, itens: [CAFE.itens[1], CAFE.itens[0]] }])),
  )

  // O que MUDA o que ela vai comer tem de mudar a assinatura.
  const a = assinaturaDoPlano(planoDe('p', [CAFE]))
  ok(
    'trocar o alimento muda',
    a !== assinaturaDoPlano(planoDe('p', [{ ...CAFE, itens: [{ id: 'iX', gramasTotais: 100 }] }])),
  )
  ok(
    'mudar a quantidade muda',
    a !== assinaturaDoPlano(planoDe('p', [{ ...CAFE, itens: [{ id: 'i1', gramasTotais: 200 }, CAFE.itens[1]] }])),
  )
  ok(
    'mudar o horario muda',
    a !== assinaturaDoPlano(planoDe('p', [{ ...CAFE, hora: '08:00' }])),
  )
  ok(
    'tirar uma refeicao muda',
    assinaturaDoPlano(planoDe('p', [CAFE, ALMOCO])) !== a,
  )

  // Item sem gramas e caso real: o catalogo nao tem tudo (armadilha 6). Nao
  // pode virar zero nem quebrar a comparacao.
  const semGramas = planoDe('p', [{ ...CAFE, itens: [{ id: 'i1', gramasTotais: null }] }])
  ok('item sem gramas nao quebra', assinaturaDoPlano(semGramas).length > 0)
  ok(
    'e sem gramas NAO e o mesmo que zero',
    assinaturaDoPlano(semGramas) !==
      assinaturaDoPlano(planoDe('p', [{ ...CAFE, itens: [{ id: 'i1', gramasTotais: 0 }] }])),
  )
}

/* == O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR ==================== */
{
  // Segunda vista e guardada. Na terca o CONTEUDO e outro -- porque o plano
  // chega filtrado para o dia --, e isso NAO e novidade.
  const marca = marcaAtualizada(null, SEGUNDA as never, 1)
  ok('terca depois de ver a segunda NAO acende', temNovidade(marca, TERCA as never, 2) === false)

  // E a propria segunda, no dia seguinte igualzinha, tambem nao.
  ok('a mesma segunda na semana seguinte nao acende', temNovidade(marca, SEGUNDA as never, 1) === false)
}

/* == E O QUE TEM DE ACENDER ============================================ */
{
  const marca = marcaAtualizada(null, SEGUNDA as never, 1)

  const segundaMexida = planoDe('nutri-7', [
    { ...CAFE, itens: [{ id: 'i1', gramasTotais: 250 }, CAFE.itens[1]] },
    ALMOCO,
  ])
  ok('ela mexeu na segunda: acende', temNovidade(marca, segundaMexida as never, 1) === true)

  // Plano TROCADO acende em qualquer dia, sem depender de assinatura.
  const outroPlano = planoDe('nutri-8', [CAFE, ALMOCO])
  ok('plano novo acende na segunda', temNovidade(marca, outroPlano as never, 1) === true)
  ok('plano novo acende ate num dia nunca visto', temNovidade(marca, outroPlano as never, 5) === true)
}

/* == O SILENCIO DO PRIMEIRO ENCONTRO =================================== */
{
  // Quem instala o app e ja tem plano nao recebe "plano novo" sobre uma coisa
  // que sempre esteve la.
  ok('sem marca nenhuma, nao acende', temNovidade(null, SEGUNDA as never, 1) === false)

  // E quem abre numa quinta pela primeira vez nao e avisado de que quinta
  // existe. O preco: a primeira publicacao de cada dia passa calada.
  const marca = marcaAtualizada(null, SEGUNDA as never, 1)
  ok('dia ainda nao visto, do mesmo plano, nao acende', temNovidade(marca, SEGUNDA as never, 4) === false)

  ok('sem plano nao acende', temNovidade(marca, null, 1) === false)
}

/* == PLANO TROCADO ZERA OS OUTROS DIAS ================================= */
{
  // Sem zerar, a primeira visita a cada dia do plano NOVO seria comparada com o
  // cardapio de um plano que ja nao existe -- e a bolinha acenderia seis vezes
  // seguidas por uma troca so.
  let marca: MarcaDoPlano = marcaAtualizada(null, SEGUNDA as never, 1)
  marca = marcaAtualizada(marca, TERCA as never, 2)
  ok('os dois dias ficam guardados', Object.keys(marca.porDia).length === 2)

  const outro = planoDe('nutri-8', [ALMOCO])
  const depois = marcaAtualizada(marca, outro as never, 3)
  ok('plano trocado deixa so o dia visto', Object.keys(depois.porDia).length === 1, Object.keys(depois.porDia).join(','))
  ok('e o id acompanha', depois.planoId === 'nutri-8')
  ok('a terca do plano velho nao acende no plano novo', temNovidade(depois, outro as never, 2) === false)
}

/* == VER DE NOVO NAO APAGA O QUE JA ESTAVA ============================= */
{
  let marca: MarcaDoPlano = marcaAtualizada(null, SEGUNDA as never, 1)
  marca = marcaAtualizada(marca, SEGUNDA as never, 1)
  ok('rever o mesmo dia nao duplica nada', Object.keys(marca.porDia).length === 1)
  ok('e continua sem novidade', temNovidade(marca, SEGUNDA as never, 1) === false)
}

console.log(`\n${passou} passaram, ${falhou} falharam`)
if (falhou > 0) process.exit(1)
