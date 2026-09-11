import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useAudioRecorder, useAudioRecorderState } from 'expo-audio'
import { LIMITE_DO_RECADO, MINIMO_DO_RECADO } from '../lib/audioDaConversa'
import { falha } from '../lib/erros'
import { FONTE } from '../lib/fontes'
import { estilosDe, paleta } from '../lib/tema'
import { OPCOES_DITADO, mmss, prepararMicrofone } from '../lib/voz'

/* A gravação de um áudio para a paciente, no lugar da barra de escrever.
 *
 * ── Um componente só para isto, e não estado na tela da conversa ──────────
 * `useAudioRecorderState` PESQUISA o gravador e devolve estado novo a cada
 * volta: re-renderiza quem o chama. Na tela do paciente ele morava na tela da
 * conversa, e o cronômetro fazia as fotos dos balões recarregarem cinco vezes
 * por segundo -- "a tela de mensagem fica dando umas piscadas". Aqui ele mora
 * num componente que só existe ENQUANTO grava: a pulsação re-renderiza este
 * pedaço da barra, e a conversa em cima nem fica sabendo.
 *
 * ── Nasce gravando ────────────────────────────────────────────────────────
 * Ela escolheu "Gravar áudio" no menu; montar este componente É começar. Sair
 * (cancelar, voltar do aparelho, fechar a conversa) desmonta e SOLTA o
 * microfone -- o ponto vermelho do sistema aceso depois de sair se lê, com
 * razão, como um app que continua ouvindo.
 *
 * Mesmo gravador (`OPCOES_DITADO`) e mesmos limites do paciente: um segundo
 * preset daria dois formatos no mesmo balde, e é o formato que decide se o
 * outro lado consegue tocar. */
export function GravadorDoRecado({
  onPronto,
  onCancelar,
  onErro,
}: {
  onPronto: (uri: string, segundos: number) => void
  onCancelar: () => void
  onErro: (mensagem: string) => void
}) {
  const styles = estilos()
  const gravador = useAudioRecorder(OPCOES_DITADO)
  const estado = useAudioRecorderState(gravador, 200)
  const gravando = useRef(false)
  const [comecou, setComecou] = useState(false)
  const segundos = Math.floor((estado.durationMillis ?? 0) / 1000)

  /* As funções do pai num ref: o efeito de começar roda UMA vez, e ler as
     da primeira renderização chamaria versões velhas delas. */
  const avisos = useRef({ onPronto, onCancelar, onErro })
  avisos.current = { onPronto, onCancelar, onErro }

  useEffect(() => {
    let vivo = true
    void (async () => {
      const permissao = await prepararMicrofone()
      if (!vivo) return
      if (permissao.tipo !== 'ok') {
        avisos.current.onErro(permissao.mensagem)
        return
      }
      try {
        await gravador.prepareToRecordAsync()
        if (!vivo) return
        gravador.record()
        gravando.current = true
        setComecou(true)
      } catch (e) {
        if (vivo) avisos.current.onErro(falha('Não consegui abrir o microfone agora.', e))
      }
    })()
    return () => {
      vivo = false
      if (gravando.current) {
        gravando.current = false
        /* O gancho do expo-audio solta o gravador na mesma desmontagem, e
           parar um gravador já solto pode estourar na hora -- sem promessa
           para o `catch` pegar. */
        try {
          gravador.stop().catch(() => {})
        } catch {
          /* já solto: nada a parar */
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function parar() {
    if (!gravando.current) return
    gravando.current = false
    const duracao = segundos
    try {
      await gravador.stop()
    } catch (e) {
      avisos.current.onErro(falha('A gravação não foi concluída.', e))
      return
    }
    const uri = gravador.uri
    /* Toque sem querer não vira mensagem: abaixo de um segundo é o dedo
       escorregando, e a paciente receberia meio segundo de silêncio. */
    if (!uri || duracao < MINIMO_DO_RECADO) {
      avisos.current.onErro('Gravação muito curta. Fale por pelo menos um segundo.')
      return
    }
    avisos.current.onPronto(uri, duracao)
  }

  /* No limite, para sozinho e vira anexo -- o que ela disse até ali não se
     perde. Um minuto: áudio longo não é ouvido entre uma coisa e outra. */
  useEffect(() => {
    if (comecou && segundos >= LIMITE_DO_RECADO) void parar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comecou, segundos])

  return (
    <View style={styles.linha}>
      <Pressable
        onPress={onCancelar}
        hitSlop={8}
        style={({ pressed }) => [styles.lateral, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel="Descartar a gravação"
      >
        <Ionicons name="trash-outline" size={20} color={paleta().inkSuave} />
      </Pressable>

      <View style={styles.meio} accessibilityLiveRegion="polite">
        {comecou ? (
          <>
            <View style={styles.ponto} />
            <Text style={styles.tempo}>
              {mmss(segundos)}
              <Text style={styles.limite}> / {mmss(LIMITE_DO_RECADO)}</Text>
            </Text>
            <Text style={styles.gravando}>Gravando</Text>
          </>
        ) : (
          <>
            <ActivityIndicator size="small" color={paleta().cores.verde} />
            <Text style={styles.gravando}>Abrindo o microfone…</Text>
          </>
        )}
      </View>

      <Pressable
        onPress={() => void parar()}
        disabled={!comecou}
        style={({ pressed }) => [styles.parar, !comecou && { opacity: 0.4 }, pressed && { opacity: 0.8 }]}
        accessibilityRole="button"
        accessibilityLabel="Parar e anexar o áudio"
      >
        <Ionicons name="checkmark" size={20} color={paleta().cores.branco} />
      </Pressable>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    linha: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    lateral: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    meio: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderRadius: 22,
      paddingHorizontal: 14,
      minHeight: 44,
    },
    ponto: { width: 9, height: 9, borderRadius: 5, backgroundColor: t.cores.erroTexto },
    tempo: { fontFamily: FONTE.meia, fontSize: 15, color: t.cores.ink, fontVariant: ['tabular-nums'] },
    limite: { fontFamily: FONTE.normal, fontSize: 13, color: t.inkFraco },
    gravando: { flex: 1, textAlign: 'right', fontFamily: FONTE.normal, fontSize: 12.5, color: t.inkFraco },
    parar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.cores.verde,
    },
  }),
)
