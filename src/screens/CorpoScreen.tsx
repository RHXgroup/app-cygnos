import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { RelatoriosScreen } from './RelatoriosScreen'
import { estilosDe, paleta } from '../lib/tema'

/* A aba Corpo: como o corpo respondeu.
 *
 * ── Por que ela existe ─────────────────────────────────────────────────────
 * Peso, sono, treino e relatórios viviam em quatro lugares diferentes — dois
 * atrás do botão de registrar, um numa aba própria da barra e um dentro de um
 * cartão da tela inicial. São o mesmo assunto: o que o corpo devolve. Estarem
 * separados obrigava a pessoa a decorar onde cada um mora.
 *
 * ── Por que ela substitui a aba Relatórios ─────────────────────────────────
 * "Relatórios" ocupava um dos quatro lugares da barra e é consulta ocasional —
 * ninguém abre relatório todo dia. Aqui ele continua inteiro, mas como uma
 * parte, e o lugar na barra passa a servir também ao peso e ao treino, que são
 * registro semanal.
 *
 * ── Por que nunca nasce vazia ──────────────────────────────────────────────
 * Foi esse o defeito da aba Mensagens, que sai da barra nesta mesma mudança:
 * quem não tem nutricionista abria uma aba permanentemente vazia e em duas
 * semanas parava de olhar. Aqui não acontece — peso todo mundo registra, e o
 * relatório desenha o que houver. */

export function CorpoScreen({
  contaId,
  versao,
  onAbrirPeso,
  onAbrirSono,
  onAbrirTreino,
  onAbrirMetas,
}: {
  contaId: string
  /* A soma dos contadores de registro. A aba fica montada dentro do carrossel e
     nunca remonta sozinha — sem isto, quem pesa e desliza para cá vê o número
     de antes. */
  versao: number
  onAbrirPeso: () => void
  onAbrirSono: () => void
  onAbrirTreino: () => void
  onAbrirMetas: () => void
}) {
  const styles = estilos()
  const { top } = useSafeAreaInsets()

  return (
    <View style={[styles.tela, { paddingTop: top + 8 }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.titulo}>Corpo</Text>

        {/* Os três destinos de REGISTRO vêm antes do relatório: registrar é
            semanal e ler relatório é mensal, e a ordem da tela deve ser a
            ordem da frequência. */}
        <View style={styles.lista}>
          <Linha
            icone="speedometer-outline"
            titulo="Peso"
            sub="Registrar e ver a evolução"
            onPress={onAbrirPeso}
            styles={styles}
          />
          <Linha
            icone="moon-outline"
            titulo="Sono"
            sub="Quanto e como você dormiu"
            onPress={onAbrirSono}
            styles={styles}
          />
          <Linha
            icone="barbell-outline"
            titulo="Treino"
            sub="Sua rotina e o que já treinou"
            onPress={onAbrirTreino}
            styles={styles}
          />
        </View>

        {/* O relatório inteiro, e não um resumo com "ver mais". Ele já era uma
            aba da barra: rebaixá-lo a um link seria tirar da pessoa o que ela
            hoje alcança com um toque. */}
        <RelatoriosScreen contaId={contaId} versao={versao} onAbrirMetas={onAbrirMetas} />
      </ScrollView>
    </View>
  )
}

function Linha({
  icone,
  titulo,
  sub,
  onPress,
  styles,
}: {
  icone: keyof typeof Ionicons.glyphMap
  titulo: string
  sub: string
  onPress: () => void
  styles: ReturnType<typeof estilos>
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.linha, pressed && styles.pressionada]}
      accessibilityRole="button"
      accessibilityLabel={titulo}
    >
      <View style={styles.icone}>
        <Ionicons name={icone} size={19} color={paleta().cores.verde} />
      </View>
      <View style={styles.texto}>
        <Text style={styles.rotulo}>{titulo}</Text>
        <Text style={styles.sub}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color={paleta().inkFraco} />
    </Pressable>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.cores.fundo },
    titulo: {
      fontSize: 27,
      fontWeight: '800',
      color: t.cores.ink,
      letterSpacing: -0.6,
      paddingHorizontal: 20,
      paddingBottom: 14,
    },
    lista: {
      marginHorizontal: 20,
      backgroundColor: t.cores.cartao,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.cores.borda,
      overflow: 'hidden',
      marginBottom: 8,
    },
    linha: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 13,
    },
    pressionada: { backgroundColor: t.cores.superficie },
    icone: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: t.cores.verdeMenta,
      alignItems: 'center',
      justifyContent: 'center',
    },
    texto: { flex: 1, gap: 1 },
    rotulo: { fontSize: 15, fontWeight: '600', color: t.cores.ink },
    sub: { fontSize: 12, color: t.inkFraco },
  }),
)
