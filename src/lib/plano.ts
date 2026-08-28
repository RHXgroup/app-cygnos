import { porcao } from './alimentos'
import { DIAS_CURTOS } from './formatar'
import { supabase } from './supabase'

/* ── Dias da semana ────────────────────────────────────────────────────────
   0 = domingo … 6 = sábado, a numeração de Date.getDay(). Guardar no mesmo
   índice que o relógio do aparelho usa é o que deixa "o plano vale hoje?"
   caber numa linha, sem tabela de conversão no meio. */
export type DiaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6

/* Um plano é uma rotina, não um dia solto: ele nasce valendo de segunda a
   sábado, que é a semana de quem come fora de casa no fim de semana. Domingo
   fica a um toque de distância na tela do resumo. */
export const DIAS_PADRAO: DiaSemana[] = [1, 2, 3, 4, 5, 6]

export const TODOS_OS_DIAS: DiaSemana[] = [0, 1, 2, 3, 4, 5, 6]

const mesmoConjunto = (a: DiaSemana[], b: DiaSemana[]) =>
  a.length === b.length && b.every(d => a.includes(d))

/* "De segunda a sábado", "Seg · Qua · Sex". Os casos com nome próprio vêm
   primeiro porque é assim que se fala: ninguém diz "seg, ter, qua, qui e sex"
   quando quer dizer "durante a semana". */
export function resumoDosDias(dias: DiaSemana[]): string {
  if (dias.length === 0) return 'Nenhum dia'
  if (mesmoConjunto(dias, TODOS_OS_DIAS)) return 'Todos os dias'
  if (mesmoConjunto(dias, [1, 2, 3, 4, 5, 6])) return 'De segunda a sábado'
  if (mesmoConjunto(dias, [1, 2, 3, 4, 5])) return 'De segunda a sexta'
  if (mesmoConjunto(dias, [0, 6])) return 'Fins de semana'

  return [...dias]
    .sort((a, b) => a - b)
    .map(d => DIAS_CURTOS[d])
    .join(' · ')
}

/* O plano vale no dia de hoje? É o que decide se a tela inicial mostra as
   refeições como as de hoje ou avisa que hoje está livre. */
export const valeHoje = (dias: DiaSemana[], hoje = new Date()) =>
  dias.includes(hoje.getDay() as DiaSemana)

/* Nutrientes de um item: os valores POR 100 g, como vêm da base, mais o peso da
   porção escolhida. É a forma mínima de que a soma precisa, e por isso ela é
   compartilhada — o item que está sendo montado na tela e o que voltou do banco
   somam pelo mesmo caminho, sem duas contas de calorias para discordarem. */
export type Nutrientes = {
  /* NULL quando a quantidade foi dita em medida caseira sem peso. O item conta
     no plano, mas fica de fora do somatório: zero seria mentira e somaria como
     se fosse verdade. */
  gramasTotais: number | null
  caloriasPor100g: number | null
  proteinasPor100g: number | null
  carboidratosPor100g: number | null
  gordurasPor100g: number | null
  fibrasPor100g: number | null
}

/* Um alimento escolhido do catálogo com a quantidade já informada. É o que a
   tela de busca devolve — e serve igual para virar item da refeição, para
   substituir um item ou para entrar como variação dele. */
export type AlimentoEscolhido = Nutrientes & {
  /* Chave da linha na tela. O mesmo alimento pode entrar duas vezes na mesma
     refeição (dois pães, quantidades diferentes), então o id do alimento não
     serve de identidade. */
  chave: string
  /* NULL quando o alimento saiu do catálogo depois de escolhido. O item
     continua inteiro — nome e nutrientes estão copiados aqui. */
  alimentoId: number | null
  nome: string
  marca: string | null
  /* Como a pessoa informou: "150 g" ou "2 unidades". É isto que aparece na
     tela, na forma em que foi dito. */
  descricao: string
}

export type ItemAlimento = AlimentoEscolhido & {
  /* O "ou" do item: arroz OU macarrão OU batata. São alternativas, então NÃO
     entram em soma nenhuma — quem escolhe qual vai no prato é a pessoa, na
     hora, e o plano não tem como saber qual foi. */
  variacoes: AlimentoEscolhido[]
}

/* Uma refeição pronta para virar linha no banco. */
export type RefeicaoMontada = {
  /* Identidade só na tela: o banco reordena tudo pela posição no array. Existe
     porque a lista é editável, e índice de array não serve de key quando linhas
     entram e saem do meio. */
  chave: string
  rotulo: string
  hora: string
  itens: ItemAlimento[]
}

/* Chaves de linha da tela. Um contador de módulo, e não Math.random nem
   Date.now: dois itens adicionados no mesmo milissegundo colidiriam. */
let sequencia = 0
export const novaChave = () => `linha-${++sequencia}`

/* ── Totais ────────────────────────────────────────────────────────────────
   Cada nutriente pode ser null: a base não tem tudo de todo alimento, e um
   zero no lugar do desconhecido vira um total errado que ninguém questiona. */
export type Totais = {
  calorias: number | null
  proteinas: number | null
  carboidratos: number | null
  gorduras: number | null
  fibras: number | null
  /* Itens que ficaram de fora por não terem peso informado. */
  semPeso: number
  /* Itens com peso, mas sem caloria na base: a soma sai por baixo e a tela
     precisa poder dizer isso. */
  semCaloria: number
}

type CampoNutriente = Exclude<keyof Nutrientes, 'gramasTotais'>

function somar(itens: Nutrientes[], campo: CampoNutriente): number | null {
  let total = 0
  let houve = false

  for (const item of itens) {
    if (item.gramasTotais === null) continue
    const v = porcao(item[campo], item.gramasTotais)
    if (v === null) continue
    total += v
    houve = true
  }

  /* Nenhum item trouxe este nutriente: o certo é não ter total, e não ter
     total zero. */
  return houve ? total : null
}

export function totaisDe(itens: Nutrientes[]): Totais {
  return {
    calorias: somar(itens, 'caloriasPor100g'),
    proteinas: somar(itens, 'proteinasPor100g'),
    carboidratos: somar(itens, 'carboidratosPor100g'),
    gorduras: somar(itens, 'gordurasPor100g'),
    fibras: somar(itens, 'fibrasPor100g'),
    semPeso: itens.filter(i => i.gramasTotais === null).length,
    semCaloria: itens.filter(i => i.gramasTotais !== null && i.caloriasPor100g === null).length,
  }
}

/* Quanto cada macro rende de energia. São os fatores de Atwater arredondados,
   os mesmos que qualquer rótulo usa. */
const KCAL_POR_GRAMA = { proteinas: 4, carboidratos: 4, gorduras: 9 } as const

/* Quanto das calorias vem de cada macro, em fração de 0 a 1.
 *
 * A base é a energia calculada a partir dos próprios macros, e NÃO o total de
 * calorias do campo `calorias`: os dois quase nunca batem — a tabela traz
 * caloria medida, e sobram fibra e álcool que não entram na conta 4/4/9. Contra
 * o total medido, as três fatias não fechariam 100% e a barra ficaria com uma
 * sobra sem nome. */
export function fracaoDosMacros(t: Totais): { proteinas: number; carboidratos: number; gorduras: number } {
  const p = (t.proteinas ?? 0) * KCAL_POR_GRAMA.proteinas
  const c = (t.carboidratos ?? 0) * KCAL_POR_GRAMA.carboidratos
  const g = (t.gorduras ?? 0) * KCAL_POR_GRAMA.gorduras
  const energia = p + c + g

  if (energia <= 0) return { proteinas: 0, carboidratos: 0, gorduras: 0 }
  return { proteinas: p / energia, carboidratos: c / energia, gorduras: g / energia }
}

/* ── Gravar ────────────────────────────────────────────────────────────────
   Uma chamada só, para uma função que grava as quatro tabelas na mesma
   transação — ver as migrações 20260731000000 e 20260731000002. Inserts soltos
   daqui deixariam um plano vazio na lista se a rede caísse no meio. */
export type ResultadoSalvar = { tipo: 'ok'; planoId: string } | { tipo: 'erro'; mensagem: string }

/* O alimento no formato das colunas do banco. Serve para o item e para a
   variação, que guardam exatamente os mesmos campos. */
const paraOBanco = (a: AlimentoEscolhido) => ({
  alimento_id: a.alimentoId,
  nome: a.nome,
  marca: a.marca,
  descricao: a.descricao,
  gramas: a.gramasTotais,
  calorias: a.caloriasPor100g,
  proteinas: a.proteinasPor100g,
  carboidratos: a.carboidratosPor100g,
  gorduras: a.gordurasPor100g,
  fibras: a.fibrasPor100g,
})

export async function salvarPlano({
  planoId,
  nome,
  observacao,
  diasSemana,
  refeicoes,
}: {
  /* null grava um plano novo; preenchido, regrava o que já existe. */
  planoId: string | null
  nome: string
  observacao: string
  diasSemana: DiaSemana[]
  refeicoes: RefeicaoMontada[]
}): Promise<ResultadoSalvar> {
  const { data, error } = await supabase.rpc('app_salvar_plano', {
    p_plano_id: planoId,
    p_nome: nome.trim(),
    p_observacao: observacao.trim() || null,
    /* Ordenado na saída: é assim que a lista vai ser lida de volta e mostrada,
       e o banco não promete devolver array na ordem em que ele chegou. */
    p_dias_semana: [...diasSemana].sort((a, b) => a - b),
    p_refeicoes: refeicoes.map(r => ({
      rotulo: r.rotulo,
      hora: r.hora,
      itens: r.itens.map(i => ({
        ...paraOBanco(i),
        variacoes: i.variacoes.map(paraOBanco),
      })),
    })),
  })

  /* A mensagem crua junto: sem ela, "sem internet", "migração não aplicada" e
     "constraint recusou" viram o mesmo aviso genérico na tela. */
  if (error) return { tipo: 'erro', mensagem: error.message }
  return { tipo: 'ok', planoId: data as string }
}

/* ── Ler ───────────────────────────────────────────────────────────────────*/
export type VariacaoSalva = Nutrientes & {
  id: string
  alimentoId: number | null
  nome: string
  marca: string | null
  descricao: string
}

export type ItemSalvo = VariacaoSalva & {
  variacoes: VariacaoSalva[]
}

export type RefeicaoSalva = {
  id: string
  rotulo: string
  hora: string
  itens: ItemSalvo[]
}

export type PlanoCompleto = {
  id: string
  nome: string
  observacao: string | null
  criadoEm: string
  /* O plano que a tela inicial mostra. Um por conta — quem garante é um índice
     parcial no banco, não a boa vontade das telas. */
  ativo: boolean
  diasSemana: DiaSemana[]
  refeicoes: RefeicaoSalva[]
  /* Verdadeiro quando o plano veio do sistema da nutricionista, e não das
     tabelas do app (ver lib/planoDaNutri.ts). Serve para a tela não oferecer
     edição de uma coisa que o app não pode editar: o plano é dela, e quem
     altera é ela, de lá. Ausente nos planos que o próprio paciente monta. */
  daNutricionista?: boolean
}

export type ResultadoPlano =
  /* plano null é lista vazia, não falha: quem nunca montou um plano vê o
     convite para montar, e não uma mensagem de erro. */
  | { tipo: 'ok'; plano: PlanoCompleto | null }
  | { tipo: 'erro'; mensagem: string }

export type ResultadoPlanos =
  | { tipo: 'ok'; planos: PlanoCompleto[] }
  | { tipo: 'erro'; mensagem: string }

/* Formato cru da consulta aninhada. Os nomes são os das colunas; a conversão
   para o formato da tela acontece logo abaixo. */
type LinhaAlimento = {
  id: string
  ordem: number
  alimento_id: number | null
  nome: string
  marca: string | null
  descricao: string
  gramas: number | null
  calorias: number | null
  proteinas: number | null
  carboidratos: number | null
  gorduras: number | null
  fibras: number | null
}

type LinhaItem = LinhaAlimento & { variacoes: LinhaAlimento[] }

type LinhaRefeicao = {
  id: string
  ordem: number
  rotulo: string
  hora: string
  itens: LinhaItem[]
}

type LinhaPlano = {
  id: string
  nome: string
  observacao: string | null
  criado_em: string
  ativo: boolean | null
  dias_semana: DiaSemana[] | null
  refeicoes: LinhaRefeicao[]
}

/* Os mesmos campos no item e na variação: as duas guardam o alimento igual. */
const CAMPOS_ALIMENTO = `
  id, ordem, alimento_id, nome, marca, descricao, gramas,
  calorias, proteinas, carboidratos, gorduras, fibras
`

const SELECAO = `
  id, nome, observacao, criado_em, ativo, dias_semana,
  refeicoes:app_plano_refeicoes (
    id, ordem, rotulo, hora,
    itens:app_plano_itens (
      ${CAMPOS_ALIMENTO},
      variacoes:app_plano_item_variacoes ( ${CAMPOS_ALIMENTO} )
    )
  )
`

/* Coluna do banco → campo da tela. Um só para item e variação: os nomes com
   "Por100g" existem justamente para ninguém confundir o valor da tabela com o
   valor da porção, e essa tradução tem que acontecer num lugar só. */
const daLinha = (a: LinhaAlimento): VariacaoSalva => ({
  id: a.id,
  alimentoId: a.alimento_id,
  nome: a.nome,
  marca: a.marca,
  descricao: a.descricao,
  gramasTotais: a.gramas,
  caloriasPor100g: a.calorias,
  proteinasPor100g: a.proteinas,
  carboidratosPor100g: a.carboidratos,
  gordurasPor100g: a.gorduras,
  fibrasPor100g: a.fibras,
})

/* Linha do banco → plano da tela.
 *
 * A ordem das refeições e dos itens é acertada aqui no aparelho, e não na
 * consulta: o PostgREST só ordena um nível de tabela aninhada por vez, e são
 * três. Ordenar em JS é uma linha e vale para todos os níveis. */
const planoDaLinha = (linha: LinhaPlano): PlanoCompleto => ({
  id: linha.id,
  nome: linha.nome,
  observacao: linha.observacao,
  criadoEm: linha.criado_em,
  ativo: linha.ativo ?? false,
  /* Plano gravado antes de a coluna existir cai no mesmo padrão da coluna, que
     é o que ele sempre significou na prática: a rotina da semana. */
  diasSemana: [...(linha.dias_semana ?? DIAS_PADRAO)].sort((a, b) => a - b),
  refeicoes: [...(linha.refeicoes ?? [])]
    .sort((a, b) => a.ordem - b.ordem)
    .map(r => ({
      id: r.id,
      rotulo: r.rotulo,
      hora: r.hora,
      itens: [...(r.itens ?? [])]
        .sort((a, b) => a.ordem - b.ordem)
        .map(i => ({
          ...daLinha(i),
          variacoes: [...(i.variacoes ?? [])].sort((a, b) => a.ordem - b.ordem).map(daLinha),
        })),
    })),
})

/* Todos os planos da conta, do mais novo para o mais antigo, inteiros. */
export async function carregarPlanos(contaId: string): Promise<ResultadoPlanos> {
  const { data, error } = await supabase
    .from('app_planos')
    .select(SELECAO)
    .eq('conta_id', contaId)
    .order('criado_em', { ascending: false })

  if (error) return { tipo: 'erro', mensagem: error.message }
  return { tipo: 'ok', planos: ((data ?? []) as unknown as LinhaPlano[]).map(planoDaLinha) }
}

/* O plano que a tela inicial mostra: o ativo da conta.
 *
 * A data entra como desempate, e não como filtro reserva: se por algum caminho
 * a conta ficar sem nenhum ativo, a tela inicial mostra o mais recente em vez
 * de ficar vazia dizendo que não há plano. Uma consulta só resolve os dois
 * casos — `ativo desc` põe o verdadeiro na frente quando ele existe. */
export async function carregarPlanoAtivo(contaId: string): Promise<ResultadoPlano> {
  const { data, error } = await supabase
    .from('app_planos')
    .select(SELECAO)
    .eq('conta_id', contaId)
    .order('ativo', { ascending: false })
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return { tipo: 'erro', mensagem: error.message }
  if (!data) return { tipo: 'ok', plano: null }

  return { tipo: 'ok', plano: planoDaLinha(data as unknown as LinhaPlano) }
}

/* Passa a ser este o plano da tela inicial. Desligar o anterior e ligar este é
   uma coisa só, e acontece no banco — ver a migração 20260731000003. */
export async function ativarPlano(planoId: string): Promise<{ erro: string } | null> {
  const { error } = await supabase.rpc('app_ativar_plano', { p_plano_id: planoId })
  return error ? { erro: error.message } : null
}

/* ── A próxima refeição ────────────────────────────────────────────────────*/
export type ProximaRefeicao = {
  refeicao: RefeicaoSalva
  /* 0 = hoje, 1 = amanhã, e por aí vai. É o que deixa o cartão dizer "Hoje"
     em vez de "Seg" quando dá na mesma. */
  emDias: number
  dia: DiaSemana
}

const minutosDaHora = (hora: string) => {
  const [h, m] = hora.split(':')
  return Number(h) * 60 + Number(m)
}

/* Qual refeição vem agora, olhando o relógio e o calendário do plano.
 *
 * A busca é por HORÁRIO, e não pela ordem do plano: a ordem é a do dia do
 * paciente — quem trabalha à noite pode ter posto a ceia antes do café —, e
 * "qual é a próxima" é uma pergunta sobre o relógio, não sobre a lista.
 *
 * Passado o último horário de hoje, a resposta é a primeira refeição do próximo
 * dia em que o plano vale. Por isso o laço vai até 7: um plano que só vale às
 * segundas responde "segunda que vem" em vez de não responder nada. */
export function proximaRefeicaoDe(
  plano: PlanoCompleto,
  agora = new Date(),
): ProximaRefeicao | null {
  /* Refeição vazia não responde "o que eu como agora?" — ela é um horário
     reservado no plano, sem nada dentro. Fica de fora da busca, e a resposta
     passa a ser a próxima que tenha alimento. Se nenhuma tiver, não há resposta,
     e é a tela que diz isso. */
  const comAlimento = plano.refeicoes.filter(r => r.itens.length > 0)
  if (comAlimento.length === 0) return null

  const porHorario = [...comAlimento].sort(
    (a, b) => minutosDaHora(a.hora) - minutosDaHora(b.hora),
  )
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes()

  for (let emDias = 0; emDias <= 7; emDias++) {
    const dia = ((agora.getDay() + emDias) % 7) as DiaSemana
    if (!plano.diasSemana.includes(dia)) continue

    /* Só hoje o horário filtra; nos dias seguintes vale a primeira da lista. */
    const achada = porHorario.find(r => emDias > 0 || minutosDaHora(r.hora) > minutosAgora)
    if (achada) return { refeicao: achada, emDias, dia }
  }

  return null
}

/* "Hoje", "Amanhã", "Seg". */
export const quandoDaProxima = (p: ProximaRefeicao): string =>
  p.emDias === 0 ? 'Hoje' : p.emDias === 1 ? 'Amanhã' : DIAS_CURTOS[p.dia]

/* "2 unidades · 100 g · 270 kcal", pulando o que não se sabe.
 *
 * Mora aqui, e não na tela: a mesma linha aparece enquanto o plano é montado e
 * depois de ele estar salvo, e as duas precisam dizer a mesma coisa. */
/* As duas metades de `detalheDoItem`, separadas.
 *
 * Existem para quem apresenta o item em duas colunas, com a caloria alinhada à
 * direita. Numa lista de vinte alimentos, "6 colheres de sopa · 54 g · 213
 * kcal" repetido vinte vezes vira parede de texto, e o olho não acha o número
 * que procura. Em coluna, os números ficam um embaixo do outro e a leitura é
 * vertical.
 *
 * `detalheDoItem` continua existindo e continua sendo o certo onde a linha é
 * estreita demais para duas colunas. */
export function medidaDoItem(item: Nutrientes & { descricao: string }): string {
  const partes = [item.descricao]

  if (item.gramasTotais === null) {
    partes.push('sem peso informado')
  } else if (!item.descricao.endsWith(' g')) {
    /* O peso em gramas só aparece quando não é ele próprio a descrição. */
    partes.push(`${Math.round(item.gramasTotais)} g`)
  }

  return partes.join(' · ')
}

export function caloriasDoItem(item: Nutrientes): number | null {
  /* Sem peso não há como converter a tabela por 100 g em caloria do prato. */
  if (item.gramasTotais === null) return null
  return porcao(item.caloriasPor100g, item.gramasTotais)
}

export function detalheDoItem(item: Nutrientes & { descricao: string }): string {
  const partes = [item.descricao]

  if (item.gramasTotais !== null) {
    /* O peso em gramas só aparece quando não é ele próprio a descrição. */
    if (!item.descricao.endsWith(' g')) partes.push(`${Math.round(item.gramasTotais)} g`)

    const kcal = porcao(item.caloriasPor100g, item.gramasTotais)
    if (kcal !== null) partes.push(`${Math.round(kcal)} kcal`)
  } else {
    partes.push('sem peso informado')
  }

  return partes.join(' · ')
}

/* Plano do banco → plano editável.
 *
 * O id da linha do banco é jogado fora de propósito: a gravação apaga e
 * reescreve as refeições, então guardar esses ids daria a impressão de que
 * editar preserva a linha lá de baixo — e a primeira pessoa a confiar nisso
 * escreveria um bug. O que a tela precisa é de uma chave estável enquanto ela
 * está aberta, e é isso que novaChave() dá. */
export function paraEdicao(plano: PlanoCompleto): RefeicaoMontada[] {
  const alimento = (a: VariacaoSalva): AlimentoEscolhido => ({
    chave: novaChave(),
    alimentoId: a.alimentoId,
    nome: a.nome,
    marca: a.marca,
    descricao: a.descricao,
    gramasTotais: a.gramasTotais,
    caloriasPor100g: a.caloriasPor100g,
    proteinasPor100g: a.proteinasPor100g,
    carboidratosPor100g: a.carboidratosPor100g,
    gordurasPor100g: a.gordurasPor100g,
    fibrasPor100g: a.fibrasPor100g,
  })

  return plano.refeicoes.map(r => ({
    chave: novaChave(),
    rotulo: r.rotulo,
    hora: r.hora,
    itens: r.itens.map(i => ({ ...alimento(i), variacoes: i.variacoes.map(alimento) })),
  }))
}

/* Todos os itens de um plano numa lista só, para o total do dia. */
export const itensDoPlano = (refeicoes: { itens: Nutrientes[] }[]): Nutrientes[] =>
  refeicoes.flatMap(r => r.itens)

/* ── Lista de compras ──────────────────────────────────────────────────────
 *
 * O plano diz o que comer; a lista diz o que comprar. São a mesma informação
 * vista de outro ângulo, e por isso ela é DERIVADA do plano em vez de guardada:
 * uma lista gravada envelheceria em silêncio no dia em que o plano mudasse.
 *
 * As variações entram junto, e não excluídas. "Arroz OU macarrão" na cozinha
 * vira as duas coisas na despensa — quem decide na hora precisa ter as duas em
 * casa. Marcá-las como alternativa é papel da tela, não do agrupamento. */

export type ItemDeCompra = {
  chave: string
  nome: string
  marca: string | null
  /* Soma dos gramas de todas as aparições, quando todas informaram peso. Null
     quando nenhuma informou — "2 unidades" não vira grama sem tabela. */
  gramas: number | null
  /* Em quantas refeições o alimento aparece. É o que a tela usa para dizer
     "em 3 refeições", que explica a quantidade sem obrigar a somar de cabeça. */
  refeicoes: number
  /* As quantidades como foram escritas, para quando não há peso: "2 unidades",
     "1 fatia". Preserva a forma em que a pessoa disse. */
  descricoes: string[]
  /* Verdadeiro quando o alimento só aparece como alternativa de outro. A tela
     mostra em tom mais fraco: comprar é opcional, depende da escolha do dia. */
  soAlternativa: boolean
}

/* Nome e marca identificam o produto na prateleira. Sem acento e sem caixa,
   porque "Aveia" e "aveia" são o mesmo pacote. */
const chaveDeCompra = (nome: string, marca: string | null) =>
  `${nome}|${marca ?? ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

export function listaDeCompras(plano: PlanoCompleto): ItemDeCompra[] {
  const porChave = new Map<string, ItemDeCompra & { vistoEm: Set<string> }>()

  const juntar = (a: VariacaoSalva, refeicaoId: string, alternativa: boolean) => {
    const chave = chaveDeCompra(a.nome, a.marca)
    const atual = porChave.get(chave)

    if (!atual) {
      porChave.set(chave, {
        chave,
        nome: a.nome,
        marca: a.marca,
        gramas: a.gramasTotais,
        refeicoes: 1,
        descricoes: [a.descricao],
        soAlternativa: alternativa,
        vistoEm: new Set([refeicaoId]),
      })
      return
    }

    /* Soma só entre pesos conhecidos. Um item sem peso não zera o total dos
       outros, mas também não some: a descrição dele entra na lista ao lado. */
    if (a.gramasTotais !== null) {
      atual.gramas = (atual.gramas ?? 0) + a.gramasTotais
    }
    if (!atual.descricoes.includes(a.descricao)) atual.descricoes.push(a.descricao)
    /* Basta aparecer uma vez como principal para deixar de ser alternativa: se
       o arroz é item fixo do almoço, comprá-lo não é opcional, mesmo que ele
       também seja alternativa de outra coisa no jantar. */
    if (!alternativa) atual.soAlternativa = false
    atual.vistoEm.add(refeicaoId)
    atual.refeicoes = atual.vistoEm.size
  }

  for (const r of plano.refeicoes) {
    for (const item of r.itens) {
      juntar(item, r.id, false)
      for (const v of item.variacoes) juntar(v, r.id, true)
    }
  }

  return [...porChave.values()]
    .map(({ vistoEm: _vistoEm, ...item }) => item)
    /* Alternativas por último, e o resto em ordem alfabética. Alfabético e não
       por refeição: na loja se anda por corredor, não por horário do dia. */
    .sort((a, b) => {
      if (a.soAlternativa !== b.soAlternativa) return a.soAlternativa ? 1 : -1
      return a.nome.localeCompare(b.nome, 'pt-BR')
    })
}
