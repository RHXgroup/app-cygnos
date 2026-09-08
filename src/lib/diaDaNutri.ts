/* O dia da nutricionista, decidido — sem tocar no banco.
 *
 * ── Por que existe, e por que é puro ──────────────────────────────────────
 * A tela dela abre com uma pergunta só: "como está o meu dia agora?". A
 * resposta depende de comparar horários com o relógio, e comparação de horário
 * é onde este projeto mais errou — o cartão da próxima refeição, o descanso do
 * treino, a janela da água. Todos deram defeito na virada de alguma hora.
 *
 * Aqui a decisão fica separada do que fala com o banco (`agendaDaNutri.ts`),
 * então ela roda no Node e pode ser exercitada em instantes que ninguém
 * consegue reproduzir no aparelho: 23h59, uma consulta que começou há dois
 * minutos, o dia sem nada marcado.
 *
 * ── Os estados, e por que são estes ───────────────────────────────────────
 * Ela olha o telefone entre uma consulta e outra. As perguntas dela, nessa
 * ordem, são: "quem está comigo agora?", "quem vem depois?", "já acabou?".
 * Não é uma lista de horários — é uma posição no dia. */

/* Como a consulta chega, já limpa de tudo o que a tela não usa. */
export type ConsultaDoDia = {
  id: number
  /* ISO com fuso, como o banco devolve. */
  quando: string
  /* Nome do paciente, ou o avulso quando não há ficha. */
  nome: string
  /* Minutos reservados. Nulo quando ninguém informou. */
  duracao: number | null
  status: string
  tipo: string | null
}

/* ── OS STATUS QUE CONTAM COMO AGENDA ──────────────────────────────────────
 *
 * Lidos do banco de produção: `pendente` (383), `cancelada` (126),
 * `realizada` (116), `confirmada` (64), `solicitada` (7).
 *
 * `cancelada` sai: não é compromisso. `solicitada` também — é pedido do
 * paciente que ela ainda não aceitou, e mostrá-lo entre os confirmados faria
 * ela contar com alguém que talvez não venha.
 *
 * `realizada` FICA, e de propósito: às três da tarde, saber quem já passou é
 * metade da resposta de "como está o meu dia". Some só do que ainda vem. */
const CONTAM = new Set(['pendente', 'confirmada', 'realizada'])

/* Quanto tempo uma consulta segue sendo "a de agora" depois de começar.
 *
 * Quando a duração não vem preenchida — e ela é nula em boa parte das linhas —
 * é preciso um palpite para saber se a consulta das 14h ainda está rolando às
 * 14h40. Cinquenta minutos é a consulta comum de nutrição.
 *
 * Errar aqui é barato nos dois sentidos: para mais, ela vê como "agora" alguém
 * que acabou de sair; para menos, a pessoa que está na frente dela pula para
 * "já passou". O primeiro incomoda menos, então o palpite é generoso. */
export const DURACAO_SUPOSTA_MIN = 50

/* Uma consulta é "a de agora" desta janela de minutos ANTES do horário.
 *
 * Quem chega dez minutos adiantada já está na sala de espera, e a pergunta
 * "quem está comigo agora" já se responde por ela. */
export const ANTECEDENCIA_MIN = 10

export type Dia = {
  /* Quem está com ela neste instante, ou a próxima se estiver na antecedência. */
  agora: ConsultaDoDia | null
  /* O que ainda vem hoje, sem a de agora. Em ordem de horário. */
  aindaHoje: ConsultaDoDia[]
  /* O que já passou hoje. Serve para o "3 de 7" no alto da tela. */
  jaForam: ConsultaDoDia[]
  /* Quantas contam no dia inteiro — a soma das três acima. */
  total: number
}

const emMs = (iso: string): number => {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : NaN
}

/* Divide o dia em torno do relógio.
 *
 * `agora` recebido de fora, e não lido aqui dentro: é o que permite testar a
 * virada da meia-noite e a consulta que começou há dois minutos sem esperar o
 * relógio chegar lá. */
export function dividirODia(consultas: ConsultaDoDia[], agora: number): Dia {
  const validas = consultas
    .filter(c => CONTAM.has(c.status) && !Number.isNaN(emMs(c.quando)))
    .sort((a, b) => emMs(a.quando) - emMs(b.quando))

  let aDeAgora: ConsultaDoDia | null = null
  const aindaHoje: ConsultaDoDia[] = []
  const jaForam: ConsultaDoDia[] = []

  for (const c of validas) {
    const comeca = emMs(c.quando)
    const dura = (c.duracao && c.duracao > 0 ? c.duracao : DURACAO_SUPOSTA_MIN) * 60_000
    const abre = comeca - ANTECEDENCIA_MIN * 60_000
    const fecha = comeca + dura

    if (agora >= abre && agora < fecha) {
      /* A PRIMEIRA que couber, e não a última.
         Duas consultas coladas se sobrepõem pela duração suposta, e nesse caso
         "agora" é a que começou antes — quem está na sala é ela. */
      if (aDeAgora === null) {
        aDeAgora = c
        continue
      }
      /* A segunda de um par sobreposto ainda não começou de verdade. */
      aindaHoje.push(c)
      continue
    }

    if (agora < abre) aindaHoje.push(c)
    else jaForam.push(c)
  }

  return { agora: aDeAgora, aindaHoje, jaForam, total: validas.length }
}

/* A frase do alto da tela.
 *
 * Escrita aqui, e não na tela, porque ela É a decisão: o que dizer quando não
 * há nada marcado não é questão de layout. E porque um texto que muda por hora
 * do dia é justamente o tipo de coisa que se quer poder exercitar sem esperar
 * a hora chegar.
 *
 * Nunca diz "nada para fazer": um dia sem consulta é dia de trabalho igual, e o
 * app não tem como saber o que ela tem pela frente. */
/* A frase do alto da tela.
 *
 * `resumoDaAgenda`, e não `resumoDoDia`: já existe um `resumoDoDia` em
 * `resumoDoDiaDoCiclo`, e as duas frases falam de dias diferentes da mesma
 * pessoa. O compilador separaria as duas -- os tipos não batem --, mas quem
 * lê a chamada não. Armadilha 5: o nome diz o OBJETO, e não o assunto. */
export function resumoDaAgenda(dia: Dia): string {
  if (dia.total === 0) return 'Nenhuma consulta marcada para hoje'
  if (dia.agora === null && dia.aindaHoje.length === 0) {
    return dia.total === 1 ? 'A consulta de hoje já passou' : `As ${dia.total} consultas de hoje já passaram`
  }
  const faltam = dia.aindaHoje.length + (dia.agora ? 1 : 0)
  if (faltam === dia.total) {
    return dia.total === 1 ? '1 consulta hoje' : `${dia.total} consultas hoje`
  }
  return `${dia.jaForam.length} de ${dia.total} já passaram`
}

/* "14:30", do ISO com fuso que o banco devolve.
 *
 * Nome pelo FORMATO e não pelo assunto: já existe `relogio` em dois lugares
 * deste projeto, cada um recebendo uma unidade diferente, e trocar o import
 * compila e imprime um número plausível e errado. Armadilha 5 do AGENTS.md. */
export function hhmm(iso: string): string {
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return ''
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
}
