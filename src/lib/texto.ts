/* Comparar texto que gente escreveu.
 *
 * ── Por que isto virou um arquivo ─────────────────────────────────────────
 * `semAcento` existia em `interpretador.ts` e em `pesoDoItem.ts`, e as duas
 * cópias JÁ tinham divergido: uma apara os espaços das pontas, a outra não. É a
 * previsão exata do item 5 do AGENTS.md — duas implementações do mesmo assunto
 * sempre divergem, e ninguém descobre por qual das duas a tela passa.
 *
 * Uma terceira cópia ia nascer com o casamento de rótulo de refeição. Em vez
 * disso, as três passam a ser a mesma.
 *
 * ── Só `import type` ──────────────────────────────────────────────────────
 * Nenhum import de runtime, para os arquivos que dependem daqui continuarem
 * rodando fora do aparelho. */

/* A faixa dos acentos combinantes do Unicode — o que o `NFD` separa da letra.
 *
 * Escrita como escape, e não com os caracteres em si: eles são invisíveis num
 * editor, e uma classe de regex com caractere invisível dentro é a coisa mais
 * fácil de estragar sem ninguém ver. */
const ACENTOS = /[\u0300-\u036f]/g

/* Minúsculas, sem acento, sem espaço sobrando.
 *
 * Serve para COMPARAR, nunca para mostrar: quem chama guarda o texto original e
 * usa isto só como chave. Escrever "almoco" na tela seria trocar a grafia da
 * pessoa pela nossa forma interna.
 *
 * O espaço do meio também entra: "Lanche  da tarde", com dois espaços, é a
 * mesma refeição que "Lanche da tarde", e quem digitou não vê a diferença. */
export const semAcento = (s: string): string =>
  s.normalize('NFD').replace(ACENTOS, '').toLowerCase().trim().replace(/\s+/g, ' ')
