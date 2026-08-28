import { supabase } from './supabase'
import { falha } from './erros'
import { dataNumerica, milhar } from './formatar'

/* O que a nutricionista tem para este paciente.
 *
 * Ver a migração 20260803000003 no repo web. Uma chamada só, e é o BANCO que
 * resolve o vínculo: `app_conteudo_da_nutricionista` é security definer porque
 * esses dados moram nas tabelas do sistema web, chaveadas por `paciente_id`, e
 * a conta do app é `app_contas.id = auth.uid()` — sem parentesco nenhum com
 * elas até existir a linha em `app_vinculos`.
 *
 * A função devolve ZERO linhas quando a conta não está vinculada a paciente
 * nenhum. Isso não é erro: é o estado normal de quem acabou de se cadastrar, e
 * a tela responde mostrando o catálogo em vez da ficha.
 *
 * Só o resumo mora aqui — "existe? quantos? de quando?". O conteúdo de cada
 * item sai em função própria, quando cada tela de detalhe existir. */

export type ResumoContagem = {
  total: number
  /* ISO (yyyy-mm-dd) do registro mais recente, ou null quando não há nenhum. */
  data: string | null
}

export type ConteudoNutri = {
  pacienteId: number
  anamnese: ResumoContagem
  antropometria: ResumoContagem
  fotos: ResumoContagem
  /* null quando não há plano ATIVO. O app mostra só o vigente — histórico e
     rascunho são assunto do sistema web, não daqui. */
  plano: { id: number; titulo: string | null; data: string | null } | null
  /* null quando a nutricionista nunca calculou. `get` é o gasto energético
     total, o número que a pessoa reconhece como "minhas calorias". */
  energetico: { id: number; get: number | null; data: string | null } | null
}

export type ResultadoConteudo =
  | { tipo: 'ok'; conteudo: ConteudoNutri | null }
  | { tipo: 'erro'; mensagem: string }

type Linha = {
  paciente_id: number
  anamnese_total: number
  anamnese_data: string | null
  antropometria_total: number
  antropometria_data: string | null
  fotos_total: number
  fotos_data: string | null
  plano_id: number | null
  plano_titulo: string | null
  plano_data: string | null
  energetico_id: number | null
  energetico_get: number | null
  energetico_data: string | null
}

export async function carregarConteudo(): Promise<ResultadoConteudo> {
  const { data, error } = await supabase.rpc('app_conteudo_da_nutricionista')

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui carregar o seu acompanhamento. Verifique a conexão.', error),
    }

  const linha = ((data ?? []) as Linha[])[0]
  if (!linha) return { tipo: 'ok', conteudo: null }

  return {
    tipo: 'ok',
    conteudo: {
      pacienteId: linha.paciente_id,
      anamnese:      { total: linha.anamnese_total ?? 0,      data: linha.anamnese_data },
      antropometria: { total: linha.antropometria_total ?? 0, data: linha.antropometria_data },
      fotos:         { total: linha.fotos_total ?? 0,         data: linha.fotos_data },
      plano: linha.plano_id
        ? { id: linha.plano_id, titulo: linha.plano_titulo, data: linha.plano_data }
        : null,
      energetico: linha.energetico_id
        ? { id: linha.energetico_id, get: linha.energetico_get, data: linha.energetico_data }
        : null,
    },
  }
}

/* ── O conteúdo de cada item ───────────────────────────────────────────────
 *
 * Ver a migração 20260803000005. Uma função por conteúdo, e não uma genérica
 * que recebe o tipo: cada um tem forma própria, e assinatura tipada é o que faz
 * o app saber o que recebeu.
 *
 * Todas repetem o mesmo portão do lado do banco (`app_paciente_da_conta`), então
 * lista vazia aqui significa "não há nada disso" OU "esta conta não está
 * vinculada" — indistinguíveis, e de propósito: a tela só chega a chamá-las
 * depois de o resumo ter dito que há vínculo. */

export type CampoAnamnese = {
  tipo: string
  label: string
  /* string, boolean, ou lista de objetos quando o campo é um grupo repetível
     ("Exercícios praticados" com uma linha por exercício). O jsonb vem do que a
     tela do web gravou; nada garante o formato campo a campo. */
  valor: unknown
}

export type SecaoAnamnese = { titulo: string; campos: CampoAnamnese[] }

export type Anamnese = {
  id: number
  titulo: string | null
  templateNome: string | null
  data: string | null
  secoes: SecaoAnamnese[]
}

export type Avaliacao = {
  id: number
  data: string | null
  tipo: string | null
  peso: number | null
  altura: number | null
  imc: number | null
  gorduraPct: number | null
  massaGorda: number | null
  massaMagra: number | null
  cintura: number | null
  quadril: number | null
  rcq: number | null
  braco: number | null
  coxa: number | null
  panturrilha: number | null
  observacoes: string | null
}

export type ItemDoPlano = {
  id: number
  rotulo: string
  quantidadeG: number | null
  medidaCaseira: string | null
  energiaKcal: number | null
}

export type RefeicaoDoPlano = {
  id: number
  nome: string
  horario: string | null
  itens: ItemDoPlano[]
}

/* Um dia do plano, com o cardápio dele.
 *
 * `dia` segue a convenção do SISTEMA WEB — 0 = segunda … 6 = domingo — que NÃO é
 * a do `Date.getDay()` usada pelos planos do próprio app. Por isso os nomes saem
 * de DIAS_DO_PLANO aqui embaixo, e nunca de DIAS_CURTOS: aquele array é indexado
 * por getDay e mostraria toda refeição um dia atrasada.
 *
 * Null quando a refeição não tem dia — não deveria acontecer, mas a coluna
 * aceita, e uma refeição sem dia sumindo da tela é pior do que ela aparecer
 * solta. */
export type DiaDoPlano = {
  dia: number | null
  refeicoes: RefeicaoDoPlano[]
}

export type PlanoDaNutri = {
  id: number
  titulo: string | null
  descricao: string | null
  dias: DiaDoPlano[]
}

/* Os nomes na ordem do plano do web. Ver o array gêmeo em
   PlanejamentoAlimentar.tsx, no repo do sistema. */
export const DIAS_DO_PLANO = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
export const DIAS_DO_PLANO_CURTOS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

/* Hoje, na convenção do plano. `getDay()` dá 0 para domingo e o plano dá 6. */
export const diaDeHojeNoPlano = () => (new Date().getDay() + 6) % 7

export type Energetico = {
  id: number
  data: string | null
  tmb: number | null
  getTotal: number | null
  formula: string | null
  fatorAtividade: number | null
  peso: number | null
  altura: number | null
  idade: number | null
  proteinaGkg: number | null
  carboPct: number | null
  observacoes: string | null
}

const numero = (v: unknown): number | null =>
  v == null || v === '' ? null : Number(v)

export async function carregarAnamneses(): Promise<Anamnese[]> {
  const { data, error } = await supabase.rpc('app_anamnese_do_paciente')
  if (error) throw new Error(error.message)

  return ((data ?? []) as any[]).map(l => ({
    id: l.id,
    titulo: l.titulo,
    templateNome: l.template_nome,
    data: l.data,
    /* O jsonb é preenchido por outro sistema: filtrar em vez de confiar. Uma
       seção sem `campos` viraria um `.map` de undefined no meio da tela. */
    secoes: Array.isArray(l.secoes)
      ? l.secoes
          .filter((s: any) => s && Array.isArray(s.campos))
          .map((s: any) => ({
            titulo: typeof s.titulo === 'string' ? s.titulo : '',
            campos: s.campos.filter((c: any) => c && typeof c.label === 'string'),
          }))
      : [],
  }))
}

export async function carregarAvaliacoes(): Promise<Avaliacao[]> {
  const { data, error } = await supabase.rpc('app_antropometria_do_paciente')
  if (error) throw new Error(error.message)

  return ((data ?? []) as any[]).map(l => ({
    id: l.id,
    data: l.data,
    tipo: l.tipo,
    peso: numero(l.peso),
    altura: numero(l.altura),
    imc: numero(l.imc),
    gorduraPct: numero(l.gordura_pct),
    massaGorda: numero(l.massa_gorda),
    massaMagra: numero(l.massa_magra),
    cintura: numero(l.cintura),
    quadril: numero(l.quadril),
    rcq: numero(l.rcq),
    braco: numero(l.braco),
    coxa: numero(l.coxa),
    panturrilha: numero(l.panturrilha),
    observacoes: l.observacoes,
  }))
}

/* A RPC devolve uma linha por ITEM, com plano, dia e refeição repetidos. O
   agrupamento é aqui — em SQL viraria um json montado à mão que ninguém lê
   depois. Refeição sem item nenhum chega com item_id nulo e entra na lista
   vazia, em vez de sumir: "Ceia" no plano sem nada dentro é informação.

   Dois níveis de agrupamento, e o de fora é o DIA. Um plano de rotina do web
   guarda o mesmo cardápio repetido em cada dia marcado — seis dias de café,
   almoço, lanche e jantar são trinta e poucas refeições em sequência. A tela
   mostra um dia de cada vez, e para isso precisa deles separados. */
export async function carregarPlano(): Promise<PlanoDaNutri | null> {
  const { data, error } = await supabase.rpc('app_plano_do_paciente')
  if (error) throw new Error(error.message)

  const linhas = (data ?? []) as any[]
  if (linhas.length === 0) return null

  const dias: DiaDoPlano[] = []
  /* Por id da refeição, e não pelo `find` dentro do dia: o mesmo cardápio
     replicado em seis dias tem seis refeições DIFERENTES (ids próprios), e é o
     id que diz em qual delas o item entra. */
  const porRefeicao = new Map<number, RefeicaoDoPlano>()

  for (const l of linhas) {
    /* Plano que existe e ainda não tem cardápio chega em UMA linha, com a
       refeição nula (ver a migração 20260803000006). Sai daqui com `dias` vazio,
       que a tela lê como "ainda não tem refeições montadas" — e não como "você
       não tem plano", que é o que zero linhas significa. */
    if (l.refeicao_id == null) continue

    let refeicao = porRefeicao.get(l.refeicao_id)

    if (!refeicao) {
      refeicao = {
        id: l.refeicao_id,
        nome: l.refeicao_nome ?? 'Refeição',
        horario: l.horario,
        itens: [],
      }
      porRefeicao.set(l.refeicao_id, refeicao)

      /* A RPC já vem ordenada por dia e por ordem da refeição, então empurrar na
         ordem de chegada preserva as duas — sem reordenar nada aqui. */
      let dia = dias.find(d => d.dia === (l.dia_semana ?? null))
      if (!dia) {
        dia = { dia: l.dia_semana ?? null, refeicoes: [] }
        dias.push(dia)
      }
      dia.refeicoes.push(refeicao)
    }

    if (l.item_id != null) {
      refeicao.itens.push({
        id: l.item_id,
        rotulo: l.rotulo ?? 'Item sem nome',
        quantidadeG: numero(l.quantidade_g),
        medidaCaseira: l.medida_caseira,
        energiaKcal: numero(l.energia_kcal),
      })
    }
  }

  return {
    id: linhas[0].plano_id,
    titulo: linhas[0].plano_titulo,
    descricao: descricaoDeVerdade(linhas[0].plano_descricao),
    dias,
  }
}

/* `planos_alimentares.descricao` não é só descrição: o web grava a palavra
   "rotina" nela para marcar plano de semana inteira (ver PlanejamentoAlimentar,
   no repo do sistema). Mostrar isso como texto explicativo põe a palavra solta
   embaixo do título, sem querer dizer nada para quem lê. */
function descricaoDeVerdade(bruta: string | null): string | null {
  const texto = bruta?.trim()
  if (!texto || texto.toLowerCase() === 'rotina') return null
  return texto
}

export async function carregarEnergetico(): Promise<Energetico | null> {
  const { data, error } = await supabase.rpc('app_energetico_do_paciente')
  if (error) throw new Error(error.message)

  const l = ((data ?? []) as any[])[0]
  if (!l) return null

  return {
    id: l.id,
    data: l.data,
    tmb: numero(l.tmb),
    getTotal: numero(l.get_total),
    formula: l.formula,
    fatorAtividade: numero(l.fator_atividade),
    peso: numero(l.peso),
    altura: numero(l.altura),
    idade: numero(l.idade),
    proteinaGkg: numero(l.proteina_gkg),
    carboPct: numero(l.carbo_pct),
    observacoes: l.observacoes,
  }
}

/* ── Apresentação ──────────────────────────────────────────────────────────*/

/* A data vem do Postgres como "yyyy-mm-dd" pelado. `new Date()` em cima disso
   interpreta como UTC e, num fuso negativo como o nosso, devolve o dia
   ANTERIOR — a avaliação de segunda vira domingo na tela. Por isso os pedaços
   são montados à mão, no fuso local. */
function daDataISO(iso: string): Date {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return new Date(ano, mes - 1, dia)
}

export function dataLegivel(iso: string | null): string | null {
  return iso ? dataNumerica(daDataISO(iso)) : null
}

/* A linha de apoio de cada item da lista.
 *
 * O que está vazio diz que está vazio, e não some: uma lista que encolhe
 * conforme o que existe esconde da pessoa que aquilo existe como possibilidade.
 * "Ainda não registrada" é informação; a ausência da linha não é. */
export function descricaoDeContagem(
  resumo: ResumoContagem,
  singular: string,
  plural: string,
  vazio: string,
): string {
  if (resumo.total === 0) return vazio

  const quantidade = `${resumo.total} ${resumo.total === 1 ? singular : plural}`
  const quando = dataLegivel(resumo.data)
  return quando ? `${quantidade} · última em ${quando}` : quantidade
}

export function descricaoDoPlano(plano: ConteudoNutri['plano']): string {
  if (!plano) return 'Nenhum plano ativo no momento'
  return plano.titulo?.trim() || 'Plano alimentar ativo'
}

export function descricaoDoEnergetico(energetico: ConteudoNutri['energetico']): string {
  if (!energetico) return 'Ainda não calculado'
  if (energetico.get == null) return 'Calculado'

  const quando = dataLegivel(energetico.data)
  const kcal = `${milhar(energetico.get)} kcal por dia`
  return quando ? `${kcal} · ${quando}` : kcal
}
