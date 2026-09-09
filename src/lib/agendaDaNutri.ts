import { supabase } from './supabase'
import { falha } from './erros'
import { diaLocalDe } from './calendarioDaAgenda'
import type { ConsultaDoDia } from './diaDaNutri'
import { EXPEDIENTE_PADRAO, type Expediente } from './buracosDaAgenda'

/* A agenda dela, lida do banco. O que DECIDE mora em `diaDaNutri`.
 *
 * ── Por que não precisa de função nova no servidor ────────────────────────
 * A política de `consultas` já é exatamente o que este app precisa:
 *
 *     nutricionista_id = get_nutricionista_id()  AND  func_pode('{agenda…}')
 *
 * Ou seja: o banco só devolve as consultas DELA, e só se a permissão de agenda
 * estiver ligada na conta. A regra não está nesta tela — está no servidor, e
 * continua valendo mesmo que alguém escreva a consulta errada aqui.
 *
 * Isso é o oposto do que acontece com o paciente, onde cada leitura passa por
 * uma função `app_*_do_paciente`. Aqui a tabela já sabe se defender, então uma
 * função a mais só acrescentaria um lugar para divergir.
 *
 * ── Duas consultas, e não um join ─────────────────────────────────────────
 * O nome do paciente mora em `pacientes`, que tem a própria política. Dava para
 * pedir aninhado numa consulta só, mas isso depende de o PostgREST enxergar a
 * relação — e quando ele não enxerga, o erro não é "faltou o nome": é a
 * consulta inteira falhando, e a agenda em branco.
 *
 * Duas leituras sempre funcionam, e a segunda só busca os ids que apareceram.
 * Sem nome, a consulta ainda aparece com o horário, que é a informação que não
 * pode faltar.
 *
 * ── Falha aqui não derruba a tela ─────────────────────────────────────────
 * Item 11 do AGENTS.md. Sem sinal, devolve lista vazia e a mensagem sobe pela
 * tela, com o gesto de puxar para tentar de novo. */

/* O intervalo de um dia no fuso do APARELHO.
 *
 * `data_hora` é `timestamptz`, então o banco compara instantes e o fuso da
 * consulta não interfere. O que precisa ser local é o RECORTE: "hoje" para ela
 * é da meia-noite dela até a meia-noite dela, e não UTC. */
function limitesDoDia(dia: Date): { inicio: string; fim: string } {
  const inicio = new Date(dia)
  inicio.setHours(0, 0, 0, 0)
  const fim = new Date(inicio)
  fim.setDate(fim.getDate() + 1)
  return { inicio: inicio.toISOString(), fim: fim.toISOString() }
}

/* O intervalo de um PERÍODO, para a vista de semana e de mês. Mesma conta, com
   os dois extremos abertos: a meia-noite local do primeiro dia até a meia-noite
   local do dia seguinte ao último. */
function limitesDoPeriodo(de: Date, ate: Date): { inicio: string; fim: string } {
  const inicio = new Date(de)
  inicio.setHours(0, 0, 0, 0)
  const fim = new Date(ate)
  fim.setHours(0, 0, 0, 0)
  fim.setDate(fim.getDate() + 1)
  return { inicio: inicio.toISOString(), fim: fim.toISOString() }
}

type LinhaConsulta = {
  id: number
  data_hora: string
  duracao: number | null
  status: string | null
  tipo: string | null
  paciente_id: number | null
  nome_avulso: string | null
  encaixe: boolean | null
}

export type ResultadoAgenda =
  | { tipo: 'ok'; consultas: ConsultaDoDia[] }
  | { tipo: 'erro'; mensagem: string }

export async function consultasDoDia(dia: Date): Promise<ResultadoAgenda> {
  const { inicio, fim } = limitesDoDia(dia)
  return ler(inicio, fim)
}

/* A agenda de um período inteiro, para a semana e para o mês.
 *
 * ──────────────────── Um pedido só, e não um por dia ────────────────────
 * A vista de mês desenha 35 células. Trinta e cinco consultas ao banco para
 * pintar uma grade seria a tela abrindo em segundos no 4G do consultório -- e
 * cada uma delas cobrando a mesma política de RLS de novo. Um intervalo resolve.
 *
 * ──────────────────── E o teto ────────────────────
 * Um mês cheio dela tem dezenas de consultas, não milhares. O teto existe para
 * o caso que ninguém previu -- uma agenda importada, um ano inteiro pedido por
 * engano -- não virar megabytes no aparelho dela. Quando bate no teto, o que
 * falta é o fim do período, e é por isso que a ordem é crescente: o começo, que
 * é o que ela está olhando, chega inteiro. */
const TETO_DO_PERIODO = 500

export async function consultasNoPeriodo(de: Date, ate: Date): Promise<ResultadoAgenda> {
  const { inicio, fim } = limitesDoPeriodo(de, ate)
  return ler(inicio, fim)
}

/* ──────────────────── OS PEDIDOS ESPERANDO RESPOSTA ────────────────────
 *
 * `solicitada` é o paciente pedindo horário pelo app. `diaDaNutri` exclui esse
 * status da agenda de propósito, e está certo: pedido não é compromisso, e
 * mostrá-lo entre os confirmados faria ela contar com alguém que talvez não
 * venha.
 *
 * Só que excluído dali, ele não aparecia em LUGAR NENHUM do aplicativo. São 7
 * em produção. Alguém pediu consulta e ficou esperando, e a nutricionista não
 * tinha como saber pelo celular -- é a única coisa do painel com uma pessoa do
 * outro lado aguardando.
 *
 * ──────────────────── E por que NÃO só os de hoje ────────────────────
 * Um pedido para a semana que vem chegou hoje, e é hoje que ela responde. O
 * recorte é pelo que ainda está no futuro: pedido para um horário que já passou
 * não tem mais o que responder, e mostrá-lo seria dívida que não dá para pagar. */
const TETO_DE_PEDIDOS = 20

export async function pedidosDeConsulta(): Promise<ResultadoAgenda> {
  const agora = new Date().toISOString()
  const { data, error } = await supabase
    .from('consultas')
    .select('id, data_hora, duracao, status, tipo, paciente_id, nome_avulso, encaixe')
    .eq('status', 'solicitada')
    .gte('data_hora', agora)
    .order('data_hora', { ascending: true })
    .limit(TETO_DE_PEDIDOS)

  if (error) {
    /* Falha aqui não derruba o painel: o cartão some e a agenda continua. Item
       11 -- e o erro do pedido não pode custar a leitura do dia. */
    falha('Não consegui ler os pedidos de consulta.', error)
    return { tipo: 'ok', consultas: [] }
  }

  return { tipo: 'ok', consultas: await comNomes((data ?? []) as LinhaConsulta[]) }
}

/* ──────────────────── RESPONDER AO PEDIDO ────────────────────
 *
 * Quem decide é `app_responder_pedido`, no banco, e não esta função -- porque a
 * mesma regra tem de valer para o botão daqui e para a Aurora. Aceitar um
 * pedido é marcar uma consulta, e aceitar sem conferir é marcar em cima de
 * outra: a conferência de choque é a MESMA do agendamento, e mora lá.
 *
 * A frase que volta é a que a função escreveu, e não uma montada aqui: a recusa
 * por choque precisa chegar à tela com o nome de quem já está naquele horário,
 * e quem sabe isso é quem consultou. */
export type ResultadoDaResposta = { ok: boolean; mensagem: string }

export async function responderPedido(
  consultaId: number,
  aceitar: boolean,
  motivo?: string,
): Promise<ResultadoDaResposta> {
  const { data, error } = await supabase.rpc('app_responder_pedido', {
    p_consulta_id: consultaId,
    p_aceitar: aceitar,
    p_motivo: motivo ?? null,
  })

  if (error) {
    return {
      ok: false,
      mensagem: falha('Não consegui responder agora. Verifique a conexão.', error),
    }
  }

  const r = data as { ok?: boolean; mensagem?: string } | null
  /* Resposta vazia é tratada como FALHA, e não como sucesso silencioso: depois
     de ela tocar em Aceitar, "não sei o que aconteceu" é informação, e um visto
     verde sem base seria a pior saída. */
  return { ok: r?.ok === true, mensagem: r?.mensagem ?? 'Não consegui responder agora.' }
}

/* ──────────────────── REMARCAR E CANCELAR ────────────────────
 *
 * As duas gravam pelo banco, e não daqui, pelo mesmo motivo de `responderPedido`:
 * a regra tem de valer para o botão desta tela E para a Aurora. Um `update` de
 * `status` escrito aqui seria o TERCEIRO caminho de cancelar consulta -- e a
 * história dos outros dois está escrita em `financeiroDaConsulta.ts`, no site:
 * havia um botão na agenda e outro na ficha, e só o da agenda desfazia o
 * financeiro. O da ficha gravava o status e ia embora, e "o título continuava
 * vivo, e o paciente seguia devendo por uma consulta que não houve".
 *
 * Então cancelar aqui é chamar `app_cancelar_consulta`, que faz as duas metades.
 *
 * ──── O que a função RECUSA, e por que isso é bom ────
 * Parcela já paga, série inteira e encerrar mensalidade continuam no
 * computador. Não é limitação por preguica: as três precisam de uma PERGUNTA
 * antes ("estorno o que já foi pago?", "só esta ou as próximas?") e uma
 * pergunta respondida no meio de um corredor, entre duas consultas, é como se
 * estorna dinheiro sem querer.
 *
 * A frase que volta é a do BANCO, sempre -- inclusive na recusa. É ela que diz
 * QUEM ocupa o horário, ou que há pagamento, ou que a série continua marcada.
 * Traduzir aqui seria escrever de novo, com menos informação. */

export async function remarcarConsulta(
  consultaId: number,
  novoInstante: Date,
  duracao?: number,
): Promise<ResultadoDaResposta> {
  /* `toISOString()` leva o fuso junto (`...Z`), e é isso que evita o defeito que
     já custou três horas numa consulta gravada: texto sem fuso numa coluna
     `timestamptz` é lido como UTC. Aqui o `Date` é montado no aparelho, no
     relógio dela, e sai daqui já carimbado. */
  const { data, error } = await supabase.rpc('app_remarcar_consulta', {
    p_consulta_id: consultaId,
    p_nova_data_hora: novoInstante.toISOString(),
    p_duracao: duracao ?? null,
  })

  if (error) {
    return { ok: false, mensagem: falha('Não consegui remarcar agora. Verifique a conexão.', error) }
  }
  const r = data as { ok?: boolean; mensagem?: string } | null
  return { ok: r?.ok === true, mensagem: r?.mensagem ?? 'Não consegui remarcar agora.' }
}

export async function cancelarConsulta(
  consultaId: number,
  motivo: string,
): Promise<ResultadoDaResposta> {
  /* Confere o motivo AQUI também, e não só no banco: uma ida à rede para ouvir
     "preciso do motivo" é uma espera com o dedo no ar por algo que a tela já
     sabia. O banco continua conferindo -- a Aurora entra por lá sem passar por
     aqui. */
  const limpo = motivo.trim()
  if (!limpo) {
    return { ok: false, mensagem: 'Escreva o motivo do cancelamento -- o paciente vê esse texto.' }
  }

  const { data, error } = await supabase.rpc('app_cancelar_consulta', {
    p_consulta_id: consultaId,
    p_motivo: limpo,
  })

  if (error) {
    return { ok: false, mensagem: falha('Não consegui cancelar agora. Verifique a conexão.', error) }
  }
  const r = data as { ok?: boolean; mensagem?: string } | null
  return { ok: r?.ok === true, mensagem: r?.mensagem ?? 'Não consegui cancelar agora.' }
}

/* ──────────────────── O EXPEDIENTE DELA ────────────────────
 *
 * De onde sai o começo e o fim do dia na hora de calcular os buracos. As três
 * colunas já existem em `configuracoes` desde a grade da semana -- não inventei
 * horário nenhum, e usar as mesmas é o que impede a agenda do celular de
 * discordar da grade do computador.
 *
 * ──── Falhar aqui devolve o PADRÃO, e não vazio ────
 * Sem sinal, ou sem permissão de ler `configuracoes`, a resposta é 08:00-18:00
 * de segunda a sexta -- que é exatamente o `default` das colunas no banco. A
 * alternativa seria a tela dizer que não há vaga nenhuma, e "sem vaga" é uma
 * afirmação forte para fazer a partir de uma leitura que falhou.
 *
 * Item 11: função que alimenta tela não rejeita. */
export async function expedienteDaNutri(): Promise<Expediente> {
  const { data, error } = await supabase
    .from('configuracoes')
    .select('agenda_hora_inicio, agenda_hora_fim, agenda_dias_semana')
    .maybeSingle()

  if (error) {
    falha('Não consegui ler o seu horário de atendimento.', error)
    return EXPEDIENTE_PADRAO
  }

  const c = data as {
    agenda_hora_inicio?: string | null
    agenda_hora_fim?: string | null
    agenda_dias_semana?: number[] | null
  } | null

  /* Campo a campo, e não o objeto inteiro de uma vez: a conta pode ter a hora
     configurada e os dias nulos, e um `??` no objeto jogaria fora o que veio
     certo junto com o que veio vazio. */
  return {
    inicio: c?.agenda_hora_inicio?.trim() || EXPEDIENTE_PADRAO.inicio,
    fim: c?.agenda_hora_fim?.trim() || EXPEDIENTE_PADRAO.fim,
    diasDaSemana: c?.agenda_dias_semana?.length
      ? c.agenda_dias_semana
      : EXPEDIENTE_PADRAO.diasDaSemana,
  }
}

async function ler(inicio: string, fim: string): Promise<ResultadoAgenda> {
  const { data, error } = await supabase
    .from('consultas')
    .select('id, data_hora, duracao, status, tipo, paciente_id, nome_avulso, encaixe')
    .gte('data_hora', inicio)
    .lt('data_hora', fim)
    .order('data_hora', { ascending: true })
    .limit(TETO_DO_PERIODO)

  if (error) {
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui carregar a sua agenda agora. Verifique a conexão.', error),
    }
  }

  return { tipo: 'ok', consultas: await comNomes((data ?? []) as LinhaConsulta[]) }
}

/* Os nomes, numa SEGUNDA leitura -- e nunca por join.
 *
 * O nome mora em `pacientes`, que tem a própria política. Dava para pedir
 * aninhado numa consulta só, mas isso depende de o PostgREST enxergar a
 * relação -- e quando ele não enxerga, o erro não é "faltou o nome": é a
 * consulta inteira falhando, e a agenda em branco.
 *
 * Duas leituras sempre funcionam, e a segunda só busca os ids que apareceram.
 * Sem nome, a consulta ainda aparece com o horário, que é a informação que não
 * pode faltar. */
async function comNomes(linhas: LinhaConsulta[]): Promise<ConsultaDoDia[]> {
  if (linhas.length === 0) return []

  const ids = [...new Set(linhas.map(l => l.paciente_id).filter((x): x is number => x !== null))]
  const nomes = new Map<number, string>()

  if (ids.length > 0) {
    const { data: ps, error } = await supabase.from('pacientes').select('id, nome').in('id', ids)
    /* Nome que não veio não é motivo para esconder a consulta: o horário
       continua sendo a informação que ela precisa. Registra e segue. */
    if (error) falha('Não consegui carregar os nomes dos pacientes.', error)
    else for (const p of (ps ?? []) as { id: number; nome: string | null }[]) {
      if (p.nome?.trim()) nomes.set(p.id, p.nome.trim())
    }
  }

  return linhas.map(l => ({
    id: l.id,
    quando: l.data_hora,
    diaISO: diaLocalDe(l.data_hora),
    pacienteId: l.paciente_id,
    /* A ordem importa: a ficha primeiro, o avulso depois, e por fim um genérico.
       `nome_avulso` existe para o encaixe de quem ainda não tem ficha, e é o
       nome certo justamente nesse caso. */
    nome:
      (l.paciente_id !== null ? nomes.get(l.paciente_id) : undefined) ??
      l.nome_avulso?.trim() ??
      'Sem nome',
    duracao: l.duracao,
    status: l.status ?? '',
    tipo: l.tipo,
    encaixe: l.encaixe,
  }))
}
