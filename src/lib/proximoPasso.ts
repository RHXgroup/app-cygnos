import type { ItemConsumo } from './consumo'
import type { Metas } from './metas'
import type { DiaSemana, PlanoCompleto } from './plano'
import type { Noite } from './sono'
import type { Exercicio, Sessao } from './treino'

/* A única coisa que a tela inicial precisa dizer agora.
 *
 * A tela abria com "Olá, Helton — vamos juntos em direção a sua melhor versão"
 * ocupando o topo, e sete cartões do mesmo tamanho embaixo: calorias, plano,
 * água, peso, sono, treino, próxima refeição. Nenhum deles dizia o que fazer
 * AGORA — às onze da manhã o cartão de sono ocupava o mesmo espaço que o de
 * calorias, e a saudação ocupava a área mais valiosa sem responder nada.
 *
 * ── Uma coisa, e não uma lista ─────────────────────────────────────────────
 * A tentação é mostrar tudo que está pendente. Isso recria o problema num
 * lugar novo: cinco avisos com o mesmo peso é o mesmo que nenhum. Aqui sai UM,
 * o mais urgente, e o resto continua nos cartões de sempre para quem procurar.
 *
 * ── A ordem é por consequência, não por assunto ────────────────────────────
 * O que passa da hora vem antes do que ainda dá tempo. Refeição que está
 * chegando vence água atrasada, porque a refeição tem hora e a água se recupera
 * ao longo do dia. E nada disso é cobrança: cada frase diz um fato e oferece
 * um caminho, sem "você não fez" nem "você está devendo".
 *
 * ── Só tipo, nenhum import de execução ─────────────────────────────────────
 * É o que permite exercitar isto fora do aparelho, e a regra do projeto. Por
 * isso o atraso da água chega PRONTO, em vez de esta função chamar o cálculo:
 * quem sabe repartir a meta pela janela acordada é `ritmoAgua`, e o que se
 * decide aqui é PRIORIDADE, não hidratação. Separar as duas coisas deixou as
 * duas testáveis. */

export type Passo = {
  chave: 'refeicao' | 'agua' | 'treino' | 'sono' | 'comida' | 'plano' | 'metas' | 'em_dia'
  texto: string
  /* O que o toque abre. `null` quando não há para onde ir — o "dia em dia". */
  destino: 'contador' | 'agua' | 'treino' | 'sono' | 'plano' | 'metas' | null
  icone: string
}

const minutosDe = (hora: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hora?.trim() ?? '')
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  return h > 23 || min > 59 ? null : h * 60 + min
}

/* Quanto falta para a próxima refeição do plano, em minutos. Null quando não há
   plano, quando o plano não vale hoje, ou quando o dia já passou da última. */
function faltaParaProximaRefeicao(
  plano: PlanoCompleto | null,
  agora: number,
  diaDeHoje: DiaSemana,
): { rotulo: string; emMinutos: number } | null {
  if (!plano || !plano.diasSemana.includes(diaDeHoje)) return null

  let melhor: { rotulo: string; emMinutos: number } | null = null
  for (const r of plano.refeicoes) {
    const h = minutosDe(r.hora)
    if (h === null || h < agora) continue
    const falta = h - agora
    if (!melhor || falta < melhor.emMinutos) melhor = { rotulo: r.rotulo, emMinutos: falta }
  }
  return melhor
}

const emQuanto = (minutos: number) =>
  minutos < 60 ? `em ${minutos} min` : `em ${Math.round(minutos / 60)}h`

const milhar = (n: number) => Math.round(n).toLocaleString('pt-BR')

/* Quantos minutos a refeição precisa estar de distância para virar aviso.
   Uma hora: menos que isso e a pessoa já está indo comer; mais e o aviso
   aparece cedo demais para servir de alguma coisa. */
const AVISO_DE_REFEICAO = 60

export function proximoPasso({
  metas,
  aguaAtrasadaMl,
  consumo,
  plano,
  noites,
  rotina,
  sessoes,
  agora = new Date(),
}: {
  metas: Metas
  /* Quantos mililitros faltam para o ritmo do dia, já calculado por
     `ritmoDaAgua`. Null quando está em dia, adiantada, ou fora da janela
     acordada — todos casos em que não há o que dizer. */
  aguaAtrasadaMl: number | null
  consumo: ItemConsumo[]
  plano: PlanoCompleto | null
  noites: Noite[]
  rotina: Exercicio[]
  sessoes: Sessao[]
  agora?: Date
}): Passo {
  const minutos = agora.getHours() * 60 + agora.getMinutes()
  const diaDeHoje = agora.getDay() as DiaSemana
  const hoje = [
    agora.getFullYear(),
    String(agora.getMonth() + 1).padStart(2, '0'),
    String(agora.getDate()).padStart(2, '0'),
  ].join('-')

  /* 1. Quem ainda não tem meta não tem o que acompanhar. Vem antes de tudo
        porque é o que destrava o resto do app — sem meta, os cartões mostram
        números sem referência. */
  if (metas.calorias === null && !plano) {
    return {
      chave: 'metas',
      texto: 'Defina sua meta de calorias para o dia começar a fazer sentido',
      destino: 'metas',
      icone: 'flag-outline',
    }
  }

  /* 2. Refeição chegando. Tem hora marcada, e hora marcada passa. */
  const refeicao = faltaParaProximaRefeicao(plano, minutos, diaDeHoje)
  if (refeicao && refeicao.emMinutos <= AVISO_DE_REFEICAO) {
    return {
      chave: 'refeicao',
      texto: `${refeicao.rotulo} ${emQuanto(refeicao.emMinutos)}`,
      destino: 'contador',
      icone: 'restaurant-outline',
    }
  }

  /* 3. Sono da noite passada, de manhã. Só até o meio-dia: perguntar às oito
        da noite como foi a noite anterior é perguntar de algo que já foi
        esquecido, e a resposta vem chutada. */
  if (minutos < 12 * 60 && metas.sonoHoras !== null && !noites.some(n => n.data === hoje)) {
    return {
      chave: 'sono',
      texto: 'Como você dormiu esta noite?',
      destino: 'sono',
      icone: 'moon-outline',
    }
  }

  /* 4. Nada anotado e o dia andando. Depois das onze porque quem toma café às
        nove e abre o app às nove e meia não está atrasado em nada. */
  if (consumo.length === 0 && minutos >= 11 * 60) {
    return {
      chave: 'comida',
      texto: 'Você ainda não anotou nada hoje',
      destino: 'contador',
      icone: 'add-circle-outline',
    }
  }

  /* 5. Treino do dia, e só nos dias que a rotina marca. Depois das seis da
        tarde: cobrar treino às dez da manhã de quem treina à noite seria
        errado todo dia. */
  const treinaHoje = rotina.some(e => e.dia === diaDeHoje)
  if (treinaHoje && minutos >= 18 * 60 && !sessoes.some(s => s.data === hoje)) {
    return {
      chave: 'treino',
      texto: 'Hoje é dia de treino na sua rotina',
      destino: 'treino',
      icone: 'barbell-outline',
    }
  }

  /* 6. Água atrasada. Por último entre os avisos porque é o que mais se
        recupera: quem está 500 ml atrás às três da tarde fecha o dia. */
  if (aguaAtrasadaMl !== null && aguaAtrasadaMl > 0) {
    return {
      chave: 'agua',
      texto: `Faltam ${milhar(aguaAtrasadaMl)} ml para o seu ritmo de água`,
      destino: 'agua',
      icone: 'water-outline',
    }
  }

  /* 7. Sem plano, e já registrando comida: é a hora de sugerir o próximo
        degrau. Depois dos avisos, porque montar plano não é urgente. */
  if (!plano && consumo.length > 0) {
    return {
      chave: 'plano',
      texto: 'Monte seu plano alimentar e o app passa a te dizer o que vem',
      destino: 'plano',
      icone: 'nutrition-outline',
    }
  }

  return {
    chave: 'em_dia',
    texto: 'Seu dia está em dia',
    destino: null,
    icone: 'checkmark-circle-outline',
  }
}
