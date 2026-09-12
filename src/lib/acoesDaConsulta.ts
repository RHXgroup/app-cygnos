import { supabase } from './supabase'
import { falha, mensagemDoBanco } from './erros'

/* Confirmar e dar por atendida -- o básico da agenda, que só existia no site.
 *
 * ── Confirmar ─────────────────────────────────────────────────────────────
 * `app_confirmar_consultas` (a mesma da Aurora), e não um `update` daqui: ela
 * recusa `solicitada` de propósito, porque o PEDIDO do paciente tem conferência
 * de choque própria em `app_responder_pedido`. Um `update` de status escrito
 * nesta tela pularia essa regra e poria duas pessoas no mesmo horário.
 *
 * ── Atendida ──────────────────────────────────────────────────────────────
 * Aqui é `update` mesmo, igual ao site: não há RPC, e a política de `consultas`
 * já recorta pela carteira e pela permissão de editar agendamentos.
 *
 * E o que este `update` NÃO faz está dito na tela, em vez de ficar escondido:
 * no sistema, marcar como realizada também gera o título no financeiro quando o
 * consultório tem geração automática -- e essa regra (mensalidade ativa,
 * convênio, parcelas, gasto fixo) mora no TypeScript do site. Copiá-la para cá
 * seria a armadilha 5 no lugar mais caro possível: duas regras de cobrança
 * divergindo em silêncio. O lugar certo é uma função no banco que os dois lados
 * chamem, e até ela existir a tela avisa que o lançamento continua no
 * computador. */

export type ResultadoDaAcao = { ok: true; mensagem: string } | { ok: false; mensagem: string }

export async function confirmarConsulta(id: number): Promise<ResultadoDaAcao> {
  const { data, error } = await supabase.rpc('app_confirmar_consultas', {
    p_consulta_ids: [id],
  })

  if (error) {
    return { ok: false, mensagem: mensagemDoBanco(error, 'Não consegui confirmar agora.') }
  }

  const r = (data ?? {}) as { ok?: unknown; mensagem?: unknown }
  const mensagem =
    typeof r.mensagem === 'string' && r.mensagem.trim() ? r.mensagem.trim() : 'Consulta confirmada.'
  return r.ok === true ? { ok: true, mensagem } : { ok: false, mensagem }
}

export async function marcarComoAtendida(id: number): Promise<ResultadoDaAcao> {
  const { error } = await supabase
    .from('consultas')
    .update({ status: 'realizada' })
    .eq('id', id)

  if (error) {
    return {
      ok: false,
      mensagem: falha('Não consegui marcar como atendida agora.', error),
    }
  }
  return { ok: true, mensagem: 'Consulta marcada como atendida.' }
}

/* O consultório gera título sozinho ao dar a consulta por atendida?
 *
 * Serve só para a tela escolher a frase: ligada, ela precisa saber que o
 * lançamento NÃO nasceu aqui; desligada, não há o que avisar. Falha vira `true`
 * -- avisar à toa custa uma linha de texto, e calar quando havia cobrança a
 * fazer custa dinheiro dela. O padrão do sistema também é `true`. */
export async function geraFinanceiroSozinho(): Promise<boolean> {
  const { data, error } = await supabase
    .from('configuracoes')
    .select('gerar_financeiro_auto')
    .maybeSingle()

  if (error) {
    falha('Não consegui ler a configuração do financeiro.', error)
    return true
  }
  return (data as { gerar_financeiro_auto?: boolean } | null)?.gerar_financeiro_auto ?? true
}
