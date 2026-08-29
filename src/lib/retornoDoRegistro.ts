/* O que o app responde quando alguém acaba de registrar comida.
 *
 * Registrar era mudo: a pessoa escolhia o alimento, voltava para a lista, e
 * nada acontecia na tela além de a linha aparecer. O gesto mais repetido do app
 * não devolvia nada.
 *
 * ── Por que isto não é recompensa ──────────────────────────────────────────
 * A literatura de retenção é clara num ponto que contraria o mercado: a evasão
 * é MENOR em apps sem gamificação. Sequências e troféus dão ganho de curto
 * prazo e não se sustentam — e num app de nutrição têm um custo próprio, porque
 * quem come além da conta deixa de anotar para não "estragar" o dia, e o app
 * perde o dado justamente quando ele importa.
 *
 * Então o retorno aqui é INFORMAÇÃO, não prêmio. Nada de "parabéns", nada de
 * número que sobe sem significar. O que a pessoa ganha por anotar é saber onde
 * ela está — que é a única coisa que ela não conseguiria sozinha, e que não
 * perde a graça na segunda semana.
 *
 * ── E por que não avisa quando passa da meta ───────────────────────────────
 * Porque quem passou já sabe, e porque a bronca é o caminho mais curto para a
 * pessoa parar de registrar. O cartão do dia mostra o número inteiro, com todas
 * as letras, para quem quiser olhar. Esta barra não repete.
 *
 * Não importa nada de runtime — só tipo, que some na compilação. É o que
 * permite exercitá-la fora do aparelho. */

export type Retorno = {
  /* A linha que aparece. */
  texto: string
  /* Verdadeiro quando o dia já fechou a meta de calorias: a barra troca de cor
     para dizer isso sem escrever "parabéns". */
  fechou: boolean
}

const milhar = (n: number) => Math.round(n).toLocaleString('pt-BR')

/* Uma frase, a partir do que entrou e de onde o dia está.
 *
 * `adicionadas` é a soma das calorias do que acabou de ser registrado, e pode
 * ser null: item sem peso informado, ou alimento que a base não conhece, não
 * somam nada — e dizer "+0 kcal" seria mentir sobre uma comida que existe.
 *
 * `meta` também pode ser null, e é o caso de quem nunca definiu. Aí não há
 * "quanto falta", e o que sobra é o total do dia, que continua sendo notícia. */
export function retornoDoRegistro({
  adicionadas,
  totalDoDia,
  meta,
  quantos,
}: {
  adicionadas: number | null
  totalDoDia: number | null
  meta: number | null
  /* Quantos itens entraram. Um plano inteiro entra de uma vez, e "3 alimentos"
     explica um salto que "+840 kcal" sozinho pareceria erro. */
  quantos: number
}): Retorno {
  const entrou =
    adicionadas !== null && adicionadas > 0
      ? `+${milhar(adicionadas)} kcal`
      : quantos === 1
        ? 'Item registrado'
        : `${quantos} itens registrados`

  /* Sem meta não há o que faltar. O total do dia é o que sobra de útil, e é
     mais do que a pessoa tinha antes de tocar. */
  if (meta === null || meta <= 0) {
    if (totalDoDia === null || totalDoDia <= 0) return { texto: entrou, fechou: false }
    return { texto: `${entrou} · ${milhar(totalDoDia)} kcal hoje`, fechou: false }
  }

  const comido = totalDoDia ?? 0
  const falta = meta - comido

  /* Passou da meta: diz o total e para por aí. Nada de "você excedeu" — quem
     passou já sabe, e a bronca é o caminho mais curto para parar de anotar. */
  if (falta < 0) {
    return { texto: `${entrou} · ${milhar(comido)} de ${milhar(meta)} kcal`, fechou: true }
  }

  /* Bateu na mosca, ou quase. Meio por cento de folga para os dois lados: sem
     isso, "faltam 3 kcal" apareceria como se fosse cobrança de três calorias. */
  if (falta <= meta * 0.005) {
    return { texto: `${entrou} · meta do dia completa`, fechou: true }
  }

  return { texto: `${entrou} · faltam ${milhar(falta)} kcal`, fechou: false }
}
