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
  /* ── A SESSÃO PRIMEIRO, e isto não é zelo ────────────────────────────────
   *
   * Uma leitura de TABELA sem sessão volta vazia e sem erro: a RLS recorta e
   * pronto. Uma RPC sem sessão volta `42501 permission denied for function`,
   * porque `anon` não tem EXECUTE nela -- e essa diferença é o que fazia esta
   * chamada ser a ÚNICA da tela a gritar no console quando o problema era de
   * todas: agenda, dinheiro e pedidos voltavam vazios, calados.
   *
   * Sem sessão não há o que ler, então não se lê -- e não se avisa, porque
   * "ainda não entrou" não é falha.
   *
   * `getSession` lê do armazenamento local e não vai à rede, então isto não
   * atrasa a abertura. */
  const { data: sessao } = await supabase.auth.getSession()
  if (!sessao.session) return { tipo: 'erro' }

  const { data, error } = await supabase.rpc('aurora_carteira_triagem', {})

  if (error) {
    /* Registrado no console e nada na tela. A agenda é o que ela veio ver; um
       recado sobre a carteira não pode roubar o lugar dela. */
    /* 42501 COM sessão é outra coisa, e precisa dizer isso.
       A função concede EXECUTE a `authenticated`; se ela recusou mesmo com
       sessão na mão, o problema é da conta ou da concessão no banco, e não
       desta tela. Sem esta linha o aviso é idêntico ao de rede caída, e o
       próximo a investigar recomeça do zero. */
    const negada = (error as { code?: string }).code === '42501'
    falha(
      negada
        ? 'Sem permissão para ler quem pede atenção -- havia sessão, então confira ' +
          'o GRANT de aurora_carteira_triagem para authenticated no banco.'
        : 'Não consegui ler quem pede atenção.',
      error,
    )
    return { tipo: 'erro' }
  }

  return { tipo: 'ok', pessoas: lerTriagem(data) }
}
