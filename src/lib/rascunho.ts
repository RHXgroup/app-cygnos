import AsyncStorage from '@react-native-async-storage/async-storage'

/* O que a pessoa estava fazendo quando o app morreu.
 *
 * ── Por que isto existe ───────────────────────────────────────────────────
 * O Android mata app em segundo plano quando precisa de memória, e não avisa
 * ninguém. Os três lugares onde isso dói neste app:
 *
 *   O TREINO. A tela fica aberta 50 minutos, e boa parte deles com o telefone
 *   no bolso — que é exatamente a situação em que o sistema recolhe memória.
 *   Voltar e encontrar o cronômetro zerado, sem saber em que exercício estava
 *   nem quantas séries fez, é perder a sessão inteira no meio dela. E é o
 *   cenário para o qual o modo treino foi feito.
 *
 *   O QUESTIONÁRIO. Trinta perguntas respondidas somem. Quem perde isso não
 *   responde de novo.
 *
 *   A ROTINA POR IA. A resposta já foi PAGA. Perdê-la gasta dinheiro de novo
 *   para ter a mesma coisa.
 *
 * ── O que ele NÃO é ───────────────────────────────────────────────────────
 * Não é banco. Rascunho fica no aparelho, some quando o trabalho é concluído,
 * e VENCE — porque um treino de anteontem oferecido para retomar hoje é pior
 * do que nenhum. Quem decide o prazo é quem guarda.
 *
 * Nada aqui rejeita. Falhar ao guardar rascunho não pode derrubar o que a
 * pessoa está fazendo: no pior caso ela perde o que já perderia antes. */

type Envelope<T> = { em: number; dado: T }

const chaveDe = (nome: string) => `cygnos:rascunho:${nome}`

export async function guardarRascunho<T>(nome: string, dado: T): Promise<void> {
  try {
    const envelope: Envelope<T> = { em: Date.now(), dado }
    await AsyncStorage.setItem(chaveDe(nome), JSON.stringify(envelope))
  } catch {
    /* Sem espaço, sem permissão, o que for. O trabalho continua. */
  }
}

/* O rascunho, se ele existir e ainda valer.
 *
 * `validoPorHoras` é obrigatório de propósito: um prazo padrão faria cada
 * chamador herdar uma decisão que não é dele. O treino vence em horas; um
 * questionário pode esperar dias. */
export async function lerRascunho<T>(nome: string, validoPorHoras: number): Promise<T | null> {
  try {
    const cru = await AsyncStorage.getItem(chaveDe(nome))
    if (!cru) return null

    const envelope = JSON.parse(cru) as Envelope<T>
    /* Formato estranho é descartado, e não devolvido. Rascunho gravado por uma
       versão antiga do app pode não ter mais os campos que a tela espera — e
       uma tela restaurando dado que ela não entende quebra de um jeito que
       ninguém liga ao que causou. */
    if (typeof envelope?.em !== 'number' || envelope.dado === undefined) {
      await apagarRascunho(nome)
      return null
    }

    const horas = (Date.now() - envelope.em) / 3600000
    /* Prazo vencido, ou carimbo no FUTURO — relógio do aparelho mudou, ou o
       fuso virou. Nos dois casos o rascunho não é confiável. */
    if (horas > validoPorHoras || horas < -1) {
      await apagarRascunho(nome)
      return null
    }
    return envelope.dado
  } catch {
    return null
  }
}

export async function apagarRascunho(nome: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(chaveDe(nome))
  } catch {
    /* Idem. */
  }
}

/* Os nomes ficam aqui, e não espalhados como texto solto nas telas: duas telas
   com a mesma chave por engano trocariam rascunho uma com a outra, e o defeito
   apareceria como dado aparecendo onde não devia. */
export const RASCUNHO = {
  treino: 'modo-treino',
  questionario: 'questionario',
  rotinaIA: 'rotina-ia',
} as const
