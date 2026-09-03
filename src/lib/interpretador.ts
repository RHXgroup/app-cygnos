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

import { semAcento } from './texto.ts'

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
/* `Object.create(null)` e não `{}`, e isto veio de bug achado sondando entrada
   hostil: um objeto literal HERDA `constructor`, `valueOf`, `toString` e mais
   meia dúzia. Se a chave vem de fora — do JSON de uma IA, do que a pessoa
   digitou —, `MAPA['constructor']` devolve a função construtora, e o teste
   `=== undefined` não pega, porque função não é undefined.

   O efeito medido: um dia de treino virava uma FUNÇÃO, e ia assim para o
   banco. Sem protótipo, a busca só encontra o que foi escrito aqui. */
const MEDIDAS: Record<string, string> = Object.assign(Object.create(null), {
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
})

/* Palavras que só ligam as partes da frase e não dizem nada sobre o alimento.
   Saem do nome para a busca não procurar por "de pão". */
const LIGACOES = new Set(['de', 'do', 'da', 'dos', 'das', 'com', 'e'])

/* "meia", "meio" e "um" aparecem mais que os números na fala de comida. */
const NUMEROS_ESCRITOS: Record<string, number> = Object.assign(Object.create(null), {
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
})

/* Uma cópia só, em `texto.ts`. Esta e a de `pesoDoItem` já tinham divergido —
   uma aparava os espaços das pontas, a outra não — que é a previsão exata do
   item 5 do AGENTS.md. */

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

/* Pontuação de fim de frase, colada no nome.
 *
 * Quem DIGITA raramente escreve "um copo de iogurte." — quem DITA sempre, porque
 * o transcritor pontua a frase. E aí a busca procura por `iogurte.` na base,
 * não acha, e o item cai fora do registro com a mensagem "não achei iogurte. na
 * base" — com o ponto à mostra, o que faz a pessoa achar que o app não sabe
 * escrever.
 *
 * Só nas pontas: um ponto no MEIO pode ser separador de milhar, e tirá-lo ali
 * mudaria a quantidade. */
const semPontuacaoNasPontas = (s: string) => s.replace(/^[\s.,;:!?]+|[\s.,;:!?]+$/g, '')

/* O que é FALA e não é alimento.
 *
 * Quem digita escreve "arroz, feijão, bife". Quem DITA fala: "na janta eu comi
 * bastante carne de churrasco, arroz e mandioca". A gramática recebia tudo
 * isso como nome de alimento e ia procurar "na janta eu comi bastante carne de
 * churrasco" na base — que obviamente não acha.
 *
 * Três famílias, e cada uma veio de um caso real de ditado:
 *
 *   · NOME DA REFEIÇÃO  "na janta", "no almoço", "de manhã" — a pessoa está
 *     dizendo QUANDO comeu, e a tela já sabe disso: ela abriu a refeição.
 *   · VERBO DE COMER    "eu comi", "tomei", "bebi", "comi bastante" — em
 *     português falado a frase começa pelo verbo, sempre.
 *   · ADVÉRBIO DE VAGO  "bastante", "um pouco de", "mais ou menos", "tipo".
 *     Estes são os mais perigosos, porque parecem quantidade e não são: virar
 *     "bastante" em 2 ou em 200 g seria inventar um número que entra na soma
 *     do dia. Saem, e a pessoa ajusta a quantidade na tela, onde ela vê.
 *
 * Tudo isso só é tirado do COMEÇO do pedaço. "Carne de sol" tem "de sol" no
 * meio e não pode perder nada; "bolo de pote" idem. */
const FALA = new RegExp(
  '^(?:' +
    [
      /* pronome e conector soltos */
      'eu', 'a gente', 'nois', 'n[oó]s', 'ent[aã]o', 'ai', 'a[ií]', 'da[ií]', 'tipo( assim)?',
      'acho que', 'foi', 'hoje', 'ontem', 'agora',
      /* quando */
      '(n[oa]|de|pel[oa]|no|na) ?(caf[eé] da manh[aã]|manh[aã]|almo[cç]o|janta|jantar|lanche|ceia|tarde|noite|madrugada)',
      'caf[eé] da manh[aã]', 'almo[cç]o', 'janta', 'jantar', 'lanche( da tarde)?', 'ceia',
      /* ── INTENÇÃO, e não só passado ────────────────────────────────────
         A lista tinha "comi", "tomei", "jantei" — tudo passado. Mas metade do
         uso é ANTES de comer: quem abre a tela para planejar o jantar escreve
         "vou comer duas fatias de pão".

         O efeito era estranho de diagnosticar porque só metade falhava: "e
         tomar uma xícara de café" perdia o "tomar" e achava o café, enquanto
         "vou comer duas fatias de pão com manteiga" ia INTEIRA para a busca,
         como se fosse o nome de um alimento. A pessoa via um item certo ao
         lado de uma frase inteira marcada como "não achei", e concluiu, com
         razão, que o app não estava interpretando nada.

         `vou`, `quero` e companhia entram sozinhos: o laço de `tirarFala`
         descasca camada por camada, então "vou" sai numa volta e "comer" na
         seguinte. */
      'vou', 'vamos', 'quero', 'queria', 'pretendo', 'planejo', 'devo', 'irei',
      'estou pensando em', 'penso em', 'to( indo)? (comer|tomar)', 'vou querer',
      /* verbo de comer e beber, em todas as formas que aparecem falando */
      'com[ií]', 'comer', 'comemos', 'comia', 'tom[ei]i?', 'tomar', 'tomei', 'beb[ií]',
      'beber', 'ingeri', 'consumi', 'almocei', 'jantei', 'lanchei', 'merendei',
      'me alimentei( de| com)?', 'peguei', 'fiz',
      /* quanto, mas sem dizer quanto */
      'bastante', 'muit[oa]s?', 'bem', 'pouc[oa]', 'um pouco( de)?', 'uns?', 'um[a]?s',
            /* `meio` e `meia` ficaram DE FORA de propósito. Parecem vaguidão mas
         carregam quantidade — "meia banana" é metade de uma — e ainda abrem
         nome de comida: "meia lua" é salgado, "meia cura" é queijo. */
      'mais ou menos', 'umas', 'alguns?', 'algumas?',
      /* preposição que sobra depois de tirar o resto */
      'de', 'do', 'da', 'dos', 'das', 'com', 'em', 'no', 'na', 'pra', 'para',
    ].join('|') +
    /* `(?![a-zà-ÿ])` e não `\b`. O `\b` do JavaScript é ASCII: entre "ã" e um
       espaço ele NÃO enxerga fronteira, porque "ã" não é `\w`. Com ele, "de
       manhã tomei café" perdia só o "de" e sobrava "manhã tomei café" — e o
       mesmo com "aí". Em português isso não é caso raro, é a metade das
       palavras. */
    ')(?![a-zà-ÿ])[\\s,]*',
  'i',
)

/* Descasca a fala até sobrar o alimento.
 *
 * Em laço porque as camadas se empilham: "então eu comi bastante arroz" tem
 * quatro. E com teto e guarda de parada — se descascar tudo, o pedaço vira
 * vazio e o item some, e é melhor procurar um nome torto do que perder o que a
 * pessoa disse. */
export function tirarFala(texto: string): string {
  let s = texto.trim()
  for (let i = 0; i < 8; i++) {
    const menor = s.replace(FALA, '').trim()
    /* Sobrou nada: a última camada era o alimento inteiro ("comi" sozinho não
       é comida, mas "meia" pode ser o começo de "meia porção"). Volta. */
    if (!menor) return s
    if (menor === s) return s
    s = menor
  }
  return s
}

export function lerItem(pedaco: string): ItemLido | null {
  const limpo = tirarFala(semPontuacaoNasPontas(pedaco.trim().replace(/\s+/g, ' ')))
  if (!limpo) return null

  let resto = limpo
  let quantidade = 1
  let medida = 'unidade'
  let achouQuantidade = false

  /* 1. Um número no começo? "200g de arroz", "2 fatias de pão". */
  const m = limpo.match(PADRAO_NUMERO)
  if (m) {
    const lido = Number(m[1].replace(',', '.'))
    /* Um teto, e ele veio de sonda com entrada hostil: "999999999999999999999 g
       de pão" virava 1e21 gramas, e esse número atravessava a conta do dia
       inteira sem nada estranho aparecer — a caloria do dia ficava em notação
       científica na tela.
       Dez mil cobre qualquer coisa que caiba num prato: 10 kg em gramas. Acima
       disso não é quantidade, é dedo preso na tecla — e aí o número vira parte
       do NOME, que é onde a pessoa vê e corrige. */
    quantidade = Number.isFinite(lido) && lido > 0 && lido <= 10000 ? lido : 1
    achouQuantidade = Number.isFinite(lido) && lido > 0 && lido <= 10000
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

  /* De novo nas pontas: tirar a quantidade e a medida do começo pode deixar
     pontuação exposta no fim do que sobrou. */
  const nome = semPontuacaoNasPontas(palavras.join(' ').trim())
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
