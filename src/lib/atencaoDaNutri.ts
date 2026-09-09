import { supabase } from './supabase'
import { falha } from './erros'
import { lerTriagem, type Sinalizado } from './sinaisDaCarteira'

/* Quem pede atenção hoje. O que DECIDE mora em `sinaisDaCarteira`.
 *
 * ──────────────────── Sem função nova no servidor ────────────────────
 * `aurora_carteira_triagem()` já existe, já é `security definer`, já lê
 * `get_nutricionista_id()` por dentro e já está liberada para `authenticated`.
 * É a mesma que a aba Carteira do site usa. SQL puro: sem IA e sem custo.
 *
 * ──────────────────── E por que NÃO a `aurora_carteira_estado` ────────────────────
 * É a irmã que o site chama, e ela traz junto a leitura escrita por IA, a trava
 * de concorrência e o piso de uma hora entre passagens. Nada disso serve a uma
 * linha de painel que ela olha entre uma consulta e outra -- e o piso de uma
 * hora faria a linha ficar velha justamente no dia movimentado.
 *
 * ──────────────────── Falha aqui não derruba o painel ────────────────────
 * Item 11. Devolve lista vazia, e a linha simplesmente não aparece. Uma linha
 * de aviso que some é menos grave que uma agenda que some por causa dela. */

export type ResultadoAtencao =
  | { tipo: 'ok'; pessoas: Sinalizado[] }
  | { tipo: 'erro' }

export async function quemPedeAtencao(): Promise<ResultadoAtencao> {
  const { data, error } = await supabase.rpc('aurora_carteira_triagem', {})

  if (error) {
    /* Registrado no console e nada na tela. A agenda é o que ela veio ver; um
       recado sobre a carteira não pode roubar o lugar dela. */
    falha('Não consegui ler quem pede atenção.', error)
    return { tipo: 'erro' }
  }

  return { tipo: 'ok', pessoas: lerTriagem(data) }
}
