/* Quais seções o app mostra ao paciente — a decisão, sem o banco.
 *
 * A nutricionista liga e desliga seções no sistema web (a grade "o que o
 * paciente vê no app"). O servidor devolve as 11 seções com true/false em
 * `app_secoes_do_paciente()` — quem BUSCA isso é `carregarSecoesVisiveis` no
 * `conteudoNutri.ts`, que precisa do supabase. Quem DECIDE mora aqui, sem
 * import nenhum de rede, pra poder ser testado com o runner de `src/lib` (que
 * não sobe o cliente do supabase).
 *
 * O default, em toda dúvida, é MOSTRAR: chave sem interruptor no sistema, mapa
 * vazio (erro de rede, ainda carregando) — tudo isso deixa a seção aparecer.
 * Esconder por engano é a nutricionista publicar e o paciente não ver, sem
 * ninguém ter desligado. */

/* O de-para das chaves. As do app (a coluna `chave` da lista da tela) e as do
   sistema web nasceram separadas. `energetico` e `receitas` não têm interruptor
   no sistema — ficam de fora do mapa de propósito, e por isso sempre visíveis.
   `privacidade_lgpd` o servidor força true (direito da LGPD), então nem precisa
   estar aqui: não há chave de app que a desligue. */
export const SECAO_NO_SERVIDOR: Record<string, string> = {
  anamnese: 'anamnese_geral',
  antropometria: 'antropometria_geral',
  fotos: 'evolucao_fotografica',
  exames: 'exames_laboratoriais',
  plano: 'planejamento_alimentar',
}

/* O que `app_secoes_do_paciente()` devolve: chave do SERVIDOR -> visível. */
export type SecoesVisiveis = Record<string, boolean>

/* Uma seção do app aparece A MENOS QUE o sistema a tenha desligado. Chave sem
   interruptor e mapa vazio contam como visível — o silêncio nunca esconde. */
export function secaoVisivel(chave: string, visiveis: SecoesVisiveis): boolean {
  const k = SECAO_NO_SERVIDOR[chave]
  return !k || visiveis[k] !== false
}
