import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { estilosDe, paleta } from '../lib/tema'

export type EstadoDaVoz = 'parado' | 'ouvindo' | 'pensando'

/* O botão de falar, um só para o app inteiro.
 *
 * ── Por que existe ────────────────────────────────────────────────────────
 * Havia dois desenhos para a MESMA ação, e nenhum funcionava:
 *
 *   · o do ditado era uma pílula clara sobre fundo claro, com borda de
 *     `borda` — no aparelho ela quase não se separava do fundo, e o círculo
 *     verde do microfone ficava boiando dentro de nada.
 *   · o do modo treino era menta com borda fina e ícone de traço, do tamanho
 *     do texto — lido como controle DESLIGADO, que é o oposto do que ele é.
 *
 * A queixa foi a mesma três vezes: "esse botão de microfone é feio". Ela
 * estava certa, e o problema não era o ícone: era o botão não ter peso.
 *
 * ── As decisões ──────────────────────────────────────────────────────────
 * **A bolha do microfone é sólida e grande.** Ela é a âncora — o que faz o
 * olho achar o botão sem ler. Ícone de traço do tamanho da letra vira
 * pontuação, não controle.
 *
 * **O fundo é menta com borda verde**, e não cartão com borda cinza. O verde
 * diz "isto faz alguma coisa"; o cinza diz "isto é uma caixa".
 *
 * **Gravando, ele INVERTE** — verde cheio, texto branco, ponto pulsando. A
 * mudança de figura-e-fundo é o sinal mais rápido que existe de que o estado
 * mudou, e quem está falando não vai ler rótulo.
 *
 * **A altura é 56 e o raio é 16**, do mesmo degrau do resto do app. Antes eram
 * 52/26 num lugar e 46/14 no outro. */
export function BotaoDeVoz({
  estado,
  rotulo,
  rotuloOuvindo = 'Toque para parar',
  detalhe,
  onPress,
}: {
  estado: EstadoDaVoz
  rotulo: string
  rotuloOuvindo?: string
  /* O cronômetro, ou o que estiver acontecendo. Aparece à direita, e some
     quando não há nada a dizer — um espaço vazio reservado desequilibra a
     linha inteira. */
  detalhe?: string
  onPress: () => void
}) {
  const styles = estilos()
  const ouvindo = estado === 'ouvindo'
  const pensando = estado === 'pensando'

  return (
    <Pressable
      onPress={onPress}
      disabled={pensando}
      style={({ pressed }) => [
        styles.botao,
        ouvindo && styles.botaoOuvindo,
        pressed && !pensando && styles.pressionado,
      ]}
      accessibilityRole="button"
      accessibilityState={{ busy: pensando }}
      accessibilityLabel={ouvindo ? rotuloOuvindo : rotulo}
    >
      <View style={[styles.bolha, ouvindo && styles.bolhaOuvindo]}>
        {pensando ? (
          <ActivityIndicator size="small" color={paleta().cores.branco} />
        ) : ouvindo ? (
          /* Quadrado de parar, e não outro microfone: o ícone tem de dizer o
             que o TOQUE faz, e não o que o botão é. */
          <Ionicons name="stop" size={16} color={paleta().cores.verde} />
        ) : (
          <Ionicons name="mic" size={19} color={paleta().cores.branco} />
        )}
      </View>

      <Text style={[styles.rotulo, ouvindo && styles.rotuloOuvindo]} numberOfLines={1}>
        {pensando ? 'Entendendo…' : ouvindo ? rotuloOuvindo : rotulo}
      </Text>

      {!!detalhe && (
        <Text style={[styles.detalhe, ouvindo && styles.detalheOuvindo]}>{detalhe}</Text>
      )}
    </Pressable>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    botao: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      height: 56,
      paddingLeft: 10,
      paddingRight: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: t.cores.verde,
      backgroundColor: t.cores.verdeMenta,
    },
    botaoOuvindo: { backgroundColor: t.cores.verde, borderColor: t.cores.verde },
    pressionado: { opacity: 0.75 },

    bolha: {
      width: 36,
      height: 36,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.cores.verde,
    },
    bolhaOuvindo: { backgroundColor: t.cores.branco },

    rotulo: { flex: 1, fontSize: 14.5, fontWeight: '700', color: t.cores.verdeEscuro },
    rotuloOuvindo: { color: t.cores.branco },

    detalhe: {
      fontSize: 13,
      fontWeight: '700',
      color: t.cores.verdeEscuro,
      /* Dígito de largura fixa: o cronômetro não pode empurrar o rótulo a cada
         segundo. */
      fontVariant: ['tabular-nums'],
    },
    detalheOuvindo: { color: t.cores.branco },
  }),
)
