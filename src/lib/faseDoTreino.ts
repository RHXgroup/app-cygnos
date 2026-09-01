/* O que deve acontecer AGORA no modo treino.
 *
 * ── Por que isto saiu do componente ───────────────────────────────────────
 * As transições viviam dentro de dois `useEffect` que liam o relógio, e por
 * isso não davam para exercitar: o único jeito de saber se a contagem quebrava
 * era ir à academia e ouvir. Ela quebrou — e o defeito ("fala três, dois, e
 * para") só apareceu no aparelho, com a pessoa no meio de uma série.
 *
 * Aqui ficam as REGRAS; lá fica o que fala, apita e desenha.
 *
 * ── E o relógio congela ───────────────────────────────────────────────────
 * O Android para o `setInterval` quando o app sai da frente. A pessoa põe o
 * telefone no bolso, anda até o bebedouro, volta — e o instante seguinte pode
 * estar dez minutos à frente do anterior. Sem tratar isso, o app anuncia
 * "acabou o descanso" para um descanso que acabou faz dez minutos, e conta
 * "três, dois, um" para quem já está de volta na barra.
 *
 * Só `import type`. Roda fora do aparelho. */

export type Fase = 'parado' | 'preparando' | 'treinando' | 'descansando'

export type Momento = {
  fase: Fase
  /* Quando a preparação acaba, em milissegundos do relógio. */
  fimDoPreparo: number | null
  /* Quando o descanso acaba. */
  fimDoDescanso: number | null
  agora: number
}

/* O que o componente deve fazer neste instante. `null` em tudo significa
   "nada muda", que é o caso da esmagadora maioria dos quadros. */
export type Acao = {
  fase: Fase | null
  /* O novo valor de cada prazo. `undefined` é "não mexa"; `null` é "limpe". */
  fimDoPreparo?: number | null
  fimDoDescanso?: number | null
  /* Começa a contar a série a partir de agora. */
  comecarSerie: boolean
  /* O número a falar na contagem, ou nulo. */
  contar: number | null
  /* A fala do momento, ou nula. */
  falar: string | null
  /* O apito de "vai". */
  apitar: boolean
}

const NADA: Acao = {
  fase: null,
  comecarSerie: false,
  contar: null,
  falar: null,
  apitar: false,
}

/* Quanto tempo de preparação, em milissegundos. */
export const PREPARO_MS = 7000

/* A partir de quanto atraso o app para de fingir que acabou agora.
 *
 * Trinta segundos. Abaixo disso a pessoa está ali e o aviso ainda faz sentido;
 * acima, ela voltou do bolso e ouvir "acabou o descanso" seria o app contando
 * uma novidade velha — e pior, começando uma contagem de sete segundos que ela
 * não pediu, com ela já de pé na frente do aparelho. */
export const ATRASO_QUE_INVALIDA_MS = 30_000

const finito = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n)

/* Os três últimos segundos são falados. Contar de sete cansa, e o que a pessoa
   precisa é do aviso de que está para começar. */
const CONTA_A_PARTIR_DE = 3

export function acaoDoMomento(m: Momento): Acao {
  if (!finito(m.agora)) return NADA

  /* ── Preparando ────────────────────────────────────────────────────────*/
  if (m.fase === 'preparando') {
    if (!finito(m.fimDoPreparo)) {
      /* Fase sem prazo é estado impossível — e um estado impossível que fica
         de pé prende a pessoa numa tela que nunca avança. Volta para o treino,
         que é o único lugar de onde ela consegue sair. */
      return { ...NADA, fase: 'treinando', fimDoPreparo: null, comecarSerie: true }
    }

    if (m.agora >= m.fimDoPreparo) {
      const atrasado = m.agora - m.fimDoPreparo > ATRASO_QUE_INVALIDA_MS
      return {
        fase: 'treinando',
        fimDoPreparo: null,
        comecarSerie: true,
        contar: null,
        /* Voltou do bolso muito depois: começa a série calada. Falar "vai"
           agora seria o app dando a largada para quem já correu. */
        falar: atrasado ? null : 'vai',
        apitar: !atrasado,
      }
    }

    const faltam = Math.ceil((m.fimDoPreparo - m.agora) / 1000)
    return faltam <= CONTA_A_PARTIR_DE && faltam >= 1
      ? { ...NADA, contar: faltam }
      : NADA
  }

  /* ── Descansando ───────────────────────────────────────────────────────*/
  if (m.fase === 'descansando') {
    if (!finito(m.fimDoDescanso)) {
      return { ...NADA, fase: 'treinando', fimDoDescanso: null, comecarSerie: true }
    }

    if (m.agora >= m.fimDoDescanso) {
      const atrasado = m.agora - m.fimDoDescanso > ATRASO_QUE_INVALIDA_MS
      /* Atrasado demais: pula a preparação inteira e devolve a série. A
         preparação existe para dar tempo de largar o telefone e chegar na
         barra — quem passou do descanso no bolso já fez esse caminho. */
      return atrasado
        ? {
            fase: 'treinando',
            fimDoDescanso: null,
            comecarSerie: true,
            contar: null,
            falar: null,
            apitar: false,
          }
        : {
            fase: 'preparando',
            fimDoDescanso: null,
            fimDoPreparo: m.agora + PREPARO_MS,
            comecarSerie: false,
            contar: null,
            falar: 'descanso acabou',
            apitar: false,
          }
    }
    return NADA
  }

  return NADA
}

/* Quantos segundos faltam, para a tela mostrar. Nunca negativo, e nunca um
   número absurdo: com o relógio congelado o prazo pode ficar muito atrás, e
   "−612" na tela é pior do que zero. */
export const restam = (prazo: number | null, agora: number): number =>
  !finito(prazo) || !finito(agora) ? 0 : Math.max(0, Math.ceil((prazo - agora) / 1000))
