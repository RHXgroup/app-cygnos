/* Achar, no plano, a refeição que a pessoa está registrando agora.
 *
 * ── O defeito que fez isto existir ────────────────────────────────────────
 * A foto do prato passou a mandar o plano da nutricionista junto, como pista
 * para a IA. A busca era assim:
 *
 *     plano.refeicoes.find(r => r.rotulo === refeicao)
 *
 * Comparação exata. Mas os dois lados vêm de lugares diferentes: o `refeicao`
 * da tela sai de uma lista FECHADA de seis ("Café da manhã", "Almoço"...), e o
 * `rotulo` do plano é TEXTO LIVRE que a nutricionista escreveu no sistema dela.
 *
 * "Almoço " com espaço no fim, "almoço" em minúscula, "Almoço 12h", "ALMOÇO" —
 * nenhum casava. O recurso existia e o caminho quase nunca passava por ele.
 *
 * E falhava CALADO: a foto continuava funcionando, só que sem o sinal mais
 * forte que o app tinha para oferecer. Ninguém reclamaria disso nunca.
 *
 * ── Por que existe e por que o caminho passa são duas conferências ────────
 * A lição é da app-cygnos-6b, que achou um canal de notificação criado a cada
 * toque e nunca usado — o objeto existia, o caminho não passava por ele. Esta
 * é a mesma família, no meu código, e foi encontrada pelo mesmo teste.
 *
 * ── E por que recusar vale mais do que chutar ─────────────────────────────
 * Quando duas refeições do plano casam igualmente bem, isto devolve NADA.
 *
 * Não é timidez: o plano entra no prompt da IA como contexto, e contexto errado
 * é o pior dos mundos. Sem contexto, o erro do modelo é aleatório e a pessoa
 * desconfia; com contexto errado, o erro fica PLAUSÍVEL — bate com um plano de
 * verdade, só que o da refeição errada — e passa.
 *
 * ── Só `import type` ──────────────────────────────────────────────────────
 * Roda fora do aparelho. */

import { semAcento } from './texto.ts'

/* O mínimo que basta para casar. Só o rótulo interessa aqui — receber o plano
   inteiro amarraria este arquivo ao formato dele, e o formato do plano muda
   mais do que a ideia de "achar a refeição". */
export type ComRotulo = { rotulo: string }

/* Quantos caracteres o rótulo mais curto precisa ter para valer um casamento
 * por começo.
 *
 * Quatro. Abaixo disso ("Ceia" tem quatro, "Jantar" tem seis) qualquer prefixo
 * curto casaria com meio plano — "Ca" pegaria "Café da manhã" e "Caldo", e um
 * rótulo de duas letras não é evidência de nada. */
const MINIMO_PARA_COMECO = 4

export function refeicaoDoPlano<T extends ComRotulo>(
  refeicoes: readonly T[] | null | undefined,
  refeicao: string,
): T | null {
  if (!Array.isArray(refeicoes) || refeicoes.length === 0) return null

  const alvo = semAcento(typeof refeicao === 'string' ? refeicao : '')
  if (alvo.length === 0) return null

  const uteis = refeicoes.filter(
    (r): r is T => !!r && typeof r.rotulo === 'string' && semAcento(r.rotulo).length > 0,
  )

  /* 1. Igual depois de normalizar. Resolve maiúscula, acento e espaço — que é a
        maioria absoluta dos casos, porque a nutricionista escreve as mesmas
        palavras que o app oferece. */
  const iguais = uteis.filter(r => semAcento(r.rotulo) === alvo)
  if (iguais.length === 1) return iguais[0]
  /* Duas refeições com o mesmo nome no plano — "Lanche" duas vezes, uma de
     manhã e outra à tarde — é plano de verdade, e não dá para escolher. */
  if (iguais.length > 1) return null

  /* 2. Um começa com o outro. Resolve "Almoço 12h" contra "Almoço", e "Lanche"
        contra "Lanche da tarde".
   *
   * A comparação é por PALAVRA inteira, e não por caractere: sem isso, "Ceia"
   * casaria com "Ceias de festa" e também com qualquer coisa que comece com
   * essas quatro letras. */
  const comeca = (a: string, b: string) => a === b || a.startsWith(b + ' ')

  const parecidos = uteis.filter(r => {
    const dele = semAcento(r.rotulo)
    const curto = dele.length <= alvo.length ? dele : alvo
    if (curto.length < MINIMO_PARA_COMECO) return false
    return comeca(dele, alvo) || comeca(alvo, dele)
  })

  /* Uma só, ou nenhuma. "Lanche da manhã" e "Lanche da tarde" contra "Lanche"
     casam as duas, e aí não há resposta — mandar a errada para a IA seria pior
     do que não mandar nada. */
  return parecidos.length === 1 ? parecidos[0] : null
}
