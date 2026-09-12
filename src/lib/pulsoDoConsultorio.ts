import { supabase } from './supabase'
import { falha } from './erros'
import {
  hojeDoAparelho,
  janelaDeDias,
  serieDiaria,
  type PontoDoDia,
} from './serieDoPainel'

/* O pulso do consultório: o que aconteceu nas últimas semanas, em série.
 *
 * ──────────────────── O pedido ────────────────────
 * "Quero um gráfico, não barrinha de progressão. Um painel clínico
 * completinho, bonito, pra ela bater o olho e falar 'que da hora'."
 *
 * Um painel de relance responde três perguntas, e nesta ordem: como está o
 * MOVIMENTO (quantas consultas por dia), como está o CAIXA (quanto entrou por
 * dia) e como está a CARTEIRA (quantos são, quantos entraram, quantos usam o
 * aplicativo). O resto -- o detalhe de cada linha -- é o sistema.
 *
 * ──────────────────── Nada aqui derruba o painel ────────────────────
 * Cada pedaço volta `null` quando não deu, e a tela desenha o que veio. Item 11:
 * uma leitura de gráfico não pode tirar do ar a agenda do dia, que é a única
 * coisa desta tela que ela precisa ver TODA manhã.
 *
 * A conta das séries -- dia vazio virando zero, data fora da janela sendo
 * descartada -- mora em `serieDoPainel.ts`, que é puro e tem teste. Aqui fica
 * só a ida ao banco. */

export type PulsoDoConsultorio = {
  /** Uma consulta por dia da janela, cancelada fora da conta. */
  consultas: PontoDoDia[] | null
  /** O que ENTROU por dia, em reais. */
  caixa: PontoDoDia[] | null
  carteira: {
    ativos: number
    /** Entraram na carteira nos últimos 30 dias. */
    novos: number
    /** Quantos já usam o aplicativo. */
    comApp: number
  } | null
  /** A janela lida, em dias. A tela usa para rotular ("nos últimos 14 dias"). */
  dias: number
}

/* Catorze dias: duas semanas cheias. É o menor recorte em que a comparação
   "esta semana contra a passada" existe, e o maior que ainda cabe num gráfico
   de celular sem virar um borrão de barras finas. */
export const DIAS_DA_JANELA = 14

export async function pulsoDoConsultorio(
  dias: number = DIAS_DA_JANELA,
  agora: Date = new Date(),
): Promise<PulsoDoConsultorio> {
  const hoje = hojeDoAparelho(agora)
  const janela = janelaDeDias(hoje, dias)
  const primeiro = janela[0] ?? hoje

  /* O corte da agenda é por INSTANTE (a coluna é `timestamptz`), e o do
     financeiro é por DATA pelada. Misturar os dois formatos numa consulta só
     traria o dia errado para quem está a oeste de Greenwich depois das 21h --
     o mesmo cuidado que `financeiroDoDia` já tomava. */
  const inicioDoPrimeiro = new Date(`${primeiro}T00:00:00`)
  const fimDeHoje = new Date(`${hoje}T00:00:00`)
  fimDeHoje.setDate(fimDeHoje.getDate() + 1)

  const trintaDiasAtras = new Date(agora.getTime() - 30 * 86400000).toISOString()

  const [consultas, baixas, ativos, novos, comApp] = await Promise.all([
    supabase
      .from('consultas')
      .select('data_hora, status')
      .gte('data_hora', inicioDoPrimeiro.toISOString())
      .lt('data_hora', fimDeHoje.toISOString()),
    supabase
      .from('contas_receber_baixas')
      .select('valor_pago, data_pagamento')
      .gte('data_pagamento', primeiro)
      .lte('data_pagamento', hoje),
    supabase.from('pacientes').select('id', { count: 'exact', head: true }).eq('status', 'ativo'),
    supabase
      .from('pacientes')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', trintaDiasAtras),
    supabase.from('app_vinculos').select('conta_id', { count: 'exact', head: true }),
  ])

  if (consultas.error) falha('Não consegui ler as consultas do período.', consultas.error)
  if (baixas.error) falha('Não consegui ler o que entrou no período.', baixas.error)
  if (ativos.error) falha('Não consegui contar os seus pacientes.', ativos.error)

  const serieDeConsultas = consultas.error
    ? null
    : serieDiaria(
        ((consultas.data ?? []) as Record<string, unknown>[])
          /* Cancelada não é atendimento, e contá-la faria a semana parecer
             cheia justamente na semana em que as pessoas desmarcaram. */
          .filter(c => c.status !== 'cancelada')
          .map(c => ({ dia: c.data_hora, valor: 1 })),
        hoje,
        dias,
      )

  const serieDoCaixa = baixas.error
    ? null
    : serieDiaria(
        ((baixas.data ?? []) as Record<string, unknown>[]).map(b => ({
          dia: b.data_pagamento,
          valor: b.valor_pago,
        })),
        hoje,
        dias,
      )

  return {
    consultas: serieDeConsultas,
    caixa: serieDoCaixa,
    carteira: ativos.error
      ? null
      : {
          ativos: ativos.count ?? 0,
          novos: novos.error ? 0 : (novos.count ?? 0),
          comApp: comApp.error ? 0 : (comApp.count ?? 0),
        },
    dias,
  }
}
