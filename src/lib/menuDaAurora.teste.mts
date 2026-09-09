import { ehPedidoDeMenu, O_QUE_ELA_FAZ, PERGUNTAS_DE_EXEMPLO, RESPOSTA_DO_MENU } from './menuDaAurora.ts'

let passou = 0
let falhou = 0

function ok(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) {
    passou++
    console.log('  ok   ' + nome)
  } else {
    falhou++
    console.log('  FALHA ' + nome + (detalhe ? '  -> ' + detalhe : ''))
  }
}

// ── 1. O caso que originou tudo ──────────────────────────────────────────────
{
  ok('"Manu principal" é pedido de menu', ehPedidoDeMenu('Manu principal'))
  ok('com pontuação e espaço sobrando', ehPedidoDeMenu('  menu principal!  '))
  ok('com hífen', ehPedidoDeMenu('menu-principal'))
  ok('menu sozinho', ehPedidoDeMenu('Menu'))
}

// ── 2. As outras formas de pedir o começo ────────────────────────────────────
{
  for (const frase of [
    'início', 'INICIO', 'começo', 'voltar', 'Voltar ao início', 'volta ao menu',
    'tela inicial', 'opções', 'ajuda', 'O que você faz?', 'o que voce sabe fazer',
  ]) {
    ok('"' + frase + '"', ehPedidoDeMenu(frase))
  }
}

// ── 3. O que NÃO pode virar menu ─────────────────────────────────────────────
{
  /* "Manu" sozinho é a Manuella, que existe e é paciente. Foi a busca por ela
     que devolveu cinco nomes parecidos -- e essa busca continua certa. */
  ok('"Manu" sozinho não é menu', !ehPedidoDeMenu('Manu'))
  ok('"Manu Alves" não é menu', !ehPedidoDeMenu('Manu Alves'))

  /* A razão de a comparação ser com a frase inteira, e não um "contém". */
  ok('"quando ela vai voltar?" não é menu', !ehPedidoDeMenu('quando ela vai voltar?'))
  ok('menu dentro de outra frase não conta', !ehPedidoDeMenu('manda o menu da dieta dela'))
  ok('"a queixa principal dela" não conta', !ehPedidoDeMenu('a queixa principal dela'))
  ok('pergunta de agenda não conta', !ehPedidoDeMenu('Quem é o meu próximo paciente?'))
  ok('pedido de agendamento não conta', !ehPedidoDeMenu('Agenda um retorno para amanhã às 15h'))

  ok('vazio não conta', !ehPedidoDeMenu(''))
  ok('só espaço não conta', !ehPedidoDeMenu('   '))
  ok('só pontuação não conta', !ehPedidoDeMenu('...'))
}

// ── 4. Os textos ─────────────────────────────────────────────────────────────
{
  /* A abertura mentia depois que a Aurora ganhou as ferramentas. Se alguém
     reescrever isto dizendo que ela NÃO agenda, é regressão. */
  ok('o texto do que ela faz diz que agenda', /agendo consulta/.test(O_QUE_ELA_FAZ))
  ok('e diz que a confirmação é dela', /confirmação/.test(O_QUE_ELA_FAZ))
  ok('a resposta do menu carrega esse texto', RESPOSTA_DO_MENU.includes(O_QUE_ELA_FAZ))

  /* Os exemplos são o menu. Uma lista vazia devolveria a tela ao estado em que
     não havia caminho de volta nenhum. */
  ok('há exemplos para oferecer', PERGUNTAS_DE_EXEMPLO.length >= 3)
  ok('nenhum exemplo é pedido de menu', PERGUNTAS_DE_EXEMPLO.every(p => !ehPedidoDeMenu(p)))
}

console.log('\n' + passou + ' passaram, ' + falhou + ' falharam')
process.exit(falhou > 0 ? 1 : 0)
