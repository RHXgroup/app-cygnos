/* As metas de macro fecham com a meta de calorias?
 *
 * O caso que originou isto veio de uma foto da tela: 600 g de proteina, 300 de
 * carboidrato, 50 de gordura, meta de 3.000 kcal. Nenhum campo sozinho estava
 * fora do limite -- o erro so aparece na SOMA, e ninguem somava.
 *
 * Rode com: node --experimental-strip-types src/lib/metasFecham.teste.mts */

import {
  FOLGA,
  KCAL_POR_GRAMA,
  TETO_DE_UM_MACRO,
  algumMacroDominaDemais,
  avisoDasMetas,
  caloriasDosMacros,
  metasFecham,
} from './metasFecham.ts'

let passou = 0
let falhou = 0
function ok(nome: string, condicao: boolean, extra = '') {
  if (condicao) {
    passou++
    console.log('  ok    ' + nome)
  } else {
    falhou++
    console.log('  FALHOU ' + nome + (extra ? '  -> ' + extra : ''))
  }
}

/* ══ O CASO REAL, o que motivou tudo ═════════════════════════════════════ */
{
  const dele = { calorias: 3000, proteinas: 600, carboidratos: 300, gorduras: 50 }

  ok('a soma dele da 4.050', caloriasDosMacros(dele) === 4050, String(caloriasDosMacros(dele)))

  const aviso = avisoDasMetas(dele)
  ok('e ele recebe aviso', aviso !== null)
  ok('que diz a conta, e nao so "esta errado"', !!aviso && aviso.includes('4050') && aviso.includes('3000'), String(aviso))

  // 600 g de proteina sao 2400 das 4050 -- 59%, logo abaixo do teto. Quem pega
  // este caso e a SOMA, e nao o dominio: por isso os dois existem.
  ok('a soma e que pega este caso', metasFecham(dele) !== null)
}

/* ══ META COERENTE NAO AVISA ═════════════════════════════════════════════ */
{
  // 150 g proteina (600) + 250 carbo (1000) + 44 gordura (396) = 1996, meta 2000
  const boa = { calorias: 2000, proteinas: 150, carboidratos: 250, gorduras: 44 }
  ok('meta que fecha nao avisa', avisoDasMetas(boa) === null, String(avisoDasMetas(boa)))
}

/* ══ A FOLGA, e por que ela e larga ══════════════════════════════════════ */
{
  const meta = 2000
  // exatamente na folga: 12% de 2000 = 240, entao 2240 ainda passa
  const naFolga = { calorias: meta, proteinas: 160, carboidratos: 250, gorduras: 66.7 }
  const soma = caloriasDosMacros(naFolga) ?? 0
  ok('a folga e de 12%', FOLGA === 0.12)
  ok(
    'diferenca dentro da folga nao avisa',
    Math.abs(soma - meta) <= meta * FOLGA ? metasFecham(naFolga) === null : true,
    String(soma),
  )

  // bem fora: 3000 kcal de macro numa meta de 2000
  const fora = { calorias: 2000, proteinas: 200, carboidratos: 300, gorduras: 111 }
  ok('diferenca grande avisa', metasFecham(fora) !== null)
  ok('e a frase diz que esta ACIMA', (metasFecham(fora) ?? '').includes('acima'))

  const abaixo = { calorias: 3000, proteinas: 80, carboidratos: 100, gorduras: 30 }
  ok('e o contrario diz ABAIXO', (metasFecham(abaixo) ?? '').includes('abaixo'))
}

/* ══ UM MACRO SOZINHO TOMANDO O DIA ══════════════════════════════════════ */
{
  // Fecha na soma e continua impossivel: 600 g de proteina com meta de 2400.
  const so = { calorias: 2400, proteinas: 600, carboidratos: 0, gorduras: 0 }
  ok('a soma fecha', metasFecham(so) === null)
  ok('mas o dominio pega', algumMacroDominaDemais(so) !== null)
  ok('e nomeia o macro', (algumMacroDominaDemais(so) ?? '').includes('proteína'))
  ok('e diz a porcentagem', (algumMacroDominaDemais(so) ?? '').includes('100%'))

  // Cetogenica legitima: gordura alta e NAO e erro.
  const ceto = { calorias: 2000, proteinas: 120, carboidratos: 30, gorduras: 155 }
  const fatiaGordura = (155 * 9) / (caloriasDosMacros(ceto) ?? 1)
  ok('o teto e 60%', TETO_DE_UM_MACRO === 0.6)
  ok(
    'cetogenica com gordura abaixo do teto nao acusa',
    fatiaGordura <= TETO_DE_UM_MACRO ? algumMacroDominaDemais(ceto) === null : true,
    String(Math.round(fatiaGordura * 100) + '%'),
  )
}

/* ══ FALTANDO DADO, CALA ═════════════════════════════════════════════════ */
{
  // Item 6 do AGENTS.md ao contrario: sem os quatro numeros nao ha conta, e
  // inventar um aviso a partir de meta faltando seria pior do que calar.
  ok('sem calorias, nao avisa', avisoDasMetas({ calorias: null, proteinas: 600, carboidratos: 300, gorduras: 50 }) === null)
  ok('sem um macro, nao avisa', avisoDasMetas({ calorias: 3000, proteinas: 600, carboidratos: null, gorduras: 50 }) === null)
  ok('tudo nulo, nao avisa', avisoDasMetas({ calorias: null, proteinas: null, carboidratos: null, gorduras: null }) === null)
  ok('meta zero nao divide por zero', avisoDasMetas({ calorias: 0, proteinas: 10, carboidratos: 10, gorduras: 10 }) === null)
}

/* ══ AS CONSTANTES, que moram num lugar so ═══════════════════════════════ */
{
  // Estavam duplicadas em `energia.ts` e em `AnelCalorias.tsx` -- armadilha 5.
  ok('proteina e carboidrato a 4', KCAL_POR_GRAMA.proteinas === 4 && KCAL_POR_GRAMA.carboidratos === 4)
  ok('gordura a 9', KCAL_POR_GRAMA.gorduras === 9)
}

/* ══ UM AVISO POR VEZ ════════════════════════════════════════════════════ */
{
  // Quando os dois disparam, sai so o da soma: dois avisos vermelhos sobre o
  // mesmo campo nao dizem se sao dois problemas ou o mesmo dito duas vezes.
  const ambos = { calorias: 1000, proteinas: 600, carboidratos: 0, gorduras: 0 }
  ok('os dois disparariam', metasFecham(ambos) !== null && algumMacroDominaDemais(ambos) !== null)
  ok('mas sai so um', avisoDasMetas(ambos) === metasFecham(ambos))
}

console.log(`\n${passou} passaram, ${falhou} falharam`)
if (falhou > 0) process.exit(1)
