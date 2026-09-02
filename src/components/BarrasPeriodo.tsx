import { StyleSheet, Text, View } from 'react-native'
import type { Coluna } from '../lib/relatorio'
import { estilosDe, paleta } from '../lib/tema'

const ALTURA = 92

/* As barras do relatório: uma por dia, ou uma por semana quando o período é
 * longo — quem decide isso é `colunasDe`, em lib/relatorio.ts.
 *
 * Irmão do gráfico da tela de Água, e não o mesmo componente de propósito: lá
 * são sempre sete barras, todas com valor, e o dia de hoje tem realce. Aqui o
 * número de colunas varia, a coluna sem registro precisa de um desenho próprio
 * — e hoje nem entra no período. Unificar os dois deixaria cada tela pagando
 * pelas condições da outra. */
export function BarrasPeriodo({
  colunas,
  meta,
  cor = paleta().cores.verde,
  corNaMeta = paleta().cores.verde,
  /* Como o valor da meta se lê ao lado da linha. Sem isso a linha atravessa o
     gráfico sem dizer contra o que está comparando. */
  rotuloMeta,
}: {
  colunas: Coluna[]
  meta?: number | null
  cor?: string
  corNaMeta?: string
  rotuloMeta?: string
}) {
  const styles = estilos()
  const valores = colunas.map(c => c.valor).filter((v): v is number => v !== null)

  /* Teto medido contra a MAIOR das duas — a meta ou o maior valor. Contra a
     meta sozinha, um dia de 3.000 kcal com meta de 2.000 estouraria o topo e
     três dias diferentes ficariam do mesmo tamanho. */
  const teto = Math.max(meta ?? 0, ...valores, 1)

  /* Rótulo em toda coluna vira um borrão acima de dez. Pular de dois em dois
     mantém a referência sem empilhar texto. */
  const passo = colunas.length > 10 ? 2 : 1

  return (
    <View>
      <View style={styles.grafico}>
        {meta !== null && meta !== undefined && meta > 0 && (
          <View style={[styles.linhaMeta, { bottom: (meta / teto) * ALTURA }]}>
            {!!rotuloMeta && <Text style={styles.rotuloMeta}>{rotuloMeta}</Text>}
          </View>
        )}

        {colunas.map((c, i) => {
          const bateu = meta !== null && meta !== undefined && meta > 0 && (c.valor ?? 0) >= meta

          return (
            <View key={c.chave} style={styles.coluna}>
              <View style={styles.trilho}>
                {c.valor === null ? (
                  /* Coluna sem registro: um traço no chão, não uma barra rente
                     a ele. Uma barra de altura mínima seria lida como "bebeu
                     quase nada", que é uma afirmação — e o app não sabe. */
                  <View style={styles.semRegistro} />
                ) : (
                  <View
                    style={[
                      styles.barra,
                      { height: Math.max((c.valor / teto) * ALTURA, 3) },
                      { backgroundColor: bateu ? corNaMeta : cor },
                    ]}
                  />
                )}
              </View>
              <Text style={styles.rotulo} numberOfLines={1}>
                {i % passo === 0 ? c.rotulo : ''}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
  grafico: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginTop: 6 },
  linhaMeta: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: t.cores.trilho,
    /* O `bottom` é medido a partir do pé do gráfico, e o rótulo do dia ocupa a
       faixa de baixo — daí o deslocamento, que é a altura dele mais o respiro
       (6 + 12). Sem isto a linha da meta desce para dentro dos rótulos. */
    marginBottom: 18,
    zIndex: 1,
  },
  rotuloMeta: {
    position: 'absolute',
    right: 0,
    top: -12,
    fontSize: 9.5,
    fontWeight: '600',
    color: t.inkFraco,
  },
  coluna: { flex: 1, alignItems: 'center' },
  trilho: { height: ALTURA, width: '100%', justifyContent: 'flex-end' },
  barra: { width: '100%', borderRadius: 4, minHeight: 3 },
  semRegistro: { height: 3, width: '100%', borderRadius: 4, backgroundColor: t.cores.trilho },
  rotulo: { marginTop: 6, height: 12, fontSize: 9.5, color: t.inkSuave },
  }),
)
