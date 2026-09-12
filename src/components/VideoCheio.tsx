import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useVideoPlayer, VideoView } from 'expo-video'
import { enderecoNoDiario } from '../lib/fotoDoDiario'
import { FONTE } from '../lib/fontes'
import { estilosDe, paleta } from '../lib/tema'

/* O vídeo da conversa, em tela cheia.
 *
 * ──────────────────── Por que tela cheia, e não dentro do balão ────────────────────
 * Um vídeo de 200 pontos no meio da conversa não se assiste: não dá para ver o
 * rótulo que a paciente está mostrando nem o prato que ela filmou, que é o
 * motivo de mandar vídeo. O balão avisa que chegou; assistir é aqui.
 *
 * E tem a razão que pesa mais: tocador dentro de lista carrega o vídeo de toda
 * mensagem que passa pela tela -- em dados móveis, isso é a franquia dela indo
 * embora sem ninguém pedir. Aqui só toca o que ela escolheu.
 *
 * ──────────────────── O endereço é assinado, e vence ────────────────────
 * O balde é privado: o endereço sai de `createSignedUrl` e vale uma hora
 * (armadilha 7). Assinado no primeiro toque, e não na lista -- assinar dez
 * vídeos que ninguém vai abrir é dez idas à rede por nada. */
export function VideoCheio({ caminho, onFechar }: { caminho: string; onFechar: () => void }) {
  const styles = estilos()
  const [endereco, setEndereco] = useState<string | null>(null)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    let vivo = true
    void enderecoNoDiario(caminho).then(u => {
      if (!vivo) return
      if (u) setEndereco(u)
      else setErro(true)
    })
    return () => {
      vivo = false
    }
  }, [caminho])

  /* O tocador é criado com o endereço nulo e ganha a fonte quando ela chega --
     `useVideoPlayer` não pode ser chamado condicionalmente, que é regra de
     gancho do React. */
  const tocador = useVideoPlayer(endereco, player => {
    player.loop = false
    /* Começa tocando: ela tocou no vídeo justamente para ver. Um segundo toque
       em "play" seria uma etapa que ninguém pediu. */
    player.play()
  })

  return (
    <View style={styles.tela}>
      {endereco ? (
        <VideoView
          player={tocador}
          style={styles.video}
          contentFit="contain"
          /* Os controles são os do sistema: parar, avançar, tela cheia e o
             volume, que é o que qualquer pessoa já sabe usar. */
          nativeControls
        />
      ) : (
        <View style={styles.centro}>
          {erro ? (
            <>
              <Ionicons name="videocam-off-outline" size={26} color="#FFFFFF" />
              <Text style={styles.aviso}>Não consegui abrir este vídeo.</Text>
            </>
          ) : (
            <>
              <ActivityIndicator color={paleta().cores.verde} />
              <Text style={styles.aviso}>Abrindo o vídeo…</Text>
            </>
          )}
        </View>
      )}

      <Pressable
        onPress={onFechar}
        hitSlop={12}
        style={styles.fechar}
        accessibilityRole="button"
        accessibilityLabel="Fechar o vídeo"
      >
        <Ionicons name="close" size={26} color="#FFFFFF" />
      </Pressable>
    </View>
  )
}

const estilos = estilosDe(() =>
  StyleSheet.create({
    tela: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: '#000000',
      alignItems: 'center',
      justifyContent: 'center',
    },
    video: { width: '100%', height: '100%' },
    centro: { alignItems: 'center', gap: 10 },
    aviso: { fontFamily: FONTE.normal, fontSize: 14, color: '#FFFFFF' },
    fechar: { position: 'absolute', top: 44, right: 14 },
  }),
)

/* O que o BALÃO mostra: um retângulo com o símbolo de tocar.
 *
 * Sem miniatura, de propósito: tirar o primeiro quadro de um vídeo exige baixar
 * o começo do arquivo de cada mensagem da conversa -- de novo, a franquia dela.
 * O retângulo diz "chegou um vídeo", e o toque abre. */
export function VideoNoBalao({ onAbrir, minha }: { onAbrir: () => void; minha: boolean }) {
  const styles = estilosDoBalao()
  return (
    <Pressable
      onPress={onAbrir}
      style={({ pressed }) => [styles.caixa, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={minha ? 'Ver o vídeo que você mandou' : 'Ver o vídeo que chegou'}
    >
      <View style={styles.bolha}>
        <Ionicons name="play" size={22} color="#FFFFFF" />
      </View>
      <Text style={styles.texto}>Vídeo · toque para ver</Text>
    </Pressable>
  )
}

const estilosDoBalao = estilosDe(t =>
  StyleSheet.create({
    caixa: {
      width: 200,
      height: 118,
      borderRadius: 10,
      backgroundColor: t.cores.trilho,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    bolha: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    texto: { fontFamily: FONTE.normal, fontSize: 12, color: t.inkSuave },
  }),
)
