import { supabase } from './supabase'
import { falha, mensagemDoBanco } from './erros'

/* Marcar consulta pelo aplicativo.
 *
 * ── Por que uma RPC, e não um insert ──────────────────────────────────────
 * `app_agendar_consulta` já existe -- nasceu para a Aurora -- e faz o que um
 * insert daqui não faria: tranca o dia, confere CHOQUE de horário contra o que
 * já está marcado (inclusive pedido do paciente esperando resposta) e devolve
 * uma frase pronta dizendo com quem chocou e a que horas. Reescrever isso na
 * tela seria a armadilha 5 com o preço mais alto possível: duas regras de
 * agenda divergindo, e a que erra marca duas pessoas no mesmo horário.
 *
 * O `p_data_hora` é `timestamptz` e recebe o ISO do `Date` -- instante, com
 * fuso. Ver `horarioDaConsulta.ts` para o motivo de nunca mandar texto sem
 * fuso daqui. */

export type TipoDeConsulta = {
  slug: string
  nome: string
  /** A duração padrão DESTE tipo. Primeira consulta costuma ser mais longa. */
  duracaoMin: number
}

/* O que o sistema traz de fábrica, para a tela nunca ficar sem escolha: a
   leitura pode falhar (sem sinal) e um seletor vazio travaria a marcação
   inteira por causa de um rótulo. Os slugs são os mesmos do sistema. */
export const TIPOS_DE_FABRICA: TipoDeConsulta[] = [
  { slug: 'primeira_consulta', nome: 'Primeira consulta', duracaoMin: 60 },
  { slug: 'retorno', nome: 'Retorno', duracaoMin: 45 },
]

/**
 * Os tipos de consulta DELA, como cadastrados no sistema. Nunca rejeita e nunca
 * volta vazio: sem resposta, os de fábrica (item 11).
 */
export async function tiposDeConsulta(): Promise<TipoDeConsulta[]> {
  const [{ data, error }, { data: config }] = await Promise.all([
    supabase
      .from('tipos_consulta')
      .select('slug, nome, duracao_min, ordem')
      .eq('ativo', true)
      .order('ordem')
      .order('nome'),
    supabase
      .from('configuracoes')
      .select('duracao_consulta, tipos_consulta_detalhado')
      .limit(1).maybeSingle(),
  ])

  /* A duração segue a chave "Detalhado" de Parâmetros > Sistema, como no site
     e na Aurora (`_shared/duracaoDaConsulta.ts` do Nutriviet): desligada -- o
     padrão, e o que quase todo consultório tem --, TODA consulta usa o número
     único; ligada, cada tipo usa a sua. Ler só a tabela de tipos, que nasce
     com 60 nos dois, ignorava o número que ela escolheu. */
  const cfg = config as { duracao_consulta?: number | null; tipos_consulta_detalhado?: boolean | null } | null
  const valido = (n: unknown) => {
    const v = Number(n)
    return Number.isInteger(v) && v >= 5 && v <= 480 ? v : null
  }
  const unica = valido(cfg?.duracao_consulta) ?? 60
  const detalhado = !!cfg?.tipos_consulta_detalhado

  if (error) {
    falha('Não consegui ler os seus tipos de consulta.', error)
    return TIPOS_DE_FABRICA.map(t => ({ ...t, duracaoMin: detalhado ? t.duracaoMin : unica }))
  }

  const lidos = ((data ?? []) as Record<string, unknown>[])
    .map(t => ({
      slug: typeof t.slug === 'string' ? t.slug : '',
      nome: (typeof t.nome === 'string' && t.nome.trim()) || '',
      duracaoMin: detalhado ? valido(t.duracao_min) ?? unica : unica,
    }))
    .filter(t => t.slug && t.nome)

  return lidos.length > 0
    ? lidos
    : TIPOS_DE_FABRICA.map(t => ({ ...t, duracaoMin: detalhado ? t.duracaoMin : unica }))
}

export type ResultadoDaMarcacao =
  | { tipo: 'ok'; mensagem: string; id: number | null }
  | { tipo: 'erro'; mensagem: string }

export async function marcarConsulta(pedido: {
  pacienteId: number
  quando: Date
  duracaoMin: number
  tipo: string | null
  observacoes: string | null
}): Promise<ResultadoDaMarcacao> {
  const { data, error } = await supabase.rpc('app_agendar_consulta', {
    p_paciente_id: pedido.pacienteId,
    p_data_hora: pedido.quando.toISOString(),
    p_duracao: pedido.duracaoMin,
    p_tipo: pedido.tipo,
    p_observacoes: pedido.observacoes?.trim() || null,
  })

  if (error) {
    /* `mensagemDoBanco` e não `falha` direto: esta RPC pode recusar com frase
       escrita para gente ("esse horário choca com..."), e traduzir o que ela
       escreveu seria perder a única explicação que existe. O jargão em inglês
       continua barrado -- armadilha 12. */
    return { tipo: 'erro', mensagem: mensagemDoBanco(error, 'Não consegui marcar a consulta agora.') }
  }

  /* A RPC devolve `{ ok, mensagem }` -- inclusive na recusa por choque, que
     chega como sucesso de rede e `ok: false`. Ler só o `error` faria a tela
     dizer "marcada" para uma consulta que não entrou. */
  const r = (data ?? {}) as { ok?: unknown; mensagem?: unknown; id?: unknown }
  const mensagem = typeof r.mensagem === 'string' && r.mensagem.trim()
    ? r.mensagem.trim()
    : r.ok === true
      ? 'Consulta marcada.'
      : 'Não consegui marcar a consulta agora.'

  if (r.ok !== true) return { tipo: 'erro', mensagem }
  return { tipo: 'ok', mensagem, id: Number(r.id) || null }
}
