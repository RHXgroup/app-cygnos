import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { TotaisPlano } from '../components/TotaisPlano'
import { detalheDoItem, totaisDe, type RefeicaoSalva } from '../lib/plano'
import { cores, inkFraco, inkSuave } from '../theme'

/* Uma refeição sozinha: o que tem nela e quanto ela soma.
 *
 * Só esta refeição, de propósito. Quem toca em "Próxima refeição" está
 * perguntando "o que eu como agora?", e abrir o plano inteiro devolveria a
 * pergunta com o dia todo na cara — de novo, já que ele está logo acima na
 * tela inicial. */
export function RefeicaoScreen({
  refeicao,
  quando,
  onFechar,
}: {
  refeicao: RefeicaoSalva
  /* "Hoje", "Amanhã", "Seg" — de onde esta refeição foi aberta no calendário.
     Sem isso, a tela mostra uma janta às 19:30 sem dizer de que dia. */
  quando: string
  onFechar: () => void
}) {
  const { top, bottom } = useSafeAreaInsets()
  const totais = totaisDe(refeicao.itens)

  return (
    <View style={[styles.tela, { paddingTop: top + 8 }]}>
      <View style={styles.cabecalho}>
        <Pressable
          onPress={onFechar}
          style={styles.botaoVoltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela} numberOfLines={1}>
          {refeicao.rotulo}
        </Text>
        <View style={styles.botaoVoltar} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.conteudo, { paddingBottom: Math.max(bottom, 24) }]}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
      >
        <View style={styles.linhaQuando}>
          <View style={styles.hora}>
            <Ionicons name="time-outline" size={14} color={cores.verdeEscuro} />
            <Text style={styles.textoHora}>{refeicao.hora}</Text>
          </View>
          <Text style={styles.quando}>{quando}</Text>
        </View>

        <TotaisPlano totais={totais} rotulo="Total da refeição" />

        <Text style={styles.secao}>
          {refeicao.itens.length === 1 ? '1 alimento' : `${refeicao.itens.length} alimentos`}
        </Text>

        {refeicao.itens.length === 0 ? (
          <Text style={styles.vazia}>
            Esta refeição está no seu plano, mas ainda não tem nenhum alimento.
          </Text>
        ) : (
          refeicao.itens.map(i => (
            <View key={i.id} style={styles.item}>
              <Text style={styles.nomeItem} numberOfLines={2}>
                {i.nome}
              </Text>
              {!!i.marca && <Text style={styles.marcaItem}>{i.marca}</Text>}
              <Text style={styles.detalheItem}>{detalheDoItem(i)}</Text>

              {/* As variações só aparecem aqui, e não no plano da tela inicial:
                  lá elas triplicariam a altura de um cartão que serve para
                  passar o olho. Aqui é onde se decide o que vai no prato. */}
              {i.variacoes.length > 0 && (
                <View style={styles.variacoes}>
                  <Text style={styles.tituloVariacoes}>Ou, no lugar dele:</Text>
                  {i.variacoes.map(v => (
                    <View key={v.id} style={styles.variacao}>
                      <View style={styles.marcador} />
                      <View style={styles.textoVariacao}>
                        <Text style={styles.nomeVariacao} numberOfLines={2}>
                          {v.nome}
                        </Text>
                        <Text style={styles.detalheVariacao}>{detalheDoItem(v)}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },

  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  botaoVoltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  tituloTela: { flexShrink: 1, fontSize: 17, fontWeight: '800', color: cores.ink },

  conteudo: { paddingHorizontal: 20, paddingTop: 4, gap: 12 },

  linhaQuando: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hora: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: cores.verdeClaro,
  },
  textoHora: { fontSize: 13, fontWeight: '800', color: cores.verdeEscuro },
  quando: { fontSize: 13, color: inkSuave },

  secao: { marginTop: 6, fontSize: 13, fontWeight: '800', color: inkSuave },

  item: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: cores.cartao,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  nomeItem: { fontSize: 15, fontWeight: '700', color: cores.ink, lineHeight: 20 },
  marcaItem: { marginTop: 2, fontSize: 12.5, color: inkFraco },
  detalheItem: { marginTop: 4, fontSize: 12.5, color: inkSuave },

  vazia: { fontSize: 13, lineHeight: 19, color: inkFraco },

  variacoes: {
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
  },
  tituloVariacoes: { fontSize: 11.5, fontWeight: '800', color: cores.verdeEscuro },
  variacao: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  /* Um ponto em vez de bullet de texto: alinha com a linha do nome sem depender
     da altura da fonte do aparelho. */
  marcador: { width: 6, height: 6, borderRadius: 3, backgroundColor: cores.verdeClaro },
  textoVariacao: { flex: 1 },
  nomeVariacao: { fontSize: 14, fontWeight: '600', color: cores.ink, lineHeight: 19 },
  detalheVariacao: { marginTop: 1, fontSize: 12, color: inkSuave },
})
