import { marcaDe, montarAvisos, quantosNovos, type Marca, type Retrato } from './montarAvisos.ts'

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

const NUTRI = { id: 'n1', nome: 'Luana Siqueira' }

const retrato = (extra: Partial<Retrato> = {}): Retrato => ({
  consultas: [],
  nutricionista: null,
  planoId: null,
  mensagensNaoLidas: 0,
  ...extra,
})

const consulta = (id: number, status: string, quando = 'quinta, 3 de setembro, às 14:00') => ({
  id,
  status,
  quando,
})

/* A marca de uma visita anterior. Passar `null` é a estreia. */
const visitou = (r: Retrato): Marca => marcaDe(r)

const ids = (r: Retrato, m: Marca | null) => montarAvisos(r, m).map(a => a.id)
const titulos = (r: Retrato, m: Marca | null) => montarAvisos(r, m).map(a => a.titulo)

console.log('\nmontarAvisos\n')

/* ── A estreia ─────────────────────────────────────────────────────────────
 *
 * Quem instala hoje não pode receber "plano novo!" por um plano de três meses
 * atrás. O estado continua aparecendo; o que some é a alegação de que mudou. */
{
  const agora = retrato({
    nutricionista: NUTRI,
    planoId: 'p1',
    consultas: [consulta(1, 'confirmada')],
  })
  const lista = montarAvisos(agora, null)

  ok('estreia não anuncia vínculo antigo', !lista.some(a => a.id.startsWith('vinculo:')))
  ok('estreia não anuncia plano antigo', !lista.some(a => a.id.startsWith('plano:')))
  ok('estreia não anuncia consulta antiga', !lista.some(a => a.id.startsWith('consulta:')))
  ok('estreia não tem nada novo', quantosNovos(lista) === 0)
}

/* ── Vínculo ───────────────────────────────────────────────────────────────*/
{
  const antes = visitou(retrato())
  const agora = retrato({ nutricionista: NUTRI })

  ok('vínculo novo vira aviso', ids(agora, antes).includes('vinculo:n1'))
  ok('vínculo novo leva à ficha', montarAvisos(agora, antes)[0].destino === 'nutricionista')
  ok('nome dela aparece no texto', montarAvisos(agora, antes)[0].texto.includes('Luana'))

  const depois = visitou(agora)
  ok('vínculo que continua o mesmo não repete', ids(agora, depois).length === 0)
}

{
  /* Trocou de nutricionista: é vínculo novo, não silêncio. */
  const antes = visitou(retrato({ nutricionista: NUTRI }))
  const agora = retrato({ nutricionista: { id: 'n2', nome: 'Mariana' } })
  ok('trocar de nutricionista avisa', ids(agora, antes).includes('vinculo:n2'))
}

/* ── Plano ─────────────────────────────────────────────────────────────────*/
{
  const antes = visitou(retrato({ planoId: 'p1' }))
  ok('plano novo vira aviso', ids(retrato({ planoId: 'p2' }), antes).includes('plano:p2'))
  ok('mesmo plano não repete', ids(retrato({ planoId: 'p1' }), antes).length === 0)
  ok(
    'plano novo devolve para a tela inicial',
    montarAvisos(retrato({ planoId: 'p2' }), antes)[0].destino === 'inicio',
  )
}

/* ── Consultas ─────────────────────────────────────────────────────────────
 *
 * O caso que custou uma correção: uma consulta RECUSADA era anunciada como
 * "Pedido aceito", porque tudo que não era 'solicitada' caía no mesmo ramo.
 * Dizer que foi aceito o que foi recusado põe alguém no consultório num dia em
 * que não era esperada. */
{
  const antes = visitou(retrato({ consultas: [consulta(1, 'solicitada')] }))

  const aceita = retrato({ consultas: [consulta(1, 'confirmada')] })
  ok('pedido aceito é anunciado como aceito', titulos(aceita, antes)[0] === 'Pedido aceito')

  const recusada = retrato({ consultas: [consulta(1, 'recusada')] })
  ok('recusada NÃO vira "pedido aceito"', !titulos(recusada, antes).includes('Pedido aceito'))
  ok('recusada avisa que mudou', titulos(recusada, antes)[0] === 'A sua consulta mudou')
  ok(
    'recusada manda confirmar antes de se programar',
    montarAvisos(recusada, antes)[0].texto.includes('Confirme'),
  )

  const inventada = retrato({ consultas: [consulta(1, 'status_que_nunca_existiu')] })
  ok(
    'status desconhecido também não vira aceite',
    titulos(inventada, antes)[0] === 'A sua consulta mudou',
  )
}

{
  /* Ela marcou sozinha (a consulta nem existia antes) é diferente de ela ter
     aceitado o pedido dele. */
  const antes = visitou(retrato())
  const agora = retrato({ consultas: [consulta(7, 'confirmada')] })
  ok('consulta que ela criou tem frase própria', titulos(agora, antes)[0] === 'Consulta marcada para você')
}

{
  /* Pedido em aberto é ESTADO, não notícia: continua na lista todo dia, mas só
     conta como novidade na primeira vez. */
  const antes = visitou(retrato())
  const agora = retrato({ consultas: [consulta(3, 'solicitada')] })
  const primeira = montarAvisos(agora, antes)
  ok('pedido em aberto aparece', primeira[0].titulo === 'Pedido aguardando resposta')
  ok('pedido em aberto conta como novo na primeira vez', primeira[0].novo)

  const depois = visitou(agora)
  const segunda = montarAvisos(agora, depois)
  ok('pedido em aberto continua na lista', segunda.length === 1)
  ok('pedido em aberto não pisca de novo', !segunda[0].novo)
  ok('e por isso não acende o ponto', quantosNovos(segunda) === 0)
}

{
  /* Consulta parada no mesmo estado não gera aviso nenhum. */
  const r = retrato({ consultas: [consulta(1, 'confirmada')] })
  ok('consulta sem mudança fica calada', ids(r, visitou(r)).length === 0)
}

/* ── Mensagens ─────────────────────────────────────────────────────────────
 *
 * A única fonte que NÃO depende do retrato: `lida_em` é do banco, então aqui o
 * app sabe o que a pessoa leu em vez de adivinhar. */
{
  const antes = visitou(retrato({ nutricionista: NUTRI }))
  const uma = retrato({ nutricionista: NUTRI, mensagensNaoLidas: 1 })
  const varias = retrato({ nutricionista: NUTRI, mensagensNaoLidas: 4 })

  ok('uma não lida avisa no singular', titulos(uma, antes)[0] === 'Mensagem nova')
  ok('quatro não lidas dizem quantas', titulos(varias, antes)[0] === '4 mensagens novas')
  ok('a mensagem leva à conversa', montarAvisos(uma, antes)[0].destino === 'mensagens')
  ok('a mensagem acende o ponto', quantosNovos(montarAvisos(uma, antes)) === 1)

  ok('zero não lidas não avisa', !ids(retrato({ nutricionista: NUTRI }), antes).length)

  /* Ao contrário de todo o resto, aparece na estreia: quem reinstala o app e
     tem mensagem sem ler continua tendo mensagem sem ler. */
  ok('não lida aparece mesmo na estreia', titulos(uma, null)[0] === 'Mensagem nova')

  /* Sem vínculo o nome não existe, e o texto não pode dizer "undefined". */
  const semNutri = retrato({ mensagensNaoLidas: 2 })
  ok(
    'sem nutricionista o texto não inventa nome',
    !montarAvisos(semNutri, null)[0].texto.includes('undefined'),
  )

  /* Ela vem primeiro: é a única coisa que espera resposta da pessoa. */
  const tudo = retrato({
    nutricionista: NUTRI,
    planoId: 'p2',
    mensagensNaoLidas: 1,
    consultas: [consulta(1, 'confirmada')],
  })
  ok('mensagem encabeça a lista', montarAvisos(tudo, antes)[0].destino === 'mensagens')
}

/* ── A marca ───────────────────────────────────────────────────────────────*/
{
  const r = retrato({
    nutricionista: NUTRI,
    planoId: 'p1',
    mensagensNaoLidas: 3,
    consultas: [consulta(1, 'solicitada'), consulta(2, 'confirmada')],
  })
  const m = marcaDe(r)

  ok('a marca guarda o status de cada consulta', m.consultas['1'] === 'solicitada' && m.consultas['2'] === 'confirmada')
  ok('a marca guarda o id da nutricionista', m.nutricionistaId === 'n1')
  ok('a marca guarda o id do plano', m.planoId === 'p1')
  /* Não lidas NÃO entram na marca: elas têm verdade própria no banco, e
     guardá-las aqui criaria uma segunda versão do que já é fato. */
  ok('a marca não guarda mensagens', !('mensagensNaoLidas' in m))
  ok('a marca não guarda texto nenhum', !JSON.stringify(m).includes('Luana'))
}

/* ── Ids estáveis ──────────────────────────────────────────────────────────
 *
 * O id nasce do assunto e do estado, e não de um contador: é o que impede o
 * mesmo aviso de aparecer duas vezes na mesma lista. */
{
  const antes = visitou(retrato())
  const agora = retrato({
    nutricionista: NUTRI,
    planoId: 'p1',
    mensagensNaoLidas: 1,
    consultas: [consulta(1, 'confirmada'), consulta(2, 'solicitada')],
  })
  const lista = ids(agora, antes)
  ok('nenhum id se repete', new Set(lista).size === lista.length, lista.join(', '))
}

console.log(`\n${passou} ok, ${falhou} falha(s)\n`)
if (falhou > 0) process.exit(1)
