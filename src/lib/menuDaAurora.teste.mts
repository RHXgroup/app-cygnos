import {
  ehPedidoDeMenu,
  resumoDoDia,
  semRestos,
  O_QUE_ELA_FAZ,
  PERGUNTAS_DE_EXEMPLO,
  RESPOSTA_DO_MENU,
} from './menuDaAurora.ts'

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
  /* Por ASSUNTO, e não por ferramenta -- e o teste mudou junto com a frase.
     Cobrar "agendo consulta" e "lanço conta a receber" era recriar aqui o
     acoplamento que a frase acabou de perder: com vinte ferramentas no
     servidor, cada uma nova exigiria uma linha nova neste arquivo, e a linha só
     apareceria quando alguém lembrasse -- que é exatamente como a frase mentiu
     três vezes em dois dias.

     O que continua sendo regressão, e por isso continua cobrado: dizer que ela
     NÃO cuida da agenda, sumir com o dinheiro ou com os cadastros, ou perder a
     promessa de que nada grava sem a confirmação dela. */
  ok('diz que cuida da agenda', /agenda/.test(O_QUE_ELA_FAZ))
  ok('e que remarca e cancela', /remarcar/.test(O_QUE_ELA_FAZ) && /cancelar/.test(O_QUE_ELA_FAZ))
  ok('diz que lança o que entra e o que sai', /entra e o que sai/.test(O_QUE_ELA_FAZ))
  ok('e que faz cadastro', /cadastro/.test(O_QUE_ELA_FAZ))
  ok('e que marca tags', /tags/.test(O_QUE_ELA_FAZ))
  ok('e que cria lembrete no telefone', /lembrete/.test(O_QUE_ELA_FAZ))

  /* O outro lado da frase, e ele também mente se ninguém olhar: confirmar
     consulta NÃO tem ferramenta, e foi pedir isso que fez a nutri receber uma
     resposta sobre a fila de pedidos, que é outra coisa. No dia em que a
     ferramenta existir, esta linha cai junto com o texto. */
  ok('diz o que ainda é no computador', /no computador/.test(O_QUE_ELA_FAZ))

  /* Esta linha cobrava "quantos" por uma hora, e estava certa: a triagem
     mandava ao modelo só a contagem, e prometer nomes seria mentira. Com a
     recomposição no ar -- o servidor manda `#412` e troca pelo nome na volta --
     ela responde QUEM, sem nome nenhum sair do país.

     O caso fica, com o alvo trocado, porque o que ele protege não mudou: esta
     frase depende de uma decisão que mora no OUTRO repositório, e quem a
     reescrever sem olhar lá vai errar para um dos dois lados. */
  ok('fala de quem pede atenção', /quem está pedindo atenção/.test(O_QUE_ELA_FAZ))
  ok('e não voltou a prometer só a contagem', !/quantos pacientes/.test(O_QUE_ELA_FAZ))
  ok('e diz que a confirmação é dela', /confirmação/.test(O_QUE_ELA_FAZ))
  ok('a resposta do menu carrega esse texto', RESPOSTA_DO_MENU.includes(O_QUE_ELA_FAZ))

  /* Os exemplos são o menu. Uma lista vazia devolveria a tela ao estado em que
     não havia caminho de volta nenhum. */
  ok('há exemplos para oferecer', PERGUNTAS_DE_EXEMPLO.length >= 3)
  ok('nenhum exemplo é pedido de menu', PERGUNTAS_DE_EXEMPLO.every(p => !ehPedidoDeMenu(p)))
}

// ── 5. O que não pode chegar à tela ──────────────────────────────────────────
{
  /* O número da consulta existe para a ferramenta, e o prompt manda não
     escrevê-lo na resposta. Isto aqui é a rede embaixo do prompt: modelo
     desobedece, e "confirmei a consulta [ID: 57]" é uma frase que a
     nutricionista não tem como interpretar. */
  ok('tira o id e o espaço em volta',
     semRestos('Confirmei a consulta [ID: 57] às 13:00.') === 'Confirmei a consulta às 13:00.')
  ok('tira mais de um',
     semRestos('Marina [ID: 12] e Renan [ID: 13] estão hoje') === 'Marina e Renan estão hoje')
  ok('não encosta em texto normal',
     semRestos('nada a tirar aqui') === 'nada a tirar aqui')
  ok('sobra vazio quando era só o id', semRestos('[ID: 9]') === '')
  /* Não pode comer coisa parecida que não é id: o modelo escreve peso e altura
     entre colchetes em tabela, e uma regra larga demais apagaria o dado. */
  ok('não tira colchete que não é id',
     semRestos('peso [78 kg] hoje') === 'peso [78 kg] hoje')
  ok('nem a cerquilha do paciente', semRestos('#412 está sem retorno') === '#412 está sem retorno')
}

// ── 6. A primeira linha da abertura ──────────────────────────────────────────
{
  const r = (consultas: number, semConfirmar: number, pedidos: number) =>
    resumoDoDia({ consultas, semConfirmar, pedidos })

  ok('dia cheio com pendente e pedido',
     r(6, 2, 3) === '6 consultas hoje, 2 sem confirmar, 3 pedidos esperando você.', String(r(6, 2, 3)))
  ok('singular em tudo',
     r(1, 1, 1) === '1 consulta hoje, 1 sem confirmar, 1 pedido esperando você.', String(r(1, 1, 1)))
  ok('sem pendente e sem pedido', r(4, 0, 0) === '4 consultas hoje.', String(r(4, 0, 0)))
  ok('só pedido, sem consulta', r(0, 0, 2) === '2 pedidos esperando você.', String(r(0, 0, 2)))

  /* Dia calmo não ganha frase: uma linha que só existe para dizer que não há
     nada vira ruído em todo dia sem consulta -- e dia sem consulta não é dia
     livre, é dia que o app não enxerga. */
  ok('dia vazio não diz nada', r(0, 0, 0) === null)

  /* "2 sem confirmar" sozinho não diz sem confirmar o quê. */
  ok('pendente sem consulta não vaza', r(0, 2, 0) === null, String(r(0, 2, 0)))
}

console.log('\n' + passou + ' passaram, ' + falhou + ' falharam')
process.exit(falhou > 0 ? 1 : 0)
