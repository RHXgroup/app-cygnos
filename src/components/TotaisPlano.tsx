import { StyleSheet, Text, View } from 'react-native'
import { decimal, milhar } from '../lib/formatar'
import { fracaoDosMacros, type Totais } from '../lib/plano'
import { estilosDe, paleta } from '../lib/tema'

const MACROS = [
  { chave: 'proteinas', rotulo: 'Proteínas', cor: paleta().coresMacro.proteinas },
  { chave: 'carboidratos', rotulo: 'Carboidratos', cor: paleta().coresMacro.carboidratos },
  { chave: 'gorduras', rotulo: 'Gorduras', cor: paleta().coresMacro.gorduras },
] as const

/* O totalizador do plano: quanto o dia soma de energia e como essa energia se
 * reparte entre os macros.
 *
 * Vive num componente próprio porque aparece em dois lugares — no resumo, antes
 * de salvar, e na tela inicial, depois. Duas cópias divergiriam no primeiro
 * ajuste de estilo. */
export function TotaisPlano({ totais, rotulo = 'Total do dia' }: { totais: Totais; rotulo?: string }) {
  const styles = estilos()
  const fracao = fracaoDosMacros(totais)
  /* Sem macro nenhum não há o que repartir, e uma barra vazia com três legendas
     em zero só ocuparia espaço. */
  const temBarra = fracao.proteinas + fracao.carboidratos + fracao.gorduras > 0

  return (
    <View style={styles.cartao}>
      <Text style={styles.rotulo}>{rotulo}</Text>

      <View style={styles.linhaValor}>
        <Text style={styles.valor}>{totais.calorias === null ? '—' : milhar(totais.calorias)}</Text>
        <Text style={styles.unidade}>kcal</Text>
      </View>

      {temBarra && (
        <View style={styles.barra}>
          {MACROS.map(m => (
            <View
              key={m.chave}
              style={{ width: `${fracao[m.chave] * 100}%`, backgroundColor: m.cor }}
            />
          ))}
        </View>
      )}

      <View style={styles.linhaMacros}>
        {MACROS.map((m, i) => (
          <View key={m.chave} style={[styles.macro, i > 0 && styles.macroComDivisor]}>
            <View style={styles.linhaRotuloMacro}>
              <View style={[styles.ponto, { backgroundColor: m.cor }]} />
              <Text style={styles.rotuloMacro} numberOfLines={1}>
                {m.rotulo}
              </Text>
            </View>
            <Text style={styles.valorMacro}>
              {totais[m.chave] === null ? '—' : `${decimal(totais[m.chave] as number, 0)} g`}
            </Text>
            {/* A porcentagem é da energia vinda dos macros, não do total de
                calorias da tabela: os dois não batem, e contra o total medido as
                três fatias não fechariam 100%. */}
            <Text style={styles.percentualMacro}>
              {temBarra ? `${Math.round(fracao[m.chave] * 100)}% da energia` : '—'}
            </Text>
          </View>
        ))}
      </View>

      {totais.fibras !== null && (
        <Text style={styles.fibras}>Fibras: {decimal(totais.fibras)} g</Text>
      )}

      {/* Total calado é pior que total ausente: se algo ficou de fora da soma,
          quem lê precisa saber antes de comparar com a meta. */}
      {totais.semPeso > 0 && (
        <Text style={styles.aviso}>
          {totais.semPeso === 1
            ? '1 item sem peso informado ficou de fora da soma'
            : `${totais.semPeso} itens sem peso informado ficaram de fora da soma`}
        </Text>
      )}
      {totais.semCaloria > 0 && (
        <Text style={styles.aviso}>
          {totais.semCaloria === 1
            ? '1 item não tem calorias na tabela'
            : `${totais.semCaloria} itens não têm calorias na tabela`}
        </Text>
      )}
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
  cartao: { padding: 16, borderRadius: 20, backgroundColor: t.cores.verdeMenta },
  rotulo: { fontSize: 13, fontWeight: '700', color: t.inkMedio },

  linhaValor: { flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 2 },
  valor: { fontSize: 34, fontWeight: '800', color: t.cores.verdeEscuro, letterSpacing: -1 },
  unidade: { fontSize: 13, fontWeight: '600', color: t.inkMedio },

  barra: {
    flexDirection: 'row',
    height: 8,
    marginTop: 12,
    borderRadius: 4,
    /* Recorta as pontas das fatias no arredondado da própria barra — sem isto
       a primeira e a última fatia vazam nos cantos. */
    overflow: 'hidden',
    backgroundColor: t.cores.trilho,
  },

  linhaMacros: { flexDirection: 'row', marginTop: 14 },
  macro: { flex: 1, paddingHorizontal: 8, gap: 3 },
  macroComDivisor: { borderLeftWidth: 1, borderLeftColor: t.cores.borda },
  linhaRotuloMacro: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  ponto: { width: 7, height: 7, borderRadius: 4 },
  rotuloMacro: { flexShrink: 1, fontSize: 11.5, fontWeight: '700', color: t.inkMedio },
  valorMacro: { fontSize: 16, fontWeight: '800', color: t.cores.ink, letterSpacing: -0.3 },
  percentualMacro: { fontSize: 10.5, color: t.inkSuave },

  fibras: { marginTop: 14, fontSize: 12.5, fontWeight: '600', color: t.inkMedio },
  aviso: { marginTop: 8, fontSize: 11.5, lineHeight: 16, color: t.inkFraco },
  }),
)
