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
  /* ──────────────────── O SINAL DA LINHA ────────────────────
   * A lista mostrava só o nome, e uma lista de nomes náo ajuda a decidir nada:
   * ela abre esta tela justamente para saber DE QUEM cuidar primeiro, e a
   * resposta não estava em lugar nenhum dela.
   *
   * Tudo aqui é opcional de verdade, e por dois motivos diferentes. A leitura
   * é SEPARADA da principal e pode falhar sozinha -- e quando falha, a lista
   * continua aparecendo com os nomes, que é o que não pode faltar. E mesmo
   * dando certo, paciente novo não tem consulta nem peso: `null` aqui é "não
   * sei", e a tela cala em vez de inventar. Item 6 do AGENTS.md, zero é
   * mentira. */
  proxima: string | null
  ultima: string | null
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

  const pacientes: PacienteDaLista[] = linhas.slice(0, POR_PAGINA).map(l => ({
    id: l.id,
    nome: l.nome?.trim() || 'Sem nome',
    celular: l.celular?.trim() || null,
    nascimento: l.data_nascimento,
    status: l.status ?? 'ativo',
    proxima: null,
    ultima: null,
  }))

  return { tipo: 'ok', temMais, pacientes: await comSinais(pacientes) }
}

/* ──────────────────── QUANDO CADA UM VOLTA, E QUANDO VEIO ────────────────────
 *
 * Uma consulta à base para a página INTEIRA, e não uma por paciente: quarenta
 * linhas dariam quarenta idas, e este projeto já teve engasgo de vários
 * segundos no PostgREST -- doze em fila fazem a tela parecer travada.
 *
 * ──── Falhar aqui não pode derrubar a lista ────
 * É o item 11 do AGENTS.md com um caso concreto: a lista de pacientes é a
 * tela, e o sinal é enfeite útil. Sem sinal, ela ainda acha quem procura pelo
 * nome; sem lista, a tela não serve para nada. Então o erro é engolido no
 * console e cada um volta sem sinal.
 *
 * ──── Por que NÃO entra o peso ────
 * A maquete que ele aprovou mostrava "·3,4 kg" em cada linha. O peso mora em
 * `antropometria_adulto`, pendurado em `avaliacoes` -- são duas tabelas mais e
 * uma comparação entre a última avaliação e a anterior, POR paciente. Numa
 * leitura só para quarenta pessoas isso não sai, e por linha voltaria a ser
 * quarenta idas.
 *
 * Fica de fora e está escrito aqui para não parecer esquecimento: o que dá
 * para fazer honestamente é a data, e a data já responde a pergunta que ela
 * faz ("quem está sem retorno?"). Um número errado seria pior que nenhum. */
async function comSinais(pacientes: PacienteDaLista[]): Promise<PacienteDaLista[]> {
  const ids = pacientes.map(p => p.id)
  if (ids.length === 0) return pacientes

  const agora = new Date().toISOString()

  const [futuras, passadas] = await Promise.all([
    supabase
      .from('consultas')
      .select('paciente_id, data_hora')
      .in('paciente_id', ids)
      .gte('data_hora', agora)
      .neq('status', 'cancelada')
      .order('data_hora', { ascending: true }),
    supabase
      .from('consultas')
      .select('paciente_id, data_hora')
      .in('paciente_id', ids)
      .lt('data_hora', agora)
      .eq('status', 'realizada')
      /* Decrescente: a última realizada é a mais RECENTE que passou, e a
         primeira que aparecer por paciente é ela. */
      .order('data_hora', { ascending: false }),
  ])

  if (futuras.error) falha('Não consegui ler os próximos retornos.', futuras.error)
  if (passadas.error) falha('Não consegui ler as últimas consultas.', passadas.error)

  /* A PRIMEIRA de cada paciente ganha, e as seguintes são ignoradas -- é o que
     a ordem acima garante. `has` e não `??=` porque um valor nulo gravado de
     propósito deve continuar valendo. */
  const primeiroPorPaciente = (linhas: { paciente_id: number | null; data_hora: string | null }[]) => {
    const mapa = new Map<number, string>()
    for (const l of linhas) {
      if (l.paciente_id == null || !l.data_hora) continue
      if (!mapa.has(l.paciente_id)) mapa.set(l.paciente_id, l.data_hora)
    }
    return mapa
  }

  const proximaDe = primeiroPorPaciente((futuras.data ?? []) as never[])
  const ultimaDe = primeiroPorPaciente((passadas.data ?? []) as never[])

  return pacientes.map(p => ({
    ...p,
    proxima: proximaDe.get(p.id) ?? null,
    ultima: ultimaDe.get(p.id) ?? null,
  }))
}

/* ──────────────────── A FICHA ────────────────────
 * O que ela precisa saber com a pessoa na frente, e nada de prontuário: exame,
 * antropometria e anamnese são entrada de muitos números, onde errar um dígito
 * muda a conduta, e continuam no computador. */
/* Uma medida no tempo. Tudo pode ser nulo: a base não tem todo campo de toda
   avaliação, e zero no lugar do desconhecido soma como se fosse verdade --
   item 6. A tela mostra "·" onde não há número. */
export type Medida = {
  quando: string
  peso: number | null
  altura: number | null
  imc: number | null
  gordura: number | null
  cintura: number | null
}

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

  /* ──────────────────── O ACOMPANHAMENTO ────────────────────
   * Ela pediu o máximo de informação, e o critério do que entra é este: o que
   * ela olharia com a pessoa na frente. Tudo aqui é LEITURA -- digitar
   * antropometria e anamnese continua no computador, porque são dezenas de
   * campos onde um dígito errado muda a conduta. */
  medidas: Medida[]
  planoTerapeutico: { titulo: string; status: string } | null
  ultimaAnamnese: string | null
  /* O que ela escreveu no fim da última consulta. É o campo que responde "onde
     a gente parou?", e é o motivo de a maioria das fichas ser aberta. */
  notasDaUltima: string | null
  /* Quantas consultas realizadas desde sempre. Um número, e não a lista: diz o
     tamanho da relação sem ocupar a tela. */
  quantasConsultas: number
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
  const [
    base,
    vinculo,
    passada,
    futura,
    plano,
    contas,
    antropometria,
    terapeutico,
    anamnese,
    realizadas,
  ] = await Promise.all([
    supabase
      .from('pacientes')
      .select('id, nome, celular, data_nascimento, email, genero, status')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('app_contas').select('id').eq('paciente_id', id).limit(1),
    supabase
      .from('consultas')
      .select('data_hora, notas_atendimento')
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

    /* As duas últimas medidas, e não só a mais nova: um peso sozinho não diz
       nada. "78,4 kg" é um número; "78,4, era 81,0" é a conversa que ela vai
       ter. Três para a segunda sobreviver a uma avaliação sem peso. */
    supabase
      .from('antropometria_avaliacoes')
      .select('data_avaliacao, antropometria_adulto(peso, altura, imc, percentual_gordura, circ_cintura)')
      .eq('paciente_id', id)
      .order('data_avaliacao', { ascending: false })
      .limit(3),

    supabase
      .from('planos_terapeuticos')
      .select('titulo, status, created_at')
      .eq('paciente_id', id)
      .order('created_at', { ascending: false })
      .limit(1),

    supabase
      .from('anamnese_preenchidas')
      .select('data_anamnese, created_at')
      .eq('paciente_id', id)
      .order('created_at', { ascending: false })
      .limit(1),

    /* `head: true` traz só a contagem, sem as linhas: são dezenas de consultas
       e a tela quer UM número. */
    supabase
      .from('consultas')
      .select('id', { count: 'exact', head: true })
      .eq('paciente_id', id)
      .eq('status', 'realizada'),
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

  /* Cada peça acessória que falha vira AUSÊNCIA, e não erro na tela: a ficha
     sem o plano ainda é útil, e trocar tudo por uma mensagem seria perder o
     nome e o telefone por causa de um plano que não carregou. Item 11. */
  const pendentes = (contas.data ?? []) as { valor: number | null }[]
  const emAberto = pendentes.reduce((s, c) => {
    const n = Number(c.valor)
    return s + (Number.isFinite(n) ? n : 0)
  }, 0)

  const primeira = <T,>(v: T[] | null | undefined): T | null => (v && v.length > 0 ? v[0] : null)

  /* ──────────────────── AS MEDIDAS ────────────────────
   * A leitura é aninhada (`antropometria_adulto` é tabela filha), e é a única
   * aqui que é -- porque a avaliação sem as medidas não serve para nada, e duas
   * leituras casadas por id dariam o mesmo resultado por mais código. Se o
   * PostgREST não enxergar a relação, o bloco inteiro some da tela; o resto da
   * ficha continua. */
  const numeroOuNulo = (v: unknown): number | null => {
    const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v)
    return Number.isFinite(n) ? n : null
  }

  const medidas: Medida[] = ((antropometria.data ?? []) as Record<string, unknown>[])
    .map(a => {
      const filha = Array.isArray(a.antropometria_adulto)
        ? (a.antropometria_adulto[0] as Record<string, unknown> | undefined)
        : (a.antropometria_adulto as Record<string, unknown> | undefined)
      return {
        quando: String(a.data_avaliacao ?? ''),
        peso: numeroOuNulo(filha?.peso),
        altura: numeroOuNulo(filha?.altura),
        imc: numeroOuNulo(filha?.imc),
        gordura: numeroOuNulo(filha?.percentual_gordura),
        cintura: numeroOuNulo(filha?.circ_cintura),
      }
    })
    /* Avaliação sem nenhum número não entra: seria uma coluna de traços, que se
       lê como app quebrado em vez de "não foi medido". */
    .filter(m => m.peso !== null || m.imc !== null || m.cintura !== null)

  const pt = primeira(terapeutico.data as { titulo: string | null; status: string | null }[] | null)
  const am = primeira(anamnese.data as { data_anamnese: string | null; created_at: string }[] | null)

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
      medidas,
      planoTerapeutico:
        pt && pt.titulo?.trim()
          ? { titulo: pt.titulo.trim(), status: pt.status?.trim() || 'sem status' }
          : null,
      ultimaAnamnese: am?.data_anamnese ?? am?.created_at?.slice(0, 10) ?? null,
      notasDaUltima:
        primeira(passada.data as { notas_atendimento: string | null }[] | null)
          ?.notas_atendimento?.trim() || null,
      quantasConsultas: realizadas.count ?? 0,
    },
  }
}

/* A idade da ficha vem de `datas.ts`, e é a mesma que a tela de gasto
   energético usa. Reexportada porque a tela desta ficha importa daqui. */
export { idadeDe } from './datas'
