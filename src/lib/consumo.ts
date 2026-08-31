import * as ImagePicker from 'expo-image-picker'
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator'
import { dataISO } from './formatar'
import { supabase } from './supabase'
import { falha } from './erros'

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
  /* O caminho da foto no bucket privado, quando o item veio de foto.
   *
   * CAMINHO, e não endereço: endereço assinado vence em uma hora, e guardar um
   * na linha faria a foto quebrar depois do almoço. Quem transforma em endereço
   * é `fotoDoDiario`, na hora de desenhar. */
  fotoPath: string | null
}

/* O que se manda para gravar. Sem id nem hora — quem carimba é o banco. */
export type ItemParaGravar = Omit<ItemConsumo, 'id' | 'comidoEm' | 'fotoPath'> & {
  alimentoId?: number | null
  /* Opcional: quase todo item entra sem foto. */
  fotoPath?: string | null
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
  'id, refeicao, nome, descricao, calorias, proteinas, carboidratos, gorduras, fibras, origem, confianca, comido_em, foto_path'

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
  foto_path?: string | null
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
  fotoPath: l.foto_path ?? null,
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

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui carregar o que você comeu. Verifique a conexão.', error),
    }
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

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui carregar o seu histórico de refeições. Verifique a conexão.', error),
    }

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
        foto_path: i.fotoPath ?? null,
      })),
    )
    .select(COLUNAS)

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui registrar este alimento agora. Verifique a conexão.', error),
    }
  return { tipo: 'ok', itens: ((data ?? []) as Linha[]).map(daLinha) }
}

export async function apagarConsumo(id: string): Promise<{ erro: string } | null> {
  const { error } = await supabase.from('app_consumo_itens').delete().eq('id', id)
  if (!error) return null
  return {
    erro: falha('Não consegui remover este alimento agora. Verifique a conexão.', error),
  }
}

/* ── Corrigir o que já foi registrado ──────────────────────────────────────
 *
 * Errar a refeição e comer mais ou menos do que se registrou são os dois
 * enganos comuns, e até aqui os dois custavam o mesmo: apagar e descrever tudo
 * de novo. Apagar é destrutivo e refazer é trabalhoso — para consertar um toque
 * errado, é caro demais.
 *
 * A tabela não guarda a porção, só os nutrientes absolutos dela. Então a
 * correção de quantidade é uma PROPORÇÃO, e não um peso novo: comer metade é
 * metade de tudo, e essa conta fecha sem precisar saber quantos gramas eram. */
export async function moverDeRefeicao(
  id: string,
  refeicao: string,
): Promise<{ erro: string } | null> {
  const { error } = await supabase
    .from('app_consumo_itens')
    .update({ refeicao: refeicao.trim() })
    .eq('id', id)

  if (!error) return null
  return {
    erro: falha('Não consegui mudar este alimento de refeição agora. Verifique a conexão.', error),
  }
}

/* Multiplica os nutrientes do item. `fator` 0.5 é "comi metade", 2 é "comi o
   dobro". A descrição ganha a nota do que foi ajustado, porque um item que
   dizia "2 fatias" e agora vale 1 precisa dizer isso — senão o diário mente
   sobre o que foi comido. */
export async function ajustarQuantidade(
  item: ItemConsumo,
  fator: number,
): Promise<{ tipo: 'ok'; item: ItemConsumo } | { tipo: 'erro'; mensagem: string }> {
  const escalar = (v: number | null) => (v === null ? null : Math.round(v * fator * 10) / 10)

  const valores = {
    calorias: escalar(item.calorias),
    proteinas: escalar(item.proteinas),
    carboidratos: escalar(item.carboidratos),
    gorduras: escalar(item.gorduras),
    fibras: escalar(item.fibras),
    descricao: descricaoAjustada(item.descricao, fator),
  }

  const { data, error } = await supabase
    .from('app_consumo_itens')
    .update(valores)
    .eq('id', item.id)
    .select(COLUNAS)
    .single()

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui ajustar a quantidade agora. Verifique a conexão.', error),
    }
  return { tipo: 'ok', item: daLinha(data as Linha) }
}

/* "2 fatias" ajustado pela metade vira "2 fatias (metade)". Não tenta reescrever
   a quantidade original — "1 fatia" seria uma invenção quando o que se comeu foi
   metade de duas, e há caso em que a conta nem fecha em número inteiro. */
function descricaoAjustada(descricao: string | null, fator: number): string {
  const nota = fator === 0.5 ? 'metade' : fator === 2 ? 'o dobro' : `${fator}×`
  const limpa = (descricao ?? '').replace(/\s*\((metade|o dobro|[\d.,]+×)\)$/, '').trim()
  return limpa ? `${limpa} (${nota})` : nota
}

/* ── Repetir o que já se come ──────────────────────────────────────────────
 *
 * Quem toma o mesmo café da manhã todo dia descrevia tudo de novo, todo dia. É
 * o atrito que mais faz gente largar app de dieta, e as duas leituras abaixo
 * existem para tirá-lo do caminho.
 *
 * Nada de tabela nova: o histórico já está em app_consumo_itens. O agrupamento
 * é feito aqui, e não no banco, porque uma função nova exigiria migração — e
 * isto precisa funcionar hoje, no aparelho que já está na mão da pessoa. */

/* Quantos dias para trás olhar. Sessenta cobre o hábito de quem come a mesma
   coisa em dias de semana alternados, sem trazer o que a pessoa comia numa fase
   que já passou. */
const DIAS_DE_HISTORICO = 60

/* Teto de linhas lidas. Um item por refeição por dia dá menos de 400 em 60
   dias; o dobro disso é folga suficiente para quem registra alimento a alimento
   sem virar uma consulta cara. */
const TETO_HISTORICO = 800

/* Nome e descrição, sem acento nem caixa, é o que identifica "o mesmo alimento"
   para efeito de contagem. Duas grafias do mesmo pão viram a mesma linha. */
const chaveDoItem = (nome: string, descricao: string | null) =>
  `${nome}|${descricao ?? ''}`
    .toLowerCase()
    .normalize('NFD')
    /* Escrito por código, e não com os acentos literais: são caracteres
       invisíveis no editor, e um salvamento em outra codificação os perderia
       sem ninguém notar — a busca passaria a diferenciar "pão" de "pao". */
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

export type ItemFrequente = {
  chave: string
  nome: string
  descricao: string | null
  calorias: number | null
  proteinas: number | null
  carboidratos: number | null
  gorduras: number | null
  fibras: number | null
  /* Quantas vezes apareceu na janela lida. É o que ordena a lista, e a tela
     mostra para a pessoa entender por que aquilo está ali. */
  vezes: number
}

export type ResultadoFrequentes =
  | { tipo: 'ok'; itens: ItemFrequente[] }
  | { tipo: 'erro'; mensagem: string }

/* Os alimentos que mais se repetem NESTA refeição.
 *
 * Por refeição, e não no geral: café da manhã e jantar quase não têm alimento
 * em comum, e uma lista única ofereceria ovo mexido no jantar para caber pão na
 * lista do almoço. */
export async function carregarFrequentes(
  contaId: string,
  refeicao: string,
  limite = 8,
): Promise<ResultadoFrequentes> {
  const de = new Date()
  de.setDate(de.getDate() - DIAS_DE_HISTORICO)

  const { data, error } = await supabase
    .from('app_consumo_itens')
    .select(COLUNAS)
    .eq('conta_id', contaId)
    .eq('refeicao', refeicao)
    .gte('data', dataISO(de))
    .order('comido_em', { ascending: false })
    .limit(TETO_HISTORICO)

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui carregar os seus alimentos frequentes. Verifique a conexão.', error),
    }

  const porChave = new Map<string, ItemFrequente>()

  for (const linha of (data ?? []) as Linha[]) {
    const item = daLinha(linha)
    const chave = chaveDoItem(item.nome, item.descricao)
    const visto = porChave.get(chave)

    if (visto) {
      visto.vezes += 1
      continue
    }

    /* Os nutrientes vêm do registro MAIS RECENTE, e a lista chega ordenada do
       mais novo para o mais velho — então o primeiro que se vê é o que vale.
       Quem corrigiu a porção do próprio pão semana passada não deve receber de
       volta o número errado de um mês atrás. */
    porChave.set(chave, {
      chave,
      nome: item.nome,
      descricao: item.descricao,
      calorias: item.calorias,
      proteinas: item.proteinas,
      carboidratos: item.carboidratos,
      gorduras: item.gorduras,
      fibras: item.fibras,
      vezes: 1,
    })
  }

  const itens = [...porChave.values()]
    /* Repetido antes de único: o que se come duas vezes por semana é um hábito;
       o que apareceu uma vez só foi um dia atípico, e ocupar o atalho com ele
       tiraria o lugar de quem realmente se repete. */
    .sort((a, b) => b.vezes - a.vezes)
    .slice(0, limite)

  return { tipo: 'ok', itens }
}

export type UltimaRefeicao = {
  /* O dia de onde ela veio, em ISO. A tela transforma em "ontem" ou na data. */
  data: string
  itens: ItemConsumo[]
}

export type ResultadoUltima =
  | { tipo: 'ok'; refeicao: UltimaRefeicao | null }
  | { tipo: 'erro'; mensagem: string }

/* A última vez que esta refeição foi registrada, inteira.
 *
 * Serve o caso que a lista de frequentes não cobre: repetir o almoço de ontem
 * com os cinco alimentos de uma vez, em um toque só, em vez de escolher cinco
 * atalhos em sequência.
 *
 * O dia de hoje fica de fora: repetir o que já está na tela duplicaria a
 * refeição em vez de montá-la. */
export async function carregarUltimaRefeicao(
  contaId: string,
  refeicao: string,
  hoje = new Date(),
): Promise<ResultadoUltima> {
  const de = new Date(hoje)
  de.setDate(de.getDate() - DIAS_DE_HISTORICO)

  const { data, error } = await supabase
    .from('app_consumo_itens')
    .select(`${COLUNAS}, data`)
    .eq('conta_id', contaId)
    .eq('refeicao', refeicao)
    .gte('data', dataISO(de))
    .lt('data', dataISO(hoje))
    .order('data', { ascending: false })
    .order('comido_em', { ascending: true })
    .limit(TETO_HISTORICO)

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui carregar a sua última refeição. Verifique a conexão.', error),
    }

  const linhas = (data ?? []) as (Linha & { data: string })[]
  if (linhas.length === 0) return { tipo: 'ok', refeicao: null }

  /* A consulta já vem ordenada por data desc, então o primeiro registro marca o
     dia mais recente — e tudo daquele dia entra junto, na ordem do relógio. */
  const dia = linhas[0].data
  const itens = linhas.filter(l => l.data === dia).map(daLinha)

  return { tipo: 'ok', refeicao: { data: dia, itens } }
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
  /* A IA declarou que o hábito dela mudou a resposta — desempatou um alimento
     parecido ou calibrou a porção.
   *
   * Existe para a TELA DIZER. Contexto que age escondido e erra é o pior dos
   * dois mundos: sem contexto o erro é aleatório e a pessoa desconfia; com
   * contexto o erro fica PLAUSÍVEL, bate com o plano dela, e passa. */
  usouContexto: boolean
}

/* O que o app conta à IA sobre esta pessoa antes de ela olhar a foto.
 *
 * Nenhum concorrente pode fazer isto: eles adivinham do zero toda vez. Aqui o
 * app sabe o que ela come naquele horário — está no plano da nutricionista e no
 * que ela repetiu dezenas de vezes.
 *
 * A trava contra a ancoragem mora na função do servidor, e a regra em uma
 * frase é: a foto é a verdade, a lista é só pista. Uma feijoada continua sendo
 * feijoada mesmo que o hábito dela seja salada. */
export type ContextoDaFoto = {
  refeicao: string
  /* O que ela costuma comer NESTA refeição, do mais frequente para o menos. */
  costuma: string[]
}

export type ResultadoFoto =
  /* O `base64` volta junto para a tela poder GUARDAR a imagem depois de a
     pessoa confirmar. Antes ela era mandada para a IA e descartada.
   *
   * Volta daqui em vez de ser lida de novo do arquivo: é a mesma imagem já
   * reduzida e comprimida, e ler duas vezes custaria o dobro num aparelho
   * fraco. */
  | { tipo: 'ok'; estimativa: Estimativa; base64: string }
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
export async function analisarFoto(
  origem: 'galeria' | 'camera',
  contexto?: ContextoDaFoto,
): Promise<ResultadoFoto> {
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
      body: {
        imageBase64: reduzida.base64,
        mimeType: 'image/jpeg',
        /* Só vai o que existe. Contexto vazio faria o servidor montar uma frase
           pela metade, e frase pela metade o modelo completa sozinho — que é
           pior do que não mandar nada. */
        contexto:
          contexto && contexto.costuma.length > 0
            ? { refeicao: contexto.refeicao, costuma: contexto.costuma.slice(0, 8) }
            : undefined,
      },
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
      base64: reduzida.base64,
      estimativa: {
        descricao: data.descricao ?? 'Alimento',
        porcaoEstimada: data.porcao_estimada ?? '',
        calorias: data.calorias ?? null,
        proteinas: data.proteinas ?? null,
        carboidratos: data.carboidratos ?? null,
        gorduras: data.gorduras ?? null,
        fibras: data.fibras ?? null,
        confianca: data.confianca ?? 'baixa',
        /* `=== true` e nao `??`: a funcao antiga nao devolve o campo, e um
           app novo falando com a versao anterior da funcao veria `undefined`.
           Undefined tem de virar false -- dizer "considerei o seu habito"
           quando nem contexto foi mandado seria inventar uma explicacao. */
        usouContexto: data.usou_contexto === true,
      },
    }
  } catch {
    return { tipo: 'erro', mensagem: 'Não consegui preparar a foto. Tente outra.' }
  }
}

/* ── Ajustar a porção de uma estimativa ────────────────────────────────────
 *
 * A IA acerta razoavelmente O QUE é o prato e erra bastante QUANTO tem nele: a
 * medida pública do melhor app de foto do mercado é ±28% de erro na porção.
 *
 * Esta tela não deixava corrigir — era aceitar ou descartar. Aceitar sabendo que
 * está errado envenena a soma do dia; descartar joga fora um reconhecimento que
 * estava certo. As duas saídas eram ruins.
 *
 * ── Por que frações, e não um controle deslizante ─────────────────────────
 * Um deslizante devolve 87%, e 87% de um número que já é aproximado é precisão
 * inventada. Ninguém olha um prato e pensa "comi 87%": pensa "comi metade".
 *
 * As quatro frações são as que se usam falando, e é a mesma escada do `ajustar`
 * que já existe para item registrado — duas telas com escalas diferentes para a
 * mesma ideia fariam a pessoa aprender duas vezes. */
export const FRACOES_DA_PORCAO = [
  { fator: 0.5, rotulo: 'metade' },
  { fator: 1, rotulo: 'tudo' },
  { fator: 1.5, rotulo: 'uma vez e meia' },
  { fator: 2, rotulo: 'o dobro' },
] as const

/* A estimativa reescalada.
 *
 * `null` continua `null`: o que a IA não soube dizer não vira número por ser
 * multiplicado. Item 6 do AGENTS.md — zero no lugar do desconhecido soma como
 * se fosse verdade.
 *
 * A DESCRIÇÃO da porção também muda, e é ela que a pessoa relê depois no
 * diário: "1 prato" que virou metade precisa dizer "metade de 1 prato", senão o
 * item guarda um texto que contradiz os próprios números. */
export function comFator(e: Estimativa, fator: number): Estimativa {
  if (!Number.isFinite(fator) || fator <= 0 || fator === 1) return e

  const x = (v: number | null) => (v === null ? null : Math.round(v * fator))
  const nome = FRACOES_DA_PORCAO.find(f => f.fator === fator)?.rotulo

  return {
    ...e,
    calorias: x(e.calorias),
    proteinas: x(e.proteinas),
    carboidratos: x(e.carboidratos),
    gorduras: x(e.gorduras),
    fibras: x(e.fibras),
    porcaoEstimada:
      e.porcaoEstimada && nome ? `${nome} de ${e.porcaoEstimada}` : e.porcaoEstimada,
  }
}
