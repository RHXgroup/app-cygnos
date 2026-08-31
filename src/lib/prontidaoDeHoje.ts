/* Como o corpo dela chegou hoje — e o que isso sugere para o treino.
 *
 * ── A lacuna do mercado inteiro ───────────────────────────────────────────
 * Pesquisei os três melhores aplicativos de treino (Strong, Hevy, Fitbod) e a
 * análise comparativa diz, sobre os três juntos:
 *
 *   "Nenhum deles lê sono, HRV ou dados de recuperação para ajustar o treino
 *    de hoje."
 *
 * O Fitbod chega perto: ele monta o treino pela recuperação MUSCULAR — o que
 * você treinou ontem, o que está descansado. Mas isso é o histórico de treino
 * olhando para si mesmo. Nenhum deles sabe que a pessoa dormiu quatro horas,
 * porque nenhum deles tem o sono.
 *
 * Este app tem. É a única vantagem estrutural que existe aqui, e é a mesma de
 * sempre: os dados moram juntos.
 *
 * ── E por que isto é SUGESTÃO, e nunca ordem ──────────────────────────────
 * Três razões, e a terceira é a que decide:
 *
 *   1. O app mede uma noite, e não o corpo. Quem dormiu mal por causa de um
 *      filho doente pode estar ótimo para treinar; quem dormiu oito horas pode
 *      estar gripado.
 *
 *   2. Mandar diminuir carga é prescrição de treino, e não é o app quem
 *      prescreve.
 *
 *   3. Uma sugestão que a pessoa pode ignorar continua sendo útil no dia em que
 *      ela estiver certa. Uma ordem que ela ignorou uma vez vira ruído para
 *      sempre — e aí o app perde também os dias em que estava certo.
 *
 * Por isso a frase nunca começa com verbo no imperativo, e sempre deixa a
 * decisão com ela.
 *
 * ── Só `import type` ──────────────────────────────────────────────────────
 * Roda fora do aparelho. */

import { ehDataReal } from './datas.ts'

/* A noite reduzida ao que importa aqui. Recebe minutos já calculados — o quanto
   ela DORMIU, e não o quanto ficou na cama —, porque descontar a latência é
   conta de `sono.ts` e não pode ficar em dois lugares. */
export type NoiteCurta = {
  data: string
  minutos: number | null
  /* 1 a 5, como ela avaliou. Nula quando não respondeu. */
  qualidade: number | null
}

export type Prontidao = {
  nivel: 'boa' | 'media' | 'baixa'
  /* A frase para a tela. Nula quando não há o que dizer — sem noite registrada
     o app fica calado, em vez de inventar disposição. */
  frase: string | null
  /* Quantos minutos a noite teve. A tela mostra junto, porque um conselho sem o
     número que o gerou é palpite. */
  minutos: number | null
}

export const SEM_PRONTIDAO: Prontidao = { nivel: 'media', frase: null, minutos: null }

/* Os cortes.
 *
 * Seis horas é o limite de sono insuficiente em adulto que a literatura usa, e
 * é o mesmo corte que as descobertas já usam — dois números diferentes para a
 * mesma ideia fariam o app dizer "noite curta" numa tela e "noite normal"
 * noutra. */
const NOITE_CURTA = 6 * 60
const NOITE_MUITO_CURTA = 5 * 60
/* Sete horas para chamar de boa. Abaixo disso não é ruim, é média — e chamar de
   boa o que é média tira o sentido da palavra. */
const NOITE_BOA = 7 * 60

const numero = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null

/* A noite de HOJE, e a prontidão que ela sugere.
 *
 * A noite é indexada pelo dia em que ela ACABOU — é assim que `app_sono_noites`
 * guarda —, então a madrugada de hoje está registrada com a data de hoje. */
export function prontidaoDeHoje(noites: NoiteCurta[], hoje: string): Prontidao {
  if (!ehDataReal(hoje)) return SEM_PRONTIDAO

  const dela = noites.find(n => n.data === hoje)
  const minutos = dela ? numero(dela.minutos) : null
  /* Sem noite registrada, o app fica calado. Não há de onde tirar disposição, e
     supor que ela dormiu bem seria inventar o dado mais importante da frase. */
  if (minutos === null) return SEM_PRONTIDAO

  const horas = Math.floor(minutos / 60)
  const min = minutos % 60
  const quanto = min === 0 ? `${horas}h` : `${horas}h${String(min).padStart(2, '0')}`

  if (minutos < NOITE_MUITO_CURTA) {
    return {
      nivel: 'baixa',
      minutos,
      /* Oferece uma saída concreta em vez de só constatar. "Dormiu pouco" é
         informação que ela já tem; o que falta é o que fazer com isso. */
      frase:
        `Você dormiu ${quanto}. Se o treino de hoje pesar, diminuir a carga e manter as séries ` +
        'costuma render mais do que insistir — mas quem sente o corpo é você.',
    }
  }

  if (minutos < NOITE_CURTA) {
    return {
      nivel: 'baixa',
      minutos,
      frase: `Você dormiu ${quanto}. Vale começar pelo aquecimento e decidir a carga depois dele.`,
    }
  }

  if (minutos >= NOITE_BOA) {
    /* A noite boa também é dita, e não só a ruim. Um app que só fala quando
       está ruim vira um app que a pessoa evita abrir — e é o mesmo motivo de
       toda categoria de sintoma do ciclo ter a opção positiva. */
    return { nivel: 'boa', minutos, frase: `Você dormiu ${quanto}. Bom dia para puxar mais.` }
  }

  return { nivel: 'media', minutos, frase: null }
}

/* A média de sono dos últimos dias, para quando a noite de hoje não existe.
 *
 * Não entra na prontidão — prontidão é sobre HOJE. Existe para a tela poder
 * dizer alguma coisa a quem registra sono às vezes, sem fingir que sabe da
 * madrugada que não foi anotada. */
export function mediaDeSono(noites: NoiteCurta[], dias = 7): number | null {
  const uteis = noites
    .map(n => numero(n.minutos))
    .filter((m): m is number => m !== null)
    .slice(0, dias)
  if (uteis.length < 3) return null
  return Math.round(uteis.reduce((s, m) => s + m, 0) / uteis.length)
}
