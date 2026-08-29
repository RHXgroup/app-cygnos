/* Contas de cor, para o app poder aceitar qualquer cor que a pessoa escolher.
 *
 * ── Por que isto existe ────────────────────────────────────────────────────
 * Deixar alguém escolher a cor de destaque tem um problema conhecido: amarelo
 * claro com texto branco por cima não se lê. A saída fácil é proibir as cores
 * ruins — e ela é ruim, porque a pessoa escolhe, o app recusa, e ela fica sem
 * entender o que fez de errado.
 *
 * A saída daqui é outra: o app ACEITA a cor e calcula o resto. O texto que vai
 * por cima é preto ou branco conforme o contraste, e os tons de apoio saem da
 * própria cor. Nenhuma escolha produz tela ilegível, e nenhuma escolha é
 * recusada.
 *
 * ── A régua ────────────────────────────────────────────────────────────────
 * Contraste relativo da WCAG. 4,5:1 é o mínimo para texto normal, 3:1 para
 * texto grande e para elemento gráfico. As funções aqui devolvem o número e
 * deixam quem chama decidir — só `textoSobre` decide sozinha, porque ali a
 * resposta é binária e não tem meio-termo útil. */

export type HSL = { h: number; s: number; l: number }

const limitar = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max)

/* '#2BE07C' → [43, 224, 124]. Aceita a forma curta ('#2B7') porque é a que
   alguém digita à mão. Cor ilegível devolve preto, e não estoura: a tela nunca
   deve quebrar por causa de um texto torto vindo do armazenamento. */
export function rgbDe(hex: string): [number, number, number] {
  const limpo = hex.replace('#', '').trim()

  const cheio =
    limpo.length === 3
      ? limpo
          .split('')
          .map(c => c + c)
          .join('')
      : limpo

  if (!/^[0-9a-fA-F]{6}$/.test(cheio)) return [0, 0, 0]

  return [
    parseInt(cheio.slice(0, 2), 16),
    parseInt(cheio.slice(2, 4), 16),
    parseInt(cheio.slice(4, 6), 16),
  ]
}

const doisDigitos = (n: number) => Math.round(limitar(n, 0, 255)).toString(16).padStart(2, '0')

export const hexDe = (r: number, g: number, b: number) =>
  `#${doisDigitos(r)}${doisDigitos(g)}${doisDigitos(b)}`.toUpperCase()

/* ── HSL ────────────────────────────────────────────────────────────────────
 * O matiz é o que a pessoa escolhe no seletor; saturação e claridade são o que
 * o app mexe para derivar os tons de apoio. Fazer isso em RGB daria cores
 * sujas — clarear em RGB lava a cor, clarear em HSL mantém o matiz. */

export function hslDe(hex: string): HSL {
  const [r255, g255, b255] = rgbDe(hex)
  const r = r255 / 255
  const g = g255 / 255
  const b = b255 / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  if (max === min) return { h: 0, s: 0, l: l * 100 }

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6

  return { h: h * 360, s: s * 100, l: l * 100 }
}

export function hexDeHsl({ h, s, l }: HSL): string {
  const hh = ((h % 360) + 360) % 360 / 360
  const ss = limitar(s, 0, 100) / 100
  const ll = limitar(l, 0, 100) / 100

  if (ss === 0) {
    const v = ll * 255
    return hexDe(v, v, v)
  }

  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss
  const p = 2 * ll - q

  const canal = (t: number) => {
    let x = t
    if (x < 0) x += 1
    if (x > 1) x -= 1
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }

  return hexDe(canal(hh + 1 / 3) * 255, canal(hh) * 255, canal(hh - 1 / 3) * 255)
}

/* Move a claridade sem mexer no matiz. Positivo clareia, negativo escurece. */
export const comClaridade = (hex: string, delta: number): string => {
  const c = hslDe(hex)
  return hexDeHsl({ ...c, l: limitar(c.l + delta, 0, 100) })
}

/* ── Contraste ──────────────────────────────────────────────────────────────*/

/* Luminância relativa da WCAG. O ajuste em rampa existe porque o olho não vê
   luz linearmente: 50% de verde não parece metade do branco. */
export function luminancia(hex: string): number {
  const canal = (v: number) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  }

  const [r, g, b] = rgbDe(hex)
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
}

/* De 1 (idênticas) a 21 (preto contra branco). */
export function contraste(a: string, b: string): number {
  const la = luminancia(a)
  const lb = luminancia(b)
  const claro = Math.max(la, lb)
  const escuro = Math.min(la, lb)
  return (claro + 0.05) / (escuro + 0.05)
}

/* O quase-preto oliva do tema escuro. É ele que o texto usa por cima de
   superfície colorida, para um botão não parecer de outro aplicativo. */
const PRETO_DA_MARCA = '#0C1207'
const PRETO_PURO = '#000000'
const BRANCO = '#FFFFFF'

/* O mínimo da WCAG para texto normal. */
const MINIMO_TEXTO = 4.5

/* Que cor de texto vai por cima desta.
 *
 * É esta função que torna o seletor livre possível: qualquer cor que a pessoa
 * escolher recebe por cima o texto que se lê melhor sobre ela. Amarelo ganha
 * texto escuro, roxo ganha branco, e ninguém precisa saber disso.
 *
 * O preto da marca vem primeiro, e o preto puro é a reserva. Ele custa um fio
 * de contraste por ser oliva, e nos verdes-amarelados esse fio era a diferença
 * entre 4,36:1 e passar — encontrado varrendo os 360 matizes, não no olho.
 * Cair no preto puro nesse punhado de casos é melhor do que abrir mão do
 * mínimo legível em todos. */
export function textoSobre(fundo: string): string {
  const daMarca = contraste(fundo, PRETO_DA_MARCA)
  const puro = contraste(fundo, PRETO_PURO)
  const branco = contraste(fundo, BRANCO)

  const melhorEscuro = daMarca >= MINIMO_TEXTO || daMarca >= puro ? PRETO_DA_MARCA : PRETO_PURO
  const escuro = Math.max(daMarca, contraste(fundo, melhorEscuro))

  return escuro >= branco ? melhorEscuro : BRANCO
}

/* A cor serve como TRAÇO sobre este fundo?
 *
 * Traço é anel de progresso, aba ativa, número em destaque: elemento gráfico,
 * e a régua da WCAG para isso é 3:1. Quando não serve, quem chama corrige a
 * claridade em vez de recusar a escolha — ver `ajustadaPara`. */
export const serveComoTraco = (cor: string, fundo: string) => contraste(cor, fundo) >= 3

/* A mesma cor, clareada ou escurecida até dar para ver sobre o fundo.
 *
 * Anda de dois em dois pontos de claridade, para o lado que aumenta o
 * contraste, até passar de 3:1 ou acabar a escala. O matiz nunca muda: a pessoa
 * escolheu roxo e continua recebendo roxo, só que um roxo que aparece.
 *
 * O limite de 60 voltas é a escala inteira (0 a 100, de dois em dois, com
 * folga) — está aqui para o laço não depender do acaso da conta de contraste. */
export function ajustadaPara(cor: string, fundo: string): string {
  if (serveComoTraco(cor, fundo)) return cor

  const fundoEhClaro = luminancia(fundo) > 0.5
  const passo = fundoEhClaro ? -2 : 2

  let atual = cor
  for (let i = 0; i < 60; i++) {
    const proxima = comClaridade(atual, passo)
    if (proxima === atual) break /* bateu no topo ou no fundo da escala */
    atual = proxima
    if (serveComoTraco(atual, fundo)) return atual
  }

  /* Não deu nem no extremo: devolve o que mais contrasta com o fundo, que é
     sempre legível mesmo perdendo o matiz. Acontece só com fundo cinza-médio,
     que nenhum dos dois temas usa. */
  return fundoEhClaro ? PRETO_DA_MARCA : BRANCO
}

/* A mesma cor, escurecida até o texto BRANCO se ler sobre ela.
 *
 * Existe por causa de uma restrição do app, não da WCAG: `cores.branco` é o
 * texto que vai por cima de superfície preenchida, e ele é usado assim em
 * dezenas de lugares. Trocá-lo por uma cor calculada quebraria os poucos lugares
 * em que ele é branco de verdade — o fundo atrás das logos das nutricionistas,
 * por exemplo.
 *
 * Então quem cede é o preenchimento: amarelo-claro escolhido pela pessoa vira um
 * amarelo escuro, e continua amarelo. O matiz é dela; a legibilidade é do app. */
export function preenchimentoParaTextoBranco(cor: string): string {
  let atual = cor
  for (let i = 0; i < 60; i++) {
    if (contraste(atual, BRANCO) >= MINIMO_TEXTO) return atual
    const proxima = comClaridade(atual, -2)
    if (proxima === atual) break
    atual = proxima
  }
  return atual
}

/* A mesma cor com transparência, para os realces de fundo. Alpha, e não um tom
   chapado, porque o realce precisa funcionar por cima do cartão E da superfície
   elevada — dois fundos diferentes, um valor só. */
export function comAlfa(hex: string, alfa: number): string {
  const [r, g, b] = rgbDe(hex)
  return `rgba(${r},${g},${b},${limitar(alfa, 0, 1)})`
}
