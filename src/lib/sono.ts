import { dataISO } from './formatar'
import { supabase } from './supabase'
import { falha } from './erros'

/* O sono, noite a noite. Ver a migração 20260801000007.
 *
 * A noite é indexada pelo dia em que a pessoa ACORDOU: a noite de 31/07 para
 * 01/08 é a noite do dia 01. É como se fala de manhã e é como todo rastreador de
 * sono indexa — deitar-se é que atravessa a meia-noite, acordar não. */

export type ComoAcordou = 'descansado' | 'media' | 'cansado'

export type Fator =
  | 'cafeina'
  | 'alcool'
  | 'refeicao_pesada'
  | 'tela'
  | 'exercicio_tarde'
  | 'estresse'
  | 'dor'
  | 'ruido'
  | 'crianca'
  | 'medicacao'
  | 'viagem'

/* Os chips da tela, na ordem em que aparecem. Os três primeiros são os que
   ligam sono a NUTRIÇÃO — os únicos desta lista sobre os quais uma nutricionista
   pode agir, e os únicos que relógio nenhum coleta. Por isso vêm antes. */
export const FATORES: { chave: Fator; rotulo: string }[] = [
  { chave: 'cafeina', rotulo: 'Cafeína à tarde' },
  { chave: 'alcool', rotulo: 'Álcool' },
  { chave: 'refeicao_pesada', rotulo: 'Jantar pesado' },
  { chave: 'tela', rotulo: 'Tela até tarde' },
  { chave: 'exercicio_tarde', rotulo: 'Exercício à noite' },
  { chave: 'estresse', rotulo: 'Estresse' },
  { chave: 'dor', rotulo: 'Dor ou desconforto' },
  { chave: 'ruido', rotulo: 'Barulho' },
  { chave: 'crianca', rotulo: 'Criança ou bebê' },
  { chave: 'medicacao', rotulo: 'Medicação' },
  { chave: 'viagem', rotulo: 'Viagem ou fuso' },
]

export const NOME_DO_FATOR: Record<Fator, string> = Object.fromEntries(
  FATORES.map(f => [f.chave, f.rotulo]),
) as Record<Fator, string>

export const COMO_ACORDOU: { chave: ComoAcordou; rotulo: string }[] = [
  { chave: 'descansado', rotulo: 'Descansado' },
  { chave: 'media', rotulo: 'Na média' },
  { chave: 'cansado', rotulo: 'Cansado' },
]

export type Noite = {
  id: string
  /* 'YYYY-MM-DD', o dia em que acordou. */
  data: string
  deitou: string
  levantou: string
  latenciaMin: number | null
  despertares: number | null
  qualidade: number | null
  acordou: ComoAcordou | null
  cochilosMin: number | null
  fatores: Fator[]
  observacao: string | null
  origem: 'manual' | 'apple_health' | 'health_connect'
}

/* O que a tela monta para gravar. Sem id — a chave é (conta, data). */
export type NoiteParaGravar = Omit<Noite, 'id' | 'origem'>

/* Os limites são os dos constraints do banco. Repetidos aqui para a tela poder
   recusar antes de enviar, com uma frase que explica. */
export const LIMITES = {
  latenciaMin: { min: 0, max: 480 },
  despertares: { min: 0, max: 20 },
  cochilosMin: { min: 0, max: 600 },
} as const

/* ── Contas do sono ────────────────────────────────────────────────────────*/

const minutosDe = (hora: string) => {
  const [h, m] = hora.split(':')
  return Number(h) * 60 + Number(m)
}

const MINUTOS_DO_DIA = 24 * 60

/* Quanto tempo na cama, em minutos. Atravessa a meia-noite: deitar às 23:30 e
   levantar às 07:15 dá 465, não −975. */
export function tempoNaCama(deitou: string, levantou: string): number {
  const bruto = minutosDe(levantou) - minutosDe(deitou)
  return ((bruto % MINUTOS_DO_DIA) + MINUTOS_DO_DIA) % MINUTOS_DO_DIA
}

/* Tempo dormindo: o tempo na cama menos o que se levou para pegar no sono.
 *
 * Os despertares NÃO são descontados. Quanto tempo se ficou acordado em cada um
 * é coisa que ninguém consegue relatar, e inventar um desconto — "cinco minutos
 * por despertar" — produziria um número que parece medido e não é. Eles contam
 * como sinal de qualidade, não como subtração. */
export const tempoDormindo = (n: Pick<Noite, 'deitou' | 'levantou' | 'latenciaMin'>) =>
  Math.max(tempoNaCama(n.deitou, n.levantou) - (n.latenciaMin ?? 0), 0)

/* Eficiência do sono: quanto do tempo na cama virou sono, em porcentagem.
 *
 * É métrica clínica de verdade e sai de graça dos campos acima. Oito horas na
 * cama dormindo cinco é um problema que "dormi das 23h às 7h" esconde por
 * completo — e é o número que costuma explicar o cansaço de quem jura que dorme
 * o suficiente. Acima de 85% é o que se considera bom. */
export function eficiencia(n: Pick<Noite, 'deitou' | 'levantou' | 'latenciaMin'>): number | null {
  const naCama = tempoNaCama(n.deitou, n.levantou)
  if (naCama === 0) return null
  return (tempoDormindo(n) / naCama) * 100
}

/* 465 → "7h45". Sem ":" para não parecer horário: 7h45 de sono é uma duração,
   e "7:45" seria lido como a hora em que alguma coisa aconteceu. */
export function duracao(minutos: number): string {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  if (h === 0) return `${m}min`
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
}

/* ── Banco ─────────────────────────────────────────────────────────────────*/

export type ResultadoNoites = { tipo: 'ok'; noites: Noite[] } | { tipo: 'erro'; mensagem: string }

const COLUNAS =
  'id, data, deitou, levantou, latencia_min, despertares, qualidade, acordou, cochilos_min, fatores, observacao, origem'

type Linha = {
  id: string
  data: string
  deitou: string
  levantou: string
  latencia_min: number | null
  despertares: number | null
  qualidade: number | null
  acordou: ComoAcordou | null
  cochilos_min: number | null
  fatores: Fator[] | null
  observacao: string | null
  origem: Noite['origem']
}

const daLinha = (l: Linha): Noite => ({
  id: l.id,
  data: l.data,
  deitou: l.deitou,
  levantou: l.levantou,
  latenciaMin: l.latencia_min,
  despertares: l.despertares,
  qualidade: l.qualidade,
  acordou: l.acordou,
  cochilosMin: l.cochilos_min,
  fatores: l.fatores ?? [],
  observacao: l.observacao,
  origem: l.origem,
})

/* As noites mais recentes, da mais nova para a mais antiga. */
export async function carregarNoites(contaId: string, quantas = 30): Promise<ResultadoNoites> {
  const { data, error } = await supabase
    .from('app_sono_noites')
    .select(COLUNAS)
    .eq('conta_id', contaId)
    .order('data', { ascending: false })
    .limit(quantas)

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui carregar as suas noites. Verifique a conexão.', error),
    }
  return { tipo: 'ok', noites: ((data ?? []) as Linha[]).map(daLinha) }
}

export type ResultadoNoite = { tipo: 'ok'; noite: Noite } | { tipo: 'erro'; mensagem: string }

/* Grava a noite. Upsert em (conta, data): registrar de novo o mesmo dia CORRIGE
   a noite — ninguém dorme duas vezes na mesma madrugada, e a segunda tentativa é
   sempre uma correção. */
export async function salvarNoite(
  contaId: string,
  n: NoiteParaGravar,
): Promise<ResultadoNoite> {
  const { data, error } = await supabase
    .from('app_sono_noites')
    .upsert(
      {
        conta_id: contaId,
        data: n.data,
        deitou: n.deitou,
        levantou: n.levantou,
        latencia_min: n.latenciaMin,
        despertares: n.despertares,
        qualidade: n.qualidade,
        acordou: n.acordou,
        cochilos_min: n.cochilosMin,
        fatores: n.fatores,
        observacao: n.observacao?.trim() || null,
        origem: 'manual',
      },
      { onConflict: 'conta_id,data' },
    )
    .select(COLUNAS)
    .single()

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui salvar esta noite agora. Verifique a conexão.', error),
    }
  return { tipo: 'ok', noite: daLinha(data as Linha) }
}

export async function apagarNoite(id: string): Promise<{ erro: string } | null> {
  const { error } = await supabase.from('app_sono_noites').delete().eq('id', id)
  if (!error) return null
  return {
    erro: falha('Não consegui remover esta noite agora. Verifique a conexão.', error),
  }
}

/* ── Leitura das últimas noites ────────────────────────────────────────────*/

export type ResumoSono = {
  /* Média de tempo dormindo, em minutos, das noites que existem. */
  mediaDormindo: number
  mediaEficiencia: number
  /* Quantas noites entraram na conta. Vai junto porque uma média de duas noites
     e uma de trinta não valem o mesmo, e a tela precisa poder dizer isso. */
  quantas: number
  /* Os fatores mais marcados, do mais frequente para o menos. É o que
     transforma o diário em conversa com a nutricionista. */
  fatoresFrequentes: { fator: Fator; vezes: number }[]
}

/* As durações das últimas noites em ordem de calendário, para o traço do
   gráfico. Do mais antigo para o mais novo — ao contrário da lista, porque um
   gráfico que anda para trás no tempo mostraria a evolução ao contrário. */
export const serieDeSono = (noites: Noite[], quantas = 7): number[] =>
  [...noites]
    .sort((a, b) => a.data.localeCompare(b.data))
    .slice(-quantas)
    .map(tempoDormindo)

/* Quantas das noites registradas alcançaram a meta de horas.
 *
 * Conta sobre as noites que EXISTEM, não sobre os últimos sete dias do
 * calendário: quem registrou três noites na semana bateu a meta em duas de
 * três, não em duas de sete. Dizer "2 de 7" puniria a pessoa por não ter
 * registrado, que é outra conversa. */
export const noitesNaMeta = (noites: Noite[], metaHoras: number): number =>
  noites.filter(n => tempoDormindo(n) >= metaHoras * 60).length

/* ── A faixa da noite ──────────────────────────────────────────────────────
 *
 * O eixo vai das 18h de um dia às 12h do outro: dezoito horas, que é onde cabe
 * praticamente toda noite humana. Fora disso — quem deita às duas da tarde — o
 * traço encosta na borda em vez de sumir; distorcer a ponta é melhor do que
 * apagar a noite inteira do desenho.
 *
 * A conversão existe porque 23:30 e 00:30 estão a uma hora de distância e, em
 * minutos crus, a 1380 — o que faria a regularidade de quem dorme sempre à meia
 * -noite parecer a pior de todas. Hora antes do meio-dia pertence ao dia
 * seguinte, e é isso que a soma de 24h diz. */
export const INICIO_DA_FAIXA = 18 * 60
export const FIM_DA_FAIXA = 36 * 60

export function minutoDaNoite(hora: string): number {
  const [h, m] = hora.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return INICIO_DA_FAIXA
  return h < 12 ? (h + 24) * 60 + m : h * 60 + m
}

/* Quanto o horário de DEITAR varia, em minutos, de uma noite para a outra.
 *
 * É a leitura que falta nesta tela. Dormir sete horas todo dia entre meia-noite
 * e sete não é a mesma coisa que dormir sete horas indo para a cama às nove numa
 * noite e às três na outra — e a média de duração, que é o que a tela mostrava,
 * dá exatamente o mesmo número para os dois casos.
 *
 * Desvio médio absoluto, e não desvio padrão: "varia uns 40 minutos" é uma frase
 * que alguém entende, e é a mesma conta que a pessoa faria no papel.
 *
 * Null com menos de três noites: duas noites sempre "variam" alguma coisa entre
 * si, e chamar isso de padrão seria inventar. */
export function regularidade(noites: Noite[]): number | null {
  if (noites.length < 3) return null

  const deitares = noites.map(n => minutoDaNoite(n.deitou))
  const media = deitares.reduce((s, d) => s + d, 0) / deitares.length

  return Math.round(deitares.reduce((s, d) => s + Math.abs(d - media), 0) / deitares.length)
}

export function resumoDe(noites: Noite[]): ResumoSono | null {
  if (noites.length === 0) return null

  const contagem = new Map<Fator, number>()
  for (const n of noites) {
    for (const f of n.fatores) contagem.set(f, (contagem.get(f) ?? 0) + 1)
  }

  return {
    mediaDormindo: noites.reduce((s, n) => s + tempoDormindo(n), 0) / noites.length,
    mediaEficiencia: noites.reduce((s, n) => s + (eficiencia(n) ?? 0), 0) / noites.length,
    quantas: noites.length,
    fatoresFrequentes: [...contagem.entries()]
      .map(([fator, vezes]) => ({ fator, vezes }))
      .sort((a, b) => b.vezes - a.vezes),
  }
}

/* A data da noite que a tela abre por padrão.
 *
 * De manhã, "como você dormiu?" é sobre a madrugada que acabou de passar — o dia
 * de hoje. Mas quem abre o app às onze da noite ainda não dormiu a noite de hoje:
 * para essa pessoa a última noite registrável é a de ontem. O corte às 18h separa
 * os dois casos sem perguntar nada. */
export function noitePadrao(agora = new Date()): string {
  if (agora.getHours() < 18) return dataISO(agora)
  const ontem = new Date(agora)
  ontem.setDate(ontem.getDate() - 1)
  return dataISO(ontem)
}
