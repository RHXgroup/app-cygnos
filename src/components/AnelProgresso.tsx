import { StyleSheet, Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { estilosDe, paleta } from '../lib/tema'

const DIAMETRO = 72
const ESPESSURA = 7
const RAIO = (DIAMETRO - ESPESSURA) / 2
const VOLTA = 2 * Math.PI * RAIO

/* Anel fechado com a porcentagem no meio. */
export function AnelProgresso({ percentual }: { percentual: number }) {
  const styles = estilos()
  const fracao = Math.min(Math.max(percentual / 100, 0), 1)

  return (
    <View style={styles.bloco}>
      <Svg width={DIAMETRO} height={DIAMETRO}>
        <Circle
          cx={DIAMETRO / 2}
          cy={DIAMETRO / 2}
          r={RAIO}
          stroke={paleta().cores.trilho}
          strokeWidth={ESPESSURA}
          fill="none"
        />
        <Circle
          cx={DIAMETRO / 2}
          cy={DIAMETRO / 2}
          r={RAIO}
          stroke={paleta().cores.limao}
          strokeWidth={ESPESSURA}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${VOLTA * fracao} ${VOLTA}`}
          /* O círculo do SVG começa às 3 horas. Girar -90° põe o início no topo,
             que é onde o olho espera que um progresso comece. */
          transform={`rotate(-90 ${DIAMETRO / 2} ${DIAMETRO / 2})`}
        />
      </Svg>

      <View style={styles.centro} pointerEvents="none">
        <Text style={styles.texto}>{Math.round(percentual)}%</Text>
      </View>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
  bloco: { width: DIAMETRO, height: DIAMETRO, alignItems: 'center', justifyContent: 'center' },
  centro: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  texto: { fontSize: 15, fontWeight: '800', color: t.cores.limao },
  }),
)
