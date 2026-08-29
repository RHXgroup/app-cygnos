import { StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { milhar } from '../lib/formatar'
import { estilosDe, paleta } from '../lib/tema'

/* Medidas fechadas para o arco caber na coluna estreita do cartão de metas num
   iPhone SE. Mexer aqui sem olhar a tela pequena estoura o layout. */
const LARGURA = 152
const RAIO = 58
const ESPESSURA = 11
const CENTRO_X = LARGURA / 2
const CENTRO_Y = RAIO + ESPESSURA / 2

/* Meio arco, da esquerda para a direita. Um caminho só serve para o trilho e
   para o preenchimento — o que muda é o tracejado. */
const CAMINHO = `M ${CENTRO_X - RAIO} ${CENTRO_Y} A ${RAIO} ${RAIO} 0 0 1 ${CENTRO_X + RAIO} ${CENTRO_Y}`
const COMPRIMENTO = Math.PI * RAIO

export function ArcoMeta({
  atual,
  meta,
  unidade,
  cor,
}: {
  atual: number
  meta: number
  unidade: string
  cor: string
}) {
  const styles = estilos()
  /* Passar da meta não estica o arco além do fim: o número acima já conta a
     história, e um arco transbordando viraria ilusão de ótica. */
  const fracao = meta > 0 ? Math.min(atual / meta, 1) : 0
  const porcentagem = Math.round(fracao * 100)

  return (
    <View style={styles.bloco}>
      <Svg width={LARGURA} height={CENTRO_Y + ESPESSURA / 2}>
        <Path
          d={CAMINHO}
          stroke={paleta().cores.moss}
          strokeWidth={ESPESSURA}
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d={CAMINHO}
          stroke={cor}
          strokeWidth={ESPESSURA}
          strokeLinecap="round"
          fill="none"
          /* Primeiro valor: quanto pintar. Segundo: o resto, que fica vazio. */
          strokeDasharray={`${COMPRIMENTO * fracao} ${COMPRIMENTO}`}
        />
      </Svg>

      {/* Sobreposto em vez de <Text> dentro do SVG: fonte de sistema no SVG
          renderiza diferente entre iOS e Android. */}
      <View style={styles.centro}>
        <Text style={styles.valor}>{milhar(atual)}</Text>
        <Text style={styles.meta}>
          / {milhar(meta)} {unidade}
        </Text>
        <Text style={[styles.porcentagem, { color: cor }]}>{porcentagem}%</Text>
      </View>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
  bloco: { alignItems: 'center' },
  centro: {
    position: 'absolute',
    top: 22,
    alignItems: 'center',
  },
  valor: { fontSize: 22, fontWeight: '800', color: t.cores.ink, letterSpacing: -0.5 },
  meta: { marginTop: 1, fontSize: 11.5, color: t.inkSuave },
  porcentagem: { marginTop: 3, fontSize: 12, fontWeight: '700' },
  }),
)
