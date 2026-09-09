import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  PERGUNTAS_DE_EXEMPLO,
  novaFala,
  perguntarAAurora,
  type Fala,
} from '../lib/auroraDaNutri'
import { useDesvioDoTeclado } from '../lib/teclado'
import { estilosDe, paleta } from '../lib/tema'

/* A Aurora dela, no bolso. Passo 02 da análise: ela PERGUNTA, e mais nada.
 *
 * ──────────────────── Por que uma tela de conversa, e não mais cartões no painel ────────────────────
 * Porque é a Aurora que permite a lista de telas ser curta. Não há tela de
 * financeiro no app e mesmo assim ela consegue saber quanto entrou hoje. Cada
 * cartão a mais no painel é uma tela que alguém precisa desenhar, manter e
 * traduzir para celular; uma pergunta não é.
 *
 * ──────────────────── E por que ela ainda não FAZ nada ────────────────────
 * Porque o cartão de confirmação vem antes de qualquer ação -- e o comando de
 * voz do treino já concluiu um treino sozinho duas vezes, sem ninguém falar
 * nada. Ali o custo foi um treino errado. Aqui seria uma paciente aparecendo no
 * consultório num dia em que ninguém a esperava.
 *
 * ──────────────────── O teclado ────────────────────
 * Armadilha 2: a barra de escrever fica FORA da tela sem tratamento, porque no
 * Expo Go a janela não encolhe. O desvio é teclado + área segura, que SOMAM, e
 * a altura vem do `onLayout` -- não de `useWindowDimensions`, que não encolhe
 * junto e faria a conta somar duas vezes num build de verdade. */

export function AuroraDaNutriScreen({ onFechar }: { onFechar: () => void }) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()

  const [falas, setFalas] = useState<Fala[]>([])
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)

  const [alturaDaTela, setAlturaDaTela] = useState(0)
  const respiro = useDesvioDoTeclado(bottom, alturaDaTela || undefined)

  const rolagem = useRef<ScrollView>(null)

  /* Rola quando CHEGA fala, e não quando o conteúdo muda de tamanho.
     `onContentSizeChange` dispara também no crescimento provocado pela própria
     rolagem, e aí isso vira um laço que nunca converge -- foi o que prendeu a
     conversa do paciente no meio da lista por dias. Responder ao EVENTO
     resolve, porque o evento acontece uma vez. */
  useEffect(() => {
    if (falas.length === 0) return
    const id = setTimeout(() => rolagem.current?.scrollToEnd({ animated: true }), 80)
    return () => clearTimeout(id)
  }, [falas.length, pensando])

  /* Sem lista de dependências: o App tem um tratador central, e o React roda os
     efeitos do filho antes dos do pai -- com lista, o pai registraria por
     último e ganharia. Armadilha 1. */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onFechar()
      return true
    })
    return () => sub.remove()
  })

  async function mandar(pergunta: string) {
    const limpa = pergunta.trim()
    if (!limpa || pensando) return

    /* A pergunta entra na lista ANTES da resposta, e o campo esvazia junto: sem
       isso ela fica olhando o próprio texto parado no campo sem saber se foi. */
    const minha = novaFala('nutri', limpa)
    const anteriores = falas
    setFalas(atual => [...atual, minha])
    setTexto('')
    setPensando(true)

    const r = await perguntarAAurora(limpa, anteriores)
    setPensando(false)

    /* A falha vira uma fala da Aurora, e não uma faixa de erro no alto.
       Numa conversa, erro fora do fluxo se perde: ela rola para ler a resposta
       e a explicação ficou lá em cima, fora da tela. */
    setFalas(atual => [
      ...atual,
      novaFala('aurora', r.tipo === 'ok' ? r.texto : r.mensagem),
    ])
  }

  const vazia = falas.length === 0

  return (
    <View
      style={[styles.tela, { paddingTop: top + 8 }]}
      onLayout={e => setAlturaDaTela(e.nativeEvent.layout.height)}
    >
      <View style={styles.cabecalho}>
        <Pressable
          onPress={onFechar}
          style={styles.botaoVoltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela}>Aurora</Text>
        <View style={styles.botaoVoltar} />
      </View>

      <ScrollView
        ref={rolagem}
        contentContainerStyle={styles.conversa}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {vazia && (
          <View style={styles.abertura}>
            <Text style={styles.tituloAbertura}>O que você quer saber?</Text>
            {/* Dito por escrito, e antes da primeira pergunta. Sem isto a
                primeira coisa que se pede é justamente o que ela não faz --
                "remarca a Maria" --, e uma recusa de saída ensina em dez
                segundos que a Aurora não serve para nada. */}
            <Text style={styles.textoAbertura}>
              Por enquanto eu só respondo sobre a sua agenda, o dinheiro do dia e
              quem está pedindo atenção. Agendar, remarcar e lançar continuam no
              sistema, no computador.
            </Text>

            <View style={styles.exemplos}>
              {PERGUNTAS_DE_EXEMPLO.map(p => (
                <Pressable
                  key={p}
                  onPress={() => void mandar(p)}
                  style={({ pressed }) => [styles.exemplo, pressed && styles.pressionado]}
                  accessibilityRole="button"
                >
                  <Text style={styles.textoExemplo}>{p}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {falas.map(f => (
          <View
            key={f.id}
            style={[styles.balao, f.papel === 'nutri' ? styles.balaoDela : styles.balaoDaAurora]}
          >
            <Text style={f.papel === 'nutri' ? styles.textoDela : styles.textoDaAurora}>
              {f.texto}
            </Text>
          </View>
        ))}

        {pensando && (
          <View style={[styles.balao, styles.balaoDaAurora, styles.pensando]}>
            <ActivityIndicator color={paleta().inkFraco} size="small" />
          </View>
        )}
      </ScrollView>

      <View style={[styles.barra, { paddingBottom: 10 + respiro }]}>
        <TextInput
          value={texto}
          onChangeText={setTexto}
          placeholder="Pergunte alguma coisa"
          placeholderTextColor={paleta().inkFraco}
          keyboardAppearance="dark"
          multiline
          maxLength={600}
          onSubmitEditing={() => void mandar(texto)}
          style={styles.campo}
          accessibilityLabel="Sua pergunta para a Aurora"
        />
        <Pressable
          onPress={() => void mandar(texto)}
          disabled={!texto.trim() || pensando}
          style={({ pressed }) => [
            styles.botaoMandar,
            (!texto.trim() || pensando) && styles.botaoDesligado,
            pressed && styles.pressionado,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Enviar a pergunta"
        >
          <Ionicons name="arrow-up" size={19} color={paleta().cores.branco} />
        </Pressable>
      </View>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.cores.fundo },

    cabecalho: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingBottom: 6,
    },
    botaoVoltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    tituloTela: { fontSize: 17, fontWeight: '800', color: t.cores.ink },

    conversa: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },

    abertura: { paddingTop: 24, gap: 10 },
    tituloAbertura: { fontSize: 20, fontWeight: '800', color: t.cores.ink, letterSpacing: -0.3 },
    textoAbertura: { fontSize: 13.5, color: t.inkSuave, lineHeight: 20 },
    exemplos: { gap: 8, marginTop: 8 },
    exemplo: {
      backgroundColor: t.cores.cartao,
      borderRadius: 14,
      paddingVertical: 13,
      paddingHorizontal: 15,
    },
    textoExemplo: { fontSize: 14, color: t.cores.ink },

    balao: { maxWidth: '86%', borderRadius: 16, paddingVertical: 11, paddingHorizontal: 14 },
    balaoDela: { alignSelf: 'flex-end', backgroundColor: t.cores.verde },
    balaoDaAurora: { alignSelf: 'flex-start', backgroundColor: t.cores.cartao },
    textoDela: { fontSize: 14.5, color: t.cores.branco, lineHeight: 21 },
    textoDaAurora: { fontSize: 14.5, color: t.cores.ink, lineHeight: 21 },
    pensando: { paddingVertical: 14, paddingHorizontal: 18 },

    barra: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      paddingHorizontal: 12,
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.cores.borda,
      backgroundColor: t.cores.fundo,
    },
    campo: {
      flex: 1,
      maxHeight: 120,
      backgroundColor: t.cores.cartao,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingTop: 11,
      paddingBottom: 11,
      fontSize: 14.5,
      color: t.cores.ink,
    },
    botaoMandar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.cores.verde,
    },
    botaoDesligado: { opacity: 0.4 },
    pressionado: { opacity: 0.75 },
  }),
)
