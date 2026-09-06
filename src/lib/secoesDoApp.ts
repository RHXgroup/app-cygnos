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

/* ── E A SEÇÃO DESLIGADA QUE TEM HISTÓRICO ───────────────
 *
 * Desligar deixou de esconder tudo. A regra, decidida por quem usa:
 *
 *   "o problema disso é histórico do paciente né, não podemos fazer
 *    ele perder esse acesso né"
 *   "só que se ele desliga, as próxima que ele fizer não pode aparecer"
 *
 * Então: o que ela registrou ANTES de desligar continua visível — é o
 * histórico dele, e um profissional pode deixar de usar uma ferramenta sem
 * poder tirar de alguém o acesso ao que já foi registrado sobre ele. O que
 * vier DEPOIS não aparece.
 *
 * ── Por que aqui basta a CONTAGEM ────────────────────
 * O corte por data mora no SERVIDOR: `app_conteudo_da_nutricionista` já
 * devolve as contagens filtradas pelo instante em que a seção foi
 * desligada. Então o app não precisa saber de datas nem do instante —
 * ele só pergunta se sobrou alguma coisa para mostrar.
 *
 * Isso é de propósito e vale além desta função: com a regra no
 * servidor, uma tela nova que alguém escrever amanhã já nasce
 * obedecendo, e um aplicativo JÁ INSTALADO obedece sem atualizar. Foi
 * "consertar numa tela e esquecer as irmãs" que criou este defeito —
 * cinco telas mostravam conteúdo dela e só uma consultava o interruptor.
 *
 * ── As três combinações ────────────────────────
 *   ligada, vazia        -> APARECE (ela ainda vai preencher)
 *   desligada, com hist. -> APARECE (o histórico é dele)
 *   desligada, vazia     -> some  (é para isso que o interruptor serve)
 *
 * A contagem manda mesmo com o mapa vazio: sem resposta do servidor,
 * `secaoVisivel` já devolve true, e o `||` só pode confirmar. */
export function secaoNaLista(
  chave: string,
  visiveis: SecoesVisiveis,
  /* Quantos registros sobraram para mostrar. Indefinido = a tela não sabe
     contar esta seção (energético, receitas), e aí quem decide é só
     o interruptor. */
  total?: number,
): boolean {
  if (secaoVisivel(chave, visiveis)) return true
  return (total ?? 0) > 0
}