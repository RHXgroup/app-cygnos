import type { ConsultaDoDia } from './diaDaNutri'
import { DIAS_LONGOS } from './formatar.ts'
import { achatar } from './menuDaAurora.ts'

/* As perguntas que a Aurora responde sem IA.
 *
 * ──────────────────── O pedido ────────────────────
 * "As perguntas básicas -- próximo paciente, quem é o tal, agenda tal -- ela vai
 * gastar também? Isso dá pra programar, fazer tudo automático? Espero a IA pra
 * fazer análises, não pra fazer comando simples."
 *
 * Ele está certo. "Quem é o meu próximo paciente?" tem UMA resposta, e ela está
 * no banco. Mandar isso ao modelo custa dinheiro, custa segundos, e ainda abre a
 * chance de o modelo errar uma coisa que uma linha de código acerta sempre. Os
 * dois atalhos que a tela oferece -- "Quem é o meu próximo paciente?" e "Quanto
 * eu recebi hoje?" -- iam ao modelo a cada toque.
 *
 * ──────────────────── Por que frase INTEIRA, e não "contém" ────────────────────
 * O mesmo motivo do "menu principal", logo ao lado em `menuDaAurora`: um "contém
 * próximo paciente" acharia "marca o próximo paciente para amanhã", e responderia
 * com um nome em vez de marcar. Aqui só entra a mensagem que NÃO pode querer
 * dizer outra coisa. O resto vai para a Aurora de sempre, que entende o que
 * ninguém previu.
 *
 * É a regra do padrão calado: na dúvida, o caminho seguro (a IA) e não o rápido.
 * A lista começa curta de propósito, e cresce com o registro de gasto: ele diz
 * quais frases ela realmente usa, e não as que a gente imagina.
 *
 * Este arquivo só DECIDE e ESCREVE. Quem lê o banco é `respostaSemIA`, que
 * arrasta o Supabase -- e é por isso que a decisão mora separada, para rodar no
 * Node sem aparelho. */

export type PerguntaBasica = 'proximo_paciente' | 'agenda_hoje' | 'agenda_amanha' | 'recebido_hoje'

/* Já achatadas: sem acento, minúsculas, sem pontuação. */
const FRASES: Record<PerguntaBasica, string[]> = {
  proximo_paciente: [
    'quem e o meu proximo paciente', 'quem e meu proximo paciente', 'quem e o proximo paciente',
    'qual e o meu proximo paciente', 'qual o meu proximo paciente', 'qual o proximo paciente',
    'meu proximo paciente', 'proximo paciente',
    'qual e a minha proxima consulta', 'qual a minha proxima consulta', 'qual a proxima consulta',
    'qual e a proxima consulta', 'minha proxima consulta', 'proxima consulta',
    'quem e o proximo', 'quem e a proxima', 'quem vem agora', 'quem vem depois',
  ],
  agenda_hoje: [
    'agenda de hoje', 'a agenda de hoje', 'minha agenda de hoje', 'agenda hoje', 'minha agenda hoje',
    'como esta a agenda de hoje', 'como esta a minha agenda hoje', 'como esta minha agenda hoje',
    'como ta a agenda de hoje', 'como ta minha agenda hoje',
    'o que eu tenho hoje', 'o que tenho hoje', 'consultas de hoje', 'minhas consultas de hoje',
    'quantas consultas eu tenho hoje', 'quantas consultas tenho hoje',
    'quem eu atendo hoje', 'quem atendo hoje',
  ],
  agenda_amanha: [
    'agenda de amanha', 'a agenda de amanha', 'minha agenda de amanha', 'agenda amanha', 'minha agenda amanha',
    'como esta a agenda de amanha', 'como esta a minha agenda amanha', 'como esta minha agenda amanha',
    'como ta a agenda de amanha', 'como ta minha agenda amanha',
    'o que eu tenho amanha', 'o que tenho amanha', 'consultas de amanha', 'minhas consultas de amanha',
    'quantas consultas eu tenho amanha', 'quantas consultas tenho amanha',
    'quem eu atendo amanha', 'quem atendo amanha',
  ],
  recebido_hoje: [
    'quanto eu recebi hoje', 'quanto recebi hoje', 'quanto entrou hoje', 'quanto ja entrou hoje',
    'quanto eu ja recebi hoje', 'quanto eu recebi', 'quanto recebi', 'quanto entrou', 'recebido hoje',
  ],
}

const INDICE = new Map<string, PerguntaBasica>()
for (const [tipo, frases] of Object.entries(FRASES) as [PerguntaBasica, string[]][]) {
  for (const f of frases) INDICE.set(f, tipo)
}

/* O vocativo e a gentileza não mudam a pergunta: "Aurora, quem é o meu próximo
   paciente, por favor?" é a mesma coisa. Só nas PONTAS -- no meio, uma palavra a
   mais já pode ser um nome. */
const semEnfeite = (limpo: string): string =>
  limpo
    .replace(/^(oi |ola |bom dia |boa tarde |boa noite )?aurora /, '')
    .replace(/ (por favor|aurora)$/, '')
    .replace(/^me (diz|fala|mostra) /, '')
    .trim()

/** Qual pergunta básica esta mensagem é -- ou `null`, e aí ela vai para a IA. */
export function lerPerguntaBasica(texto: string): PerguntaBasica | null {
  const limpo = semEnfeite(achatar(texto ?? ''))
  if (!limpo) return null
  return INDICE.get(limpo) ?? null
}

/* ──────────────────── AS RESPOSTAS ────────────────────
 *
 * No tom e no tamanho da Aurora do celular: poucas frases, horário como 14:00,
 * no máximo três nomes -- sendo mais, diz quantos são e mostra os próximos. Uma
 * resposta sem IA que soasse diferente da resposta com IA faria ela perceber a
 * costura, e desconfiar das duas. */

const DIA_MS = 86_400_000

const mesmoDiaLocal = (a: number, b: number): boolean =>
  new Date(a).toDateString() === new Date(b).toDateString()

function horario(iso: string): string {
  const d = new Date(Date.parse(iso))
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

/* "hoje", "amanhã", ou "quinta-feira (17/09)". */
function quandoFalado(ms: number, agora: number): string {
  if (mesmoDiaLocal(ms, agora)) return 'hoje'
  if (mesmoDiaLocal(ms, agora + DIA_MS)) return 'amanhã'
  const d = new Date(ms)
  const nome = (DIAS_LONGOS[d.getDay()] ?? '').toLowerCase()
  return `${nome} (${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')})`
}

/* Os que ainda vão acontecer. `realizada` já foi, `cancelada` não ocupa, e
   `solicitada` é pedido que ela ainda não aceitou -- contar com esse paciente
   faria ela esperar alguém que talvez não venha. */
const AINDA_VEM = new Set(['pendente', 'confirmada'])
/* Os que contam no dia, como na agenda da tela: `realizada` fica, porque às
   três da tarde saber quem já passou é metade de "como está o meu dia". */
const CONTAM_NO_DIA = new Set(['pendente', 'confirmada', 'realizada'])

export function respostaDoProximo(consultas: ConsultaDoDia[], agora: number): string {
  const proxima = consultas
    .filter(c => AINDA_VEM.has(c.status) && Date.parse(c.quando) > agora)
    .sort((a, b) => Date.parse(a.quando) - Date.parse(b.quando))[0]

  if (!proxima) return 'Você não tem consulta marcada nos próximos 14 dias.'

  const ms = Date.parse(proxima.quando)
  const pendente = proxima.status === 'pendente' ? ' Ela ainda não foi confirmada.' : ''
  return `Seu próximo paciente é ${proxima.nome}, ${quandoFalado(ms, agora)} às ${horario(proxima.quando)}.${pendente}`
}

export function respostaDaAgenda(
  consultas: ConsultaDoDia[],
  qual: 'hoje' | 'amanha',
  agora: number,
): string {
  const alvo = qual === 'hoje' ? agora : agora + DIA_MS
  const doDia = consultas
    .filter(c => CONTAM_NO_DIA.has(c.status) && mesmoDiaLocal(Date.parse(c.quando), alvo))
    .sort((a, b) => Date.parse(a.quando) - Date.parse(b.quando))

  const Quando = qual === 'hoje' ? 'Hoje' : 'Amanhã'
  if (doDia.length === 0) return `${Quando} você não tem consulta marcada.`

  const linha = (c: ConsultaDoDia) => `${horario(c.quando)} ${c.nome}`
  const emLista = (cs: ConsultaDoDia[]) =>
    cs.length === 1 ? linha(cs[0]) : cs.slice(0, -1).map(linha).join(', ') + ' e ' + linha(cs[cs.length - 1])

  const plural = doDia.length === 1 ? 'consulta' : 'consultas'
  if (doDia.length <= 3) return `${Quando} você tem ${doDia.length} ${plural}: ${emLista(doDia)}.`

  /* Mais de três: o que interessa é o que ainda vem. Hoje à tarde, as da manhã
     já foram; amanhã, tudo ainda vem e as três primeiras bastam. */
  const aVir = qual === 'hoje' ? doDia.filter(c => Date.parse(c.quando) > agora) : doDia
  if (aVir.length === 0) return `Hoje você teve ${doDia.length} consultas, e todas já passaram.`
  const rotulo = qual === 'hoje' ? 'As próximas' : 'As primeiras'
  return `${Quando} você tem ${doDia.length} consultas. ${rotulo}: ${emLista(aVir.slice(0, 3))}.`
}

/* `null` quando a leitura falhou: aí quem chama manda a pergunta para a IA, que
   tem o próprio caminho até o financeiro. Zero NÃO vira "você recebeu R$ 0":
   pode ser que não entrou nada, pode ser que esta conta não tenha permissão de
   ver o financeiro, e as duas chegam iguais. É a mesma cautela que a Aurora tem. */
export function respostaDoRecebido(
  dinheiro: { recebido: number; quantasBaixas: number } | null,
  emReais: (valor: number) => string,
): string | null {
  if (!dinheiro) return null
  if (!(dinheiro.quantasBaixas > 0)) return 'Não há recebimento registrado hoje que eu consiga ver.'
  const vezes = dinheiro.quantasBaixas === 1 ? '1 recebimento' : `${dinheiro.quantasBaixas} recebimentos`
  return `Hoje entrou ${emReais(dinheiro.recebido)}, em ${vezes}.`
}
