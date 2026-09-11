import { supabase } from './supabase'
import { falha } from './erros'
import { nomeDoPlano, type Exposicao } from './escaladaDoComer'

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

/* ── O que mudou em 11/09, e por quê ─────────────────────────────────────────
 *
 * "Plano terapêutico feio, 'teste valor / em andamento' -- o que tá faltando
 * dele? Quero ele pronto." E antes: "vamos falar se esse paciente está
 * evoluindo ou não".
 *
 * A primeira versão lia título, status e o nome do alimento de cada meta. O
 * sistema tem nove tabelas para isto -- e a que responde "está evoluindo?" nem
 * era lida: `registros_exposicao`, cada vez que a criança foi exposta a um
 * alimento e até onde subiu na Escalada do Comer. Sem ela, a tela listava metas
 * sem dizer se alguma andou.
 *
 * ── `select('*')`, de propósito ─────────────────────────────────────────────
 * Não há arquivo de esquema neste repositório para conferir nome de coluna, e
 * uma coluna errada numa lista de `select` derruba a LEITURA INTEIRA -- foi o
 * que aconteceu três vezes nesta mesma semana. Com `*` o pior caso é um campo
 * vir vazio. É também como o sistema lê estas quatro tabelas.
 *
 * Os nomes dos campos abaixo vêm das interfaces de `PlanejamentoTerapeutico.tsx`,
 * que é o que o sistema usa em produção. */

export type AtividadeDoObjetivo = {
  nome: string
  ambiente: string | null
  frequencia: string | null
  responsavel: string | null
  orientacoes: string | null
  /* O que precisa ter em mãos -- "a lista de compra do plano terapêutico da
     paciente", pedida no relato de 09/09. Texto livre, como ela escreveu. */
  recursos: string | null
}

export type ObjetivoTerapeutico = {
  id: number
  alimentoId: number | null
  /* O alimento da meta. Nulo quando o cadastro não tem o vínculo -- e aí a tela
     diz "sem alimento", em vez de uma linha em branco que parece defeito. */
  alimento: string | null
  status: string
  /* O que ela quer que aconteça -- "aceitar a banana amassada". Era a coisa
     mais importante de cada meta, e a primeira versão não lia. */
  objetivo: string | null
  criterio: string | null
  prazoDias: number | null
  atividades: AtividadeDoObjetivo[]
  /* As exposições DESTE alimento, da mais antiga para a mais nova. É daqui que
     sai "está evoluindo?". */
  exposicoes: Exposicao[]
}

export type PlanoTerapeuticoDaPaciente = {
  id: number
  titulo: string
  area: string | null
  periodo: string | null
  status: string
  inicio: string | null
  fim: string | null
  notas: string | null
  objetivos: ObjetivoTerapeutico[]
}

export type ResultadoTerapeutico =
  | { tipo: 'ok'; plano: PlanoTerapeuticoDaPaciente | null }
  | { tipo: 'erro'; mensagem: string }

/* Teto de exposições lidas. Uma criança em terapia há um ano pode ter centenas;
   a tendência olha a série inteira de CADA alimento, e 300 cobre um
   acompanhamento longo sem baixar tudo a cada abertura. */
const TETO_DE_EXPOSICOES = 300

const texto = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null

const numero = (v: unknown): number | null => {
  const n = Number(v)
  return v !== null && v !== undefined && v !== '' && Number.isFinite(n) ? n : null
}

const verdade = (v: unknown) => v === true

export async function planoTerapeuticoDaPaciente(
  pacienteId: number,
): Promise<ResultadoTerapeutico> {
  const { data, error } = await supabase
    .from('planos_terapeuticos')
    .select('*')
    /* O mais recente, e não só o ativo: um plano encerrado no mês passado
       ainda é o que ela quer ver quando pergunta "o que a gente estava fazendo
       com essa criança?". Esconder o encerrado deixaria a tela vazia para quem
       tem histórico. */
    .eq('paciente_id', pacienteId)
    .order('data_inicio', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)

  if (error) {
    return { tipo: 'erro', mensagem: falha('Não consegui abrir o plano terapêutico.', error) }
  }

  const p = (data ?? [])[0] as Record<string, unknown> | undefined
  if (!p) return { tipo: 'ok', plano: null }
  const planoId = Number(p.id)

  /* Metas e exposições em paralelo: são independentes, e esperar uma para
     começar a outra dobraria a espera de uma tela que ela abre com a criança
     na frente. */
  const [objetivosR, exposicoesR] = await Promise.all([
    supabase
      .from('objetivos_terapeuticos')
      .select('*, alimentos_base(nome)')
      .eq('plano_id', planoId)
      .order('id'),
    supabase
      .from('registros_exposicao')
      .select('*')
      /* Por PACIENTE, e não por plano: é como o sistema lê. Uma exposição
         registrada antes de o plano atual existir ainda conta a história
         daquele alimento com aquela criança. */
      .eq('paciente_id', pacienteId)
      .order('data_exposicao', { ascending: false })
      .limit(TETO_DE_EXPOSICOES),
  ])

  if (objetivosR.error) {
    return { tipo: 'erro', mensagem: falha('Não consegui ler as metas do plano.', objetivosR.error) }
  }
  /* Exposição que não carrega não derruba o plano: as metas continuam valendo
     sem a evolução, e a tela diz que não há registro. */
  if (exposicoesR.error) falha('Não consegui ler as exposições.', exposicoesR.error)

  const linhas = (objetivosR.data ?? []) as Record<string, unknown>[]
  const ids = linhas.map(o => Number(o.id)).filter(Number.isFinite)

  const atividadesR = ids.length
    ? await supabase
        .from('atividades_terapeuticas')
        .select('*')
        .in('objetivo_id', ids)
        .order('created_at', { ascending: true })
    : { data: [], error: null }
  if (atividadesR.error) falha('Não consegui ler as atividades do plano.', atividadesR.error)

  const atividadesPorObjetivo = new Map<number, AtividadeDoObjetivo[]>()
  for (const a of (atividadesR.data ?? []) as Record<string, unknown>[]) {
    const oid = Number(a.objetivo_id)
    if (!Number.isFinite(oid)) continue
    const lista = atividadesPorObjetivo.get(oid) ?? []
    lista.push({
      nome: texto(a.nome_atividade) ?? 'Atividade',
      ambiente: texto(a.ambiente),
      frequencia: texto(a.frequencia),
      responsavel: texto(a.responsavel),
      orientacoes: texto(a.orientacoes),
      recursos: texto(a.recursos_necessarios),
    })
    atividadesPorObjetivo.set(oid, lista)
  }

  /* As exposições agrupadas pelo ALIMENTO, que é a chave que liga uma
     exposição a uma meta. Viram a série da mais antiga para a mais nova. */
  const exposicoesPorAlimento = new Map<number, Exposicao[]>()
  for (const e of (exposicoesR.data ?? []) as Record<string, unknown>[]) {
    const aid = numero(e.alimento_base_id)
    if (aid === null) continue
    const passos = Array.isArray(e.passos_alcancados)
      ? (e.passos_alcancados as unknown[]).map(Number).filter(Number.isFinite)
      : null
    const lista = exposicoesPorAlimento.get(aid) ?? []
    lista.push({
      data: String(e.data_exposicao ?? ''),
      aceitacao: texto(e.aceitacao),
      passos,
      reacao: texto(e.reacao_emocional),
      visualizou: verdade(e.visualizou),
      tocou: verdade(e.tocou),
      cheirou: verdade(e.cheirou),
      levouABoca: verdade(e.levou_a_boca),
      mordeu: verdade(e.mordeu),
      mastigou: verdade(e.mastigou),
      engoliu: verdade(e.engoliu),
    })
    exposicoesPorAlimento.set(aid, lista)
  }
  for (const lista of exposicoesPorAlimento.values()) {
    lista.sort((a, b) => a.data.localeCompare(b.data))
  }

  return {
    tipo: 'ok',
    plano: {
      id: planoId,
      titulo: nomeDoPlano(p.titulo, p.area_trabalhada),
      area: texto(p.area_trabalhada),
      periodo: texto(p.periodo),
      status: texto(p.status) ?? '',
      inicio: texto(p.data_inicio),
      fim: texto(p.data_fim),
      notas: texto(p.notas_nutricionista),
      objetivos: linhas.map(o => {
        const base = o.alimentos_base as { nome?: string } | { nome?: string }[] | null
        const nome = (Array.isArray(base) ? base[0]?.nome : base?.nome) ?? null
        const alimentoId = numero(o.alimento_base_id)
        return {
          id: Number(o.id),
          alimentoId,
          alimento: nome?.trim() || null,
          status: texto(o.status) ?? '',
          objetivo: texto(o.objetivo_principal),
          criterio: texto(o.criterio_evolucao),
          prazoDias: numero(o.prazo_dias),
          atividades: atividadesPorObjetivo.get(Number(o.id)) ?? [],
          exposicoes: alimentoId !== null ? exposicoesPorAlimento.get(alimentoId) ?? [] : [],
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
