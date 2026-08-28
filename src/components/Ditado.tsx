import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAudioRecorder, useAudioRecorderState } from 'expo-audio'
import {
  LIMITE_SEGUNDOS,
  OPCOES_DITADO,
  prepararMicrofone,
  relogio,
  transcrever,
} from '../lib/voz'
import { cores, inkMedio, inkSuave } from '../theme'

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
  const gravador = useAudioRecorder(OPCOES_DITADO)
  const estadoDoGravador = useAudioRecorderState(gravador, 250)
  const [estado, setEstado] = useState<Estado>('parado')

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
      onErro('Não ouvi nada. Fale mais perto do aparelho e tente de novo.')
      return
    }
    onErro(r.mensagem)
  }

  if (estado === 'enviando') {
    return (
      <View style={[styles.botao, styles.pensando]}>
        <ActivityIndicator size="small" color={cores.verde} />
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
        <Text style={styles.toqueParaParar}>toque para parar</Text>
      </Pressable>
    )
  }

  return (
    <Pressable
      onPress={comecar}
      style={({ pressed }) => [styles.botao, pressed && styles.pressionado]}
      accessibilityRole="button"
      accessibilityLabel="Falar o que você comeu"
    >
      <Ionicons name="mic-outline" size={18} color={cores.verde} />
      <Text style={styles.texto}>Falar em vez de digitar</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  botao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.cartao,
  },
  pressionado: { opacity: 0.7 },
  texto: { fontSize: 15, fontWeight: '700', color: cores.verde },

  gravando: { borderColor: cores.verde, backgroundColor: cores.verdeMenta },
  ponto: { width: 9, height: 9, borderRadius: 5, backgroundColor: cores.erroTexto },
  textoGravando: { fontSize: 15, fontWeight: '800', color: cores.ink },
  toqueParaParar: { fontSize: 12, color: inkMedio },

  pensando: { borderColor: cores.borda },
  textoPensando: { fontSize: 14, fontWeight: '600', color: inkSuave },
})
