import { useEffect, useRef } from 'react'
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { primeiroNomeDela, type RecadoDaNutri } from '../lib/recadoDaNutri'
import { RAIO_CARTAO, estilosDe, paleta } from '../lib/tema'

/* O recado da nutricionista, como AVISO: aparece, ela lê, some sozinho.
 *
 * ── Como ele chegou aqui ──────────────────────────────────────────────────
 * Ele já foi três coisas: linha de caixa de entrada com seta, cartão de
 * saudação com foto, e faixa fixa no topo da tela. O pedido que encerrou a
 * discussão foi "quero um aviso que aparece na tela e depois some, e pronto".
 *
 * A diferença não é de tamanho, é de NATUREZA. Cartão é conteúdo: ocupa lugar
 * na tela para sempre, empurra o resto para baixo e obriga a pessoa a decidir o
 * que fazer com ele. Aviso é um instante — ele usa o momento em que a tela
 * abre, que é o único em que se tem atenção de graça, entrega a frase e devolve
 * a tela inteira.
 *
 * ── Por que sumir sozinho é seguro ────────────────────────────────────────
 * Porque o recado NÃO SOME: ele continua em Mensagens, que é onde ela procura
 * quando lembrar que "a nutri falou alguma coisa". O aviso é a batida na porta,
 * e não a carta.
 *
 * Sem essa rede eu não teria feito assim, e vale ficar escrito: um aviso que
 * evapora sendo a única cópia de um recado de profissional de saúde seria a
 * pior combinação possível deste app.
 *
 * ── E a assinatura fica ───────────────────────────────────────────────────
 * É a única parte que eu não tiraria. Sem ela, "Bom dia, continue assim!" se lê
 * como o APP falando — mensagem de sistema, dessas que todo aplicativo escreve
 * e ninguém lê. O valor está em ter vindo de uma pessoa que ela consulta de
 * verdade, e essa é justamente a parte que nenhum concorrente pode copiar. */

const ENTRADA_MS = 260
const SAIDA_MS = 220

/* Quanto tempo o aviso fica parado na tela.
 *
 * Proporcional ao TEXTO, e não fixo: três segundos servem para "Bom dia!" e
 * cortam pela metade um recado de três linhas — e cortar a frase de uma
 * profissional de saúde no meio é o defeito que este número existe para evitar.
 *
 * A conta é leitura calma (~180 palavras por minuto, perto de 16 letras por
 * segundo) mais um segundo e meio para o olho encontrar o aviso, que apareceu
 * sozinho e não estava sendo procurado. O teto de 11 segundos existe porque
 * acima disso ele deixa de ser aviso e vira coisa parada na tela. */
export function tempoDeLeituraMs(texto: string): number {
  const conta = 1_500 + (texto.trim().length / 16) * 1_000
  return Math.min(11_000, Math.max(4_500, Math.round(conta)))
}

export function AvisoDoRecado({
  recado,
  /* Chamado quando ele terminou de sair, e não quando começa: quem chama usa
     isto para DESMONTAR o componente, e desmontar no começo cortaria a
     animação de saída pela metade — o aviso sumiria com um corte seco, que é
     exatamente o susto que uma saída animada existe para evitar.
     Marcar como visto acontece no mesmo momento, e pelo mesmo motivo é o
     momento certo: app fechado no meio da exibição volta a mostrar o aviso, e
     isso está certo — ela não chegou a ler. */
  onSumir,
  /* Só a posição vertical vem de fora: quem monta é quem sabe onde acaba a
     barra de cima daquela tela. O resto do desenho é deste arquivo. */
  style,
}: {
  recado: RecadoDaNutri
  onSumir: () => void
  style?: StyleProp<ViewStyle>
}) {
  const styles = estilos()
  const anima = useRef(new Animated.Value(0)).current

  /* O toque antecipa a saída, e para isso precisa alcançar a função que mora
     dentro do efeito. Um ref é o que liga os dois sem duplicar a lógica. */
  const antecipar = useRef<() => void>(() => {})

  /* Ref, e não estado: quem tocar no aviso enquanto o relógio corre não pode
     disparar a saída duas vezes — a segunda animação começaria do meio e daria
     um tranco. */
  const saindo = useRef(false)

  useEffect(() => {
    let relogio: ReturnType<typeof setTimeout> | undefined

    const sair = () => {
      if (saindo.current) return
      saindo.current = true
      Animated.timing(anima, {
        toValue: 0,
        duration: SAIDA_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(() => onSumir())
    }
    antecipar.current = sair

    Animated.timing(anima, {
      toValue: 1,
      duration: ENTRADA_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      /* Só conta o tempo DEPOIS de o aviso estar inteiro na tela. Começar a
         contagem junto com a entrada roubaria os primeiros instantes de
         leitura, que são justamente os que a pessoa gasta percebendo que
         apareceu alguma coisa. */
      if (finished) relogio = setTimeout(sair, tempoDeLeituraMs(recado.texto))
    })

    return () => {
      if (relogio) clearTimeout(relogio)
    }
    /* Uma vez por montagem, de propósito: o aviso nasce e morre com um recado
       só. Quem troca o recado troca a `key` de quem monta este componente, e
       aí ele nasce de novo — que é o comportamento certo para uma mensagem
       nova. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Animated.View
      /* `box-none` na moldura: ela é uma faixa da largura da tela, e sem isto
         engoliria o toque no que estiver por baixo durante os instantes em que
         já está transparente mas ainda montada. */
      pointerEvents="box-none"
      style={[
        styles.moldura,
        style,
        {
          opacity: anima,
          transform: [
            {
              /* Desce de cima, como notificação do sistema. Doze pixels: o
                 bastante para o olho registrar movimento, pouco o bastante para
                 não parecer que a tela inteira pulou. */
              translateY: anima.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }),
            },
          ],
        },
      ]}
    >
      <Pressable
        onPress={() => antecipar.current()}
        style={styles.aviso}
        accessibilityRole="button"
        /* O rótulo diz QUEM falou antes do que foi dito: quem usa leitor de tela
           não vê o ícone, e "sua nutricionista" é o que faz a frase merecer
           atenção. */
        accessibilityLabel={`Recado de ${primeiroNomeDela(recado.nome)}, sua nutricionista. ${recado.texto}. Toque para dispensar.`}
        /* Ele some sozinho, então o leitor de tela precisa anunciá-lo na hora em
           que aparece — do contrário ele passa inteiro sem nunca ter existido
           para quem depende do leitor. */
        accessibilityLiveRegion="polite"
      >
        <View style={styles.selo}>
          <Ionicons name="chatbubble-ellipses" size={14} color={paleta().cores.verde} />
        </View>
        <View style={styles.textos}>
          {/* Sem `numberOfLines`: o tempo lá em cima já é calculado pelo tamanho
              do texto, então recado longo ganha tempo em vez de perder
              palavras. */}
          <Text style={styles.fala}>{recado.texto}</Text>
          <Text style={styles.assinatura}>
            {primeiroNomeDela(recado.nome)}, sua nutricionista
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    /* Flutua SOBRE a tela, e não dentro da rolagem. Dentro, o desaparecimento
       faria todo o conteúdo saltar para cima no meio da leitura — que é
       exatamente o susto que um aviso não pode dar. */
    moldura: {
      position: 'absolute',
      left: 12,
      right: 12,
      zIndex: 20,
    },
    aviso: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 13,
      borderRadius: RAIO_CARTAO,
      /* Opaco de propósito: ele passa por cima de texto, e um fundo translúcido
         deixaria as duas camadas se lendo ao mesmo tempo. */
      backgroundColor: t.cores.cartao,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.cores.verdeClaro,
      /* A sombra é o que diz "isto está por cima". Sem ela o aviso se lê como
         mais um cartão da tela, e aí sumir vira defeito. */
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOpacity: 0.16,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
        },
        android: { elevation: 6 },
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
    textos: { flex: 1, gap: 3 },
    fala: { fontSize: 14, lineHeight: 20, color: t.cores.ink },
    /* Miúda: diz de quem é, sem disputar com o que foi dito. */
    assinatura: { fontSize: 11.5, fontWeight: '700', color: t.inkSuave },
  }),
)
