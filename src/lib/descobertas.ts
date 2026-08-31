/* O que os dados DELA dizem sobre ela — e que ela não sabia.
 *
 * ── A pergunta que fez isto existir ───────────────────────────────────────
 * "Depois que ele fez tudo, e aí? O que ele ganhou com isso?"
 *
 * O app pede muita coisa: comida, água, sono, peso, treino, ciclo. E devolvia
 * soma, gráfico e percentual — que é devolver a MESMA informação organizada.
 * Organizar não é descobrir.
 *
 * Uma descoberta é o app dizer uma frase que ela não conseguiria escrever
 * sozinha: "nas noites em que você dorme menos de 6h, no dia seguinte você come
 * 380 kcal a mais — em 9 dias medidos".
 *
 * ── Por que aqui, e por que nenhum concorrente faz ────────────────────────
 * Porque cruzar exige ter os dois lados no mesmo lugar. Um app de sono não tem
 * o diário alimentar; um contador de calorias não tem o ciclo; nenhum dos dois
 * tem a nutricionista junto. Este tem os seis, e é a única vantagem estrutural
 * que o app possui — não é mais uma tela, é a razão de as telas existirem.
 *
 * ── As quatro regras, e todas vieram de um jeito de errar ─────────────────
 *
 *   1. NADA SEM BASE. Cada lado precisa de um mínimo de dias, e a frase DIZ
 *      quantos foram. "Você come mais quando dorme mal" sem número é horóscopo;
 *      com "em 9 dias medidos" é medida dela, e ela pode discordar.
 *
 *   2. NADA DE CAUSA. "Nos dias em que" e não "porque". A diferença não é
 *      preciosismo: o app está lendo dois números do mesmo dia, e não sabe qual
 *      empurrou qual. Escrever "porque" é afirmar o que não se mediu.
 *
 *   3. NADA DE DIAGNÓSTICO. Nenhuma frase aqui pode virar "você tem" alguma
 *      coisa. Quem diz isso é a nutricionista, com a ficha na frente.
 *
 *   4. DIFERENÇA PEQUENA NÃO É DESCOBERTA. 40 kcal entre dois grupos é ruído
 *      de arredondamento de porção. Abaixo do piso, o app fica calado — e ficar
 *      calado é o que faz a frase valer alguma coisa no dia em que ela aparece.
 *
 * ── Só `import type` ──────────────────────────────────────────────────────
 * Roda fora do aparelho, e é exercitado com dados torpes de propósito. */

import { somandoDias } from './datas.ts'

export type DiaDeSono = { data: string; minutos: number | null }
export type DiaDeCalorias = { data: string; calorias: number | null }
export type DiaDePeso = { data: string; kg: number | null }

export type Descoberta = {
  /* Identifica o tipo, para a tela não repetir a mesma no dia seguinte e para
     o teste apontar qual falhou. */
  chave: 'sono_calorias' | 'peso_no_ciclo'
  texto: string
  /* Quantos dias (ou ciclos) sustentam a frase. A tela mostra, e é isto que
     separa medida de horóscopo. */
  base: number
}

/* ── Os pisos, e de onde saiu cada um ──────────────────────────────────────*/

/* Quantos dias em CADA lado da comparação. Menos que isto e a média de um dia
   atípico — um aniversário, uma virose — vira a conclusão inteira. */
const MINIMO_POR_GRUPO = 4

/* Abaixo de quanto o app fica calado sobre calorias.
 *
 * 200 kcal. É mais do que o erro de porção de uma refeição registrada no olho,
 * que é como quase todo mundo registra. Abaixo disso a diferença existe na
 * planilha e não existe na vida. */
const DIFERENCA_MINIMA_KCAL = 200

/* O que conta como noite curta. Seis horas é o corte que a literatura usa para
   sono insuficiente em adulto, e é um número que a pessoa reconhece. */
const NOITE_CURTA_EM_MINUTOS = 6 * 60

/* Abaixo de quanto o app fica calado sobre peso.
 *
 * 700 g. Uma balança doméstica varia algumas centenas de gramas entre pesagens
 * do mesmo dia; dizer que "o seu peso oscila 300 g" seria dar nome a ruído. */
const OSCILACAO_MINIMA_KG = 0.7

const numero = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

const media = (ns: number[]): number => ns.reduce((s, n) => s + n, 0) / ns.length

/* ── Sono de ontem × comida de hoje ────────────────────────────────────────
 *
 * O cruzamento com a base mais sólida na literatura: noite curta e mais comida
 * no dia seguinte aparecem juntos de forma consistente. Mas o que o app afirma
 * NÃO é a literatura — é o número DELA. A literatura só justificou olhar aqui.
 *
 * A noite é indexada pelo dia em que ela ACABOU (é assim que `app_sono_noites`
 * guarda), então a comparação é com o MESMO dia: a madrugada de hoje contra o
 * que ela comeu hoje. */
function sonoECalorias(
  noites: DiaDeSono[],
  dias: DiaDeCalorias[],
): Descoberta | null {
  const kcalPorDia = new Map<string, number>()
  for (const d of dias) {
    const k = numero(d.calorias)
    /* Zero não é "dia sem comer": é dia sem registro. Incluí-lo puxaria a média
       do grupo para baixo e inverteria a conclusão. */
    if (k !== null && k > 0) kcalPorDia.set(d.data, k)
  }

  const curtas: number[] = []
  const normais: number[] = []

  for (const n of noites) {
    const min = numero(n.minutos)
    if (min === null || min <= 0) continue
    const kcal = kcalPorDia.get(n.data)
    if (kcal === undefined) continue
    ;(min < NOITE_CURTA_EM_MINUTOS ? curtas : normais).push(kcal)
  }

  if (curtas.length < MINIMO_POR_GRUPO || normais.length < MINIMO_POR_GRUPO) return null

  const diferenca = Math.round(media(curtas) - media(normais))
  if (Math.abs(diferenca) < DIFERENCA_MINIMA_KCAL) return null

  const base = curtas.length + normais.length
  /* "Nos dias em que", nunca "porque". O app leu dois números do mesmo dia e
     não sabe qual empurrou qual. */
  return {
    chave: 'sono_calorias',
    base,
    texto:
      diferenca > 0
        ? `Nos dias em que você dormiu menos de 6h, você comeu ${diferenca} kcal a mais — comparando ${curtas.length} ${curtas.length === 1 ? 'dia' : 'dias'} assim com ${normais.length} de sono mais longo.`
        : `Nos dias em que você dormiu menos de 6h, você comeu ${Math.abs(diferenca)} kcal a menos — comparando ${curtas.length} ${curtas.length === 1 ? 'dia' : 'dias'} assim com ${normais.length} de sono mais longo.`,
  }
}

/* ── O peso dentro do ciclo ────────────────────────────────────────────────
 *
 * Esta é a que muda o dia de alguém.
 *
 * Quem acompanha o peso vê ele subir nos dias antes da menstruação, conclui que
 * engordou, e é ISSO que faz largar o plano — não a comida. É retenção de
 * líquido, volta sozinha, e ninguém conta.
 *
 * O app tem os dois lados e pode contar. Com o número dela, não com o da
 * literatura: "o seu peso variou 1,2 kg dentro do mesmo ciclo". */
function pesoNoCiclo(
  pesos: DiaDePeso[],
  comecosDeCiclo: string[],
): Descoberta | null {
  const validos = pesos
    .map(p => ({ data: p.data, kg: numero(p.kg) }))
    .filter((p): p is { data: string; kg: number } => p.kg !== null && p.kg > 0)
  if (validos.length < MINIMO_POR_GRUPO) return null

  const comecos = [...comecosDeCiclo].sort()
  if (comecos.length < 2) return null

  /* Dentro de UM ciclo, e não ao longo do tempo. Comparar janeiro com março
     misturaria oscilação do ciclo com perda ou ganho de verdade — que é
     exatamente a confusão que esta frase existe para desfazer. */
  let maiorVariacao = 0
  let baseDoMaior = 0

  for (let i = 1; i < comecos.length; i++) {
    const de = comecos[i - 1]
    const ate = somandoDias(comecos[i], -1)
    const dentro = validos.filter(p => p.data >= de && p.data <= ate).map(p => p.kg)
    if (dentro.length < MINIMO_POR_GRUPO) continue

    const variacao = Math.max(...dentro) - Math.min(...dentro)
    if (variacao > maiorVariacao) {
      maiorVariacao = variacao
      baseDoMaior = dentro.length
    }
  }

  if (maiorVariacao < OSCILACAO_MINIMA_KG) return null

  const kg = maiorVariacao.toFixed(1).replace('.', ',')
  return {
    chave: 'peso_no_ciclo',
    base: baseDoMaior,
    /* Diz o que É e o que NÃO É. A segunda metade é a que serve para alguma
       coisa: sem ela, o número vira mais um motivo de susto. */
    texto:
      `Dentro de um mesmo ciclo o seu peso variou ${kg} kg, em ${baseDoMaior} pesagens. ` +
      'Oscilar assim entre o começo e o fim do ciclo é esperado, e boa parte disso é água — ' +
      'não gordura ganha e perdida em duas semanas.',
  }
}

/* As descobertas que os dados sustentam, da mais forte para a mais fraca.
 *
 * Lista, e não uma só, porque quem chama decide quantas mostrar — e mostrar
 * duas de uma vez é diferente de mostrar uma por semana. Vazia é resposta
 * legítima e é o caso comum no começo: o app fica calado até ter o que dizer, e
 * é esse silêncio que faz a frase valer quando ela vier. */
export function descobertas(dados: {
  noites: DiaDeSono[]
  dias: DiaDeCalorias[]
  pesos: DiaDePeso[]
  comecosDeCiclo: string[]
}): Descoberta[] {
  const fora = [
    pesoNoCiclo(dados.pesos ?? [], dados.comecosDeCiclo ?? []),
    sonoECalorias(dados.noites ?? [], dados.dias ?? []),
  ].filter((d): d is Descoberta => d !== null)

  /* Mais base primeiro: entre duas frases verdadeiras, a que se apoia em mais
     dias é a que merece o lugar. */
  return fora.sort((a, b) => b.base - a.base)
}
