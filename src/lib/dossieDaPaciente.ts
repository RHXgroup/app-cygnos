import { supabase } from './supabase'
import { falha } from './erros'

/* O que a ficha abre: plano terapêutico e histórico de consultas.
 *
 * ──────────────────── Por que aqui e não em funções novas no banco ────────────────────
 * As que o PACIENTE usa (`app_plano_terapeutico`, `app_plano_do_paciente`) são
 * `security definer` e resolvem a pessoa por `app_paciente_da_conta()`. Pôr um
 * id de paciente como argumento numa função que roda com os privilégios do dono
 * abriria uma porta para qualquer conta pedir o prontuário de qualquer um --
 * isso é dado de saúde, e o id não entra como parâmetro numa função assim.
 *
 * E não precisa: as políticas destas tabelas já recortam por
 * `get_nutricionista_id()` e pela permissão do funcionário. O banco só devolve
 * o que é dela. É a mesma razão pela qual `agendaDaNutri` lê `consultas` direto
 * e `planoDoPacienteDaNutri` lê `planos_alimentares` direto.
 *
 * ──────────────────── E por que num arquivo só ────────────────────
 * Os dois são a mesma pergunta -- "o que mais existe sobre esta pessoa?" -- e a
 * ficha os abre lado a lado. Separar em dois arquivos daria dois cabeçalhos
 * repetindo a mesma explicação de RLS, e o próximo a mexer teria de descobrir
 * que são irmãos.
 */

/* ──────────────────── O PLANO TERAPÊUTICO ──────────────────── */

export type ObjetivoTerapeutico = {
  id: number
  /* O alimento da meta. Nulo quando o cadastro não tem o vínculo -- e aí a tela
     diz "sem alimento", em vez de uma linha em branco que parece defeito. */
  alimento: string | null
  status: string
  orientacoes: string | null
  frequencia: string | null
}

export type PlanoTerapeuticoDaPaciente = {
  id: number
  titulo: string
  status: string
  objetivos: ObjetivoTerapeutico[]
}

export type ResultadoTerapeutico =
  | { tipo: 'ok'; plano: PlanoTerapeuticoDaPaciente | null }
  | { tipo: 'erro'; mensagem: string }

export async function planoTerapeuticoDaPaciente(
  pacienteId: number,
): Promise<ResultadoTerapeutico> {
  const { data, error } = await supabase
    .from('planos_terapeuticos')
    .select('id, titulo, status, data_inicio')
    /* O mais recente, e não só o ativo: a ficha já diz o status, e um plano
       encerrado no mês passado ainda é o que ela quer ver quando pergunta "o
       que a gente estava fazendo com essa criança?". Esconder o encerrado
       deixaria a tela vazia para quem tem histórico. */
    .eq('paciente_id', pacienteId)
    .order('data_inicio', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)

  if (error) {
    return { tipo: 'erro', mensagem: falha('Não consegui abrir o plano terapêutico.', error) }
  }

  const p = (data ?? [])[0] as
    | { id: number; titulo: string | null; status: string | null }
    | undefined
  if (!p) return { tipo: 'ok', plano: null }

  const { data: objetivos, error: erroO } = await supabase
    .from('objetivos_terapeuticos')
    .select('id, status, alimento_base_id, alimentos_base(nome)')
    .eq('plano_id', p.id)
    .order('id')

  if (erroO) {
    return { tipo: 'erro', mensagem: falha('Não consegui ler as metas do plano.', erroO) }
  }

  const linhas = (objetivos ?? []) as Record<string, unknown>[]
  const ids = linhas.map(o => Number(o.id)).filter(Number.isFinite)

  /* A atividade de CASA, e não qualquer uma -- a mesma regra da função do
     paciente. A de consultório traz orientação escrita para a profissional e
     não é o que ela quer ler na frente da mãe da criança. */
  const atividades = ids.length
    ? await supabase
        .from('atividades_terapeuticas')
        .select('objetivo_id, orientacoes, frequencia, ambiente, created_at')
        .in('objetivo_id', ids)
        .order('created_at', { ascending: false })
    : { data: [], error: null }

  if (atividades.error) falha('Não consegui ler as atividades do plano.', atividades.error)

  /* A PRIMEIRA de cada objetivo ganha -- a ordem decrescente acima garante que
     é a mais recente. Nada impede duas atividades de casa para a mesma meta, e
     mostrar as duas viraria linha repetida. */
  const porObjetivo = new Map<number, { orientacoes: string | null; frequencia: string | null }>()
  for (const a of (atividades.data ?? []) as Record<string, unknown>[]) {
    const oid = Number(a.objetivo_id)
    if (!Number.isFinite(oid) || porObjetivo.has(oid)) continue
    const amb = a.ambiente
    if (amb !== null && amb !== undefined && amb !== 'casa') continue
    porObjetivo.set(oid, {
      orientacoes: typeof a.orientacoes === 'string' ? a.orientacoes.trim() || null : null,
      frequencia: typeof a.frequencia === 'string' ? a.frequencia.trim() || null : null,
    })
  }

  return {
    tipo: 'ok',
    plano: {
      id: p.id,
      titulo: p.titulo?.trim() || 'Plano terapêutico',
      status: p.status?.trim() || 'sem situação',
      objetivos: linhas.map(o => {
        const base = o.alimentos_base as { nome?: string } | { nome?: string }[] | null
        const nome = (Array.isArray(base) ? base[0]?.nome : base?.nome) ?? null
        const extra = porObjetivo.get(Number(o.id))
        return {
          id: Number(o.id),
          alimento: nome?.trim() || null,
          status: typeof o.status === 'string' ? o.status : 'sem situação',
          orientacoes: extra?.orientacoes ?? null,
          frequencia: extra?.frequencia ?? null,
        }
      }),
    },
  }
}

/* ──────────────────── AS CONSULTAS ──────────────────── */

export type ConsultaDoHistorico = {
  id: number
  quando: string
  status: string
  tipo: string | null
  /* A nota que ela escreveu no atendimento. É o que ela procura quando abre o
     histórico -- "o que ficou combinado da última vez?" -- e é a única coisa
     aqui que não dá para reconstruir de cabeça. */
  notas: string | null
}

export type ResultadoHistorico =
  | { tipo: 'ok'; consultas: ConsultaDoHistorico[] }
  | { tipo: 'erro'; mensagem: string }

/* Teto de 30. Quem tem duzentas consultas não rola duzentas linhas num
   telefone, e a tela diz que está mostrando as últimas. */
const TETO = 30

export async function consultasDaPaciente(pacienteId: number): Promise<ResultadoHistorico> {
  const { data, error } = await supabase
    .from('consultas')
    .select('id, data_hora, status, tipo, notas_atendimento')
    .eq('paciente_id', pacienteId)
    /* Da mais recente para a mais antiga: o histórico se lê de trás para a
       frente. A agenda é o contrário, e é de propósito -- lá o assunto é o que
       vem, aqui é o que foi. */
    .order('data_hora', { ascending: false })
    .limit(TETO)

  if (error) {
    return { tipo: 'erro', mensagem: falha('Não consegui abrir o histórico agora.', error) }
  }

  return {
    tipo: 'ok',
    consultas: ((data ?? []) as Record<string, unknown>[]).map(c => ({
      id: Number(c.id),
      quando: String(c.data_hora ?? ''),
      status: typeof c.status === 'string' ? c.status : '',
      tipo: typeof c.tipo === 'string' ? c.tipo : null,
      notas:
        typeof c.notas_atendimento === 'string' ? c.notas_atendimento.trim() || null : null,
    })),
  }
}

export const TETO_DO_HISTORICO = TETO
