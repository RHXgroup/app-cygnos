/* O questionário pré-consulta, do lado de quem responde.
 *
 * ── Por que isto não é uma anamnese nova ──────────────────────────────────
 * O sistema da nutricionista já tem tudo: modelos com seções e campos tipados,
 * dois padrões (adulto e criança), token, resumo por IA, marca de visto. Ela
 * monta o modelo dela e envia; o link chega por WhatsApp e se perde na conversa.
 *
 * O que faltava era só o app achar o que é dele. Uma tabela `app_anamnese` teria
 * sido a segunda implementação do mesmo assunto — as duas divergiriam, e ninguém
 * descobriria por qual a resposta do paciente passou. É o item 5 do AGENTS.md.
 *
 * ── O que mora aqui ───────────────────────────────────────────────────────
 * O que DECIDE: qual vazio cada tipo de campo tem, quais perguntas se mostram a
 * esta pessoa, quanto já foi respondido. Nada de rede — só `import type` — e por
 * isso roda fora do aparelho, com JSON de verdade.
 *
 * ── E o que este arquivo NÃO faz ──────────────────────────────────────────
 * Validar. Todo campo do questionário é opcional, de propósito e do lado de lá
 * também: o objetivo é a pessoa TERMINAR, não ser exaustiva. Um obrigatório no
 * meio de trinta perguntas é onde alguém fecha o app e não volta. */

export type TipoDeCampo =
  | 'texto'
  | 'textarea'
  | 'radio'
  | 'checkbox_multi'
  | 'booleano'
  | 'numero'
  | 'data'
  | 'escala_1a10'
  | 'objetivo'
  | 'alergias'

export type Campo = {
  /* A chave é o que identifica a resposta no jsonb, e ela é ESTÁVEL: renomear a
     pergunta do lado da nutricionista não pode perder o que já foi respondido. */
  chave: string
  label: string
  ajuda: string | null
  tipo: TipoDeCampo
  opcoes: string[]
}

export type Secao = { titulo: string; subtitulo: string | null; campos: Campo[] }
export type Modelo = { secoes: Secao[] }

export type Respostas = Record<string, unknown>

/* Cada tipo começa com o vazio que o seu widget entende.
 *
 * Errar aqui não dá aviso no console: dá erro de renderização no celular de
 * quem está respondendo. Um `null` onde a lista de marcados era esperada
 * derruba o `.includes` na primeira pergunta de múltipla escolha. */
export function valorInicial(tipo: TipoDeCampo): unknown {
  if (tipo === 'checkbox_multi' || tipo === 'alergias') return []
  if (tipo === 'texto' || tipo === 'textarea') return ''
  return null
}

export function vazioDoModelo(m: Modelo): Respostas {
  const v: Respostas = {}
  for (const s of m.secoes) for (const c of s.campos) v[c.chave] = valorInicial(c.tipo)
  return v
}

/* A única pergunta que a tela esconde sozinha.
 *
 * Gestação não se pergunta a criança nem a homem. O modelo pediátrico do
 * sistema já não tem esse campo, mas a nutricionista pode montar um modelo dela
 * e incluí-lo sem pensar no público — e quem paga é quem lê "está grávida?"
 * sobre o filho de sete anos.
 *
 * A regra fica na CHAVE, e não no modelo, porque é a chave que carrega o
 * significado: o rótulo ela reescreve, a chave não. */
export function campoVisivel(campo: Campo, feminino: boolean): boolean {
  if (campo.chave === 'gestante_lactante') return feminino
  return true
}

/* As seções já sem o que não se pergunta a esta pessoa.
 *
 * Seção que ficou sem pergunta nenhuma SAI: senão ela vira um passo em branco
 * com um botão de continuar, e quem responde fica procurando a pergunta que não
 * está lá. */
export function secoesVisiveis(m: Modelo, feminino: boolean): Secao[] {
  return m.secoes
    .map(s => ({ ...s, campos: s.campos.filter(c => campoVisivel(c, feminino)) }))
    .filter(s => s.campos.length > 0)
}

/* "Outro objetivo" é desenhado DENTRO do campo de objetivo, logo acima dele.
 *
 * Renderizar de novo como texto solto mostraria a mesma caixa duas vezes. Se a
 * nutricionista tirou a pergunta de objetivo do modelo dela, este volta a ser um
 * campo de texto comum — por isso a condição olha a seção, e não só a chave. */
export function ehOutroDoObjetivo(campo: Campo, secao: Secao): boolean {
  return campo.chave === 'objetivo_outro' && secao.campos.some(c => c.tipo === 'objetivo')
}

/* Se a pessoa respondeu alguma coisa neste campo.
 *
 * Zero e `false` CONTAM como resposta: quem marcou "não" respondeu, e quem
 * escreveu 0 escreveu um número. Tratar os dois como vazio faria a tela dizer
 * "você não respondeu" para quem respondeu — e, pior, faria o contador de
 * progresso andar para trás quando a pessoa marcasse "não". */
export function respondido(valor: unknown): boolean {
  if (valor === null || valor === undefined) return false
  if (typeof valor === 'string') return valor.trim() !== ''
  if (Array.isArray(valor)) return valor.length > 0
  if (typeof valor === 'number') return Number.isFinite(valor)
  return true
}

export function quantasRespondidas(secoes: Secao[], r: Respostas): number {
  let n = 0
  for (const s of secoes) for (const c of s.campos) if (respondido(r[c.chave])) n++
  return n
}

export function quantasPerguntas(secoes: Secao[]): number {
  return secoes.reduce((s, sec) => s + sec.campos.length, 0)
}

/* O modelo cru que a função do banco devolve, virando o que a tela desenha.
 *
 * Mesma doutrina de `rotinaDaIA`: o que não dá para ler é DESCARTADO, e o que
 * sobra é o que aparece. Campo sem chave viraria uma resposta que ninguém
 * consegue ler depois; campo com tipo desconhecido — porque a nutricionista
 * ganhou um tipo novo que este app ainda não desenha — some em vez de virar uma
 * caixa em branco que a pessoa toca sem saber no quê. */
const TIPOS: TipoDeCampo[] = [
  'texto', 'textarea', 'radio', 'checkbox_multi', 'booleano',
  'numero', 'data', 'escala_1a10', 'objetivo', 'alergias',
]

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

export function modeloDoBanco(bruto: unknown): Modelo {
  const m = (bruto ?? {}) as { secoes?: unknown }
  const secoes: Secao[] = []

  for (const s of Array.isArray(m.secoes) ? m.secoes : []) {
    const sec = (s ?? {}) as { titulo?: unknown; subtitulo?: unknown; campos?: unknown }
    const campos: Campo[] = []

    for (const c of Array.isArray(sec.campos) ? sec.campos : []) {
      const campo = (c ?? {}) as {
        chave?: unknown; label?: unknown; ajuda?: unknown; tipo?: unknown; opcoes?: unknown
      }
      const chave = texto(campo.chave)
      const tipo = texto(campo.tipo) as TipoDeCampo
      if (!chave || !TIPOS.includes(tipo)) continue

      campos.push({
        chave,
        /* Sem rótulo, a chave serve: "medicamentos_suplementos" é feio, e é
           muito melhor do que uma pergunta em branco. */
        label: texto(campo.label) || chave,
        ajuda: texto(campo.ajuda) || null,
        tipo,
        opcoes: (Array.isArray(campo.opcoes) ? campo.opcoes : [])
          .map(o => texto(o))
          .filter(o => o !== ''),
      })
    }

    if (campos.length > 0) {
      secoes.push({
        titulo: texto(sec.titulo) || 'Perguntas',
        subtitulo: texto(sec.subtitulo) || null,
        campos,
      })
    }
  }

  return { secoes }
}

/* ── Alergias ──────────────────────────────────────────────────────────────
 *
 * O catálogo da RDC 26/2015, que é o mesmo do sistema. Aqui só id e nome: o
 * sistema tem também os termos que casam com nome de alimento, e isso serve
 * para ele conferir cardápio — o app não faz essa conferência, e trazer os
 * termos junto seria carregar uma lista para não usar.
 *
 * O que NÃO pode divergir é o `id`: ele é o que fica gravado na resposta e o que
 * a nutricionista lê do outro lado. */
export const ALERGENOS: { id: string; nome: string }[] = [
  { id: 'leite', nome: 'Leite (proteína / APLV)' },
  { id: 'ovo', nome: 'Ovo' },
  { id: 'trigo', nome: 'Trigo / glúten' },
  { id: 'soja', nome: 'Soja' },
  { id: 'amendoim', nome: 'Amendoim' },
  { id: 'castanhas', nome: 'Castanhas / oleaginosas' },
  { id: 'peixe', nome: 'Peixe' },
  { id: 'frutos_mar', nome: 'Frutos do mar' },
  { id: 'gergelim', nome: 'Gergelim' },
  { id: 'lactose', nome: 'Lactose (intolerância)' },
  { id: 'gluten_int', nome: 'Glúten (doença celíaca)' },
  { id: 'frutose', nome: 'Frutose (intolerância)' },
]

const PREFIXO_CUSTOM = 'custom:'
export const ehCustom = (id: string): boolean => id.startsWith(PREFIXO_CUSTOM)
export const textoCustom = (id: string): string => id.slice(PREFIXO_CUSTOM.length).trim()
export const idCustom = (t: string): string => PREFIXO_CUSTOM + t.trim()

/* O que aparece escrito no chip, seja do catálogo ou digitado por ela. */
export function nomeDoAlergeno(id: string): string {
  if (ehCustom(id)) return textoCustom(id)
  return ALERGENOS.find(a => a.id === id)?.nome ?? id
}
