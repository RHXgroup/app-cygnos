/* As metas de macro fecham com a meta de calorias?
 *
 * ── Por que existe ────────────────────────────────────────────────────────
 * Visto numa tela real: 600 g de proteína, 300 g de carboidrato, 50 g de
 * gordura, com meta de 3.000 kcal. Só a proteína dá 2.400 kcal — 80% do dia —,
 * e os três somados dão 4.050, mil acima da meta que a própria tela mostra ao
 * lado.
 *
 * O app aceitou tudo isso sem uma palavra. Os limites de campo existem
 * (proteína vai até 1000 g) mas olham UM campo por vez, e nenhum número
 * sozinho estava fora da faixa. O erro só aparece na SOMA, e ninguém somava.
 *
 * E o dano não é estético: as barras de macro da tela inicial e o anel de
 * calorias passam a medir coisas que não têm relação, e a pessoa persegue duas
 * metas que não podem ser atingidas ao mesmo tempo.
 *
 * ── O que ele NÃO faz ─────────────────────────────────────────────────────
 * Não dá parecer nutricional, não diz se a meta é saudável, e não impede
 * salvar. Quem prescreve é a nutricionista, e o app não tem como sustentar um
 * "isso é demais para você". O que ele pode dizer com certeza é aritmética:
 * estes números não fecham entre si.
 *
 * Por isso a frase mostra a CONTA, e não um julgamento. */

/* As quatro calorias por grama de proteína e carboidrato, e nove da gordura.
 *
 * Mora aqui, e não em `energia.ts` nem em `AnelCalorias.tsx`, que tinham cada
 * um a sua cópia — armadilha 5 do AGENTS.md. Três definições do mesmo fato
 * divergem no dia em que alguém corrigir uma. */
export const KCAL_POR_GRAMA = { proteinas: 4, carboidratos: 4, gorduras: 9 } as const

export type MetasParaConferir = {
  calorias: number | null
  proteinas: number | null
  carboidratos: number | null
  gorduras: number | null
}

/* Quanto os macros podem divergir da meta de calorias sem virar aviso.
 *
 * 12%, e não 5%: as metas são arredondadas na mão — "150 g de proteína, 40% de
 * carboidrato" — e uma diferença pequena é o normal de quem prescreve, não
 * erro. Avisar sobre 4% ensinaria a ignorar o aviso, que é o único jeito de um
 * aviso deixar de funcionar. */
export const FOLGA = 0.12

export function caloriasDosMacros(m: MetasParaConferir): number | null {
  const { proteinas: p, carboidratos: c, gorduras: g } = m
  if (p === null || c === null || g === null) return null
  return p * KCAL_POR_GRAMA.proteinas + c * KCAL_POR_GRAMA.carboidratos + g * KCAL_POR_GRAMA.gorduras
}

/* A frase para a tela, ou null quando está tudo coerente.
 *
 * Devolve texto e não um booleano porque a pessoa precisa saber QUAL é a
 * diferença para decidir o que corrigir — "não fecha" sozinho manda ela olhar
 * quatro campos sem saber por onde começar. */
export function metasFecham(m: MetasParaConferir): string | null {
  const meta = m.calorias
  const soma = caloriasDosMacros(m)
  if (meta === null || soma === null || meta <= 0) return null

  const diferenca = soma - meta
  if (Math.abs(diferenca) <= meta * FOLGA) return null

  const somaR = Math.round(soma)
  const metaR = Math.round(meta)

  return diferenca > 0
    ? `Os seus macros somam ${somaR} kcal, acima da sua meta de ${metaR}. Ajuste um dos dois.`
    : `Os seus macros somam ${somaR} kcal, abaixo da sua meta de ${metaR}. Ajuste um dos dois.`
}

/* Um macro sozinho tomando o dia inteiro.
 *
 * Separado da conta acima porque acusa outra coisa: ali os números não fecham
 * entre si; aqui eles até podem fechar, e ainda assim um macro come quase toda
 * a energia — 600 g de proteína com meta de 2.400 kcal fecha certinho e
 * continua sendo impossível de comer.
 *
 * 60% é folgado de propósito. Dieta cetogênica legítima passa de 60% de
 * gordura, e o app não pode chamar isso de erro; o que ele pega é o dedo que
 * escorregou num zero a mais. */
export const TETO_DE_UM_MACRO = 0.6

export function algumMacroDominaDemais(m: MetasParaConferir): string | null {
  const soma = caloriasDosMacros(m)
  if (soma === null || soma <= 0) return null

  const partes: [string, number][] = [
    ['proteína', (m.proteinas ?? 0) * KCAL_POR_GRAMA.proteinas],
    ['carboidrato', (m.carboidratos ?? 0) * KCAL_POR_GRAMA.carboidratos],
    ['gordura', (m.gorduras ?? 0) * KCAL_POR_GRAMA.gorduras],
  ]

  for (const [nome, kcal] of partes) {
    const fatia = kcal / soma
    if (fatia > TETO_DE_UM_MACRO) {
      return `A ${nome} sozinha é ${Math.round(fatia * 100)}% da sua meta. Confira se o número está certo.`
    }
  }
  return null
}

/* O aviso único para a tela: a soma primeiro, o domínio depois.
 *
 * Uma frase por vez, e não as duas: quem vê dois avisos vermelhos sobre o mesmo
 * campo não sabe se são dois problemas ou o mesmo dito duas vezes — e o segundo
 * quase sempre some quando o primeiro é corrigido. */
export function avisoDasMetas(m: MetasParaConferir): string | null {
  return metasFecham(m) ?? algumMacroDominaDemais(m)
}
