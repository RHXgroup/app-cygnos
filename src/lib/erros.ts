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

/* A frase do BANCO, quando ela foi escrita para alguém ler.
 *
 * ── O furo que isto fecha ─────────────────────────────────────────────────
 * Três lugares repassam `error.message` de propósito, porque o banco escreve em
 * português com `RAISE`: pedir consulta, mandar mensagem e pedir vínculo. A
 * decisão está certa — "Esse horário não está mais disponível" diz mais do que
 * qualquer tradução minha.
 *
 * Mas `error.message` não é só o RAISE. A MESMA chamada devolve ali:
 *
 *   "Network request failed"
 *   "permission denied for function app_enviar_mensagem"
 *   "JWT expired"
 *   "duplicate key value violates unique constraint ..."
 *
 * E esses iam para a tela em inglês, de programador, exatamente o que o `falha`
 * acima existe para impedir. A exceção estava certa e o caminho dela era largo
 * demais.
 *
 * ── Como se decide ────────────────────────────────────────────────────────
 * Pela cara do texto, e não pelo código do erro: o `RAISE` do Postgres chega
 * como P0001 em uns casos e como 23514 em outros, e depender disso quebraria
 * calado quando alguém trocasse o `using errcode`.
 *
 * O que uma frase escrita para gente tem: acentuação ou "ç" (é português), e
 * nenhum jargão de banco. Uma frase em português SEM acento nenhum ("Codigo
 * invalido") passa pelo segundo teste e falha no primeiro — e o preço disso é
 * mostrar a nossa frase no lugar da dela, que é o lado seguro de errar. */
const JARGAO =
  /violates|constraint|permission denied|JWT|duplicate key|null value|invalid input|does not exist|failed to|Network request|relation ".*" does not exist|function .* does not exist/i

const TEM_PORTUGUES = /[áàâãéêíóôõúüç]/i

export function mensagemDoBanco(bruto: unknown, alternativa: string): string {
  const texto = typeof (bruto as { message?: unknown })?.message === 'string'
    ? ((bruto as { message: string }).message).trim()
    : ''

  const pareceEscritaParaGente =
    texto.length >= 10 && texto.length <= 300 && TEM_PORTUGUES.test(texto) && !JARGAO.test(texto)

  if (pareceEscritaParaGente) {
    /* Vai para o console mesmo assim: quando o texto do banco muda, é aqui que
       se descobre por que a tela passou a dizer outra coisa. */
    console.warn('[cygnos] mensagem do banco repassada:', texto)
    return texto
  }
  return falha(alternativa, bruto)
}
