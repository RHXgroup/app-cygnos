import { supabase } from './supabase'
import { falha } from './erros'

/* A carteira dela, lida do banco.
 *
 * ──────────────────── Sem função nova no servidor ────────────────────
 * A política de `pacientes` já é `nutricionista_id = get_nutricionista_id()`
 * com a permissão do módulo. Ou seja: o banco só devolve os DELA, e a regra
 * continua valendo mesmo que esta lib esqueça um filtro. É o oposto do app do
 * paciente, onde cada leitura passa por uma função `app_*_do_paciente`.
 *
 * ──────────────────── A busca é no SERVIDOR, e não filtro sobre uma lista baixada ────────────────────
 * Uma carteira grande tem centenas de pessoas. Baixar tudo para filtrar no
 * aparelho gastaria o 4G dela toda vez que a aba abrisse -- e ainda assim
 * pararia de funcionar exatamente quando começasse a importar, que é quando a
 * carteira cresce.
 *
 * ──────────────────── E a página tem teto CONHECIDO ────────────────────
 * O PostgREST corta em mil por padrão e não avisa: a lista simplesmente termina
 * no meio do alfabeto. Aqui o teto é nosso e pequeno, e a tela diz quando há
 * mais -- ver `temMais`. Ninguém precisa desconfiar de uma lista que acaba. */

export type PacienteDaLista = {
  id: number
  nome: string
  celular: string | null
  nascimento: string | null
  status: string
}

const POR_PAGINA = 40

export type ResultadoPacientes =
  | { tipo: 'ok'; pacientes: PacienteDaLista[]; temMais: boolean }
  | { tipo: 'erro'; mensagem: string }

export async function buscarPacientes(
  termo: string,
  /* Inativo também aparece quando ela procura pelo nome: quem digita o nome
     inteiro está atrás de uma pessoa específica, e esconder por status faria a
     busca "não achar" alguém que existe. Na lista sem busca, só os ativos. */
  incluirInativos = false,
): Promise<ResultadoPacientes> {
  const limpo = termo.trim()

  let q = supabase
    .from('pacientes')
    .select('id, nome, celular, data_nascimento, status')

  if (limpo) q = q.ilike('nome', '%' + limpo + '%')
  if (!limpo && !incluirInativos) q = q.eq('status', 'ativo')

  /* Desempate por id: sem uma segunda chave, dois pacientes de mesmo nome
     trocam de posição entre uma leitura e outra. Ordem instável é pior que
     ordem feia -- foi assim que a lista do site já mostrou uma pessoa duas
     vezes e outra nenhuma. */
  const { data, error } = await q
    .order('nome')
    .order('id')
    .limit(POR_PAGINA + 1)

  if (error) {
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui carregar os seus pacientes agora.', error),
    }
  }

  const linhas = (data ?? []) as {
    id: number
    nome: string | null
    celular: string | null
    data_nascimento: string | null
    status: string | null
  }[]

  /* Pedimos um a mais só para SABER se há mais, e ele não entra na lista. Sem
     isso, "40 resultados" e "40 ou mais" seriam indistinguíveis. */
  const temMais = linhas.length > POR_PAGINA

  return {
    tipo: 'ok',
    temMais,
    pacientes: linhas.slice(0, POR_PAGINA).map(l => ({
      id: l.id,
      nome: l.nome?.trim() || 'Sem nome',
      celular: l.celular?.trim() || null,
      nascimento: l.data_nascimento,
      status: l.status ?? 'ativo',
    })),
  }
}

/* ──────────────────── A FICHA ────────────────────
 * O que ela precisa saber com a pessoa na frente, e nada de prontuário: exame,
 * antropometria e anamnese são entrada de muitos números, onde errar um dígito
 * muda a conduta, e continuam no computador. */
export type FichaDoPaciente = {
  id: number
  nome: string
  celular: string | null
  nascimento: string | null
  email: string | null
  genero: string | null
  status: string
  /* Se ele usa o aplicativo. Muda a conversa: quem usa registra o que come, e
     ela pode olhar; quem não usa, não. */
  usaOApp: boolean
  ultimaConsulta: string | null
  proximaConsulta: string | null
  planoAtivo: string | null
  /* O que está em aberto no financeiro dele. */
  emAberto: number
  quantasEmAberto: number
}

export type ResultadoFicha =
  | { tipo: 'ok'; ficha: FichaDoPaciente }
  | { tipo: 'erro'; mensagem: string }

export async function fichaDoPaciente(id: number): Promise<ResultadoFicha> {
  const agora = new Date().toISOString()

  /* Tudo junto: são tabelas diferentes, e esperar uma para começar a outra
     multiplicaria a espera de uma tela que ela abre com a paciente na frente.
     E nenhuma delas é join: quando o PostgREST não enxerga a relação o erro não
     é "faltou o campo", é a consulta inteira falhando -- e aí a ficha nasce em
     branco por causa de um dado acessório. */
  const [base, vinculo, passada, futura, plano, contas] = await Promise.all([
    supabase
      .from('pacientes')
      .select('id, nome, celular, data_nascimento, email, genero, status')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('app_contas').select('id').eq('paciente_id', id).limit(1),
    supabase
      .from('consultas')
      .select('data_hora')
      .eq('paciente_id', id)
      .eq('status', 'realizada')
      .order('data_hora', { ascending: false })
      .limit(1),
    supabase
      .from('consultas')
      .select('data_hora')
      .eq('paciente_id', id)
      .gte('data_hora', agora)
      .neq('status', 'cancelada')
      .order('data_hora', { ascending: true })
      .limit(1),
    supabase
      .from('planos_alimentares')
      .select('titulo, created_at')
      .eq('paciente_id', id)
      .eq('ativo', true)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('contas_receber')
      .select('valor')
      .eq('paciente_id', id)
      .eq('status', 'pendente'),
  ])

  if (base.error || !base.data) {
    return {
      tipo: 'erro',
      mensagem: base.error
        ? falha('Não consegui abrir esta ficha agora.', base.error)
        : 'Não encontrei este paciente.',
    }
  }

  const p = base.data as {
    id: number
    nome: string | null
    celular: string | null
    data_nascimento: string | null
    email: string | null
    genero: string | null
    status: string | null
  }

  /* Cada peça acessória que falha vira AUS~EC~NCIA, e não erro na tela: a ficha
     sem o plano ainda é útil, e trocar tudo por uma mensagem seria perder o
     nome e o telefone por causa de um plano que não carregou. Item 11. */
  const pendentes = (contas.data ?? []) as { valor: number | null }[]
  const emAberto = pendentes.reduce((s, c) => {
    const n = Number(c.valor)
    return s + (Number.isFinite(n) ? n : 0)
  }, 0)

  const primeira = <T,>(v: T[] | null | undefined): T | null => (v && v.length > 0 ? v[0] : null)

  return {
    tipo: 'ok',
    ficha: {
      id: p.id,
      nome: p.nome?.trim() || 'Sem nome',
      celular: p.celular?.trim() || null,
      nascimento: p.data_nascimento,
      email: p.email?.trim() || null,
      genero: p.genero,
      status: p.status ?? 'ativo',
      usaOApp: (vinculo.data ?? []).length > 0,
      ultimaConsulta: primeira(passada.data as { data_hora: string }[] | null)?.data_hora ?? null,
      proximaConsulta: primeira(futura.data as { data_hora: string }[] | null)?.data_hora ?? null,
      planoAtivo:
        primeira(plano.data as { titulo: string | null }[] | null)?.titulo?.trim() || null,
      emAberto,
      quantasEmAberto: pendentes.length,
    },
  }
}

/* A idade, para o cabeçalho da ficha.
 *
 * Nulo quando não dá para saber, e nunca zero: um bebê de meses e uma data de
 * nascimento em branco são coisas diferentes, e "0 anos" mistura as duas. */
export function idadeDe(nascimento: string | null, hoje: Date = new Date()): number | null {
  if (!nascimento || !/^\d{4}-\d{2}-\d{2}$/.test(nascimento)) return null
  const ms = Date.parse(nascimento + 'T00:00:00')
  if (!Number.isFinite(ms)) return null

  const nasceu = new Date(ms)
  let anos = hoje.getFullYear() - nasceu.getFullYear()
  /* O ajuste do aniversário que ainda não veio este ano. Sem ele, quem faz
     anos em dezembro aparece um ano mais velho durante onze meses. */
  const mes = hoje.getMonth() - nasceu.getMonth()
  if (mes < 0 || (mes === 0 && hoje.getDate() < nasceu.getDate())) anos--

  return anos >= 0 && anos < 130 ? anos : null
}
