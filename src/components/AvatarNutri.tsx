import { Image, StyleSheet, Text, View } from 'react-native'
import { iniciais, type Nutricionista } from '../lib/nutricionista'
import { cores } from '../theme'

/* O rosto do cartão de nutricionista.
 *
 * Três desenhos, e a diferença entre eles não é decoração:
 *
 *   foto de perfil → círculo, recortada para preencher (`cover`)
 *   logo           → quadrado arredondado, INTEIRA dentro dele (`contain`)
 *   nada           → as iniciais
 *
 * Recortar uma logo num círculo come o nome da clínica pelas beiradas. Quem diz
 * qual é o caso é a flag de Parâmetros, resolvida lá no banco — ver a migração
 * 20260801000008. */
export function AvatarNutri({
  nutri,
  tamanho = 52,
}: {
  nutri: Pick<Nutricionista, 'nome' | 'imagemUrl' | 'imagemELogo'>
  tamanho?: number
}) {
  const raio = nutri.imagemELogo ? tamanho * 0.22 : tamanho / 2
  const base = { width: tamanho, height: tamanho, borderRadius: raio }

  if (nutri.imagemUrl) {
    return (
      <Image
        source={{ uri: nutri.imagemUrl }}
        style={[styles.imagem, base]}
        resizeMode={nutri.imagemELogo ? 'contain' : 'cover'}
        accessibilityIgnoresInvertColors
      />
    )
  }

  return (
    <View style={[styles.vazio, base]}>
      <Text style={[styles.iniciais, { fontSize: tamanho * 0.34 }]}>{iniciais(nutri.nome)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  /* Fundo branco atrás da logo: muitas são PNG com transparência e desenhadas
     para papel — em cima do cinza do cartão elas somem. */
  imagem: { backgroundColor: cores.branco },
  vazio: { backgroundColor: cores.verdeClaro, alignItems: 'center', justifyContent: 'center' },
  iniciais: { fontWeight: '800', color: cores.verde },
})
