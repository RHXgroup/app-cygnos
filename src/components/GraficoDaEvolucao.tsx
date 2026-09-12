import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg'
import { decimal } from '../lib/formatar'
import { FONTE } from '../lib/fontes'
import { estilosDe, paleta } from '../lib/tema'

/* A linha do tempo de uma medida -- peso, IMC, gordura, cintura.
 *
 * ──────────────────── Por que um gráfico, e não a tabela ────────────────────
 * "Evolução e medida muito paia; precisamos de gráficos diferentes, top, em
 * outra pegada -- mais consultoria do paciente do que operação."
 *
 * A tabela de números responde "quanto ele pesava em agosto". A conversa da
 * consulta é outra: "o que está acontecendo com você". Isso é forma, e forma se
 * vê -- a linha subindo, estabilizando ou caindo é o que ela vira para a
 * paciente ver.
 *
 * ──────────────────── O que ele NÃO faz ────────────────────
 * Não pinta de verde nem de vermelho. Quem está em ganho de massa sobe de
 * propósito, e o app dizer "ruim" com uma cor seria dar conduta. A linha diz o
 * que aconteceu; quem interpreta é ela.
 *
 * E não inventa ponto: medida que falta vira buraco na linha (o traçado pula),
 * porque unir agosto com outubro numa reta reta afirma um novembro que ninguém
 * mediu. */

export type PontoDaSerie = {
  /* ISO, aaaa-mm-dd. */
  quando: string
  valor: number
}

const ALTURA = 150
const PADDING_CIMA = 14
const PADDING_BAIXO = 22

export function GraficoDaEvolucao({
  pontos,
  unidade = '',
  casas = 1,
  largura,
}: {
  /* Da mais ANTIGA para a mais nova -- é como se lê uma linha do tempo. */
  pontos: PontoDaSerie[]
  unidade?: string
  casas?: number
  /* A largura vem de fora (`onLayout` de quem desenha): SVG precisa de número,
     e "100%" aqui daria um traçado esticado errado. */
  largura: number
}) {
  const styles = estilos()
  const t = paleta()

  const desenho = useMemo(() => {
    if (pontos.length === 0 || largura <= 0) return null

    const valores = pontos.map(p => p.valor)
    const maior = Math.max(...valores)
    const menor = Math.min(...valores)
    /* Uma folga de 8% em cima e embaixo, e nunca zero: com todos os valores
       iguais o intervalo seria 0 e a divisão explodiria em NaN -- uma linha
       reta no meio é a leitura certa desse caso. */
    const intervalo = maior - menor || Math.max(Math.abs(maior) * 0.1, 1)
    const teto = maior + intervalo * 0.08
    const piso = menor - intervalo * 0.08

    const util = ALTURA - PADDING_CIMA - PADDING_BAIXO
    const x = (i: number) =>
      pontos.length === 1 ? largura / 2 : (i / (pontos.length - 1)) * (largura - 24) + 12
    const y = (v: number) => PADDING_CIMA + (1 - (v - piso) / (teto - piso)) * util

    const traco = pontos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.valor)}`).join(' ')
    /* A área embaixo da linha fecha no rodapé -- é o que dá peso visual à
       direção, e é o que separa um gráfico de uma linha solta. */
    const area =
      `${traco} L ${x(pontos.length - 1)} ${ALTURA - PADDING_BAIXO} ` +
      `L ${x(0)} ${ALTURA - PADDING_BAIXO} Z`

    return { x, y, traco, area, maior, menor }
  }, [pontos, largura])

  if (!desenho) return null

  const primeiro = pontos[0]
  const ultimo = pontos[pontos.length - 1]

  return (
    <View>
      <Svg width={largura} height={ALTURA}>
        <Defs>
          <LinearGradient id="sombra" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={t.cores.verde} stopOpacity="0.28" />
            <Stop offset="1" stopColor={t.cores.verde} stopOpacity="0" />
          </LinearGradient>
        </Defs>

        {/* A linha de base, discreta: dá ao traçado um chão para subir e descer
            em cima, sem virar grade de planilha. */}
        <Line
          x1={0}
          y1={ALTURA - PADDING_BAIXO}
          x2={largura}
          y2={ALTURA - PADDING_BAIXO}
          stroke={t.cores.borda}
          strokeWidth={1}
        />

        <Path d={desenho.area} fill="url(#sombra)" />
        <Path
          d={desenho.traco}
          stroke={t.cores.verde}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {pontos.map((p, i) => {
          const ultimoPonto = i === pontos.length - 1
          return (
            <Circle
              key={i}
              cx={desenho.x(i)}
              cy={desenho.y(p.valor)}
              /* O ÚLTIMO ponto é maior: é o "onde ela está hoje", e é a
                 primeira coisa que o olho procura. */
              r={ultimoPonto ? 5.5 : 3}
              fill={ultimoPonto ? t.cores.verde : t.cores.cartao}
              stroke={t.cores.verde}
              strokeWidth={2}
            />
          )
        })}
      </Svg>

      {/* As pontas, escritas: um gráfico sem número é bonito e não serve para
          conversar com a paciente. O meio fica no toque da tabela abaixo. */}
      <View style={styles.pontas}>
        <View>
          <Text style={styles.valorDaPonta}>
            {decimal(primeiro.valor, casas)}
            {unidade}
          </Text>
          <Text style={styles.dataDaPonta}>{curta(primeiro.quando)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.valorDaPonta, styles.agora]}>
            {decimal(ultimo.valor, casas)}
            {unidade}
          </Text>
          <Text style={styles.dataDaPonta}>{curta(ultimo.quando)}</Text>
        </View>
      </View>
    </View>
  )
}

/* "12/ago". Curta porque são duas por gráfico, embaixo dos números -- a data
   inteira competiria com o valor, que é o que importa ali. */
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function curta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  if (!m) return ''
  const mes = Number(m[2]) - 1
  return `${m[3]}/${MESES[mes] ?? ''}`
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    pontas: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -8 },
    valorDaPonta: {
      fontFamily: FONTE.meia,
      fontSize: 13,
      color: t.inkSuave,
      fontVariant: ['tabular-nums'],
    },
    agora: { fontFamily: FONTE.bruta, fontSize: 17, color: t.cores.ink, letterSpacing: -0.3 },
    dataDaPonta: { fontFamily: FONTE.normal, fontSize: 11, color: t.inkFraco },
  }),
)
