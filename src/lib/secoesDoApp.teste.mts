import {
  SECAO_NO_SERVIDOR,
  secaoNaLista,
  secaoVisivel,
  type SecoesVisiveis,
} from './secoesDoApp.ts'

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

console.log('4. desligada com historico continua aparecendo')

{
  /* A regra que quem usa pediu, com as palavras dele: "o problema disso e
     historico do paciente ne, nao podemos fazer ele perde esse acesso ne" e
     "so que se ele desliga as proxima que ele fizer nao pode aparecer".

     O corte por data mora no SERVIDOR: as contagens que chegam aqui ja vem
     filtradas pelo instante em que a secao foi desligada. Entao a tela so
     precisa perguntar se sobrou alguma coisa para mostrar. */
  const desligada: SecoesVisiveis = { anamnese_geral: false, evolucao_fotografica: false }

  ok('desligada e vazia some', secaoNaLista('anamnese', desligada, 0) === false)
  ok('desligada com historico aparece', secaoNaLista('anamnese', desligada, 3) === true)
  ok('desligada sem contagem some', secaoNaLista('anamnese', desligada) === false)

  /* Ligada aparece mesmo sem nada: ela ainda vai preencher, e uma secao que so
     nasce depois do primeiro registro esconde de onde ele vai vir. */
  ok('ligada e vazia aparece', secaoNaLista('antropometria', desligada, 0) === true)

  /* Sem resposta do servidor NADA some -- secaoVisivel ja devolve true, e o ||
     so pode confirmar. Esconder por erro de rede seria a nutricionista publicar
     e o paciente nao ver, sem ninguem ter desligado. */
  ok('mapa vazio aparece mesmo com zero', secaoNaLista('anamnese', {}, 0) === true)

  /* Chave sem interruptor nao depende de contagem nenhuma. */
  ok('energetico aparece com zero', secaoNaLista('energetico', desligada, 0) === true)

  /* Negativo e NaN nao podem virar "tem conteudo". */
  ok('contagem negativa some', secaoNaLista('anamnese', desligada, -1) === false)
  ok('NaN some', secaoNaLista('anamnese', desligada, Number.NaN) === false)
}

console.log(`\n${passou} passaram, ${falhou} falharam`)
if (falhou > 0) process.exit(1)
