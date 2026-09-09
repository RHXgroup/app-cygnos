/* Para qual aba o dedo levou.
 *
 * ──────────────────── Por que isto e uma lib, e nao tres linhas no gesto ────────────────────
 * Porque a regra tem ponta, e ponta e onde este tipo de conta erra: na primeira
 * aba, deslizar para a direita nao pode virar indice -1 (que sai `undefined` e
 * some com a tela); na ultima, para a esquerda nao pode passar do fim.
 *
 * E porque o LIMIAR e uma decisao, nao um numero solto: alto demais e o gesto
 * "nao funciona", baixo demais e a aba troca quando ela so quis rolar a lista.
 * Fora do componente da para exercitar os dois lados sem o aparelho.
 */

/** A ordem em que as abas ficam na barra, da esquerda para a direita. */
export type AbaDeslizavel = 'hoje' | 'agenda' | 'pacientes' | 'mais'

/* A Aurora NAO entra nesta lista, e nao e esquecimento.
 *
 * Ela e o botao redondo levantado no meio da barra, e abre POR CIMA de tudo --
 * nao e uma aba, e uma sobreposicao. Se entrasse aqui, deslizar da agenda para
 * a direita abriria uma tela de conversa em cima do dedo dela, que e o oposto
 * do que um deslize casual deve fazer. */
export const ABAS_EM_ORDEM: AbaDeslizavel[] = ['hoje', 'agenda', 'pacientes', 'mais']

/* Quanto o dedo precisa andar na horizontal para valer como troca de aba.
 *
 * 60 pixels. Medido pelo que atrapalha: abaixo de ~40 o gesto dispara enquanto
 * ela rola a lista na diagonal -- e trocar de aba sozinho e o defeito mais
 * irritante que uma barra pode ter, porque ela perde o lugar onde estava. */
export const DISTANCIA_MINIMA = 60

/* E quanto ele precisa ser MAIS horizontal do que vertical.
 *
 * O dedo humano nao anda reto. Uma rolagem para baixo carrega uns 10 a 20 px de
 * desvio lateral sem querer, e sem esta razao aquele desvio viraria troca de
 * aba no meio de uma leitura. Exigir o dobro separa "quis deslizar" de "quis
 * rolar e tremeu". */
export const RAZAO_HORIZONTAL = 2

/**
 * A aba de destino, ou `null` quando o gesto nao vale.
 *
 * `dx` positivo e o dedo indo para a DIREITA, que traz a aba da ESQUERDA -- o
 * conteudo acompanha o dedo, como em qualquer carrossel. Trocar isso deixa o
 * app com a sensacao de estar invertido, e ninguem consegue dizer por que.
 */
export function abaDoDeslize(
  atual: AbaDeslizavel,
  dx: number,
  dy: number,
): AbaDeslizavel | null {
  /* `Number.isFinite` antes de qualquer comparacao: `NaN` passaria por
     `Math.abs(dx) < DISTANCIA_MINIMA` como falso e seguiria adiante, e a conta
     do indice sairia `NaN` -- que indexa `undefined` e apaga a tela. */
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null
  if (Math.abs(dx) < DISTANCIA_MINIMA) return null
  if (Math.abs(dx) < Math.abs(dy) * RAZAO_HORIZONTAL) return null

  const i = ABAS_EM_ORDEM.indexOf(atual)
  /* Aba desconhecida devolve nulo em vez de comecar do zero: uma aba nova que
     alguem esquecer de por na lista faria o deslize jogar para "hoje" a partir
     de qualquer lugar, o que se le como bug aleatorio. */
  if (i < 0) return null

  const destino = dx > 0 ? i - 1 : i + 1
  /* As pontas nao dao a volta. Carrossel circular numa barra de abas faz o
     ultimo item levar ao primeiro, e a pessoa perde a nocao de onde esta na
     fila -- a barra embaixo mostra uma ordem, e o gesto precisa respeita-la. */
  if (destino < 0 || destino >= ABAS_EM_ORDEM.length) return null

  return ABAS_EM_ORDEM[destino] ?? null
}
