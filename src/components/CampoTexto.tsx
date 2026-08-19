import { forwardRef } from 'react'
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'
import { cores, inkFraco, inkMedio } from '../theme'

type Props = TextInputProps & {
  rotulo: string
  erro?: string | null
  /* Texto de apoio abaixo do campo, quando não há erro. Some no erro para as
     duas mensagens não brigarem pelo mesmo espaço. */
  ajuda?: string
}

/* Campo de formulário com rótulo, estado de erro e texto de apoio. O cadastro
   tem oito campos iguais — sem isto seriam oito blocos copiados. */
export const CampoTexto = forwardRef<TextInput, Props>(function CampoTexto(
  { rotulo, erro, ajuda, style, ...props },
  ref,
) {
  return (
    <View>
      <Text style={styles.rotulo}>{rotulo}</Text>
      <TextInput
        ref={ref}
        placeholderTextColor={inkFraco}
        keyboardAppearance="dark"
        style={[styles.campo, !!erro && styles.campoComErro, style]}
        {...props}
      />
      {erro ? (
        <Text style={styles.erro}>{erro}</Text>
      ) : ajuda ? (
        <Text style={styles.ajuda}>{ajuda}</Text>
      ) : null}
    </View>
  )
})

const styles = StyleSheet.create({
  rotulo: {
    marginBottom: 6,
    fontSize: 13,
    fontWeight: '600',
    color: inkMedio,
  },
  campo: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: cores.line,
    backgroundColor: cores.superficie,
    paddingHorizontal: 16,
    /* 16px é o mínimo que o iOS aceita sem dar zoom automático no campo. */
    fontSize: 16,
    color: cores.ink,
  },
  campoComErro: { borderColor: cores.erroBorda, backgroundColor: cores.erroFundo },
  erro: { marginTop: 5, fontSize: 12.5, lineHeight: 17, color: cores.erroTexto },
  ajuda: { marginTop: 5, fontSize: 12.5, lineHeight: 17, color: inkFraco },
})
