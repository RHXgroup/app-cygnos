/* As séries do painel: linhas soltas do banco viram uma linha de gráfico.
 *
 * ──────────────────── Por que isto é puro ────────────────────
 * É a parte que erra. Dia sem movimento tem de virar ZERO e não sumir -- uma
 * série que pula os dias vazios desenha uma semana cheia num consultório que
 * atendeu duas vezes. Data fora da janela tem de ficar de fora. E o "hoje" é o
 * do APARELHO, não o de Greenwich.
 *
 * Nada aqui fala com rede, então `serieDoPainel.teste.mts` exercita tudo. */

export type PontoDoDia = {
  /** ISO, aaaa-mm-dd. */
  dia: string
  valor: number
}

const DIA_EM_MS = 86400000

/* As datas são peladas (aaaa-mm-dd) e a conta entre elas é em UTC de propósito:
   sem hora, não há fuso -- e usar a data local aqui traria o erro de volta pela
   porta dos fundos, na virada do horário de verão. */
const doISO = (iso: string): number => Date.parse(iso + 'T00:00:00Z')

export const ehDiaValido = (iso: unknown): iso is string =>
  typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) && Number.isFinite(doISO(iso))

const paraISO = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

/** Os `quantos` últimos dias terminando em `hoje`, do mais antigo ao mais novo. */
export function janelaDeDias(hoje: string, quantos: number): string[] {
  if (!ehDiaValido(hoje) || quantos < 1) return []
  const fim = doISO(hoje)
  const total = Math.min(Math.floor(quantos), 400)
  return Array.from({ length: total }, (_, i) => paraISO(fim - (total - 1 - i) * DIA_EM_MS))
}

/**
 * Linhas do banco viram uma série contínua, com zero nos dias sem nada.
 *
 * `valor` de cada linha é somado no dia dela. Linha com data fora da janela, ou
 * com data que não existe, não entra -- e não derruba a série.
 */
export function serieDiaria(
  linhas: { dia: unknown; valor: unknown }[],
  hoje: string,
  quantos: number,
): PontoDoDia[] {
  const dias = janelaDeDias(hoje, quantos)
  if (dias.length === 0) return []

  const total = new Map<string, number>(dias.map(d => [d, 0]))

  for (const l of linhas) {
    const dia = typeof l.dia === 'string' ? l.dia.slice(0, 10) : ''
    if (!total.has(dia)) continue
    const n = typeof l.valor === 'number' ? l.valor : Number(l.valor)
    if (!Number.isFinite(n)) continue
    total.set(dia, (total.get(dia) ?? 0) + n)
  }

  return dias.map(dia => ({ dia, valor: total.get(dia) ?? 0 }))
}

export const totalDaSerie = (serie: PontoDoDia[]): number =>
  serie.reduce((s, p) => s + (Number.isFinite(p.valor) ? p.valor : 0), 0)

export const maiorDaSerie = (serie: PontoDoDia[]): number =>
  serie.reduce((m, p) => (Number.isFinite(p.valor) && p.valor > m ? p.valor : m), 0)

export type Comparacao = {
  /** A soma da metade mais nova da janela. */
  agora: number
  /** A soma da metade mais antiga. */
  antes: number
  /** Quanto mudou, em pontos percentuais inteiros. Nulo quando não dá para dizer. */
  variacao: number | null
}

/**
 * A metade nova contra a metade velha da mesma janela.
 *
 * ── Por que nulo, e não zero, quando o passado é zero ──
 * "Subiu 100%" a partir de nada não quer dizer nada, e num painel clínico esse
 * número vira orgulho falso -- ou susto falso no sentido contrário. Sem base de
 * comparação, a tela mostra só o número de agora.
 */
export function compararMetades(serie: PontoDoDia[]): Comparacao {
  if (serie.length < 2) return { agora: totalDaSerie(serie), antes: 0, variacao: null }

  const meio = Math.floor(serie.length / 2)
  const antes = totalDaSerie(serie.slice(0, meio))
  const agora = totalDaSerie(serie.slice(meio))

  if (antes <= 0) return { agora, antes, variacao: null }
  return { agora, antes, variacao: Math.round(((agora - antes) / antes) * 100) }
}

/* O teto do eixo, arredondado para cima num número redondo: 7 vira 8, 23 vira
   25, 1.240 vira 1.500. Um eixo que termina exatamente no maior valor faz a
   maior barra encostar no topo e parecer cortada. */
export function tetoDoEixo(maior: number): number {
  if (!Number.isFinite(maior) || maior <= 0) return 1
  const grandeza = Math.pow(10, Math.floor(Math.log10(maior)))
  /* Os degraus são "números que a gente diz": 8 e não 7,5; 25 e não 24; 1.500 e
     não 1.240. Um eixo terminando em 7,5 consultas é o gráfico falando a língua
     da matemática em vez da do consultório. */
  const passos = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
  for (const p of passos) {
    const candidato = grandeza * p
    if (candidato >= maior) return candidato
  }
  return grandeza * 10
}

/* "seg", "ter"… O rótulo do eixo quando a janela é curta. Em UTC pela mesma
   razão do resto: a data é pelada. */
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

export function diaCurto(iso: string): string {
  if (!ehDiaValido(iso)) return ''
  return DIAS_CURTOS[new Date(doISO(iso)).getUTCDay()] ?? ''
}

/* "12/09". Para janelas longas, onde o dia da semana não ajuda. */
export function dataCurta(iso: string): string {
  if (!ehDiaValido(iso)) return ''
  const [, mes, dia] = iso.split('-')
  return `${dia}/${mes}`
}

/* O "hoje" do APARELHO, montado campo a campo. `toISOString` cortaria em
   Greenwich e, depois das 21h no Brasil, a janela inteira andaria um dia. */
export function hojeDoAparelho(agora: Date = new Date()): string {
  if (Number.isNaN(agora.getTime())) return ''
  const dois = (n: number) => String(n).padStart(2, '0')
  return `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`
}
