import { proximoPasso } from './proximoPasso.ts'

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

/* 29/08/2026 é um sábado. `as` porque os tipos vêm de módulos que puxam o
   Supabase, e este arquivo roda fora do aparelho. */
const em = (h: number, m = 0) => new Date(2026, 7, 29, h, m)
const HOJE = '2026-08-29'
const SABADO = 6

const metas = (extra: Record<string, unknown> = {}) =>
  ({
    calorias: 2000, proteinas: null, carboidratos: null, gorduras: null, fibras: null,
    aguaMl: 2000, copoMl: 250, passos: null, treinosSemana: null, sonoHoras: 8,
    ...extra,
  }) as never

const plano = (refeicoes: { rotulo: string; hora: string }[], dias = [0, 1, 2, 3, 4, 5, 6]) =>
  ({
    id: 'p', nome: 'Plano', observacao: null, criadoEm: HOJE, ativo: true,
    diasSemana: dias,
    refeicoes: refeicoes.map((r, i) => ({ id: String(i), rotulo: r.rotulo, hora: r.hora, itens: [] })),
  }) as never

/* Quanto falta para o ritmo. É o que `ritmoDaAgua` calcula e entrega pronto —
   aqui só interessa a prioridade que esse número dispara. */
const atrasoDeAgua = (ml: number | null) => ml

const item = () => ({ id: 'i', refeicao: 'Almoço', nome: 'Arroz', comidoEm: HOJE }) as never

const vazio = {
  metas: metas(), aguaAtrasadaMl: null, consumo: [], plano: null, noites: [],
  rotina: [], sessoes: [],
}

// ── 1. Sem meta e sem plano, é o primeiro passo de todos ─────────────────────
{
  console.log('\n1. quem ainda não definiu nada')
  const p = proximoPasso({ ...vazio, metas: metas({ calorias: null }), agora: em(15) })
  ok('manda definir a meta', p.chave === 'metas', p.chave)
  ok('e leva para lá', p.destino === 'metas')
}

// ── 2. Refeição chegando vence tudo ──────────────────────────────────────────
{
  console.log('\n2. refeição com hora marcada')

  const base = {
    ...vazio,
    plano: plano([{ rotulo: 'Almoço', hora: '12:30' }]),
    aguaAtrasadaMl: atrasoDeAgua(1500),   // água muito atrasada
    consumo: [],            // nada anotado
  }

  const meia = proximoPasso({ ...base, agora: em(11, 45) })
  ok('45 min antes, avisa da refeição', meia.chave === 'refeicao', meia.chave)
  ok('e diz quanto falta', meia.texto.includes('45 min'), meia.texto)
  ok('vence água atrasada e comida não anotada', meia.chave === 'refeicao')

  const longe = proximoPasso({ ...base, agora: em(9) })
  ok('3h antes, NÃO avisa da refeição', longe.chave !== 'refeicao', longe.chave)

  const passou_ = proximoPasso({ ...base, agora: em(14) })
  ok('depois que passou, não avisa', passou_.chave !== 'refeicao', passou_.chave)
}

// ── 3. O plano só vale nos dias dele ─────────────────────────────────────────
{
  console.log('\n3. plano que não vale hoje')
  /* Plano de segunda a sexta, e hoje é sábado. */
  const p = proximoPasso({
    ...vazio,
    plano: plano([{ rotulo: 'Almoço', hora: '12:30' }], [1, 2, 3, 4, 5]),
    agora: em(12),
  })
  ok('não avisa de refeição em dia fora do plano', p.chave !== 'refeicao', p.chave)
}

// ── 4. Sono só de manhã ──────────────────────────────────────────────────────
{
  console.log('\n4. a noite passada')

  const manha = proximoPasso({ ...vazio, agora: em(8) })
  ok('às 8h pergunta do sono', manha.chave === 'sono', manha.chave)

  const noite = proximoPasso({ ...vazio, agora: em(20) })
  ok('às 20h NÃO pergunta mais', noite.chave !== 'sono', noite.chave)

  const jaTem = proximoPasso({
    ...vazio,
    noites: [{ id: 'n', data: HOJE, deitou: '23:00', levantou: '07:00' } as never],
    agora: em(8),
  })
  ok('já registrada, não pergunta', jaTem.chave !== 'sono', jaTem.chave)

  const semMeta = proximoPasso({ ...vazio, metas: metas({ sonoHoras: null }), agora: em(8) })
  ok('quem não acompanha sono não é perguntado', semMeta.chave !== 'sono', semMeta.chave)
}

// ── 5. Nada anotado, mas só depois das 11h ───────────────────────────────────
{
  console.log('\n5. o dia andando sem registro')

  const cedo = proximoPasso({ ...vazio, metas: metas({ sonoHoras: null }), agora: em(9, 30) })
  ok('às 9h30 não cobra', cedo.chave !== 'comida', cedo.chave)

  const tarde = proximoPasso({ ...vazio, metas: metas({ sonoHoras: null }), agora: em(11, 30) })
  ok('às 11h30 avisa', tarde.chave === 'comida', tarde.chave)
  ok('sem palavra de bronca', !/devendo|deveria|falhou|esqueceu/i.test(tarde.texto), tarde.texto)

  const comItem = proximoPasso({
    ...vazio, metas: metas({ sonoHoras: null }), consumo: [item()], agora: em(15),
  })
  ok('com item anotado, não cobra', comItem.chave !== 'comida', comItem.chave)
}

// ── 6. Treino só em dia de rotina, e só à noite ──────────────────────────────
{
  console.log('\n6. o treino de hoje')

  const rotinaHoje = [{ id: 'e', dia: SABADO, nome: 'Supino', ordem: 0 } as never]
  const base = { ...vazio, metas: metas({ sonoHoras: null }), consumo: [item()], rotina: rotinaHoje }

  const tarde = proximoPasso({ ...base, agora: em(19) })
  ok('às 19h em dia de treino, avisa', tarde.chave === 'treino', tarde.chave)

  const cedo = proximoPasso({ ...base, agora: em(10) })
  ok('às 10h não cobra treino', cedo.chave !== 'treino', cedo.chave)

  const feito = proximoPasso({
    ...base, sessoes: [{ id: 's', data: HOJE } as never], agora: em(19),
  })
  ok('já treinou, não cobra', feito.chave !== 'treino', feito.chave)

  const descanso = proximoPasso({
    ...base, rotina: [{ id: 'e', dia: 1, nome: 'Supino', ordem: 0 } as never], agora: em(19),
  })
  ok('dia de descanso não vira cobrança', descanso.chave !== 'treino', descanso.chave)
}

// ── 7. Água, por último entre os avisos ──────────────────────────────────────
{
  console.log('\n7. o ritmo da água')

  const base = { ...vazio, metas: metas({ sonoHoras: null }), consumo: [item()] }

  const atras = proximoPasso({ ...base, aguaAtrasadaMl: atrasoDeAgua(750), agora: em(15) })
  ok('atrasada, avisa', atras.chave === 'agua', atras.chave)
  ok('diz quanto falta em ml', /\d+ ml/.test(atras.texto), atras.texto)
  ok('e o número é positivo', !atras.texto.includes('-'), atras.texto)

  const emDia = proximoPasso({ ...base, aguaAtrasadaMl: atrasoDeAgua(null), agora: em(15) })
  ok('em dia não vira aviso', emDia.chave !== 'agua', emDia.chave)
}

// ── 8. Sem plano, já registrando: sugere o próximo degrau ────────────────────
{
  console.log('\n8. o convite para montar plano')
  const p = proximoPasso({
    ...vazio, metas: metas({ sonoHoras: null }), consumo: [item()],
    aguaAtrasadaMl: null, agora: em(15),
  })
  ok('sugere montar plano', p.chave === 'plano', p.chave)
  ok('e leva para lá', p.destino === 'plano')
}

// ── 9. Tudo em dia ───────────────────────────────────────────────────────────
{
  console.log('\n9. quando não há o que dizer')
  const p = proximoPasso({
    ...vazio,
    metas: metas({ sonoHoras: null }),
    consumo: [item()],
    aguaAtrasadaMl: null,
    plano: plano([{ rotulo: 'Jantar', hora: '20:00' }]),
    agora: em(15),
  })
  ok('diz que está em dia', p.chave === 'em_dia', p.chave)
  ok('e não leva a lugar nenhum', p.destino === null)
}

// ── 10. Nenhuma frase repreende ──────────────────────────────────────────────
{
  console.log('\n10. o tom de todas as frases')
  const cenarios = [
    { ...vazio, metas: metas({ calorias: null }), agora: em(15) },
    { ...vazio, agora: em(8) },
    { ...vazio, metas: metas({ sonoHoras: null }), agora: em(12) },
    { ...vazio, metas: metas({ sonoHoras: null }), consumo: [item()], aguaAtrasadaMl: 800, agora: em(16) },
  ]
  const BRONCA = /voc[eê] n[aã]o fez|devendo|deveria ter|falhou|esqueceu|atrasad[oa]|perdeu/i
  const ruins = cenarios.map(c => proximoPasso(c)).filter(p => BRONCA.test(p.texto))
  ok('nenhuma frase repreende', ruins.length === 0, ruins.map(r => r.texto).join(' | '))
}

// ── 11. O que a pessoa avisou, o app não cobra ───────────────────────────────
{
  console.log('\n11. a intenção cala a cobrança')

  const intencao = (extra: Record<string, unknown>) =>
    ({ tipo: 'refeicao_fora', quando: HOJE, ate: null, refeicao: null, texto: 'x', ...extra }) as never

  /* Avisou que almoça fora: o "Almoço em 45 min" não aparece. A refeição
     continua no plano e nos cartões — o que cala é a COBRANÇA dela. */
  const base = { ...vazio, plano: plano([{ rotulo: 'Almoço', hora: '12:30' }]) }
  ok('sem aviso, cobra a refeição',
    proximoPasso({ ...base, agora: em(11, 45) }).chave === 'refeicao')
  ok('com aviso, não cobra',
    proximoPasso({ ...base, intencoesDeHoje: [intencao({ refeicao: 'Almoço' })], agora: em(11, 45) })
      .chave !== 'refeicao')
  /* O aviso é da refeição CERTA: quem avisou do jantar continua sendo lembrado
     do almoço. */
  ok('aviso de outra refeição não cala esta',
    proximoPasso({ ...base, intencoesDeHoje: [intencao({ refeicao: 'Jantar' })], agora: em(11, 45) })
      .chave === 'refeicao')

  /* Viagem e evento calam o dia inteiro. Cobrar registro de quem avisou que
     está viajando é briga perdida, e ensina que falar com o app não serve. */
  ok('viajando, não cobra registro',
    proximoPasso({ ...vazio, metas: metas({ sonoHoras: null }),
      intencoesDeHoje: [intencao({ tipo: 'viagem' })], agora: em(12) }).chave !== 'comida')
  ok('em evento, não cobra treino',
    proximoPasso({ ...vazio, metas: metas({ sonoHoras: null }), consumo: [item()],
      rotina: [{ id: 'e', dia: SABADO, nome: 'Supino', ordem: 0 } as never],
      intencoesDeHoje: [intencao({ tipo: 'evento' })], agora: em(19) }).chave !== 'treino')

  /* A intenção NUNCA cria cobrança nova — ela só cala. */
  ok('aviso não inventa cobrança',
    proximoPasso({ ...vazio, metas: metas({ sonoHoras: null }), consumo: [item()],
      plano: plano([{ rotulo: 'Jantar', hora: '20:00' }]),
      intencoesDeHoje: [intencao({ tipo: 'viagem' })], agora: em(15) }).chave === 'em_dia')
}

console.log('\n' + passou + ' passaram, ' + falhou + ' falharam')
process.exit(falhou > 0 ? 1 : 0)
