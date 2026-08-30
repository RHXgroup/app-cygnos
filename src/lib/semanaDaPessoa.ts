/* O que a semana dela rendeu — o cartão que aparece uma vez por semana.
 *
 * ── Por que cartão, e não aba ─────────────────────────────────────────────
 * Aba se precisa lembrar de visitar, e por isso é esquecida — o próprio
 * Relatórios provou isso quando saiu da barra. Cartão é EVENTO: aparece na tela
 * inicial, é lido, e some. Lugar a pessoa esquece; evento ela encontra.
 *
 * ── O que ele mostra, e o que ele NÃO mostra ──────────────────────────────
 * Só o que tem dado. Uma linha de "0 treinos" para quem nunca registrou treino
 * não é devolução: é cobrança, e cobrança é o que faz alguém fechar o app.
 *
 * A comparação é sempre com os 7 dias ANTERIORES, não com uma meta abstrata.
 * "Você treinou 3 vezes, uma a mais que na semana passada" é sobre ela; "você
 * está 40% abaixo do recomendado" é sobre outra pessoa.
 *
 * ── Tipos próprios, e não os das libs ─────────────────────────────────────
 * Este arquivo não importa nada de execução — é a regra do projeto, e é o que
 * permite exercitá-lo fora do aparelho. Os tipos de entrada são o MÍNIMO que a
 * conta precisa, então quem chama monta a partir do que já tem em memória. */

export type DiaComData = { data: string }
export type SessaoDaSemana = DiaComData & { duracaoMin: number | null }
export type PesoDaSemana = DiaComData & { kg: number }
export type ConsumoDaSemana = DiaComData & { calorias: number | null }
export type AguaDaSemana = DiaComData & { ml: number }

export type Linha = {
  /* Um ícone que a tela escolhe. Fica aqui porque o que se destaca depende do
     que a linha DIZ, e isso é decisão da conta, não da pintura. */
  chave: 'treino' | 'peso' | 'calorias' | 'agua' | 'constancia'
  texto: string
  /* Verdadeiro quando é uma conquista — a tela pinta diferente. Falso não é
     "ruim": é neutro, e a tela não deve dramatizar. */
  bom: boolean
}

export type Semana = {
  de: string
  ate: string
  linhas: Linha[]
  /* Sem nada a dizer, o cartão não aparece. Um cartão semanal vazio ensina a
     ignorar o cartão semanal. */
  vazia: boolean
}

const DIA = 86400000
const ISO = /^\d{4}-\d{2}-\d{2}$/

const doISO = (iso: string) => Date.parse(iso + 'T00:00:00Z')
const paraISO = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const somando = (iso: string, dias: number) => paraISO(doISO(iso) + dias * DIA)

const naFaixa = <T extends DiaComData>(itens: T[], de: string, ate: string): T[] =>
  itens.filter(i => ISO.test(i.data) && i.data >= de && i.data <= ate)

/* Um número com vírgula, sem casa quando é redondo. "0,8 kg" e "2 kg". */
const kg = (n: number) => {
  const arredondado = Math.round(Math.abs(n) * 10) / 10
  return Number.isInteger(arredondado)
    ? String(arredondado)
    : arredondado.toFixed(1).replace('.', ',')
}

const plural = (n: number, um: string, muitos: string) => (n === 1 ? um : muitos)

export function semanaDaPessoa(entrada: {
  hoje: string
  sessoes: SessaoDaSemana[]
  pesos: PesoDaSemana[]
  consumo: ConsumoDaSemana[]
  agua: AguaDaSemana[]
  metaDeAguaMl: number | null
  metaDeCalorias: number | null
}): Semana {
  const { hoje } = entrada
  const de = somando(hoje, -6)
  const deAntes = somando(hoje, -13)
  const ateAntes = somando(hoje, -7)

  const linhas: Linha[] = []

  /* ── Treino ──────────────────────────────────────────────────────────── */
  const treinos = naFaixa(entrada.sessoes, de, hoje).length
  const treinosAntes = naFaixa(entrada.sessoes, deAntes, ateAntes).length
  if (treinos > 0) {
    const minutos = naFaixa(entrada.sessoes, de, hoje)
      .map(s => s.duracaoMin ?? 0)
      .reduce((a, b) => a + b, 0)
    const diferenca = treinos - treinosAntes
    linhas.push({
      chave: 'treino',
      texto:
        `${treinos} ${plural(treinos, 'treino', 'treinos')}` +
        (minutos > 0 ? `, ${minutos} min no total` : '') +
        (treinosAntes === 0
          ? ''
          : diferenca > 0
            ? ` — ${diferenca} a mais que na semana passada`
            : diferenca < 0
              ? ` — ${Math.abs(diferenca)} a menos que na semana passada`
              : ' — o mesmo da semana passada'),
      bom: treinos >= treinosAntes,
    })
  }

  /* ── Peso ────────────────────────────────────────────────────────────── */
  const pesagens = naFaixa(entrada.pesos, de, hoje).sort((a, b) => a.data.localeCompare(b.data))
  /* Duas pesagens na semana, no mínimo: com uma só não há variação, e mostrar
     "você está com 72 kg" não é devolução — é repetir o que ela digitou. */
  if (pesagens.length >= 2) {
    const variacao = pesagens[pesagens.length - 1].kg - pesagens[0].kg
    /* Menos de 200 g em uma semana é ruído de balança, e chamar isso de
       progresso ensina a não acreditar no número. */
    if (Math.abs(variacao) >= 0.2) {
      linhas.push({
        chave: 'peso',
        texto: `${variacao < 0 ? '−' : '+'}${kg(variacao)} kg nesta semana`,
        /* Sem julgar a direção: quem ganha massa e quem emagrece leem a mesma
           tela, e um alvo transformaria uma das duas leituras em fracasso. */
        bom: true,
      })
    }
  }

  /* ── Calorias ────────────────────────────────────────────────────────── */
  const diasComCalorias = naFaixa(entrada.consumo, de, hoje).filter(c => c.calorias !== null)
  if (diasComCalorias.length >= 3) {
    const media = Math.round(
      diasComCalorias.reduce((a, c) => a + (c.calorias ?? 0), 0) / diasComCalorias.length,
    )
    const meta = entrada.metaDeCalorias
    linhas.push({
      chave: 'calorias',
      texto:
        `média de ${media.toLocaleString('pt-BR')} kcal por dia` +
        (meta ? `, com meta de ${meta.toLocaleString('pt-BR')}` : ''),
      bom: meta === null || Math.abs(media - meta) <= meta * 0.1,
    })
  }

  /* ── Água ────────────────────────────────────────────────────────────── */
  const meta = entrada.metaDeAguaMl
  if (meta && meta > 0) {
    const porDia = new Map<string, number>()
    for (const g of naFaixa(entrada.agua, de, hoje)) {
      porDia.set(g.data, (porDia.get(g.data) ?? 0) + g.ml)
    }
    const bateu = [...porDia.values()].filter(ml => ml >= meta).length
    if (bateu > 0) {
      linhas.push({
        chave: 'agua',
        texto: `bateu a meta de água em ${bateu} ${plural(bateu, 'dia', 'dias')}`,
        bom: bateu >= 4,
      })
    }
  }

  /* ── Constância ──────────────────────────────────────────────────────── */
  /* Em quantos dias ela registrou QUALQUER coisa. É a única linha que fala do
     uso do app, e ela existe porque constância é o que produz todo o resto. */
  const comAlgo = new Set<string>()
  for (const i of naFaixa(entrada.consumo, de, hoje)) comAlgo.add(i.data)
  for (const i of naFaixa(entrada.agua, de, hoje)) comAlgo.add(i.data)
  for (const i of naFaixa(entrada.sessoes, de, hoje)) comAlgo.add(i.data)
  for (const i of naFaixa(entrada.pesos, de, hoje)) comAlgo.add(i.data)
  if (comAlgo.size >= 5) {
    linhas.push({
      chave: 'constancia',
      texto: `anotou alguma coisa em ${comAlgo.size} dos 7 dias`,
      bom: true,
    })
  }

  return { de, ate: hoje, linhas, vazia: linhas.length === 0 }
}
