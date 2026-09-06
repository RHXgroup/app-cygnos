import { secaoVisivel, SECAO_NO_SERVIDOR, type SecoesVisiveis } from './secoesDoApp.ts'

let passou = 0
let falhou = 0

function ok(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) {
    passou++
    console.log('  ok    ' + nome)
  } else {
    falhou++
    console.log('  FALHA ' + nome + (detalhe ? '  -> ' + detalhe : ''))
  }
}

console.log('\n1. o que a nutricionista desligou some')

{
  const so: SecoesVisiveis = { anamnese_geral: false }
  ok('anamnese desligada não aparece', secaoVisivel('anamnese', so) === false)
  /* Desligar UMA não derruba as outras. */
  ok('antropometria segue visível', secaoVisivel('antropometria', so) === true)
  ok('fotos seguem visíveis', secaoVisivel('fotos', so) === true)
  ok('exames seguem visíveis', secaoVisivel('exames', so) === true)
  ok('plano segue visível', secaoVisivel('plano', so) === true)
}

console.log('\n2. o default é MOSTRAR (o silêncio nunca esconde)')

{
  /* Mapa vazio: erro de rede, ou ainda carregando. Tudo aparece, como era antes
     do interruptor existir — esconder por engano é o pior erro possível aqui. */
  const vazio: SecoesVisiveis = {}
  ok('mapa vazio mostra anamnese', secaoVisivel('anamnese', vazio) === true)
  ok('mapa vazio mostra exames', secaoVisivel('exames', vazio) === true)

  /* Chave presente e true: ligada de propósito. */
  ok('true aparece', secaoVisivel('anamnese', { anamnese_geral: true }) === true)

  /* Chave AUSENTE do mapa (o servidor só mandou outras): trata como visível.
     `!== false` de propósito — só `false` explícito esconde. */
  ok('ausente do mapa aparece', secaoVisivel('anamnese', { exames_laboratoriais: false }) === true)
}

console.log('\n3. chave sem interruptor no sistema é sempre visível')

{
  /* `energetico` e `receitas` não estão no de-para: o sistema não tem como
     desligá-las, então nem um mapa que negasse tudo as tira. */
  ok('energetico não está no de-para', !('energetico' in SECAO_NO_SERVIDOR))
  ok('receitas não está no de-para', !('receitas' in SECAO_NO_SERVIDOR))

  const negaTudo: SecoesVisiveis = {
    anamnese_geral: false, antropometria_geral: false, evolucao_fotografica: false,
    exames_laboratoriais: false, planejamento_alimentar: false,
  }
  ok('energetico aparece mesmo com tudo negado', secaoVisivel('energetico', negaTudo) === true)
  ok('receitas aparece mesmo com tudo negado', secaoVisivel('receitas', negaTudo) === true)
  /* E, no mesmo mapa, as que TÊM interruptor somem. */
  ok('anamnese some no mesmo mapa', secaoVisivel('anamnese', negaTudo) === false)
}

console.log(`\n${passou} passaram, ${falhou} falharam`)
if (falhou > 0) process.exit(1)
