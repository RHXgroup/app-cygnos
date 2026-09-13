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
 * ── E o financeiro, desde 12/09/2026 ──────────────────────────────────────
 * Dar por atendida também lança a cobrança, como no sistema. Até esta data a
 * tela avisava "o lançamento continua no computador", porque a regra
 * (mensalidade ativa, convênio, parcelas, gasto fixo) morava no TypeScript do
 * site e copiá-la para cá seria a armadilha 5 no lugar mais caro: duas regras de
 * cobrança divergindo em silêncio. A regra foi para o BANCO
 * (`app_lancar_financeiro_da_consulta`), e é ela que esta tela chama. */

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


/* A nota do atendimento, escrita logo depois de dar a consulta por atendida.
 *
 * ── Por que aqui, e não "depois, no computador" ──────────────────────────
 * É a mesma coluna que a ficha já lê e mostra no topo como "onde a gente
 * parou" -- o motivo pelo qual a maioria das fichas é aberta. Escrita no
 * corredor, entre uma paciente e outra, ela existe; deixada para a noite, ela
 * é o que mais se perde.
 *
 * Vazio APAGA, e não é engano: ela pode ter escrito por engano e querer tirar.
 * Guardar texto em branco e deixar a nota velha no lugar seria a tela dizendo
 * que salvou e não ter salvado. */
export async function salvarNotaDoAtendimento(
  id: number,
  nota: string,
): Promise<ResultadoDaAcao> {
  const limpa = nota.trim()
  const { error } = await supabase
    .from('consultas')
    .update({ notas_atendimento: limpa || null })
    .eq('id', id)

  if (error) {
    return { ok: false, mensagem: falha('Não consegui salvar a nota agora.', error) }
  }
  return { ok: true, mensagem: limpa ? 'Nota guardada.' : 'Nota apagada.' }
}

export type ResultadoDoFinanceiro =
  /** Lançou, ou não havia o que lançar -- a frase diz qual dos dois. */
  | { tipo: 'ok'; mensagem: string | null }
  /** Há mensalidade ativa: a pergunta vem pronta do banco, com os dois valores. */
  | { tipo: 'confirmar'; mensagem: string }
  | { tipo: 'erro'; mensagem: string }

/**
 * Lança o financeiro da consulta que ACABOU de ser dada por atendida.
 *
 * `mesmoComMensalidade` é a resposta dela à pergunta: só vai `true` depois que
 * a tela mostrou "ela tem mensalidade de R$ X, lançar também R$ Y?" e ela
 * tocou em lançar. A função do banco nunca decide isso sozinha -- pode ser
 * cobrança em dobro, e pode ser uma avaliação fora do pacote.
 */
export async function lancarFinanceiroDaConsulta(
  id: number,
  mesmoComMensalidade = false,
): Promise<ResultadoDoFinanceiro> {
  const { data, error } = await supabase.rpc('app_lancar_financeiro_da_consulta', {
    p_consulta_id: id,
    p_mesmo_com_mensalidade: mesmoComMensalidade,
  })

  if (error) {
    return {
      tipo: 'erro',
      /* A consulta JÁ está atendida quando isto roda. A frase diz as duas coisas,
         porque "não consegui" sozinho faria ela achar que o atendimento também
         não foi registrado -- e tocar em "atendi" de novo. */
      mensagem: mensagemDoBanco(
        error,
        'A consulta ficou como atendida, mas o lançamento no financeiro não entrou. Lance no computador.',
      ),
    }
  }

  const r = (data ?? {}) as {
    ok?: unknown
    lancado?: unknown
    precisa_confirmar?: unknown
    motivo?: unknown
    mensagem?: unknown
  }
  const mensagem = typeof r.mensagem === 'string' && r.mensagem.trim() ? r.mensagem.trim() : null

  if (r.precisa_confirmar === true && mensagem) return { tipo: 'confirmar', mensagem }
  if (r.ok !== true) {
    return {
      tipo: 'erro',
      mensagem: mensagem ?? 'A consulta ficou como atendida, mas o lançamento no financeiro não entrou.',
    }
  }

  /* Automático desligado e "não é realizada" não são assunto para ela: o
     consultório escolheu não lançar, e dizer isso toda vez seria ruído. As
     outras frases (lançado, sem valor, já lançado) ela precisa ler. */
  if (r.motivo === 'automatico_desligado' || r.motivo === 'nao_realizada') {
    return { tipo: 'ok', mensagem: null }
  }
  return { tipo: 'ok', mensagem }
}
