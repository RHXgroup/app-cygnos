import { supabase } from './supabase'
import { falha } from './erros'

/* "Não era isso": ela aponta a resposta que não serviu.
 *
 * ──────────────────── Por que isto existe ────────────────────
 * A medição da Aurora (`aurora_medicao`) conta quantas conversas terminaram em
 * "isso é no computador", e não guarda texto nenhum -- de propósito. Ou seja:
 * sabemos o TAMANHO do problema e nunca QUAL é ele. Sem isto, a próxima
 * ferramenta da Aurora é escolhida por palpite de quem programa.
 *
 * ──────────────────── Não vai para o modelo ────────────────────
 * É o contrário de mandar contexto: fica no banco DELA, com a política da
 * carteira, para leitura humana depois. A pergunta pode ter nome de paciente
 * ("remarca a Maria"), e por isso a linha é da carteira como o resto do
 * prontuário. Nada disto entra em conversa nenhuma com o provedor.
 *
 * ──────────────────── Nunca atrapalha ────────────────────
 * Falhar aqui não pode virar erro na tela: ela acabou de dizer que a RESPOSTA
 * não serviu, e receber "não consegui registrar que não serviu" seria o app
 * falhando duas vezes seguidas na mesma frase. A tela agradece de qualquer
 * jeito; o console guarda o motivo. */

export async function apontarQueNaoEraIsso(pedido: {
  pergunta: string
  resposta: string
  /** A ferramenta que a Aurora ofereceu, quando ofereceu. */
  ferramenta?: string | null
}): Promise<void> {
  const pergunta = pedido.pergunta.trim().slice(0, 2000)
  const resposta = pedido.resposta.trim().slice(0, 4000)
  if (!pergunta || !resposta) return

  /* `nutricionista_id` não vai daqui: a coluna tem `default
     get_nutricionista_id()` no banco, que é o mesmo valor que a política
     confere. Mandar da tela seria o aplicativo afirmando de quem é a linha. */
  const { error } = await supabase.from('aurora_nao_era_isso').insert({
    pergunta,
    resposta,
    ferramenta: pedido.ferramenta?.trim() || null,
  })

  if (error) falha('Não consegui registrar o "não era isso".', error)
}
