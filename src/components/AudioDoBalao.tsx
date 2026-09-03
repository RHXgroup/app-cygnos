import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio'

import { enderecoNoDiario } from '../lib/fotoDoDiario'
import { estilosDe, paleta } from '../lib/tema'
import { mmss } from '../lib/voz'

/* O áudio da conversa, tocado dentro do balão.
 *
 * ── Por que um player e não um link ───────────────────────────────────────
 * Abrir o áudio fora do app tira a pessoa da conversa e a devolve sem contexto
 * — e num endereço assinado que vence em uma hora, o que sai do app às vezes
 * nem abre mais.
 *
 * ── O endereço é estado, e VENCE ──────────────────────────────────────────
 * O bucket é privado (item 7): `getPublicUrl` devolveria um endereço com cara
 * de válido que o servidor recusa, sem erro nenhum. Assinar é `async`, então o
 * endereço não pode ser calculado no meio do render.
 *
 * E ele vence em uma hora. Numa conversa que fica aberta isso é o caso comum,
 * não a exceção — por isso o endereço é pedido de novo quando o toque falha,
 * em vez de a linha virar um botão morto. Uma única vez, para não virar laço
 * quando o problema for outro.
 *
 * ── Um tocador por balão, criado só no primeiro toque ─────────────────────
 * `createAudioPlayer` segura recurso nativo. Criar um por mensagem ao montar a
 * lista abriria dezenas de tocadores para ouvir um — por isso ele nasce no
 * primeiro toque e é liberado no desmonte. */
export function AudioDoBalao({ caminho, minha }: { caminho: string; minha: boolean }) {
  const styles = estilos()
  const [tocando, setTocando] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [erro, setErro] = useState(false)

  const tocador = useRef<ReturnType<typeof createAudioPlayer> | null>(null)
  const jaReassinou = useRef(false)
  const vivo = useRef(true)

  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
      tocador.current?.remove()
      tocador.current = null
    }
  }, [caminho])

  /* O relógio anda por conta própria, e não pelo tocador.
   *
   * `expo-audio` neste SDK não entrega um evento de posição confiável em toda
   * plataforma, e o número aqui é informação de conforto — quanto já correu —,
   * não controle. Um segundo de imprecisão não muda nada para quem ouve; um
   * relógio parado, sim: parece que travou. */
  useEffect(() => {
    if (!tocando) return
    const id = setInterval(() => {
      setSegundos(s => s + 1)
      /* Acabou: volta ao começo em vez de ficar parado no fim, senão o segundo
         toque não toca nada e o botão parece morto. */
      if (tocador.current && !tocador.current.playing) {
        setTocando(false)
        setSegundos(0)
        tocador.current.seekTo(0)
      }
    }, 1000)
    return () => clearInterval(id)
  }, [tocando])

  async function alternar() {
    if (carregando) return

    if (tocando) {
      tocador.current?.pause()
      setTocando(false)
      return
    }

    /* Já criado: retoma sem pedir endereço de novo. */
    if (tocador.current) {
      tocador.current.play()
      setTocando(true)
      return
    }

    setCarregando(true)
    setErro(false)
    const url = await enderecoNoDiario(caminho)
    if (!vivo.current) return

    if (!url) {
      setCarregando(false)
      setErro(true)
      return
    }

    try {
      /* Toca com o telefone no silencioso, como qualquer mensagem de voz — e
         se misturando com o que já estiver tocando em vez de interromper. Quem
         está ouvindo música não perde o que estava ouvindo por abrir um recado
         de dez segundos. */
      await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' })

      const p = createAudioPlayer({ uri: url })
      tocador.current = p
      setSegundos(0)
      p.play()
      setTocando(true)

      /* O fim é detectado pelo RELÓGIO que já existe, e não por um ouvinte.
       *
       * `player.addListener` mudou de forma entre as versões do `expo-audio`, e
       * uma tela de conversa não deve quebrar por causa de uma assinatura de
       * evento. O intervalo de um segundo abaixo já roda enquanto toca: ele
       * pergunta se ainda está tocando, e é o suficiente para voltar ao começo
       * quando acaba. Um segundo de atraso aqui não muda nada para quem ouve. */
    } catch (e) {
      /* Endereço vencido é o motivo mais provável de falhar aqui, e ele tem
         conserto: pede outro e tenta uma vez. Sem esta reassinatura, um balão
         aberto desde antes do almoço nunca mais tocaria. */
      tocador.current?.remove()
      tocador.current = null
      if (!jaReassinou.current) {
        jaReassinou.current = true
        setCarregando(false)
        void alternar()
        return
      }
      console.log('[cygnos] áudio da conversa não tocou:', e)
      setErro(true)
    } finally {
      if (vivo.current) setCarregando(false)
    }
  }

  const cor = minha ? paleta().cores.branco : paleta().cores.verde

  /* Falhou de verdade: diz o que aconteceu em vez de deixar um botão que não
     responde. "Não consegui abrir" é frase de gente; o motivo técnico foi para
     o console (item 12). */
  if (erro) {
    return (
      <View style={styles.linha}>
        <Ionicons name="alert-circle-outline" size={17} color={minha ? cor : paleta().inkMedio} />
        <Text style={[styles.aviso, minha && styles.avisoMeu]}>
          Não consegui abrir este áudio. Puxe para atualizar.
        </Text>
      </View>
    )
  }

  return (
    <Pressable
      onPress={alternar}
      style={({ pressed }) => [styles.linha, pressed && { opacity: 0.65 }]}
      accessibilityRole="button"
      accessibilityLabel={
        tocando ? 'Pausar o áudio' : minha ? 'Tocar o áudio que você mandou' : 'Tocar o áudio dela'
      }
    >
      {carregando ? (
        <ActivityIndicator size="small" color={cor} />
      ) : (
        <Ionicons name={tocando ? 'pause' : 'play'} size={19} color={cor} />
      )}
      <Text style={[styles.rotulo, minha && styles.rotuloMeu]}>
        {tocando || segundos > 0 ? mmss(segundos) : 'Áudio'}
      </Text>
    </Pressable>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    linha: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 4,
      marginBottom: 2,
    },
    rotulo: { fontSize: 14, fontWeight: '600', color: t.cores.ink },
    rotuloMeu: { color: t.cores.branco },
    aviso: { flex: 1, fontSize: 13, fontStyle: 'italic', color: t.inkMedio },
    avisoMeu: { color: 'rgba(255,255,255,0.85)' },
  }),
)
