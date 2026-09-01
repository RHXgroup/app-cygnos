import { StyleSheet, Text, View } from 'react-native'

import { estilosDe } from '../lib/tema'

/* A caixa de "não tem nada aqui ainda".
 *
 * Estava escrita DUAS vezes — `AgendarConsultaScreen` e `ConteudoNutriScreen`
 * —, e as duas cópias eram idênticas byte a byte, estilos inclusive. Cópias
 * idênticas hoje não continuam idênticas: alguém ajusta o padding de uma tela,
 * e a partir dali as duas caixas são parecidas em vez de iguais, sem que
 * ninguém tenha decidido isso.
 *
 * ── O que este componente NÃO é ────────────────────────────────────────────
 * Não é erro. Erro tem borda e cor de erro (`styles.erro`, que segue em cada
 * tela), porque pede uma ação de quem lê. Isto aqui é ausência: a
 * nutricionista ainda não publicou a receita, a agenda não tem horário livre,
 * o dia não tem refeição montada. Nada quebrou, e a caixa não deve parecer
 * que sim.
 *
 * Por isso o texto é `inkSuave` e centralizado, sem ícone e sem botão: ele
 * ocupa o lugar do conteúdo que viria, e sai de cena sozinho quando o
 * conteúdo chega. */
export function Aviso({ texto }: { texto: string }) {
  const styles = estilos()
  return (
    <View style={styles.aviso}>
      <Text style={styles.textoAviso}>{texto}</Text>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    aviso: { marginTop: 16, borderRadius: 16, backgroundColor: t.cores.cartao, padding: 18 },
    textoAviso: { fontSize: 13.5, lineHeight: 20, color: t.inkSuave, textAlign: 'center' },
  }),
)
