import { View } from 'react-native'
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg'
import { cores } from '../theme'

/* Curva suave a partir dos pontos: cada trecho vira uma quadrática que passa
   pelo meio de dois vizinhos. É o jeito mais barato de tirar o aspecto de
   "serra" de uma poligonal sem trazer biblioteca de gráfico. */
function caminhoSuave(pontos: { x: number; y: number }[]): string {
  if (pontos.length < 2) return ''

  let d = `M ${pontos[0].x} ${pontos[0].y}`
  for (let i = 1; i < pontos.length - 1; i++) {
    const meioX = (pontos[i].x + pontos[i + 1].x) / 2
    const meioY = (pontos[i].y + pontos[i + 1].y) / 2
    d += ` Q ${pontos[i].x} ${pontos[i].y} ${meioX} ${meioY}`
  }
  const ultimo = pontos[pontos.length - 1]
  d += ` L ${ultimo.x} ${ultimo.y}`
  return d
}

export function MiniGrafico({
  serie,
  largura = 150,
  altura = 54,
}: {
  serie: number[]
  largura?: number
  altura?: number
}) {
  if (serie.length < 2) return <View style={{ width: largura, height: altura }} />

  const min = Math.min(...serie)
  const max = Math.max(...serie)
  /* Série constante zeraria o divisor; nesse caso a linha fica no meio. */
  const amplitude = max - min || 1
  const respiro = 6 // para o traço não encostar nas bordas do desenho

  const pontos = serie.map((valor, i) => ({
    x: (i / (serie.length - 1)) * largura,
    y: respiro + (1 - (valor - min) / amplitude) * (altura - respiro * 2),
  }))

  const linha = caminhoSuave(pontos)
  /* Mesma curva fechada até a base vira a área preenchida embaixo do traço. */
  const area = `${linha} L ${largura} ${altura} L 0 ${altura} Z`

  return (
    <Svg width={largura} height={altura}>
      <Defs>
        <LinearGradient id="grad-mini" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={cores.verde} stopOpacity="0.22" />
          <Stop offset="1" stopColor={cores.verde} stopOpacity="0" />
        </LinearGradient>
      </Defs>

      <Path d={area} fill="url(#grad-mini)" />
      <Path
        d={linha}
        stroke={cores.verde}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  )
}
