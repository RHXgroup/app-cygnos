/* O que o paciente lê quando alguma coisa falha.
 *
 * O Supabase devolve o texto do Postgres, e é ele que vinha parar na tela:
 * "duplicate key value violates unique constraint", "Network request failed",
 * "permission denied for function". Inglês, de programador, e sem dizer o que
 * fazer — para alguém que só queria anotar um copo de água.
 *
 * Aqui a frase que aparece é nossa, e o texto cru vai para o console. Os dois
 * lados importam: a tela não pode assustar quem está do outro lado dela, e quem
 * for depurar não pode ficar sem a pista. Engolir o erro em silêncio já custou
 * uma sessão inteira de investigação neste projeto — ver o comentário do
 * carregamento em NutricionistasScreen.
 *
 * ── A exceção ──────────────────────────────────────────────────────────────
 * Quando é o BANCO que escreve a mensagem para alguém ler — um `RAISE` em
 * português, como "Esse horário não está mais disponível." —, repassar é melhor
 * do que traduzir: quem sabe por que recusou é quem recusou. Esse caso está em
 * `lib/agenda.ts`, e é o único. Não passe uma dessas por aqui.
 *
 * ── Como usar ──────────────────────────────────────────────────────────────
 * A frase inteira fica no lugar da chamada, e não escondida aqui dentro: quem
 * lê o código da função de salvar precisa ver, ali mesmo, o que a pessoa vai
 * ler quando aquilo falhar.
 *
 *   if (error) return { tipo: 'erro', mensagem: falha('Não consegui registrar o copo agora.', error) }
 */
export function falha(humana: string, bruto: unknown): string {
  console.warn('[cygnos]', humana, bruto)
  return humana
}
