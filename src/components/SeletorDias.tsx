import { Pressable, StyleSheet, Text, View } from 'react-native'
import { DIAS_CURTOS } from '../lib/formatar'
import { TODOS_OS_DIAS, resumoDosDias, type DiaSemana } from '../lib/plano'
import { cores, inkSuave } from '../theme'

/* Em que dias o plano se repete. Aparece ao criar e ao editar, então mora aqui:
   duas cópias divergiriam no primeiro ajuste. */
export function SeletorDias({
  dias,
  onMudar,
  desativado = false,
}: {
  dias: DiaSemana[]
  onMudar: (dias: DiaSemana[]) => void
  desativado?: boolean
}) {
  return (
    <View style={styles.bloco}>
      <View style={styles.fitas}>
        {TODOS_OS_DIAS.map(d => {
          const marcado = dias.includes(d)
          return (
            <Pressable
              key={d}
              onPress={() =>
                onMudar(
                  marcado ? dias.filter(x => x !== d) : [...dias, d].sort((a, b) => a - b),
                )
              }
              disabled={desativado}
              style={[styles.fita, marcado && styles.fitaMarcada]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: marcado }}
              accessibilityLabel={DIAS_CURTOS[d]}
            >
              <Text style={[styles.texto, marcado && styles.textoMarcado]}>{DIAS_CURTOS[d]}</Text>
            </Pressable>
          )
        })}
      </View>

      {/* O que foi montado se repete nos dias marcados — é um plano de rotina,
          não o cardápio de um dia só. */}
      <Text style={styles.explicacao}>
        {dias.length === 0
          ? 'Marque os dias em que este plano se repete.'
          : `Este cardápio se repete: ${resumoDosDias(dias).toLowerCase()}.`}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  bloco: { gap: 10 },
  /* Sete fitas numa linha só: em tela estreita o flex-wrap manda a última para
     baixo em vez de espremer as sete até o texto sumir. */
  fitas: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fita: {
    flexGrow: 1,
    minWidth: 42,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.cartao,
  },
  fitaMarcada: { backgroundColor: cores.verdeMenta, borderColor: cores.verdeClaro },
  texto: { fontSize: 12.5, fontWeight: '600', color: inkSuave },
  textoMarcado: { fontWeight: '800', color: cores.verdeEscuro },
  explicacao: { fontSize: 12.5, lineHeight: 18, color: inkSuave },
})
