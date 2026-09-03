import * as ImagePicker from 'expo-image-picker'
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator'
import { dataISO } from './formatar'
import { supabase } from './supabase'
import { falha } from './erros'
import { type Estimativa, itensDaEstimativa } from './estimativaDaFoto'
import { semImagem } from './permissoes'

/* Reexportado para as telas: elas pedem a foto por aqui, e ter de importar o
   tipo de um arquivo e a função de outro é o tipo de detalhe que faz alguém
   copiar o import errado. */
export {
  type Estimativa,
  type ItemDaFoto,
  type LinhaEscolhida,
  FRACOES_DA_PORCAO,
  comFator,
  escolhidos,
  paraGravar,
  linhasIniciais,
  totaisDaFoto,
} from './estimativaDaFoto'

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
  /* Quanto a pessoa corrigiu a estimativa da foto: 0,5 quando disse metade, 2
     quando disse o dobro. Nulo quando aceitou como veio — e a diferença
     importa, porque é a média das correções DE VERDADE que calibra a próxima
     foto (`app_vies_da_foto`). */
  fatorCorrecao?: number | null
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
        fator_correcao: i.fatorCorrecao ?? null,
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

/* `Estimativa`, `ItemDaFoto` e o que se faz com eles moram em
   `estimativaDaFoto.ts` — só lógica, sem nada de runtime, e por isso testável
   fora do aparelho (item 14). Aqui fica o que fala com a rede. */

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
  /* E o que o PLANO da nutricionista tem para esta refeição.
   *
   * Sujeito às mesmas travas do hábito, e o servidor diz isso em uma frase: o
   * plano é o que ela DEVERIA comer, não o que está no prato. Quem come
   * diferente do plano é justamente quem mais precisa do registro certo — e é
   * o único jeito de a nutricionista descobrir. */
  doPlano?: string[]
  /* Para que lado ela costuma corrigir a estimativa. Vem de
     `app_vies_da_foto()`, e é nulo até haver correção suficiente. */
  fatorMedioDeCorrecao?: number | null
}

/* Para que lado esta pessoa costuma corrigir a estimativa da foto.
 *
 * ── Por que isto existe ───────────────────────────────────────────────────
 * A tecnologia de foto erra ±28% na porção; é o limite conhecido dela, e vale
 * para todo mundo. O que NÃO vale para todo mundo é a DIREÇÃO do erro numa
 * pessoa específica: quem serve o prato cheio e come metade tem um viés
 * consistente, e o modelo não tem como saber disso olhando a foto.
 *
 * ── Devolve null, e nunca rejeita ─────────────────────────────────────────
 * Item 11: função de apoio de UI não pode rejeitar. Sem sinal, isto seria uma
 * rejeição não tratada dentro do fluxo da câmera — e a foto inteira morreria
 * por causa de um número que só serve para calibrar. Sem o viés a estimativa
 * sai como saía antes, que é o comportamento aceitável.
 *
 * `auth.uid()` do lado do banco, e por isso sem parâmetro: hábito alimentar é
 * dado de saúde, e por parâmetro qualquer autenticado leria o de outro. */
export async function viesDaFoto(): Promise<number | null> {
  const { data, error } = await supabase.rpc('app_vies_da_foto')
  if (error) {
    falha('viés da foto', error)
    return null
  }
  const n = Number(data)
  /* A função devolve nulo com menos de cinco correções em noventa dias. E a
     faixa é conferida aqui também: um número fora dela empurraria todas as
     estimativas seguintes na direção errada, calado. */
  return Number.isFinite(n) && n > 0.3 && n < 3 ? n : null
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
/* 900, e nao 1024.
 *
 * O app REINICIA ao voltar da camera em varios lugares, e o motivo e memoria:
 * o Android mata o processo que ficou atras enquanto a camera do sistema
 * ocupa o aparelho. A imagem e redimensionada e depois virada em base64
 * INTEIRA na memoria -- tres representacoes do mesmo dado vivas ao mesmo
 * tempo, no pior momento possivel.
 *
 * 900 tira 23% dos pixels e continua sendo mais do que o modelo usa para ler
 * um prato: ele nao le rotulo, le forma e cor. Nao e conserto -- no Expo Go a
 * folga e menor do que sera num build, porque ele carrega o proprio ambiente
 * junto -- e uma folga que da para dar sem perder leitura. */
const LADO_MAIOR = 900

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
      mensagem: semImagem(origem),
    }
  }

  const opcoes: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: false,
    /* 0.7, e nao 1. A imagem e reduzida para 1024 de largura logo adiante,
       entao a qualidade maxima na captura nao chega ao resultado -- ela so
       faz o arquivo temporario e o bitmap decodificado ficarem grandes com a
       camera do sistema em primeiro plano. O Android mata o app que esta
       atras quando falta memoria, e o sintoma e o app REINICIANDO ao voltar
       da foto. */
    quality: 0.7,
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
    /* SEM `base64`.
     *
     * Esta linha é a causa do app reiniciar ao voltar da câmera. Com ela, três
     * cópias da mesma foto ficam vivas ao mesmo tempo na memória do telefone —
     * o bitmap redimensionado, o JPEG e a string base64, que é 33% MAIOR que o
     * arquivo — logo depois de a câmera do sistema ter ocupado o aparelho. O
     * Android mata o processo que ficou atrás, e o app volta do zero.
     *
     * Baixar a resolução não resolveu porque o problema não é o tamanho da
     * foto: é a string. Agora o telefone manda os BYTES e o servidor faz a
     * conversão, onde memória sobra. */
    /* DE VOLTA PARA base64, e a memória fica como estava.
     *
     * Eu troquei isto por `multipart/form-data` hoje, para o telefone não
     * precisar montar a imagem em texto — a maior alocação do momento em que o
     * Android mata o app ao voltar da câmera.
     *
     * E a leitura parou de funcionar por inteiro. Não descobri por quê, e não
     * dava para descobrir sem sessão: a função exige login, então eu não
     * consigo exercitar o caminho novo daqui.
     *
     * Foto que às vezes reinicia o app é ruim. Foto que NUNCA lê é pior. Volta
     * para o que funcionava, e a economia de memória fica para quando der para
     * testar de verdade — o caminho multipart continua aceito no servidor,
     * esperando. */
    const reduzida = await manipulateAsync(
      escolha.assets[0].uri,
      [{ resize: { width: LADO_MAIOR } }],
      { compress: 0.8, format: SaveFormat.JPEG, base64: true },
    )

    if (!reduzida.base64) return { tipo: 'erro', mensagem: 'Não consegui preparar a foto.' }

    /* ── A ESPERA PRECISA TER FIM, E TER NOME ───────────────────────────
     *
     * A função do servidor lê o prato com um modelo que RACIOCINA antes de
     * responder — trocado no dia em que a farofa deixou de virar kibe. Ele
     * acerta o prato e demora muito mais que o anterior.
     *
     * Sem prazo, uma chamada que não volta deixa a pessoa olhando o rodinho
     * para sempre: não há erro, não há resultado, e o único caminho é fechar o
     * app. Foi relatado como "carrega, carrega e não consegue".
     *
     * 75 segundos é folgado de propósito — o objetivo não é apertar o
     * servidor, é ter um fim. E o fim diz o que aconteceu: "demorou" é outra
     * coisa de "não deu certo", e só a primeira admite tentar de novo. */
    const desistir = new AbortController()
    const prazo = setTimeout(() => desistir.abort(), 75_000)

    const { data, error } = await supabase.functions.invoke('analisar-alimento', {
      /* @ts-expect-error o supabase-js repassa o sinal ao fetch, mas ainda não
         o declara no tipo das opções de `invoke`. */
      signal: desistir.signal,
      body: {
        imageBase64: reduzida.base64,
        mimeType: 'image/jpeg',
        contexto:
          contexto && (contexto.costuma.length > 0 || (contexto.doPlano?.length ?? 0) > 0)
            ? {
                refeicao: contexto.refeicao,
                costuma: contexto.costuma.slice(0, 8),
                plano: (contexto.doPlano ?? []).slice(0, 8),
                fatorMedioDeCorrecao: contexto.fatorMedioDeCorrecao ?? null,
              }
            : undefined,
      },
    })

    clearTimeout(prazo)

    if (error) {
      /* Desistimos nós, e não o servidor: a frase tem de dizer isso, senão a
         pessoa acha que a foto é que estava ruim e tira outra igual. */
      if (desistir.signal.aborted) {
        falha('Foto: passou de 75s sem resposta', error)
        return {
          tipo: 'erro',
          mensagem: 'A leitura desta foto está demorando demais. Tente de novo em instantes.',
        }
      }
      /* O supabase-js embrulha a resposta de erro: sem abrir o context, toda
         falha do servidor viraria "FunctionsHttpError" na tela — e a função foi
         justamente corrigida para dizer o que aconteceu de verdade. */
      const resposta = (error as { context?: Response }).context
      const corpo = await resposta?.json?.().catch(() => null)

      /* ── O MOTIVO REAL PRECISA APARECER EM ALGUM LUGAR ──────────────────
       *
       * Aqui o `error` era descartado inteiro, e a tela caía na frase genérica
       * "Não consegui analisar a foto agora." Ela é honesta e é inútil: cobre
       * o servidor fora do ar, a sessão vencida, a rede caída e o corpo grande
       * demais com a MESMA palavra — e o motivo não sobrava nem no console.
       *
       * Custou rodadas de teste no aparelho de outra pessoa para descobrir o
       * que uma linha teria dito. É a armadilha 12 ao contrário: a frase de
       * gente estava certa, e faltava a outra metade do trabalho.
       *
       * O `status` separa os casos que se parecem na tela: sem `context` a
       * requisição nem chegou ao servidor (rede), 401 é sessão, 5xx é a função
       * lá dentro. */
      const nome = (error as { name?: string }).name ?? 'erro'
      const status = resposta?.status
      falha(
        'Foto não analisada · ' + nome + (status ? ' · HTTP ' + status : ' · sem resposta do servidor'),
        { corpo, mensagem: (error as { message?: string }).message },
      )

      return { tipo: 'erro', mensagem: corpo?.error ?? 'Não consegui analisar a foto agora.' }
    }

    if (data?.error) return { tipo: 'erro', mensagem: data.error }

    /* Lê a lista, e entende a resposta da função ANTIGA também: sem isso, a
       foto só voltaria a funcionar depois de a função nova subir, e o app
       passaria a depender de os dois lados subirem no mesmo minuto. */
    const itens = itensDaEstimativa(data)

    /* Vazia é foto sem alimento. Não há o que confirmar, e uma folha vazia com
       botão "Registrar" seria pior do que a frase. */
    if (itens.length === 0)
      return {
        tipo: 'erro',
        mensagem: 'Não consegui identificar alimento nesta foto. Tente de mais perto, com luz.',
      }

    return {
      tipo: 'ok',
      base64: reduzida.base64,
      estimativa: {
        descricao: data.descricao ?? 'Alimento',
        itens,
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
