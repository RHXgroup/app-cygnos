import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { estilosDe, paleta } from '../lib/tema'

export type OpcaoDaEscolha = {
  rotulo: string
  detalhe?: string
  icone: keyof typeof Ionicons.glyphMap
  onEscolher: () => void
}

/* Uma pergunta com MAIS DE DUAS saídas, com a cara do app.
 *
 * ── Por que existe ────────────────────────────────────────────────────────
 * `Confirmacao` cobre "tem certeza?": cancelar e confirmar. Quando as saídas
 * são duas de verdade — tirar agora OU escolher da galeria — ela não serve, e
 * o atalho fácil é chamar `Alert.alert` com três botões.
 *
 * Foi o que eu fiz, e está errado. O `Alert.alert` do Android desenha fundo
 * claro, tipografia do sistema e botões azuis em caixa alta, no meio de um app
 * escuro. Além de feio, ele MENTE SOBRE A ORIGEM: uma caixa que não se parece
 * com o app parece um aviso do celular — foi lido, exatamente assim, como
 * "notificação da Samsung" —, e a pessoa lê com outra atenção.
 *
 * O `Confirmacao` já trazia esse aviso escrito, e havia um comentário em
 * `NutricionistasScreen` registrando que aquele tinha sido o último
 * `Alert.alert` do app. Escrevi dois novos no mesmo dia. Esta peça existe para
 * que a próxima escolha de três saídas não precise do atalho.
 *
 * ── As mesmas decisões do Confirmacao, de propósito ──────────────────────
 * Modal e não View sobreposta: a intenção é bloquear o que está atrás, e o
 * Modal faz o voltar do Android fechar sozinho. Tocar fora cancela. As duas
 * coisas são o que se espera de uma pergunta com saída. */
export function Escolha({
  visivel,
  titulo,
  mensagem,
  opcoes,
  onCancelar,
}: {
  visivel: boolean
  titulo: string
  mensagem?: string
  opcoes: OpcaoDaEscolha[]
  onCancelar: () => void
}) {
  const styles = estilos()
  return (
    <Modal
      visible={visivel}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancelar}
    >
      <Pressable style={styles.fundo} onPress={onCancelar}>
        <Pressable style={styles.caixa} onPress={() => {}}>
          <Text style={styles.titulo}>{titulo}</Text>
          {!!mensagem && <Text style={styles.mensagem}>{mensagem}</Text>}

          {/* Cada saída é uma LINHA, e não um botão numa fileira.
              Fileira obriga os rótulos a caberem lado a lado e empurra para
              "Câmera"/"Galeria" — palavras que dizem o meio e não o que vai
              acontecer. Em linha cabe "Tirar agora" com a explicação embaixo. */}
          <View style={styles.lista}>
            {opcoes.map(o => (
              <Pressable
                key={o.rotulo}
                onPress={() => {
                  /* Fecha ANTES de agir: abrir a câmera com a caixa ainda no ar
                     deixa ela aparecendo por trás quando a câmera volta. */
                  onCancelar()
                  o.onEscolher()
                }}
                style={({ pressed }) => [styles.linha, pressed && styles.pressionada]}
                accessibilityRole="button"
                accessibilityLabel={o.detalhe ? `${o.rotulo}. ${o.detalhe}` : o.rotulo}
              >
                <Ionicons name={o.icone} size={20} color={paleta().cores.verde} />
                <View style={styles.textos}>
                  <Text style={styles.rotulo}>{o.rotulo}</Text>
                  {!!o.detalhe && <Text style={styles.detalhe}>{o.detalhe}</Text>}
                </View>
                <Ionicons name="chevron-forward" size={16} color={paleta().inkFraco} />
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={onCancelar}
            style={({ pressed }) => [styles.botaoCancelar, pressed && styles.pressionada]}
            accessibilityRole="button"
          >
            <Text style={styles.textoCancelar}>Cancelar</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    fundo: {
      flex: 1,
      backgroundColor: t.veu,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
    },
    caixa: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: t.cores.superficie,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: t.cores.borda,
      paddingHorizontal: 22,
      paddingTop: 22,
      paddingBottom: 18,
      gap: 8,
    },
    titulo: { fontSize: 18, fontWeight: '800', color: t.cores.ink, letterSpacing: -0.3 },
    mensagem: { fontSize: 14, color: t.inkMedio, lineHeight: 21 },

    lista: { marginTop: 8, gap: 8 },
    linha: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 13,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.cores.borda,
      backgroundColor: t.cores.cartao,
    },
    pressionada: { opacity: 0.7 },
    textos: { flex: 1 },
    rotulo: { fontSize: 15, fontWeight: '700', color: t.cores.ink },
    detalhe: { fontSize: 12, color: t.inkMedio, marginTop: 1 },

    botaoCancelar: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 18, marginTop: 4 },
    textoCancelar: { fontSize: 14, fontWeight: '700', color: t.inkMedio },
  }),
)
