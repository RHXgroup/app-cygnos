/* Ler uma refeição escrita em português corrido.
 *
 * "2 fatias de pão integral, 1 xícara de café e 200g de arroz" vira três itens
 * com quantidade, medida e nome — que a busca de alimentos resolve em seguida.
 *
 * ── Por que aqui, e não numa IA ────────────────────────────────────────────
 * Porque isto funciona hoje, sem servidor, sem custo por chamada e sem
 * conexão: é uma gramática pequena e previsível, e a pessoa vê o resultado
 * enquanto digita. A IA entra depois, para o que esta gramática não alcança —
 * "um prato de comida caseira", "um pão na chapa com café" —, e vai encontrar
 * este código pronto para receber o que ela devolver, no mesmo formato.
 *
 * ── O que ele NÃO tenta fazer ──────────────────────────────────────────────
 * Adivinhar alimento. Ele separa e estrutura; quem diz se "pão integral" existe
 * é a base de alimentos. Um interpretador que chuta o alimento erra calado, e
 * um erro calado num diário alimentar vira número errado que ninguém questiona. */

export type ItemLido = {
  /* O texto original deste pedaço, para a tela poder mostrar o que foi entendido
     de onde. */
  original: string
  quantidade: number
  /* "fatia", "unidade", "g", "ml"… Normalizada no singular. */
  medida: string
  /* O que sobrou depois de tirar quantidade e medida: o nome a procurar. */
  nome: string
  /* Verdadeiro quando a quantidade veio em peso ou volume direto — "200 g",
     "300 ml" —, e não em medida caseira. A tela usa para pular a pergunta do
     peso, que nesse caso já foi respondida. */
  emPeso: boolean
}

/* As medidas que a gramática reconhece, e o singular de cada uma. A chave é o
   que se escreve; o valor é como o app chama. */
const MEDIDAS: Record<string, string> = {
  g: 'g',
  grama: 'g',
  gramas: 'g',
  kg: 'kg',
  quilo: 'kg',
  quilos: 'kg',
  ml: 'ml',
  mls: 'ml',
  litro: 'litro',
  litros: 'litro',
  l: 'litro',
  unidade: 'unidade',
  unidades: 'unidade',
  un: 'unidade',
  fatia: 'fatia',
  fatias: 'fatia',
  colher: 'colher de sopa',
  colheres: 'colher de sopa',
  xicara: 'xícara',
  xicaras: 'xícara',
  copo: 'copo',
  copos: 'copo',
  pedaco: 'pedaço',
  pedacos: 'pedaço',
  concha: 'concha',
  conchas: 'concha',
  filé: 'unidade',
  file: 'unidade',
  files: 'unidade',
}

/* Palavras que só ligam as partes da frase e não dizem nada sobre o alimento.
   Saem do nome para a busca não procurar por "de pão". */
const LIGACOES = new Set(['de', 'do', 'da', 'dos', 'das', 'com', 'e'])

/* "meia", "meio" e "um" aparecem mais que os números na fala de comida. */
const NUMEROS_ESCRITOS: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  meio: 0.5,
  meia: 0.5,
}

const semAcento = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/* Onde uma linha termina e outra começa. Vírgula, ponto e vírgula, quebra de
   linha e " e " separam itens; o " e " precisa dos espaços para não partir
   "melancia" ao meio. */
export function separarItens(texto: string): string[] {
  return texto
    .split(/[,;\n]+|\s+e\s+/gi)
    .map(p => p.trim())
    .filter(p => p.length > 0)
}

/* Quantidade e medida grudadas ("200g") ou separadas ("200 g"). O número aceita
   vírgula decimal, que é como se escreve em português. */
const PADRAO_NUMERO = /^(\d+(?:[.,]\d+)?)\s*([a-zA-ZçáéíóúâêôãõÁÉÍÓÚÂÊÔÃÕÇ]*)/

export function lerItem(pedaco: string): ItemLido | null {
  const limpo = pedaco.trim().replace(/\s+/g, ' ')
  if (!limpo) return null

  let resto = limpo
  let quantidade = 1
  let medida = 'unidade'
  let achouQuantidade = false

  /* 1. Um número no começo? "200g de arroz", "2 fatias de pão". */
  const m = limpo.match(PADRAO_NUMERO)
  if (m) {
    quantidade = Number(m[1].replace(',', '.'))
    achouQuantidade = true
    resto = limpo.slice(m[0].length).trim()

    /* A palavra colada ou logo depois do número pode ser a medida. */
    const candidata = semAcento(m[2] || '')
    if (candidata && MEDIDAS[candidata]) {
      medida = MEDIDAS[candidata]
    } else if (m[2]) {
      /* Não era medida: faz parte do nome. "2 ovos" cai aqui. */
      resto = `${m[2]} ${resto}`.trim()
    }
  } else {
    /* 2. Número escrito? "duas fatias de pão", "meia xícara de arroz". */
    const palavras = limpo.split(' ')
    const primeira = semAcento(palavras[0])
    if (NUMEROS_ESCRITOS[primeira] !== undefined) {
      quantidade = NUMEROS_ESCRITOS[primeira]
      achouQuantidade = true
      resto = palavras.slice(1).join(' ')
    }
  }

  /* 3. A medida pode estar na próxima palavra: em "2 fatias de pão" o passo 1
        consumiu só o número, e "fatias" está aqui. */
  const palavras = resto.split(' ').filter(Boolean)
  if (palavras.length > 0) {
    const primeira = semAcento(palavras[0])
    if (MEDIDAS[primeira]) {
      medida = MEDIDAS[primeira]
      palavras.shift()
    }
  }

  /* 4. "colher de sopa" e "colher de chá": a qualificação vem DEPOIS da palavra
   *    "colher" e muda a medida. Uma colher de chá de açúcar tem um terço de
   *    uma de sopa, e confundir as duas erra a conta por 200%.
   *
   *    Aqui fora dos dois passos acima de propósito: a palavra "colher" pode ter
   *    sido consumida no passo 1, quando vem grudada no número ("1 colher"), ou
   *    no passo 3, quando vem solta ("uma colher"). Dentro de um deles, o outro
   *    caminho ficava sem o refinamento — e era o caso mais comum, porque quase
   *    todo mundo escreve o número em algarismo. */
  if (medida === 'colher de sopa') {
    const dois = palavras.slice(0, 2).map(semAcento).join(' ')
    if (dois === 'de cha') {
      medida = 'colher de chá'
      palavras.splice(0, 2)
    } else if (dois === 'de sopa') {
      palavras.splice(0, 2)
    }
  }

  /* 5. O que sobrou, sem as palavras de ligação do começo, é o nome. */
  while (palavras.length > 0 && LIGACOES.has(semAcento(palavras[0]))) palavras.shift()

  const nome = palavras.join(' ').trim()
  if (!nome) return null

  const emPeso = medida === 'g' || medida === 'kg' || medida === 'ml' || medida === 'litro'

  return {
    original: limpo,
    /* Sem número escrito, "pão integral" é um pão integral. Um é o palpite
       menos arriscado: erra por pouco e a pessoa corrige num toque. */
    quantidade: achouQuantidade ? quantidade : 1,
    medida,
    nome,
    emPeso,
  }
}

export function lerRefeicao(texto: string): ItemLido[] {
  return separarItens(texto)
    .map(lerItem)
    .filter((i): i is ItemLido => i !== null)
}

/* Quantos gramas isto representa, quando dá para saber.
 *
 * Só o peso e o volume respondem: "2 fatias" depende de qual pão, e chutar o
 * peso de uma fatia seria inventar um número que entra na soma do dia como se
 * fosse medido. Quilo e litro viram grama e mililitro porque a base guarda
 * tudo por 100 g. */
export function gramasDe(item: ItemLido): number | null {
  if (!item.emPeso) return null
  if (item.medida === 'kg') return item.quantidade * 1000
  if (item.medida === 'litro') return item.quantidade * 1000
  /* ml vira grama pela densidade da água — aproximação, e a mesma que a tela de
     busca já assume. */
  return item.quantidade
}

/* Como o item lido é descrito no plano: "2 fatias", "200 g". É o texto que a
   pessoa vê depois, então segue a forma em que ela falou. */
export function descricaoDe(item: ItemLido): string {
  const n = Number.isInteger(item.quantidade)
    ? String(item.quantidade)
    : String(item.quantidade).replace('.', ',')

  if (item.medida === 'g' || item.medida === 'kg' || item.medida === 'ml') {
    return `${n} ${item.medida}`
  }

  const plural =
    item.quantidade === 1
      ? item.medida
      : item.medida.startsWith('colher')
        ? item.medida.replace('colher', 'colheres')
        : `${item.medida}s`

  return `${n} ${plural}`
}
