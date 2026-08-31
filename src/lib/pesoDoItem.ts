/* Quantos gramas um item vale, e DE ONDE esse número saiu.
 *
 * ── O defeito que fez este arquivo existir ────────────────────────────────
 * "2 pão e 1 ovo, iogurte" entrava no plano com os três dizendo "Sem peso:
 * entra no plano, mas fora da soma". Três alimentos básicos, e o app não sabia
 * o peso de nenhum — o total do dia saía sem eles, e a tela pedia que a pessoa
 * digitasse o peso de um ovo.
 *
 * A causa não era falta de dado. Era uma condição a mais do que precisava:
 *
 *     if (a.porcaoG && a.medidaCaseira && ehMesmaMedida(a.medidaCaseira, medida))
 *
 * `porcao_g` existe em 95% dos alimentos da base (22.659 de 23.850).
 * `medida_caseira` existe em 9% (2.159).
 *
 * Exigir os dois jogava fora o peso conhecido de 86% do catálogo. "Iogurte" tem
 * `porcao_g = 150` e `medida_caseira` nula: o app sabia que a porção é 150 g e
 * se recusava a usar, porque ninguém tinha escrito a palavra "pote" na coluna
 * do lado.
 *
 * ── Mas a condição protegia alguma coisa ──────────────────────────────────
 * E ela continua aqui, mais estreita. Se a pessoa NOMEIA a medida — "2 colheres
 * de iogurte" — multiplicar por uma porção de 150 g dá 300 g de iogurte para
 * duas colheres. Aí sim seria inventar, e errar por 500%.
 *
 * A distinção que resolve é entre medida NOMEADA e CONTAGEM:
 *
 *   "2 colheres de arroz"   nomeou a medida. Sem a base confirmar que a porção
 *                           dela é uma colher, o peso fica desconhecido.
 *   "2 pães", "1 ovo"       não nomeou nada: contou unidades. A porção da base
 *   "iogurte"               É a unidade, e usá-la não inventa nada.
 *
 * O interpretador já entrega isso de graça: sem medida escrita, `medida` cai em
 * 'unidade', que é o valor por omissão. Toda medida nomeada tem nome próprio.
 *
 * ── A honestidade mudou de lugar, e não sumiu ─────────────────────────────
 * Antes ela era ausência: sem peso, fora da soma. Agora é PROCEDÊNCIA — a
 * função devolve `origem`, e a tela escreve de onde o número veio. Um peso que
 * a pessoa vê e pode corrigir num toque vale mais do que um buraco na soma que
 * ela não sabe como preencher.
 *
 * ── Só `import type` ──────────────────────────────────────────────────────
 * Roda fora do aparelho, e é exercitado com os casos que quebraram. */

import { semAcento } from './texto.ts'

/* De onde o número veio, do mais confiável para o menos. A tela usa para
   escolher a frase, e a diferença importa: 200 g digitados por ela e 150 g
   supostos de uma porção não merecem a mesma cara. */
export type OrigemDoPeso =
  /* Ela mesma fixou o peso na tela. */
  | 'escolhido'
  /* Ela escreveu em peso ou volume: "200 g", "300 ml". */
  | 'escrito'
  /* A base confirma que a medida que ela disse é a porção dela: "1 fatia" e
     `medida_caseira = 'Fatia'`. */
  | 'medida'
  /* Ela contou unidades e a base tem o peso de uma porção. É estimativa, e a
     tela diz que é. */
  | 'porcao'

export type PesoDoItem = { gramas: number; origem: OrigemDoPeso } | null

/* O mesmo teto do interpretador, e pela mesma razão.
 *
 * Lá, "999999999999999999999 g de pão" virava 1e21 e atravessava a conta do dia
 * inteira sem nada estranho aparecer. Aqui a porta é outra: `porcao_g` é
 * `numeric(10,2)` no banco, e um cadastro com o ponto no lugar errado — 1500 em
 * vez de 150 — multiplicado por uma quantidade grande produz o mesmo estrago.
 * Dez mil gramas cobre qualquer coisa que caiba num prato. */
const TETO_EM_GRAMAS = 10000

/* Medidas em que a pessoa CONTOU em vez de nomear.
 *
 * 'unidade' é o valor por omissão do interpretador: é o que sobra quando ela
 * não escreveu medida nenhuma ("iogurte", "2 pão"), e também o que ela escreve
 * de propósito ("2 unidades"). Os dois casos querem a mesma coisa. */
const CONTAGEM = new Set(['unidade'])

const numeroUtil = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

/* Números escritos que aparecem nos rótulos da base. Pequeno de propósito: são
   rótulos de catálogo, não fala de gente — quem lida com "duzentas e cinquenta"
   é o interpretador. */
const ESCRITOS: Record<string, number> = Object.assign(Object.create(null), {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
  meia: 0.5, meio: 0.5,
})

/* Uma cópia só, em `texto.ts` — ver o comentário de lá. */

/* O radical de uma palavra, para "colheres" e "colher" se encontrarem.
 *
 * Prefixo simples não basta, e isto veio de dado real: o plural do português
 * cai NO MEIO de "colher de sopa" → "colheres de sopa", e aí nenhuma das duas
 * começa com a outra. Tirar o "es"/"s" final de cada palavra resolve os dois
 * casos que a base tem — 'colheres'→'colher', 'unidades'→'unidad',
 * 'fatias'→'fatia' — e a comparação por prefixo cuida do resto. */
const radical = (palavra: string): string =>
  palavra.length > 3 && palavra.endsWith('es')
    ? palavra.slice(0, -2)
    : palavra.length > 2 && palavra.endsWith('s')
      ? palavra.slice(0, -1)
      : palavra

/* "fatia" da base e "fatias" do texto são a mesma medida; "colher de sopa" e
   "colher" também, e "1 unidade média" e "unidade" também.
 *
 * Frouxa de propósito, palavra a palavra: a lista mais curta precisa ser começo
 * da mais longa. Exigir igualdade exata descartaria o peso conhecido por uma
 * diferença de plural ou por um "média" a mais no rótulo do catálogo. */
export function ehMesmaMedida(daBase: string, doTexto: string): boolean {
  const partes = (s: string) => semAcento(s).split(/\s+/).filter(Boolean).map(radical)
  const a = partes(daBase)
  const b = partes(doTexto)
  if (a.length === 0 || b.length === 0) return false

  const [curta, longa] = a.length <= b.length ? [a, b] : [b, a]
  return curta.every((p, i) => longa[i].startsWith(p) || p.startsWith(longa[i]))
}

/* O rótulo da base separado em CONTAGEM e UNIDADE.
 *
 * ── Por que isto precisa existir ──────────────────────────────────────────
 * `porcao_g` é o peso do que o rótulo descreve, e o rótulo às vezes descreve
 * MAIS DE UM: 'Pão francês' tem `medida_caseira = '1,5 unidade'` e
 * `porcao_g = 77`. Um pão não pesa 77 g — pesa 51.
 *
 * São 191 rótulos assim ('Duas fatias' em 59, 'Duas unidades' em 24,
 * '3 colheres de sopa' em 9). Poucos no total, e o erro é grande onde acontece:
 * dobrar o peso do pão francês passa despercebido na tela e some dentro do
 * total do dia. */
export function separarRotulo(rotulo: string): { conta: number; unidade: string } {
  const limpo = (rotulo ?? '').trim()
  if (!limpo) return { conta: 1, unidade: '' }

  const emNumero = limpo.match(/^(\d+(?:[.,]\d+)?)\s+(.*)$/)
  if (emNumero) {
    const n = Number(emNumero[1].replace(',', '.'))
    /* Contagem impossível não divide nada: melhor tratar o rótulo inteiro como
       a unidade do que dividir o peso por zero e produzir Infinity. */
    if (Number.isFinite(n) && n > 0) return { conta: n, unidade: emNumero[2].trim() }
    return { conta: 1, unidade: emNumero[2].trim() }
  }

  const palavras = limpo.split(/\s+/)
  const primeira = ESCRITOS[semAcento(palavras[0])]
  if (primeira !== undefined && palavras.length > 1) {
    return { conta: primeira, unidade: palavras.slice(1).join(' ') }
  }

  return { conta: 1, unidade: limpo }
}

export function pesoDoItem(entrada: {
  /* O peso que a pessoa fixou na tela, quando fixou. Vence tudo. */
  escolhido?: number | null
  /* O peso que ela escreveu, já convertido para gramas pelo interpretador. */
  escrito?: number | null
  /* Quantas unidades ou medidas. */
  quantidade?: number | null
  /* Como ela chamou: 'unidade', 'fatia', 'colher de sopa'… */
  medida?: string | null
  /* O que a base diz sobre a porção deste alimento. */
  medidaDaBase?: string | null
  porcaoG?: number | null
}): PesoDoItem {
  const escolhido = numeroUtil(entrada.escolhido)
  if (escolhido !== null) return { gramas: escolhido, origem: 'escolhido' }

  const escrito = numeroUtil(entrada.escrito)
  if (escrito !== null) return { gramas: escrito, origem: 'escrito' }

  const porcao = numeroUtil(entrada.porcaoG)
  if (porcao === null) return null

  /* Sem quantidade utilizável, uma. É o mesmo palpite do interpretador: erra por
     pouco, e a pessoa corrige num toque. */
  const quantidade = numeroUtil(entrada.quantidade) ?? 1
  const medida = (entrada.medida ?? '').trim()
  const daBase = (entrada.medidaDaBase ?? '').trim()

  const rotulo = separarRotulo(daBase)
  const bateComABase =
    rotulo.unidade !== '' && medida !== '' && ehMesmaMedida(rotulo.unidade, medida)
  const contou = medida === '' || CONTAGEM.has(medida)

  /* Medida NOMEADA que a base não confirma fica sem peso, e é a regra que
     sobrou da versão antiga. "2 colheres de iogurte" vezes uma porção de 150 g
     daria 300 g — inventar com cara de medida é pior do que não saber. */
  if (!bateComABase && !contou) return null

  /* A divisão pela contagem do rótulo só vale quando a medida DELA é a mesma do
     rótulo: aí "1,5 unidade = 77 g" quer dizer que uma unidade tem 51.

     Na contagem genérica, não. Se ela só disse "1 iogurte" e o rótulo é "Meio
     pacote", ninguém sabe se ela quis o pacote ou a porção — e `porcao_g` como
     está é a porção que alguém registrou, que é o palpite menos inventado. */
  const porUnidade = bateComABase ? porcao / rotulo.conta : porcao

  const gramas = Math.round(quantidade * porUnidade)
  if (!Number.isFinite(gramas) || gramas <= 0 || gramas > TETO_EM_GRAMAS) return null

  return { gramas, origem: bateComABase ? 'medida' : 'porcao' }
}

/* Se o número mostrado é estimativa. A tela usa para decidir se avisa.
 *
 * 'medida' NÃO é estimativa: a base disse que a porção daquele alimento é uma
 * fatia, e ela disse duas fatias. 'porcao' é — ninguém garante que o pão dela é
 * do tamanho do pão da tabela. */
export const ehEstimado = (p: PesoDoItem): boolean => p?.origem === 'porcao'
