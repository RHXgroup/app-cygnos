import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { estilosDe, paleta } from '../lib/tema'

/* Depois de definir as refeições do dia, como preenchê-las.
 *
 * O caminho da Aurora ficou desenhado e desligado por meses, com o selo "Em
 * breve". Agora ele funciona — e continua sendo o segundo cartão, e não o
 * primeiro: quem já sabe o que vai comer não precisa de sugestão nenhuma, e
 * empurrar a IA na frente de quem tem certeza é atrapalhar. */
export function ModoPlanoScreen({
  quantasRefeicoes,
  onManual,
  onAurora,
  onVoltar,
}: {
  quantasRefeicoes: number
  onManual: () => void
  onAurora: () => void
  onVoltar: () => void
}) {
  const styles = estilos()
  const { top } = useSafeAreaInsets()

  return (
    <>
      <View style={[styles.cabecalho, { paddingTop: top + 8 }]}>
        <Pressable
          onPress={onVoltar}
          style={styles.botaoVoltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela}>Planejamento alimentar</Text>
        <View style={styles.botaoVoltar} />
      </View>

      <ScrollView
        contentContainerStyle={styles.conteudo}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
      >
        <Text style={styles.pergunta}>Como você quer montar o plano?</Text>
        <Text style={styles.apoio}>
          Seu dia tem {quantasRefeicoes}{' '}
          {quantasRefeicoes === 1 ? 'refeição' : 'refeições'}. Agora é hora de dizer o que vai em
          cada uma.
        </Text>

        <Pressable
          onPress={onManual}
          style={({ pressed }) => [styles.cartao, pressed && styles.cartaoPressionado]}
          accessibilityRole="button"
        >
          <View style={styles.icone}>
            <Ionicons name="create-outline" size={22} color={paleta().cores.verde} />
          </View>
          <View style={styles.textoCartao}>
            <Text style={styles.tituloCartao}>Manual</Text>
            <Text style={styles.descricaoCartao}>
              Você escolhe os alimentos de cada refeição e informa a quantidade.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={paleta().inkFraco} />
        </Pressable>

        <Pressable
          onPress={onAurora}
          style={({ pressed }) => [styles.cartao, pressed && styles.cartaoPressionado]}
          accessibilityRole="button"
        >
          <View style={styles.icone}>
            <Ionicons name="sparkles-outline" size={22} color={paleta().cores.verde} />
          </View>
          <View style={styles.textoCartao}>
            <Text style={styles.tituloCartao}>Ajuda da Aurora</Text>
            <Text style={styles.descricaoCartao}>
              A Aurora monta uma sugestão a partir das suas metas, e você ajusta o que quiser antes
              de salvar.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={paleta().inkFraco} />
        </Pressable>
      </ScrollView>
    </>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  botaoVoltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  tituloTela: { flexShrink: 1, fontSize: 17, fontWeight: '800', color: t.cores.ink },

  conteudo: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, gap: 12 },
  pergunta: { fontSize: 20, fontWeight: '800', color: t.cores.ink, letterSpacing: -0.4 },
  apoio: { marginTop: -4, marginBottom: 10, fontSize: 13.5, lineHeight: 20, color: t.inkSuave },

  cartao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 20,
    backgroundColor: t.cores.cartao,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  cartaoPressionado: { backgroundColor: t.cores.verdeMenta, borderColor: t.cores.verdeClaro },
  /* Sem Pressable em volta: um botão que responde ao toque e não faz nada é
     pior que um botão visivelmente desligado. */
  cartaoDesligado: { opacity: 0.7 },

  icone: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: t.cores.verdeClaro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconeDesligado: { backgroundColor: t.cores.trilho },

  textoCartao: { flex: 1 },
  linhaTitulo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tituloCartao: { fontSize: 16, fontWeight: '800', color: t.cores.ink },
  tituloDesligado: { color: t.inkMedio },
  descricaoCartao: { marginTop: 4, fontSize: 13, lineHeight: 19, color: t.inkSuave },

  selo: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: t.cores.trilho,
  },
  textoSelo: { fontSize: 10.5, fontWeight: '800', color: t.inkMedio, letterSpacing: 0.2 },
  }),
)
