/* A janela fértil e a data provável do parto.
 *
 * ── O que este arquivo é, e o que ele NÃO é ───────────────────────────────
 * É uma estimativa a partir das datas que ELA registrou, pelo modelo que todo
 * aplicativo de ciclo usa. Erra por dias, não por horas, e erra mais em ciclo
 * irregular.
 *
 * NÃO é método contraceptivo, e o app não desenha "dias seguros" em lugar
 * nenhum. A diferença importa: mostrar dia fértil para quem QUER engravidar é
 * ajudar; a mesma informação lida ao contrário vira anticoncepção, e aí a
 * margem de erro tem consequência que ninguém desfaz. O único app que pode
 * afirmar eficácia contraceptiva é o que passou por autoridade sanitária para
 * isso — o Natural Cycles, com liberação da FDA —, e ele mede temperatura basal
 * todo dia, que é outro dado e outro método.
 *
 * Por isso: nenhuma função aqui devolve "seguro", "livre" ou equivalente. O
 * vocabulário é só o que é verdade — janela fértil estimada, e ponto.
 *
 * ── A conta, e de onde ela sai ────────────────────────────────────────────
 * De trás para a frente, como em `cicloDaPessoa`: a fase lútea dura perto de 14
 * dias em quase todo mundo, e o que varia entre ciclos longos e curtos é a
 * folicular, no começo. Então ovulação ≈ próxima menstruação − 14.
 *
 * A janela vai de 5 dias ANTES da ovulação até 1 dia DEPOIS: o espermatozoide
 * sobrevive perto de 5 dias no trato reprodutivo, e o óvulo cerca de 24 horas.
 * São 7 dias.
 *
 * ── Só `import type` ──────────────────────────────────────────────────────
 * Como o resto: roda fora do aparelho, e é exercitado com datas de verdade. */

import { doISO, ehDataReal, paraISO, somandoDias as somando } from './datas.ts'

const DIA = 86400000

/* Quantos dias a fase lútea dura. Fixo de propósito: é o pedaço do ciclo que
   quase não varia, e é justamente isso que permite calcular para trás. */
export const DIAS_DE_LUTEA = 14

/* De quantos dias antes da ovulação a janela começa, e quantos depois ela
   termina. Sobrevivência do espermatozoide e do óvulo. */
const ANTES = 5
const DEPOIS = 1

export type JanelaFertil = {
  /* O dia estimado da ovulação. */
  ovulacao: string
  de: string
  ate: string
}

/* A janela, ou nada.
 *
 * Só existe quando há previsão da próxima menstruação — o que quer dizer dois
 * ciclos registrados e regularidade suficiente. Sem isso não sai nada, pela
 * mesma razão de o app não prever com 28 dias: uma janela calculada sobre média
 * de população não é a janela dela, e aqui o erro custa mais do que uma data
 * errada na tela.
 *
 * A função recebe SÓ a data prevista, e por isso não sabe a duração do ciclo:
 * num ciclo muito curto (abaixo de 21 dias) a janela calculada encosta na
 * menstruação anterior. Quem decide se aquilo faz sentido é `situacaoDoCiclo`,
 * que já se recusa a prever ciclo irregular — e é lá que a regra tem o dado
 * para valer. */
export function janelaFertil(proximaPrevista: string | null): JanelaFertil | null {
  if (!proximaPrevista || !ehDataReal(proximaPrevista)) return null

  const ovulacao = somando(proximaPrevista, -DIAS_DE_LUTEA)
  return { ovulacao, de: somando(ovulacao, -ANTES), ate: somando(ovulacao, DEPOIS) }
}

/* Os dias da janela, para o calendário pintar. Set pela mesma razão do resto:
   a tela pergunta 31 vezes por mês. */
export function diasFerteis(janela: JanelaFertil | null): Set<string> {
  const dias = new Set<string>()
  if (!janela) return dias
  for (let i = 0; i <= ANTES + DEPOIS; i++) dias.add(somando(janela.de, i))
  return dias
}

/* Se um dia cai na janela. Existe separado porque a tela do dia pergunta por um
   só, e montar o Set inteiro para uma pergunta seria desperdício. */
export function ehDiaFertil(data: string, janela: JanelaFertil | null): boolean {
  if (!janela || !ehDataReal(data)) return false
  return data >= janela.de && data <= janela.ate
}

/* ── A data provável do parto ──────────────────────────────────────────────*/

/* Da concepção até o nascimento, em dias.
 *
 * 266, e não 280. Os dois números são usados na clínica e descrevem coisas
 * diferentes: 280 conta a partir do primeiro dia da última menstruação (a regra
 * de Naegele, que é como a obstetrícia data a gestação), e 266 conta a partir da
 * CONCEPÇÃO. A diferença são as duas semanas entre a menstruação e a ovulação.
 *
 * Aqui a pergunta é "se eu engravidar neste dia, quando nasce?", então o marco é
 * a concepção — usar 280 a partir dela jogaria a data duas semanas para a
 * frente. É o tipo de erro que ninguém confere porque a conta "parece a que se
 * ouve falar". */
const DIAS_DE_GESTACAO = 266

/* Quando nasceria, se ela engravidasse naquele dia.
 *
 * Estimativa, e a tela diz isso: menos de 5% dos bebês nascem na data prevista,
 * e o intervalo normal é de uma a duas semanas para cada lado. O valor da conta
 * não é a precisão — é dar tamanho a uma coisa que, sem ela, é abstrata. */
export function dataProvavelDoParto(dataDaConcepcao: string): string | null {
  if (!ehDataReal(dataDaConcepcao)) return null
  return paraISO(doISO(dataDaConcepcao) + DIAS_DE_GESTACAO * DIA)
}

/* Em que mês cairia, escrito por extenso. "Maio de 2027" diz mais do que
   "2027-05-14" para quem está imaginando a cena — e a precisão do dia seria
   falsa de qualquer forma. */
const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

export function mesPorExtenso(iso: string): string {
  if (!ehDataReal(iso)) return ''
  const [ano, mes] = iso.split('-').map(Number)
  if (mes < 1 || mes > 12) return ''
  return `${MESES[mes - 1]} de ${ano}`
}
