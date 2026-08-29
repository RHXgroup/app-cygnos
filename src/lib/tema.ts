import AsyncStorage from '@react-native-async-storage/async-storage'
import { CLARO, ESCURO, type Paleta } from '../theme'

/* Qual paleta está valendo, e como as telas leem isso.
 *
 * ── Por que não é um contexto do React ─────────────────────────────────────
 * Porque `StyleSheet.create` congela as cores no instante em que roda, e ele
 * roda no topo do arquivo. Com contexto, cada um dos 179 componentes do app
 * precisaria de um hook e de um useMemo só para montar os estilos — e as funções
 * auxiliares que também usam estilo não podem chamar hook nenhum.
 *
 * Aqui a paleta é uma variável de módulo, e cada arquivo declara os estilos uma
 * vez com `estilosDe`. Trocar de tema troca a variável e remonta a árvore pela
 * raiz (ver o `key` no App), e na remontagem os estilos são recalculados. Uma
 * linha por arquivo, nenhuma por componente, e funciona em qualquer função.
 *
 * O preço é a remontagem. Ela custa um piscar — e trocar de tema é uma ação que
 * a pessoa faz uma vez e esquece, não algo que aconteça durante o uso.
 *
 * ── O que NÃO é escolhível ─────────────────────────────────────────────────
 * O vermelho de erro e os três matizes dos macros. Erro que muda de cor deixa de
 * ser reconhecido como erro, e os macros precisam continuar distinguíveis entre
 * si — inclusive para quem enxerga pouco contraste, que é a razão de eles serem
 * três matizes e não três tons do mesmo verde. Ver o comentário em theme.ts. */

export type Tema = 'escuro' | 'claro'

const CHAVE = 'tema.escolhido'

const PALETAS: Record<Tema, Paleta> = { escuro: ESCURO, claro: CLARO }

/* O escuro é o padrão, e continua sendo o que o app mostra a quem nunca
   escolheu nada. */
let temaAtual: Tema = 'escuro'
let paletaAtual: Paleta = ESCURO

export const tema = (): Tema => temaAtual
export const paleta = (): Paleta => paletaAtual

/* Avisa quem precisa remontar. Um só ouvinte, na raiz do app — não é um sistema
   de eventos, é o mínimo para a árvore saber que precisa nascer de novo. */
let aoTrocar: (() => void) | null = null

export function escutarTema(f: (() => void) | null): void {
  aoTrocar = f
}

/* Lida uma vez, na abertura, antes de a área logada aparecer.
 *
 * Se falhar, fica o escuro: não conseguir ler a preferência é bem menos grave do
 * que travar a abertura do app por causa dela. */
export async function carregarTema(): Promise<void> {
  try {
    const guardado = await AsyncStorage.getItem(CHAVE)
    if (guardado === 'claro' || guardado === 'escuro') {
      temaAtual = guardado
      paletaAtual = PALETAS[guardado]
    }
  } catch {
    /* Fica o padrão. */
  }
}

export async function trocarTema(novo: Tema): Promise<void> {
  if (novo === temaAtual) return

  temaAtual = novo
  paletaAtual = PALETAS[novo]
  /* Remonta primeiro, grava depois: o que a pessoa espera é a tela mudar, e a
     gravação não pode atrasar isso. Se ela falhar, o tema vale nesta sessão e
     volta ao anterior na próxima — chato, e melhor do que um toque que não faz
     nada. */
  aoTrocar?.()

  try {
    await AsyncStorage.setItem(CHAVE, novo)
  } catch {
    /* Ver acima. */
  }
}

/* Os estilos de um arquivo, recalculados quando a paleta muda.
 *
 * Uso:
 *
 *   const estilos = estilosDe(t => StyleSheet.create({ tela: { backgroundColor: t.cores.fundo } }))
 *
 *   function MinhaTela() {
 *     const styles = estilos()
 *     ...
 *   }
 *
 * O cache existe porque `estilos()` é chamado a cada render, e a Home tem
 * duzentos e doze estilos: recriá-los a cada quadro seria pagar caro por uma
 * coisa que muda uma vez por mês. Compara por identidade da paleta, que é
 * constante enquanto o tema não troca. */
export function estilosDe<T>(criar: (t: Paleta) => T): () => T {
  let deQualPaleta: Paleta | null = null
  let guardado: T

  return () => {
    if (deQualPaleta !== paletaAtual) {
      deQualPaleta = paletaAtual
      guardado = criar(paletaAtual)
    }
    return guardado
  }
}
