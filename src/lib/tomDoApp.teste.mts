/* O tom, varrido de uma vez.
 *
 * Cada lib tem o seu crivo, e cada crivo cobre as frases daquela lib. Este
 * varre TODAS ao mesmo tempo, com a mesma regua -- porque o tom nao e
 * propriedade de um arquivo: e do app. Uma frase gentil no ciclo e uma
 * ameacadora no treino sao dois apps na mesma tela.
 *
 * E ele gera as frases exercitando as funcoes de verdade, e nao lendo o codigo:
 * um crivo que le string literal nao ve a frase montada por concatenacao, que e
 * justamente onde o tom escapa.
 *
 * Rode com: node --experimental-strip-types src/lib/tomDoApp.teste.mts */

import { fraseDaSequencia, sequenciaDaPessoa, textoDaSequencia } from './sequenciaDaPessoa.ts'
import { fraseDaDistancia, resumoDaTendencia, tendenciaDoPeso } from './tendenciaDoPeso.ts'
import { fraseDoGasto, gastoReal } from './gastoReal.ts'
import { comoFoiCalculado, metasSugeridas } from './metasSugeridas.ts'
import { prontidaoDeHoje } from './prontidaoDeHoje.ts'
import { descobertas } from './descobertas.ts'

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

const dia = (n: number) => `2026-08-${String(n).padStart(2, '0')}`
const seguidos = (fim: string, q: number) => {
  const fora: string[] = []
  const d = new Date(Date.parse(fim + 'T00:00:00Z'))
  for (let i = 0; i < q; i++) {
    fora.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() - 1)
  }
  return fora
}

/* TODAS as frases que o app pode dizer, geradas de verdade. */
function todasAsFrases(): { de: string; texto: string }[] {
  const f: { de: string; texto: string }[] = []
  const H = '2026-08-31'

  for (const n of [0, 1, 5, 6, 7, 14, 30, 100, 365]) {
    f.push({ de: 'sequencia', texto: fraseDaSequencia(sequenciaDaPessoa(seguidos(H, n), H)) })
    if (n > 0) {
      const t = textoDaSequencia(n)
      f.push({ de: 'aviso 20h', texto: `${t.title}. ${t.body}` })
    }
  }
  for (const n of [1, 5, 12]) {
    f.push({ de: 'sequencia em risco', texto: fraseDaSequencia(sequenciaDaPessoa(seguidos('2026-08-30', n), H)) })
  }

  /* Peso: balanca acima e abaixo da linha. */
  for (const ultimo of [72.4, 68.2]) {
    const s = tendenciaDoPeso([
      ...Array.from({ length: 12 }, (_, i) => ({ data: dia(i + 1), kg: 70 })),
      { data: dia(13), kg: ultimo },
    ])
    const fd = fraseDaDistancia(resumoDaTendencia(s))
    if (fd) f.push({ de: 'peso', texto: fd })
  }

  /* Gasto: perdendo, ganhando, estavel. */
  for (const [de, ate] of [[77, 75], [70, 71], [72, 72]] as [number, number][]) {
    const g = gastoReal(
      Array.from({ length: 28 }, (_, i) => ({ data: dia(i + 1), calorias: 2000 })),
      Array.from({ length: 28 }, (_, i) => ({
        data: dia(i + 1),
        tendencia: de + ((ate - de) * i) / 27,
      })),
    )
    if (g) f.push({ de: 'gasto', texto: fraseDoGasto(g) })
  }

  /* Metas, nos tres degraus. */
  const corpo = { pesoKg: 68, alturaCm: 165, idade: 32, sexo: 'F' as const }
  for (const [calc, med] of [[null, null], [2100, null], [2100, 2400]] as [number | null, number | null][]) {
    const s = metasSugeridas(corpo, calc, med)
    if (s) f.push({ de: 'metas', texto: comoFoiCalculado(s) })
  }

  /* Prontidao, em todos os niveis. */
  for (const m of [260, 300, 340, 400, 450, 520]) {
    const p = prontidaoDeHoje([{ data: '2026-08-31', minutos: m, qualidade: null }], '2026-08-31')
    if (p.frase) f.push({ de: 'treino', texto: p.frase })
  }

  /* As tres descobertas. */
  const sono = descobertas({
    noites: [
      ...[1, 2, 3, 4, 5].map(n => ({ data: dia(n), minutos: 300 })),
      ...[6, 7, 8, 9, 10].map(n => ({ data: dia(n), minutos: 480 })),
    ],
    dias: [
      ...[1, 2, 3, 4, 5].map(n => ({ data: dia(n), calorias: 2600 })),
      ...[6, 7, 8, 9, 10].map(n => ({ data: dia(n), calorias: 2000 })),
    ],
    pesos: [], comecosDeCiclo: [],
  })
  const ciclo = descobertas({
    noites: [], dias: [],
    pesos: [
      { data: dia(2), kg: 70 }, { data: dia(8), kg: 70.6 },
      { data: dia(14), kg: 71.5 }, { data: dia(20), kg: 70.4 },
    ],
    comecosDeCiclo: [dia(1), dia(28)],
  })
  const prot = descobertas({
    noites: [], comecosDeCiclo: [],
    pesos: [
      { data: dia(1), kg: 70 }, { data: dia(10), kg: 69 },
      { data: dia(20), kg: 68 }, { data: dia(28), kg: 67 },
    ],
    dias: Array.from({ length: 12 }, (_, i) => ({
      data: dia(i + 1), calorias: 1600, proteinas: 68,
    })),
  })
  for (const d of [...sono, ...ciclo, ...prot]) f.push({ de: 'descoberta', texto: d.texto })

  return f
}

const frases = todasAsFrases()

console.log(`\n1. o app fala ${frases.length} frases -- e nenhuma pode ameacar`)

{
  const ameaca = [
    'você falhou', 'voce falhou', 'você perdeu a', 'perigo', 'não perca',
    'nao perca', 'cuidado', 'alerta', 'você errou', 'voce errou', 'preguiça',
    'desistiu', 'última chance', 'ultima chance', 'está acabando', 'expira',
    'você vai perder', 'voce vai perder',
  ]
  const achadas = frases.filter(f => ameaca.some(a => f.texto.toLowerCase().includes(a)))
  for (const a of achadas) console.log(`  FALHA [${a.de}] ${a.texto}`)
  ok('nenhuma ameaca', achadas.length === 0)
}

console.log('\n2. nenhuma culpa')

{
  const culpa = [
    'você deveria', 'voce deveria', 'você comeu demais', 'exagerou',
    'descuido', 'é culpa', 'e culpa', 'você não', 'voce nao',
    'precisa parar', 'está errado', 'esta errado',
  ]
  const achadas = frases.filter(f => culpa.some(c => f.texto.toLowerCase().includes(c)))
  for (const a of achadas) console.log(`  FALHA [${a.de}] ${a.texto}`)
  ok('nenhuma culpa', achadas.length === 0)
}

console.log('\n3. nenhum diagnostico -- quem diz isso e a nutricionista')

{
  const laudo = [
    'você tem', 'voce tem', 'síndrome', 'sindrome', 'distúrbio', 'disturbio',
    'deficiência', 'deficiencia', 'compulsão', 'compulsao', 'transtorno',
    'doença', 'doenca', 'sobretreino', 'overtraining', 'anemia',
  ]
  const achadas = frases.filter(f => laudo.some(l => f.texto.toLowerCase().includes(l)))
  for (const a of achadas) console.log(`  FALHA [${a.de}] ${a.texto}`)
  ok('nenhum diagnostico', achadas.length === 0)
}

console.log('\n4. nenhuma ordem -- o app sugere')

{
  const ordem = [
    'não treine', 'nao treine', 'pare de', 'você deve ', 'voce deve ',
    'coma menos', 'coma mais', 'evite ', 'proibido', 'não coma', 'nao coma',
  ]
  const achadas = frases.filter(f => ordem.some(o => f.texto.toLowerCase().includes(o)))
  for (const a of achadas) console.log(`  FALHA [${a.de}] ${a.texto}`)
  ok('nenhuma ordem', achadas.length === 0)
}

console.log('\n5. nenhuma sai quebrada')

{
  const quebradas = frases.filter(
    f =>
      f.texto.includes('NaN') ||
      f.texto.includes('undefined') ||
      f.texto.includes('Infinity') ||
      f.texto.includes('null') ||
      f.texto.includes('[object') ||
      f.texto.includes('  ') ||
      f.texto.trim().length < 10,
  )
  for (const a of quebradas) console.log(`  FALHA [${a.de}] ${a.texto}`)
  ok('nenhuma frase quebrada', quebradas.length === 0)
}

console.log('\n6. toda frase que afirma um numero DIZ de onde ele vem')

{
  /* A regra que separa medida de horoscopo. Uma frase com numero e sem
     procedencia e uma afirmacao sobre o corpo de alguem sem fonte. */
  const comNumero = frases.filter(
    f => /\d/.test(f.texto) && (f.de === 'descoberta' || f.de === 'gasto'),
  )
  const semProcedencia = comNumero.filter(
    f =>
      !/dias|pesagens|semanas|registr|ciclo|comparando/i.test(f.texto),
  )
  for (const a of semProcedencia) console.log(`  FALHA [${a.de}] ${a.texto}`)
  ok('toda descoberta e todo gasto dizem em que se apoiam', semProcedencia.length === 0)
}

console.log('\n7. amostra do que o app diz')
for (const f of frases.slice(0, 6)) console.log(`  [${f.de}] ${f.texto}`)

console.log(`\n${passaram} passaram, ${falharam} falharam`)
if (falharam > 0) process.exit(1)
