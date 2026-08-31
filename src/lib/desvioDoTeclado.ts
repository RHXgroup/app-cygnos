/* Quanto subir para o teclado não cobrir o campo — a DECISÃO, sem o aparelho.
 *
 * ── Por que está separado de lib/teclado.ts ────────────────────────────────
 * Lá mora o que fala com o React Native: os ouvintes de `keyboardDidShow`, o
 * `useState`, o `useRef`. Aqui mora o que decide. É o mesmo corte que separou
 * `sugestaoParaPlano` de `planoIA` e `montarAvisos` de `avisos` — e a razão é a
 * mesma: quem erra é quem decide, e quem importa React Native não roda no Node.
 *
 * ── E este arquivo tem um motivo a mais para existir ───────────────────────
 * O ramo do encolhimento NUNCA RODOU. No Expo Go a janela não encolhe, e este
 * app só rodou no Expo Go. Ele foi escrito para o primeiro build, e ia estrear
 * em produção, na mão de quem baixou da Play — que é o pior lugar para uma
 * lógica estrear.
 *
 * Fora do aparelho ele pode ser exercitado com os números que foram medidos no
 * aparelho. É o mais perto de testar um build que dá para chegar antes de ter
 * um.
 *
 * ── A conta, medida ────────────────────────────────────────────────────────
 * `endCoordinates.height` devolve a altura do teclado SEM a barra de navegação
 * que fica por baixo dele. Medido numa foto da tela: teclado 306, área segura
 * 48, e faltavam exatamente 48. As duas SOMAM. Ver a armadilha 2 do AGENTS.md,
 * que custou seis tentativas justamente por eu trocar de mecanismo em vez de
 * conferir o número. */

export type MedidasDoTeclado = {
  /* A área segura de baixo: a barra de gestos ou de botões do Android. */
  areaSegura: number
  /* O que `endCoordinates.height` devolveu. Zero com o teclado fechado. */
  alturaTeclado: number
  /* A altura da tela medida com o teclado FECHADO, que é a referência.
     Zero quando ainda não foi medida — antes do primeiro `onLayout`. */
  alturaSemTeclado: number
  /* A altura da tela AGORA. `undefined` quando a tela não mede — e aí a
     resposta é a de sempre, que é o que está testado em uso hoje. */
  alturaAgora?: number
}

/* Uma diferença menor que isto não é encolhimento.
 *
 * Arredondamento, ou uma barra que apareceu, mudam a altura em poucos pixels. A
 * folga exige que a diferença seja da ORDEM do teclado para valer, senão uma
 * variação boba desligaria o desvio e o campo sumiria atrás do teclado — que é
 * exatamente o defeito que este arquivo existe para evitar. */
const FOLGA = 40

export function desvioDoTeclado({
  areaSegura,
  alturaTeclado,
  alturaSemTeclado,
  alturaAgora,
}: MedidasDoTeclado): number {
  /* Sem teclado não há o que desviar; sobra respeitar a barra de baixo. */
  if (alturaTeclado <= 0) return areaSegura

  /* A janela encolheu sozinha? Então ela JÁ tirou o teclado da frente, e somar
     de novo empurraria o campo para o meio da tela.
   *
   * Conservador de propósito: sem medida, ou antes da primeira, a resposta é a
   * de sempre. Só uma prova de encolhimento muda o resultado. */
  const encolheu =
    alturaAgora !== undefined &&
    alturaSemTeclado > 0 &&
    alturaSemTeclado - alturaAgora > alturaTeclado - FOLGA

  return encolheu ? 0 : alturaTeclado + areaSegura
}
