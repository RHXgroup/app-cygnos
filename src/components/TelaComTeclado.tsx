import { useState, type ReactNode } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDesvioDoTeclado } from '../lib/teclado'

/* A moldura de uma tela que tem campo para digitar.
 *
 * ── O que ela substitui, e por quê ────────────────────────────────────────
 * Dezenove telas usavam a mesma linha:
 *
 *   <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
 *
 * `height` no Android depende de a JANELA ENCOLHER com o teclado. No Expo Go
 * ela não encolhe — medido no aparelho, não deduzido —, então o componente não
 * faz nada e o campo fica atrás do teclado. Armadilha 2 do AGENTS.md, que
 * custou seis tentativas numa tela só.
 *
 * ── A conta, com os números medidos ───────────────────────────────────────
 * O desvio é `altura do teclado + área segura de baixo`, e os dois SOMAM:
 * `endCoordinates.height` não inclui a barra de navegação que fica por baixo do
 * teclado. Medido: teclado 306, área segura 48, e faltavam exatamente 48.
 *
 * ── E o build, que ainda não existe ───────────────────────────────────────
 * Num APK de verdade o `app.json` passa a valer, o `windowSoftInputMode` sai
 * `adjustResize`, e a janela encolhe sozinha. Somar o teclado de novo empurraria
 * a tela para cima do que já estava resolvido.
 *
 * `useDesvioDoTeclado` detecta esse caso e devolve zero — mas SÓ se receber a
 * altura da tela, e ela precisa vir do `onLayout` da raiz. `useWindowDimensions`
 * não serve: ele não encolhe junto. É por isso que esta moldura mede a si mesma
 * em vez de perguntar as dimensões da tela.
 *
 * ── Por que um componente, e não a linha copiada ──────────────────────────
 * Porque copiar em dezenove lugares é criar dezenove versões que divergem no
 * dia em que alguém corrigir uma — armadilha 5. E porque o ramo do build acima
 * NUNCA RODOU: ele vai estrear em produção, e é melhor que estreie num lugar só. */
export function TelaComTeclado({
  children,
  style,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const { bottom } = useSafeAreaInsets()

  /* Medida na raiz, e não por `useWindowDimensions` — ver o comentário acima.
     Zero até o primeiro layout; `|| undefined` é o que impede o hook de tratar
     "ainda não medi" como "a tela tem zero de altura". */
  const [altura, setAltura] = useState(0)
  const respiro = useDesvioDoTeclado(bottom, altura || undefined)

  return (
    <View
      style={[styles.tela, style]}
      onLayout={e => setAltura(e.nativeEvent.layout.height)}
    >
      {children}
      {/* Um espaçador, e não `paddingBottom` na raiz.
          Padding na raiz encolheria a área de rolagem e faria o conteúdo pular
          quando o teclado abre; um irmão de altura variável empurra só o que
          está embaixo, que é o que se quer. */}
      {respiro > 0 && <View style={{ height: respiro }} pointerEvents="none" />}
    </View>
  )
}

const styles = StyleSheet.create({
  tela: { flex: 1 },
})
