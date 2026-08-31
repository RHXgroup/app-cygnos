/* O que costuma acontecer com ela nesta altura do ciclo.
 *
 * ── Por que isto é a peça que faltava ─────────────────────────────────────
 * Até aqui o app REGISTRAVA o ciclo. Registrar é operação. O que transforma
 * isso em acompanhamento é o app dizer, antes de ela perguntar: "a sua
 * menstruação deve vir em 4 dias, e nos seus últimos ciclos você teve cólica e
 * inchaço justamente nesses dias".
 *
 * ── E por que não é chute ─────────────────────────────────────────────────
 * Nada aqui vem de tabela de população. Vem dos ciclos DELA, e só sai quando
 * aparece em mais de um: um sintoma que aconteceu uma vez é um dia ruim, não um
 * padrão. Dizer "você fica assim" com base numa ocorrência ensinaria a pessoa a
 * não acreditar no aviso — e aí ele não serve mais nem quando estiver certo.
 *
 * ── O que ele NUNCA diz ───────────────────────────────────────────────────
 * Nada sobre relação, proteção ou nota privada. Não é só que aquilo não sobe
 * para a nutricionista: também não vira padrão, nem aviso, nem estatística. A
 * função não recebe esses campos.
 *
 * E nada de diagnóstico. "Você tem TPM" é laudo; "nos seus últimos 3 ciclos
 * você teve cólica nesses dias" é o que ela mesma registrou, devolvido.
 *
 * ── Só `import type` ──────────────────────────────────────────────────────
 * Roda fora do aparelho. */

import { ehDataReal, emDias, somandoDias } from './datas.ts'
import type { Ciclo } from './cicloDaPessoa'

/* O mínimo que a tela precisa saber de um dia. Sem os campos privados, de
   propósito: o que não chega aqui não pode virar aviso por descuido. */
export type DiaAnotado = {
  data: string
  sintomas: string[]
  humor: string | null
  desejoAlimentar: string[]
}

export type Padrao = {
  /* "cólica", "inchaço", "vontade de doce"… */
  o_que: string
  /* Em quantos ciclos ele apareceu nesta janela, e de quantos comparáveis. */
  em: number
  de: number
}


/* Quantos dias antes da menstruação contam como "os dias antes".
 *
 * Quatro. É a janela em que a queixa aparece na prática, e é a mesma que a
 * comparação de calorias já usa — duas janelas diferentes para o mesmo período
 * fariam a tela dizer duas coisas sobre a mesma semana. */
const DIAS_ANTES = 4

/* Em quantos ciclos o sintoma precisa aparecer para virar padrão.
 *
 * Dois. Um é um dia ruim; dois já é "costuma". Exigir três atrasaria o aviso
 * para o quarto mês de uso, e quase ninguém chega lá sem ver o app fazer algo
 * por ela antes. */
const MINIMO_DE_CICLOS = 2

const tudoDoDia = (d: DiaAnotado): string[] => [
  ...d.sintomas,
  ...(d.humor ? [`humor ${d.humor}`] : []),
  ...d.desejoAlimentar.map(v => `vontade de ${v}`),
]

/* O que costuma acontecer nos dias ANTES da menstruação.
 *
 * A janela é medida de trás para a frente a partir de cada começo registrado —
 * e não "do dia 24 ao 28", que só valeria para quem tem ciclo de 28. */
export function padraoAntesDaMenstruacao(
  ciclos: Ciclo[],
  dias: DiaAnotado[],
): Padrao[] {
  const comecos = ciclos
    .map(c => c.comecou)
    .filter(ehDataReal)
    .sort()

  /* Quantas vezes cada coisa apareceu, e em quantos ciclos DISTINTOS. Contar
     ocorrências e não ciclos faria três dias de cólica no mesmo mês parecerem
     três meses de cólica. */
  const emCiclos = new Map<string, Set<number>>()
  let comparaveis = 0

  for (let i = 0; i < comecos.length; i++) {
    const fim = comecos[i]
    const inicioDaJanela = somandoDias(fim, -DIAS_ANTES)

    /* O ciclo anterior tem de existir e ser plausível: sem isso, a "janela
       antes" do primeiro registro seria um pedaço de tempo sobre o qual não se
       sabe nada. */
    const anterior = comecos[i - 1]
    if (!anterior) continue
    const duracao = emDias(anterior, fim)
    if (duracao < 15 || duracao > 45) continue

    const naJanela = dias.filter(
      d => ehDataReal(d.data) && d.data >= inicioDaJanela && d.data < fim,
    )
    /* Ciclo em que ela não anotou nada naqueles dias não conta nem a favor nem
       contra: incluí-lo como "não teve" inventaria uma ausência. */
    if (naJanela.length === 0) continue

    comparaveis++
    for (const d of naJanela) {
      for (const o of tudoDoDia(d)) {
        if (!emCiclos.has(o)) emCiclos.set(o, new Set())
        emCiclos.get(o)?.add(i)
      }
    }
  }

  if (comparaveis < MINIMO_DE_CICLOS) return []

  return [...emCiclos]
    .map(([o_que, ciclosComEle]) => ({ o_que, em: ciclosComEle.size, de: comparaveis }))
    .filter(p => p.em >= MINIMO_DE_CICLOS)
    /* Do mais frequente para o menos. A tela mostra os primeiros, e o que
       importa é o que se repete. */
    .sort((a, b) => b.em - a.em || a.o_que.localeCompare(b.o_que))
}

export type Aviso = {
  /* A frase pronta. Nasce aqui, e não na tela, porque o que ela pode dizer
     depende do que os dados sustentam — e essa decisão é desta camada. */
  texto: string
  /* Quantos dias faltam para a próxima menstruação prevista. */
  faltam: number
}

const emLista = (itens: string[]): string =>
  itens.length <= 1
    ? (itens[0] ?? '')
    : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`

/* O aviso da semana, quando há o que avisar.
 *
 * Só sai perto da menstruação prevista, e só com padrão de verdade. Fora dessa
 * janela não há nada honesto a dizer, e um aviso permanente é um aviso que a
 * pessoa aprende a ignorar — e aí ele não funciona no dia em que importar. */
export function avisoDaSemana(
  proximaPrevista: string | null,
  irregular: boolean,
  padroes: Padrao[],
  hoje: string,
): Aviso | null {
  /* `ehDataReal` e não só o formato: "2026-02-31" passa no formato, não existe
     no calendário, e o JavaScript escorrega para 3 de março. Sem isto o app
     dizia "a sua menstruação deve vir em 6 dias" apoiado numa data inventada —
     uma sonda de entrada hostil pegou. */
  if (!ehDataReal(proximaPrevista) || !ehDataReal(hoje)) return null
  /* Ciclo irregular não ganha aviso: a data em que ele se apoia não vale, e
     avisar sobre "a semana que vem" com uma previsão que erra dias seria pior
     do que não avisar. */
  if (irregular) return null

  const faltam = emDias(hoje, proximaPrevista)
  /* De 7 a 1 dia antes. Antes disso é cedo demais para ser útil; depois, ela já
     está vivendo o que o aviso ia dizer. */
  if (faltam < 1 || faltam > 7) return null

  const fortes = padroes.filter(p => p.em >= MINIMO_DE_CICLOS).slice(0, 3)
  if (fortes.length === 0) return null

  const quando =
    faltam === 1 ? 'amanhã' : faltam <= 3 ? `em ${faltam} dias` : `daqui a ${faltam} dias`
  const quantos = fortes[0].de

  return {
    faltam,
    /* "Nos seus últimos N ciclos" e não "você vai ter": o app relata o que ela
       registrou, e não prevê o corpo dela. A diferença está na frase, e é ela
       que separa acompanhamento de adivinhação. */
    texto:
      `A sua menstruação deve vir ${quando}. ` +
      `Nos seus últimos ${quantos} ciclos, você anotou ${emLista(fortes.map(f => f.o_que))} ` +
      `nos dias antes.`,
  }
}
