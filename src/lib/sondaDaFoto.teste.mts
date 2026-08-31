/* A sonda da estimativa da foto: a resposta vem de um MODELO, e modelo devolve
 * o que quiser.
 *
 * ── Por que sonda, e nao mais casos de mesa ───────────────────────────────
 * Os 93 casos de `estimativaDaFoto.teste.mts` foram escritos por quem escreveu
 * o codigo, e por isso testam o que quem escreveu ja pensou. A sonda alimenta
 * lixo de verdade e confere PROPRIEDADES -- coisas que precisam valer sempre,
 * seja qual for a entrada.
 *
 * ── E a licao que mudou esta sonda ────────────────────────────────────────
 * A app-cygnos-6b rodou o mesmo padrao nas libs dela e achou o que 29 casos de
 * mesa nao acharam: `typeof NaN === 'number'`, e `MAX_SAFE_INTEGER` passa por
 * `Number.isFinite` e mesmo assim produz `Invalid Date`. As duas entradas eram
 * validas; o RESULTADO e que era lixo.
 *
 * Por isso as propriedades daqui olham para o que SAI. Uma entrada plausivel
 * vezes um fator plausivel ainda pode estourar para Infinity, e validar so a
 * entrada deixa isso passar -- porque nada do que entrou era invalido.
 *
 * Rode com: node --experimental-strip-types src/lib/sondaDaFoto.teste.mts */

import {
  comFator,
  escolhidos,
  itensDaEstimativa,
  itensDaResposta,
  linhasIniciais,
  paraGravar,
  totaisDaFoto,
  MAXIMO_DE_ITENS,
  type ItemDaFoto,
  type LinhaEscolhida,
} from './estimativaDaFoto.ts'

/* Semente fixa: uma falha da sonda precisa ser a MESMA amanha, senao ninguem
   consegue consertar o que ela achou. */
let semente = 20260901
const aleatorio = () => {
  semente = (semente * 1103515245 + 12345) & 0x7fffffff
  return semente / 0x7fffffff
}

const RODADAS = 4000

let passaram = 0
let falharam = 0

function propriedade(nome: string, roda: () => string | null) {
  const quebras: string[] = []
  for (let i = 0; i < RODADAS; i++) {
    let r: string | null
    try {
      r = roda()
    } catch (e) {
      r = 'ESTOUROU: ' + String(e).slice(0, 120)
    }
    if (r !== null) {
      quebras.push(r)
      if (quebras.length >= 3) break
    }
  }
  if (quebras.length === 0) {
    passaram++
    console.log('  ok    ' + nome)
  } else {
    falharam++
    console.log('  FALHA ' + nome)
    for (const q of quebras) console.log('          ' + q)
  }
}

/* ── O gerador de lixo ─────────────────────────────────────────────────────
   Nao "numeros entre 0 e 500". A resposta que chega e a de um modelo com um
   esquema, e esquema nao impede o modelo de escrever `1e309`. */
function valorQualquer(): unknown {
  const d = aleatorio()
  if (d < 0.16) return Math.round(aleatorio() * 900)
  if (d < 0.26) return null
  if (d < 0.32) return undefined
  if (d < 0.38) return NaN
  if (d < 0.44) return aleatorio() < 0.5 ? Infinity : -Infinity
  if (d < 0.5) return -Math.round(aleatorio() * 900)
  if (d < 0.56) return String(Math.round(aleatorio() * 900))
  if (d < 0.6) return 'muita'
  if (d < 0.64) return ''
  if (d < 0.7) return Number.MAX_SAFE_INTEGER
  if (d < 0.74) return Number.MAX_VALUE
  if (d < 0.78) return 1e308
  if (d < 0.82) return Number.MIN_VALUE
  if (d < 0.86) return 0
  if (d < 0.9) return aleatorio() * 0.4
  if (d < 0.94) return true
  if (d < 0.97) return { valor: 1 }
  return []
}

function nomeQualquer(): unknown {
  const d = aleatorio()
  if (d < 0.5) return 'Alimento ' + Math.round(aleatorio() * 50)
  if (d < 0.6) return ''
  if (d < 0.68) return '   '
  if (d < 0.74) return null
  if (d < 0.8) return undefined
  if (d < 0.86) return 42
  if (d < 0.92) return 'x'.repeat(Math.round(aleatorio() * 400))
  return { nome: 'nao sou texto' }
}

function itemBruto(): unknown {
  const d = aleatorio()
  if (d < 0.06) return null
  if (d < 0.1) return 'texto solto'
  if (d < 0.13) return 7
  return {
    nome: nomeQualquer(),
    porcao_estimada: nomeQualquer(),
    calorias: valorQualquer(),
    proteinas: valorQualquer(),
    carboidratos: valorQualquer(),
    gorduras: valorQualquer(),
    fibras: valorQualquer(),
  }
}

function respostaBruta(): unknown {
  const d = aleatorio()
  if (d < 0.05) return null
  if (d < 0.09) return 'erro'
  if (d < 0.12) return []
  if (d < 0.2)
    /* A resposta da funcao ANTIGA: nutrientes no primeiro nivel, sem `itens`. */
    return {
      descricao: nomeQualquer(),
      porcao_estimada: nomeQualquer(),
      calorias: valorQualquer(),
      proteinas: valorQualquer(),
      carboidratos: valorQualquer(),
      gorduras: valorQualquer(),
      fibras: valorQualquer(),
    }
  const quantos = Math.round(aleatorio() * 14)
  return {
    descricao: nomeQualquer(),
    itens: Array.from({ length: quantos }, itemBruto),
    confianca: 'alta',
  }
}

const FATORES = [0.5, 1, 1.5, 2, 0, -1, NaN, Infinity, 1e308, 0.0001, 3, Number.MAX_VALUE]
const fatorQualquer = () => FATORES[Math.floor(aleatorio() * FATORES.length)]

const NUTRIENTES = ['calorias', 'proteinas', 'carboidratos', 'gorduras', 'fibras'] as const

const numeroSao = (v: number | null): boolean =>
  v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0)

console.log(`\nA sonda da foto — ${RODADAS} rodadas por propriedade`)

/* ── O que sai da leitura ──────────────────────────────────────────────────*/

propriedade('nenhum nutriente sai nao finito ou negativo', () => {
  for (const i of itensDaEstimativa(respostaBruta())) {
    for (const n of NUTRIENTES) {
      if (!numeroSao(i[n])) return `${n} saiu ${String(i[n])}`
    }
  }
  return null
})

propriedade('nome e porcao sempre saem texto', () => {
  for (const i of itensDaEstimativa(respostaBruta())) {
    if (typeof i.nome !== 'string') return 'nome nao e texto: ' + String(i.nome)
    if (typeof i.porcaoEstimada !== 'string') return 'porcao nao e texto'
  }
  return null
})

propriedade('nunca sai item sem nome', () => {
  for (const i of itensDaEstimativa(respostaBruta())) {
    if (i.nome.trim().length === 0) return 'saiu item de nome vazio'
  }
  return null
})

propriedade('nunca passa do teto de itens', () => {
  const n = itensDaEstimativa(respostaBruta()).length
  return n <= MAXIMO_DE_ITENS ? null : `saiu com ${n} itens`
})

propriedade('a leitura nunca estoura', () => {
  itensDaResposta(respostaBruta())
  itensDaEstimativa(respostaBruta())
  return null
})

/* ── O que sai da conta ────────────────────────────────────────────────────*/

propriedade('reescalar nunca produz numero nao finito', () => {
  const itens = itensDaEstimativa(respostaBruta())
  const f = fatorQualquer()
  for (const i of itens) {
    const r = comFator(i, f)
    for (const n of NUTRIENTES) {
      if (!numeroSao(r[n])) return `${n} virou ${String(r[n])} com fator ${f}`
    }
  }
  return null
})

propriedade('reescalar nunca produz nome ou porcao nao texto', () => {
  for (const i of itensDaEstimativa(respostaBruta())) {
    const r = comFator(i, fatorQualquer())
    if (typeof r.nome !== 'string' || typeof r.porcaoEstimada !== 'string') return 'saiu nao texto'
    if (r.porcaoEstimada.includes('undefined')) return 'escreveu undefined na porcao'
  }
  return null
})

propriedade('o total nunca sai nao finito nem negativo', () => {
  const itens = itensDaEstimativa(respostaBruta()).map(i => comFator(i, fatorQualquer()))
  const t = totaisDaFoto(itens)
  for (const n of NUTRIENTES) {
    if (!numeroSao(t[n])) return `total de ${n} saiu ${String(t[n])}`
  }
  if (t.semCalorias < 0 || t.semCalorias > itens.length) return 'semCalorias fora da lista'
  return null
})

propriedade('total nulo so quando ninguem informou', () => {
  const itens = itensDaEstimativa(respostaBruta())
  const t = totaisDaFoto(itens)
  for (const n of NUTRIENTES) {
    const algum = itens.some(i => i[n] !== null)
    if (algum && t[n] === null) return `${n}: havia valor e o total saiu nulo`
    if (!algum && t[n] !== null) return `${n}: ninguem informou e o total saiu ${t[n]}`
  }
  return null
})

propriedade('semCalorias conta exatamente quem nao tem caloria', () => {
  const itens = itensDaEstimativa(respostaBruta())
  const esperado = itens.filter(i => i.calorias === null).length
  const t = totaisDaFoto(itens)
  return t.semCalorias === esperado ? null : `contou ${t.semCalorias}, eram ${esperado}`
})

/* ── O que sai da escolha ──────────────────────────────────────────────────*/

function linhasQuaisquer(): LinhaEscolhida[] {
  const itens: ItemDaFoto[] = itensDaEstimativa(respostaBruta())
  return itens.map(item => ({ item, fator: fatorQualquer(), dentro: aleatorio() < 0.7 }))
}

propriedade('so vai para o diario o que ficou marcado', () => {
  const linhas = linhasQuaisquer()
  const dentro = linhas.filter(l => l.dentro).length
  if (escolhidos(linhas).length !== dentro) return 'escolhidos nao bate com os marcados'
  if (paraGravar(linhas).length !== dentro) return 'paraGravar nao bate com os marcados'
  return null
})

propriedade('o que vai gravar nunca tem numero nao finito', () => {
  for (const { item } of paraGravar(linhasQuaisquer())) {
    for (const n of NUTRIENTES) {
      if (!numeroSao(item[n])) return `${n} ia gravar ${String(item[n])}`
    }
  }
  return null
})

propriedade('a correcao gravada e nula ou um numero util', () => {
  for (const { fatorCorrecao } of paraGravar(linhasQuaisquer())) {
    if (fatorCorrecao === null) continue
    if (typeof fatorCorrecao !== 'number' || !Number.isFinite(fatorCorrecao))
      return 'correcao ' + String(fatorCorrecao)
    /* A coluna tem `check between 0.1 and 5`. Um valor fora disso nao vira dado
       errado calado: vira INSERT recusado, e o registro inteiro se perde. */
    if (fatorCorrecao < 0.1 || fatorCorrecao > 5)
      return `correcao ${fatorCorrecao} seria recusada pelo banco`
  }
  return null
})

propriedade('quem nao mexeu no fator nunca grava correcao', () => {
  const linhas = linhasQuaisquer().map(l => ({ ...l, fator: 1 }))
  for (const { fatorCorrecao } of paraGravar(linhas)) {
    if (fatorCorrecao !== null) return 'gravou ' + String(fatorCorrecao) + ' sem ela ter mexido'
  }
  return null
})

propriedade('a lista comeca inteira e marcada', () => {
  const itens = itensDaEstimativa(respostaBruta())
  const linhas = linhasIniciais({ descricao: 'x', itens, confianca: 'alta', usouContexto: false })
  if (linhas.length !== itens.length) return 'perdeu ou inventou linha'
  if (!linhas.every(l => l.dentro && l.fator === 1)) return 'nasceu desmarcada ou reescalada'
  return null
})

propriedade('nada disso estoura', () => {
  const linhas = linhasQuaisquer()
  totaisDaFoto(escolhidos(linhas))
  paraGravar(linhas)
  return null
})

console.log(`\n${passaram} propriedades passaram, ${falharam} falharam`)
if (falharam > 0) process.exit(1)
