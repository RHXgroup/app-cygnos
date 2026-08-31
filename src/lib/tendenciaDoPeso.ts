/* A linha de tendência do peso — o número que não assusta.
 *
 * ── O defeito, e ele é psicológico antes de ser técnico ───────────────────
 * O peso de uma pessoa oscila 1 a 2 kg dentro do MESMO dia: água, sal,
 * intestino, ciclo. Quem pesa toda manhã vê um número que sobe e desce sem
 * relação nenhuma com gordura.
 *
 * E o que essa pessoa conclui, olhando o gráfico do peso cru, é que engordou.
 * É ISSO que faz largar o plano — não a comida.
 *
 * Os dois melhores aplicativos de peso do mercado (Happy Scale e MacroFactor)
 * resolvem a mesma coisa do mesmo jeito: eles NÃO mostram o peso cru. Mostram
 * uma linha suavizada, e o peso do dia vira um ponto solto ao redor dela.
 *
 * Este app mostrava o cru. `serieDe`, em `peso.ts`, devolve os quilos como
 * foram registrados.
 *
 * ── Média exponencial, e não média simples ────────────────────────────────
 * Média simples de 7 dias tem dois problemas: ela ATRASA — um emagrecimento
 * real leva uma semana para aparecer — e ela dá o mesmo peso ao registro de
 * ontem e ao de sete dias atrás.
 *
 * A exponencial dá mais peso ao recente e responde em dois ou três dias, sem
 * voltar a tremer. É o que os dois aplicativos usam.
 *
 * ── E o dia que faltou não vira buraco ────────────────────────────────────
 * Quase ninguém pesa todo dia. Sem tratar isso, a linha pula de segunda para
 * sexta e o desenho mente sobre o ritmo.
 *
 * A tendência ANDA nos dias sem pesagem, carregando o último valor: é o que o
 * MacroFactor chama de imputação. Não inventa medida — repete a estimativa que
 * já existia, que é a resposta honesta para "não sei o de hoje".
 *
 * ── Só `import type` ──────────────────────────────────────────────────────
 * Roda fora do aparelho. */

import { ehDataReal, emDias, somandoDias } from './datas.ts'

export type Pesagem = { data: string; kg: number }

export type PontoDaTendencia = {
  data: string
  /* A linha suavizada. Sempre existe, inclusive nos dias sem pesagem. */
  tendencia: number
  /* O que a balança disse NAQUELE dia, ou nulo se ela não pesou. A tela desenha
     como ponto solto em volta da linha — e é essa distância que ensina, sem
     texto nenhum, que o pulo de ontem era água. */
  medido: number | null
}

/* Quanto peso o registro mais recente tem na linha.
 *
 * 0,25 responde em cerca de três dias e não treme. Mais alto e a linha vira o
 * peso cru de volta; mais baixo e ela demora tanto que a pessoa deixa de
 * confiar — "eu emagreci e a linha não mexeu" é como se perde a linha. */
const PESO_DO_NOVO = 0.25

/* Até quantos dias sem pesagem a linha continua andando.
 *
 * 21. Depois disso a última medida não descreve mais o corpo dela, e continuar
 * desenhando uma linha reta por três meses seria afirmar um peso que ninguém
 * mediu. A série corta e recomeça na pesagem seguinte. */
const DIAS_ATE_ESQUECER = 21

/* Faixa do que é peso de gente. Fora dela é erro de digitação — vírgula no
   lugar errado, libras — e um valor desses arrasta a linha inteira por semanas,
   que é o tipo de defeito que ninguém liga à causa. */
const KG_MIN = 20
const KG_MAX = 400

const util = (p: Pesagem): boolean =>
  ehDataReal(p.data) &&
  typeof p.kg === 'number' &&
  Number.isFinite(p.kg) &&
  p.kg >= KG_MIN &&
  p.kg <= KG_MAX

/* A série da tendência, dia a dia, do mais antigo ao mais novo.
 *
 * Devolve TODOS os dias entre a primeira e a última pesagem — com buraco de até
 * três semanas preenchido —, e não só os dias em que ela pesou. É o que faz o
 * gráfico ter o eixo do tempo certo: quinze pesagens em três meses desenhadas
 * lado a lado dizem que ela pesou todo dia, e não é verdade. */
export function tendenciaDoPeso(pesagens: Pesagem[]): PontoDaTendencia[] {
  const validas = pesagens.filter(util).sort((a, b) => a.data.localeCompare(b.data))
  if (validas.length === 0) return []

  /* Mais de uma pesagem no mesmo dia: fica a última. Quem pesa de novo depois
     do banheiro está corrigindo a primeira, e não somando outra medida. */
  const porDia = new Map<string, number>()
  for (const p of validas) porDia.set(p.data, p.kg)

  const dias = [...porDia.keys()].sort()
  const fora: PontoDaTendencia[] = []

  /* A linha começa NA primeira pesagem, e não em zero: começar em zero faria os
     primeiros dias subirem do nada, e a pessoa leria isso como ganho. */
  let linha = porDia.get(dias[0]) as number
  let cursor = dias[0]
  const ultimo = dias[dias.length - 1]

  /* Teto de laço: dois anos de dias. Uma data corrompida que escape da
     validação não pode fazer isto rodar para sempre. */
  for (let passos = 0; passos <= 800 && cursor <= ultimo; passos++) {
    const medido = porDia.get(cursor) ?? null

    if (medido !== null) {
      linha = linha + PESO_DO_NOVO * (medido - linha)
    }
    /* Sem pesagem, a linha repete. Não é invenção: é dizer "a minha melhor
       estimativa continua sendo a de ontem", que é o que ela é. */

    fora.push({ data: cursor, tendencia: Math.round(linha * 100) / 100, medido })

    const proximo = somandoDias(cursor, 1)
    /* Buraco longo demais: a série corta aqui e recomeça na próxima pesagem,
       com a linha renascendo nela. Continuar seria afirmar um peso que ninguém
       mediu por meses. */
    const seguinte = dias.find(d => d > cursor)
    if (seguinte && emDias(cursor, seguinte) > DIAS_ATE_ESQUECER) {
      linha = porDia.get(seguinte) as number
      cursor = seguinte
      continue
    }
    cursor = proximo
  }

  return fora
}

export type ResumoDaTendencia = {
  /* Onde a linha está hoje. É este o número para mostrar grande, e não o da
     balança. */
  atual: number
  /* Quanto a linha andou no período, em kg. Negativo é perda. */
  variacao: number
  /* Por semana, para a pessoa comparar com o que se espera de um plano. */
  porSemana: number
  /* Quantos dias a série cobre. A tela mostra — "em 24 dias" é o que separa
     medida de impressão. */
  dias: number
  /* A distância entre a balança de hoje e a linha. É o número que explica o
     susto: "a balança marcou 1,1 kg a mais que a sua tendência". Nulo quando
     ela não pesou hoje. */
  distanciaDeHoje: number | null
}

/* Mínimo de dias para a variação valer alguma coisa.
 *
 * Dez. Abaixo disso a linha ainda está se acomodando na primeira pesagem, e
 * "você perdeu 0,4 kg" seria descrever o próprio algoritmo se ajustando, e não
 * o corpo dela. */
const DIAS_PARA_VARIACAO = 10

export function resumoDaTendencia(serie: PontoDaTendencia[]): ResumoDaTendencia | null {
  if (serie.length === 0) return null

  const primeiro = serie[0]
  const ultimo = serie[serie.length - 1]
  const dias = serie.length

  const variacao = ultimo.tendencia - primeiro.tendencia
  /* Divide pelos dias DECORRIDOS, e não pelo número de pontos: a série já vem
     dia a dia, mas se um dia a preencher mudar isso, a conta continua certa. */
  const decorridos = Math.max(emDias(primeiro.data, ultimo.data), 1)

  return {
    atual: Math.round(ultimo.tendencia * 10) / 10,
    variacao: dias >= DIAS_PARA_VARIACAO ? Math.round(variacao * 10) / 10 : 0,
    porSemana:
      dias >= DIAS_PARA_VARIACAO ? Math.round((variacao / decorridos) * 7 * 100) / 100 : 0,
    dias,
    distanciaDeHoje:
      ultimo.medido === null ? null : Math.round((ultimo.medido - ultimo.tendencia) * 10) / 10,
  }
}

/* A frase que explica a distância entre a balança e a linha.
 *
 * Existe porque o número sozinho não desarma o susto: quem viu 1,1 kg a mais na
 * balança precisa ouvir que aquilo é normal, e por quê. Sem a frase, a linha
 * vira mais um número na tela.
 *
 * Nula quando não há o que explicar — distância pequena não merece parágrafo, e
 * falar toda vez faria a explicação virar paisagem. */
export function fraseDaDistancia(r: ResumoDaTendencia | null): string | null {
  if (r === null || r.distanciaDeHoje === null) return null

  const d = r.distanciaDeHoje
  /* Meio quilo. Abaixo disso é a variação de uma ida ao banheiro, e ninguém se
     assusta com 300 g. */
  if (Math.abs(d) < 0.5) return null

  const kg = Math.abs(d).toFixed(1).replace('.', ',')
  return d > 0
    ? `A balança marcou ${kg} kg acima da sua tendência hoje. Peso oscila assim por água, sal e intestino — a linha é o que está acontecendo de verdade.`
    : `A balança marcou ${kg} kg abaixo da sua tendência hoje. Um dia sozinho não muda a linha, e é ela que mostra o caminho.`
}
