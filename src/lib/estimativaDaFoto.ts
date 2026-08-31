/* A foto virou uma LISTA de alimentos, e o que decide sobre ela mora aqui.
 *
 * ── O que estava errado ───────────────────────────────────────────────────
 * A resposta da IA era UM item por foto. Um prato de arroz, feijão e frango
 * virava a linha "Arroz, feijão e frango — 620 kcal", e isso quebrava as duas
 * coisas que fazem o registro por foto valer alguma coisa:
 *
 *   a pessoa não podia apagar só o que não comeu — era aceitar o bloco inteiro
 *   ou descartar a foto toda;
 *
 *   e a nutricionista, do lado dela, não podia dizer "o arroz está demais",
 *   porque não existia arroz: existia um bloco.
 *
 * O Foodvisor, que é o melhor app de foto do mercado, separa. Era a diferença
 * mais visível entre ele e este app, e não custa modelo melhor — custa esquema.
 *
 * ── Por que num arquivo só de lógica ──────────────────────────────────────
 * Só `import type`, nenhum import de runtime. É o corte do item 14: aqui fica o
 * que decide, em `consumo.ts` fica o que fala com a rede — e é o que decide que
 * erra. Um `import` do Supabase aqui arrastaria o aparelho inteiro e o Node não
 * rodaria o teste. */

/* Um alimento da foto. Nutrientes DA PORÇÃO daquele item, e não por 100 g. */
export type ItemDaFoto = {
  nome: string
  porcaoEstimada: string
  /* Todos podem ser null: "não dá para saber" é resposta legítima — foto
     escura, prato tampado. Zero seria mentira, e somaria como se fosse verdade
     no total do dia (item 6). */
  calorias: number | null
  proteinas: number | null
  carboidratos: number | null
  gorduras: number | null
  fibras: number | null
}

export type Estimativa = {
  /* O rótulo do conjunto — "Almoço", "Prato feito". É o que aparece quando
     alguém olha a foto sem abrir a lista. */
  descricao: string
  itens: ItemDaFoto[]
  confianca: 'alta' | 'media' | 'baixa'
  /* A IA declarou que o hábito ou o plano dela mudou a resposta.
   *
   * Existe para a TELA DIZER. Contexto que age escondido e erra é o pior dos
   * dois mundos: sem contexto o erro é aleatório e a pessoa desconfia; com
   * contexto o erro fica PLAUSÍVEL, bate com o plano dela, e passa. */
  usouContexto: boolean
}

/* Teto de itens.
 *
 * Repetido aqui e na instrução do servidor de propósito: instrução é pedido,
 * validação é garantia. Acima de oito a lista vira rolagem e ninguém confere —
 * e uma lista que ninguém confere é pior do que o bloco único, porque agora são
 * oito números errados em vez de um. */
export const MAXIMO_DE_ITENS = 8

const numero = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v
  /* Negativo é dado torto, e não "menos alimento": somar um negativo derruba o
     total do prato abaixo do que ele tem. Vira desconhecido, como o nulo. */
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null
}

const texto = (v: unknown, limite: number): string =>
  typeof v === 'string' ? v.trim().slice(0, limite) : ''

/* A lista como o servidor mandou, conferida item a item.
 *
 * Um `as ItemDaFoto[]` cru deixaria passar o dia em que o contrato mudar, e aí
 * a tela desenharia "undefined" no lugar do alimento. Item sem nome é
 * descartado: uma linha em branco no diário é pior do que um item a menos. */
export function itensDaResposta(bruto: unknown): ItemDaFoto[] {
  if (!Array.isArray(bruto)) return []

  const itens: ItemDaFoto[] = []
  for (const cru of bruto) {
    if (!cru || typeof cru !== 'object') continue
    const i = cru as Record<string, unknown>
    const nome = texto(i.nome, 80)
    if (nome.length === 0) continue

    itens.push({
      nome,
      porcaoEstimada: texto(i.porcao_estimada, 60),
      calorias: numero(i.calorias),
      proteinas: numero(i.proteinas),
      carboidratos: numero(i.carboidratos),
      gorduras: numero(i.gorduras),
      fibras: numero(i.fibras),
    })
    if (itens.length === MAXIMO_DE_ITENS) break
  }
  return itens
}

/* A resposta inteira do servidor, venha ela de qual versão vier.
 *
 * ── Por que não basta ler `itens` ─────────────────────────────────────────
 * A função de análise devolvia UM alimento por foto, com os nutrientes no
 * primeiro nível. Se o app só soubesse ler a lista, cada foto tirada antes de a
 * função nova subir viraria "não identifiquei alimento nesta foto" — e o app
 * passaria a depender de os dois lados subirem no mesmo minuto.
 *
 * Dia de virada é um jeito de trabalhar que sempre custa um incidente. O outro
 * lado faz o mesmo: a função nova manda os campos antigos junto, somados, para
 * o app das lojas continuar funcionando.
 *
 * Pode sair daqui quando a função nova estiver no ar e não houver mais motivo
 * para voltar atrás. */
export function itensDaEstimativa(data: unknown): ItemDaFoto[] {
  if (!data || typeof data !== 'object') return []
  const d = data as Record<string, unknown>

  const lista = itensDaResposta(d.itens)
  if (lista.length > 0) return lista

  /* Sem lista: ou é a função antiga, ou é foto sem alimento. Um único item, com
     o nome que a resposta antiga chamava de `descricao`. */
  const antigo = itensDaResposta([
    {
      nome: d.descricao,
      porcao_estimada: d.porcao_estimada,
      calorias: d.calorias,
      proteinas: d.proteinas,
      carboidratos: d.carboidratos,
      gorduras: d.gorduras,
      fibras: d.fibras,
    },
  ])

  /* Nome sem nutriente nenhum é foto sem alimento, e não um item: a função
     antiga devolvia "Alimento" com tudo nulo quando não achava nada, e gravar
     isso poria uma linha vazia no diário. */
  const temNumero = antigo[0] && [
    antigo[0].calorias,
    antigo[0].proteinas,
    antigo[0].carboidratos,
    antigo[0].gorduras,
    antigo[0].fibras,
  ].some(v => v !== null)

  return temNumero ? antigo : []
}

/* ── Quanto do prato ela comeu ─────────────────────────────────────────────
 *
 * A IA acerta razoavelmente O QUE é o prato e erra bastante QUANTO tem nele: a
 * medida pública do melhor app de foto do mercado é ±28% de erro na porção.
 *
 * ── Por que frações, e não um controle deslizante ─────────────────────────
 * Um deslizante devolve 87%, e 87% de um número que já é aproximado é precisão
 * inventada. Ninguém olha um prato e pensa "comi 87%": pensa "comi metade".
 *
 * É a mesma escada do `ajustar` que já existe para item registrado — duas telas
 * com escalas diferentes para a mesma ideia fariam a pessoa aprender duas
 * vezes. */
export const FRACOES_DA_PORCAO = [
  { fator: 0.5, rotulo: 'metade' },
  { fator: 1, rotulo: 'tudo' },
  { fator: 1.5, rotulo: 'uma vez e meia' },
  { fator: 2, rotulo: 'o dobro' },
] as const

/* O item reescalado.
 *
 * `null` continua `null`: o que a IA não soube dizer não vira número por ser
 * multiplicado (item 6).
 *
 * A DESCRIÇÃO da porção também muda, e é ela que a pessoa relê depois no
 * diário: "1 concha" que virou metade precisa dizer "metade de 1 concha", senão
 * o item guarda um texto que contradiz os próprios números. */
export function comFator(item: ItemDaFoto, fator: number): ItemDaFoto {
  if (!Number.isFinite(fator) || fator <= 0 || fator === 1) return item

  const x = (v: number | null) => (v === null ? null : Math.round(v * fator))
  const nome = FRACOES_DA_PORCAO.find(f => f.fator === fator)?.rotulo

  return {
    ...item,
    calorias: x(item.calorias),
    proteinas: x(item.proteinas),
    carboidratos: x(item.carboidratos),
    gorduras: x(item.gorduras),
    fibras: x(item.fibras),
    porcaoEstimada:
      item.porcaoEstimada && nome ? `${nome} de ${item.porcaoEstimada}` : item.porcaoEstimada,
  }
}

export type TotaisDaFoto = {
  calorias: number | null
  proteinas: number | null
  carboidratos: number | null
  gorduras: number | null
  fibras: number | null
  /* Itens que entraram sem caloria. A soma sai por baixo e a folha precisa
     poder dizer isso, em vez de mostrar um total que parece completo. */
  semCalorias: number
}

type Campo = 'calorias' | 'proteinas' | 'carboidratos' | 'gorduras' | 'fibras'

/* Nulo quando NENHUM item informou aquele nutriente — diferente de todos terem
   informado zero. Mesma regra de `totaisConsumidos`, e de propósito: dois
   somadores com semânticas diferentes para a mesma tela é como eles divergem. */
function somar(itens: ItemDaFoto[], campo: Campo): number | null {
  let total = 0
  let houve = false
  for (const i of itens) {
    const v = i[campo]
    if (v === null) continue
    total += v
    houve = true
  }
  return houve ? Math.round(total) : null
}

export const totaisDaFoto = (itens: ItemDaFoto[]): TotaisDaFoto => ({
  calorias: somar(itens, 'calorias'),
  proteinas: somar(itens, 'proteinas'),
  carboidratos: somar(itens, 'carboidratos'),
  gorduras: somar(itens, 'gorduras'),
  fibras: somar(itens, 'fibras'),
  semCalorias: itens.filter(i => i.calorias === null).length,
})

/* ── O que a pessoa fez com cada linha ─────────────────────────────────────
 *
 * `dentro` é falso quando ela tirou o item: a IA viu salada e ela não comeu
 * salada. `fator` é quanto daquele item ela comeu. */
export type LinhaEscolhida = { item: ItemDaFoto; fator: number; dentro: boolean }

export const linhasIniciais = (e: Estimativa): LinhaEscolhida[] =>
  e.itens.map(item => ({ item, fator: 1, dentro: true }))

/* As linhas que ficaram, já reescaladas — o que a tela mostra somado embaixo. */
export const escolhidos = (linhas: LinhaEscolhida[]): ItemDaFoto[] =>
  linhas.filter(l => l.dentro).map(l => comFator(l.item, l.fator))

/* ── O que vai para o diário, com a correção junto ─────────────────────────
 *
 * Uma estrutura só, e não duas listas paralelas: o item reescalado e o fator
 * que o reescalou saem do mesmo filtro. Duas listas alinhadas por índice é como
 * a correção de um alimento acaba gravada na linha de outro no dia em que
 * alguém mexer no filtro.
 *
 * ── E por que a correção é o sinal mais valioso que existe ────────────────
 * Quando ela olha a estimativa e diz "comi metade", isso é uma MEDIDA DELA
 * contra a leitura do modelo. O app registrava o resultado corrigido e esquecia
 * que houve correção — e é justamente ela que calibra a próxima foto
 * (`app_vies_da_foto`).
 *
 * Só o fator vira sinal. TIRAR um item não é correção de porção: é a IA ter
 * visto o alimento errado. Guardar isso como fator envenenaria a média — quem
 * tirasse a salada que não comeu ensinaria o modelo a estimar porções menores
 * de tudo.
 *
 * E aceitar como veio é `null`, e não `1`: a diferença importa. Nulo é "não
 * mexeu"; se todo item aceito virasse 1, a média de quem corrige de verdade
 * seria puxada para o meio por quem nunca olhou. */
export type ItemConferido = { item: ItemDaFoto; fatorCorrecao: number | null }

export const paraGravar = (linhas: LinhaEscolhida[]): ItemConferido[] =>
  linhas
    .filter(l => l.dentro)
    .map(l => ({
      item: comFator(l.item, l.fator),
      fatorCorrecao: l.fator !== 1 ? l.fator : null,
    }))
