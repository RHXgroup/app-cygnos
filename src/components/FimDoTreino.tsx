import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { historicoDosExercicios, type SerieFeita } from '../lib/treino'
import { resumoDoTreino, volumeLegivel, type ResumoDoTreino } from '../lib/resumoDoTreino'
import { dataISO, milhar } from '../lib/formatar'
import { estilosDe, paleta } from '../lib/tema'

/* O que aquele treino valeu.
 *
 * ── Por que existe, e por que AQUI ────────────────────────────────────────
 * O app pedia e guardava, e no fim a pessoa não levava nada. Um app que só
 * cobra não é aberto na terceira semana.
 *
 * E a devolução tem de estar colada no esforço. É agora, suada, que "você fez
 * 55 kg — na semana passada eram 50" significa alguma coisa; a mesma frase numa
 * aba de relatório, dois dias depois, é número. Foi por isso que isto não virou
 * uma tela de "evolução": tela que se precisa lembrar de visitar é tela
 * esquecida.
 *
 * ── O que ela mostra primeiro ─────────────────────────────────────────────
 * O que MELHOROU. A ordem das comparações vem do resumo, do maior ganho para o
 * menor, e a tela mostra as primeiras — porque é isso que faz alguém voltar.
 *
 * O que não melhorou não é escondido nem comentado: aparece na lista com o
 * número, sem adjetivo. Um app que elogia demais deixa de ser levado a sério, e
 * um que cobra vira o que este aqui era. */

export function FimDoTreino({
  contaId,
  series,
  minutos,
  pesoKg,
  onPronto,
}: {
  contaId: string
  /* As séries feitas HOJE, como o modo treino as gravou. */
  series: SerieFeita[]
  minutos: number
  /* O peso atual, para estimar a caloria. Sem ele, a estimativa não sai — e
     isso é melhor do que chutar 70 kg. */
  pesoKg: number | null
  onPronto: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const [resumo, setResumo] = useState<ResumoDoTreino | null>(null)

  useEffect(() => {
    let vivo = true
    const ids = [...new Set(series.map(s => s.exercicioId).filter((i): i is string => !!i))]
    void historicoDosExercicios(contaId, ids, dataISO(new Date())).then(historico => {
      if (vivo) setResumo(resumoDoTreino(series, historico, minutos, pesoKg))
    })
    return () => {
      vivo = false
    }
  }, [contaId, series, minutos, pesoKg])

  if (!resumo) {
    return (
      <View style={[styles.tela, { paddingTop: top + 40 }]}>
        <ActivityIndicator color={paleta().cores.verde} />
      </View>
    )
  }

  const melhoras = resumo.comparacoes.filter(c => (c.variacao ?? 0) > 0)

  return (
    <View style={[styles.tela, { paddingTop: top + 16 }]}>
      <ScrollView
        contentContainerStyle={[styles.conteudo, { paddingBottom: bottom + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        <Ionicons name="checkmark-circle" size={46} color={paleta().cores.verde} />
        <Text style={styles.titulo}>Treino feito</Text>

        {/* Os números do dia, grandes. É o que a pessoa mostra para alguém. */}
        <View style={styles.numeros}>
          <Numero valor={`${minutos}`} rotulo="minutos" styles={styles} />
          <Numero valor={`${resumo.series}`} rotulo={resumo.series === 1 ? 'série' : 'séries'} styles={styles} />
          {resumo.volumeKg > 0 && (
            <Numero valor={volumeLegivel(resumo.volumeKg)} rotulo="levantados" styles={styles} />
          )}
        </View>

        {resumo.calorias !== null && (
          <Text style={styles.calorias}>
            Por volta de <Text style={styles.forte}>{milhar(resumo.calorias)} kcal</Text> gastas.{' '}
            <Text style={styles.ressalva}>É estimativa, pelo seu peso e pelo tempo.</Text>
          </Text>
        )}

        {/* O recorde vem antes de tudo. É a única coisa aqui que a pessoa vai
            querer contar para alguém, e enterrá-la embaixo de uma lista seria
            desperdiçar o motivo pelo qual ela abriria o app amanhã. */}
        {resumo.recordes > 0 && (
          <View style={styles.recorde}>
            <Ionicons name="trophy" size={20} color={paleta().cores.limaoEscuro} />
            <Text style={styles.textoRecorde}>
              {resumo.recordes === 1
                ? 'Você bateu o seu recorde de carga em um exercício.'
                : `Você bateu o seu recorde de carga em ${resumo.recordes} exercícios.`}
            </Text>
          </View>
        )}

        {melhoras.length > 0 && (
          <View style={styles.bloco}>
            <Text style={styles.tituloBloco}>Você subiu</Text>
            {melhoras.slice(0, 4).map(c => (
              <View key={c.nome} style={styles.linha}>
                <Text style={styles.nome} numberOfLines={1}>
                  {c.nome}
                </Text>
                <Text style={styles.evolucao}>
                  {c.antesKg} → <Text style={styles.forte}>{c.hojeKg} kg</Text>
                  {c.variacao !== null ? `  +${c.variacao}%` : ''}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Sem histórico ainda: o que dá para prometer honestamente é que a
            comparação vem, e quando. Uma tela de fim de treino sem nada a dizer
            é a que ensina a não abrir mais. */}
        {resumo.comparacoes.length === 0 && (
          <Text style={styles.explicacao}>
            Este é o primeiro registro desses exercícios. Da próxima vez que você fizer os mesmos,
            eu mostro aqui o que mudou.
          </Text>
        )}

        <Pressable onPress={onPronto} style={styles.botao} accessibilityRole="button">
          <Text style={styles.textoBotao}>Pronto</Text>
        </Pressable>
      </ScrollView>
    </View>
  )
}

function Numero({
  valor,
  rotulo,
  styles,
}: {
  valor: string
  rotulo: string
  styles: ReturnType<typeof estilos>
}) {
  return (
    <View style={styles.numero}>
      <Text style={styles.valorNumero}>{valor}</Text>
      <Text style={styles.rotuloNumero}>{rotulo}</Text>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.cores.fundo },
    conteudo: { paddingHorizontal: 24, alignItems: 'center', gap: 14 },

    titulo: { fontSize: 26, fontWeight: '800', color: t.cores.ink, letterSpacing: -0.6 },

    numeros: { flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginTop: 4 },
    numero: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
      backgroundColor: t.cores.cartao,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.cores.borda,
      paddingVertical: 14,
    },
    valorNumero: {
      fontSize: 23,
      fontWeight: '800',
      color: t.cores.ink,
      fontVariant: ['tabular-nums'],
    },
    rotuloNumero: { fontSize: 11.5, color: t.inkFraco, fontWeight: '600' },

    calorias: { fontSize: 14, color: t.inkMedio, lineHeight: 21, textAlign: 'center' },
    ressalva: { fontSize: 12, color: t.inkFraco },
    forte: { fontWeight: '800', color: t.cores.ink },

    recorde: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      alignSelf: 'stretch',
      backgroundColor: t.cores.verdeClaro,
      borderRadius: 14,
      padding: 15,
    },
    textoRecorde: { flex: 1, fontSize: 14, fontWeight: '700', color: t.cores.ink, lineHeight: 20 },

    bloco: {
      alignSelf: 'stretch',
      backgroundColor: t.cores.cartao,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.cores.borda,
      padding: 15,
      gap: 10,
    },
    tituloBloco: { fontSize: 14.5, fontWeight: '800', color: t.cores.ink },
    linha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    nome: { flex: 1, fontSize: 14, color: t.inkMedio },
    evolucao: { fontSize: 14, color: t.cores.verde, fontWeight: '700', fontVariant: ['tabular-nums'] },

    explicacao: { fontSize: 13.5, color: t.inkMedio, lineHeight: 20, textAlign: 'center' },

    botao: {
      alignSelf: 'stretch',
      backgroundColor: t.cores.verde,
      borderRadius: 14,
      height: 50,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 6,
    },
    textoBotao: { color: t.cores.branco, fontSize: 15, fontWeight: '800' },
  }),
)
