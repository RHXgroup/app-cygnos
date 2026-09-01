/* A maquina de fases do modo treino, e a sonda que tenta quebra-la.
 *
 * Ela vivia dentro de dois `useEffect` que liam o relogio, e por isso o unico
 * jeito de testar era ir a academia e ouvir. O defeito da contagem ("fala tres,
 * dois, e para") apareceu assim -- com a pessoa no meio de uma serie.
 *
 * Rode com: node --experimental-strip-types src/lib/faseDoTreino.teste.mts */

import {
  ATRASO_QUE_INVALIDA_MS,
  PREPARO_MS,
  acaoDoMomento,
  restam,
  type Fase,
  type Momento,
} from './faseDoTreino.ts'

let passaram = 0
let falharam = 0

function ok(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) {
    passaram++
    console.log('  ok    ' + nome)
  } else {
    falharam++
    console.log('  FALHA ' + nome + (detalhe ? '  -> ' + detalhe : ''))
  }
}

const T = 1_000_000_000_000

const m = (x: Partial<Momento>): Momento => ({
  fase: 'treinando',
  fimDoPreparo: null,
  fimDoDescanso: null,
  agora: T,
  ...x,
})

console.log('\nA preparacao: sete segundos e a contagem falada')

{
  const dez = acaoDoMomento(m({ fase: 'preparando', fimDoPreparo: T + 7000 }))
  ok('faltando 7s, nao conta nada', dez.contar === null)
  ok('e nao muda de fase', dez.fase === null)
}

{
  for (const [faltam, esperado] of [
    [4000, null],
    [3000, 3],
    [2500, 3],
    [2000, 2],
    [1000, 1],
    [400, 1],
  ] as const) {
    const a = acaoDoMomento(m({ fase: 'preparando', fimDoPreparo: T + faltam }))
    ok(`faltando ${faltam}ms fala ${esperado}`, a.contar === esperado, String(a.contar))
  }
}

{
  const fim = acaoDoMomento(m({ fase: 'preparando', fimDoPreparo: T }))
  ok('no zero, comeca a serie', fim.comecarSerie === true)
  ok('e vai para treinando', fim.fase === 'treinando')
  ok('fala vai', fim.falar === 'vai')
  ok('e apita', fim.apitar === true)
  ok('e limpa o prazo', fim.fimDoPreparo === null)
}

console.log('\nO relogio congelado: o Android para o timer com o app no bolso')

{
  /* Este e o caso que o aparelho produz e o computador nao: a pessoa guarda o
     telefone, anda ate o bebedouro, volta -- e o instante seguinte esta dez
     minutos a frente. */
  const tarde = acaoDoMomento(
    m({ fase: 'preparando', fimDoPreparo: T - 10 * 60_000, agora: T }),
  )
  ok('a serie comeca do mesmo jeito', tarde.comecarSerie === true)
  ok('mas NAO fala "vai" com dez minutos de atraso', tarde.falar === null)
  ok('e nao apita', tarde.apitar === false)
}

{
  /* Na borda: um segundo abaixo do corte ainda avisa. */
  const quase = acaoDoMomento(
    m({ fase: 'preparando', fimDoPreparo: T - (ATRASO_QUE_INVALIDA_MS - 1000), agora: T }),
  )
  ok('atraso de 29s ainda fala', quase.falar === 'vai')
  const passou = acaoDoMomento(
    m({ fase: 'preparando', fimDoPreparo: T - (ATRASO_QUE_INVALIDA_MS + 1000), agora: T }),
  )
  ok('atraso de 31s ja nao fala', passou.falar === null)
}

console.log('\nO descanso')

{
  const meio = acaoDoMomento(m({ fase: 'descansando', fimDoDescanso: T + 30_000 }))
  ok('no meio do descanso, nada acontece', meio.fase === null && meio.falar === null)
}

{
  const fim = acaoDoMomento(m({ fase: 'descansando', fimDoDescanso: T }))
  ok('acabando, vai para a preparacao', fim.fase === 'preparando')
  ok('anuncia', fim.falar === 'descanso acabou')
  ok('e abre sete segundos', fim.fimDoPreparo === T + PREPARO_MS)
  /* A serie NAO comeca aqui: comeca no fim da preparacao. Comecar as duas
     coisas juntas contaria a caminhada ate a barra como parte da serie. */
  ok('e a serie nao comeca ainda', fim.comecarSerie === false)
  ok('o prazo do descanso e limpo', fim.fimDoDescanso === null)
}

{
  /* Voltou do bolso muito depois do descanso: pula a preparacao inteira. Ela
     existe para dar tempo de largar o telefone, e quem passou o descanso no
     bolso ja fez esse caminho. */
  const tarde = acaoDoMomento(
    m({ fase: 'descansando', fimDoDescanso: T - 5 * 60_000, agora: T }),
  )
  ok('atrasado demais nao abre preparacao', tarde.fase === 'treinando')
  ok('comeca a serie direto', tarde.comecarSerie === true)
  ok('e fica calado', tarde.falar === null && tarde.apitar === false)
}

console.log('\nEstados impossiveis nao podem prender a pessoa')

{
  const semPrazo = acaoDoMomento(m({ fase: 'preparando', fimDoPreparo: null }))
  ok('preparando sem prazo devolve o treino', semPrazo.fase === 'treinando')
  ok('e comeca a serie', semPrazo.comecarSerie === true)

  const descSemPrazo = acaoDoMomento(m({ fase: 'descansando', fimDoDescanso: null }))
  ok('descansando sem prazo tambem', descSemPrazo.fase === 'treinando')
}

{
  for (const lixo of [NaN, Infinity, -Infinity]) {
    const a = acaoDoMomento(m({ fase: 'preparando', fimDoPreparo: lixo, agora: T }))
    ok('prazo ' + String(lixo) + ' nao prende', a.fase === 'treinando')
    const b = acaoDoMomento(m({ fase: 'preparando', fimDoPreparo: T + 3000, agora: lixo }))
    ok('agora ' + String(lixo) + ' nao faz nada', b.fase === null && b.contar === null)
  }
}

{
  for (const f of ['parado', 'treinando'] as Fase[]) {
    const a = acaoDoMomento(m({ fase: f, fimDoPreparo: T - 1, fimDoDescanso: T - 1 }))
    ok(`fase ${f} ignora prazos vencidos`, a.fase === null && a.falar === null)
  }
}

console.log('\nO que a tela mostra')

{
  ok('faltando 3,4s mostra 4', restam(T + 3400, T) === 4)
  ok('no zero mostra 0', restam(T, T) === 0)
  ok('prazo vencido nunca mostra negativo', restam(T - 99_000, T) === 0)
  ok('prazo nulo mostra 0', restam(null, T) === 0)
  ok('NaN mostra 0', restam(NaN, T) === 0)
  ok('agora NaN mostra 0', restam(T + 3000, NaN) === 0)
}

/* ────────────────────────────────────────────────────────────────────────────
   A SONDA: instantes aleatorios, inclusive impossiveis
   ──────────────────────────────────────────────────────────────────────────*/
let semente = 20260901
const aleatorio = () => {
  semente = (semente * 1103515245 + 12345) & 0x7fffffff
  return semente / 0x7fffffff
}

const FASES: Fase[] = ['parado', 'preparando', 'treinando', 'descansando']

function prazoQualquer(): number | null {
  const d = aleatorio()
  if (d < 0.12) return null
  if (d < 0.18) return NaN
  if (d < 0.22) return Infinity
  if (d < 0.26) return -Infinity
  if (d < 0.3) return 0
  if (d < 0.36) return Number.MAX_SAFE_INTEGER
  /* De dez minutos atras a dez minutos a frente: cobre o relogio congelado. */
  return T + Math.round((aleatorio() - 0.5) * 20 * 60_000)
}

console.log('\nA sonda — 6000 instantes')

let quebras: string[] = []
for (let i = 0; i < 6000; i++) {
  const momento: Momento = {
    fase: FASES[Math.floor(aleatorio() * FASES.length)],
    fimDoPreparo: prazoQualquer(),
    fimDoDescanso: prazoQualquer(),
    agora: aleatorio() < 0.04 ? (prazoQualquer() as number) : T,
  }
  let a
  try {
    a = acaoDoMomento(momento)
  } catch (e) {
    quebras.push('ESTOUROU: ' + String(e).slice(0, 90))
    break
  }

  /* As propriedades que precisam valer sempre. */
  if (a.fase !== null && !FASES.includes(a.fase)) quebras.push('fase inventada: ' + a.fase)
  if (a.contar !== null && (a.contar < 1 || a.contar > 3))
    quebras.push('contou fora de 1..3: ' + a.contar)
  if (a.fimDoPreparo !== undefined && a.fimDoPreparo !== null && !Number.isFinite(a.fimDoPreparo))
    quebras.push('prazo nao finito: ' + a.fimDoPreparo)
  /* Nunca fala e conta no mesmo instante: uma fala corta a outra, e foi
     exatamente a colisao que quebrou a contagem no aparelho. */
  if (a.falar !== null && a.contar !== null) quebras.push('falou e contou junto')
  /* Nunca apita sem falar "vai": o apito e a largada, e largada muda tem de ser
     decisao explicita, nao efeito colateral. */
  if (a.apitar && a.falar !== 'vai') quebras.push('apitou sem ser a largada')
  /* Nunca comeca a serie continuando em preparando. */
  if (a.comecarSerie && a.fase === 'preparando') quebras.push('comecou a serie na preparacao')
  if (quebras.length >= 3) break
}

if (quebras.length === 0) {
  passaram++
  console.log('  ok    6000 instantes, nenhuma propriedade quebrada')
} else {
  falharam++
  console.log('  FALHA a sonda achou:')
  for (const q of quebras) console.log('          ' + q)
}

console.log(`\n${passaram} passaram, ${falharam} falharam`)
if (falharam > 0) process.exit(1)
