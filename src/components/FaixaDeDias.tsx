import { Pressable, StyleSheet, Text, View } from 'react-native'
import { cores, inkFraco, inkSuave } from '../theme'

const LETRAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/* A semana corrente, de domingo a sábado, para escolher o dia que a tela mostra.
 *
 * Semana fixa e não "os últimos sete dias": a pessoa procura quarta-feira na
 * posição da quarta-feira. Numa régua que anda, o mesmo dia muda de lugar a
 * cada manhã e a leitura de relance se perde.
 *
 * Dia futuro fica visível e desligado, em vez de sumir: sem ele a semana teria
 * comprimento diferente a cada dia e as colunas dançariam. */
export function FaixaDeDias({
  selecionado,
  onSelecionar,
}: {
  selecionado: Date
  onSelecionar: (dia: Date) => void
}) {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)

  const domingo = new Date(hoje)
  domingo.setDate(hoje.getDate() - hoje.getDay())

  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(domingo)
    d.setDate(domingo.getDate() + i)
    return d
  })

  return (
    <View style={styles.faixa}>
      {dias.map(d => {
        const futuro = d.getTime() > hoje.getTime()
        const ehHoje = d.getTime() === hoje.getTime()
        const escolhido = mesmoDia(d, selecionado)

        return (
          <Pressable
            key={d.toISOString()}
            onPress={() => onSelecionar(d)}
            disabled={futuro}
            style={styles.coluna}
            accessibilityRole="button"
            accessibilityState={{ selected: escolhido, disabled: futuro }}
            accessibilityLabel={`${LETRAS[d.getDay()]}, dia ${d.getDate()}`}
          >
            <Text style={[styles.letra, futuro && styles.textoFuturo]}>{LETRAS[d.getDay()]}</Text>
            <View
              style={[
                styles.bolha,
                /* Hoje sem estar escolhido fica só contornado: preencher os dois
                   faria a pessoa procurar qual dos dois está selecionado. */
                ehHoje && !escolhido && styles.bolhaHoje,
                escolhido && styles.bolhaEscolhida,
              ]}
            >
              <Text
                style={[
                  styles.numero,
                  futuro && styles.textoFuturo,
                  escolhido && styles.numeroEscolhido,
                ]}
              >
                {d.getDate()}
              </Text>
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}

const mesmoDia = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()

const styles = StyleSheet.create({
  faixa: { flexDirection: 'row', justifyContent: 'space-between' },
  coluna: { alignItems: 'center', gap: 7, flex: 1 },
  letra: { fontSize: 11.5, fontWeight: '600', color: inkSuave },
  bolha: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: cores.cartao,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  bolhaHoje: { borderColor: cores.limao },
  bolhaEscolhida: { backgroundColor: cores.limao, borderColor: cores.limao },
  numero: { fontSize: 14.5, fontWeight: '700', color: cores.ink },
  numeroEscolhido: { color: cores.sobreLimao, fontWeight: '800' },
  textoFuturo: { color: inkFraco },
})
