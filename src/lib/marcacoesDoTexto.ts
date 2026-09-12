/* As marcações que o editor do sistema guarda DENTRO do texto.
 *
 *     **negrito**   _itálico_   __sublinhado__   ==marca-texto==
 *     ++grande++    ~~pequeno~~
 *
 * (o vocabulário é o de `lib/textoRico.ts`, no sistema.)
 *
 * ──────────────────── Por que um arquivo só para isto ────────────────────
 * Porque é a parte que erra, e ela precisa de teste: aqui mora a regra que já
 * comeu o nome de quem assina um contrato -- o `__` do fim de um tracejado
 * casando com o `__` do começo do outro. Nada aqui importa runtime, então
 * `marcacoesDoTexto.teste.mts` exercita tudo fora do aparelho. */

/* Os marcadores do editor do sistema viram tag.
 *
 * O editor guarda destaque dentro do próprio texto (o vocabulário está em
 * `lib/textoRico.ts`, no sistema):
 *
 *     **negrito**   _itálico_   __sublinhado__   ==marca-texto==
 *     ++grande++    ~~pequeno~~
 *
 * Sem traduzir isso, o contrato saía do app com `**CLÁUSULA 1ª**` escrito
 * assim, marcadores e tudo -- e o que era título de cláusula virava linha igual
 * às outras.
 *
 * Feito DEPOIS do escape, sobre o texto já seguro: um `<b>` que ela tenha
 * digitado continua sendo texto, e só os nossos marcadores viram tag.
 *
 * A ordem é a mesma da leitura de lá -- `**` antes de `*`, `__` antes de `_` --
 * e as classes são `[^*]` em vez de `.+?` porque dois destaques na mesma linha
 * viravam um só, engolindo o que estava no meio. */
export function comMarcacoes(escapado: string): string {
  /* ── A LINHA DE ASSINATURA SAI DA FRENTE PRIMEIRO ──
   *
   * O contrato tem linhas assim:
   *
   *     _______________________________________
   *     CONTRATADA — Renan — CRN 12345
   *     1. Nome: ____________________ CPF: ____________
   *
   * E o sublinhado do editor do sistema é `__assim__`. Sem tirar os tracejados
   * da frente, o `__` do fim de um casa com o `__` do começo do outro e engole
   * o que está no meio -- justamente o nome de quem assina. Três ou mais
   * sublinhados seguidos são traço para escrever à mão, e nunca marcação.
   *
   * O guardado volta no fim, porque o marcador de posição não pode sobreviver à
   * função: um `` impresso no contrato seria um quadradinho no papel. */
  const tracos: string[] = []
  const semTracos = escapado.replace(/_{3,}/g, trecho => {
    tracos.push(trecho)
    return `${tracos.length - 1}`
  })

  const comTags = semTracos
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<u>$1</u>')
    .replace(/==([^=]+)==/g, '<mark>$1</mark>')
    .replace(/\+\+([^+]+)\+\+/g, '<span class="grande">$1</span>')
    .replace(/~~([^~]+)~~/g, '<span class="pequeno">$1</span>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')

  return comTags.replace(
    /(\d+)/g,
    (_, n) => `<span class="assinar">${tracos[Number(n)] ?? ''}</span>`,
  )
}

/* O mesmo texto para LER na tela, sem os marcadores.
 *
 * A tela mostra texto simples -- negrito dentro de um parágrafo exigiria partir
 * cada linha em vários `<Text>`, e o que ela faz aqui é conferir o conteúdo,
 * não revisar a diagramação. Tirar os marcadores é melhor do que mostrá-los:
 * `**CLÁUSULA 1ª**` na tela é o app expondo o próprio encanamento. */
export function semMarcacoes(texto: string): string {
  return texto
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/==([^=]+)==/g, '$1')
    .replace(/\+\+([^+]+)\+\+/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
}
