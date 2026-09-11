import { supabase } from './supabase'
import { falha, mensagemDoBanco } from './erros'
import { nomeDoPlano, type Exposicao } from './escaladaDoComer'
import {
  anamneseLida,
  dataDaAnamnese,
  estadoDoResumo,
  exameLido,
  pedidoDoResumo,
  rotuloDaFormula,
  type EstadoDoResumo,
  type ExameLido,
  type PedidoDoResumo,
  type SecaoLida,
} from './leituraDoProntuario'

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

/* ════════════════════════ O PRONTUÁRIO, SÓ PARA LER ════════════════════════
 *
 * "A ficha completa: anamnese, exames, cálculo energético, medidas, evolução."
 *
 * Tudo aqui é leitura direta de tabela, pelo mesmo motivo das consultas acima:
 * as políticas já recortam pela carteira dela. Quem transforma o que o sistema
 * gravou em algo legível é `leituraDoProntuario.ts`, que o teste exercita.
 *
 * Os nomes das colunas foram conferidos em `supabase/esquema/estrutura.sql` do
 * sistema em 11/09, e as listas de `select` são as mesmas que as telas do
 * sistema usam. Onde a tabela é larga e só alguns campos importam, `*`. */

export type AnamneseDaPaciente = {
  id: number
  titulo: string
  /* ISO. Nulo só se nem a data escrita nem a de gravação servirem. */
  quando: string | null
  secoes: SecaoLida[]
  importado: boolean
}

export type ResultadoAnamneses =
  | { tipo: 'ok'; anamneses: AnamneseDaPaciente[] }
  | { tipo: 'erro'; mensagem: string }

export async function anamnesesDaPaciente(pacienteId: number): Promise<ResultadoAnamneses> {
  const { data, error } = await supabase
    .from('anamnese_preenchidas')
    .select('id, titulo, template_nome, data_anamnese, created_at, respostas')
    .eq('paciente_id', pacienteId)
    /* Pela GRAVAÇÃO, e não por `data_anamnese`: aquela coluna é texto
       dd/mm/aaaa, e ordenar texto assim põe "04/08" antes de "25/07". A ordem
       certa, pela data de verdade, é refeita logo abaixo. */
    .order('created_at', { ascending: false })
    .limit(12)
  if (error) {
    return { tipo: 'erro', mensagem: falha('Não consegui abrir a anamnese agora.', error) }
  }
  const anamneses = ((data ?? []) as Record<string, unknown>[]).map(a => {
    const lida = anamneseLida(a.respostas)
    const titulo =
      (typeof a.titulo === 'string' && a.titulo.trim()) ||
      (typeof a.template_nome === 'string' && a.template_nome.trim()) ||
      'Anamnese'
    return {
      id: Number(a.id),
      titulo,
      quando: dataDaAnamnese(a.data_anamnese, a.created_at),
      secoes: lida.secoes,
      importado: lida.importado,
    }
  })
  /* A data escrita manda: uma anamnese de papel digitada hoje é de março. */
  anamneses.sort((x, y) => (y.quando ?? '').localeCompare(x.quando ?? ''))
  return { tipo: 'ok', anamneses }
}

export type ExameDaPaciente = {
  id: number
  nome: string
  /* A data da COLETA. É obrigatória no banco desde 31/08. */
  quando: string | null
  observacoes: string | null
  /* Nulo: o exame foi enviado e ainda não foi lido. */
  leitura: ExameLido | null
}

export type ResultadoExames =
  | { tipo: 'ok'; exames: ExameDaPaciente[] }
  | { tipo: 'erro'; mensagem: string }

export async function examesDaPaciente(pacienteId: number): Promise<ResultadoExames> {
  const { data, error } = await supabase
    .from('exames_laboratoriais')
    /* O mesmo `embed` do sistema (`SELECT_ANALISE`, em `analiseExame.ts`). A
       política de `analises_de_exame` devolve só a análise DELA -- duas
       profissionais podem ler o mesmo exame, e cada uma vê a sua. */
    .select('id, nome, data_exame, created_at, observacoes, analises_de_exame ( texto, atualizada_em )')
    .eq('paciente_id', pacienteId)
    .order('data_exame', { ascending: false })
    .limit(20)
  if (error) {
    return { tipo: 'erro', mensagem: falha('Não consegui abrir os exames agora.', error) }
  }
  return {
    tipo: 'ok',
    exames: ((data ?? []) as Record<string, unknown>[]).map(e => {
      const bruto = e.analises_de_exame
      const analise = (Array.isArray(bruto) ? bruto[0] : bruto) as { texto?: unknown } | null | undefined
      return {
        id: Number(e.id),
        nome: (typeof e.nome === 'string' && e.nome.trim()) || 'Exame',
        quando:
          typeof e.data_exame === 'string'
            ? e.data_exame.slice(0, 10)
            : typeof e.created_at === 'string'
              ? e.created_at.slice(0, 10)
              : null,
        observacoes: typeof e.observacoes === 'string' ? e.observacoes.trim() || null : null,
        leitura: exameLido(analise?.texto),
      }
    }),
  }
}

export type CalculoEnergeticoDaPaciente = {
  id: number
  quando: string
  formula: string
  tmb: number | null
  /* O gasto total. É o número que ela usa para montar o plano. */
  get: number | null
  peso: number | null
  altura: number | null
  idade: number | null
  fatorAtividade: number | null
  fatorLesao: number | null
  adicionalGestante: number | null
  pesoAlvo: number | null
  proteinaGkg: number | null
  carboPct: number | null
  observacoes: string | null
}

export type ResultadoCalculos =
  | { tipo: 'ok'; calculos: CalculoEnergeticoDaPaciente[] }
  | { tipo: 'erro'; mensagem: string }

/* O mais novo é o que vale: a tabela não tem marca de "ativo", e todo leitor
   do sistema pega o último por `created_at`. Os anteriores vêm junto, porque
   "o gasto subiu de 1.800 para 2.100" é informação. */
export async function calculosDaPaciente(pacienteId: number): Promise<ResultadoCalculos> {
  const { data, error } = await supabase
    .from('calculo_energetico')
    .select('*')
    .eq('paciente_id', pacienteId)
    .order('created_at', { ascending: false })
    .limit(6)
  if (error) {
    return { tipo: 'erro', mensagem: falha('Não consegui abrir o cálculo energético agora.', error) }
  }
  const n = (v: unknown): number | null => {
    const x = typeof v === 'string' ? Number(v.replace(',', '.')) : typeof v === 'number' ? v : NaN
    return Number.isFinite(x) ? x : null
  }
  return {
    tipo: 'ok',
    calculos: ((data ?? []) as Record<string, unknown>[]).map(c => ({
      id: Number(c.id),
      quando: String(c.created_at ?? '').slice(0, 10),
      formula: rotuloDaFormula(c.formula),
      tmb: n(c.tmb),
      get: n(c.get_total),
      peso: n(c.peso),
      altura: n(c.altura),
      idade: n(c.idade),
      fatorAtividade: n(c.fator_atividade),
      fatorLesao: n(c.fator_lesao),
      adicionalGestante: n(c.adicional_gestante),
      pesoAlvo: n(c.peso_alvo),
      proteinaGkg: n(c.proteina_gkg),
      carboPct: n(c.carbo_pct),
      observacoes: typeof c.observacoes === 'string' ? c.observacoes.trim() || null : null,
    })),
  }
}

/* ════════════════════════ O RESUMO DA AURORA ════════════════════════
 *
 * O MESMO do sistema -- ver `resumoDaAurora` em `leituraDoProntuario.ts`. A
 * função `aurora-monitor` responde na hora e lê em segundo plano; quem acompanha
 * é `aurora_estado`, perguntado de tempos em tempos pela tela. O teto de duas
 * leituras por paciente por dia é do banco, e vale para os dois lados juntos:
 * pedir no celular gasta a mesma cota que pedir no computador. */

export async function estadoDoResumoDaPaciente(
  pacienteId: number,
): Promise<{ tipo: 'ok'; estado: EstadoDoResumo } | { tipo: 'erro'; mensagem: string }> {
  try {
    const { data, error } = await supabase.rpc('aurora_estado', { p_paciente_id: pacienteId })
    if (error) return { tipo: 'erro', mensagem: falha('Não consegui ler o resumo da Aurora agora.', error) }
    return { tipo: 'ok', estado: estadoDoResumo(data) }
  } catch (e) {
    return { tipo: 'erro', mensagem: falha('Não consegui ler o resumo da Aurora agora.', e) }
  }
}

const NAO_COMECOU = 'A Aurora não conseguiu começar o resumo agora. Tente de novo em instantes.'

export async function pedirResumoDaPaciente(pacienteId: number): Promise<PedidoDoResumo> {
  try {
    const { data, error } = await supabase.functions.invoke('aurora-monitor', {
      body: { paciente_id: pacienteId },
    })
    if (error) {
      /* Fora do 2xx o corpo vem em `error.context`. É lá que está a frase do
         teste grátis, escrita pelo sistema para ser lida. */
      const ctx = (error as { context?: Response }).context
      let corpo: unknown = null
      if (ctx && typeof ctx.json === 'function') {
        try {
          corpo = await ctx.json()
        } catch {
          corpo = null
        }
      }
      falha('A Aurora não conseguiu começar o resumo.', error)
      const lido = pedidoDoResumo(corpo)
      /* A frase do sistema passa só se tiver cara de frase para gente --
         `mensagemDoBanco` barra o "unauthorized" cru. Armadilha 12. */
      if (lido.tipo === 'recusado') {
        return { tipo: 'recusado', mensagem: mensagemDoBanco({ message: lido.mensagem }, NAO_COMECOU) }
      }
      return { tipo: 'recusado', mensagem: NAO_COMECOU }
    }
    return pedidoDoResumo(data)
  } catch (e) {
    return { tipo: 'recusado', mensagem: falha('Sem conexão para pedir o resumo agora.', e) }
  }
}
