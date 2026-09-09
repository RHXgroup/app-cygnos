/* A fonte da área da nutricionista.
 *
 * ──────────────────── Por que uma fonte, e por que SÓ aqui ────────────────────
 * O app inteiro usa a fonte do sistema, e isso é uma escolha razoável: sai de
 * graça, nunca falha, e ninguém repara. O problema é que ninguém repara -- e a
 * área da nutricionista precisa parecer um produto, e não uma tela de
 * formulário. Foi essa a crítica, nessas palavras: "tá feio".
 *
 * Fica SÓ na área dela, e não no app do paciente. Duas razões, e a segunda é a
 * que decide:
 *
 *   1. São dois produtos, com dois donos de tela. O paciente não precisa herdar
 *      uma mudança de identidade que ninguém pediu.
 *   2. Trocar a família em 55 telas de uma vez muda a métrica de TODAS elas ao
 *      mesmo tempo -- altura de linha, largura de rótulo, quebra de botão -- e
 *      nada disso aparece no `tsc`. Aparece no aparelho, em vinte lugares, e
 *      ninguém saberia qual foi.
 *
 * ──────────────────── O peso vira FAMÍLIA, e não `fontWeight` ────────────────────
 * Esta é a armadilha da fonte carregada no React Native, e ela falha calada.
 * Cada peso é um ARQUIVO com nome próprio (`Archivo_700Bold`), e
 * `fontWeight: '700'` sobre `fontFamily: 'Archivo_400Regular'` não engrossa
 * nada no Android: ele desenha o regular e segue em frente, sem erro. No iOS
 * às vezes sintetiza um negrito falso, que é pior -- fica diferente nos dois
 * aparelhos.
 *
 * Por isso as constantes daqui embaixo já SÃO o peso, e quem as usa não escreve
 * `fontWeight` nenhum. Onde você escreveria `fontWeight: '800'`, escreva
 * `fontFamily: FONTE.forte`.
 */

export const FONTE = {
  /** Texto corrido, rótulo, legenda. */
  normal: 'Archivo_400Regular',
  /** Um degrau acima do corrido, para o que precisa ser lido primeiro na linha. */
  media: 'Archivo_500Medium',
  /** Nome de paciente, rótulo de seção, texto de botão. */
  meia: 'Archivo_600SemiBold',
  /** Título de tela, horário grande, valor em destaque. */
  forte: 'Archivo_700Bold',
  /** Só o título maior de cada tela e o número do herói. Usar mais espalha o
      peso e o destaque deixa de existir. */
  bruta: 'Archivo_800ExtraBold',
} as const

/* O que o `useFonts` do App carrega. Um objeto, e não uma lista, porque é o
   nome à ESQUERDA que vira o `fontFamily` -- e ele tem de bater com o que está
   escrito em `FONTE` ali em cima. O teste ao lado confere que batem, porque um
   nome errado aqui não dá erro: dá a fonte do sistema de volta, e a tela fica
   exatamente como estava antes de eu ter feito nada. */
export const FONTES_PARA_CARREGAR = {
  Archivo_400Regular: require('@expo-google-fonts/archivo/Archivo_400Regular.ttf'),
  Archivo_500Medium: require('@expo-google-fonts/archivo/Archivo_500Medium.ttf'),
  Archivo_600SemiBold: require('@expo-google-fonts/archivo/Archivo_600SemiBold.ttf'),
  Archivo_700Bold: require('@expo-google-fonts/archivo/Archivo_700Bold.ttf'),
  Archivo_800ExtraBold: require('@expo-google-fonts/archivo/Archivo_800ExtraBold.ttf'),
}
