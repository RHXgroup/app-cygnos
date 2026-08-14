import { carregarAguaPeriodo, type GoleComData } from './agua'
import { carregarConsumoPeriodo, totaisConsumidos, type ItemComData } from './consumo'
import { dataISO } from './formatar'
import { calcularMetaDoDia, type ChavePilar } from './metaDoDia'
import { carregarMetas, type Metas } from './metas'
import { carregarPeso, type RegistroPeso } from './peso'
import { carregarPlanoAtivo, valeHoje, type PlanoCompleto } from './plano'
import {
  carregarNoites,
  eficiencia,
  NOME_DO_FATOR,
  tempoDormindo,
  type Fator,
  type Noite,
} from './sono'

/* A aba de Relatórios: o passado, lido do que já está gravado.
 *
 * Nenhuma tabela nova. Tudo aqui sai de app_consumo_itens, app_agua_registros,
 * app_peso_registros e app_sono_noites, que já guardam data e hora de cada
 * lançamento — o relatório é uma leitura, não uma segunda contabilidade.
 *
 * ── O período termina ONTEM ───────────────────────────────────────────────
 * Hoje fica de fora de propósito. Um dia pela metade — três das cinco refeições,
 * meia garrafa de água — entra na média como se fosse um dia ruim, e às nove da
 * manhã puxaria o mês inteiro para baixo. Quem quer ver hoje tem a tela inicial,
 * que é justamente sobre hoje.
 *
 * ── As metas são as de HOJE, aplicadas ao passado ─────────────────────────
 * Um limite honesto desta leitura: quem trocou a meta de 1.800 para 2.200 kcal
 * na semana passada vê os dias antigos medidos contra a régua nova. Consertar
 * isso exige guardar um resumo por dia no fechamento de cada dia — uma tabela
 * que ainda não existe. Enquanto ela não vem, o rodapé da tela diz com todas as
 * letras que as metas usadas são as de agora, em vez de o número mentir calado.
 *
 * ── Só conta o dia que tem registro ───────────────────────────────────────
 * Mesma doutrina de `noitesNaMeta` em lib/sono.ts: quem registrou três dias na
 * semana bateu a meta em dois de três, não em dois de sete. Não registrar é
 * outra conversa, e ela aparece como "N dias com registro", nunca como fracasso. */

export const PERIODOS = [7, 30, 90] as const
export type Periodo = (typeof PERIODOS)[number]

export const NOME_DO_PERIODO: Record<Periodo, string> = {
  7: '7 dias',
  30: '30 dias',
  90: '90 dias',
}

/* Acima disto, uma barra por dia vira um pente ilegível num telefone e as barras
   passam a ser semanais. Catorze cabem numa tela de 360 pontos com 4 de vão. */
const MAXIMO_DE_BARRAS_DIARIAS = 14

/* ── Datas ─────────────────────────────────────────────────────────────────
   'YYYY-MM-DD' vira Date campo a campo, e nunca com new Date(texto): a string
   sem hora é lida como UTC, e no fuso de Brasília isso devolve o dia anterior. */
export function dataDe(iso: string): Date {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return new Date(ano, mes - 1, dia)
}

export type Intervalo = { de: string; ate: string; dias: string[] }

/* Os N dias que terminam ontem, em ordem de calendário. */
export function intervaloDe(periodo: Periodo, hoje = new Date()): Intervalo {
  const dias: string[] = []

  for (let atras = periodo; atras >= 1; atras--) {
    const d = new Date(hoje)
    d.setDate(d.getDate() - atras)
    dias.push(dataISO(d))
  }

  return { de: dias[0], ate: dias[dias.length - 1], dias }
}

/* ── O dia ─────────────────────────────────────────────────────────────────*/

export type DiaRelatorio = {
  data: string
  /* 0 = domingo, a numeração de Date.getDay(). */
  diaSemana: number
  /* null em toda parte é "não registrou". Zero é um fato medido: quem bebeu
     nada tem 0 ml; quem não anotou não tem número nenhum, e as duas coisas não
     podem virar a mesma barra. */
  aguaMl: number | null
  calorias: number | null
  proteinas: number | null
  carboidratos: number | null
  gorduras: number | null
  fibras: number | null
  itens: ItemComData[]
  goles: GoleComData[]
  noite: Noite | null
  pesoKg: number | null
  /* O plano valia neste dia da semana? Domingo de um plano de segunda a sábado
     não é um dia em que a pessoa falhou — é um dia livre, e cobrar aderência
     dele seria inventar uma dívida. */
  planoValia: boolean
  refeicoesDoPlano: number
  refeicoesFeitas: number
  /* O anel da tela inicial, recalculado para este dia. null quando não havia
     nada com meta para medir. */
  fracaoDoDia: number | null
  /* O dia tem algum registro de qualquer assunto. */
  temRegistro: boolean
}

/* ── Resumos por assunto ───────────────────────────────────────────────────*/

export type ResumoNumero = {
  /* Média dos dias COM registro. */
  media: number
  /* Quantos dias entraram na conta — uma média de 2 dias e uma de 60 não valem
     o mesmo, e a tela precisa poder dizer isso. */
  dias: number
  /* Dias que alcançaram a meta, entre os que têm registro. null quando não há
     meta definida para o assunto. */
  naMeta: number | null
}

export type ResumoPeso = {
  inicial: number
  atual: number
  /* atual − inicial dentro do período. Negativo é perda. */
  variacao: number
  /* Ritmo, em kg por semana. Sai da distância real entre as duas pesagens, e
     não do tamanho do período: quem pesou só duas vezes em 90 dias, com uma
     semana entre elas, tem um ritmo de uma semana. */
  kgPorSemana: number
  serie: number[]
  pesagens: number
}

export type ResumoSonoPeriodo = {
  mediaDormindoMin: number
  mediaEficiencia: number
  noites: number
  naMeta: number | null
  fatores: { fator: Fator; rotulo: string; vezes: number }[]
  /* Desvio médio do horário de deitar, em minutos. É a regularidade: dormir 8
     horas todo dia em horários que variam três horas é outro sono. */
  irregularidadeMin: number | null
}

export type ResumoPilar = {
  chave: ChavePilar
  rotulo: string
  /* Média das frações diárias, 0 a 1. */
  fracao: number
  dias: number
}

/* ── Padrões ───────────────────────────────────────────────────────────────
   O que separa um relatório de um painel de números. Cada padrão só existe se
   houver amostra para ele — nada aqui é escrito a partir de dois dias. */

export type Padrao = {
  chave: string
  icone: 'moon-outline' | 'water-outline' | 'flame-outline' | 'calendar-outline' | 'repeat-outline'
  titulo: string
  texto: string
  /* Como a tela pinta o achado. 'atencao' não é bronca: é o que merece virar
     conversa com a nutricionista. */
  tom: 'bom' | 'atencao' | 'neutro'
}

export type Relatorio = {
  intervalo: Intervalo
  periodo: Periodo
  dias: DiaRelatorio[]
  metas: Metas
  plano: PlanoCompleto | null
  /* Dias com registro de qualquer assunto. É o número que decide se a tela
     mostra o relatório ou o convite para registrar. */
  diasComRegistro: number
  pilares: ResumoPilar[]
  /* Média das frações diárias × 100. O anel do período. */
  percentualMedio: number
  agua: ResumoNumero | null
  calorias: ResumoNumero | null
  macros: { proteinas: number | null; carboidratos: number | null; gorduras: number | null; fibras: number | null } | null
  peso: ResumoPeso | null
  sono: ResumoSonoPeriodo | null
  /* Refeições do plano registradas, sobre as que o plano pedia nos dias em que
     ele valia. null sem plano ativo. */
  aderencia: { feitas: number; previstas: number } | null
  padroes: Padrao[]
}

export type ResultadoRelatorio =
  | { tipo: 'ok'; relatorio: Relatorio }
  | { tipo: 'erro'; mensagem: string }

/* ── Montagem ──────────────────────────────────────────────────────────────*/

const media = (ns: number[]) => (ns.length === 0 ? 0 : ns.reduce((s, n) => s + n, 0) / ns.length)

function resumoNumero(valores: number[], meta: number | null): ResumoNumero | null {
  if (valores.length === 0) return null

  return {
    media: media(valores),
    dias: valores.length,
    naMeta: meta !== null && meta > 0 ? valores.filter(v => v >= meta).length : null,
  }
}

export async function carregarRelatorio(
  contaId: string,
  periodo: Periodo,
  hoje = new Date(),
): Promise<ResultadoRelatorio> {
  const intervalo = intervaloDe(periodo, hoje)

  /* Tudo de uma vez: as seis consultas são independentes, e encadeá-las
     multiplicaria por seis o tempo de abertura da aba. */
  const [metas, consumo, agua, peso, noites, plano] = await Promise.all([
    carregarMetas(contaId),
    carregarConsumoPeriodo(contaId, intervalo.de, intervalo.ate),
    carregarAguaPeriodo(contaId, intervalo.de, intervalo.ate),
    carregarPeso(contaId),
    /* Uma noite por dia, então o período é o limite natural. */
    carregarNoites(contaId, periodo),
    carregarPlanoAtivo(contaId),
  ])

  if (metas.tipo === 'erro') return { tipo: 'erro', mensagem: metas.mensagem }
  if (consumo.tipo === 'erro') return { tipo: 'erro', mensagem: consumo.mensagem }
  if (agua.tipo === 'erro') return { tipo: 'erro', mensagem: agua.mensagem }
  if (peso.tipo === 'erro') return { tipo: 'erro', mensagem: peso.mensagem }
  if (noites.tipo === 'erro') return { tipo: 'erro', mensagem: noites.mensagem }
  if (plano.tipo === 'erro') return { tipo: 'erro', mensagem: plano.mensagem }

  return {
    tipo: 'ok',
    relatorio: montar({
      intervalo,
      periodo,
      metas: metas.metas,
      itens: consumo.itens,
      goles: agua.goles,
      pesagens: peso.peso.registros,
      noites: noites.noites,
      plano: plano.plano,
    }),
  }
}

/* Separada da busca para poder ser testada com dados na mão — e porque o que
   custa entender aqui é a conta, não o await. */
export function montar({
  intervalo,
  periodo,
  metas,
  itens,
  goles,
  pesagens,
  noites,
  plano,
}: {
  intervalo: Intervalo
  periodo: Periodo
  metas: Metas
  itens: ItemComData[]
  goles: GoleComData[]
  pesagens: RegistroPeso[]
  noites: Noite[]
  plano: PlanoCompleto | null
}): Relatorio {
  const porDiaItens = agrupar(itens, i => i.data)
  const porDiaGoles = agrupar(goles, g => g.data)
  const porDiaNoite = new Map(noites.map(n => [n.data, n]))
  const porDiaPeso = new Map(pesagens.map(p => [p.data, p.kg]))

  const refeicoesDoPlano = plano ? plano.refeicoes.filter(r => r.itens.length > 0) : []

  /* O dia e o seu anel saem juntos, e o anel é guardado: ele é usado duas vezes
     — pelo percentual do dia e pela média de cada pilar — e recalculá-lo faria o
     período de 90 dias rodar 180 vezes a mesma conta. */
  const comAnel = intervalo.dias.map(data => {
    const quando = dataDe(data)
    const doDia = porDiaItens.get(data) ?? []
    const golesDoDia = porDiaGoles.get(data) ?? []
    const noite = porDiaNoite.get(data) ?? null
    const totais = totaisConsumidos(doDia)

    const planoValia = plano ? valeHoje(plano.diasSemana, quando) : false
    const registradas = new Set(doDia.map(i => i.refeicao.trim().toLowerCase()))
    const feitas = planoValia
      ? refeicoesDoPlano.filter(r => registradas.has(r.rotulo.trim().toLowerCase())).length
      : 0

    /* O mesmo cálculo do anel da tela inicial, com os dados daquele dia. Reusar
       calcularMetaDoDia em vez de repetir a regra aqui é o que garante que o
       "72%" do relatório e o "72%" da Home queiram dizer a mesma coisa.

       O plano entra como null nos dias em que não valia: sem isso, todo domingo
       de um plano de segunda a sábado entraria como 0 de 5 refeições. */
    const doAnel = calcularMetaDoDia({
      metas,
      agua: { metaMl: metas.aguaMl, copoMl: metas.copoMl, hoje: golesDoDia, semana: [] },
      consumo: doDia,
      noites,
      plano: planoValia ? plano : null,
      hoje: quando,
    })

    const dia: DiaRelatorio = {
      data,
      diaSemana: quando.getDay(),
      aguaMl: golesDoDia.length > 0 ? golesDoDia.reduce((s, g) => s + g.ml, 0) : null,
      calorias: totais.calorias,
      proteinas: totais.proteinas,
      carboidratos: totais.carboidratos,
      gorduras: totais.gorduras,
      fibras: totais.fibras,
      itens: doDia,
      goles: golesDoDia,
      noite,
      pesoKg: porDiaPeso.get(data) ?? null,
      planoValia,
      refeicoesDoPlano: planoValia ? refeicoesDoPlano.length : 0,
      refeicoesFeitas: feitas,
      fracaoDoDia: doAnel.pilares.length > 0 ? doAnel.percentual / 100 : null,
      temRegistro: doDia.length > 0 || golesDoDia.length > 0 || noite !== null || porDiaPeso.has(data),
    }

    return { dia, anel: doAnel }
  })

  const dias = comAnel.map(c => c.dia)

  /* Os pilares do período: a média de cada um sobre os dias em que ele existiu.
     Por pilar, e não a média dos anéis: um dia sem meta de sono não tem pilar de
     sono, e ele não pode entrar como zero na média de sono. */
  const somaPilar = new Map<ChavePilar, { rotulo: string; soma: number; dias: number }>()
  for (const { anel } of comAnel) {
    for (const p of anel.pilares) {
      const atual = somaPilar.get(p.chave) ?? { rotulo: p.rotulo, soma: 0, dias: 0 }
      somaPilar.set(p.chave, { rotulo: p.rotulo, soma: atual.soma + p.fracao, dias: atual.dias + 1 })
    }
  }

  const pilares: ResumoPilar[] = [...somaPilar.entries()].map(([chave, v]) => ({
    chave,
    rotulo: v.rotulo,
    fracao: v.soma / v.dias,
    dias: v.dias,
  }))

  const fracoes = dias.map(d => d.fracaoDoDia).filter((f): f is number => f !== null)

  const comAgua = dias.map(d => d.aguaMl).filter((v): v is number => v !== null)
  const comKcal = dias.map(d => d.calorias).filter((v): v is number => v !== null)

  const noitesDoPeriodo = dias.map(d => d.noite).filter((n): n is Noite => n !== null)
  const pesagensDoPeriodo = dias
    .map(d => (d.pesoKg !== null ? { data: d.data, kg: d.pesoKg } : null))
    .filter((p): p is { data: string; kg: number } => p !== null)

  const previstas = dias.reduce((s, d) => s + d.refeicoesDoPlano, 0)
  const feitas = dias.reduce((s, d) => s + d.refeicoesFeitas, 0)

  return {
    intervalo,
    periodo,
    dias,
    metas,
    plano,
    diasComRegistro: dias.filter(d => d.temRegistro).length,
    pilares,
    percentualMedio: media(fracoes) * 100,
    agua: resumoNumero(comAgua, metas.aguaMl),
    calorias: resumoNumero(comKcal, metas.calorias),
    macros: mediaDosMacros(dias),
    peso: resumoDoPeso(pesagensDoPeriodo),
    sono: resumoDoSono(noitesDoPeriodo, metas.sonoHoras),
    aderencia: previstas > 0 ? { feitas, previstas } : null,
    padroes: acharPadroes(dias, metas),
  }
}

function agrupar<T>(itens: T[], chaveDe: (i: T) => string): Map<string, T[]> {
  const mapa = new Map<string, T[]>()
  for (const item of itens) {
    const chave = chaveDe(item)
    const lista = mapa.get(chave)
    if (lista) lista.push(item)
    else mapa.set(chave, [item])
  }
  return mapa
}

function mediaDosMacros(dias: DiaRelatorio[]) {
  const campos = ['proteinas', 'carboidratos', 'gorduras', 'fibras'] as const
  const saida = {} as Record<(typeof campos)[number], number | null>
  let houve = false

  for (const campo of campos) {
    const valores = dias.map(d => d[campo]).filter((v): v is number => v !== null)
    saida[campo] = valores.length > 0 ? media(valores) : null
    if (valores.length > 0) houve = true
  }

  return houve ? saida : null
}

function resumoDoPeso(pesagens: { data: string; kg: number }[]): ResumoPeso | null {
  if (pesagens.length === 0) return null

  const ordenadas = [...pesagens].sort((a, b) => a.data.localeCompare(b.data))
  const primeira = ordenadas[0]
  const ultima = ordenadas[ordenadas.length - 1]
  const variacao = ultima.kg - primeira.kg

  const diasEntre =
    (dataDe(ultima.data).getTime() - dataDe(primeira.data).getTime()) / (1000 * 60 * 60 * 24)

  return {
    inicial: primeira.kg,
    atual: ultima.kg,
    variacao,
    /* Uma pesagem só, ou duas no mesmo dia: não há ritmo a declarar, e dividir
       por zero devolveria Infinity na tela. */
    kgPorSemana: diasEntre >= 1 ? (variacao / diasEntre) * 7 : 0,
    serie: ordenadas.map(p => p.kg),
    pesagens: ordenadas.length,
  }
}

/* Minutos desde a meia-noite. 'HH:MM' e 'HH:MM:SS' entram igual — o Postgres
   devolve o segundo formato para colunas `time`. */
const minutosDe = (hora: string) => {
  const [h, m] = hora.split(':')
  return Number(h) * 60 + Number(m)
}

function resumoDoSono(noites: Noite[], metaHoras: number | null): ResumoSonoPeriodo | null {
  if (noites.length === 0) return null

  const contagem = new Map<Fator, number>()
  for (const n of noites) {
    for (const f of n.fatores) contagem.set(f, (contagem.get(f) ?? 0) + 1)
  }

  return {
    mediaDormindoMin: media(noites.map(tempoDormindo)),
    mediaEficiencia: media(noites.map(n => eficiencia(n) ?? 0)),
    noites: noites.length,
    naMeta:
      metaHoras !== null && metaHoras > 0
        ? noites.filter(n => tempoDormindo(n) >= metaHoras * 60).length
        : null,
    fatores: [...contagem.entries()]
      .map(([fator, vezes]) => ({ fator, rotulo: NOME_DO_FATOR[fator], vezes }))
      .sort((a, b) => b.vezes - a.vezes),
    irregularidadeMin: irregularidadeDe(noites),
  }
}

/* Quanto o horário de deitar varia, em minutos, em torno do horário típico.
 *
 * Desvio médio absoluto em vez de desvio padrão: é a mesma ideia, sobrevive a
 * poucas noites e "varia 40 minutos para mais ou para menos" é uma frase que se
 * entende sem ter estudado estatística.
 *
 * As horas são medidas a partir do meio-dia, e não da meia-noite: deitar às
 * 23:50 e à 00:10 são vinte minutos de diferença, mas na régua da meia-noite
 * viram 1.420 e 10 — e a conta acusaria uma variação de 23 horas. */
function irregularidadeDe(noites: Noite[]): number | null {
  if (noites.length < 3) return null

  const MEIO_DIA = 12 * 60
  const horarios = noites.map(n => {
    const m = minutosDe(n.deitou)
    return m < MEIO_DIA ? m + 24 * 60 : m
  })

  const tipico = media(horarios)
  return media(horarios.map(h => Math.abs(h - tipico)))
}

/* ── Os padrões ────────────────────────────────────────────────────────────*/

/* Amostra mínima de cada lado de uma comparação. Abaixo de três, a diferença
   entre dois grupos é ruído com cara de descoberta — e uma frase confiante
   sobre duas noites é pior do que nenhuma frase. */
const MINIMO_POR_GRUPO = 3

const minutos = (m: number) => {
  const h = Math.floor(Math.abs(m) / 60)
  const rest = Math.round(Math.abs(m) % 60)
  if (h === 0) return `${rest}min`
  return rest === 0 ? `${h}h` : `${h}h${String(rest).padStart(2, '0')}`
}

const porcento = (f: number) => `${Math.round(Math.abs(f) * 100)}%`

function acharPadroes(dias: DiaRelatorio[], metas: Metas): Padrao[] {
  return [
    padraoJantarTardio(dias),
    padraoFatorDoSono(dias),
    padraoFimDeSemana(dias, metas),
    padraoAguaNoturna(dias),
    padraoAlimentoRepetido(dias),
  ].filter((p): p is Padrao => p !== null)
}

/* A última refeição do dia anterior contra o sono daquela noite.
 *
 * Este é o cruzamento que só este app consegue fazer: o horário da comida vem
 * de app_consumo_itens e o de deitar vem de app_sono_noites, e nenhum rastreador
 * de sono do mercado tem a primeira metade. Para uma nutricionista, é a ponte
 * entre as duas queixas que ela mais ouve. */
function padraoJantarTardio(dias: DiaRelatorio[]): Padrao | null {
  const porData = new Map(dias.map(d => [d.data, d]))

  const perto: number[] = []
  const longe: number[] = []

  for (const dia of dias) {
    if (!dia.noite) continue

    /* A noite é indexada pelo dia em que se ACORDOU — ver o topo de lib/sono.ts.
       A comida que interessa é, portanto, a da véspera. */
    const vespera = new Date(dataDe(dia.data))
    vespera.setDate(vespera.getDate() - 1)
    const daVespera = porData.get(dataISO(vespera))
    if (!daVespera || daVespera.itens.length === 0) continue

    const ultima = daVespera.itens.reduce((a, b) => (a.comidoEm >= b.comidoEm ? a : b))
    const comeu = new Date(ultima.comidoEm)
    const comeuMin = comeu.getHours() * 60 + comeu.getMinutes()

    /* Volta ao ciclo de 24h: comer às 22h e deitar à 00:30 são 150 minutos, não
       −1.290. Mesma aritmética de tempoNaCama em lib/sono.ts. */
    const janela = ((minutosDe(dia.noite.deitou) - comeuMin) % 1440 + 1440) % 1440

    /* Uma janela enorme não é jantar tardio: é um dia em que a última refeição
       foi o almoço, e ele não diz nada sobre a noite. */
    if (janela > 12 * 60) continue
    ;(janela < 120 ? perto : longe).push(tempoDormindo(dia.noite))
  }

  if (perto.length < MINIMO_POR_GRUPO || longe.length < MINIMO_POR_GRUPO) return null

  const diferenca = media(perto) - media(longe)
  /* Meia hora é o piso do que vale contar. Abaixo disso está dentro do erro de
     quem estima a própria hora de dormir olhando o teto. */
  if (Math.abs(diferenca) < 30) return null

  const pior = diferenca < 0

  return {
    chave: 'jantar-tardio',
    icone: 'moon-outline',
    titulo: pior ? 'Comer perto de deitar encurtou seu sono' : 'Comer perto de deitar não atrapalhou',
    texto: pior
      ? `Nas ${perto.length} noites em que você comeu menos de 2h antes de deitar, dormiu ${minutos(diferenca)} a menos do que nas outras ${longe.length}.`
      : `Nas ${perto.length} noites em que você comeu menos de 2h antes de deitar, dormiu ${minutos(diferenca)} a mais do que nas outras ${longe.length}.`,
    tom: pior ? 'atencao' : 'neutro',
  }
}

/* O fator marcado que mais custou sono. Os chips já eram uma lista de suspeitas;
   aqui eles viram um número. */
function padraoFatorDoSono(dias: DiaRelatorio[]): Padrao | null {
  const noites = dias.map(d => d.noite).filter((n): n is Noite => n !== null)
  if (noites.length < MINIMO_POR_GRUPO * 2) return null

  let pior: { fator: Fator; diferenca: number; vezes: number } | null = null

  for (const fator of new Set(noites.flatMap(n => n.fatores))) {
    const com = noites.filter(n => n.fatores.includes(fator))
    const sem = noites.filter(n => !n.fatores.includes(fator))
    if (com.length < MINIMO_POR_GRUPO || sem.length < MINIMO_POR_GRUPO) continue

    const diferenca = media(com.map(tempoDormindo)) - media(sem.map(tempoDormindo))
    if (diferenca >= -30) continue
    if (!pior || diferenca < pior.diferenca) pior = { fator, diferenca, vezes: com.length }
  }

  if (!pior) return null

  return {
    chave: `fator-${pior.fator}`,
    icone: 'moon-outline',
    titulo: `${NOME_DO_FATOR[pior.fator]} aparece nas suas piores noites`,
    texto: `Nas ${pior.vezes} noites em que você marcou este fator, dormiu ${minutos(pior.diferenca)} a menos que nas demais.`,
    tom: 'atencao',
  }
}

/* Fim de semana contra dia de semana. Duas médias, o assunto que tiver a maior
   distância entre elas — água e caloria competem pelo mesmo espaço na tela, e
   mostrar as duas sempre encheria o relatório de obviedades. */
function padraoFimDeSemana(dias: DiaRelatorio[], metas: Metas): Padrao | null {
  const fds = (d: DiaRelatorio) => d.diaSemana === 0 || d.diaSemana === 6

  const candidatos: { assunto: string; fim: number[]; util: number[]; unidade: string }[] = [
    {
      assunto: 'calorias',
      fim: dias.filter(fds).map(d => d.calorias).filter((v): v is number => v !== null),
      util: dias.filter(d => !fds(d)).map(d => d.calorias).filter((v): v is number => v !== null),
      unidade: 'kcal',
    },
    {
      assunto: 'água',
      fim: dias.filter(fds).map(d => d.aguaMl).filter((v): v is number => v !== null),
      util: dias.filter(d => !fds(d)).map(d => d.aguaMl).filter((v): v is number => v !== null),
      unidade: 'ml',
    },
  ]

  let melhor: { assunto: string; variacao: number; fim: number; util: number } | null = null

  for (const c of candidatos) {
    /* Dois dias de fim de semana é uma semana inteira registrada; exigir três
       jogaria fora o período de 7 dias, em que só existem dois. */
    if (c.fim.length < 2 || c.util.length < MINIMO_POR_GRUPO) continue

    const mediaFim = media(c.fim)
    const mediaUtil = media(c.util)
    if (mediaUtil === 0) continue

    const variacao = (mediaFim - mediaUtil) / mediaUtil
    /* Quinze por cento: abaixo disso é a variação normal de qualquer semana, e
       um aviso que aparece sempre deixa de ser lido. */
    if (Math.abs(variacao) < 0.15) continue
    if (!melhor || Math.abs(variacao) > Math.abs(melhor.variacao)) {
      melhor = { assunto: c.assunto, variacao, fim: mediaFim, util: mediaUtil }
    }
  }

  if (!melhor) return null

  const subiu = melhor.variacao > 0
  const ehAgua = melhor.assunto === 'água'
  /* Beber mais é bom, comer mais nem sempre — mas o tom aqui não julga a
     caloria: quem está em ganho de peso quer justamente ver isso subir. Só a
     água tem uma direção óbvia. */
  const tom: Padrao['tom'] = ehAgua ? (subiu ? 'bom' : 'atencao') : 'neutro'

  return {
    chave: 'fim-de-semana',
    icone: 'calendar-outline',
    titulo: `Seu fim de semana é diferente${ehAgua ? ' na hidratação' : ' na alimentação'}`,
    texto: `Aos sábados e domingos você consome ${porcento(melhor.variacao)} ${subiu ? 'a mais' : 'a menos'} de ${melhor.assunto} que nos dias de semana.`,
    tom,
  }
}

/* Quando a água entra no dia. Beber tudo à noite é a forma mais comum de bater
   a meta e mesmo assim passar o dia desidratado — e o total diário, sozinho,
   esconde isso por completo. */
function padraoAguaNoturna(dias: DiaRelatorio[]): Padrao | null {
  const comAgua = dias.filter(d => d.goles.length > 0)
  if (comAgua.length < 4) return null

  let tarde = 0
  let total = 0

  for (const dia of comAgua) {
    for (const gole of dia.goles) {
      total += gole.ml
      if (new Date(gole.bebidoEm).getHours() >= 18) tarde += gole.ml
    }
  }

  if (total === 0) return null
  const fracao = tarde / total
  if (fracao < 0.45) return null

  return {
    chave: 'agua-noturna',
    icone: 'water-outline',
    titulo: 'Você concentra a água no fim do dia',
    texto: `${porcento(fracao)} do que você bebe entra depois das 18h. Puxar parte disso para a manhã costuma render mais disposição — e menos idas ao banheiro de madrugada.`,
    tom: 'atencao',
  }
}

/* O que mais se repete no prato. Sem juízo de valor: dizer que o alimento é bom
   ou ruim é trabalho da nutricionista, e o app não tem contexto para isso. */
function padraoAlimentoRepetido(dias: DiaRelatorio[]): Padrao | null {
  const contagem = new Map<string, { nome: string; vezes: number }>()

  for (const dia of dias) {
    for (const item of dia.itens) {
      const chave = item.nome.trim().toLowerCase()
      if (!chave) continue
      const atual = contagem.get(chave)
      if (atual) atual.vezes++
      else contagem.set(chave, { nome: item.nome.trim(), vezes: 1 })
    }
  }

  const top = [...contagem.values()].sort((a, b) => b.vezes - a.vezes).slice(0, 3)
  if (top.length === 0 || top[0].vezes < 3) return null

  const lista = top
    .filter(t => t.vezes >= 3)
    .map(t => `${t.nome} (${t.vezes}×)`)
    .join(', ')

  return {
    chave: 'repetidos',
    icone: 'repeat-outline',
    titulo: 'O que mais se repete no seu prato',
    texto: `${lista}. Vale levar essa lista para a consulta: é sobre ela que a maior parte da sua rotina alimentar se apoia.`,
    tom: 'neutro',
  }
}

/* ── Barras ────────────────────────────────────────────────────────────────
   Um período de 90 dias não cabe em 90 barras num telefone. Acima do limite as
   barras viram semanas, e o rótulo passa a ser a data de início de cada uma. */

export type Coluna = {
  chave: string
  rotulo: string
  /* null é coluna sem registro: a tela desenha o trilho vazio, e não uma barra
     no chão — que seria lida como "bebeu zero". */
  valor: number | null
}

export function colunasDe(
  dias: DiaRelatorio[],
  valorDe: (d: DiaRelatorio) => number | null,
): Coluna[] {
  const ROTULOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

  if (dias.length <= MAXIMO_DE_BARRAS_DIARIAS) {
    return dias.map(d => ({
      chave: d.data,
      rotulo: ROTULOS[d.diaSemana],
      valor: valorDe(d),
    }))
  }

  /* Semanas fechadas a partir do FIM: o pedaço incompleto, se houver, fica no
     começo do gráfico. Sobrar meia semana no fim faria a última barra parecer
     uma queda que não aconteceu. */
  const colunas: Coluna[] = []
  for (let fim = dias.length; fim > 0; fim -= 7) {
    const grupo = dias.slice(Math.max(fim - 7, 0), fim)
    const valores = grupo.map(valorDe).filter((v): v is number => v !== null)
    const inicio = dataDe(grupo[0].data)

    colunas.unshift({
      chave: grupo[0].data,
      rotulo: `${inicio.getDate()}/${inicio.getMonth() + 1}`,
      /* Média, e não soma: a linha da meta é diária, e uma soma semanal a
         atravessaria sempre por cima. */
      valor: valores.length > 0 ? media(valores) : null,
    })
  }

  return colunas
}

/* "1 a 7 de agosto", "28 de julho a 3 de agosto". O intervalo por extenso, para
   o cabeçalho dizer exatamente o que está sendo medido. */
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export function intervaloPorExtenso({ de, ate }: Intervalo): string {
  const inicio = dataDe(de)
  const fim = dataDe(ate)

  if (inicio.getMonth() === fim.getMonth() && inicio.getFullYear() === fim.getFullYear()) {
    return `${inicio.getDate()} a ${fim.getDate()} de ${MESES_CURTOS[fim.getMonth()]}`
  }

  return `${inicio.getDate()} de ${MESES_CURTOS[inicio.getMonth()]} a ${fim.getDate()} de ${MESES_CURTOS[fim.getMonth()]}`
}
