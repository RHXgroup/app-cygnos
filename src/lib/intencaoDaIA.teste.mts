import { intencaoDaIA, valemPara, type Intencao } from './intencaoDaIA.ts'

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

const HOJE = '2026-08-30'

// ── 1. O caminho feliz ───────────────────────────────────────────────────────
{
  console.log('\n1. a frase que o app tem de entender')
  const r = intencaoDaIA(
    {
      intencoes: [
        { tipo: 'refeicao_fora', quando: '2026-08-31', refeicao: 'Almoço', texto: 'Almoço fora amanhã' },
        { tipo: 'treino', quando: '2026-08-30', texto: 'Treino hoje à noite' },
      ],
      observacao: 'Anotei os dois.',
    },
    HOJE,
  )
  ok('duas intenções', r.intencoes.length === 2, String(r.intencoes.length))
  ok('sem problema', r.problemas.length === 0, JSON.stringify(r.problemas))
  ok('guarda a refeição', r.intencoes[0].refeicao === 'Almoço')
  ok('guarda a observação', r.observacao === 'Anotei os dois.')
}

// ── 2. A data tem de ser uma data de verdade ─────────────────────────────────
{
  console.log('\n2. datas')
  const casos: [string, boolean][] = [
    ['2026-08-30', true], // hoje entra: "hoje eu janto fora" é o caso mais comum
    ['2026-09-15', true],
    ['2026-08-29', false], // ontem não
    ['2026-02-31', false], // não existe, e o Date do JS deslizaria para 3 de março
    ['2026-13-01', false],
    ['2027-06-01', false], // além de 90 dias
    ['31/08/2026', false],
    ['amanhã', false],
    ['', false],
  ]
  for (const [quando, aceita] of casos) {
    const r = intencaoDaIA(
      { intencoes: [{ tipo: 'treino', quando, texto: 'Vou treinar' }] },
      HOJE,
    )
    ok(
      `"${quando}" ${aceita ? 'entra' : 'NÃO entra'}`,
      (r.intencoes.length === 1) === aceita,
      JSON.stringify(r.intencoes),
    )
  }
}

// ── 3. Só o propósito vive sem data ──────────────────────────────────────────
{
  console.log('\n3. o propósito é o único sem dia')
  const p = intencaoDaIA(
    { intencoes: [{ tipo: 'proposito', texto: 'Quero comer menos à noite' }] },
    HOJE,
  )
  ok('propósito sem data entra', p.intencoes.length === 1, JSON.stringify(p.problemas))
  ok('e fica com quando nulo', p.intencoes[0].quando === null)

  for (const tipo of ['refeicao_fora', 'treino', 'viagem', 'evento', 'refeicao_pulada']) {
    const r = intencaoDaIA({ intencoes: [{ tipo, texto: 'Alguma coisa' }] }, HOJE)
    ok(`${tipo} sem data NÃO entra`, r.intencoes.length === 0, JSON.stringify(r.intencoes))
  }
}

// ── 4. O intervalo da viagem ─────────────────────────────────────────────────
{
  console.log('\n4. viagem, que ocupa mais de um dia')
  const r = intencaoDaIA(
    {
      intencoes: [
        { tipo: 'viagem', quando: '2026-09-01', ate: '2026-09-05', texto: 'Viagem a trabalho' },
      ],
    },
    HOJE,
  )
  ok('guarda o intervalo', r.intencoes[0].ate === '2026-09-05', String(r.intencoes[0].ate))

  const invertida = intencaoDaIA(
    {
      intencoes: [
        { tipo: 'viagem', quando: '2026-09-05', ate: '2026-09-01', texto: 'Viagem' },
      ],
    },
    HOJE,
  )
  /* Fim antes do começo é resposta confusa. O começo sozinho já serve, e
     inverter por conta própria inventaria cinco dias que ninguém disse. */
  ok('fim antes do começo é descartado', invertida.intencoes[0].ate === null)
}

// ── 5. O que não dá para ler é CONTADO ───────────────────────────────────────
{
  console.log('\n5. o que se perde, e o aviso')
  const r = intencaoDaIA(
    {
      intencoes: [
        { tipo: 'inventado', quando: '2026-09-01', texto: 'Coisa' },
        { tipo: 'treino', quando: '2026-09-01', texto: '' },
        { tipo: 'treino', quando: '2026-09-02', texto: 'Vou correr' },
      ],
    },
    HOJE,
  )
  ok('só a boa entra', r.intencoes.length === 1, JSON.stringify(r.intencoes))
  ok('e as duas ruins são anotadas', r.problemas.length === 2, JSON.stringify(r.problemas))
}

// ── 6. Resposta que não é resposta ───────────────────────────────────────────
{
  console.log('\n6. o JSON torto')
  for (const bruto of [null, undefined, {}, { intencoes: null }, { intencoes: [] }, 42, 'texto', { intencoes: {} }]) {
    const r = intencaoDaIA(bruto, HOJE)
    ok(
      `${JSON.stringify(bruto)} não derruba`,
      Array.isArray(r.intencoes) && r.intencoes.length === 0 && r.problemas.length > 0,
      JSON.stringify(r),
    )
  }
}

// ── 7. Limites de tamanho ────────────────────────────────────────────────────
{
  console.log('\n7. texto gigante')
  const r = intencaoDaIA(
    {
      intencoes: [
        { tipo: 'treino', quando: '2026-09-01', refeicao: 'x'.repeat(200), texto: 'y'.repeat(900) },
      ],
      observacao: 'z'.repeat(900),
    },
    HOJE,
  )
  ok('texto cortado em 160', r.intencoes[0].texto.length === 160, String(r.intencoes[0].texto.length))
  ok('refeição cortada em 30', (r.intencoes[0].refeicao ?? '').length === 30)
  ok('observação cortada em 300', (r.observacao ?? '').length === 300)
}

// ── 8. Quais valem para o dia ────────────────────────────────────────────────
{
  console.log('\n8. o que vale para um dia')
  const intencoes: Intencao[] = [
    { tipo: 'refeicao_fora', quando: '2026-09-01', ate: null, refeicao: 'Almoço', texto: 'a' },
    { tipo: 'viagem', quando: '2026-09-03', ate: '2026-09-07', refeicao: null, texto: 'b' },
    { tipo: 'proposito', quando: null, ate: null, refeicao: null, texto: 'c' },
  ]
  ok('o dia exato', valemPara(intencoes, '2026-09-01').length === 1)
  ok('dentro da viagem', valemPara(intencoes, '2026-09-05')[0]?.tipo === 'viagem')
  ok('primeiro dia da viagem entra', valemPara(intencoes, '2026-09-03').length === 1)
  ok('último dia da viagem entra', valemPara(intencoes, '2026-09-07').length === 1)
  ok('depois da viagem não', valemPara(intencoes, '2026-09-08').length === 0)
  ok('dia sem nada', valemPara(intencoes, '2026-09-02').length === 0)
  /* O propósito NUNCA silencia cobrança: "quero comer menos à noite" não é
     aviso de que hoje não vai dar para registrar o jantar. */
  ok('propósito nunca vale para um dia', !valemPara(intencoes, '2026-09-01').some(i => i.tipo === 'proposito'))
}

console.log('\n' + passou + ' passaram, ' + falhou + ' falharam')
process.exit(falhou > 0 ? 1 : 0)
