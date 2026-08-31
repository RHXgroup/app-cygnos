/* Trocar um item do plano pela variação que a nutricionista cadastrou — e a
 * conta se refazer sozinha.
 *
 * ── A lacuna, e ela era duas ao mesmo tempo ───────────────────────────────
 * O plano JÁ TINHA variações: cada item pode ter alternativas, e a tela de
 * edição as gerencia. Mas na hora de registrar, `comerDoPlano` gravava sempre
 * `r.itens` — o item principal, sempre. As trocas que a nutricionista cadastrou
 * eram ignoradas justamente no momento em que serviriam.
 *
 * Resultado: quem não gostou do que estava no plano não comia, ou comia e não
 * registrava. Plano rígido não é seguido — é abandonado.
 *
 * ── O mecanismo é do Eat This Much, e aqui ele é melhor ───────────────────
 * Lá você troca a refeição e o algoritmo rebalanceia com outra receita do banco
 * dele. Aqui as alternativas vêm da profissional que conhece a pessoa: já
 * passaram por alergia, preferência e objetivo.
 *
 * O que este arquivo faz é a parte que o Eat This Much faz bem e que faltava: a
 * CONTA SE REFAZER na frente dela, antes de confirmar. Trocar sem ver o efeito
 * é trocar no escuro.
 *
 * ── Só `import type` ──────────────────────────────────────────────────────
 * Roda fora do aparelho. */

/* O mínimo que a conta precisa de um item. Recebe já assim — em vez do
   `ItemSalvo` inteiro — para este arquivo não depender de `plano.ts`, que puxa
   o Supabase e levaria o teste junto. */
export type Opcao = {
  id: string
  nome: string
  /* Vêm junto porque quem grava reusa o mesmo conversor do plano
     (`doPlano`), e ele precisa dos dois. Carregar aqui evita a tela ter de
     casar a opção escolhida com o item original depois. */
  descricao: string
  alimentoId: number | null
  caloriasPor100g: number | null
  proteinasPor100g: number | null
  carboidratosPor100g: number | null
  gordurasPor100g: number | null
  fibrasPor100g: number | null
  gramasTotais: number | null
}

export type ItemComTrocas = {
  /* A opção do plano, e as alternativas dela. A primeira da lista é sempre a
     original — é ela que a nutricionista pôs como principal. */
  opcoes: Opcao[]
  /* Qual está escolhida. Índice, e não id, porque a lista é curta e a tela
     avança por toque. */
  escolhida: number
}

export type Totais = {
  calorias: number
  proteinas: number
  carboidratos: number
  gorduras: number
  fibras: number
  /* Quantos itens não têm caloria conhecida. A tela DIZ — um total calado sobre
     o que ficou de fora é um total em que não se pode confiar. */
  semCalorias: number
}

/* Nutriente por 100 g aplicado à porção. Nulo continua nulo: item 6 do
   AGENTS.md — zero no lugar do desconhecido soma como se fosse verdade. */
const porPorcao = (por100g: number | null, gramas: number | null): number | null =>
  por100g === null || gramas === null || !Number.isFinite(por100g) || !Number.isFinite(gramas)
    ? null
    : (por100g * gramas) / 100

/* A opção escolhida de cada item, com trava de índice.
 *
 * Um índice fora da lista devolveria `undefined` e a tela desenharia
 * "undefined" no lugar do alimento — e o total sairia sem ele, calado. */
export const escolhidaDe = (i: ItemComTrocas): Opcao | null =>
  i.opcoes.length === 0 ? null : (i.opcoes[Math.min(Math.max(i.escolhida, 0), i.opcoes.length - 1)] ?? null)

/* Avança para a próxima alternativa, circulando.
 *
 * Circular, e não uma lista que abre: com duas ou três opções, tocar é mais
 * rápido do que abrir, escolher e fechar — e duas ou três é o que um item de
 * plano tem. */
export function proxima(i: ItemComTrocas): ItemComTrocas {
  if (i.opcoes.length <= 1) return i
  return { ...i, escolhida: (i.escolhida + 1) % i.opcoes.length }
}

/* Os totais do que está escolhido AGORA.
 *
 * É esta função que faz a conta se refazer na frente dela. Sem ela, trocar
 * frango por peixe seria trocar no escuro — e o valor de poder trocar está
 * justamente em ver o que muda. */
export function totaisDe(itens: ItemComTrocas[]): Totais {
  const t: Totais = {
    calorias: 0,
    proteinas: 0,
    carboidratos: 0,
    gorduras: 0,
    fibras: 0,
    semCalorias: 0,
  }

  for (const item of itens) {
    const o = escolhidaDe(item)
    if (o === null) continue

    const kcal = porPorcao(o.caloriasPor100g, o.gramasTotais)
    if (kcal === null) t.semCalorias++
    else t.calorias += kcal

    t.proteinas += porPorcao(o.proteinasPor100g, o.gramasTotais) ?? 0
    t.carboidratos += porPorcao(o.carboidratosPor100g, o.gramasTotais) ?? 0
    t.gorduras += porPorcao(o.gordurasPor100g, o.gramasTotais) ?? 0
    t.fibras += porPorcao(o.fibrasPor100g, o.gramasTotais) ?? 0
  }

  return {
    calorias: Math.round(t.calorias),
    proteinas: Math.round(t.proteinas),
    carboidratos: Math.round(t.carboidratos),
    gorduras: Math.round(t.gorduras),
    fibras: Math.round(t.fibras),
    semCalorias: t.semCalorias,
  }
}

/* A diferença entre o que ela escolheu e o que o plano previa.
 *
 * Existe para a tela poder mostrar "+120 kcal" ao lado da troca. Sem esse
 * número, trocar vira adivinhação — e com ele a pessoa aprende, ao longo de
 * algumas semanas, o custo das próprias substituições.
 *
 * Zero quando nada foi trocado, e a tela não mostra nada nesse caso. */
export function diferencaDoOriginal(itens: ItemComTrocas[]): number {
  const original = totaisDe(itens.map(i => ({ ...i, escolhida: 0 })))
  return totaisDe(itens).calorias - original.calorias
}

/* Se alguma coisa foi trocada. */
export const houveTroca = (itens: ItemComTrocas[]): boolean => itens.some(i => i.escolhida !== 0)
