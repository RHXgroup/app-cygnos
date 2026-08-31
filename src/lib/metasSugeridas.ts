/* As metas calculadas a partir do que o app já sabe sobre ela.
 *
 * ── O defeito que fez isto existir ────────────────────────────────────────
 * A tela de metas pedia ONZE números: calorias, proteínas, carboidratos,
 * gorduras, fibras, passos, treinos por semana, sono, meta de água, tamanho do
 * copo e o nome do conjunto.
 *
 * Quem baixa um aplicativo de nutrição não sabe quantos gramas de gordura deve
 * comer por dia. É por isso que ela baixou o aplicativo. Pedir esse número é
 * devolver a pergunta para quem veio buscar a resposta.
 *
 * E o app JÁ SABIA calcular. `energia.ts` tem Mifflin-St Jeor, fator de
 * atividade e o ajuste para perder, manter ou ganhar — e isso já alimentava a
 * sugestão de plano e a tela de treino. Só não alimentava as metas.
 *
 * O sintoma estava escrito no próprio código, numa frase preparada para quando
 * a pessoa não preenchesse nada:
 *
 *   "Só a água está entrando na conta. Defina metas de caloria, macros ou
 *    sono — ou ative um plano alimentar — e o anel passa a medir o dia inteiro."
 *
 * O app percebia o problema e EXPLICAVA, em vez de resolver.
 *
 * ── O que é calculado, e o que continua sendo escolha ─────────────────────
 * Calculado: calorias, os quatro macros e a água. São contas com fórmula
 * publicada e entrada que o app tem.
 *
 * NÃO calculado: passos, treinos por semana e sono. Não saem de peso e altura —
 * saem da vida dela, do trabalho, do joelho que dói. Sugerir "4 treinos por
 * semana" para quem nunca treinou é inventar uma meta que ela vai falhar na
 * primeira semana, e falhar numa meta que ela não escolheu é o jeito mais
 * rápido de o app virar mais uma fonte de culpa.
 *
 * ── E é sugestão, não decisão ─────────────────────────────────────────────
 * Devolve números para a tela PREENCHER, e a pessoa edita por cima antes de
 * salvar. Isso importa: uma conta que se impõe sem ser vista é a mesma coisa
 * que pedir o número, só que pior, porque ela não sabe de onde veio.
 *
 * ── Só `import type` ──────────────────────────────────────────────────────
 * Roda fora do aparelho. */

import type { Sexo } from './energia'

export type DadosDoCorpo = {
  pesoKg: number | null
  alturaCm: number | null
  idade: number | null
  sexo: Sexo | null
}

export type Sugestao = {
  calorias: number
  proteinas: number
  carboidratos: number
  gorduras: number
  fibras: number
  aguaMl: number
  /* De onde saiu o número das calorias, do melhor para o pior.
   *
   *   'medido'   o gasto calculado do que ela COMEU e de como o peso andou.
   *              É o único que não é fórmula, e vence todos.
   *   'calculo'  o cálculo energético que ela mesma fez, com o nível de
   *              atividade e o ajuste que ela escolheu.
   *   'corpo'    Mifflin-St Jeor com atividade leve. O palpite de partida.
   *
   * A tela DIZ isto — uma conta que a pessoa não sabe de onde veio ela não
   * corrige, e não corrigir é o mesmo que não ter. */
  origem: 'medido' | 'calculo' | 'corpo'
}

/* ── As constantes, e de onde saiu cada uma ────────────────────────────────*/

/* Proteína por quilo de peso. 1,6 g/kg é o patamar em que a literatura de
   composição corporal para de mostrar ganho adicional em quem treina, e é
   confortavelmente seguro para quem não treina. Um número no meio, que serve
   para os dois casos sem precisar perguntar qual é o dela. */
const PROTEINA_G_POR_KG = 1.6

/* Gordura como fração das calorias. 27% fica dentro da faixa aceita (20 a 35%)
   e deixa carboidrato suficiente para o dia não ficar restritivo — dieta
   restritiva é a que se abandona. */
const GORDURA_PCT = 0.27

/* Quilocalorias por grama. Não são escolha: são os fatores de Atwater. */
const KCAL_POR_G_PROTEINA = 4
const KCAL_POR_G_CARBO = 4
const KCAL_POR_G_GORDURA = 9

/* Fibra por 1000 kcal. 14 g é a recomendação do Institute of Medicine, e
   escalar por caloria é o que a torna proporcional a quem come 1600 e a quem
   come 3000. */
const FIBRA_G_POR_1000_KCAL = 14

/* Água por quilo. 35 ml/kg é a regra de bolso usada na clínica. */
const AGUA_ML_POR_KG = 35

/* Piso e teto das calorias sugeridas.
 *
 * 1200 embaixo porque abaixo disso não se monta um dia com os micronutrientes
 * necessários, e nenhum app deve sugerir isso sozinho. 4500 em cima porque
 * acima disso é erro de entrada — altura em metros, peso em libras — e não uma
 * pessoa. Os dois existem para um dado torto não virar meta. */
const KCAL_MIN = 1200
const KCAL_MAX = 4500

const numero = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null

/* Mifflin-St Jeor. A mesma fórmula de `energia.ts`, e é de propósito que ela
   apareça duas vezes: lá ela alimenta uma tela que a pessoa opera com todos os
   controles; aqui alimenta um atalho para quem nunca vai abrir aquela tela.
   Unificar exigiria arrastar o Supabase para dentro deste arquivo, e aí ele
   deixaria de ter teste. */
function tmbMifflin(d: { pesoKg: number; alturaCm: number; idade: number; sexo: Sexo }): number {
  const base = 10 * d.pesoKg + 6.25 * d.alturaCm - 5 * d.idade
  return d.sexo === 'M' ? base + 5 : base - 161
}

/* O fator de atividade usado quando ela não escolheu nenhum.
 *
 * 1,375 — "pouco ativo". Não é o sedentário puro, porque quase ninguém é; e não
 * é moderado, porque errar para cima cria uma meta de caloria alta demais, e
 * uma meta alta demais não produz resultado nenhum e faz a pessoa concluir que
 * o app não funciona. Errar para baixo, ela sente fome e corrige. */
const FATOR_PADRAO = 1.375

/* As metas que os dados sustentam, ou nulo.
 *
 * Nulo quando falta peso — sem ele não há proteína por quilo nem água por
 * quilo, e sugerir a partir de altura só seria chute com cara de conta.
 *
 * `alvoKcalDoCalculo` vem do cálculo energético que ela já fez, quando existe.
 * Ele vence a conta daqui sempre: lá ela escolheu o nível de atividade e o
 * ajuste, e o número dela vale mais do que o padrão. */
export function metasSugeridas(
  corpo: DadosDoCorpo,
  alvoKcalDoCalculo?: number | null,
  /* O gasto MEDIDO, quando já houver registro suficiente para calculá-lo.
   *
   * Vence tudo, e a razão está na análise pública do melhor aplicativo da
   * categoria: fórmula estática erra de 15 a 25% por pessoa. Errar 20% em 2.000
   * kcal são 400 kcal por dia — quem come 400 a mais do que pensa não emagrece,
   * conclui que "dieta não funciona comigo", e larga. */
  gastoMedido?: number | null,
): Sugestao | null {
  const peso = numero(corpo.pesoKg)
  if (peso === null || peso > 400) return null

  let calorias: number
  let origem: Sugestao['origem']

  const medido = numero(gastoMedido)
  const doCalculo = numero(alvoKcalDoCalculo)

  if (medido !== null) {
    calorias = Math.round(medido)
    origem = 'medido'
  } else if (doCalculo !== null) {
    calorias = Math.round(doCalculo)
    origem = 'calculo'
  } else {
    const altura = numero(corpo.alturaCm)
    const idade = numero(corpo.idade)
    if (altura === null || idade === null || corpo.sexo === null) return null
    /* Faixas do que é gente: fora delas o dado está torto, e um dado torto vira
       meta que ninguém confere. */
    if (altura < 100 || altura > 250 || idade < 10 || idade > 110) return null

    calorias = Math.round(tmbMifflin({ pesoKg: peso, alturaCm: altura, idade, sexo: corpo.sexo }) * FATOR_PADRAO)
    origem = 'corpo'
  }

  if (!Number.isFinite(calorias)) return null
  calorias = Math.min(Math.max(calorias, KCAL_MIN), KCAL_MAX)

  const proteinas = Math.round(peso * PROTEINA_G_POR_KG)
  const gorduras = Math.round((calorias * GORDURA_PCT) / KCAL_POR_G_GORDURA)

  /* O carboidrato é o RESTO, e não uma porcentagem própria: assim os três
     macros somam a caloria alvo em vez de somarem outra coisa. Uma tela que
     mostra 2000 kcal de meta e macros que dão 2300 perde a confiança da pessoa
     no primeiro dia em que ela fizer a conta. */
  const kcalRestante =
    calorias - proteinas * KCAL_POR_G_PROTEINA - gorduras * KCAL_POR_G_GORDURA
  const carboidratos = Math.max(Math.round(kcalRestante / KCAL_POR_G_CARBO), 0)

  return {
    calorias,
    proteinas,
    carboidratos,
    gorduras,
    fibras: Math.round((calorias / 1000) * FIBRA_G_POR_1000_KCAL),
    aguaMl: Math.round((peso * AGUA_ML_POR_KG) / 50) * 50,
    origem,
  }
}

/* A frase que explica de onde veio o número.
 *
 * Existe porque uma conta que a pessoa não sabe de onde veio ela não corrige — e
 * não corrigir é o mesmo que não ter meta. Ela precisa poder discordar. */
export function comoFoiCalculado(s: Sugestao): string {
  /* O medido primeiro, e ele é o único que não usa a palavra "calculado" no
     sentido de fórmula: aqui o número saiu do que ela registrou, e dizer isso é
     o que separa este app dos outros. */
  if (s.origem === 'medido') {
    return 'Este número saiu do que você registrou comer e de como o seu peso andou — e não de uma fórmula. Ele fica mais certo a cada semana.'
  }
  return s.origem === 'calculo'
    ? 'Calculado a partir do seu cálculo energético — o nível de atividade e o ajuste que você escolheu lá.'
    : 'Calculado a partir do seu peso, altura, idade e sexo, com atividade leve. Se você treina mais que isso, aumente as calorias.'
}
