import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { cores, inkMedio } from '../theme'

export type ItemMenu = {
  chave: string
  rotulo: string
  icone: keyof typeof Ionicons.glyphMap
  onPress: () => void
}

/* Menuzinho ancorado no botão de menu do topo. Usa Modal — e não uma View
   sobreposta — porque só o Modal garante ficar acima de tudo, inclusive do
   carrossel de abas e da barra de baixo. */
export function MenuTopo({
  visivel,
  topo,
  itens,
  onFechar,
}: {
  visivel: boolean
  /* Distância do topo da tela até o menu. Vem de fora porque depende do inset
     do aparelho, que quem sabe é a tela. */
  topo: number
  itens: ItemMenu[]
  onFechar: () => void
}) {
  return (
    <Modal
      visible={visivel}
      transparent
      animationType="fade"
      onRequestClose={onFechar}
      /* Botão físico de voltar no Android também fecha. */
      statusBarTranslucent
    >
      {/* Toque em qualquer lugar fora fecha: é o que se espera de um menu, e
          poupa um botão de fechar dentro dele. */}
      <Pressable style={styles.fundo} onPress={onFechar}>
        <View style={[styles.cartao, { top: topo }]}>
          {itens.map((item, i) => (
            <Pressable
              key={item.chave}
              onPress={() => {
                /* Fecha antes de agir: abrir outra tela com o menu ainda montado
                   deixa dois modais empilhados no iOS. */
                onFechar()
                item.onPress()
              }}
              style={({ pressed }) => [
                styles.item,
                i > 0 && styles.itemComDivisor,
                pressed && styles.itemPressionado,
              ]}
              accessibilityRole="menuitem"
            >
              <Ionicons name={item.icone} size={18} color={cores.ink} />
              <Text style={styles.rotulo}>{item.rotulo}</Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(16,20,19,0.22)' },
  cartao: {
    position: 'absolute',
    left: 20,
    minWidth: 200,
    borderRadius: 16,
    backgroundColor: cores.branco,
    paddingVertical: 4,
    shadowColor: '#101413',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13 },
  itemComDivisor: { borderTopWidth: 1, borderTopColor: cores.borda },
  itemPressionado: { backgroundColor: cores.cartao },
  rotulo: { fontSize: 14.5, fontWeight: '600', color: inkMedio },
})
