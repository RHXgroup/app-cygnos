import { supabase } from './supabase'
import { falha } from './erros'
import { dataISO } from './formatar'
import { somar, type ItemDeCompra } from './somaDasCompras'

export type { ItemDeCompra }
export { quantidadePorExtenso } from './somaDasCompras'

/* O que ela precisa COMPRAR para as sessões que vêm.
 *
 * ──────────────────── O pedido ────────────────────
 * "A lista de compra também, se tiver alguma coisa pendente de alguma consulta
 * que ela for ter, deve colocar aqui." -- na tela Hoje.
 *
 * É uma pergunta de LOGÍSTICA, e é a única desta área que tem hora certa para
 * ser respondida: no supermercado, na véspera. Descobrir no dia da sessão que
 * faltou o iogurte é descobrir tarde.
 *
 * ──────────────────── De onde sai ────────────────────
 * Sessão terapêutica é `atividades_terapeuticas` com `data_sessao` preenchida,
 * e o que ela precisa levar mora em `atividade_recursos_itens` -- tabela à
 * parte, com quantidade e unidade. Mesmo caminho que o painel "Compras do
 * consultório" do site já usa; não inventei consulta nova.
 *
 * A RLS recorta por nutricionista nas duas, então a leitura vai direto.
 *
 * ──────────────────── O QUE ELA SOMA, e o que não ────────────────────
 * Itens iguais viram UMA linha com a quantidade somada: três sessões pedindo
 * um iogurte cada viram "3 iogurtes", que é o que se lê no supermercado. Uma
 * lista com o mesmo nome três vezes faz ela contar de cabeça no corredor.
 *
 * Só soma o que tem a MESMA unidade. "2 unidades" e "500 g" do mesmo alimento
 * não somam -- e forçar daria um número inventado com cara de certo. Nesse
 * caso saem duas linhas, e ela decide.
 *
 * ──────────────────── E o texto livre fica de fora ────────────────────
 * `recursos_necessarios` é um campo de texto onde ela escreve o que quiser.
 * Não dá para somar, e mostrar aqui viraria um parágrafo dentro de uma lista
 * de compras. Quem escreve ali lê no site, onde o campo aparece inteiro.
 */



export type ResultadoDasCompras =
  | { tipo: 'ok'; itens: ItemDeCompra[]; ate: string }
  | { tipo: 'erro' }

/* Sete dias. É o horizonte de quem vai ao mercado uma vez por semana, e é o que
   cabe numa lista que ela lê de relance na tela inicial. Mais que isso vira
   estoque, e estoque tem lugar no site. */
const DIAS = 7

export async function comprasDaSemana(agora: Date = new Date()): Promise<ResultadoDasCompras> {
  const de = new Date(agora)
  de.setHours(0, 0, 0, 0)
  const ate = new Date(de)
  ate.setDate(ate.getDate() + DIAS)

  /* O dia DO APARELHO, e não o de Greenwich. `toISOString` acertava por sorte:
     meia-noite de Brasília é 03h em UTC, ainda o mesmo dia. Um fuso a leste
     de Greenwich -- ou a meia-noite trocada por "agora", numa edição futura --
     e a semana começaria um dia antes, sem erro nenhum na tela. */
  const iso = dataISO

  const { data: atividades, error } = await supabase
    .from('atividades_terapeuticas')
    .select('id, data_sessao')
    .not('data_sessao', 'is', null)
    .gte('data_sessao', iso(de))
    .lte('data_sessao', iso(ate))

  /* Falha aqui não vira erro na tela: a tela Hoje é a agenda dela, e um recado
     sobre compras não pode roubar o lugar dela. Item 11. */
  if (error) {
    falha('Não consegui ler as compras da semana.', error)
    return { tipo: 'erro' }
  }

  const ids = ((atividades ?? []) as { id: number }[]).map(a => a.id)
  if (ids.length === 0) return { tipo: 'ok', itens: [], ate: iso(ate) }

  const { data: itens, error: erroI } = await supabase
    .from('atividade_recursos_itens')
    .select('atividade_id, nome, quantidade, unidade')
    .in('atividade_id', ids)

  if (erroI) {
    falha('Não consegui ler os itens das sessões.', erroI)
    return { tipo: 'erro' }
  }

  return { tipo: 'ok', itens: somar((itens ?? []) as Record<string, unknown>[]), ate: iso(ate) }
}
