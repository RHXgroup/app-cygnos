import { diaDaSemana, doISO, ehDataReal, paraISO, somandoDias } from './datas.ts'
import type { Ciclo } from './cicloDaPessoa'

export { somandoDias }

/* O calendário do ciclo: que dia é o quê, e o que dá para tocar.
 *
 * Separado de `cicloDaPessoa` porque aquele responde "em que ponto do ciclo ela
 * está" e este responde "como desenhar o mês". São perguntas diferentes, e a
 * segunda tem armadilha de calendário — mês com 28, 30 e 31 dias, ano bissexto,
 * virada de ano, e o dia da semana em que o mês começa.
 *
 * Só `import type`, como o resto: roda fora do aparelho. */

export type Marca =
  /* Dia em que ela registrou menstruação. */
  | 'menstruada'
  /* Previsto pela mediana dos ciclos dela — nunca por 28 dias. */
  | 'previsto'
  /* Tem alguma anotação (sintoma, humor, nota). Desenha um ponto. */
  | 'anotado'
  | 'nada'

export type DiaDoMes = {
  /* 'YYYY-MM-DD'. */
  data: string
  dia: number
  /* Verdadeiro quando o dia é depois de hoje. */
  futuro: boolean
  ehHoje: boolean
}

const DIA = 86400000

/* Quantos dias tem o mês. `new Date(Date.UTC(ano, mes, 0))` devolve o último dia
   do mês ANTERIOR ao índice — com mes já 1-based, isso é o último deste. É a
   forma que acerta fevereiro de ano bissexto sem regra escrita à mão. */
export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate()
}

/* Em que dia da semana o mês cai. 0 é domingo, como `Date.getDay()`. */
export function primeiroDiaDaSemana(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay()
}

/* O mês inteiro, dia por dia. A tela põe os espaços em branco antes usando
   `primeiroDiaDaSemana` — não vêm na lista porque um "dia vazio" precisaria de
   um tipo com data nula, e data nula circulando por uma tela de calendário é
   como se erra o mês inteiro por uma célula. */
export function mesDe(ano: number, mes: number, hoje: string): DiaDoMes[] {
  const total = diasNoMes(ano, mes)
  const dias: DiaDoMes[] = []
  for (let d = 1; d <= total; d++) {
    const data = `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    dias.push({ data, dia: d, futuro: data > hoje, ehHoje: data === hoje })
  }
  return dias
}

/* Os dias em que ela estava menstruada, a partir dos ciclos registrados.
 *
 * Um Set, e não uma função que percorre a lista por dia: a tela pergunta isso
 * 31 vezes por mês, e percorrer os ciclos em cada pergunta é o tipo de conta que
 * ninguém nota até o calendário ficar lento no aparelho ruim.
 *
 * Ciclo sem fim marcado conta só o primeiro dia. Pintar cinco por suposição
 * mostraria como fato uma coisa que ela não disse — e ela é quem sabe. */
export function diasMenstruada(ciclos: Ciclo[]): Set<string> {
  const dias = new Set<string>()
  for (const c of ciclos) {
    if (!ehDataReal(c.comecou)) continue
    if (!c.terminou || !ehDataReal(c.terminou) || c.terminou < c.comecou) {
      dias.add(c.comecou)
      continue
    }
    /* Teto de segurança: um fim digitado com o mês errado daria centenas de
       dias pintados, e o laço percorreria todos eles. */
    const quantos = Math.min(Math.round((doISO(c.terminou) - doISO(c.comecou)) / DIA), 30)
    for (let i = 0; i <= quantos; i++) dias.add(somandoDias(c.comecou, i))
  }
  return dias
}

/* Os dias da próxima menstruação prevista.
 *
 * Só sai quando há previsão — dois ciclos e regularidade. Sem isso o calendário
 * não pinta nada, porque pintar por 28 dias seria inventar.
 *
 * A duração pintada é a MEDIANA dos fluxos que ela registrou, e cinco quando
 * ela nunca marcou o fim de nenhum. */
export function diasPrevistos(
  proximaPrevista: string | null,
  ciclos: Ciclo[],
): Set<string> {
  const dias = new Set<string>()
  if (!proximaPrevista || !ehDataReal(proximaPrevista)) return dias

  const fluxos = ciclos
    .filter(
      c => c.terminou && ehDataReal(c.comecou) && ehDataReal(c.terminou) && c.terminou >= c.comecou,
    )
    .map(c => Math.round((doISO(c.terminou as string) - doISO(c.comecou)) / DIA) + 1)
    .filter(d => d >= 1 && d <= 15)
    .sort((a, b) => a - b)

  const quantos = fluxos.length === 0 ? 5 : fluxos[Math.floor(fluxos.length / 2)]
  for (let i = 0; i < quantos; i++) dias.add(somandoDias(proximaPrevista, i))
  return dias
}

/* A marca de um dia. A ordem importa: o que ela REGISTROU vence o que o app
   previu, sempre. Um dia pintado de "previsto" por cima de um que ela marcou
   faria o app discordar dela na cara dela. */
export function marcaDoDia(
  data: string,
  menstruada: Set<string>,
  previstos: Set<string>,
  anotados: Set<string>,
): Marca {
  if (menstruada.has(data)) return 'menstruada'
  if (previstos.has(data)) return 'previsto'
  if (anotados.has(data)) return 'anotado'
  return 'nada'
}

/* O mês anterior e o seguinte, sem passar de dezembro nem de janeiro na mão.
   Contas de mês escritas à mão erram exatamente na virada do ano, e erram
   calado: o calendário mostra "mês 13" ou volta para o ano errado. */
export function mesVizinho(ano: number, mes: number, passo: -1 | 1): { ano: number; mes: number } {
  const n = (ano * 12 + (mes - 1)) + passo
  return { ano: Math.floor(n / 12), mes: (n % 12) + 1 }
}

/* Até onde dá para navegar para a frente.
 *
 * O mês de hoje mais um. Além disso não há o que ver: o calendário do futuro
 * distante é uma tela vazia com uma previsão que ainda vai mudar, e deixar
 * rolar para sempre convida a marcar um dia que não aconteceu. */
export function podeAvancar(ano: number, mes: number, hoje: string): boolean {
  const [ah, mh] = hoje.split('-').map(Number)
  return ano * 12 + mes < ah * 12 + mh + 1
}

export const NOMES_DOS_MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

export const INICIAIS_DA_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

/* Que forma o dia tem dentro de uma sequência de dias marcados.
 *
 * ── Por que isto existe ───────────────────────────────────────────────────
 * Os aplicativos de ciclo bons não desenham cinco bolinhas soltas para cinco
 * dias de menstruação: desenham UMA FAIXA contínua, arredondada nas pontas.
 * A diferença não é enfeite — a faixa mostra que aquilo é um período, e as
 * bolinhas soltas mostram cinco eventos sem relação.
 *
 * E a forma depende dos VIZINHOS, o que é a única razão de isto ser uma função
 * e não um estilo: o primeiro dia arredonda à esquerda, o último à direita, e
 * os do meio ficam retos para encostar nos dois lados.
 *
 * ── A quebra de semana ────────────────────────────────────────────────────
 * Sexta e sábado são vizinhos no calendário, mas ficam em pontas opostas da
 * grade — a faixa não pode "atravessar" a borda. Por isso a função também olha
 * o dia da semana: sábado sempre fecha à direita e domingo sempre abre à
 * esquerda, mesmo com o vizinho marcado. */
export type FormaDoDia = 'sozinho' | 'inicio' | 'meio' | 'fim'

export function formaNaFaixa(data: string, marcados: Set<string>): FormaDoDia {
  const dia = diaDaSemana(data)
  /* Data que não existe não tem vizinho. Antes isto ESTOURAVA — `somandoDias`
     chamava `toISOString()` sobre um número inválido e derrubava o calendário
     inteiro numa tela branca. */
  if (dia < 0) return 'sozinho'

  /* Sábado é 6 e domingo é 0. Um encosta na borda direita da grade e o outro na
     esquerda, então a faixa termina ali de qualquer forma. */
  const temAntes = dia !== 0 && marcados.has(somandoDias(data, -1))
  const temDepois = dia !== 6 && marcados.has(somandoDias(data, 1))

  if (temAntes && temDepois) return 'meio'
  if (temDepois) return 'inicio'
  if (temAntes) return 'fim'
  return 'sozinho'
}
