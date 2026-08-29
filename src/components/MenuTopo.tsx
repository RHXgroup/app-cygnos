import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { estilosDe, paleta } from '../lib/tema'

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
  const styles = estilos()
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
              <Ionicons name={item.icone} size={18} color={paleta().cores.ink} />
              <Text style={styles.rotulo}>{item.rotulo}</Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  cartao: {
    position: 'absolute',
    left: 20,
    minWidth: 200,
    borderRadius: 16,
    backgroundColor: t.cores.superficie,
    paddingVertical: 4,
    /* Borda, e não só sombra: sombra preta sobre fundo preto não recorta nada,
       e o menu ficaria colado na tela atrás dele. */
    borderWidth: 1,
    borderColor: t.cores.borda,
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13 },
  itemComDivisor: { borderTopWidth: 1, borderTopColor: t.cores.borda },
  /* Pressionado CLAREIA, e não escurece: no tema escuro o realce vem de somar
     luz, e escurecer faria o item parecer desabilitado. */
  itemPressionado: { backgroundColor: t.cores.trilho },
  rotulo: { fontSize: 14.5, fontWeight: '600', color: t.inkMedio },
  }),
)
