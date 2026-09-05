/* Os sete objetivos que o paciente escolhe.
 *
 * O que importa aqui e o que ja custou defeito noutros lugares: valor vindo do
 * banco nao pode derrubar a tela (armadilha 10), e o que ja estava gravado nao
 * pode virar "sem foco" da noite para o dia.
 *
 * Rode com: node --experimental-strip-types src/lib/objetivos.teste.mts */

import {
  OBJETIVOS,
  nomeDoObjetivo,
  objetivoDe,
  sentidoDoObjetivo,
} from './objetivos.ts'

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

/* == SAO SETE, E SAO OS NAO-CLINICOS ==================================== */
{
  ok('sao sete', OBJETIVOS.length === 7, String(OBJETIVOS.length))

  // Os dezesseis clinicos NAO podem estar aqui: marcar "doenca renal" numa
  // lista e o app recalcular metas em cima disso e o app prescrevendo.
  const clinicos = [
    'gestacao', 'lactacao', 'doenca_renal', 'bariatrica', 'sop', 'tireoide',
    'esteatose_hepatica', 'menopausa', 'controle_glicemico', 'cardiovascular',
    'sarcopenia', 'ganho_peso_pediatrico', 'saude_intestinal',
    'seletividade_alimentar', 'compulsao_alimentar',
    'transtornos_neurodesenvolvimento',
  ]
  const invadiu = OBJETIVOS.filter(o => clinicos.includes(o.chave)).map(o => o.chave)
  ok('nenhum clinico entrou na lista', invadiu.length === 0, invadiu.join(', '))
}

/* == CADA UM ESTA COMPLETO ============================================== */
{
  const semNome = OBJETIVOS.filter(o => !o.nome.trim())
  const semResumo = OBJETIVOS.filter(o => !o.resumo.trim())
  const semIcone = OBJETIVOS.filter(o => !o.icone.trim())
  ok('todos tem nome', semNome.length === 0)
  ok('todos tem resumo', semResumo.length === 0)
  // Uma lista com seis icones e um sem e a primeira coisa que se nota.
  ok('todos tem icone', semIcone.length === 0, semIcone.map(o => o.chave).join(', '))

  const chaves = OBJETIVOS.map(o => o.chave)
  ok('nenhuma chave repetida', new Set(chaves).size === chaves.length)

  // Resumo curto: ele mora embaixo do nome, numa linha. Passando disso, quebra
  // em duas e a lista de sete vira rolagem.
  const longos = OBJETIVOS.filter(o => o.resumo.length > 60)
  ok('resumos cabem numa linha', longos.length === 0, longos.map(o => o.chave).join(', '))
}

/* == O QUE JA ESTAVA GRAVADO CONTINUA VALENDO ========================== */
{
  // Apagar os tres antigos faria todo mundo aparecer "sem foco definido" da
  // noite para o dia.
  ok('perda vira emagrecimento', objetivoDe('perda')?.chave === 'emagrecimento')
  ok('manter vira manutencao', objetivoDe('manter')?.chave === 'manutencao')
  ok('ganho vira ganho_peso', objetivoDe('ganho')?.chave === 'ganho_peso')

  ok('e o nome sai certo para o antigo', nomeDoObjetivo('perda') === 'Perder gordura', nomeDoObjetivo('perda'))
  ok('o sentido do antigo tambem', sentidoDoObjetivo('perda') === 'perder')
}

/* == VALOR DE FORA NAO DERRUBA, E NAO CHUTA ============================ */
{
  // Armadilha 10: a nutricionista define `gestacao` do lado dela, e isso chega
  // aqui como uma palavra que o app nunca viu.
  ok('chave desconhecida devolve null', objetivoDe('gestacao') === null)
  ok('e nao chuta um dos sete', nomeDoObjetivo('gestacao') !== 'Perder gordura')
  ok(
    'o texto admite que o app nao sabe',
    nomeDoObjetivo('gestacao').includes('nutricionista'),
    nomeDoObjetivo('gestacao'),
  )
  ok('sem sentido para o desconhecido', sentidoDoObjetivo('gestacao') === null)

  ok('null nao quebra', objetivoDe(null) === null)
  ok('undefined nao quebra', objetivoDe(undefined) === null)
  ok('string vazia nao quebra', objetivoDe('') === null)
  ok('sem foco tem frase propria', nomeDoObjetivo(null) === 'sem foco definido')
}

/* == O SENTIDO DE CADA UM =============================================== */
{
  ok('emagrecimento perde', sentidoDoObjetivo('emagrecimento') === 'perder')
  ok('hipertrofia ganha', sentidoDoObjetivo('hipertrofia') === 'ganhar')
  ok('ganho_peso ganha', sentidoDoObjetivo('ganho_peso') === 'ganhar')
  ok('manutencao mantem', sentidoDoObjetivo('manutencao') === 'manter')

  // Os dois que enganam: recomposicao e reeducacao trabalham PERTO da
  // manutencao. Chamar reeducacao de "perder" seria o app inventando uma meta
  // que ninguem pediu.
  ok('recomposicao mantem', sentidoDoObjetivo('recomposicao') === 'manter')
  ok('reeducacao mantem', sentidoDoObjetivo('reeducacao_alimentar') === 'manter')

  const sentidos = new Set(OBJETIVOS.map(o => o.sentido))
  ok('os tres sentidos aparecem', sentidos.size === 3, [...sentidos].join(', '))
}

console.log(`\n${passou} passaram, ${falhou} falharam`)
if (falhou > 0) process.exit(1)
