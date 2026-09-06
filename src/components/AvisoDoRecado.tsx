import { useEffect, useRef } from 'react'
import {
  Animated,
  Easing,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { primeiroNomeDela, type RecadoDaNutri } from '../lib/recadoDaNutri'
import { RAIO_CARTAO, estilosDe, paleta } from '../lib/tema'

/* O recado da nutricionista, como aviso na tela que abre todo dia.
 *
 * ── Ele já foi quatro coisas, e o que cada troca ensinou ──────────────────
 * Linha de caixa de entrada com seta; cartão de saudação com foto grande;
 * faixa fixa; e um aviso que sumia sozinho depois de alguns segundos.
 *
 * O que ficou de cada uma: o DESENHO do aviso é o que agradou ("ficou legal, a
 * forma que apareceu"), e o TEMPORIZADOR é o que caiu — "ele não sumiria
 * sozinho, ele aparece igual apareceu (…) caso ela não consiga ler".
 *
 * E o argumento é bom. Um aviso que evapora aposta que a pessoa estava olhando
 * na hora em que o app abriu; quem abriu o app com o celular na mão indo para o
 * trabalho perde a frase e não sabe que perdeu. Isso é aceitável para "salvo
 * com sucesso"; não é para a única frase que uma profissional de saúde escreveu
 * para ela esta semana.
 *
 * ── Então quem tira é ela ─────────────────────────────────────────────────
 * Arrastando para o lado, como se joga fora uma notificação, ou pelo ×. Os dois
 * fazem a mesma coisa: só quem leu decide que já leu.
 *
 * O × existe porque arrastar não se descobre sozinho — quem nunca tentou não
 * sabe que dá. E o arrastar existe porque quem já sabe não quer procurar um
 * alvo de 30 pixels.
 *
 * ── Está DENTRO da rolagem, e isso mudou junto ────────────────────────────
 * Enquanto ele sumia sozinho, flutuava por cima: assim o desaparecimento não
 * fazia a tela saltar. Agora que ele fica até ser dispensado, flutuar
 * significaria tapar um pedaço da tela inicial por tempo indeterminado — então
 * ele volta a ocupar o lugar dele, empurrando o resto para baixo enquanto
 * existir. O salto de volta agora acontece só depois de um gesto DELA, e
 * conteúdo que sai quando se joga fora não é susto: é a resposta.
 *
 * ── E o recado não depende disto para existir ─────────────────────────────
 * Ele também está em Mensagens, que é onde ela procura quando lembrar que "a
 * nutri falou alguma coisa". Este aviso é a batida na porta, e não a carta.
 *
 * ── A assinatura fica ─────────────────────────────────────────────────────
 * É a única parte que eu não tiraria. Sem ela, "Boa noite, continue assim!" se
 * lê como o APP falando — mensagem de sistema, dessas que todo aplicativo
 * escreve e ninguém lê. O valor está em ter vindo de uma pessoa que ela
 * consulta de verdade, e essa é justamente a parte que nenhum concorrente pode
 * copiar. */

const ENTRADA_MS = 300
const SAIDA_MS = 200

/* Quanto o dedo precisa andar para valer como "joguei fora".
 *
 * Fração da largura, e não pixels: 90 px são um terço da tela num aparelho
 * pequeno e um oitavo num grande, e o mesmo gesto teria significados
 * diferentes. */
const FRACAO_PARA_SUMIR = 0.3
/* Um gesto RÁPIDO conta mesmo sem chegar lá. É como se joga fora de verdade —
   um peteleco curto —, e exigir a distância inteira faria o aviso voltar para o
   lugar depois de um gesto que qualquer pessoa leria como descarte. */
const VELOCIDADE_PARA_SUMIR = 0.5

export function AvisoDoRecado({
  recado,
  /* Chamado quando ele terminou de sair. Quem chama usa isto para DESMONTAR e
     para marcar o recado como visto — e as duas coisas acontecem só depois de
     um gesto dela, que é o que garante que ninguém marca por ela. */
  onSumir,
}: {
  recado: RecadoDaNutri
  onSumir: () => void
}) {
  const styles = estilos()
  const { width } = useWindowDimensions()

  /* Entrada e saída: opacidade e deslocamento vertical. */
  const anima = useRef(new Animated.Value(0)).current
  /* O arraste horizontal, separado porque ele é conduzido pelo dedo e não por
     uma animação com tempo. */
  const arraste = useRef(new Animated.Value(0)).current

  /* Ref, e não estado: o × e o arraste podem chegar quase juntos, e a segunda
     saída começaria do meio da primeira e daria um tranco. */
  const saindo = useRef(false)

  /* A saída mora num ref para o gesto, o botão e o efeito chamarem a MESMA
     função — três caminhos para o mesmo fim, e um só lugar que sabe como. */
  const sair = useRef((paraOnde: number) => {
    if (saindo.current) return
    saindo.current = true
    Animated.parallel([
      Animated.timing(arraste, {
        toValue: paraOnde,
        duration: SAIDA_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(anima, {
        toValue: 0,
        duration: SAIDA_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => onSumir())
  }).current

  useEffect(() => {
    Animated.timing(anima, {
      toValue: 1,
      duration: ENTRADA_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
    /* Uma vez por montagem: o aviso nasce e morre com um recado só, e quem
       troca o recado troca a `key` de quem o monta. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dedo = useRef(
    PanResponder.create({
      /* NÃO pega o toque no início: pegar de saída roubaria o toque do × e
         mataria a rolagem da tela inteira, que passa por baixo deste
         componente. */
      onStartShouldSetPanResponder: () => false,
      /* Só quando o dedo anda claramente na HORIZONTAL. A tela por fora é uma
         rolagem vertical; sem esta comparação, tentar rolar a página com o dedo
         em cima do aviso arrastaria o aviso em vez de rolar. */
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => arraste.setValue(g.dx),
      onPanResponderRelease: (_, g) => {
        const longe = Math.abs(g.dx) > width * FRACAO_PARA_SUMIR
        const rapido = Math.abs(g.vx) > VELOCIDADE_PARA_SUMIR
        if (longe || rapido) {
          /* Sai para o lado para onde ela empurrou: sair para o outro seria o
             aviso discordando do gesto. `Math.sign` do próprio deslocamento, e
             não da velocidade, porque um peteleco pode terminar com o dedo
             voltando um pouco. */
          sair((g.dx < 0 ? -1 : 1) * width)
          return
        }
        /* Não foi longe nem rápido: volta ao lugar. Mola, e não tempo — é o que
           faz parecer que o aviso resistiu, em vez de ter escorregado de
           volta. */
        Animated.spring(arraste, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 6,
        }).start()
      },
      /* Uma interrupção do sistema (ligação, notificação) deixaria o aviso preso
         torto no meio da tela. */
      onPanResponderTerminate: () => {
        Animated.spring(arraste, { toValue: 0, useNativeDriver: true }).start()
      },
    }),
  ).current

  return (
    <Animated.View
      {...dedo.panHandlers}
      style={[
        styles.moldura,
        {
          opacity: anima,
          transform: [
            { translateX: arraste },
            {
              /* Desce de cima, como notificação do sistema. Doze pixels: o
                 bastante para o olho registrar movimento, pouco o bastante para
                 não parecer que a tela inteira pulou. */
              translateY: anima.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }),
            },
          ],
        },
      ]}
      /* O leitor de tela não arrasta. A ação de acessibilidade é o que dá a
         mesma saída para quem depende dele — sem ela, o aviso seria a única
         coisa da tela que não se consegue dispensar. */
      accessible
      accessibilityLabel={`Recado de ${primeiroNomeDela(recado.nome)}, sua nutricionista. ${recado.texto}`}
      accessibilityActions={[{ name: 'dispensar', label: 'Dispensar o recado' }]}
      onAccessibilityAction={e => {
        if (e.nativeEvent.actionName === 'dispensar') sair(width)
      }}
    >
      <View style={styles.selo}>
        <Ionicons name="chatbubble-ellipses" size={14} color={paleta().cores.verde} />
      </View>

      <View style={styles.textos}>
        {/* Sem `numberOfLines`: cortar com reticências a frase de uma
            profissional de saúde é pior do que o aviso ter três linhas. */}
        <Text style={styles.fala}>{recado.texto}</Text>
        <Text style={styles.assinatura}>
          {primeiroNomeDela(recado.nome)}, sua nutricionista
        </Text>
      </View>

      {/* `hitSlop` porque o × desenhado é pequeno de propósito — ele não pode
          competir com a frase —, e área de toque pequena não é o mesmo que
          desenho pequeno. */}
      <Pressable
        onPress={() => sair(width)}
        hitSlop={12}
        style={styles.fechar}
        accessibilityRole="button"
        accessibilityLabel="Dispensar o recado"
      >
        <Ionicons name="close" size={15} color={paleta().inkFraco} />
      </Pressable>
    </Animated.View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    moldura: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingVertical: 12,
      paddingLeft: 13,
      /* Menos à direita: o × já traz a própria folga. */
      paddingRight: 8,
      borderRadius: RAIO_CARTAO,
      backgroundColor: t.cores.cartao,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.cores.verdeClaro,
      /* A sombra é o que diz "isto chegou agora", e separa o aviso dos cartões
         de conteúdo que vêm logo abaixo. */
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOpacity: 0.12,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
        },
        android: { elevation: 4 },
        default: {},
      }),
    },
    /* Alinhado com a primeira linha do texto: centralizado, com duas linhas de
       fala ele boiaria no meio do parágrafo. */
    selo: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.cores.verdeMenta,
    },
    textos: { flex: 1, gap: 3, paddingTop: 2 },
    fala: { fontSize: 14, lineHeight: 20, color: t.cores.ink },
    /* Miúda: diz de quem é, sem disputar com o que foi dito. */
    assinatura: { fontSize: 11.5, fontWeight: '700', color: t.inkSuave },
    fechar: { padding: 4 },
  }),
)
