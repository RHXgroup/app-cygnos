import * as Application from 'expo-application'

/* A versão INSTALADA, para ela conferir sem abrir a Play Store.
 *
 * "Subi uma versão ontem e não atualizou na Play." A causa mais provável era o
 * nome: o build saiu 1.1.0, igual ao anterior, e só o código interno mudou -- e
 * a loja e o celular mostram o nome. Sem a versão escrita em algum lugar do app,
 * não havia como saber qual estava instalada.
 *
 * Do PRÓPRIO APARELHO (`expo-application`), e não do `app.json`: o código de
 * build é contado pelo EAS na nuvem e não existe no arquivo de configuração, e é
 * o código que distingue duas versões com o mesmo nome. No app de teste aparece
 * a versão do build de teste, que é o que está instalado ali -- e está certo.
 *
 * Função de apoio de UI: nunca rejeita (armadilha 11). Sem versão, some a linha. */
export function versaoDoApp(): string {
  try {
    const nome = Application.nativeApplicationVersion
    const codigo = Application.nativeBuildVersion
    if (!nome) return ''
    return codigo ? `Cygnos ${nome} (${codigo})` : `Cygnos ${nome}`
  } catch {
    return ''
  }
}
