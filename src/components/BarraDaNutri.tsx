import { Pressable, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { estilosDe, paleta } from '../lib/tema'
import { FONTE } from '../lib/fontes'

export type AbaDaNutri = 'hoje' | 'agenda' | 'pacientes' | 'mais'

/* As abas do lado dela.
 *
 * ──────────────────── Por que quatro, e por que estas ────────────────────
 * Hoje é o dia dela. Agenda é o resto do tempo -- semana, mês, o que ela
 * quiser. Pacientes é quem ela atende. Mais é o que sobra, e sobra pouco de
 * propósito.
 *
 * ──────────────────── E a AURORA no meio, no lugar do "+" ────────────────────
 * No app do paciente o botão levantado do meio é registrar, porque registrar é
 * o gesto que ele repete. O gesto que ela repete é PEDIR -- "quanto recebi
 * hoje", "agenda a Maria quinta", "o que tenho para pagar". É a Aurora que
 * cobre tudo o que não virou tela, e nada disso acontece se a entrada dela
 * estiver escondida atrás de duas rolagens.
 *
 * Ela não é uma aba: é uma ação, e por isso o desenho é o mesmo do "+" --
 * levantado, redondo, e fora da lista de quatro. */
const ABAS: { chave: AbaDaNutri; rotulo: string; icone: keyof typeof Ionicons.glyphMap }[] = [
  { chave: 'hoje', rotulo: 'Hoje', icone: 'today-outline' },
  { chave: 'agenda', rotulo: 'Agenda', icone: 'calendar-outline' },
  { chave: 'pacientes', rotulo: 'Pacientes', icone: 'people-outline' },
  { chave: 'mais', rotulo: 'Mais', icone: 'ellipsis-horizontal' },
]

const LEVANTE = 22
const DIAMETRO = 56

export function BarraDaNutri({
  ativa,
  onTrocar,
  onAurora,
}: {
  ativa: AbaDaNutri
  onTrocar: (a: AbaDaNutri) => void
  onAurora: () => void
}) {
  const styles = estilos()
  /* A faixa do gesto de voltar come a parte de baixo; sem o respiro os rótulos
     ficam em cima dela. */
  const { bottom } = useSafeAreaInsets()

  return (
    /* O envólucro reserva a altura do levante, e o botão fica DENTRO dele: no
       Android o que sai dos limites do pai é recortado, e o círculo apareceria
       cortado ao meio. */
    <View style={[styles.envolucro, { paddingBottom: Math.max(bottom, 12) }]}>
      <View style={styles.barra}>
        {ABAS.slice(0, 2).map(a => (
          <Item key={a.chave} aba={a} ativa={ativa} onTrocar={onTrocar} />
        ))}
        <View style={styles.vao} />
        {ABAS.slice(2).map(a => (
          <Item key={a.chave} aba={a} ativa={ativa} onTrocar={onTrocar} />
        ))}
      </View>

      <Pressable
        onPress={onAurora}
        style={({ pressed }) => [styles.botaoAurora, pressed && styles.botaoAuroraPressionado]}
        accessibilityRole="button"
        accessibilityLabel="Perguntar à Aurora"
      >
        {/* Ícone escuro sobre o limão: a cor é clara demais para carregar
            branco por cima. Mesma decisão do "+" do paciente. */}
        <Ionicons name="sparkles" size={25} color={paleta().cores.sobreLimao} />
      </Pressable>
    </View>
  )
}

function Item({
  aba,
  ativa,
  onTrocar,
}: {
  aba: { chave: AbaDaNutri; rotulo: string; icone: keyof typeof Ionicons.glyphMap }
  ativa: AbaDaNutri
  onTrocar: (a: AbaDaNutri) => void
}) {
  const styles = estilos()
  const selecionada = aba.chave === ativa

  return (
    <Pressable
      onPress={() => onTrocar(aba.chave)}
      style={styles.item}
      accessibilityRole="tab"
      accessibilityState={{ selected: selecionada }}
      accessibilityLabel={aba.rotulo}
    >
      <Ionicons
        name={aba.icone}
        size={21}
        color={selecionada ? paleta().cores.limao : paleta().inkFraco}
      />
      <Text style={[styles.rotulo, selecionada && styles.rotuloAtivo]} numberOfLines={1}>
        {aba.rotulo}
      </Text>
    </Pressable>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    envolucro: { paddingTop: LEVANTE, backgroundColor: t.cores.fundo },
    barra: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 12,
      borderRadius: 26,
      backgroundColor: t.cores.superficie,
      borderWidth: 1,
      borderColor: t.cores.borda,
      paddingVertical: 10,
    },
    item: { flex: 1, alignItems: 'center', gap: 4 },
    vao: { flex: 1 },
    rotulo: { fontFamily: FONTE.media, fontSize: 10.5, color: t.inkFraco },
    /* Familia, e nao `fontWeight`. Com a fonte carregada o peso vira arquivo:
       `fontWeight: '700'` sobre `Archivo_500Medium` desenha o medium no Android
       e nao levanta erro nenhum -- a aba ativa ficaria igual as outras, com so
       a cor separando. Ver `lib/fontes.ts`. */
    rotuloAtivo: { fontFamily: FONTE.forte, color: t.cores.limao },

    botaoAurora: {
      position: 'absolute',
      top: 0,
      /* left 50% menos metade do diâmetro: centraliza sem medir a largura da
         tela. */
      left: '50%',
      marginLeft: -DIAMETRO / 2,
      width: DIAMETRO,
      height: DIAMETRO,
      borderRadius: DIAMETRO / 2,
      backgroundColor: t.cores.limao,
      alignItems: 'center',
      justifyContent: 'center',
      /* Sombra na cor do próprio botão: sobre fundo escuro, sombra preta não
         existe. Colorida, vira o brilho em volta do círculo. */
      shadowColor: t.cores.limao,
      shadowOpacity: 0.45,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 4 },
      elevation: 10,
    },
    botaoAuroraPressionado: { backgroundColor: t.cores.limaoEscuro },
  }),
)
