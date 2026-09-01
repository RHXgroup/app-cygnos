import { ajustadaPara, comClaridade, contraste, hexDeHsl, hslDe, luminancia } from './cor.ts'

/* As cores dos sete degraus, derivadas do acento — nunca escritas à mão.
 *
 * ── Por que derivar, e não listar ──────────────────────────────────────────
 * O app deixa a pessoa escolher a cor de acento, e a paleta inteira se ajusta a
 * ela (ver `comAcento` em lib/tema.ts). Uma escada com sete cores fixas ficaria
 * de fora dessa escolha: num app com acento roxo, a escada continuaria verde,
 * e a tela pareceria de outro aplicativo.
 *
 * Pior que feio, seria ilegível. Sete cores fixas sobre um FUNDO que muda com o
 * tema dariam contraste bom no claro e sumiriam no escuro — ou o contrário.
 *
 * ── O que a subida significa, e por que não é arco-íris ───────────────────
 * A escada sobe do neutro ao acento: quem está no degrau 1 aparece em cinza do
 * próprio fundo, e quem chegou em "comeu" aparece na cor do app. É a mesma
 * gramática do resto — cinza é o que ainda não aconteceu, acento é o que
 * aconteceu.
 *
 * Sete matizes diferentes seriam a leitura errada: matiz distingue COISAS
 * (proteína, carboidrato, gordura), e degrau não é coisa diferente, é a mesma
 * coisa mais adiante. Distância se lê por saturação e claridade, não por cor.
 *
 * ── E a recusa não é vermelha ─────────────────────────────────────────────
 * Nunca. Recusar é o degrau 1 da Escalada, não um erro — e o vermelho de erro
 * existe neste app para significar erro. Pintar a recusa de vermelho diria à
 * mãe que o filho falhou, e a evidência é clara em que pressão reforça a
 * rejeição. O degrau 1 é o cinza mais quieto que houver.
 *
 * Sem import de runtime: só `lib/cor.ts`, que também é pura. */

export type CorDoDegrau = {
  /* O traço e o texto sobre o fundo da tela. Garantido legível. */
  traco: string
  /* O preenchimento leve, para a barra e o fundo do ícone. */
  leve: string
}

/* Quanto o degrau 1 fica longe do acento, e quanto o 7 fica perto.
 *
 * O degrau 1 não é acinzentado até sumir: ele precisa continuar visível, porque
 * registrar uma recusa é um ato tão legítimo quanto registrar um "comeu" e a
 * tela não pode sussurrar isso. */
const SATURACAO_MINIMA = 0.12
const SATURACAO_MAXIMA = 1

export function coresDaEscada(acento: string, fundo: string, quantos = 7): CorDoDegrau[] {
  const base = hslDe(acento)
  const claro = luminancia(fundo) > 0.5

  return Array.from({ length: quantos }, (_, i) => {
    /* 0 no primeiro degrau, 1 no último. Com um degrau só, fica no topo: uma
       escada de um degrau é a chegada, não o começo. */
    const t = quantos <= 1 ? 1 : i / (quantos - 1)

    const s = base.s * (SATURACAO_MINIMA + (SATURACAO_MAXIMA - SATURACAO_MINIMA) * t)

    /* A claridade caminha DO FUNDO até longe dele.
     *
     * A primeira versão movia pouco e no sentido errado: o degrau 1 saía
     * escuro e quase cinza, o 7 saía verde vivo — e um cinza escuro sobre
     * creme contrasta MAIS que um verde vivo, porque contraste mede luminância
     * e o verde carrega quase toda a luminância do pixel. Medido: 8,08 no
     * degrau 1 contra 6,34 no 7, exatamente ao contrário da intenção.
     *
     * O teste pegou, e o conserto foi no código e não na expectativa: o degrau
     * baixo tem de ser QUIETO, perto do fundo, e o alto tem de ser presente.
     * A faixa é fixa em vez de derivada da claridade do acento — um acento
     * quase branco ou quase preto arrastaria a escada inteira para o extremo,
     * e o que precisa variar entre acentos é o MATIZ, não a subida. */
    const l = claro ? 64 - 34 * t : 30 + 34 * t

    const bruta = hexDeHsl({ h: base.h, s, l })

    /* `ajustadaPara` é a garantia final: ela devolve a cor se ela já serve como
       traço sobre o fundo, e a empurra até servir se não. Sem isso, um acento
       muito claro escolhido pela pessoa apagaria os degraus baixos.
       Verificado nos 360 matizes — ver lib/cor.ts. */
    const traco = ajustadaPara(bruta, fundo)

    return {
      traco,
      /* O leve nasce do traço já ajustado, e não da cor bruta: se o traço
         precisou ser empurrado para ser visível, o preenchimento tem de
         acompanhar, senão os dois deixam de parecer a mesma cor. */
      leve: comClaridade(traco, claro ? 34 : -26),
    }
  })
}

/* Uma conferência que a tela pode fazer, e que o teste exercita nos 360
   matizes: todo degrau se lê sobre o fundo. */
export const escadaLegivel = (cores: CorDoDegrau[], fundo: string): boolean =>
  cores.every(c => contraste(c.traco, fundo) >= 3)
