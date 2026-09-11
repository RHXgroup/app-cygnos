/* A Escalada do Comer, e os rótulos do plano terapêutico.
 *
 * ──────────────────── De onde vem, e por que é CÓPIA ────────────────────
 * Tudo aqui é a régua de `PlanejamentoTerapeutico.tsx`, do sistema -- as mesmas
 * seis bandas, os mesmos 32 passos, os mesmos limites de tendência e de alerta.
 * Copiada, e não reinventada, porque as duas telas mostram a MESMA criança: se
 * o app dissesse "subiu" e o computador "estável", ela deixaria de confiar nos
 * dois.
 *
 * É a armadilha 5 assumida de propósito: o código mora em dois repositórios e
 * não há onde compartilhar. O preço é este aviso -- MUDOU A RÉGUA LÁ, MUDA AQUI.
 * Os testes deste arquivo seguram os números para que a divergência apareça.
 *
 * Fonte da Escalada, citada no sistema: SOS Approach to Feeding — "Steps to
 * Eating", Kay Toomey (2010/1995), tradução Fga. Dra. Sabrina Fontanesi.
 *
 * ──────────────────── E o "plano underline" ────────────────────
 * O relato foi "o terapêutico aparece com plano underline, não está legal o
 * nome ali". Era o banco aparecendo cru na tela: `introducao_alimentar`,
 * `em_andamento`. Todo rótulo deste arquivo passa por uma função com reserva,
 * e a reserva nunca devolve o código -- troca o sublinhado por espaço e põe
 * maiúscula. Um valor novo no banco aparece feio no máximo, e nunca com `_`.
 *
 * Sem import nenhum: testável no Node. */

export type Banda = 'recusou' | 'tolerar' | 'interagir' | 'cheirar' | 'tocar' | 'provar' | 'comer'

/* As bandas em ordem, de baixo para cima, com o PRIMEIRO passo de cada uma --
   que é o que o sistema assume quando a exposição registra a banda sem os
   passos ("conservador: a categoria diz que a criança chegou na banda, não
   onde parou dentro dela"). */
export const BANDAS: { banda: Banda; rotulo: string; primeiro: number; ultimo: number }[] = [
  { banda: 'recusou', rotulo: 'Recusou', primeiro: 0, ultimo: 0 },
  { banda: 'tolerar', rotulo: 'Tolerar', primeiro: 1, ultimo: 5 },
  { banda: 'interagir', rotulo: 'Interagir', primeiro: 6, ultimo: 9 },
  { banda: 'cheirar', rotulo: 'Cheirar', primeiro: 10, ultimo: 13 },
  { banda: 'tocar', rotulo: 'Tocar', primeiro: 14, ultimo: 24 },
  { banda: 'provar', rotulo: 'Provar', primeiro: 25, ultimo: 31 },
  { banda: 'comer', rotulo: 'Comer', primeiro: 32, ultimo: 32 },
]

/* O que cada passo é, para a frase "chegou no passo 16: toca com a mão
   inteira". Mesmos textos do sistema, que é o que a família já ouviu. */
const PASSOS: Record<number, string> = {
  1: 'Permanece no ambiente com o alimento',
  2: 'Fica à mesa com o alimento do outro lado',
  3: 'Fica à mesa com o alimento no meio',
  4: 'Fica à mesa perto do prato, mas fora',
  5: 'Tolera no próprio prato ou espaço',
  6: 'Auxilia na preparação',
  7: 'Usa utensílio para servir aos outros',
  8: 'Serve ou derrama fora do próprio espaço',
  9: 'Serve no próprio prato ou espaço',
  10: 'Sente o odor no ambiente',
  11: 'Sente o odor na mesa',
  12: 'Sente o odor perto do seu espaço',
  13: 'Inclina-se ou pega para cheirar',
  14: 'Toca com a ponta do dedo',
  15: 'Toca com mais de um dedo',
  16: 'Toca com a mão inteira',
  17: 'Encosta no braço ou ombro',
  18: 'Encosta no peito ou pescoço',
  19: 'Encosta na cabeça',
  20: 'Encosta no queixo ou bochechas',
  21: 'Leva próximo do nariz',
  22: 'Leva aos lábios',
  23: 'Toca com os dentes',
  24: 'Leva à língua',
  25: 'Lambe os lábios ou dedos',
  26: 'Lambe com a língua toda',
  27: 'Morde um pedaço, mas cospe',
  28: 'Morde e segura na boca, mas cospe',
  29: 'Morde, mastiga e manipula, mas cospe',
  30: 'Mastiga e engole um pouco, mas cospe parte',
  31: 'Mastiga e engole tudo com água',
  32: 'Mastiga e engole tudo sozinho',
}

export function descricaoDoPasso(n: number): string {
  return PASSOS[n] ?? ''
}

/* ──────────────────── O NÍVEL DE UMA EXPOSIÇÃO ──────────────────── */

export type Exposicao = {
  data: string
  aceitacao: string | null
  passos: number[] | null
  reacao: string | null
  visualizou?: boolean | null
  tocou?: boolean | null
  cheirou?: boolean | null
  levouABoca?: boolean | null
  mordeu?: boolean | null
  mastigou?: boolean | null
  engoliu?: boolean | null
}

/* Os registros antigos, de antes da Escalada completa, usam outras palavras. */
const LEGADO: Record<string, Banda> = {
  aceitou: 'comer',
  tolerou: 'tolerar',
  provou: 'provar',
  interacao_parcial: 'interagir',
}

function bandaDe(aceitacao: string | null): Banda | null {
  if (!aceitacao) return null
  const b = BANDAS.find(x => x.banda === aceitacao)
  if (b) return b.banda
  return LEGADO[aceitacao] ?? null
}

/**
 * O passo alcançado numa exposição (0-32), ou `null` quando não há como saber.
 *
 * A mesma ordem de preferência do sistema: os passos registrados; senão o
 * primeiro passo da banda; senão, nos registros mais antigos, as marcações
 * soltas (engoliu, mordeu, tocou...).
 */
export function nivelDe(e: Exposicao): number | null {
  const passos = (e.passos ?? []).filter(n => Number.isFinite(n) && n >= 1 && n <= 32)
  if (passos.length) return Math.max(...passos)

  const b = bandaDe(e.aceitacao)
  if (b) return b === 'recusou' ? 0 : BANDAS.find(x => x.banda === b)!.primeiro

  if (e.engoliu) return 32
  if (e.mastigou || e.mordeu) return 29
  if (e.levouABoca) return 22
  if (e.tocou) return 14
  if (e.cheirou) return 13
  if (e.visualizou) return 1
  return null
}

/** A banda a que um passo pertence. */
export function bandaDoPasso(n: number): (typeof BANDAS)[number] {
  if (!Number.isFinite(n) || n <= 0) return BANDAS[0]!
  for (let i = BANDAS.length - 1; i >= 1; i--) {
    if (n >= BANDAS[i]!.primeiro) return BANDAS[i]!
  }
  return BANDAS[1]!
}

/* ──────────────────── A CRIANÇA ESTÁ EVOLUINDO? ────────────────────
 *
 * "Vamos falar se esse paciente está evoluindo ou não." É a pergunta que esta
 * tela existe para responder, e a resposta tem de ser a MESMA do sistema.
 *
 * Mesmas três réguas de lá, e as três se recusam a falar com pouco dado:
 *   - tendência: só com 3 exposições ou mais; compara a média da metade mais
 *     antiga com a da metade mais recente; 2 passos de diferença para dizer
 *     que mudou.
 *   - alerta de reação: 2 negativas (ou agitadas) nas 3 últimas.
 *   - "come sozinho": 2 das 3 últimas no passo 32. Uma vez só não sustenta
 *     uma afirmação sobre o presente. */
export type Tendencia = { direcao: 'subiu' | 'estavel' | 'desceu'; de: string; para: string }

const porData = (a: Exposicao, b: Exposicao) => String(a.data ?? '').localeCompare(String(b.data ?? ''))

export function tendenciaDe(exposicoes: Exposicao[]): Tendencia | null {
  const serie = [...exposicoes]
    .sort(porData)
    .map(nivelDe)
    .filter((n): n is number => n !== null)
  if (serie.length < 3) return null

  const meio = Math.floor(serie.length / 2)
  const media = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
  const antes = media(serie.slice(0, meio))
  const depois = media(serie.slice(meio))

  return {
    direcao: depois - antes >= 2 ? 'subiu' : antes - depois >= 2 ? 'desceu' : 'estavel',
    de: bandaDoPasso(Math.round(antes)).rotulo,
    para: bandaDoPasso(Math.round(depois)).rotulo,
  }
}

export function alertaDeReacao(exposicoes: Exposicao[]): boolean {
  const ultimas = [...exposicoes].sort(porData).slice(-3)
  return ultimas.filter(e => e.reacao === 'negativa' || e.reacao === 'agitada').length >= 2
}

export function comeSozinho(exposicoes: Exposicao[]): boolean {
  const ultimas = [...exposicoes].sort(porData).slice(-3)
  return ultimas.filter(e => (nivelDe(e) ?? 0) >= 32).length >= 2
}

/** O passo mais alto já alcançado com este alimento. A Escalada é cumulativa. */
export function melhorPasso(exposicoes: Exposicao[]): number | null {
  const niveis = exposicoes.map(nivelDe).filter((n): n is number => n !== null)
  return niveis.length ? Math.max(...niveis) : null
}

/* ──────────────────── OS RÓTULOS ──────────────────── */

/* A reserva de TODOS os rótulos: nunca o código cru. `em_andamento` vira
   "Em andamento" mesmo que ninguém tenha escrito o rótulo -- é o que impede o
   "plano underline" de voltar com o próximo valor que o banco inventar. */
export function humanizar(codigo: unknown): string {
  const s = String(codigo ?? '').trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

function rotulo(tabela: Record<string, string>, codigo: unknown): string {
  const k = String(codigo ?? '').trim()
  return tabela[k] ?? humanizar(k)
}

/* Status do plano E do objetivo. Os legados (`ativo`, `concluido`, `pausado`)
   vêm de planos salvos antes da renomeação, e o banco não tem CHECK na coluna. */
const STATUS: Record<string, string> = {
  em_andamento: 'Em andamento',
  atingido: 'Atingido',
  parcial: 'Parcial',
  nao_atingido: 'Não atingido',
  ativo: 'Em andamento',
  concluido: 'Atingido',
  pausado: 'Parcial',
}
export const rotuloDoStatusTerapeutico = (s: unknown) => rotulo(STATUS, s)

/** O status já traduzido do legado, para comparar ("está em andamento?"). */
export function statusAtual(s: unknown): 'em_andamento' | 'atingido' | 'parcial' | 'nao_atingido' | 'outro' {
  const k = String(s ?? '').trim()
  const leg: Record<string, string> = { ativo: 'em_andamento', concluido: 'atingido', pausado: 'parcial' }
  const v = leg[k] ?? k
  return v === 'em_andamento' || v === 'atingido' || v === 'parcial' || v === 'nao_atingido' ? v : 'outro'
}

const AREAS: Record<string, string> = {
  seletividade_alimentar: 'Seletividade alimentar',
  introducao_alimentar: 'Introdução alimentar',
  aversao_sensorial: 'Aversão sensorial',
  autonomia: 'Autonomia',
  rotina_alimentar: 'Rotina alimentar',
  aceitacao_textura: 'Aceitação de textura',
  repertorio_alimentar: 'Repertório alimentar',
  outro: 'Outro',
}
export const rotuloDaArea = (a: unknown) => rotulo(AREAS, a)

const PERIODOS: Record<string, string> = {
  semanal: 'Semanal',
  quinzenal: 'Quinzenal',
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
}
export const rotuloDoPeriodo = (p: unknown) => rotulo(PERIODOS, p)

const AMBIENTES: Record<string, string> = {
  consultorio: 'No consultório',
  casa: 'Em casa',
  escola: 'Na escola',
}
export const rotuloDoAmbiente = (a: unknown) => rotulo(AMBIENTES, a)

const RESPONSAVEIS: Record<string, string> = {
  familia: 'Família',
  nutricionista: 'Nutricionista',
  escola: 'Escola',
}
export const rotuloDoResponsavel = (r: unknown) => rotulo(RESPONSAVEIS, r)

/**
 * O nome do plano: o título, ou a área quando não há título -- a mesma escolha
 * do sistema. Nunca `introducao_alimentar`.
 */
export function nomeDoPlano(titulo: unknown, area: unknown): string {
  const t = String(titulo ?? '').trim()
  if (t) return t
  const a = rotuloDaArea(area)
  return a || 'Plano terapêutico'
}
