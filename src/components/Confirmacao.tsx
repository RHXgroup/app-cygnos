import type { ReactNode } from 'react'
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { estilosDe, paleta } from '../lib/tema'

/* A pergunta antes de uma ação sem volta.
 *
 * Substitui o Alert.alert do sistema, que aparecia com a cara do Android — fundo
 * claro, tipografia do sistema, botões em azul — no meio de um app escuro. Além
 * de feio, ele mente sobre a origem: uma caixa que não se parece com o app
 * parece um aviso do celular, e a pessoa lê com outra atenção.
 *
 * Modal, e não View sobreposta como o resto do app: aqui a intenção é
 * justamente BLOQUEAR o que está atrás, e o Modal ainda faz o voltar do Android
 * fechar sozinho pelo onRequestClose — que é o comportamento certo para uma
 * pergunta com "cancelar". */
export function Confirmacao({
  visivel,
  titulo,
  mensagem,
  rotuloConfirmar = 'Confirmar',
  rotuloCancelar = 'Cancelar',
  destrutiva = false,
  ocupada = false,
  children,
  onConfirmar,
  onCancelar,
}: {
  visivel: boolean
  titulo: string
  mensagem: string
  /* O que vai ENTRE a mensagem e os botões: um campo, uma escolha, um aviso.
     A caixa continua servindo para perguntar "tem certeza?" sem nada disso. */
  children?: ReactNode
  /* A ação está em curso. O confirmar apaga e para de responder, para dois
     toques não virarem duas ações. */
  ocupada?: boolean
  rotuloConfirmar?: string
  rotuloCancelar?: string
  /* Pinta o botão de confirmar como perigo. Reservado para o que não tem
     desfazer — usar em tudo gastaria o sinal. */
  destrutiva?: boolean
  onConfirmar: () => void
  onCancelar: () => void
}) {
  const styles = estilos()
  return (
    <Modal
      visible={visivel}
      transparent
      animationType="fade"
      statusBarTranslucent
      /* Botão físico de voltar fecha sem confirmar, como o toque em Cancelar. */
      onRequestClose={onCancelar}
    >
      {/* Tocar fora cancela: é o que se espera de uma caixa de pergunta, e
          poupa a pessoa de mirar no botão pequeno para dizer "não". */}
      <Pressable style={styles.fundo} onPress={onCancelar}>
        {/* O toque no cartão não pode vazar para o fundo e fechar a caixa. */}
        <Pressable style={styles.caixa} onPress={() => {}}>
          <Text style={styles.titulo}>{titulo}</Text>
          <Text style={styles.mensagem}>{mensagem}</Text>

          {children}

          <View style={styles.botoes}>
            <Pressable
              onPress={onCancelar}
              style={({ pressed }) => [styles.botao, styles.botaoCancelar, pressed && styles.pressionado]}
              accessibilityRole="button"
            >
              <Text style={styles.textoCancelar}>{rotuloCancelar}</Text>
            </Pressable>

            <Pressable
              onPress={onConfirmar}
              disabled={ocupada}
              style={({ pressed }) => [
                styles.botao,
                destrutiva ? styles.botaoPerigo : styles.botaoConfirmar,
                (pressed || ocupada) && styles.pressionado,
              ]}
              accessibilityRole="button"
            >
              <Text style={destrutiva ? styles.textoPerigo : styles.textoConfirmar}>
                {rotuloConfirmar}
              </Text>
            </Pressable>
          </View>
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

  botoes: { flexDirection: 'row', gap: 10, marginTop: 14 },
  botao: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
  },
  pressionado: { opacity: 0.75 },

  botaoCancelar: { borderColor: t.cores.borda, backgroundColor: t.cores.cartao },
  textoCancelar: { fontSize: 14.5, fontWeight: '700', color: t.cores.ink },

  botaoConfirmar: { borderColor: t.cores.verde, backgroundColor: t.cores.verde },
  textoConfirmar: { fontSize: 14.5, fontWeight: '800', color: t.cores.branco },

  botaoPerigo: { borderColor: t.cores.erroBorda, backgroundColor: t.cores.erroFundo },
  textoPerigo: { fontSize: 14.5, fontWeight: '800', color: t.cores.erroTexto },
  }),
)
