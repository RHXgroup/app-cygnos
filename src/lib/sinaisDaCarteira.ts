/* Os sinais da carteira dela, virados numa linha de painel.
 *
 * ──────────────────── De onde vem ────────────────────
 * `aurora_carteira_triagem()`, que já existe no banco e já é usada pela aba
 * Carteira no site. É SQL puro, sem IA e sem custo: os pacientes ativos com
 * pelo menos um sinal, e os números que sustentam cada sinal.
 *
 * ──────────────────── Por que isto é uma LINHA, e não um painel ────────────────────
 * O site tem a Carteira inteira, com cinco colunas e leitura por IA. Repetir
 * aquilo no celular daria uma tela bonita e ignorada. O que cabe no bolso é uma
 * frase que aparece SÓ quando há alguém, e que ela toca para ver os nomes.
 *
 * ──────────────────── O que este arquivo NÃO faz ────────────────────
 * Rede. Ele só decide, e por isso dá para testar com o dado torto que o banco
 * de verdade devolve -- que é jsonb, e chega aqui como `unknown`. */

export type SinalApp = { dias: number; ultimo_registro: string | null; nunca_registrou: boolean }
export type SinalPeso = { de: number; para: number; delta: number }
export type SinalExame = { quantidade: number; desde: string }
export type SinalGestacao = { semanas: number; dpp: string | null }
export type SinalRetorno = { dias: number; ultima_consulta: string }

export type Sinais = {
  app_silencio?: SinalApp
  peso_subindo?: SinalPeso
  exame_parado?: SinalExame
  terceiro_trimestre?: SinalGestacao
  sem_retorno?: SinalRetorno
}

export type Sinalizado = {
  id: number
  nome: string
  sinais: Sinais
}

export type Chave = keyof Sinais

/* A ordem é de URG~EC~NCIA, e não alfabética nem de quantidade.
 *
 * O terceiro trimestre encabeça porque é o único com prazo que fecha: a janela
 * é de 27 a 29 semanas, e passada ela o aviso perdeu a serventia. Peso subindo
 * fica por último porque é o único que pode ser a meta sendo cumprida -- quem
 * está em ganho de massa sobe de propósito, e tratar isso como alarme ensinaria
 * ela a ignorar a lista inteira. */
export const ORDEM: Chave[] = [
  'terceiro_trimestre',
  'exame_parado',
  'sem_retorno',
  'app_silencio',
  'peso_subindo',
]

const NOME_DO_SINAL: Record<Chave, string> = {
  terceiro_trimestre: 'no terceiro trimestre',
  exame_parado: 'exame parado',
  sem_retorno: 'sem retorno',
  app_silencio: 'sumiu do app',
  peso_subindo: 'peso subindo',
}

/* ──────────────────── Ler o que o banco mandou ────────────────────
 * `jsonb` chega como `unknown`, e o formato pode mudar do outro lado sem nada
 * avisar aqui. Uma lista com um item torto não pode derrubar o painel inteiro:
 * o item torto sai fora e o resto aparece. Armadilha 10, pelo lado do dado. */
const numero = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

const texto = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null

function lerSinais(cru: unknown): Sinais {
  if (typeof cru !== 'object' || cru === null) return {}
  const o = cru as Record<string, unknown>
  const s: Sinais = {}

  const app = o.app_silencio as Record<string, unknown> | undefined
  const dias = app ? numero(app.dias) : null
  if (dias !== null) {
    s.app_silencio = {
      dias,
      ultimo_registro: app ? texto(app.ultimo_registro) : null,
      nunca_registrou: app?.nunca_registrou === true,
    }
  }

  const peso = o.peso_subindo as Record<string, unknown> | undefined
  const delta = peso ? numero(peso.delta) : null
  if (peso && delta !== null) {
    s.peso_subindo = {
      de: numero(peso.de) ?? 0,
      para: numero(peso.para) ?? 0,
      delta,
    }
  }

  const exame = o.exame_parado as Record<string, unknown> | undefined
  const quantidade = exame ? numero(exame.quantidade) : null
  if (exame && quantidade !== null) {
    s.exame_parado = { quantidade, desde: texto(exame.desde) ?? '' }
  }

  const gest = o.terceiro_trimestre as Record<string, unknown> | undefined
  const semanas = gest ? numero(gest.semanas) : null
  if (gest && semanas !== null) {
    s.terceiro_trimestre = { semanas, dpp: texto(gest.dpp) }
  }

  const ret = o.sem_retorno as Record<string, unknown> | undefined
  const diasSem = ret ? numero(ret.dias) : null
  if (ret && diasSem !== null) {
    s.sem_retorno = { dias: diasSem, ultima_consulta: texto(ret.ultima_consulta) ?? '' }
  }

  return s
}

export function lerTriagem(cru: unknown): Sinalizado[] {
  if (!Array.isArray(cru)) return []

  const fora: Sinalizado[] = []
  for (const item of cru) {
    if (typeof item !== 'object' || item === null) continue
    const o = item as Record<string, unknown>

    const id = numero(o.paciente_id)
    const nome = texto(o.nome)
    /* Sem id ou sem nome não dá para mostrar nem para tocar: seria uma linha em
       branco na lista, que se lê como app quebrado. */
    if (id === null || nome === null) continue

    const sinais = lerSinais(o.sinais)
    /* A função do banco só devolve quem TEM sinal, mas se todos vierem tortos
       o paciente entraria na conta sem motivo nenhum escrito ao lado. */
    if (ORDEM.every(c => sinais[c] === undefined)) continue

    fora.push({ id, nome, sinais })
  }
  return fora
}

/* ──────────────────── O motivo, em palavras ────────────────────
 * Uma frase curta por pessoa, do sinal mais urgente que ela tem. Duas frases
 * numa linha de celular não cabem, e escolher a primeira da ORDEM é o mesmo
 * critério que decide a lista. */
export function motivoDe(p: Sinalizado): string {
  const s = p.sinais

  if (s.terceiro_trimestre) return `${s.terceiro_trimestre.semanas} semanas de gestação`

  if (s.exame_parado) {
    const q = s.exame_parado.quantidade
    return q === 1 ? 'exame esperando análise' : `${q} exames esperando análise`
  }

  if (s.sem_retorno) return `sem retorno há ${diasEmPalavras(s.sem_retorno.dias)}`

  if (s.app_silencio) {
    /* "Nunca registrou nada" e "parou de registrar" pedem conversas diferentes,
       e a mesma frase para os dois faria ela abrir a ficha para descobrir qual
       dos dois é -- que é exatamente o clique que este painel existe para
       poupar. */
    if (s.app_silencio.nunca_registrou) return 'instalou o app e nunca registrou'
    return `sem registrar no app há ${diasEmPalavras(s.app_silencio.dias)}`
  }

  if (s.peso_subindo) {
    const kg = s.peso_subindo.delta
    /* O SENTIDO, sem julgamento: para quem está em ganho de massa isto é a meta
       sendo cumprida. A tela mostra o número e cala a boca. */
    return `peso subiu ${virgula(kg)} kg`
  }

  return 'pede atenção'
}

/* "62 dias", "2 meses", "1 ano". Acima de dois meses o número exato de dias
   para de significar: a diferença entre 74 e 81 não muda nada, e o número
   grande só ocupa espaço numa linha estreita. */
export function diasEmPalavras(dias: number): string {
  if (!Number.isFinite(dias) || dias < 0) return 'algum tempo'
  if (dias < 60) return dias === 1 ? '1 dia' : `${Math.round(dias)} dias`

  const meses = Math.floor(dias / 30)
  if (meses < 12) return `${meses} meses`

  const anos = Math.floor(dias / 365)
  return anos === 1 ? '1 ano' : `${anos} anos`
}

/* Uma casa decimal, com vírgula, e sem casa nenhuma quando é redondo.
   "1,2 kg" se lé em português; "1.2 kg" é jeitão de planilha. */
export function virgula(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const arredondado = Math.round(n * 10) / 10
  return String(arredondado).replace('.', ',')
}

export type ResumoDaAtencao = {
  total: number
  /* "3 pacientes pedem atenção". Vazia quando não há ninguém -- e a
     ausência da frase é o que faz ela ser lida quando aparece. */
  frase: string
  /* "2 sem retorno · 1 exame parado". A quebra por sinal, na ordem de urgência,
     porque "3 pedem atenção" sozinho não diz se ela precisa ligar para alguém
     hoje ou abrir o computador depois. */
  porSinal: string
}

export function resumoDaAtencao(pessoas: Sinalizado[]): ResumoDaAtencao {
  const total = pessoas.length
  if (total === 0) return { total: 0, frase: '', porSinal: '' }

  const contagem = new Map<Chave, number>()
  for (const p of pessoas) {
    /* Uma pessoa conta UMA vez, pelo sinal mais urgente dela. Somar todos os
       sinais faria "3 pacientes" virar "5 avisos", e ai os dois números na
       mesma tela não fecham -- e quem lê para de confiar nos dois. */
    const principal = ORDEM.find(c => p.sinais[c] !== undefined)
    if (principal) contagem.set(principal, (contagem.get(principal) ?? 0) + 1)
  }

  const pedacos = ORDEM.filter(c => contagem.has(c)).map(
    c => `${contagem.get(c)} ${NOME_DO_SINAL[c]}`,
  )

  return {
    total,
    frase: total === 1 ? '1 paciente pede atenção' : `${total} pacientes pedem atenção`,
    porSinal: pedacos.join(' · '),
  }
}

/* A ordem em que os nomes aparecem quando ela toca na linha.
 *
 * Pelo sinal mais urgente primeiro, e alfabética dentro de cada sinal. O banco
 * já devolve em ordem de nome; reordenar aqui é o que põe a gestante de 28
 * semanas acima do peso que subiu 300 gramas. */
export function porUrgencia(pessoas: Sinalizado[]): Sinalizado[] {
  const peso = (p: Sinalizado) => {
    const i = ORDEM.findIndex(c => p.sinais[c] !== undefined)
    return i < 0 ? ORDEM.length : i
  }
  return [...pessoas].sort((a, b) => {
    const d = peso(a) - peso(b)
    return d !== 0 ? d : a.nome.localeCompare(b.nome, 'pt-BR')
  })
}
