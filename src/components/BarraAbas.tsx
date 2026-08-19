import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { cores, inkFraco } from '../theme'

export type Aba = 'inicio' | 'relatorios' | 'mensagens' | 'mais'

/* O botão "+" do meio NÃO é uma aba: é uma ação de registro. Por isso a lista
   tem quatro itens e o espaço central é reservado à parte. */
const ABAS: { chave: Aba; rotulo: string; icone: keyof typeof Ionicons.glyphMap }[] = [
  { chave: 'inicio', rotulo: 'Início', icone: 'home' },
  { chave: 'relatorios', rotulo: 'Relatórios', icone: 'stats-chart-outline' },
  { chave: 'mensagens', rotulo: 'Mensagens', icone: 'chatbubble-ellipses-outline' },
  { chave: 'mais', rotulo: 'Mais', icone: 'grid-outline' },
]

/* A ordem das abas é a mesma do deslizamento lateral. Exportada para o App não
   manter uma segunda lista que pode sair de sincronia com esta. */
export const ORDEM_ABAS = ABAS.map(a => a.chave)

const LEVANTE = 22 // quanto o botão do meio sobe acima da barra
const DIAMETRO = 56

export function BarraAbas({
  ativa,
  onTrocar,
  onRegistrar,
}: {
  ativa: Aba
  onTrocar: (a: Aba) => void
  onRegistrar: () => void
}) {
  /* A faixa do gesto de voltar do iPhone come a parte de baixo. Sem este
     respiro, os rótulos ficam em cima dela. */
  const { bottom } = useSafeAreaInsets()

  return (
    /* O envólucro reserva a altura do levante. O botão fica DENTRO dele, e não
       estourando para fora da barra: no Android o que sai dos limites do pai é
       recortado, e o círculo apareceria cortado ao meio. */
    <View style={[styles.envolucro, { paddingBottom: Math.max(bottom, 12) }]}>
      <View style={styles.barra}>
        {ABAS.slice(0, 2).map(a => (
          <ItemAba key={a.chave} aba={a} ativa={ativa} onTrocar={onTrocar} />
        ))}

        {/* Espaço reservado para o botão flutuante do meio. */}
        <View style={styles.vao} />

        {ABAS.slice(2).map(a => (
          <ItemAba key={a.chave} aba={a} ativa={ativa} onTrocar={onTrocar} />
        ))}
      </View>

      <Pressable
        onPress={onRegistrar}
        style={({ pressed }) => [styles.botaoMais, pressed && styles.botaoMaisPressionado]}
        accessibilityRole="button"
        accessibilityLabel="Registrar"
      >
        {/* Ícone escuro, e não branco: o limão é claro demais para carregar
            branco por cima. */}
        <Ionicons name="add" size={28} color={cores.sobreLimao} />
      </Pressable>
    </View>
  )
}

function ItemAba({
  aba,
  ativa,
  onTrocar,
}: {
  aba: { chave: Aba; rotulo: string; icone: keyof typeof Ionicons.glyphMap }
  ativa: Aba
  onTrocar: (a: Aba) => void
}) {
  const selecionada = aba.chave === ativa
  return (
    <Pressable
      onPress={() => onTrocar(aba.chave)}
      style={styles.item}
      accessibilityRole="tab"
      accessibilityState={{ selected: selecionada }}
      accessibilityLabel={aba.rotulo}
    >
      <Ionicons name={aba.icone} size={21} color={selecionada ? cores.limao : inkFraco} />
      <Text style={[styles.rotulo, selecionada && styles.rotuloAtivo]} numberOfLines={1}>
        {aba.rotulo}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  envolucro: { paddingTop: LEVANTE, backgroundColor: cores.fundo },
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    borderRadius: 26,
    backgroundColor: cores.superficie,
    /* Fio de borda claro: sobre fundo quase preto, cartão sem contorno some.
       É o que separa a barra da tela em vez da sombra, que no escuro não
       aparece. */
    borderWidth: 1,
    borderColor: cores.borda,
    paddingVertical: 10,
  },
  item: { flex: 1, alignItems: 'center', gap: 4 },
  /* Mesma largura de um item para os quatro ficarem simétricos em volta do
     botão do meio. */
  vao: { flex: 1 },
  rotulo: { fontSize: 10.5, color: inkFraco },
  rotuloAtivo: { color: cores.limao, fontWeight: '700' },

  botaoMais: {
    position: 'absolute',
    top: 0,
    /* left 50% + metade do diâmetro para a esquerda: centraliza sem precisar
       medir a largura da tela. */
    left: '50%',
    marginLeft: -DIAMETRO / 2,
    width: DIAMETRO,
    height: DIAMETRO,
    borderRadius: DIAMETRO / 2,
    backgroundColor: cores.limao,
    alignItems: 'center',
    justifyContent: 'center',
    /* Sombra na cor do próprio botão: sobre fundo escuro, sombra preta não
       existe. Colorida, ela vira o brilho que o desenho tem em volta do
       círculo. */
    shadowColor: cores.limao,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  botaoMaisPressionado: { backgroundColor: cores.limaoEscuro },
})
