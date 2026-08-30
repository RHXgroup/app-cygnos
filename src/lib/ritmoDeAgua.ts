import { carregarNoites, type Noite } from './sono'
import { carregarMetasAtivas } from './metas'

/* Quando beber, e não só quanto.
 *
 * A meta de água diz dois litros e para por aí. Quem abre o app às dez da noite
 * com zero registrado não tem como recuperar o dia — e quem bebeu tudo de manhã
 * aparece igualzinho a quem distribuiu, porque o número do topo é o mesmo nos
 * dois casos.
 *
 * ── A janela sai do SONO, e não de um horário inventado ────────────────────
 * O app já sabe a que horas a pessoa acorda e deita: está gravado em cada noite.
 * Usar isso é a diferença entre "beba às 9h" para quem levanta às 5h30 e um
 * ritmo que cabe no dia dela.
 *
 * Sem noite registrada, o padrão é 7h às 23h — e é padrão declarado, não
 * palpite escondido: a tela diz que está usando um horário genérico enquanto
 * não houver sono anotado. */

/* Minutos desde a meia-noite. */
export type Janela = { acorda: number; dorme: number }

export const JANELA_PADRAO: Janela = { acorda: 7 * 60, dorme: 23 * 60 }

/* Nem no primeiro minuto acordado, nem colado na hora de dormir.
 *
 * A folga do fim não é estética: água na última hora antes de deitar acorda a
 * pessoa de madrugada, e o app que mede o sono dela não pode ser o mesmo que
 * atrapalha o sono dela. */
const APOS_ACORDAR = 30
const ANTES_DE_DORMIR = 90

/* Menos que três avisos não é ritmo, é lembrete solto. Mais que seis a pessoa
   desliga a notificação — e junto vai a da refeição, que é a que importa. */
const MINIMO = 3
const MAXIMO = 6

const minutosDe = (hora: string): number | null => {
  const [h, m] = hora.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}

/* A mediana, e não a média: uma virada até as quatro da manhã num sábado
   deslocaria a média do mês inteiro, e a mediana ignora o caso isolado. */
function mediana(ns: number[]): number {
  const ordenados = [...ns].sort((a, b) => a - b)
  const meio = Math.floor(ordenados.length / 2)
  return ordenados.length % 2 === 1
    ? ordenados[meio]
    : Math.round((ordenados[meio - 1] + ordenados[meio]) / 2)
}

/* A janela de quem está acordado, tirada das noites registradas.
 *
 * Null com menos de três noites: duas madrugadas não são uma rotina, e montar
 * o dia de alguém em cima delas seria inventar. */
export function janelaDe(noites: Noite[]): Janela | null {
  if (noites.length < 3) return null

  const acordou = noites.map(n => minutosDe(n.levantou)).filter((m): m is number => m !== null)
  const deitou = noites.map(n => minutosDe(n.deitou)).filter((m): m is number => m !== null)
  if (acordou.length < 3 || deitou.length < 3) return null

  const acorda = mediana(acordou)
  /* Deitar depois da meia-noite conta como fim do dia anterior: 00:30 é 24:30,
     e não meia hora da manhã. Sem isto, quem dorme tarde teria uma janela
     negativa e o ritmo sairia ao contrário. */
  const dorme = mediana(deitou.map(m => (m < 12 * 60 ? m + 24 * 60 : m)))

  if (dorme - acorda < 6 * 60) return null

  return { acorda, dorme }
}

/* Os horários do dia, em minutos, para bater a meta sem correria.
 *
 * Quantos: o que a meta pede em copos, limitado entre três e seis. Meta de
 * quatro litros com copo de duzentos não vira vinte avisos — vira seis goles
 * maiores, porque o que falha não é a conta, é a paciência de quem recebe. */
export function horariosDeAgua(
  metaMl: number,
  copoMl: number,
  janela: Janela = JANELA_PADRAO,
): number[] {
  if (metaMl <= 0 || copoMl <= 0) return []

  const inicio = janela.acorda + APOS_ACORDAR
  const fim = janela.dorme - ANTES_DE_DORMIR
  if (fim <= inicio) return []

  const copos = Math.ceil(metaMl / copoMl)
  const quantos = Math.min(Math.max(copos, MINIMO), MAXIMO)

  /* O primeiro logo depois de acordar e o último bem antes de deitar, com o
     resto espalhado entre eles. Com um só, fica no meio da janela. */
  if (quantos === 1) return [Math.round((inicio + fim) / 2)]

  const passo = (fim - inicio) / (quantos - 1)
  return Array.from({ length: quantos }, (_, i) => Math.round(inicio + passo * i))
}

/* Quanto beber em cada um desses horários, para a soma fechar a meta. */
export const mlPorGole = (metaMl: number, quantos: number) =>
  quantos <= 0 ? 0 : Math.round(metaMl / quantos / 10) * 10

/* "07:30" */
export const comoHora = (minutos: number) => {
  const m = ((minutos % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/* ── O ritmo de quem está usando o app ──────────────────────────────────────
 *
 * Junta as duas pontas que já existiam e não se falavam: a meta de água, que
 * diz quanto, e as noites registradas, que dizem quando a pessoa está de pé.
 *
 * Falha em qualquer uma cai no padrão em vez de estourar — quem ligou o
 * lembrete quer um lembrete, não uma mensagem de erro. E `daJanelaPadrao` diz à
 * tela que o horário é genérico, para ela poder convidar a registrar o sono em
 * vez de deixar a pessoa achando que o app adivinhou a rotina dela. */
export type RitmoDeAgua = {
  horarios: number[]
  mlPorVez: number
  janela: Janela
  daJanelaPadrao: boolean
}

export async function ritmoDeAgua(contaId: string): Promise<RitmoDeAgua | null> {
  const [rMetas, rNoites] = await Promise.all([
    carregarMetasAtivas(contaId).catch(() => null),
    carregarNoites(contaId, 14).catch(() => null),
  ])

  const metas = rMetas?.tipo === 'ok' ? rMetas.metas : null
  if (!metas?.aguaMl || !metas.copoMl) return null

  const noites = rNoites?.tipo === 'ok' ? rNoites.noites : []
  const daJanela = janelaDe(noites)
  const janela = daJanela ?? JANELA_PADRAO

  const horarios = horariosDeAgua(metas.aguaMl, metas.copoMl, janela)
  if (horarios.length === 0) return null

  return {
    horarios,
    mlPorVez: mlPorGole(metas.aguaMl, horarios.length),
    janela,
    daJanelaPadrao: daJanela === null,
  }
}
