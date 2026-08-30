import {
  ALERGENOS,
  campoVisivel,
  ehCustom,
  ehOutroDoObjetivo,
  idCustom,
  modeloDoBanco,
  nomeDoAlergeno,
  quantasPerguntas,
  quantasRespondidas,
  respondido,
  secoesVisiveis,
  vazioDoModelo,
  valorInicial,
  type Campo,
  type Modelo,
} from './questionarioDaNutri.ts'

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

const campo = (chave: string, tipo: Campo['tipo'], extra: Partial<Campo> = {}): Campo => ({
  chave, label: chave, ajuda: null, tipo, opcoes: [], ...extra,
})

/* ────────────────────────────────────────────────────────────────────────── */
console.log('\n1. cada tipo começa com o vazio do widget dele')

{
  ok('checkbox_multi começa lista', Array.isArray(valorInicial('checkbox_multi')))
  ok('alergias começa lista', Array.isArray(valorInicial('alergias')))
  ok('texto começa string', valorInicial('texto') === '')
  ok('textarea começa string', valorInicial('textarea') === '')
  ok('radio começa null', valorInicial('radio') === null)
  ok('booleano começa null, e não false', valorInicial('booleano') === null)
  ok('numero começa null, e não 0', valorInicial('numero') === null)
  ok('escala começa null', valorInicial('escala_1a10') === null)
  ok('data começa null', valorInicial('data') === null)
  ok('objetivo começa null', valorInicial('objetivo') === null)
}

{
  /* `false` e `0` como valor inicial seriam respostas que ninguém deu: a tela
     mostraria "não" marcado e o zero escrito, e a nutricionista leria como
     resposta. Nulo é "não respondeu", que é a verdade. */
  const m: Modelo = { secoes: [{ titulo: 'S', subtitulo: null, campos: [
    campo('a', 'booleano'), campo('b', 'numero'), campo('c', 'checkbox_multi'),
  ] }] }
  const v = vazioDoModelo(m)
  ok('nada nasce respondido', quantasRespondidas(m.secoes, v) === 0)
}

console.log('\n2. gestação não se pergunta a quem não pode estar grávida')

{
  const g = campo('gestante_lactante', 'radio')
  ok('some para não feminino', campoVisivel(g, false) === false)
  ok('aparece para feminino', campoVisivel(g, true) === true)
  ok('qualquer outro campo aparece sempre', campoVisivel(campo('peso', 'numero'), false) === true)
}

{
  /* Seção que só tinha a pergunta de gestação some inteira — senão vira um
     passo em branco com botão de continuar. */
  const m: Modelo = { secoes: [
    { titulo: 'Saúde', subtitulo: null, campos: [campo('gestante_lactante', 'radio')] },
    { titulo: 'Rotina', subtitulo: null, campos: [campo('sono', 'escala_1a10')] },
  ] }
  ok('some a seção que ficou vazia', secoesVisiveis(m, false).length === 1)
  ok('e sobra a certa', secoesVisiveis(m, false)[0].titulo === 'Rotina')
  ok('para feminino ficam as duas', secoesVisiveis(m, true).length === 2)
}

{
  /* A seção mista NÃO some: perde a pergunta e mantém o resto. */
  const m: Modelo = { secoes: [{ titulo: 'Saúde', subtitulo: null, campos: [
    campo('gestante_lactante', 'radio'), campo('condicoes', 'checkbox_multi'),
  ] }] }
  const v = secoesVisiveis(m, false)
  ok('seção mista fica', v.length === 1)
  ok('com um campo só', v[0].campos.length === 1 && v[0].campos[0].chave === 'condicoes')
}

console.log('\n3. "outro objetivo" não aparece duas vezes')

{
  const secComObjetivo = {
    titulo: 'Objetivo', subtitulo: null,
    campos: [campo('objetivo_id', 'objetivo'), campo('objetivo_outro', 'texto')],
  }
  ok('escondido quando há campo de objetivo',
    ehOutroDoObjetivo(secComObjetivo.campos[1], secComObjetivo) === true)

  /* A nutricionista tirou a pergunta de objetivo do modelo dela: aí o "outro"
     volta a ser um texto comum, e some-lo deixaria a pergunta sem caixa. */
  const secSemObjetivo = {
    titulo: 'Objetivo', subtitulo: null, campos: [campo('objetivo_outro', 'texto')],
  }
  ok('aparece quando não há', ehOutroDoObjetivo(secSemObjetivo.campos[0], secSemObjetivo) === false)

  ok('outro campo qualquer nunca é escondido por esta regra',
    ehOutroDoObjetivo(secComObjetivo.campos[0], secComObjetivo) === false)
}

console.log('\n4. zero e "não" são respostas')

{
  ok('0 conta', respondido(0) === true)
  ok('false conta', respondido(false) === true)
  ok('string vazia não conta', respondido('') === false)
  ok('só espaço não conta', respondido('   ') === false)
  ok('lista vazia não conta', respondido([]) === false)
  ok('lista com item conta', respondido(['leite']) === true)
  ok('null não conta', respondido(null) === false)
  ok('undefined não conta', respondido(undefined) === false)
  ok('texto conta', respondido('sim') === true)
  ok('NaN não conta', respondido(Number.NaN) === false)
  ok('Infinity não conta', respondido(Number.POSITIVE_INFINITY) === false)
}

{
  /* O caso que motivou a regra: marcar "não" fazia o contador andar para trás
     se `false` fosse tratado como vazio. */
  const secoes = [{ titulo: 'S', subtitulo: null, campos: [
    campo('fuma', 'booleano'), campo('bebe', 'booleano'),
  ] }]
  ok('duas respostas "não" contam duas', quantasRespondidas(secoes, { fuma: false, bebe: false }) === 2)
  ok('nenhuma respondida conta zero', quantasRespondidas(secoes, { fuma: null, bebe: null }) === 0)
  ok('total de perguntas é 2', quantasPerguntas(secoes) === 2)
}

console.log('\n5. o modelo que vem do banco')

{
  const m = modeloDoBanco({
    secoes: [
      { titulo: 'Saúde', subtitulo: 'sobre você', campos: [
        { chave: 'condicoes', label: 'O que você tem?', tipo: 'checkbox_multi',
          opcoes: ['Hipertensão', 'Diabetes'], ajuda: 'marque tudo' },
      ] },
    ],
  })
  ok('leu a seção', m.secoes.length === 1)
  ok('leu o subtítulo', m.secoes[0].subtitulo === 'sobre você')
  ok('leu o campo', m.secoes[0].campos[0].chave === 'condicoes')
  ok('leu as opções', m.secoes[0].campos[0].opcoes.length === 2)
  ok('leu a ajuda', m.secoes[0].campos[0].ajuda === 'marque tudo')
}

{
  /* Tipo que este app ainda não desenha — porque a nutricionista ganhou um tipo
     novo no sistema dela. Sumir é melhor do que uma caixa em branco que a
     pessoa toca sem saber no quê. */
  const m = modeloDoBanco({ secoes: [{ titulo: 'S', campos: [
    { chave: 'a', tipo: 'assinatura_digital', label: 'Assine' },
    { chave: 'b', tipo: 'texto', label: 'Nome' },
  ] }] })
  ok('tipo desconhecido sai', m.secoes[0].campos.length === 1)
  ok('e o conhecido fica', m.secoes[0].campos[0].chave === 'b')
}

{
  const m = modeloDoBanco({ secoes: [{ titulo: 'S', campos: [
    { chave: '', tipo: 'texto', label: 'Sem chave' },
    { tipo: 'texto', label: 'Nem chave tem' },
    { chave: '   ', tipo: 'texto' },
  ] }] })
  ok('campo sem chave sai, e a seção vazia junto', m.secoes.length === 0)
}

{
  const m = modeloDoBanco({ secoes: [{ campos: [{ chave: 'a', tipo: 'texto' }] }] })
  ok('seção sem título ganha um', m.secoes[0].titulo === 'Perguntas')
  ok('campo sem label usa a chave', m.secoes[0].campos[0].label === 'a')
}

{
  ok('null não derruba', modeloDoBanco(null).secoes.length === 0)
  ok('undefined não derruba', modeloDoBanco(undefined).secoes.length === 0)
  ok('string não derruba', modeloDoBanco('oi').secoes.length === 0)
  ok('número não derruba', modeloDoBanco(42).secoes.length === 0)
  ok('secoes não-lista não derruba', modeloDoBanco({ secoes: 'nada' }).secoes.length === 0)
  ok('campos não-lista não derruba', modeloDoBanco({ secoes: [{ campos: 7 }] }).secoes.length === 0)
  ok('nulo dentro da lista não derruba', modeloDoBanco({ secoes: [null, undefined] }).secoes.length === 0)
}

{
  /* Chave de protótipo. A resposta vira chave de um objeto que sai daqui para o
     jsonb do banco — e a mesma armadilha que fez um dia de treino virar FUNÇÃO
     mora aqui: se alguém indexar as respostas por essa chave, `r['constructor']`
     devolve a função construtora e nenhum teste de `=== undefined` pega. */
  const m = modeloDoBanco({ secoes: [{ titulo: 'S', campos: [
    { chave: 'constructor', tipo: 'texto', label: 'x' },
    { chave: '__proto__', tipo: 'texto', label: 'y' },
  ] }] })
  const v = vazioDoModelo(m)
  ok('a chave de protótipo é aceita como chave normal', m.secoes[0].campos.length === 2)
  ok('e o vazio dela é string, não função', v['constructor'] === '', String(typeof v['constructor']))
  ok('respondido() não confunde função com resposta', respondido(v['constructor']) === false)
}

{
  const m = modeloDoBanco({ secoes: [{ titulo: 'S', campos: [
    { chave: 'a', tipo: 'radio', opcoes: ['sim', '', '   ', 'não', 42, null] },
  ] }] })
  ok('opção vazia e não-texto saem', m.secoes[0].campos[0].opcoes.length === 2,
    JSON.stringify(m.secoes[0].campos[0].opcoes))
}

console.log('\n6. alergias')

{
  ok('o catálogo tem os doze da RDC', ALERGENOS.length === 12, String(ALERGENOS.length))
  ok('nenhum id repetido', new Set(ALERGENOS.map(a => a.id)).size === ALERGENOS.length)
  ok('nome do catálogo', nomeDoAlergeno('leite').startsWith('Leite'))

  const c = idCustom('corante amarelo')
  ok('custom vira id com prefixo', c === 'custom:corante amarelo')
  ok('e é reconhecido', ehCustom(c) === true)
  ok('catálogo não é custom', ehCustom('leite') === false)
  ok('o nome do custom é o que ela escreveu', nomeDoAlergeno(c) === 'corante amarelo')
  ok('espaço em volta é aparado', idCustom('  glutamato  ') === 'custom:glutamato')

  /* Id que não existe mais no catálogo — porque o sistema tirou um. Mostrar o id
     cru é feio e é honesto; sumir apagaria da tela uma alergia que ela marcou. */
  ok('id desconhecido aparece como veio', nomeDoAlergeno('xpto') === 'xpto')
}

console.log('\n' + passou + ' passaram, ' + falhou + ' falharam')
if (falhou > 0) process.exit(1)
