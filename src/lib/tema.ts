import AsyncStorage from '@react-native-async-storage/async-storage'
import { CLARO, ESCURO, type Paleta } from '../theme'
import {
  ajustadaPara,
  comAlfa,
  comClaridade,
  preenchimentoParaTextoBranco,
  textoSobre,
} from './cor'

/* Qual paleta está valendo, e como as telas leem isso.
 *
 * ── Por que não é um contexto do React ─────────────────────────────────────
 * Porque `StyleSheet.create` congela as cores no instante em que roda, e ele
 * roda no topo do arquivo. Com contexto, cada um dos 179 componentes do app
 * precisaria de um hook e de um useMemo só para montar os estilos — e as funções
 * auxiliares que também usam estilo não podem chamar hook nenhum.
 *
 * Aqui a paleta é uma variável de módulo, e cada arquivo declara os estilos uma
 * vez com `estilosDe`. Trocar de tema troca a variável e manda a raiz redesenhar
 * (ver `escutarTema` no App); como `estilos()` é chamado durante o render, cada
 * componente pede os estilos de novo e recebe os da paleta nova. Uma linha por
 * arquivo, nenhuma por componente, e funciona em qualquer função.
 *
 * REDESENHAR, e não remontar. A primeira versão remontava a árvore com uma
 * `key`, e isso jogava para a tela inicial quem trocasse a cor estando em Mais —
 * escolher três cores seguidas exigia navegar até lá três vezes. Re-render
 * preserva o estado dos filhos; só desmontar destrói.
 *
 * ── O que NÃO é escolhível ─────────────────────────────────────────────────
 * O vermelho de erro e os três matizes dos macros. Erro que muda de cor deixa de
 * ser reconhecido como erro, e os macros precisam continuar distinguíveis entre
 * si — inclusive para quem enxerga pouco contraste, que é a razão de eles serem
 * três matizes e não três tons do mesmo verde. Ver o comentário em theme.ts. */

export type Tema = 'escuro' | 'claro'

const CHAVE = 'tema.escolhido'
const CHAVE_ACENTO = 'tema.acento'

const BASES: Record<Tema, Paleta> = { escuro: ESCURO, claro: CLARO }

/* A paleta com a cor que a pessoa escolheu no lugar do verde da marca.
 *
 * Só o ACENTO muda. Fundo, cartão, texto e trilho continuam sendo os da base —
 * é o que impede uma escolha de cor de virar uma tela ilegível, e é também o que
 * faz o app continuar parecendo o mesmo app com outra cor, em vez de um app
 * diferente a cada escolha.
 *
 * O que fica de fora, e é decisão e não esquecimento:
 *
 *   erro       — vermelho que muda de cor deixa de ser reconhecido como erro
 *   coresMacro — os três precisam continuar distinguíveis ENTRE SI, inclusive
 *                para quem enxerga pouco contraste; derivá-los de um acento só
 *                os transformaria em três tons da mesma cor
 *
 * As duas garantias que sustentam o resto estão em lib/cor.ts e foram
 * verificadas nos 360 matizes: texto branco se lê sobre o preenchimento, e o
 * traço se lê sobre o fundo. */
function comAcento(base: Paleta, acento: string): Paleta {
  /* Preenchimento: escurecido até o branco se ler por cima. `cores.branco` é o
     texto sobre superfície colorida em dezenas de lugares — e em uns poucos ele
     é branco de verdade, então quem cede é a cor, não o texto. */
  const verde = preenchimentoParaTextoBranco(acento)

  /* Traço: clareado ou escurecido até aparecer sobre o fundo DESTA base. A mesma
     cor vira tons diferentes no claro e no escuro, e é isso que faz o acento
     funcionar nos dois. */
  const limao = ajustadaPara(acento, base.cores.fundo)

  return {
    ...base,
    cores: {
      ...base.cores,
      verde,
      verdeEscuro: comClaridade(verde, -8),
      limao,
      limaoEscuro: comClaridade(limao, base === CLARO ? -8 : -12),
      sobreLimao: textoSobre(limao),
      verdeClaro: comAlfa(limao, base === CLARO ? 0.14 : 0.16),
      verdeMenta: comAlfa(verde, base === CLARO ? 0.09 : 0.1),
    },
    degrades: { destaque: [verde, comClaridade(verde, -8)] },
  }
}

/* O claro é o padrão: é a cara da marca, e é com ela que o app abre para quem
   nunca escolheu nada. */
let temaAtual: Tema = 'claro'
/* Null é "a cor da marca" — o verde que o app sempre teve. Não é ausência de
   escolha: é a escolha padrão, e ela precisa poder ser retomada. */
let acentoAtual: string | null = null
let paletaAtual: Paleta = CLARO

export const tema = (): Tema => temaAtual
export const acento = (): string | null => acentoAtual
export const paleta = (): Paleta => paletaAtual

/* A cor do acento como ela é HOJE na tela — a escolhida, ou a da marca quando
   não há escolha. É o que o seletor mostra como "atual". */
export const acentoEfetivo = (): string => acentoAtual ?? BASES[temaAtual].cores.verde

function recalcular(): void {
  const base = BASES[temaAtual]
  paletaAtual = acentoAtual ? comAcento(base, acentoAtual) : base
}

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
    const [guardado, cor] = await Promise.all([
      AsyncStorage.getItem(CHAVE),
      AsyncStorage.getItem(CHAVE_ACENTO),
    ])
    if (guardado === 'claro' || guardado === 'escuro') temaAtual = guardado
    /* Só entra se for hexadecimal de verdade: o armazenamento é do aparelho e
       um valor torto ali não pode virar tela sem cor. */
    if (cor && /^#[0-9a-fA-F]{6}$/.test(cor)) acentoAtual = cor
    recalcular()
  } catch {
    /* Fica o padrão. */
  }
}

/* Volta o acento para o verde da marca. */
export async function limparAcento(): Promise<void> {
  if (acentoAtual === null) return
  acentoAtual = null
  recalcular()
  aoTrocar?.()
  try {
    await AsyncStorage.removeItem(CHAVE_ACENTO)
  } catch {
    /* Ver o comentário de trocarTema. */
  }
}

export async function trocarAcento(cor: string): Promise<void> {
  if (cor === acentoAtual) return
  acentoAtual = cor
  recalcular()
  aoTrocar?.()
  try {
    await AsyncStorage.setItem(CHAVE_ACENTO, cor)
  } catch {
    /* Ver o comentário de trocarTema. */
  }
}

export async function trocarTema(novo: Tema): Promise<void> {
  if (novo === temaAtual) return

  temaAtual = novo
  recalcular()
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
