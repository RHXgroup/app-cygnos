import AsyncStorage from '@react-native-async-storage/async-storage'
import { definirTratamento, ondeGuardar, type Tratamento } from './tratamentoDaNutri'

/* Onde a resposta de "ela ou ele" sobrevive ao fechamento do app.
 *
 * -- Por que e um arquivo separado --------------------------------------
 * `tratamentoDaNutri` nao pode importar nada: `montarAvisos` e `objetivos`
 * usam as palavras dele e os dois tem teste rodando em Node puro, onde um
 * import de AsyncStorage arrasta o React Native inteiro e nada roda (item 16
 * do AGENTS.md). Entao a parte que fala com o aparelho fica aqui, e se
 * APRESENTA la em vez de ser importada de la.
 *
 * -- Por que guardar --------------------------------------------------------
 * Sem isto, a PRIMEIRA tela de cada abertura sairia no feminino e se
 * corrigiria quando o catalogo respondesse: um pisca-pisca de genero na cara
 * de quem relatou justamente esse problema. Guardado, ele ja nasce certo e a
 * rede so confirma.
 *
 * -- Nao e dado de saude ----------------------------------------------------
 * E uma palavra. Fica no aparelho, e quem trocar de telefone ve uma tela no
 * feminino ate o catalogo responder. */

const CHAVE = 'cygnos:tratamento-da-nutri'

ondeGuardar((t: Tratamento) => {
  void AsyncStorage.setItem(CHAVE, t).catch(() => {})
})

/* Chamado uma vez, na partida do App -- mesmo lugar e mesmo formato de
   `carregarTema`. Nunca rejeita: a falha aqui custa uma tela no feminino, e nao
   um erro. */
export async function carregarTratamento(): Promise<void> {
  try {
    definirTratamento(await AsyncStorage.getItem(CHAVE))
  } catch {
    /* Fica no padrao. */
  }
}
