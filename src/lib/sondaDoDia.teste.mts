/* Sonda: entrada aleatoria e hostil contra as libs novas.
 *
 * Os testes de cada lib exercitam os casos que EU imaginei. Esta sonda existe
 * para os que eu nao imaginei: ela gera milhares de entradas tortas e verifica
 * PROPRIEDADES que precisam valer sempre -- nunca estourar, nunca devolver NaN,
 * nunca contradizer a propria tela.
 *
 * O modelo e o `sondaNova`, que ja pegou quatro vazamentos de NaN e Infinity em
 * codigo que tinha teste passando.
 *
 * Rode com: node --experimental-strip-types src/lib/sondaDoDia.teste.mts */

import { sequenciaDaPessoa, fraseDaSequencia, textoDaSequencia } from './sequenciaDaPessoa.ts'
import { tendenciaDoPeso, resumoDaTendencia, fraseDaDistancia } from './tendenciaDoPeso.ts'
import { gastoReal, fraseDoGasto } from './gastoReal.ts'
import { metasSugeridas, comoFoiCalculado } from './metasSugeridas.ts'
import { prontidaoDeHoje } from './prontidaoDeHoje.ts'
import { descobertas } from './descobertas.ts'
import { totaisDe, escolhidaDe, proxima, diferencaDoOriginal } from './trocaNoPlano.ts'
import { pesoDoItem } from './pesoDoItem.ts'

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

/* Gerador previsivel: a sonda tem de ser reproduzivel. Uma falha que so
   acontece com a semente daquela rodada e uma falha que ninguem consegue
   investigar. */
let semente = 20260901
const rnd = () => {
  semente = (semente * 1103515245 + 12345) & 0x7fffffff
  return semente / 0x7fffffff
}
const entre = (a: number, b: number) => a + rnd() * (b - a)
const inteiro = (a: number, b: number) => Math.floor(entre(a, b + 1))
const talvez = (p: number) => rnd() < p

/* O zoologico de valores que quebram conta em JavaScript. */
const TORTOS = [NaN, Infinity, -Infinity, 0, -0, -1, 1e21, -1e21, 0.1 + 0.2]
const numeroTorto = (): number => TORTOS[inteiro(0, TORTOS.length - 1)]

const DATAS_TORTAS = [
  '', 'lixo', '2026-02-31', '2026-13-01', '2026-00-10', '0000-01-01',
  '2026-1-1', '26-01-01', '2026/01/01', 'null', 'undefined',
]

const dataAleatoria = (): string => {
  if (talvez(0.25)) return DATAS_TORTAS[inteiro(0, DATAS_TORTAS.length - 1)]
  const m = inteiro(1, 12)
  const d = inteiro(1, 31)
  return `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const numeroOuNulo = (): number | null => {
  if (talvez(0.2)) return null
  if (talvez(0.25)) return numeroTorto()
  return Math.round(entre(-500, 4000))
}

const saoFinitos = (o: Record<string, unknown>): boolean =>
  Object.values(o).every(v => typeof v !== 'number' || Number.isFinite(v))

const RODADAS = 4000

console.log(`\n1. sequencia -- ${RODADAS} entradas aleatorias`)

{
  let estourou = 0
  let naoFinito = 0
  let numeroImpossivel = 0
  let fraseVazia = 0

  for (let n = 0; n < RODADAS; n++) {
    const datas = Array.from({ length: inteiro(0, 40) }, dataAleatoria)
    const hoje = dataAleatoria()
    try {
      const s = sequenciaDaPessoa(datas, hoje)
      if (!saoFinitos(s as unknown as Record<string, unknown>)) naoFinito++
      /* A sequencia NUNCA pode ser maior que o numero de datas distintas
         validas: e a propriedade que garante que o perdao nao infla. */
      const distintas = new Set(datas).size
      if (s.dias < 0 || s.dias > distintas) numeroImpossivel++
      const f = fraseDaSequencia(s)
      if (typeof f !== 'string' || f.trim().length < 5) fraseVazia++
      if (s.dias > 0) {
        const t = textoDaSequencia(s.dias)
        if (!t.title || !t.body) fraseVazia++
      }
    } catch {
      estourou++
    }
  }

  ok('nunca estoura', estourou === 0, String(estourou))
  ok('nunca devolve numero nao finito', naoFinito === 0, String(naoFinito))
  ok('a sequencia nunca passa do numero de dias registrados',
    numeroImpossivel === 0, String(numeroImpossivel))
  ok('nunca devolve frase vazia', fraseVazia === 0, String(fraseVazia))
}

console.log(`\n2. tendencia do peso -- ${RODADAS} series aleatorias`)

{
  let estourou = 0
  let naoFinito = 0
  let foraDaFaixa = 0
  let ordemErrada = 0

  for (let n = 0; n < RODADAS; n++) {
    const pesagens = Array.from({ length: inteiro(0, 40) }, () => ({
      data: dataAleatoria(),
      kg: talvez(0.3) ? numeroTorto() : entre(30, 300),
    }))
    try {
      const s = tendenciaDoPeso(pesagens)
      for (const p of s) {
        if (!Number.isFinite(p.tendencia)) naoFinito++
        /* A linha e uma media exponencial de valores entre 20 e 400 (os
           validos). Ela NAO PODE sair dessa faixa -- se sair, o filtro
           vazou. */
        if (p.tendencia < 20 || p.tendencia > 400) foraDaFaixa++
      }
      /* A serie sempre sai em ordem de calendario. Um grafico que anda para
         tras mostra a evolucao ao contrario. */
      for (let i = 1; i < s.length; i++) {
        if (s[i].data <= s[i - 1].data) ordemErrada++
      }
      const r = resumoDaTendencia(s)
      if (r && !saoFinitos(r as unknown as Record<string, unknown>)) naoFinito++
      const f = fraseDaDistancia(r)
      if (f !== null && f.includes('NaN')) naoFinito++
    } catch {
      estourou++
    }
  }

  ok('nunca estoura', estourou === 0, String(estourou))
  ok('a linha nunca sai da faixa de peso humano', foraDaFaixa === 0, String(foraDaFaixa))
  ok('nunca devolve NaN', naoFinito === 0, String(naoFinito))
  ok('a serie sai sempre em ordem de calendario', ordemErrada === 0, String(ordemErrada))
}

console.log(`\n3. gasto real -- ${RODADAS} combinacoes`)

{
  let estourou = 0
  let foraDaFaixa = 0
  let fraseComNaN = 0

  for (let n = 0; n < RODADAS; n++) {
    const consumo = Array.from({ length: inteiro(0, 60) }, () => ({
      data: dataAleatoria(),
      calorias: numeroOuNulo(),
    }))
    const tend = Array.from({ length: inteiro(0, 60) }, () => ({
      data: dataAleatoria(),
      tendencia: talvez(0.3) ? numeroTorto() : entre(40, 200),
    }))
    try {
      const g = gastoReal(consumo, tend)
      if (g !== null) {
        /* A faixa e a trava que impede um numero absurdo de virar META DE
           CALORIA. Se ela vazar, alguem come 700 kcal por dia. */
        if (g.kcal < 1000 || g.kcal > 6000) foraDaFaixa++
        if (!saoFinitos(g as unknown as Record<string, unknown>)) foraDaFaixa++
        const f = fraseDoGasto(g)
        if (f.includes('NaN') || f.includes('Infinity') || f.includes('undefined')) fraseComNaN++
      }
    } catch {
      estourou++
    }
  }

  ok('nunca estoura', estourou === 0, String(estourou))
  ok('o gasto nunca sai da faixa humana', foraDaFaixa === 0, String(foraDaFaixa))
  ok('a frase nunca mostra NaN nem undefined', fraseComNaN === 0, String(fraseComNaN))
}

console.log(`\n4. metas sugeridas -- ${RODADAS} corpos`)

{
  let estourou = 0
  let foraDaFaixa = 0
  let macrosNaoFecham = 0
  let negativo = 0

  for (let n = 0; n < RODADAS; n++) {
    const corpo = {
      pesoKg: talvez(0.3) ? numeroTorto() : entre(20, 400),
      alturaCm: talvez(0.3) ? numeroTorto() : entre(90, 260),
      idade: talvez(0.3) ? numeroTorto() : inteiro(5, 120),
      sexo: (talvez(0.5) ? 'M' : 'F') as 'M' | 'F',
    }
    try {
      const s = metasSugeridas(
        corpo,
        talvez(0.4) ? numeroTorto() : talvez(0.5) ? entre(500, 9000) : null,
        talvez(0.4) ? numeroTorto() : talvez(0.5) ? entre(500, 9000) : null,
      )
      if (s !== null) {
        if (s.calorias < 1200 || s.calorias > 4500) foraDaFaixa++
        if (!saoFinitos(s as unknown as Record<string, unknown>)) foraDaFaixa++
        /* Nenhum macro pode ser negativo: um carboidrato negativo na tela e o
           tipo de coisa que ninguem testa e todo mundo ve. */
        if (s.proteinas < 0 || s.carboidratos < 0 || s.gorduras < 0 || s.fibras < 0) negativo++
        /* E os tres tem de somar a caloria alvo. Uma tela que mostra 1870 de
           meta com macros que dao 2100 perde a confianca no primeiro dia. */
        const soma = s.proteinas * 4 + s.carboidratos * 4 + s.gorduras * 9
        /* Folga de 60: com caloria no piso e peso alto, a proteina sozinha pode
           passar do total, e o carboidrato para em zero em vez de negativar. */
        if (Math.abs(soma - s.calorias) > 60 && s.carboidratos > 0) macrosNaoFecham++
        if (comoFoiCalculado(s).length < 20) foraDaFaixa++
      }
    } catch {
      estourou++
    }
  }

  ok('nunca estoura', estourou === 0, String(estourou))
  ok('a caloria fica sempre entre 1200 e 4500', foraDaFaixa === 0, String(foraDaFaixa))
  ok('nenhum macro sai negativo', negativo === 0, String(negativo))
  ok('os macros fecham na caloria alvo', macrosNaoFecham === 0, String(macrosNaoFecham))
}

console.log(`\n5. prontidao e descobertas -- ${RODADAS} entradas`)

{
  let estourou = 0
  let fraseRuim = 0
  const ameacas = ['nao treine', 'você deve', 'voce deve', 'descanse hoje', 'pule o treino']

  for (let n = 0; n < RODADAS; n++) {
    try {
      const noites = Array.from({ length: inteiro(0, 20) }, () => ({
        data: dataAleatoria(),
        minutos: talvez(0.3) ? numeroTorto() : inteiro(0, 900),
        qualidade: talvez(0.5) ? null : inteiro(1, 5),
      }))
      const p = prontidaoDeHoje(noites, dataAleatoria())
      if (p.frase !== null) {
        if (p.frase.includes('NaN') || p.frase.includes('undefined')) fraseRuim++
        if (ameacas.some(a => p.frase!.toLowerCase().includes(a))) fraseRuim++
      }

      const d = descobertas({
        noites: noites.map(x => ({ data: x.data, minutos: x.minutos })),
        dias: Array.from({ length: inteiro(0, 30) }, () => ({
          data: dataAleatoria(),
          calorias: numeroOuNulo(),
          proteinas: numeroOuNulo(),
        })),
        pesos: Array.from({ length: inteiro(0, 20) }, () => ({
          data: dataAleatoria(),
          kg: talvez(0.3) ? numeroTorto() : entre(40, 200),
        })),
        comecosDeCiclo: Array.from({ length: inteiro(0, 6) }, dataAleatoria),
      })
      for (const x of d) {
        if (x.texto.includes('NaN') || x.texto.includes('undefined') || x.texto.includes('Infinity')) {
          fraseRuim++
        }
        /* Toda descoberta tem de trazer numero -- e o que separa medida de
           horoscopo. */
        if (!/\d/.test(x.texto)) fraseRuim++
      }
    } catch {
      estourou++
    }
  }

  ok('nunca estoura', estourou === 0, String(estourou))
  ok('nenhuma frase sai com NaN, undefined ou ameaca', fraseRuim === 0, String(fraseRuim))
}

console.log(`\n6. troca no plano e peso do item -- ${RODADAS} entradas`)

{
  let estourou = 0
  let ruim = 0

  for (let n = 0; n < RODADAS; n++) {
    try {
      const itens = Array.from({ length: inteiro(0, 8) }, () => ({
        opcoes: Array.from({ length: inteiro(0, 4) }, (_, k) => ({
          id: `o${k}`,
          nome: `Alimento ${k}`,
          descricao: '',
          alimentoId: null,
          caloriasPor100g: talvez(0.3) ? numeroTorto() : entre(0, 900),
          proteinasPor100g: numeroOuNulo(),
          carboidratosPor100g: numeroOuNulo(),
          gordurasPor100g: numeroOuNulo(),
          fibrasPor100g: numeroOuNulo(),
          gramasTotais: talvez(0.3) ? numeroTorto() : entre(0, 2000),
        })),
        escolhida: inteiro(-3, 8),
      }))

      const t = totaisDe(itens)
      if (!saoFinitos(t as unknown as Record<string, unknown>)) ruim++
      if (t.calorias < 0 || t.semCalorias < 0) ruim++
      /* A propriedade que a tela depende: a diferenca SEMPRE bate com a
         subtracao dos dois numeros mostrados. */
      const dif = diferencaDoOriginal(itens)
      const semTroca = totaisDe(itens.map(i => ({ ...i, escolhida: 0 }))).calorias
      if (dif !== t.calorias - semTroca) ruim++
      /* Circular nunca sai da lista. */
      for (const i of itens) {
        const p = proxima(i)
        if (i.opcoes.length > 0 && escolhidaDe(p) === null) ruim++
      }

      const p = pesoDoItem({
        escolhido: talvez(0.5) ? numeroOuNulo() : null,
        escrito: talvez(0.5) ? numeroOuNulo() : null,
        quantidade: talvez(0.4) ? numeroTorto() : entre(0, 50),
        medida: talvez(0.5) ? 'unidade' : 'colher de sopa',
        medidaDaBase: talvez(0.5) ? '1,5 unidade' : null,
        porcaoG: talvez(0.4) ? numeroTorto() : entre(0, 1000),
      })
      if (p !== null && (!Number.isFinite(p.gramas) || p.gramas <= 0)) ruim++
    } catch {
      estourou++
    }
  }

  ok('nunca estoura', estourou === 0, String(estourou))
  ok('totais finitos, diferenca coerente com a tela, peso sempre positivo',
    ruim === 0, String(ruim))
}

console.log(`\n${passaram} passaram, ${falharam} falharam`)
if (falharam > 0) process.exit(1)
