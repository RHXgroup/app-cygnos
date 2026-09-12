import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import {
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
  type CameraType,
} from 'expo-camera'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { falha } from '../lib/erros'
import { prepararFoto } from '../lib/fotoDoDiario'
import { FONTE } from '../lib/fontes'
import { estilosDe, paleta } from '../lib/tema'
import { mmss } from '../lib/voz'

/* A câmera DENTRO do app.
 *
 * ──────────────────── O defeito que ela existe para matar ────────────────────
 * Relatado no aparelho dele, tirando foto para mandar à paciente: "ao tirar foto
 * no app de mensagem o app reconecta". E antes disso, no app do paciente, o
 * mesmo sintoma em três lugares diferentes.
 *
 * A causa não é do app: `ImagePicker.launchCameraAsync` abre a câmera DO
 * SISTEMA, que é outro aplicativo. Enquanto ela está na frente, o Android
 * precisa de memória e mata o que ficou atrás -- e o que ficou atrás é o
 * Cygnos. Ele volta do zero: no Expo é "reconectou", numa build é "o app
 * fechou sozinho". Reduzir a foto ajudou e não resolveu, porque o problema é
 * SAIR do app, e não o tamanho do que volta.
 *
 * Aqui o app nunca sai de primeiro plano. Não há processo para o sistema matar.
 *
 * ──────────────────── E o que ela NÃO faz ────────────────────
 * Galeria continua sendo o seletor do sistema: escolher arquivo é uma tela que
 * a Google faz melhor do que qualquer uma que eu escrevesse, e ali o app também
 * fica atrás -- mas o seletor de imagens é leve, e o relato nunca foi sobre ele.
 *
 * Depois da captura, o caminho é o MESMO da foto escolhida (`prepararFoto`):
 * reduz primeiro, texto depois, pelos motivos que estão escritos lá.
 *
 * ──────────────────── E desde 12/09 ela também grava vídeo ────────────────────
 * "Esse vídeo tem trinta e quatro mega, o limite é vinte e cinco. Mas esse vídeo
 * tem oito segundos."
 *
 * Oito segundos com 34 MB é a câmera do celular gravando em 4K, que é o padrão
 * dela -- e um arquivo desses não serve para a conversa nem depois de subir: quem
 * vai assistir é a paciente, no 4G. Gravar AQUI resolve isso na origem, porque
 * aqui a qualidade é escolhida: 720p com 2 Mbit/s dá uns 15 MB por minuto.
 *
 * `maxFileSize` é a trava que não depende de estimativa: 24 MB, um pouco abaixo
 * do teto do balde, e a gravação para sozinha ao chegar lá. O minuto é teto de
 * tempo; o byte é teto de verdade. */
/* 720p, e não 1080p: a conversa é vista num telefone, e o dobro de bytes não
   aparece na tela. 2 Mbit/s é o que dá imagem limpa nessa altura. */
const QUALIDADE = '720p' as const
const BITS_POR_SEGUNDO = 2_000_000
const TETO_DE_SEGUNDOS = 60
/* 24 MB: o balde aceita 25, e a margem existe porque o encerramento do arquivo
   escreve mais alguns quilobytes depois do último quadro. */
const TETO_DE_BYTES = 24 * 1024 * 1024

export function CameraDoApp({
  onPronta,
  onVideoPronto,
  onFechar,
  onErro,
  modo = 'foto',
}: {
  onPronta: (foto: { uri: string; base64: string }) => void
  /* O vídeo sai como CAMINHO no aparelho: quem sobe é quem mandou abrir a
     câmera, no envio -- igual à foto. */
  onVideoPronto?: (uri: string) => void
  onFechar: () => void
  onErro: (mensagem: string) => void
  modo?: 'foto' | 'video'
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const [permissao, pedirPermissao] = useCameraPermissions()
  /* O microfone só é pedido no modo vídeo -- pedir para tirar foto assustaria
     quem só quer fotografar, e o Android pergunta uma vez por permissão. */
  const [microfone, pedirMicrofone] = useMicrophonePermissions()
  const [lado, setLado] = useState<CameraType>('back')
  const [tirando, setTirando] = useState(false)
  const [gravando, setGravando] = useState(false)
  /* Os segundos na tela. Sem relógio, ninguém sabe se está gravando -- e foi o
     que ele pediu no gravador de áudio: "começa a carregar os minutinhos". */
  const [segundos, setSegundos] = useState(0)
  const gravandoAgora = useRef(false)

  const video = modo === 'video'

  useEffect(() => {
    if (!gravando) return
    setSegundos(0)
    const id = setInterval(() => setSegundos(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [gravando])

  /* Sair da tela no meio da gravação: sem isto a câmera continua gravando um
     arquivo que ninguém vai receber. Lista vazia de propósito, e o `ref` é o que
     lê o estado de agora -- ver a armadilha 1 e o `<Ditado>`. */
  useEffect(
    () => () => {
      if (gravandoAgora.current) camera.current?.stopRecording()
    },
    [],
  )
  const camera = useRef<CameraView>(null)
  /* A trava do toque duplo: `tirando` só vale na renderização seguinte, e dois
     toques no botão redondo abririam duas capturas ao mesmo tempo -- que é
     exatamente o momento de memória apertada que esta tela existe para evitar. */
  const tirandoAgora = useRef(false)

  if (!permissao) {
    return (
      <View style={[styles.tela, styles.centro]}>
        <ActivityIndicator color={paleta().cores.verde} />
      </View>
    )
  }

  /* No vídeo, falta o microfone e a pessoa manda um filme MUDO sem descobrir
     por quê. Então as duas permissões guardam a mesma porta. */
  if (!permissao.granted || (video && microfone && !microfone.granted)) {
    return (
      <View style={[styles.tela, styles.centro, { paddingTop: top, paddingBottom: bottom }]}>
        <Ionicons name={video ? 'videocam-outline' : 'camera-outline'} size={28} color={paleta().cores.branco} />
        <Text style={styles.aviso}>
          {video
            ? 'Para gravar aqui dentro, o Cygnos precisa da câmera e do microfone.'
            : 'Para tirar a foto aqui dentro, o Cygnos precisa da câmera.'}
        </Text>
        <Pressable
          onPress={() => {
            void pedirPermissao()
            if (video) void pedirMicrofone()
          }}
          style={({ pressed }) => [styles.botaoClaro, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          <Text style={styles.textoDoBotaoClaro}>
            {video ? 'Permitir câmera e microfone' : 'Permitir a câmera'}
          </Text>
        </Pressable>
        <Pressable onPress={onFechar} hitSlop={10} accessibilityRole="button">
          <Text style={styles.sair}>Agora não</Text>
        </Pressable>
      </View>
    )
  }

  async function tirar() {
    if (tirandoAgora.current) return
    tirandoAgora.current = true
    setTirando(true)
    try {
      /* `quality: 0.7` e SEM base64: o texto vem no segundo passo, com o bitmap
         da câmera já liberado. Mesmo motivo de `prepararFoto`. */
      const foto = await camera.current?.takePictureAsync({ quality: 0.7 })
      if (!foto?.uri) {
        onErro('Não consegui tirar a foto. Tente de novo.')
        return
      }
      const pronta = await prepararFoto(foto.uri)
      if (pronta.tipo !== 'ok') {
        onErro(pronta.tipo === 'erro' ? pronta.mensagem : 'Não consegui preparar a foto.')
        return
      }
      onPronta({ uri: pronta.uri, base64: pronta.base64 })
    } catch {
      onErro('Não consegui tirar a foto. Tente de novo.')
    } finally {
      tirandoAgora.current = false
      setTirando(false)
    }
  }

  async function gravar() {
    if (gravandoAgora.current) return
    /* O microfone é pedido no primeiro toque, e não na abertura: a tela já
       aparece com a imagem, e a caixa do Android chega na hora em que ela
       resolveu gravar. */
    if (microfone && !microfone.granted) {
      const r = await pedirMicrofone()
      if (!r.granted) {
        onErro('Sem o microfone o vídeo sai sem som. Libere nas configurações do celular.')
        return
      }
    }

    gravandoAgora.current = true
    setGravando(true)
    try {
      /* A promessa só volta quando `stopRecording` é chamado OU um dos tetos
         chega. É por isso que parar é outro caminho, e não um `await` aqui. */
      const feito = await camera.current?.recordAsync({
        maxDuration: TETO_DE_SEGUNDOS,
        maxFileSize: TETO_DE_BYTES,
      })
      if (!feito?.uri) {
        onErro('Não consegui gravar o vídeo. Tente de novo.')
        return
      }
      onVideoPronto?.(feito.uri)
    } catch (e) {
      /* O texto cru vai para o console: a frase da tela não distingue "sem
         espaço no aparelho" de "a câmera recusou o formato", e a diferença é
         toda a investigação. Item 12. */
      onErro(falha('Não consegui gravar o vídeo. Tente de novo.', e))
    } finally {
      gravandoAgora.current = false
      setGravando(false)
    }
  }

  function parar() {
    if (!gravandoAgora.current) return
    camera.current?.stopRecording()
  }

  return (
    <View style={styles.tela}>
      <CameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        facing={lado}
        mode={video ? 'video' : 'picture'}
        videoQuality={QUALIDADE}
        videoBitrate={BITS_POR_SEGUNDO}
      />

      {/* O relógio, e o ponto vermelho que diz que está gravando. */}
      {gravando && (
        <View style={[styles.relogio, { top: top + 12 }]}>
          <View style={styles.pontoVermelho} />
          <Text style={styles.textoDoRelogio}>{mmss(segundos)}</Text>
          <Text style={styles.tetoDoRelogio}>de 1:00</Text>
        </View>
      )}

      <Pressable
        onPress={onFechar}
        hitSlop={10}
        style={[styles.fechar, { top: top + 10 }]}
        accessibilityRole="button"
        accessibilityLabel="Fechar a câmera"
      >
        <Ionicons name="close" size={26} color={paleta().cores.branco} />
      </Pressable>

      <View style={[styles.barra, { paddingBottom: bottom + 22 }]}>
        <View style={styles.lateral} />

        <Pressable
          onPress={() => (video ? (gravando ? parar() : void gravar()) : void tirar())}
          disabled={tirando}
          style={({ pressed }) => [styles.disparo, pressed && { opacity: 0.8 }]}
          accessibilityRole="button"
          accessibilityLabel={
            video ? (gravando ? 'Parar a gravação' : 'Começar a gravar') : 'Tirar a foto'
          }
        >
          {tirando ? (
            <ActivityIndicator color={paleta().cores.sobreLimao} />
          ) : (
            /* Gravando, o miolo redondo vira um quadrado vermelho -- é o
               desenho universal de "para aqui", e não precisa de legenda. */
            <View style={[styles.miolo, gravando && styles.mioloGravando]} />
          )}
        </Pressable>

        <Pressable
          /* Trocar de lado no meio da gravação interrompe o arquivo em alguns
             aparelhos -- e o que volta é um vídeo cortado sem aviso. */
          onPress={() => !gravando && setLado(l => (l === 'back' ? 'front' : 'back'))}
          hitSlop={10}
          style={[styles.lateral, gravando && { opacity: 0.35 }]}
          accessibilityRole="button"
          accessibilityLabel="Virar a câmera"
        >
          <Ionicons name="camera-reverse-outline" size={26} color={paleta().cores.branco} />
        </Pressable>
      </View>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    /* Preto, e não o fundo do tema: é o que a câmera mostra em volta da
       imagem, e qualquer cor ali muda a leitura da cor da comida. */
    tela: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000000' },
    centro: { alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 28 },
    aviso: {
      fontFamily: FONTE.normal,
      fontSize: 14.5,
      color: t.cores.branco,
      textAlign: 'center',
      lineHeight: 20,
    },
    botaoClaro: {
      backgroundColor: t.cores.limao,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 22,
    },
    textoDoBotaoClaro: { fontFamily: FONTE.forte, fontSize: 14.5, color: t.cores.sobreLimao },
    sair: { fontFamily: FONTE.normal, fontSize: 13.5, color: t.cores.branco, opacity: 0.8 },

    fechar: { position: 'absolute', left: 14, zIndex: 2 },
    barra: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 28,
      paddingTop: 16,
    },
    lateral: { width: 44, alignItems: 'center' },
    disparo: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.28)',
      borderWidth: 3,
      borderColor: '#FFFFFF',
    },
    miolo: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFFFF' },
    mioloGravando: { width: 30, height: 30, borderRadius: 6, backgroundColor: '#E5484D' },

    relogio: {
      position: 'absolute',
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderRadius: 999,
      paddingHorizontal: 13,
      paddingVertical: 7,
    },
    pontoVermelho: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#E5484D' },
    textoDoRelogio: {
      fontFamily: FONTE.meia,
      fontSize: 14,
      color: t.cores.branco,
      fontVariant: ['tabular-nums'],
    },
    tetoDoRelogio: { fontFamily: FONTE.normal, fontSize: 12, color: t.cores.branco, opacity: 0.7 },
  }),
)
