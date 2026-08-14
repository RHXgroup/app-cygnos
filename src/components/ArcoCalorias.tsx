import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { cores } from '../theme'

const LARGURA = 156
const RAIO = 62
const ESPESSURA = 11
const CENTRO_X = LARGURA / 2
const CENTRO_Y = RAIO + ESPESSURA / 2
const ALTURA = CENTRO_Y + ESPESSURA / 2

/* Meio arco, da esquerda para a direita. Um caminho só serve para o trilho e
   para o preenchimento — o que muda é o tracejado. */
const CAMINHO = `M ${CENTRO_X - RAIO} ${CENTRO_Y} A ${RAIO} ${RAIO} 0 0 1 ${CENTRO_X + RAIO} ${CENTRO_Y}`
const COMPRIMENTO = Math.PI * RAIO

/* Arco de meia-lua com conteúdo livre no miolo. O conteúdo vem por children em
   vez de props de texto porque cada tela põe uma coisa diferente ali dentro. */
export function ArcoCalorias({ fracao, children }: { fracao: number; children?: ReactNode }) {
  /* Passar da meta não estica o arco além do fim: o número ao lado já conta a
     história, e um arco transbordando viraria ilusão de ótica. */
  const preenchida = Math.min(Math.max(fracao, 0), 1)

  return (
    <View style={styles.bloco}>
      <Svg width={LARGURA} height={ALTURA}>
        <Path
          d={CAMINHO}
          stroke={cores.trilho}
          strokeWidth={ESPESSURA}
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d={CAMINHO}
          stroke={cores.verde}
          strokeWidth={ESPESSURA}
          strokeLinecap="round"
          fill="none"
          /* Primeiro valor: quanto pintar. Segundo: o resto, que fica vazio. */
          strokeDasharray={`${COMPRIMENTO * preenchida} ${COMPRIMENTO}`}
        />
      </Svg>

      {/* Sobreposto em vez de <Text> dentro do SVG: fonte de sistema no SVG
          renderiza diferente entre iOS e Android. */}
      <View style={styles.centro} pointerEvents="none">
        {children}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  bloco: { width: LARGURA, height: ALTURA, alignItems: 'center' },
  centro: {
    position: 'absolute',
    top: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
})
