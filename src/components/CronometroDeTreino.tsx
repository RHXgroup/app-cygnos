import { useEffect, useRef, useState } from 'react'
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { estilosDe, paleta } from '../lib/tema'

/* O cronômetro do treino, e o do descanso entre as séries.
 *
 * ── De onde veio ───────────────────────────────────────────────────────────
 * É o que os aplicativos de treino que funcionam acertam — o Hevy é o exemplo:
 * sem inchaço, sem gamificação, você abre, registra a série e o descanso conta
 * sozinho. É também o que mantém a pessoa DENTRO do app durante o treino, em
 * vez de abrir o relógio do celular.
 *
 * E resolve um problema que já existia aqui: a tela pergunta "quanto tempo" e a
 * resposta era sempre chutada, porque ninguém cronometra o próprio treino. Com
 * o cronômetro, o tempo chega medido.
 *
 * ── Por que a conta é por HORÁRIO e não por contador ───────────────────────
 * Um `setInterval` que soma 1 a cada segundo para de somar quando o Android
 * congela o app em segundo plano — e a pessoa volta da tela de bloqueio com um
 * cronômetro que perdeu quatro minutos. Aqui o que se guarda é o INSTANTE em
 * que começou; o que a tela mostra é a diferença até agora, recalculada a cada
 * segundo. Ficar em segundo plano deixa de importar.
 *
 * ── O que ele NÃO faz ──────────────────────────────────────────────────────
 * Tocar som nem vibrar no fim do descanso. Isso exige agendamento que o Expo Go
 * não entrega no Android, e um aviso que às vezes chega é pior que nenhum: a
 * pessoa passa a confiar nele e perde a série. Quando o app virar build de
 * verdade, entra. */

const emTexto = (segundos: number) => {
  const s = Math.max(0, Math.floor(segundos))
  const m = Math.floor(s / 60)
  const resto = s % 60
  return `${m}:${String(resto).padStart(2, '0')}`
}

/* Os descansos que cobrem quase tudo. Números redondos porque ninguém descansa
   "1 minuto e 47" — e são os mesmos que a rotina montada pela IA sugere. */
const DESCANSOS = [30, 45, 60, 90, 120]

export function CronometroDeTreino({
  onTempo,
}: {
  /* Quantos minutos o treino durou, sempre que o número muda. A tela de treino
     usa para preencher a duração sem perguntar — que é o ponto: o tempo passa
     a ser medido em vez de lembrado. */
  onTempo: (minutos: number) => void
}) {
  const styles = estilos()

  /* O instante em que o treino começou. Null enquanto não começou. */
  const [inicio, setInicio] = useState<number | null>(null)
  /* Quanto já tinha corrido antes da última pausa. */
  const [acumulado, setAcumulado] = useState(0)
  const [agora, setAgora] = useState(() => Date.now())

  /* O descanso: o instante em que ele termina, e de quantos segundos era. */
  const [fimDoDescanso, setFimDoDescanso] = useState<number | null>(null)
  const [duracaoDoDescanso, setDuracaoDoDescanso] = useState(60)

  const ultimoMinuto = useRef(-1)

  /* Um relógio só para os dois, e ele só existe enquanto há o que contar. */
  useEffect(() => {
    if (inicio === null && fimDoDescanso === null) return
    const t = setInterval(() => setAgora(Date.now()), 500)
    return () => clearInterval(t)
  }, [inicio, fimDoDescanso])

  /* Voltar do segundo plano recalcula na hora, sem esperar o próximo tique. O
     Android congela o `setInterval`, e sem isto o primeiro segundo depois de
     desbloquear a tela mostraria o tempo de quando ela foi bloqueada. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', e => {
      if (e === 'active') setAgora(Date.now())
    })
    return () => sub.remove()
  }, [])

  const corridos = acumulado + (inicio === null ? 0 : (agora - inicio) / 1000)
  const minutos = Math.round(corridos / 60)

  /* Avisa a tela só quando o MINUTO muda. Avisar a cada meio segundo faria a
     tela de treino renderizar cento e vinte vezes por minuto para nada. */
  useEffect(() => {
    if (minutos !== ultimoMinuto.current) {
      ultimoMinuto.current = minutos
      onTempo(minutos)
    }
  }, [minutos, onTempo])

  const faltamDoDescanso =
    fimDoDescanso === null ? null : Math.max(0, (fimDoDescanso - agora) / 1000)
  const descansando = faltamDoDescanso !== null && faltamDoDescanso > 0

  /* Terminou: some sozinho. Um cronômetro zerado na tela não diz nada e ocupa
     o lugar do que diz. */
  useEffect(() => {
    if (faltamDoDescanso !== null && faltamDoDescanso <= 0) setFimDoDescanso(null)
  }, [faltamDoDescanso])

  const rodando = inicio !== null

  return (
    <View style={styles.cartao}>
      <View style={styles.linhaTempo}>
        <View style={styles.blocoTempo}>
          <Text style={styles.rotulo}>Treino</Text>
          <Text style={styles.tempo}>{emTexto(corridos)}</Text>
        </View>

        <Pressable
          onPress={() => {
            if (rodando) {
              setAcumulado(corridos)
              setInicio(null)
            } else {
              setInicio(Date.now())
              setAgora(Date.now())
            }
          }}
          style={({ pressed }) => [
            styles.botaoPrincipal,
            rodando && styles.botaoPausar,
            pressed && { opacity: 0.75 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={rodando ? 'Pausar o treino' : 'Começar o treino'}
        >
          <Ionicons
            name={rodando ? 'pause' : 'play'}
            size={20}
            color={paleta().cores.branco}
          />
          <Text style={styles.textoPrincipal}>{rodando ? 'Pausar' : corridos > 0 ? 'Continuar' : 'Começar'}</Text>
        </Pressable>
      </View>

      {descansando ? (
        <View style={styles.descansando}>
          <Text style={styles.rotuloDescanso}>Descanso</Text>
          <Text style={styles.tempoDescanso}>{emTexto(faltamDoDescanso ?? 0)}</Text>
          <Pressable
            onPress={() => setFimDoDescanso(null)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Pular o descanso"
          >
            <Text style={styles.pular}>Pular</Text>
          </Pressable>
          {/* A barra é o que se lê de relance com o celular apoiado no banco.
              O número exige foco; a barra não. */}
          <View style={styles.trilho}>
            <View
              style={[
                styles.preenchido,
                { width: `${Math.round(((faltamDoDescanso ?? 0) / duracaoDoDescanso) * 100)}%` },
              ]}
            />
          </View>
        </View>
      ) : (
        <View style={styles.fileiraDescanso}>
          <Text style={styles.rotuloDescanso}>Descansar</Text>
          {DESCANSOS.map(s => (
            <Pressable
              key={s}
              onPress={() => {
                setDuracaoDoDescanso(s)
                setFimDoDescanso(Date.now() + s * 1000)
                setAgora(Date.now())
              }}
              style={({ pressed }) => [styles.fichaDescanso, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel={`Descansar ${s} segundos`}
            >
              <Text style={styles.textoFichaDescanso}>{s}s</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    cartao: {
      backgroundColor: t.cores.cartao,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.cores.borda,
      padding: 14,
      gap: 12,
    },
    linhaTempo: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    blocoTempo: { flex: 1 },
    rotulo: { fontSize: 11, fontWeight: '700', color: t.inkFraco, letterSpacing: 0.5 },
    tempo: {
      fontSize: 34,
      fontWeight: '800',
      color: t.cores.ink,
      fontVariant: ['tabular-nums'],
      letterSpacing: -1,
    },
    botaoPrincipal: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 18,
      paddingVertical: 13,
      borderRadius: 12,
      backgroundColor: t.cores.verde,
    },
    botaoPausar: { backgroundColor: t.cores.verdeEscuro },
    textoPrincipal: { fontSize: 14, fontWeight: '800', color: t.cores.branco },

    fileiraDescanso: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    rotuloDescanso: { fontSize: 11, fontWeight: '700', color: t.inkFraco, letterSpacing: 0.5 },
    fichaDescanso: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 9,
      borderRadius: 9,
      backgroundColor: t.cores.superficie,
    },
    textoFichaDescanso: { fontSize: 13, fontWeight: '700', color: t.inkMedio },

    descansando: { gap: 8 },
    tempoDescanso: {
      fontSize: 26,
      fontWeight: '800',
      color: t.cores.verde,
      fontVariant: ['tabular-nums'],
    },
    pular: { fontSize: 13, fontWeight: '700', color: t.inkMedio },
    trilho: { height: 5, borderRadius: 3, backgroundColor: t.cores.trilho, overflow: 'hidden' },
    preenchido: { height: 5, borderRadius: 3, backgroundColor: t.cores.verde },
  }),
)
