import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { createAudioPlayer, useAudioRecorder, useAudioRecorderState } from 'expo-audio'
import {
  LIMITE_SEGUNDOS,
  OPCOES_DITADO,
  prepararMicrofone,
  relogio,
  transcrever,
} from '../lib/voz'
import { estilosDe, paleta } from '../lib/tema'

/* O botão de falar em vez de digitar.
 *
 * Vive DENTRO da tela de escrever, e não numa tela própria, de propósito: o que
 * a pessoa dita vira texto no mesmo campo, e a conferência item por item que já
 * existe ali passa a valer também para a fala. Uma tela separada teria de
 * repetir aquela conferência inteira — ou, pior, não repetir, e virar o único
 * caminho do app que grava sem mostrar antes.
 *
 * ── Três estados, e cada um diz uma coisa diferente ────────────────────────
 * Parado, a tela convida. Gravando, ela mostra o cronômetro, porque quem fala
 * para um aparelho não tem como saber se ele está ouvindo. Enviando, ela avisa
 * que está pensando — a transcrição leva alguns segundos, e sem aviso a pessoa
 * aperta de novo e grava por cima. */

type Estado = 'parado' | 'gravando' | 'enviando'

export function Ditado({
  onTexto,
  onErro,
}: {
  /* O que foi ouvido. A tela decide onde colocar — aqui não se sabe se o campo
     já tem coisa escrita. */
  onTexto: (texto: string) => void
  onErro: (mensagem: string) => void
}) {
  const styles = estilos()
  const gravador = useAudioRecorder(OPCOES_DITADO)
  const estadoDoGravador = useAudioRecorderState(gravador, 250)
  const [estado, setEstado] = useState<Estado>('parado')
  /* A última gravação que não virou texto.
   *
   * Quando o servidor não ouve nada, sobram duas explicações opostas — o
   * microfone gravou silêncio, ou o detector de voz descartou o que veio — e a
   * pessoa não tem como saber qual. Ouvir resolve em três segundos: se a voz
   * está lá, o problema não é dela.
   *
   * É diagnóstico, mas é também o que qualquer um faria com um gravador que
   * "não ouviu": apertar o play. */
  const [gravacaoMuda, setGravacaoMuda] = useState<string | null>(null)

  /* O `estado` de dentro do efeito de limpeza seria o da primeira renderização,
     e a limpeza só roda no fim. Sem a referência, sair da tela gravando deixaria
     o microfone aberto. */
  const gravandoAgora = useRef(false)
  gravandoAgora.current = estado === 'gravando'

  useEffect(
    () => () => {
      if (gravandoAgora.current) gravador.stop().catch(() => {})
    },
    [gravador],
  )

  const segundos = estadoDoGravador.durationMillis / 1000

  /* O nível de entrada, de 0 a 1.
   *
   * `metering` vem em dBFS: -160 é silêncio absoluto e 0 é o máximo antes de
   * distorcer. Fala normal a um palmo do aparelho fica entre -30 e -10. A
   * conversão corta em -60 porque abaixo disso é ruído de fundo, e esticar a
   * barra até -160 deixaria toda fala colada no topo. */
  const nivel = (() => {
    const db = estadoDoGravador.metering
    if (db === undefined || db === null) return 0
    return Math.max(0, Math.min(1, (db + 60) / 60))
  })()

  /* O pico da gravação inteira. Vai para o log ao parar: uma barra que a pessoa
     viu mexer e um número que eu leio dizem a mesma coisa, e o número sobrevive
     à conversa. */
  const pico = useRef(-160)
  if (estado === 'gravando' && (estadoDoGravador.metering ?? -160) > pico.current) {
    pico.current = estadoDoGravador.metering ?? -160
  }

  /* Para sozinho no limite. Sem isto, a tela esquecida aberta grava até a
     bateria acabar — e o arquivo cresceria além do que o servidor aceita. */
  useEffect(() => {
    if (estado === 'gravando' && segundos >= LIMITE_SEGUNDOS) {
      void parar()
    }
    /* `parar` fica de fora das dependências de propósito: ela é recriada a
       cada renderização, e listá-la faria o efeito rodar sem parar. */
  }, [estado, segundos])

  async function comecar() {
    const permissao = await prepararMicrofone()
    if (permissao.tipo === 'negada') {
      onErro(permissao.mensagem)
      return
    }

    setGravacaoMuda(null)
    pico.current = -160

    try {
      await gravador.prepareToRecordAsync()
      gravador.record()
      setEstado('gravando')
    } catch {
      onErro('Não consegui abrir o microfone agora.')
    }
  }

  async function parar() {
    /* Marca antes de esperar: o `stop` demora o suficiente para caber um
       segundo toque, e dois `stop` seguidos derrubam o gravador. */
    setEstado('enviando')

    console.log('[cygnos] ditado: pico de entrada', pico.current.toFixed(1), 'dBFS')

    /* O tempo tem de ser lido ANTES do stop — depois dele o estado zera, e a
       gravação de dez segundos seria descartada como curta demais. */
    const duracao = segundos

    try {
      await gravador.stop()
    } catch {
      setEstado('parado')
      onErro('Não consegui encerrar a gravação.')
      return
    }

    const uri = gravador.uri
    if (!uri) {
      setEstado('parado')
      onErro('A gravação não chegou a ser salva. Tente de novo.')
      return
    }

    const r = await transcrever(uri, duracao)
    setEstado('parado')

    if (r.tipo === 'ok') {
      onTexto(r.texto)
      return
    }
    if (r.tipo === 'curto_demais') {
      onErro('Foi rápido demais. Segure o botão e fale o que você comeu.')
      return
    }
    if (r.tipo === 'nada_ouvido') {
      setGravacaoMuda(uri)
      onErro('Não ouvi nada. Toque em "ouvir a gravação" para conferir se a sua voz foi captada.')
      return
    }
    onErro(r.mensagem)
  }

  if (estado === 'enviando') {
    return (
      <View style={[styles.botao, styles.pensando]}>
        <ActivityIndicator size="small" color={paleta().cores.verde} />
        <Text style={styles.textoPensando}>Entendendo o que você falou…</Text>
      </View>
    )
  }

  if (estado === 'gravando') {
    return (
      <Pressable
        onPress={parar}
        style={({ pressed }) => [styles.botao, styles.gravando, pressed && styles.pressionado]}
        accessibilityRole="button"
        accessibilityLabel="Parar de gravar"
      >
        <View style={styles.ponto} />
        <Text style={styles.textoGravando}>Ouvindo… {relogio(segundos)}</Text>
        {/* A barra é a prova de que o microfone está captando. Parada com a
            pessoa falando significa que o áudio não está entrando — e é melhor
            descobrir isso agora que depois de trinta segundos de fala. */}
        <View style={styles.trilhoNivel}>
          <View style={[styles.nivel, { width: `${Math.round(nivel * 100)}%` }]} />
        </View>
      </Pressable>
    )
  }

  return (
    <>
      <Pressable
        onPress={comecar}
        style={({ pressed }) => [styles.botao, pressed && styles.pressionado]}
        accessibilityRole="button"
        accessibilityLabel="Falar o que você comeu"
      >
        <Ionicons name="mic-outline" size={18} color={paleta().cores.verde} />
        <Text style={styles.texto}>Falar em vez de digitar</Text>
      </Pressable>

      {gravacaoMuda && (
        <Pressable
          onPress={() => {
            /* Toca e se descarta. Um player por gravação, sem estado guardado:
               isto existe para conferir uma vez, não para virar tocador. */
            const p = createAudioPlayer({ uri: gravacaoMuda })
            p.play()
          }}
          style={({ pressed }) => [styles.botaoOuvir, pressed && styles.pressionado]}
          accessibilityRole="button"
          accessibilityLabel="Ouvir a gravação"
        >
          <Ionicons name="play-circle-outline" size={17} color={paleta().inkMedio} />
          <Text style={styles.textoOuvir}>Ouvir a gravação</Text>
        </Pressable>
      )}
    </>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
  botao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.borda,
    backgroundColor: t.cores.cartao,
  },
  pressionado: { opacity: 0.7 },
  texto: { fontSize: 15, fontWeight: '700', color: t.cores.verde },

  botaoOuvir: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 40,
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  textoOuvir: { fontSize: 13.5, fontWeight: '600', color: t.inkMedio },

  trilhoNivel: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: t.cores.trilho,
    overflow: 'hidden',
  },
  nivel: { height: 6, borderRadius: 3, backgroundColor: t.cores.limao },

  gravando: { borderColor: t.cores.verde, backgroundColor: t.cores.verdeMenta },
  ponto: { width: 9, height: 9, borderRadius: 5, backgroundColor: t.cores.erroTexto },
  textoGravando: { fontSize: 15, fontWeight: '800', color: t.cores.ink },
  toqueParaParar: { fontSize: 12, color: t.inkMedio },

  pensando: { borderColor: t.cores.borda },
  textoPensando: { fontSize: 14, fontWeight: '600', color: t.inkSuave },
  }),
)
