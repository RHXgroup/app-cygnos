import Ionicons from '@expo/vector-icons/Ionicons'
import { StyleSheet, Text, View } from 'react-native'
import { estilosDe, paleta } from '../lib/tema'

/* A placa que nomeia um trecho de uma tela.
 *
 * ── Por que ela existe ────────────────────────────────────────────────────
 * Duas telas do app são pilhas longas de cartões sem nenhum título: a inicial,
 * com onze blocos, e a "Você", com sete. Quem abre não sabe para onde olhar, e
 * nas duas o mesmo assunto aparecia espalhado — na "Você", as coisas da
 * nutricionista estavam na primeira, na segunda e na quinta posição, com
 * lembretes e aparência no meio.
 *
 * Descrito por quem usa como "fica meio perdido".
 *
 * ── Por que é pequena, e não um título ────────────────────────────────────
 * Um título grande e escuro competiria com o conteúdo dos cartões, que é o que
 * a pessoa veio ver. Pequena e em caixa alta discreta, ela se lê como PLACA: o
 * olho pula de placa em placa e para no assunto que quer, sem ler o resto.
 *
 * ── A regra que não pode ser quebrada ─────────────────────────────────────
 * Placa só existe com conteúdo embaixo. Uma que sobra sobre o nada se lê como
 * falha do app — e é o erro fácil de cometer, porque vários cartões decidem
 * sozinhos se aparecem. Quem usa esta placa precisa saber, do lado de fora, se
 * há o que mostrar.
 *
 * ── E mora aqui, e não dentro de uma das telas ────────────────────────────
 * Nasceu no `HomeScreen`. Copiá-la para a segunda tela criaria duas placas com
 * a mesma cara e vidas separadas, que divergem no dia em que alguém ajustar uma
 * — armadilha 5 do AGENTS.md, na camada visual. */
export function Secao({
  titulo,
  icone,
  /* Recuo à esquerda quando a tela onde ela vive não tem o mesmo alinhamento da
     inicial. Existe para a placa encostar no cartão de baixo, e não para
     regular espaçamento em geral. */
  recuo = 4,
}: {
  titulo: string
  icone: keyof typeof Ionicons.glyphMap
  recuo?: number
}) {
  const styles = estilos()
  return (
    <View style={[styles.secao, { paddingHorizontal: recuo }]}>
      <Ionicons name={icone} size={13} color={paleta().inkSuave} />
      <Text style={styles.titulo}>{titulo}</Text>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    /* O recuo em cima é maior que embaixo de propósito: a placa pertence ao que
       vem DEPOIS dela, e um espaçamento igual dos dois lados a deixaria boiando
       entre dois cartões, pertencendo aos dois e a nenhum. */
    secao: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 20,
      marginBottom: 2,
    },
    titulo: {
      fontSize: 11.5,
      fontWeight: '800',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: t.inkSuave,
    },
  }),
)
