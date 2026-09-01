import { View } from 'react-native'
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg'
import { paleta } from '../lib/tema'

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
  amplitudeMinima = 0,
}: {
  serie: number[]
  largura?: number
  altura?: number
  /* A menor variação que o desenho pode ocupar por inteiro.
   *
   * ── O defeito que isto conserta ────────────────────────────────────────
   * O gráfico reescalava sempre para o mínimo e o máximo DA SÉRIE. Três
   * pesagens variando 600 g — água, sal, hora do dia — eram esticadas na
   * altura toda, e a pessoa via uma subida dramática de uma variação que não
   * quer dizer nada.
   *
   * É exatamente o susto que a linha de tendência existe para evitar, e o
   * desenho o trazia de volta: `tendenciaDoPeso` alisa o número e o eixo
   * amplificava o que sobrou.
   *
   * Com um piso, variação pequena aparece PEQUENA — que é a verdade. Zero
   * mantém o comportamento antigo para quem não tem escala natural (o sono
   * tem: horas), e por isso ele é o padrão. */
  amplitudeMinima?: number
}) {
  if (serie.length < 2) return <View style={{ width: largura, height: altura }} />

  const min = Math.min(...serie)
  const max = Math.max(...serie)
  const medida = max - min

  /* Série constante zeraria o divisor; nesse caso a linha fica no meio. */
  const amplitude = Math.max(medida, amplitudeMinima) || 1
  const respiro = 6 // para o traço não encostar nas bordas do desenho

  /* Com o piso valendo, a série fica CENTRADA na faixa em vez de colada na
     base: senão uma variação de 200 g dentro de um piso de 2 kg desenharia uma
     linha rente ao chão, que se lê como "despencou". */
  const base = min - (amplitude - medida) / 2

  const pontos = serie.map((valor, i) => ({
    x: (i / (serie.length - 1)) * largura,
    y: respiro + (1 - (valor - base) / amplitude) * (altura - respiro * 2),
  }))

  const linha = caminhoSuave(pontos)
  /* Mesma curva fechada até a base vira a área preenchida embaixo do traço. */
  const area = `${linha} L ${largura} ${altura} L 0 ${altura} Z`

  return (
    <Svg width={largura} height={altura}>
      <Defs>
        <LinearGradient id="grad-mini" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={paleta().cores.verde} stopOpacity="0.22" />
          <Stop offset="1" stopColor={paleta().cores.verde} stopOpacity="0" />
        </LinearGradient>
      </Defs>

      <Path d={area} fill="url(#grad-mini)" />
      <Path
        d={linha}
        stroke={paleta().cores.verde}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  )
}
