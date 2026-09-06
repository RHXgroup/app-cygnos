import type { PlanoCompleto } from './plano'

/* Se o plano na tela é NOVIDADE — a decisão, sem tocar em armazenamento.
 *
 * ── De onde veio ──────────────────────────────────────────────────────────
 * Da bolinha de mensagem não lida, que funciona: "esse esquema de ficar uma
 * bolinha quando tem mensagem é muito bom, poderíamos colocar isso para os
 * itens do plano também". É o mesmo sinal — chegou coisa de fora, e você ainda
 * não viu — aplicado à única outra coisa deste app que muda sem o paciente
 * pedir: o plano que a nutricionista publica de lá.
 *
 * ── Por que não basta comparar o id do plano ──────────────────────────────
 * Porque ela edita o plano que já existe. Um plano novo troca o id e seria
 * pego; trocar o almoço de terça mantém o id, e é justamente o tipo de mudança
 * que a pessoa precisa saber que aconteceu — ela ia comer a versão antiga.
 *
 * ── E por que a assinatura é POR DIA DA SEMANA ────────────────────────────
 * Esta é a armadilha, e ela derrubaria a funcionalidade inteira sem dar erro
 * nenhum: `carregarPlanoDaNutri` devolve o plano JÁ FILTRADO para hoje. Uma
 * assinatura única do que está na tela mudaria da segunda para a terça, todas
 * as terças, para sempre — e a bolinha acenderia todo santo dia dizendo
 * "mudou" quando nada mudou.
 *
 * Bolinha que acende sem motivo é pior do que bolinha nenhuma: em duas semanas
 * ela ensina a pessoa a ignorar o ponto, e aí ele não vale mais nada no dia em
 * que a nutricionista de fato mexer no plano. Guardar uma assinatura por dia da
 * semana é o que faz "terça continua a mesma terça" ser uma pergunta
 * respondível.
 *
 * ── Nada disso é dado de saúde ────────────────────────────────────────────
 * A marca fica no aparelho (ver planoVisto.ts). Quem trocar de telefone vê a
 * bolinha uma vez a mais, e isso não é problema nenhum. */

export type MarcaDoPlano = {
  /* Qual plano estava valendo. Plano trocado zera as assinaturas dos dias: as
     do plano anterior não dizem nada sobre este. */
  planoId: string
  /* Dia da semana (0 a 6, como `Date.getDay`) → assinatura daquele dia. */
  porDia: Record<string, string>
}

/* O conteúdo do plano virado texto, para poder ser comparado.
 *
 * Entra o que a pessoa LÊ na tela: quais refeições, a que horas, com que
 * alimentos e quanto de cada um. Fica de fora tudo o que muda sem mudar o que
 * ela vai comer — nome do plano, observação, o dia para o qual foi filtrado.
 *
 * Ordenado antes de juntar. A ordem das linhas vem do banco e não é garantida;
 * sem ordenar, uma consulta que voltasse na ordem trocada acenderia a bolinha
 * sozinha, e o defeito seria intermitente — o pior tipo de todos. */
export function assinaturaDoPlano(plano: PlanoCompleto | null): string {
  if (!plano) return ''
  return plano.refeicoes
    .map(r => {
      const itens = r.itens
        .map(i => `${i.id}:${i.gramasTotais ?? ''}`)
        .sort()
        .join(',')
      return `${r.id}|${r.hora}|${r.rotulo}|${itens}`
    })
    .sort()
    .join(';')
}

/* Se há novidade para mostrar HOJE.
 *
 * O silêncio no primeiro encontro é de propósito, e é o caso 3 abaixo: sem
 * marca guardada, ou sem assinatura daquele dia, a resposta é NÃO. Quem instala
 * o app e já tem plano não recebe um aviso de "plano novo" sobre uma coisa que
 * sempre esteve lá — e quem abre o app numa quinta pela primeira vez não é
 * avisado de que quinta-feira existe.
 *
 * O preço é conhecido e é o lado certo de errar: a primeira publicação de cada
 * dia passa calada, e a partir dali toda mudança acende. Bolinha que erra para
 * menos é uma bolinha que ninguém aprende a ignorar. */
export function temNovidade(
  marca: MarcaDoPlano | null,
  plano: PlanoCompleto | null,
  dia: number,
): boolean {
  if (!plano) return false
  if (!marca) return false

  /* Plano TROCADO: ela publicou outro. Isso é novidade em qualquer dia, e não
     depende de assinatura nenhuma. */
  if (marca.planoId !== plano.id) return true

  const guardada = marca.porDia[String(dia)]
  if (guardada === undefined) return false

  return guardada !== assinaturaDoPlano(plano)
}

/* A marca depois de a pessoa ter visto o plano de hoje.
 *
 * Plano trocado ZERA os outros dias: as assinaturas guardadas eram do plano
 * anterior, e mantê-las faria a primeira visita a cada dia do plano novo ser
 * comparada com o cardápio de um plano que já não existe — a bolinha acenderia
 * seis vezes seguidas por uma troca só. */
export function marcaAtualizada(
  marca: MarcaDoPlano | null,
  plano: PlanoCompleto,
  dia: number,
): MarcaDoPlano {
  const base = marca && marca.planoId === plano.id ? marca.porDia : {}
  return {
    planoId: plano.id,
    porDia: { ...base, [String(dia)]: assinaturaDoPlano(plano) },
  }
}
