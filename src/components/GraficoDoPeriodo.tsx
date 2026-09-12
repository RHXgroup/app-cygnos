import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as TextoSvg } from 'react-native-svg'
import { dataCurta, diaCurto, maiorDaSerie, tetoDoEixo, type PontoDoDia } from '../lib/serieDoPainel'
import { FONTE } from '../lib/fontes'
import { estilosDe, paleta } from '../lib/tema'

/* O gráfico do período: uma curva por dia, com a base no ZERO.
 *
 * ──────────────────── Por que não é o `MiniGrafico` ────────────────────
 * Aquele é uma faísca de MEDIDA -- peso, sono -- e reescala para o mínimo e o
 * máximo da série de propósito, para variação pequena aparecer. Aqui a pergunta
 * é outra: quantas consultas, quanto entrou. A base tem de ser zero, senão um
 * dia com uma consulta e outro com duas desenham um abismo -- e o dia vazio
 * precisa aparecer como chão, não como o menor ponto da escala.
 *
 * ──────────────────── E por que não é barra de progresso ────────────────────
 * Pedido dele, duas vezes: "quero um gráfico, não barrinha de progressão".
 * Barra de progresso compara com uma meta; aqui não há meta -- há um movimento
 * ao longo dos dias, e movimento se lê em curva.
 *
 * ──────────────────── O que ele mostra sem legenda ────────────────────
 * O maior dia ganha o número escrito em cima, e o último ponto ganha um anel:
 * são as duas perguntas que se faz olhando ("qual foi o pico?" e "e hoje?").
 * Legenda embaixo só nas pontas e no meio -- catorze rótulos numa tela de
 * celular viram uma tarja cinza ilegível. */

const ALTURA = 150
const RESPIRO_CIMA = 26
const RESPIRO_BAIXO = 22

export function GraficoDoPeriodo({
  serie,
  largura,
  cor,
  formatar = n => String(Math.round(n)),
  rotulos = 'dia',
}: {
  serie: PontoDoDia[]
  largura: number
  /** A cor da linha. O preenchimento é ela, esmaecida. */
  cor?: string
  /** Como o número do pico é escrito. Reais num caso, contagem no outro. */
  formatar?: (valor: number) => string
  /** "dia" escreve seg/ter/qua; "data" escreve 12/09. */
  rotulos?: 'dia' | 'data'
}) {
  const styles = estilos()
  const traco = cor ?? paleta().cores.verde

  const desenho = useMemo(() => {
    if (serie.length < 2 || largura <= 0) return null

    const teto = tetoDoEixo(maiorDaSerie(serie))
    const alturaUtil = ALTURA - RESPIRO_CIMA - RESPIRO_BAIXO
    const x = (i: number) => (i / (serie.length - 1)) * largura
    const y = (valor: number) => RESPIRO_CIMA + (1 - valor / teto) * alturaUtil

    const pontos = serie.map((p, i) => ({ x: x(i), y: y(p.valor), ...p }))

    /* Curva suave pelo ponto médio de cada par -- o mesmo traçado do
       `MiniGrafico`, e pelo mesmo motivo: tira o aspecto de serra sem trazer
       biblioteca de gráfico. */
    let linha = `M ${pontos[0].x} ${pontos[0].y}`
    for (let i = 1; i < pontos.length - 1; i++) {
      const meioX = (pontos[i].x + pontos[i + 1].x) / 2
      const meioY = (pontos[i].y + pontos[i + 1].y) / 2
      linha += ` Q ${pontos[i].x} ${pontos[i].y} ${meioX} ${meioY}`
    }
    linha += ` L ${pontos[pontos.length - 1].x} ${pontos[pontos.length - 1].y}`

    const chao = ALTURA - RESPIRO_BAIXO
    const area = `${linha} L ${largura} ${chao} L 0 ${chao} Z`

    /* O pico: o primeiro maior, e não o último -- se dois dias empatam, o
       número fica no que veio antes, que é onde o olho já estava. */
    let pico = pontos[0]
    for (const p of pontos) if (p.valor > pico.valor) pico = p

    return { pontos, linha, area, chao, pico, teto, ultimo: pontos[pontos.length - 1] }
  }, [serie, largura])

  if (!desenho) {
    return (
      <View style={[styles.vazio, { width: largura, height: ALTURA }]}>
        <Text style={styles.textoVazio}>Sem movimento no período.</Text>
      </View>
    )
  }

  const { pontos, linha, area, chao, pico, ultimo } = desenho
  const semNada = pico.valor === 0

  return (
    <View>
      <Svg width={largura} height={ALTURA}>
        <Defs>
          <LinearGradient id="pulso" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={traco} stopOpacity="0.28" />
            <Stop offset="1" stopColor={traco} stopOpacity="0" />
          </LinearGradient>
        </Defs>

        {/* Duas linhas de apoio, bem fracas: dão profundidade sem virar grade de
            planilha. A de baixo é o chão (zero), e é ela que diz que a escala
            começa no zero -- sem isso, qualquer subida parece enorme. */}
        <Line x1="0" y1={chao} x2={largura} y2={chao} stroke={paleta().cores.borda} strokeWidth={1} />
        <Line
          x1="0"
          y1={RESPIRO_CIMA}
          x2={largura}
          y2={RESPIRO_CIMA}
          stroke={paleta().cores.borda}
          strokeWidth={1}
          strokeDasharray="3 6"
        />

        {!semNada && <Path d={area} fill="url(#pulso)" />}
        <Path
          d={linha}
          stroke={semNada ? paleta().cores.borda : traco}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {!semNada && (
          <>
            {/* O pico escrito, e o ponto dele */}
            <Circle cx={pico.x} cy={pico.y} r={3.5} fill={traco} />
            <TextoSvg
              x={Math.min(Math.max(pico.x, 16), largura - 16)}
              y={Math.max(pico.y - 10, 12)}
              fill={paleta().cores.ink}
              fontSize={12}
              fontWeight="700"
              textAnchor="middle"
            >
              {formatar(pico.valor)}
            </TextoSvg>
          </>
        )}

        {/* HOJE: anel no último ponto. É a única marca que responde "e agora?" */}
        <Circle cx={ultimo.x} cy={ultimo.y} r={6} fill={traco} fillOpacity={0.18} />
        <Circle
          cx={ultimo.x}
          cy={ultimo.y}
          r={3.5}
          fill={paleta().cores.cartao}
          stroke={traco}
          strokeWidth={2.5}
        />
      </Svg>

      <View style={[styles.rotulos, { width: largura }]}>
        {pontos.map((p, i) => {
          const mostra = i === 0 || i === pontos.length - 1 || i === Math.floor(pontos.length / 2)
          if (!mostra) return null
          return (
            <Text
              key={p.dia}
              style={[
                styles.rotulo,
                {
                  left: Math.min(Math.max(p.x - 20, 0), largura - 40),
                },
                i === pontos.length - 1 && styles.rotuloDeHoje,
              ]}
            >
              {i === pontos.length - 1
                ? 'hoje'
                : rotulos === 'dia'
                  ? diaCurto(p.dia)
                  : dataCurta(p.dia)}
            </Text>
          )
        })}
      </View>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    vazio: { alignItems: 'center', justifyContent: 'center' },
    textoVazio: { fontSize: 13, color: t.inkFraco },
    rotulos: { height: 16, marginTop: -14 },
    rotulo: {
      position: 'absolute',
      width: 40,
      textAlign: 'center',
      fontSize: 10.5,
      color: t.inkFraco,
      fontFamily: FONTE.media,
    },
    rotuloDeHoje: { color: t.inkSuave, fontFamily: FONTE.forte },
  }),
)
