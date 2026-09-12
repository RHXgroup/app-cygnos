import assert from 'node:assert/strict'
import {
  depoisDoPedido,
  deveApitar,
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

console.log('')
console.log('quem apita com o app aberto')

caso('o lembrete que ela pediu à Aurora apita', () =>
  /* O relato: "notificou às sete da manhã e não apitou, só pôs na tela". */
  assert.equal(deveApitar('nutri'), true))
caso('o lembrete de refeição apita', () => assert.equal(deveApitar('refeicao'), true))
caso('o lembrete de água apita', () => assert.equal(deveApitar('agua'), true))
caso('o da sequência apita', () => assert.equal(deveApitar('sequencia'), true))
caso('a CONFIRMAÇÃO de água NÃO apita -- ela não tem tipo', () =>
  /* Avisa de uma coisa que a pessoa acabou de fazer. Apitar aqui era o defeito
     que o canal MIN dela existe para evitar, e é por isso que o tratador
     calava tudo por atacado. */
  assert.equal(deveApitar(undefined), false))
caso('tipo desconhecido entra CALADO, e não apitando', () =>
  /* Notificação nova calada faz alguém perceber e decidir; apitando sem
     ninguém ter decidido, não. */
  assert.equal(deveApitar('promocao'), false))
caso('tipo que não é texto não derruba nada', () => {
  assert.equal(deveApitar(null), false)
  assert.equal(deveApitar(7), false)
  assert.equal(deveApitar({ tipo: 'nutri' }), false)
})

console.log(`\n${passaram} passaram, ${falharam} falharam\n`)
if (falharam > 0) process.exit(1)
