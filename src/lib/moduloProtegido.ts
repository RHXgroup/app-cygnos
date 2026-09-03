/* Um módulo nativo que perdeu pedaços, embrulhado para não derrubar o app.
 *
 * ── Por que existe ────────────────────────────────────────────────────────
 * O Expo Go vem removendo partes do `expo-notifications` a cada SDK. Uma
 * chamada a algo que não existe mais vira `undefined is not a function` dentro
 * da promessa que carrega o módulo; ela rejeita, ninguém trata, e o app abre
 * com cinco erros vermelhos enquanto TODA ação seguinte falha — porque quem
 * espera pelo módulo nunca é atendido.
 *
 * ── Por que num arquivo separado ──────────────────────────────────────────
 * Porque a primeira versão disto tinha um defeito que só um teste pegaria, e
 * `lembretes.ts` não dá para testar: ele importa AsyncStorage e o próprio
 * `expo-notifications`, e qualquer um dos dois arrasta o aparelho inteiro para
 * dentro do Node. Aqui não há import nenhum, então a decisão fica exercitável.
 *
 * ── O defeito, que vale mais que a regra ──────────────────────────────────
 * A versão anterior devolvia uma função-vazia para TODO nome ausente. Inclusive
 * `then` — e `then` é como o JavaScript decide se um objeto é uma promessa.
 *
 * Com isso, `await moduloProtegido(x)` fazia o motor perguntar "você é uma
 * promessa?", receber "sou", chamar o `then` de mentira esperando ser chamado
 * de volta com `resolve`, e ficar esperando para sempre — porque a função de
 * mentira ignora o `resolve` e devolve outra promessa.
 *
 * Ou seja: o remédio para o travamento reintroduziu o travamento, mais escondido
 * do que o original. Não havia erro na tela; havia uma linha no terminal
 * dizendo "sem `then` neste Expo Go — ignorando", e era ela a confissão.
 *
 * A regra que fica: um objeto que finge ter TODOS os nomes mente sobre o que
 * ele É, e não só sobre o que ele faz. `then`, `catch` e `finally` decidem se
 * ele é aguardável; os símbolos decidem como ele se converte. Nada disso pode
 * ser fingido. */

/* Nomes que mudam o SIGNIFICADO do objeto, e não o que ele faz. */
export const NUNCA_FINJA = ['then', 'catch', 'finally']

export function moduloProtegido<T extends object>(
  alvo: T,
  aoFaltar: (nome: string) => void = () => {},
): T {
  return new Proxy(alvo, {
    get(obj, nome) {
      const v = (obj as Record<string | symbol, unknown>)[nome]
      if (typeof v !== 'undefined') return v

      /* Ausente de verdade: dizer ausente é a única resposta honesta. */
      if (typeof nome === 'symbol' || NUNCA_FINJA.includes(nome)) return undefined

      /* O resto vira função que não faz nada e responde vazio — que é o que
         quase tudo neste módulo é, e `[]` é o vazio que os chamadores já sabem
         tratar. Avisa uma vez por nome: mágica silenciosa esconderia o dia em
         que a função sumiu de verdade. */
      aoFaltar(nome)
      return async () => [] as unknown
    },
  })
}
