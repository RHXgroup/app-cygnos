import assert from 'node:assert/strict'
import {
  depoisDoPedido,
  leituraDaPermissao,
  liberou,
} from './decisaoDaNotificacao.ts'

let passaram = 0
let falharam = 0
function caso(nome: string, f: () => void) {
  try {
    f()
    passaram++
    console.log('  ok   ', nome)
  } catch (e) {
    falharam++
    console.log('  FALHOU', nome)
    console.log('        ', (e as Error).message.split('\n')[0])
  }
}

console.log('\nliberou -- as quatro formas da mesma resposta')

caso('granted true', () => assert.equal(liberou({ granted: true }), true))
caso('status granted, sem granted', () =>
  assert.equal(liberou({ status: 'granted' }), true))
caso('os dois juntos', () =>
  assert.equal(liberou({ granted: true, status: 'granted' }), true))
caso('granted false com status granted ainda libera', () =>
  /* Um dos dois dizendo sim basta: a alternativa é o app dizer "desligadas" com
     o Android dizendo que liberou, que foi o relato dele. */
  assert.equal(liberou({ granted: false, status: 'granted' }), true))
caso('negado', () => assert.equal(liberou({ granted: false, status: 'denied' }), false))

console.log('\nliberou -- o que NÃO é objeto')

caso('a lista vazia do embrulho protegido', () =>
  /* `moduloProtegido` devolve `async () => []` para nome ausente no Expo Go.
     Ler `.granted` de `[]` dá undefined, sem erro -- e sem este tratamento a
     conta seguinte trabalharia com lixo. */
  assert.equal(liberou([]), false))
caso('nulo', () => assert.equal(liberou(null), false))
caso('indefinido', () => assert.equal(liberou(undefined), false))
caso('texto', () => assert.equal(liberou('granted'), false))

console.log('\na leitura da permissão')

caso('liberada vira ligadas', () =>
  assert.equal(leituraDaPermissao({ granted: true }), 'ligadas'))
caso('negada e pode perguntar vira perguntar', () =>
  assert.equal(leituraDaPermissao({ granted: false, canAskAgain: true }), 'perguntar'))
caso('negada e NÃO pode perguntar vira bloqueadas', () =>
  assert.equal(leituraDaPermissao({ granted: false, canAskAgain: false }), 'bloqueadas'))
caso('sem canAskAgain vira perguntar, e não bloqueadas', () =>
  /* Ausente é "não sei". Mandar para as configurações sem motivo é pior do que
     tentar e falhar. */
  assert.equal(leituraDaPermissao({ granted: false }), 'perguntar'))
caso('a lista vazia vira perguntar', () =>
  assert.equal(leituraDaPermissao([]), 'perguntar'))

console.log('\ndepois do pedido -- a caixa que não aparece')

caso('liberou: ligadas, sem abrir configuração', () => {
  const d = depoisDoPedido({ granted: true }, false)
  assert.equal(d.estado, 'ligadas')
  assert.equal(d.abrirConfiguracao, false)
})
caso('liberou zera o histórico', () => {
  /* Se ela desligar nas configurações depois, o próximo pedido merece a caixa
     de novo em vez de ir direto para o ajuste. */
  const d = depoisDoPedido({ granted: true }, true)
  assert.equal(d.jaPedi, false)
})
caso('PRIMEIRA recusa: perguntar, e marca que já pediu', () => {
  const d = depoisDoPedido({ granted: false, canAskAgain: true }, false)
  assert.equal(d.estado, 'perguntar')
  assert.equal(d.abrirConfiguracao, false)
  assert.equal(d.jaPedi, true)
})
caso('SEGUNDA recusa: bloqueadas e abre a configuração', () => {
  /* O defeito relatado três vezes: sem isto, o botão manda ela responder uma
     caixa que o Android não vai mais desenhar. */
  const d = depoisDoPedido({ granted: false, canAskAgain: true }, true)
  assert.equal(d.estado, 'bloqueadas')
  assert.equal(d.abrirConfiguracao, true)
})
caso('canAskAgain false abre a configuração já na primeira', () => {
  const d = depoisDoPedido({ granted: false, canAskAgain: false }, false)
  assert.equal(d.estado, 'bloqueadas')
  assert.equal(d.abrirConfiguracao, true)
})
caso('a lista vazia na primeira vez ainda deixa tentar', () => {
  const d = depoisDoPedido([], false)
  assert.equal(d.estado, 'perguntar')
  assert.equal(d.abrirConfiguracao, false)
})
caso('a lista vazia na segunda vez para de insistir', () => {
  const d = depoisDoPedido([], true)
  assert.equal(d.estado, 'bloqueadas')
  assert.equal(d.abrirConfiguracao, true)
})
caso('duas recusas seguidas, encadeadas como no app', () => {
  /* O caminho inteiro, do jeito que a tela o percorre. */
  const primeira = depoisDoPedido({ granted: false }, false)
  const segunda = depoisDoPedido({ granted: false }, primeira.jaPedi)
  assert.equal(primeira.estado, 'perguntar')
  assert.equal(segunda.estado, 'bloqueadas')
  assert.equal(segunda.abrirConfiguracao, true)
})

console.log(`\n${passaram} passaram, ${falharam} falharam\n`)
if (falharam > 0) process.exit(1)
