import { diaDaSemana, doISO, ehDataReal, paraISO, segundaDa, somandoDias } from './datas.ts'

/* O calendário da agenda dela: dia, semana e mês.
 *
 * ──────────────────── Por que a vista não é só "hoje" ────────────────────
 * O painel responde "como está o meu dia". Isto responde outra coisa: "quando
 * eu tenho vaga?", "como está a próxima semana?", "já marquei alguma coisa em
 * outubro?". São perguntas de quem está com uma paciente na frente pedindo
 * retorno, e não de quem está entre duas consultas.
 *
 * ──────────────────── Tudo em ISO de DIA, e nada de `Date` aqui dentro ────────────────────
 * Quem converte o `timestamptz` do banco para o dia LOCAL dela é a camada que
 * lê (`agendaDaNutri`). Daqui para dentro só existe "2026-09-08", e por isso
 * este arquivo roda fora do aparelho e dá para exercitar as viradas -- fim de
 * mês, ano bissexto, domingo virando segunda --, que é exatamente onde
 * calendário erra.
 *
 * ──────────────────── E por que ele importa `datas.ts` em vez de fazer as contas ────────────────────
 * Porque `somandoDias` e `ehDataReal` já existem lá, e já pagaram o preço de
 * existir: uma terceira cópia escrita sem a conferência de data real deixou
 * "2026-02-31" passar e virar 3 de março em silêncio. Armadilha 5. */

export type Vista = 'dia' | 'semana' | 'mes'

/* Uma célula da grade do mês. */
export type Celula = {
  iso: string
  /* Falso nas sobras do mês anterior e do seguinte, que a grade precisa
     desenhar para as colunas fecharem. Elas aparecem apagadas, e não em branco:
     um buraco na primeira linha se lê como defeito, e a data continua sendo
     útil -- 31 de agosto é um dia em que ela pode ter consulta. */
  doMes: boolean
  quantas: number
}

/* Segunda a domingo, e não domingo a sábado.
 *
 * A semana de trabalho dela começa na segunda, e uma grade que abre no domingo
 * empurra o fim de semana para o meio da linha -- o olho procura "os dois dias
 * vazios" no canto, e não no miolo. `datas.segundaDa` já trata o domingo, que
 * é o caso que erra. */
export const CABECALHO_DA_SEMANA = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/* "2026-09" a partir de um dia. */
export const mesDe = (iso: string): string => (ehDataReal(iso) ? iso.slice(0, 7) : iso)

/* O primeiro dia do mês, em ISO. Devolve vazio para mês que não existe: quem
   desenha decide o que fazer, e uma grade a partir de lixo seria uma tela de
   datas inventadas. */
export function primeiroDiaDoMes(anoMes: string): string {
  const iso = anoMes + '-01'
  return ehDataReal(iso) ? iso : ''
}

/* Anda `n` meses, para frente ou para trás.
 *
 * Sem `Date.setMonth`, que é a armadilha clássica: partir de 31 de janeiro e
 * somar um mês dá 3 de março, porque 31 de fevereiro escorrega. Aqui a conta é
 * sobre ANO e M~EC~S, e o dia nunca entra. */
export function mesAndando(anoMes: string, n: number): string {
  const ano = Number(anoMes.slice(0, 4))
  const mes = Number(anoMes.slice(5, 7))
  if (!Number.isFinite(ano) || !Number.isFinite(mes) || mes < 1 || mes > 12) return anoMes

  const total = ano * 12 + (mes - 1) + n
  const novoAno = Math.floor(total / 12)
  const novoMes = total - novoAno * 12
  return String(novoAno).padStart(4, '0') + '-' + String(novoMes + 1).padStart(2, '0')
}

/* Quantos dias tem o mês. Descoberto andando, e não por tabela com exceção de
   bissexto: o dia 1 do mês seguinte menos um dia é o último deste, e a regra do
   ano bissexto já está no calendário. */
export function diasNoMes(anoMes: string): number {
  const primeiro = primeiroDiaDoMes(anoMes)
  if (!primeiro) return 0
  const proximo = primeiroDiaDoMes(mesAndando(anoMes, 1))
  if (!proximo) return 0
  return Math.round((doISO(proximo) - doISO(primeiro)) / 86400000)
}

/* Os sete dias da semana daquela data, de segunda a domingo. */
export function diasDaSemana(iso: string): string[] {
  const segunda = segundaDa(iso)
  if (!ehDataReal(segunda)) return []
  return [0, 1, 2, 3, 4, 5, 6].map(n => somandoDias(segunda, n))
}

/* A grade do mês: sempre linhas inteiras de sete, com as sobras dos meses
 * vizinhos preenchidas.
 *
 * O número de linhas VARIA -- cinco na maioria dos meses, seis quando o mês
 * começa tarde e é longo, quatro em fevereiro que começa na segunda. Fixar em
 * seis deixaria uma linha inteira de sobras num mês de quatro, e cortar em
 * cinco esconderia dias reais no outro. */
export function gradeDoMes(anoMes: string, contagem: Map<string, number>): Celula[] {
  const primeiro = primeiroDiaDoMes(anoMes)
  if (!primeiro) return []

  const quantos = diasNoMes(anoMes)
  const inicio = segundaDa(primeiro)
  const ultimo = somandoDias(primeiro, quantos - 1)
  const fim = somandoDias(segundaDa(ultimo), 6)

  const celulas: Celula[] = []
  for (let dia = inicio; doISO(dia) <= doISO(fim); dia = somandoDias(dia, 1)) {
    celulas.push({
      iso: dia,
      doMes: dia.slice(0, 7) === anoMes,
      quantas: contagem.get(dia) ?? 0,
    })
    /* Cinto de segurança: um `somandoDias` que devolvesse o original -- o que
       ele faz para data que não existe -- travaria o laço para sempre, e um
       laço infinito numa tela é o aparelho esquentando na mão dela. */
    if (celulas.length > 45) break
  }
  return celulas
}

/* Quantas consultas em cada dia. A entrada já vem com o dia LOCAL calculado --
   ver o cabeçalho. */
export function contarPorDia(consultas: { diaISO: string }[]): Map<string, number> {
  const conta = new Map<string, number>()
  for (const c of consultas) {
    if (!ehDataReal(c.diaISO)) continue
    conta.set(c.diaISO, (conta.get(c.diaISO) ?? 0) + 1)
  }
  return conta
}

/* "setembro de 2026". Minúsculo porque entra no meio de frase também; quem
   mostra como título aplica a maiúscula. */
export function nomeDoMes(anoMes: string): string {
  const mes = Number(anoMes.slice(5, 7))
  const ano = anoMes.slice(0, 4)
  if (!Number.isFinite(mes) || mes < 1 || mes > 12) return anoMes
  return MESES[mes - 1] + ' de ' + ano
}

/* "8 – 14 de setembro", e "29 de setembro – 5 de outubro" quando a semana
   atravessa. Escrever o mês duas vezes quando ele é o mesmo é ruído; omiti-lo
   quando ele muda é mentira. */
export function tituloDaSemana(iso: string): string {
  const dias = diasDaSemana(iso)
  if (dias.length !== 7) return ''

  const primeiro = dias[0]
  const ultimo = dias[6]
  const diaDe = (d: string) => String(Number(d.slice(8, 10)))
  const mesDeCurto = (d: string) => MESES[Number(d.slice(5, 7)) - 1] ?? ''

  if (primeiro.slice(0, 7) === ultimo.slice(0, 7)) {
    return diaDe(primeiro) + ' – ' + diaDe(ultimo) + ' de ' + mesDeCurto(primeiro)
  }
  return diaDe(primeiro) + ' de ' + mesDeCurto(primeiro) +
    ' – ' + diaDe(ultimo) + ' de ' + mesDeCurto(ultimo)
}

/* "Terça, 8 de setembro". O dia da semana entra porque é assim que ela pensa
   ("quinta que vem"), e a data porque "quinta" sozinho não diz qual. */
const DIAS_POR_EXTENSO = [
  'Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado',
]

export function tituloDoDia(iso: string): string {
  if (!ehDataReal(iso)) return ''
  const dia = diaDaSemana(iso)
  const nome = DIAS_POR_EXTENSO[dia] ?? ''
  return nome + ', ' + Number(iso.slice(8, 10)) + ' de ' + MESES[Number(iso.slice(5, 7)) - 1]
}

/* O dia de HOJE no fuso do aparelho, em ISO.
 *
 * `new Date().toISOString()` daria o dia em UTC, e a partir das 21h no Brasil
 * isso é AMANHÃ -- a agenda abriria no dia errado toda noite. */
export function hojeLocal(agora: Date = new Date()): string {
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const dia = String(agora.getDate()).padStart(2, '0')
  return agora.getFullYear() + '-' + mes + '-' + dia
}

/* O dia LOCAL de um instante do banco. Mesma razão do `hojeLocal`: uma consulta
   das 22h de segunda é de segunda para ela, e de terça para o UTC. */
export function diaLocalDe(iso: string): string {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  return hojeLocal(new Date(ms))
}

export { paraISO, somandoDias }
