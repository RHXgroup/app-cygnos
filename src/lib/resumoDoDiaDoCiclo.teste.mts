/* O resumo do dia do ciclo: o que ela ve ao tocar num dia ja preenchido.
 *
 * Rode com: node --experimental-strip-types src/lib/resumoDoDiaDoCiclo.teste.mts */

import { relacaoDoDia, resumoDoDia, temAlgoAnotado } from './resumoDoDiaDoCiclo.ts'
import type { DiaDoCiclo } from './ciclo'

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

const vazio = (): DiaDoCiclo => ({
  data: '2026-09-01',
  fluxo: null,
  sintomas: [],
  humor: null,
  energia: null,
  digestao: null,
  secrecao: null,
  cabeca: null,
  pele: null,
  desejoAlimentar: [],
  observacao: null,
  relacao: null,
  relacaoProtegida: null,
  notaPrivada: null,
})

const com = (mudanca: Partial<DiaDoCiclo>): DiaDoCiclo => ({ ...vazio(), ...mudanca })

console.log('\nTem algo anotado? (decide entre resumo e editor)')

{
  ok('dia em branco abre o editor', temAlgoAnotado(vazio()) === false)
  ok('nulo tambem', temAlgoAnotado(null) === false)
  ok('indefinido tambem', temAlgoAnotado(undefined) === false)
}

{
  ok('so o fluxo ja conta', temAlgoAnotado(com({ fluxo: 'medio' as never })))
  ok('so um sintoma ja conta', temAlgoAnotado(com({ sintomas: ['colica'] })))
  ok('so a anotacao ja conta', temAlgoAnotado(com({ observacao: 'dia dificil' })))
  /* Estes dois nunca saem do aparelho, mas sao motivo de o dia nao estar em
     branco -- e por isso contam aqui, ainda que nao apareçam no resumo comum. */
  ok('so a relacao ja conta', temAlgoAnotado(com({ relacao: true })))
  ok('so a nota privada ja conta', temAlgoAnotado(com({ notaPrivada: 'x' })))
}

{
  /* Lista com string vazia dentro nao e anotacao. */
  ok('lista de vazios nao conta', temAlgoAnotado(com({ sintomas: ['', '  '] })) === false)
  ok('anotacao so de espaco nao conta', temAlgoAnotado(com({ observacao: '   ' })) === false)
}

console.log('\nAs linhas do resumo')

{
  const r = resumoDoDia(
    com({
      fluxo: 'intenso' as never,
      sintomas: ['colica', 'lombar'],
      humor: 'irritada' as never,
      observacao: 'dormi mal',
    }),
  )
  ok('uma linha por campo preenchido', r.length === 4)
  ok('o fluxo vem primeiro', r[0].rotulo === 'Fluxo')
  ok('a lista vira texto separado por virgula', r[1].valor === 'colica, lombar')
  ok('a anotacao vem por ultimo', r[r.length - 1].rotulo === 'Anotação')
}

{
  /* Um resumo com sete "—" e um formulario disfarçado, e o formulario e o que
     esta tela existe para evitar. */
  const r = resumoDoDia(com({ fluxo: 'leve' as never }))
  ok('campo vazio nao vira linha', r.length === 1)
  ok('e nao escreve traço nenhum', !r.some(l => l.valor.includes('—')))
}

{
  ok('dia em branco nao gera linha', resumoDoDia(vazio()).length === 0)
  ok('nulo nao estoura', resumoDoDia(null).length === 0)
}

{
  /* A relacao NAO entra nas linhas comuns: misturar convidaria alguem a mandar
     "o resumo" inteiro para algum lugar sem reparar no que ia junto. */
  const r = resumoDoDia(com({ relacao: true, relacaoProtegida: true, notaPrivada: 'so minha' }))
  ok('relacao nao entra no resumo comum', r.length === 0)
  ok('nem a nota privada', !r.some(l => l.valor.includes('so minha')))
}

console.log('\nA relacao, separada')

{
  ok('nao respondeu e nulo', relacaoDoDia(vazio()) === null)
  ok('respondeu que nao houve', relacaoDoDia(com({ relacao: false })) === 'Sem relação')
  ok(
    'houve e protegida',
    relacaoDoDia(com({ relacao: true, relacaoProtegida: true })) === 'Com relação, protegida',
  )
  ok(
    'houve e sem protecao',
    relacaoDoDia(com({ relacao: true, relacaoProtegida: false })) ===
      'Com relação, sem proteção',
  )
  ok(
    'houve e nao disse se protegida',
    relacaoDoDia(com({ relacao: true })) === 'Com relação',
  )
  /* "Nao respondeu" e "respondeu que nao houve" sao coisas diferentes, e a
     diferença importa: uma e ausencia de dado, a outra e dado. */
  ok('e as duas negativas nao se confundem', relacaoDoDia(vazio()) !== relacaoDoDia(com({ relacao: false })))
}

console.log(`\n${passaram} passaram, ${falharam} falharam`)
if (falharam > 0) process.exit(1)
