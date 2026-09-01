/* A escada de aceitação alimentar — o que ela significa, sem o aparelho.
 *
 * ── De onde isto vem ───────────────────────────────────────────────────────
 * NÃO é modelo novo. O sistema da nutricionista já grava isto em
 * `registros_exposicao.aceitacao`, com os passos numerados em
 * `passos_alcancados`. Aqui mora só o que o APP precisa decidir para
 * desenhar. Ver docs/planejamento-terapeutico.md.
 *
 * Os sete campos booleanos daquela tabela — `visualizou` … `engoliu` — são
 * LEGADO, e não o modelo vivo. Mapear por eles seria escrever contra a parte
 * do sistema que está sendo aposentada.
 *
 * ── Três públicos, três vocabulários ───────────────────────────────────────
 * O mesmo degrau é dito de três jeitos, e misturá-los estraga os três:
 *
 *   `chave`     o que vai ao banco. Nunca aparece na tela.
 *   `paraMae`   o que a mãe toca, com a CENA embaixo ("virou o rosto"). Ela
 *               reconhece o que viu, em vez de traduzir um rótulo clínico.
 *   `paraFilho` o que a criança lê quando a mãe vira o celular. Primeira
 *               pessoa, presente, e sem juízo nenhum.
 *
 * ── A regra que atravessa tudo ─────────────────────────────────────────────
 * Recusar é o degrau 1, não o oposto de progresso. A evidência é dura nisto:
 * exposição acompanhada de emoção negativa REFORÇA a rejeição. Então nada aqui
 * pode devolver derrota — nem cor, nem palavra, nem contagem. Quem faz a
 * criança se sentir mal produz pressão, e pressão produz mais recusa.
 *
 * Sem import de runtime, de propósito: é o que permite exercitar no Node. */

export type ChaveDegrau =
  | 'recusou'
  | 'tolerar'
  | 'interagir'
  | 'cheirar'
  | 'tocar'
  | 'provar'
  | 'comer'

export type Degrau = {
  chave: ChaveDegrau
  /* 1 a 7. É o que o desenho usa para altura, e o que compara dois registros. */
  altura: number
  paraMae: string
  /* A cena, para a mãe reconhecer sem interpretar. */
  cena: string
  paraFilho: string
  /* Qual sentido entra neste degrau. O ícone sai daqui, e não de um número:
     chegar perto → mexer → cheirar → tocar → provar → comer é a ordem real da
     aproximação, e é o que uma criança de cinco anos lê sozinha.
   *
   * A recusa NÃO é um sentido, e por isso tem valor próprio. A primeira versão
   * deste arquivo deu 'olhar' à recusa, o que confundia dois estados
   * diferentes: recusar é o nível ZERO da Escalada — a criança não fez nada —,
   * enquanto ver o alimento e suportá-lo por perto já é Tolerar. Tratar os dois
   * como o mesmo degrau infla o progresso de quem só recusou.
   *
   * E o valor chama-se `virouORosto`, e não `recusa`, DE PROPÓSITO. Quando ele
   * se chamava `recusa`, alguém revisando confundiu-o com a `chave` — que é
   * `'recusou'` e vai ao banco — e apontou uma divergência de grafia que não
   * existia. O alarme foi falso, mas o convite ao erro era real: dois campos
   * parecidos lado a lado, um que o banco lê e outro que não. Um nome que
   * nenhuma coluna teria desfaz a confusão sem precisar de comentário. */
  sentido: 'virouORosto' | 'perto' | 'mao' | 'cheiro' | 'toque' | 'boca' | 'bocaCheia'
}

/* ── A correspondência com a Escalada Alimentar do sistema ─────────────────
 *
 * O que a nutricionista usa é a Escalada Alimentar (SOS Approach, de Kay
 * Toomey; tradução da Fga. Dra. Sabrina Fontanesi): SEIS categorias mais a
 * recusa, com 32 passos numerados dentro delas.
 *
 *   Recusou   (0)      não fez nada
 *   Tolerar   (1–5)    suporta a presença por perto
 *   Interagir (6–9)    mexe, ajuda a preparar ou servir
 *   Cheirar   (10–13)
 *   Tocar     (14–24)  da ponta do dedo até levar aos lábios
 *   Provar    (25–31)  lambe ou morde, mas NÃO engole
 *   Comer     (32)     engole — o único que conta como consumo
 *
 * Os sete degraus daqui são essas seis categorias mais o piso da recusa, na
 * mesma ordem — inclusive `interagir` ANTES de `cheirar`, que surpreende quem
 * supõe uma ordem sensorial pura.
 *
 * ── E de casa vem a CATEGORIA, nunca o passo ──────────────────────────────
 * `Tocar` tem onze passos e `Provar` tem sete. A mãe não vai distinguir o passo
 * 22 do 23 no fim de uma refeição, e obrigá-la a isso produziria número
 * inventado. Então daqui sai `aceitacao` sempre e `passos_alcancados` vazio; a
 * nutricionista crava o passo exato na consulta, se precisar.
 *
 * A consequência para a tela: **nunca escrever "passo 22"** a partir de um
 * registro feito em casa. O que se mostra é a categoria — "chegou em Tocar". */

export const DEGRAUS: Degrau[] = [
  {
    chave: 'recusou',
    altura: 1,
    paraMae: 'Não quis agora',
    cena: 'Virou o rosto, empurrou o prato',
    paraFilho: 'Hoje não deu vontade',
    sentido: 'virouORosto',
  },
  {
    chave: 'tolerar',
    altura: 2,
    paraMae: 'Deixou ficar perto',
    cena: 'Aceitou o prato na mesa, sem reclamar',
    paraFilho: 'Deixei ficar do meu lado',
    sentido: 'perto',
  },
  {
    chave: 'interagir',
    altura: 3,
    paraMae: 'Mexeu, brincou',
    cena: 'Empurrou com o garfo, misturou, cutucou',
    paraFilho: 'Mexi com o garfo',
    sentido: 'mao',
  },
  {
    chave: 'cheirar',
    altura: 4,
    paraMae: 'Chegou o nariz',
    cena: 'Cheirou, mesmo de longe',
    paraFilho: 'Cheirei pra ver como era',
    sentido: 'cheiro',
  },
  {
    chave: 'tocar',
    altura: 5,
    paraMae: 'Pegou na mão',
    cena: 'Encostou o dedo, segurou',
    paraFilho: 'Peguei na mão',
    sentido: 'toque',
  },
  {
    chave: 'provar',
    altura: 6,
    paraMae: 'Encostou na boca',
    cena: 'Lambeu, mordeu — mesmo que tenha cuspido depois',
    paraFilho: 'Encostei na boca',
    sentido: 'boca',
  },
  {
    chave: 'comer',
    altura: 7,
    paraMae: 'Comeu',
    cena: 'Mastigou e engoliu',
    paraFilho: 'Comi!',
    sentido: 'bocaCheia',
  },
]

/* Nunca o índice cru quando o valor veio do BANCO — armadilha 10 do AGENTS.md.
 *
 * `registros_exposicao.aceitacao` tem valores LEGADOS de antes de a escada
 * completa existir: 'aceitou', 'tolerou', 'provou', 'interacao_parcial'. Eles
 * continuam gravados, e uma tela que indexasse direto morreria ao abrir o
 * histórico de um paciente antigo.
 *
 * O mapeamento é conservador de propósito: na dúvida, o degrau MAIS BAIXO
 * compatível. Inflar o degrau de alguém é pior que não saber — a nutricionista
 * decide conduta a partir disto, e "ele já come" quando ele só provou muda o
 * que ela faz na consulta. */
const LEGADO: Record<string, ChaveDegrau> = {
  aceitou: 'comer',
  tolerou: 'tolerar',
  provou: 'provar',
  interacao_parcial: 'interagir',
}

export function degrauDe(valor: string | null | undefined): Degrau | null {
  if (!valor) return null
  const direto = DEGRAUS.find(d => d.chave === valor)
  if (direto) return direto
  const antigo = LEGADO[valor]
  return antigo ? (DEGRAUS.find(d => d.chave === antigo) ?? null) : null
}

/* ── A reação, e por que são TRÊS e não quatro ─────────────────────────────
 *
 * O banco guarda quatro: positiva, neutra, negativa, agitada. A tela oferece
 * três, juntando negativa e agitada em "foi difícil".
 *
 * O motivo é de uso, não de clínica: quanto mais fina a escala, mais a mãe
 * hesita — e ela está respondendo em pé, no fim de uma refeição, com criança
 * para tirar da cadeira. Hesitação vira campo em branco, e campo em branco vale
 * menos que uma distinção grossa.
 *
 * Se a nutricionista precisar separar agitação de recusa tranquila, ela separa
 * na consulta, olhando a observação. A distinção que NÃO pode se perder é a que
 * alimenta o alerta dela — duas negativas nas últimas três —, e essa sobrevive:
 * 'dificil' entra como 'negativa'. */
export type ChaveReacao = 'tranquilo' | 'indiferente' | 'dificil'

export type Reacao = { chave: ChaveReacao; paraMae: string; noBanco: string }

export const REACOES: Reacao[] = [
  { chave: 'tranquilo', paraMae: 'Tranquilo', noBanco: 'positiva' },
  { chave: 'indiferente', paraMae: 'Indiferente', noBanco: 'neutra' },
    /* "Foi difícil PRA ELE", e não "foi difícil" seco.
   *
   * O rótulo curto era ambíguo: lido no fim de uma refeição ruim, "foi
   * difícil" se responde sobre a NOITE da mãe, e não sobre a criança. O campo
   * é a reação dela — misturar os dois envenena o alerta, que passa a disparar
   * pelo cansaço de quem registra. */
  { chave: 'dificil', paraMae: 'Foi difícil pra ele', noBanco: 'negativa' },
]

/* E a volta: o que veio do banco, incluindo 'agitada', que a tela não oferece
   mas precisa saber desenhar quando foi a nutricionista quem registrou. */
export function reacaoDoBanco(valor: string | null | undefined): ChaveReacao | null {
  if (valor === 'positiva') return 'tranquilo'
  if (valor === 'neutra') return 'indiferente'
  if (valor === 'negativa' || valor === 'agitada') return 'dificil'
  return null
}

/* ── Quantas ofertas bastam ────────────────────────────────────────────────
 *
 * O ganho de aceitação sobe da 1ª à 4ª exposição e ESTABILIZA entre a 4ª e a
 * 6ª. Não são as 10 a 15 que se repetia: cinco bastaram num ensaio com purê de
 * vegetal, e os autores alertam que insistir além disso gera tédio.
 *
 * Vira regra de produto, e ao contrário do que um app costuma fazer: ao chegar
 * aqui, a tela PARA de pedir a próxima oferta e sugere levar à nutricionista.
 * Cobrar a décima é trabalhar contra a evidência e contra a paciência de quem
 * está oferecendo. */
export const OFERTAS_PARA_SABER = 5

export type Registro = {
  /* ISO 'yyyy-mm-dd'. */
  data: string
  aceitacao: string | null
  reacao: string | null
}

export type ResumoDoAlimento = {
  ofertas: number
  /* O degrau de agora — o do registro mais recente, e não o recorde. É o que
     responde "onde ele está", que é a pergunta da mãe. */
  atual: Degrau | null
  /* O mais alto que já alcançou. Responde "até onde ele já chegou", que é a
     pergunta da consulta. Os dois existem porque a escada DESCE, e faz parte. */
  recorde: Degrau | null
  /* Comparação do último com o anterior. Null quando não há dois registros. */
  passo: 'subiu' | 'igual' | 'desceu' | null
  /* Chegou ao ponto em que mais ofertas não acrescentam. */
  jaDaParaSaber: boolean
  /* O alerta DELA, reproduzido aqui: duas das últimas três foram difíceis.
     Não é para a mãe ver como cobrança — é para o app parar de sugerir aquele
     alimento e a conversa passar para a nutricionista. */
  pedeAtencao: boolean
}

/* Ordena por data, do mais antigo ao mais novo, e ignora o que não dá para ler.
   Data torta vem de importação e de digitação; derrubar a tela por causa de uma
   linha seria trocar o histórico inteiro por um erro. */
function emOrdem(registros: Registro[]): Registro[] {
  return registros
    .filter(r => !Number.isNaN(new Date(r.data + 'T12:00:00').getTime()))
    .slice()
    .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0))
}

export function resumoDoAlimento(registros: Registro[]): ResumoDoAlimento {
  const ordenados = emOrdem(registros)
  const degraus = ordenados.map(r => degrauDe(r.aceitacao))
  const comDegrau = degraus.filter((d): d is Degrau => d !== null)

  const atual = comDegrau.length > 0 ? comDegrau[comDegrau.length - 1] : null
  const recorde =
    comDegrau.length > 0
      ? comDegrau.reduce((a, b) => (b.altura > a.altura ? b : a))
      : null

  let passo: ResumoDoAlimento['passo'] = null
  if (comDegrau.length >= 2) {
    const ultimo = comDegrau[comDegrau.length - 1].altura
    const penultimo = comDegrau[comDegrau.length - 2].altura
    passo = ultimo > penultimo ? 'subiu' : ultimo < penultimo ? 'desceu' : 'igual'
  }

  /* As três últimas, e não as três últimas COM degrau: uma oferta sem reação
     anotada não deve empurrar uma difícil de semanas atrás para dentro da
     janela. */
  const ultimasTres = ordenados.slice(-3)
  const dificeis = ultimasTres.filter(r => reacaoDoBanco(r.reacao) === 'dificil').length

  return {
    ofertas: ordenados.length,
    atual,
    recorde,
    passo,
    jaDaParaSaber: ordenados.length >= OFERTAS_PARA_SABER,
    pedeAtencao: ultimasTres.length >= 3 && dificeis >= 2,
  }
}

/* ── O que a tela diz depois de registrar ──────────────────────────────────
 *
 * Nenhuma frase parabeniza demais. "Parabéns!" por um cheirão é falso, e a mãe
 * percebe — o que corrói a confiança em tudo o mais que a tela disser. O teto
 * é "isso conta", que é verdade em qualquer degrau.
 *
 * E o degrau 1 tem frase PRÓPRIA, que é o cuidado central deste arquivo: quem
 * registrou um "não" precisa fechar o app sem sensação de fracasso. */
export function fraseDoRegistro(degrau: Degrau, resumo: ResumoDoAlimento): string {
  if (degrau.chave === 'comer') return 'Ele comeu.'
  if (degrau.altura === 1) return 'Tudo bem. Encontrar já conta.'
  if (resumo.passo === 'subiu') return 'Ele chegou mais perto que da última vez.'
  return 'Encontrou de novo. Isso conta.'
}

/* A linha de apoio, embaixo da frase. É onde mora o limite das cinco ofertas —
   dito como alívio ("já dá para saber"), e nunca como meta cumprida. */
export function apoioDoRegistro(degrau: Degrau, resumo: ResumoDoAlimento): string {
  if (degrau.altura === 1) {
    return 'Recusar é o primeiro degrau, não o contrário de progresso. O alimento apareceu, e ele viu.'
  }
  if (resumo.pedeAtencao) {
    /* Recuar, e nunca insistir. É a mesma direção do alerta do sistema dela,
       cujo texto diz "considere recuar um degrau e reduzir a exigência" —
       depois de uma sequência difícil a conduta é ALIVIAR. "Tenta de novo
       amanhã" aqui seria a tela empurrando o oposto do tratamento. */
    return 'As últimas vezes foram difíceis pra ele. Vale recuar um degrau, baixar a exigência, e falar com a sua nutricionista.'
  }
  if (resumo.jaDaParaSaber) {
    return `Já são ${resumo.ofertas} encontros com este alimento — o bastante para saber como ele responde. Leve isso para a próxima consulta.`
  }
  const falta = OFERTAS_PARA_SABER - resumo.ofertas
  return `É o ${resumo.ofertas}º encontro. Em mais ${falta === 1 ? 'um' : falta}, já dá para saber.`
}

/* ── A tela que a mãe vira para o filho ────────────────────────────────────
 *
 * Primeira pessoa, presente, e sem número nenhum. A criança não precisa saber
 * que é o degrau 5 de 7 — ela precisa reconhecer o que fez e ver que existe um
 * próximo. É isso que faz virar desafio em vez de prova.
 *
 * O próximo degrau é mostrado como convite, e some no topo: quem chegou em
 * "comi" não tem próximo, e inventar um transformaria a chegada em mais uma
 * cobrança. */
export function proximoDegrau(atual: Degrau | null): Degrau | null {
  if (!atual) return DEGRAUS[0]
  return DEGRAUS.find(d => d.altura === atual.altura + 1) ?? null
}

export function convitePraCrianca(atual: Degrau | null): string {
  const proximo = proximoDegrau(atual)
  if (!proximo) return 'Você já come esse!'
  if (!atual) return 'Vamos conhecer esse aqui?'
  return `Da próxima vez, quem sabe: ${proximo.paraFilho.toLowerCase()}`
}

/* ── A evolução, mês a mês ─────────────────────────────────────────────────
 *
 * O degrau mais ALTO de cada mês, e não a média: a média de "recusou" com
 * "comeu" daria "cheirou", que não aconteceu nunca. O que interessa é até onde
 * ele conseguiu chegar naquele mês.
 *
 * Mês sem registro fica de fora em vez de virar zero — armadilha 6: zero é uma
 * afirmação, e afirmar que ele recusou num mês em que ninguém ofereceu seria
 * mentira gravada num gráfico. */
export type MesDaEscada = { mes: string; degrau: Degrau }

export function porMes(registros: Registro[]): MesDaEscada[] {
  const porChave = new Map<string, Degrau>()

  for (const r of emOrdem(registros)) {
    const d = degrauDe(r.aceitacao)
    if (!d) continue
    const mes = r.data.slice(0, 7)
    const atual = porChave.get(mes)
    if (!atual || d.altura > atual.altura) porChave.set(mes, d)
  }

  return [...porChave.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([mes, degrau]) => ({ mes, degrau }))
}

/* "a cenoura", "o brócolis".
 *
 * O nome do alimento vem do banco, e o gênero vem junto sem aviso. Um artigo
 * errado num app que fala com mãe soa como formulário — "Como foi com o
 * cenoura?" desfaz num instante o cuidado de todo o resto da tela.
 *
 * A regra é curta de propósito: a PRIMEIRA palavra termina em A, é feminino. Em
 * nome de alimento isso acerta quase sempre, porque o núcleo vem primeiro:
 * "cenoura cozida", "brócolis no vapor", "abobrinha refogada". Uma tabela de
 * exceções seria mais uma coisa a manter desatualizada.
 *
 * Nome vazio não vira "a " solto: vira "o alimento", que é feio e verdadeiro. */
export function comArtigo(nome: string): string {
  const limpo = nome.trim().replace(/\s+/g, ' ')
  if (!limpo) return 'o alimento'
  const primeira = limpo.split(' ')[0]
  return `${/a$/i.test(primeira) ? 'a' : 'o'} ${limpo.toLowerCase()}`
}
