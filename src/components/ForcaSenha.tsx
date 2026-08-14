import { StyleSheet, Text, View } from 'react-native'
import { forcaSenha, requisitosSenha, type NivelSenha } from '../lib/formulario'
import { cores, inkFraco, inkMedio } from '../theme'

const APARENCIA: Record<NivelSenha, { rotulo: string; cor: string; barras: number }> = {
  fraca: { rotulo: 'Fraca', cor: cores.erroTexto, barras: 1 },
  media: { rotulo: 'Média', cor: cores.gold, barras: 2 },
  forte: { rotulo: 'Forte', cor: cores.deep, barras: 3 },
}

/* Medidor + lista de requisitos. A lista é a parte útil: dizer "fraca" sem
   dizer o que falta deixa a pessoa tentando no escuro. */
export function ForcaSenha({ senha }: { senha: string }) {
  /* Antes de digitar não há o que avaliar, e um medidor vermelho na primeira
     vez que a pessoa olha o campo parece repreensão. */
  if (!senha) return null

  const { nivel } = forcaSenha(senha)
  const { rotulo, cor, barras } = APARENCIA[nivel]
  const requisitos = requisitosSenha(senha)

  return (
    <View style={styles.bloco}>
      <View style={styles.linhaMedidor}>
        <View style={styles.barras}>
          {[0, 1, 2].map(i => (
            <View
              key={i}
              style={[styles.barra, i < barras && { backgroundColor: cor }]}
            />
          ))}
        </View>
        <Text style={[styles.rotuloForca, { color: cor }]}>{rotulo}</Text>
      </View>

      <View style={styles.requisitos}>
        {requisitos.map(r => (
          <View key={r.chave} style={styles.linhaRequisito}>
            <Text style={[styles.marcador, r.ok && styles.marcadorOk]}>{r.ok ? '✓' : '·'}</Text>
            <Text style={[styles.textoRequisito, r.ok && styles.textoRequisitoOk]}>
              {r.rotulo}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  bloco: { marginTop: 10, gap: 10 },
  linhaMedidor: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barras: { flex: 1, flexDirection: 'row', gap: 5 },
  barra: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: cores.moss,
  },
  rotuloForca: { fontSize: 12.5, fontWeight: '700', minWidth: 44, textAlign: 'right' },

  requisitos: { gap: 4 },
  linhaRequisito: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  /* Largura fixa para o "✓" e o "·" não empurrarem o texto de lugar quando o
     requisito é atendido. */
  marcador: { width: 12, textAlign: 'center', fontSize: 12.5, color: inkFraco },
  marcadorOk: { color: cores.deep, fontWeight: '700' },
  textoRequisito: { fontSize: 12.5, color: inkFraco },
  textoRequisitoOk: { color: inkMedio },
})
