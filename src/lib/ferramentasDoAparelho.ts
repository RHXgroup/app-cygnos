/* Quais ferramentas da Aurora este APARELHO executa sozinho.
 *
 * ──────────────────── Por que separado de `acoesNoAparelho` ────────────────────
 * Só a decisão mora aqui, e a execução mora lá. O corte não é estético: este
 * arquivo não importa NADA de runtime -- nem o Supabase, nem as notificações --
 * e é isso que permite exercitá-lo no Node, contra o registro do outro
 * repositório. Um único `import` de lá arrastaria o aparelho inteiro para
 * dentro do teste e ele deixaria de rodar.
 *
 * É o mesmo corte de `sugestaoParaPlano` e `planoIA`: lá fica o que fala com a
 * rede, aqui o que decide -- e é o que decide que erra.
 */

/* As que este aparelho executa sozinho.
 *
 * Escrita à mão porque o registro vive no repositório do sistema e não dá para
 * importar daqui. `acoesNoAparelho.teste.mts` confere contra o arquivo de lá,
 * lendo como texto -- é a mesma saída de `deslizarEntreAbas` com a barra de
 * abas, e pelo mesmo motivo: duas listas que precisam concordar e que o
 * compilador não obriga. */
export const FERRAMENTAS_DO_APARELHO = ['criar_aviso'] as const

export function ehDoAparelho(ferramenta: string): boolean {
  return (FERRAMENTAS_DO_APARELHO as readonly string[]).includes(ferramenta)
}
