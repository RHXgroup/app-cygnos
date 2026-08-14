import * as ImagePicker from 'expo-image-picker'
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator'
import { dataISO } from './formatar'
import { supabase } from './supabase'

/* O contador de calorias: o que a pessoa realmente comeu.
 *
 * Ver a migração 20260801000006. A diferença que importa em relação a
 * lib/plano.ts: aqui os nutrientes são DA PORÇÃO, absolutos, e não por 100 g.
 * Comida comida é um fato; plano é uma receita que se reescala. Por isso os
 * totais daqui são soma simples, e não a conta de porção do plano. */

export type OrigemItem = 'foto' | 'busca' | 'plano' | 'manual'

export type ItemConsumo = {
  id: string
  refeicao: string
  nome: string
  descricao: string | null
  /* Todos podem ser null: "não dá para saber" é resposta legítima, e zero
     somaria como se fosse verdade no total do dia. */
  calorias: number | null
  proteinas: number | null
  carboidratos: number | null
  gorduras: number | null
  fibras: number | null
  origem: OrigemItem
  confianca: 'alta' | 'media' | 'baixa' | null
  comidoEm: string
}

/* O que se manda para gravar. Sem id nem hora — quem carimba é o banco. */
export type ItemParaGravar = Omit<ItemConsumo, 'id' | 'comidoEm'> & {
  alimentoId?: number | null
}

/* As refeições que o app oferece. São sugestões, não uma lista fechada: quem
   registra a partir do plano traz o rótulo que a própria pessoa escreveu lá,
   e a coluna do banco é texto livre justamente por isso. */
export const REFEICOES = [
  'Café da manhã',
  'Lanche da manhã',
  'Almoço',
  'Lanche da tarde',
  'Jantar',
  'Ceia',
] as const

/* A refeição que o relógio sugere. Poupa um toque na maioria das vezes, e
   errar aqui custa um toque — não errar custaria a pessoa escolher sempre. */
export function refeicaoPelaHora(agora = new Date()): string {
  const h = agora.getHours()
  if (h < 10) return 'Café da manhã'
  if (h < 12) return 'Lanche da manhã'
  if (h < 15) return 'Almoço'
  if (h < 18) return 'Lanche da tarde'
  if (h < 22) return 'Jantar'
  return 'Ceia'
}

/* ── Totais ────────────────────────────────────────────────────────────────
   Soma direta, ao contrário de lib/plano.ts, que precisa converter por 100 g.
   Cada nutriente pode ser null: nenhum item informou aquele valor é diferente
   de todos informaram zero. */
export type TotaisConsumo = {
  calorias: number | null
  proteinas: number | null
  carboidratos: number | null
  gorduras: number | null
  fibras: number | null
  /* Itens que entraram sem caloria: o total sai por baixo e a tela precisa
     poder dizer isso. */
  semCalorias: number
  /* Itens estimados por foto. A tela usa para marcar o total como estimativa —
     um número vindo de foto não é tão firme quanto um lido de tabela. */
  deFoto: number
}

type CampoNutriente = 'calorias' | 'proteinas' | 'carboidratos' | 'gorduras' | 'fibras'

function somar(itens: ItemConsumo[], campo: CampoNutriente): number | null {
  let total = 0
  let houve = false

  for (const i of itens) {
    const v = i[campo]
    if (v === null) continue
    total += v
    houve = true
  }

  return houve ? total : null
}

export const totaisConsumidos = (itens: ItemConsumo[]): TotaisConsumo => ({
  calorias: somar(itens, 'calorias'),
  proteinas: somar(itens, 'proteinas'),
  carboidratos: somar(itens, 'carboidratos'),
  gorduras: somar(itens, 'gorduras'),
  fibras: somar(itens, 'fibras'),
  semCalorias: itens.filter(i => i.calorias === null).length,
  deFoto: itens.filter(i => i.origem === 'foto').length,
})

/* Os itens agrupados por refeição, na ordem em que a primeira de cada uma foi
   comida. Pelo RELÓGIO, e não pela ordem da lista de REFEICOES: quem trabalha
   à noite janta antes de almoçar, e uma ordem fixa mentiria sobre o dia dela. */
export function porRefeicao(itens: ItemConsumo[]): { refeicao: string; itens: ItemConsumo[] }[] {
  const grupos: { refeicao: string; itens: ItemConsumo[] }[] = []

  for (const item of itens) {
    const grupo = grupos.find(g => g.refeicao === item.refeicao)
    if (grupo) grupo.itens.push(item)
    else grupos.push({ refeicao: item.refeicao, itens: [item] })
  }

  return grupos
}

/* ── Banco ─────────────────────────────────────────────────────────────────*/

export type ResultadoConsumo =
  | { tipo: 'ok'; itens: ItemConsumo[] }
  | { tipo: 'erro'; mensagem: string }

const COLUNAS =
  'id, refeicao, nome, descricao, calorias, proteinas, carboidratos, gorduras, fibras, origem, confianca, comido_em'

type Linha = {
  id: string
  refeicao: string
  nome: string
  descricao: string | null
  calorias: number | null
  proteinas: number | null
  carboidratos: number | null
  gorduras: number | null
  fibras: number | null
  origem: OrigemItem
  confianca: 'alta' | 'media' | 'baixa' | null
  comido_em: string
}

/* numeric volta como string do PostgREST quando não cabe em float sem perda. */
const numero = (v: number | null) => (v === null ? null : Number(v))

const daLinha = (l: Linha): ItemConsumo => ({
  id: l.id,
  refeicao: l.refeicao,
  nome: l.nome,
  descricao: l.descricao,
  calorias: numero(l.calorias),
  proteinas: numero(l.proteinas),
  carboidratos: numero(l.carboidratos),
  gorduras: numero(l.gorduras),
  fibras: numero(l.fibras),
  origem: l.origem,
  confianca: l.confianca,
  comidoEm: l.comido_em,
})

/* O que foi comido num dia, em ordem de relógio. */
export async function carregarConsumo(
  contaId: string,
  dia = new Date(),
): Promise<ResultadoConsumo> {
  const { data, error } = await supabase
    .from('app_consumo_itens')
    .select(COLUNAS)
    .eq('conta_id', contaId)
    .eq('data', dataISO(dia))
    .order('comido_em', { ascending: true })

  if (error) return { tipo: 'erro', mensagem: error.message }
  return { tipo: 'ok', itens: ((data ?? []) as Linha[]).map(daLinha) }
}

/* O mesmo, para um intervalo de dias — é o que a aba de Relatórios lê.
 *
 * Traz a coluna `data` junto, que a leitura de um dia só não precisa: lá o dia
 * é o filtro e já se sabe qual é; aqui cada item precisa dizer a que dia
 * pertence, senão não há como agrupar. */
export type ItemComData = ItemConsumo & { data: string }

export type ResultadoConsumoPeriodo =
  | { tipo: 'ok'; itens: ItemComData[] }
  | { tipo: 'erro'; mensagem: string }

export async function carregarConsumoPeriodo(
  contaId: string,
  de: string,
  ate: string,
): Promise<ResultadoConsumoPeriodo> {
  const { data, error } = await supabase
    .from('app_consumo_itens')
    .select(`${COLUNAS}, data`)
    .eq('conta_id', contaId)
    .gte('data', de)
    .lte('data', ate)
    .order('comido_em', { ascending: true })

  if (error) return { tipo: 'erro', mensagem: error.message }

  const linhas = (data ?? []) as (Linha & { data: string })[]
  return { tipo: 'ok', itens: linhas.map(l => ({ ...daLinha(l), data: l.data })) }
}

/* Grava um ou vários itens de uma vez.
 *
 * Em lote de propósito: registrar uma refeição inteira do plano são cinco ou
 * seis alimentos, e um insert por alimento deixaria metade do almoço gravada se
 * a rede caísse no meio. */
export async function registrarConsumo(
  contaId: string,
  itens: ItemParaGravar[],
  quando = new Date(),
): Promise<ResultadoConsumo> {
  if (itens.length === 0) return { tipo: 'ok', itens: [] }

  const { data, error } = await supabase
    .from('app_consumo_itens')
    .insert(
      itens.map(i => ({
        conta_id: contaId,
        data: dataISO(quando),
        refeicao: i.refeicao.trim(),
        nome: i.nome.trim(),
        descricao: i.descricao?.trim() || null,
        calorias: i.calorias,
        proteinas: i.proteinas,
        carboidratos: i.carboidratos,
        gorduras: i.gorduras,
        fibras: i.fibras,
        origem: i.origem,
        confianca: i.confianca,
        alimento_id: i.alimentoId ?? null,
      })),
    )
    .select(COLUNAS)

  if (error) return { tipo: 'erro', mensagem: error.message }
  return { tipo: 'ok', itens: ((data ?? []) as Linha[]).map(daLinha) }
}

export async function apagarConsumo(id: string): Promise<{ erro: string } | null> {
  const { error } = await supabase.from('app_consumo_itens').delete().eq('id', id)
  return error ? { erro: error.message } : null
}

/* ── A foto ────────────────────────────────────────────────────────────────*/

export type Estimativa = {
  descricao: string
  porcaoEstimada: string
  calorias: number | null
  proteinas: number | null
  carboidratos: number | null
  gorduras: number | null
  fibras: number | null
  confianca: 'alta' | 'media' | 'baixa'
}

export type ResultadoFoto =
  | { tipo: 'ok'; estimativa: Estimativa }
  | { tipo: 'cancelado' }
  | { tipo: 'erro'; mensagem: string }

/* 1024 no lado maior. O avatar usa 512 porque é um rosto num círculo de 76
   pontos; aqui a imagem é lida por um modelo que precisa distinguir arroz de
   quinoa e estimar a altura de um monte de comida no prato. Acima disso o custo
   por foto sobe sem ganho — e a pessoa fotografa várias vezes por dia. */
const LADO_MAIOR = 1024

async function pedirPermissao(origem: 'galeria' | 'camera'): Promise<boolean> {
  const { granted } =
    origem === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
  return granted
}

/* Fotografa o prato e devolve a estimativa da IA.
 *
 * Sem recorte, ao contrário do avatar: o prato inteiro é a informação, e cortar
 * um pedaço faria a estimativa da porção sair menor do que a comida real. */
export async function analisarFoto(origem: 'galeria' | 'camera'): Promise<ResultadoFoto> {
  if (!(await pedirPermissao(origem))) {
    return {
      tipo: 'erro',
      mensagem:
        origem === 'camera'
          ? 'Preciso de acesso à câmera. Você pode liberar nos ajustes do aparelho.'
          : 'Preciso de acesso às suas fotos. Você pode liberar nos ajustes do aparelho.',
    }
  }

  const opcoes: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
    /* Tela cheia, e não o padrão: apresentação em folha por cima de outra
       apresentação é o que fazia a promise da câmera nunca resolver. */
    presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN,
  }

  const escolha =
    origem === 'camera'
      ? await ImagePicker.launchCameraAsync(opcoes)
      : await ImagePicker.launchImageLibraryAsync(opcoes)

  if (escolha.canceled || !escolha.assets?.[0]) return { tipo: 'cancelado' }

  try {
    /* Só a largura no resize: passar as duas dimensões esticaria uma foto
       retangular para um quadrado, e comida deformada é comida mal estimada. */
    const reduzida = await manipulateAsync(
      escolha.assets[0].uri,
      [{ resize: { width: LADO_MAIOR } }],
      { compress: 0.8, format: SaveFormat.JPEG, base64: true },
    )

    if (!reduzida.base64) return { tipo: 'erro', mensagem: 'Não consegui preparar a foto.' }

    const { data, error } = await supabase.functions.invoke('analisar-alimento', {
      body: { imageBase64: reduzida.base64, mimeType: 'image/jpeg' },
    })

    if (error) {
      /* O supabase-js embrulha a resposta de erro: sem abrir o context, toda
         falha do servidor viraria "FunctionsHttpError" na tela — e a função foi
         justamente corrigida para dizer o que aconteceu de verdade. */
      const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null)
      return { tipo: 'erro', mensagem: corpo?.error ?? 'Não consegui analisar a foto agora.' }
    }

    if (data?.error) return { tipo: 'erro', mensagem: data.error }

    return {
      tipo: 'ok',
      estimativa: {
        descricao: data.descricao ?? 'Alimento',
        porcaoEstimada: data.porcao_estimada ?? '',
        calorias: data.calorias ?? null,
        proteinas: data.proteinas ?? null,
        carboidratos: data.carboidratos ?? null,
        gorduras: data.gorduras ?? null,
        fibras: data.fibras ?? null,
        confianca: data.confianca ?? 'baixa',
      },
    }
  } catch {
    return { tipo: 'erro', mensagem: 'Não consegui preparar a foto. Tente outra.' }
  }
}
