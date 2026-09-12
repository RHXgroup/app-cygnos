import { useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { prepararFoto } from '../lib/fotoDoDiario'
import { FONTE } from '../lib/fontes'
import { estilosDe, paleta } from '../lib/tema'

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
 * reduz primeiro, texto depois, pelos motivos que estão escritos lá. */
export function CameraDoApp({
  onPronta,
  onFechar,
  onErro,
}: {
  onPronta: (foto: { uri: string; base64: string }) => void
  onFechar: () => void
  onErro: (mensagem: string) => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const [permissao, pedirPermissao] = useCameraPermissions()
  const [lado, setLado] = useState<CameraType>('back')
  const [tirando, setTirando] = useState(false)
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

  if (!permissao.granted) {
    return (
      <View style={[styles.tela, styles.centro, { paddingTop: top, paddingBottom: bottom }]}>
        <Ionicons name="camera-outline" size={28} color={paleta().cores.branco} />
        <Text style={styles.aviso}>
          Para tirar a foto aqui dentro, o Cygnos precisa da câmera.
        </Text>
        <Pressable
          onPress={() => void pedirPermissao()}
          style={({ pressed }) => [styles.botaoClaro, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          <Text style={styles.textoDoBotaoClaro}>Permitir a câmera</Text>
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

  return (
    <View style={styles.tela}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing={lado} />

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
          onPress={() => void tirar()}
          disabled={tirando}
          style={({ pressed }) => [styles.disparo, pressed && { opacity: 0.8 }]}
          accessibilityRole="button"
          accessibilityLabel="Tirar a foto"
        >
          {tirando ? (
            <ActivityIndicator color={paleta().cores.sobreLimao} />
          ) : (
            <View style={styles.miolo} />
          )}
        </Pressable>

        <Pressable
          onPress={() => setLado(l => (l === 'back' ? 'front' : 'back'))}
          hitSlop={10}
          style={styles.lateral}
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
  }),
)
