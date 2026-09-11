/* O prontuário que o sistema grava, lido para a tela estreita.
 *
 * Anamnese, exames, cálculo energético e o resumo da Aurora chegam do banco em
 * formas que o SISTEMA escreveu -- jsonb com chave de sublinhado, data em texto,
 * código de fórmula. Este arquivo transforma isso no que a nutricionista lê, e
 * não importa nada de runtime: é o que o teste exercita fora do aparelho.
 *
 * ──────────────────── Só leitura ────────────────────
 * Nada aqui escreve. Digitar anamnese e antropometria continua no computador --
 * são dezenas de campos, e um dígito errado numa tela estreita muda a conduta.
 * Mas LER, com a paciente na frente, é justamente o que o celular faz melhor. O
 * pedido foi: "a ficha completa, anamnese, exames, energético, medidas".
 *
 * Rode com: node --experimental-strip-types src/lib/leituraDoProntuario.teste.mts */

// ════════════════════════════ ANAMNESE ════════════════════════════

/* A data da anamnese é TEXTO, dd/mm/aaaa, e não `date`.
 *
 * E em 54 de 66 fichas ela é '' -- vazia, e não nula (medido pelo sistema em
 * `dataDaAnamneseVaziaNaoEhNula.test.ts`). Isso derrubava a ficha do app: a
 * leitura fazia `data_anamnese ?? created_at`, e o `??` não cai para o segundo
 * quando o primeiro é string vazia. A ficha dizia "Última anamnese: Nenhuma"
 * para quem tinha anamnese preenchida.
 *
 * Devolve ISO (aaaa-mm-dd), ou null quando nenhuma das duas serve. Data que não
 * existe no calendário (31/02) não passa: é melhor cair na data de gravação do
 * que mostrar um dia inventado. */
export function dataDaAnamnese(texto: unknown, criadoEm: unknown): string | null {
  if (typeof texto === 'string') {
    const m = texto.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (m) {
      const iso = m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0')
      if (diaExiste(iso)) return iso
    }
    /* Já em ISO: não é o que o sistema grava hoje, mas o importador de outro
       sistema pode ter gravado assim. */
    const iso = texto.trim().slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso) && diaExiste(iso)) return iso
  }
  if (typeof criadoEm === 'string') {
    const iso = criadoEm.slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso) && diaExiste(iso)) return iso
  }
  return null
}

function diaExiste(iso: string): boolean {
  const d = new Date(iso + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso
}

export type CampoLido = {
  rotulo: string
  /* Uma linha na maioria dos campos. Grupo repetível e escala de sinais viram
     várias -- "Refeição 1: café, pão" -- porque numa tela estreita uma lista
     emendada por vírgula vira um parágrafo ilegível. */
  linhas: string[]
}

export type SecaoLida = {
  titulo: string
  campos: CampoLido[]
  /* Quantos campos da seção ficaram sem resposta. Eles não aparecem -- uma
     coluna de traços se lê como app quebrado --, mas o número diz que existiam. */
  semResposta: number
}

export type AnamneseLida = {
  secoes: SecaoLida[]
  /* Documento importado não é ficha: o "rótulo" é o nome do arquivo e o valor
     é o documento inteiro. A tela lê como texto corrido. */
  importado: boolean
}

/* O que o sistema grava em `respostas`:
 *
 *   { _secoes: [{ titulo, campos: [{ label, tipo, valor }] }], _template_id, "345": ... }
 *
 * `_secoes` é uma FOTO do modelo no momento do preenchimento, com o rótulo de
 * cada pergunta junto do valor. É por ela que se lê -- as chaves numéricas são
 * ids de pergunta que podem ter sido apagadas do modelo depois. O próprio
 * sistema lê assim (`ModalVisualizar`, em `anamnese.tsx`). */
export function anamneseLida(respostas: unknown): AnamneseLida {
  const r = objeto(respostas)
  const importado = r?._importado_de_arquivo === true
  const cruas = Array.isArray(r?._secoes) ? (r!._secoes as unknown[]) : []

  const secoes: SecaoLida[] = []
  for (const cru of cruas) {
    const s = objeto(cru)
    if (!s) continue
    const campos: CampoLido[] = []
    let semResposta = 0
    for (const c of Array.isArray(s.campos) ? (s.campos as unknown[]) : []) {
      const campo = objeto(c)
      if (!campo) continue
      const linhas = linhasDoValor(texto(campo.tipo), campo.valor)
      if (!linhas.length) {
        semResposta++
        continue
      }
      campos.push({ rotulo: texto(campo.label) || 'Sem título', linhas })
    }
    /* Seção inteira sem resposta some -- mas conta, para a tela poder dizer
       "3 seções sem resposta" em vez de fingir que o modelo era menor. */
    secoes.push({ titulo: texto(s.titulo) || 'Sem título', campos, semResposta })
  }
  return { secoes, importado }
}

/* O valor de uma resposta em linhas de texto. Lista vazia = sem resposta.
 *
 * Os tipos são os do sistema (`anamnese.tsx`, `renderValor`), e o que ele não
 * trata de jeito especial cai no genérico -- que para objeto é "chave: valor",
 * nunca "[object Object]". `escala_urina` está nesse caso: o formato dela não
 * aparece em lugar nenhum do sistema, e o genérico lê qualquer um. */
export function linhasDoValor(tipo: string, v: unknown): string[] {
  if (v === null || v === undefined) return []
  if (typeof v === 'boolean') return [v ? 'Sim' : 'Não']
  if (typeof v === 'number') return Number.isFinite(v) ? [String(v).replace('.', ',')] : []
  if (typeof v === 'string') {
    const t = v.trim()
    if (!t) return []
    /* A data de um campo `data` vem como o `<input type="date">` escreve. */
    if (tipo === 'data' && /^\d{4}-\d{2}-\d{2}$/.test(t)) {
      return [t.slice(8, 10) + '/' + t.slice(5, 7) + '/' + t.slice(0, 4)]
    }
    return [t]
  }

  if (tipo === 'grupo_repetivel' && Array.isArray(v)) {
    const linhas: string[] = []
    v.forEach((entrada, i) => {
      const o = objeto(entrada)
      if (!o) return
      const partes = Object.entries(o)
        .map(([k, val]) => [k, textoSolto(val)] as const)
        .filter(([, val]) => val)
        .map(([k, val]) => k + ': ' + val)
      if (partes.length) linhas.push((v.length > 1 ? i + 1 + '. ' : '') + partes.join(' · '))
    })
    return linhas
  }

  if (tipo === 'escala_sinais_clinicos' && objeto(v)) {
    return Object.entries(objeto(v)!)
      .filter(([, sinais]) => Array.isArray(sinais) && sinais.length > 0)
      .map(([categoria, sinais]) => categoria + ': ' + (sinais as unknown[]).map(textoSolto).filter(Boolean).join(', '))
  }

  if (tipo === 'escala_bristol' && objeto(v)) {
    const b = objeto(v)!
    const linhas: string[] = []
    if (textoSolto(b.tipo)) linhas.push('Tipo ' + textoSolto(b.tipo))
    if (textoSolto(b.cor)) linhas.push('Cor: ' + textoSolto(b.cor))
    return linhas
  }

  if (Array.isArray(v)) {
    const itens = v.map(textoSolto).filter(Boolean)
    return itens.length ? [itens.join(', ')] : []
  }

  const o = objeto(v)
  if (o) {
    return Object.entries(o)
      .map(([k, val]) => [k, textoSolto(val)] as const)
      .filter(([, val]) => val)
      .map(([k, val]) => k + ': ' + val)
  }
  return []
}

/* Um valor qualquer como texto de uma linha, ou '' se não houver o que dizer. */
function textoSolto(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v).replace('.', ',') : ''
  if (typeof v === 'string') return v.trim()
  if (Array.isArray(v)) return v.map(textoSolto).filter(Boolean).join(', ')
  const o = objeto(v)
  if (o) return Object.entries(o).map(([k, val]) => {
    const t = textoSolto(val)
    return t ? k + ': ' + t : ''
  }).filter(Boolean).join(', ')
  return ''
}

// ════════════════════════════ EXAMES ════════════════════════════

export type StatusDoMarcador = 'critico' | 'alto' | 'baixo' | 'normal' | 'indeterminado'

export type Marcador = {
  nome: string
  categoria: string | null
  /* TEXTO, e não número: o laudo escreve "< 200", "1.234,5", "reagente". Virar
     número aqui perderia o sinal de menor e trocaria o milhar pela vírgula. */
  valor: string | null
  unidade: string | null
  referencia: string | null
  status: StatusDoMarcador
  interpretacao: string | null
}

export type ExameLido = {
  resumo: string | null
  marcadores: Marcador[]
  alterados: number
  criticos: number
}

/* O que sai de `analises_de_exame.texto`, que é a saída da função
 * `analisar-exame` do sistema:
 *
 *   { resumo, resumo_ia?, contagem: {...}, marcadores: [{ nome, categoria, valor,
 *     unidade, referencia, status, interpretacao }] }
 *
 * A contagem é RECONTADA aqui a partir dos marcadores, e não lida de `contagem`:
 * o sistema tem dois formatos para ela (`alterados` na função, `atencao` numa
 * lib), e contar o que está na mão não diverge de nada.
 *
 * Nulo quando não há análise -- exame enviado e ainda não lido. */
export function exameLido(textoDaAnalise: unknown): ExameLido | null {
  const t = objeto(textoDaAnalise)
  if (!t) return null
  const marcadores: Marcador[] = []
  for (const cru of Array.isArray(t.marcadores) ? (t.marcadores as unknown[]) : []) {
    const m = objeto(cru)
    const nome = texto(m?.nome)
    if (!m || !nome) continue
    marcadores.push({
      nome,
      categoria: texto(m.categoria) || null,
      valor: textoSolto(m.valor) || null,
      unidade: texto(m.unidade) || null,
      referencia: texto(m.referencia) || null,
      status: statusDoMarcador(m.status),
      interpretacao: texto(m.interpretacao) || null,
    })
  }
  /* O alterado primeiro: é o que ela procura. Dentro de cada grupo, a ordem do
     laudo -- que é a ordem em que o laboratório agrupou. `sort` é estável. */
  marcadores.sort((a, b) => PESO[a.status] - PESO[b.status])
  const resumo = texto(t.resumo_ia) || texto(t.resumo) || null
  return {
    resumo,
    marcadores,
    alterados: marcadores.filter(m => m.status === 'alto' || m.status === 'baixo').length,
    criticos: marcadores.filter(m => m.status === 'critico').length,
  }
}

const PESO: Record<StatusDoMarcador, number> = { critico: 0, alto: 1, baixo: 1, indeterminado: 2, normal: 3 }

/* Valor novo vira `indeterminado`, e não `normal` -- armadilha 10. Chamar de
   normal um status que o app não conhece é dar alta a um exame que ninguém leu. */
export function statusDoMarcador(s: unknown): StatusDoMarcador {
  const t = texto(s).toLowerCase()
  if (t === 'critico' || t === 'crítico') return 'critico'
  if (t === 'alto' || t === 'baixo' || t === 'normal') return t
  return 'indeterminado'
}

export function rotuloDoMarcador(s: StatusDoMarcador): string {
  return { critico: 'Crítico', alto: 'Alto', baixo: 'Baixo', normal: 'Normal', indeterminado: 'Sem referência' }[s]
}

// ════════════════════════════ CÁLCULO ENERGÉTICO ════════════════════════════

/* Copiado de `catalogoCalculoEnergetico.ts`, no sistema, em 11/09/2026.
 *
 * Com UMA diferença, de propósito: lá, código desconhecido vira "Harris-Benedict
 * 1984" -- a primeira da lista. Aqui vira o próprio código, legível. Uma fórmula
 * nova no sistema aparecer no celular com o nome de outra é a armadilha 10: o app
 * afirmando o que não sabe, numa tela onde o nome da fórmula é o que diz se o
 * número é confiável. */
const FORMULAS: Record<string, string> = {
  harris_1984: 'Harris-Benedict 1984 (revisada)',
  harris_1919: 'Harris-Benedict 1919 (original)',
  mifflin: 'Mifflin-St Jeor 1990',
  mifflin_mlg: 'Mifflin-St Jeor (MLG)',
  katch_mcardle: 'Katch-McArdle 1996',
  cunningham: 'Cunningham 1980',
  fao_who_adulto: 'FAO/WHO 2004',
  henry_rees: 'Schofield 1985 (peso)',
  eer_2005_adulto: 'EER/IOM 2005',
  eer_2023_adulto: 'EER 2023',
  tinsley_peso: 'Tinsley (peso) 2018',
  tinsley_mlg: 'Tinsley (MLG) 2018',
  get_bolso: 'GET de bolso (kcal/kg)',
  tmb_manual: 'TMB manual',
  get_manual: 'GET manual',
  eer_2005_crianca: 'EER/IOM 2005 (criança)',
  eer_2023_crianca: 'EER 2023 (criança)',
  fao_who_crianca: 'FAO/WHO 2004 (criança)',
  schofield: 'Schofield 1985 (peso e altura)',
  min_saude_gestante: 'Ministério da Saúde 2005',
  eer_2023_gestante: 'EER 2023 (gestante)',
  eer_2023_lactante: 'EER 2023 (lactante)',
}

export function rotuloDaFormula(codigo: unknown): string {
  const c = texto(codigo)
  if (!c) return 'Fórmula não informada'
  const conhecida = doMapa(FORMULAS, c)
  if (conhecida) return conhecida
  const legivel = c.replace(/[_-]+/g, ' ').trim()
  return legivel.charAt(0).toUpperCase() + legivel.slice(1)
}

// ════════════════════════════ O RESUMO DA AURORA ════════════════════════════

/* O mesmo resumo que o sistema gera na aba Aurora da ficha, e não um parecido.
 *
 * "Gerar o mesmo resumo do paciente que o sistema gera." Quem gera é a função
 * `aurora-monitor`, e o resultado fica guardado em `aurora_execucoes` -- o app
 * pede à MESMA função e lê da MESMA tabela. Um resumo feito aqui com outro
 * prompt divergiria do de lá no primeiro dia, e ela veria duas Auroras dizendo
 * coisas diferentes sobre a mesma pessoa. */

export type ResumoDaAurora = {
  resumo: string
  deficits: { titulo: string; detalhe: string; evidencia: string; gravidade: string }[]
  pontosFortes: { titulo: string; detalhe: string; evidencia: string }[]
  evolucao: { indicador: string; direcao: string; detalhe: string; evidencia: string }[]
  cenarios: { se: string; entao: string; prazo: string; confianca: string }[]
  prevencoes: { acao: string; motivo: string; prioridade: string }[]
  lacunas: { oQueFalta: string; porQueImporta: string }[]
}

/* Nulo quando não há resumo que se sustente. Cada lista vem LIMPA: item sem o
   campo principal sai, em vez de desenhar um cartão vazio. */
export function resumoDaAurora(analise: unknown): ResumoDaAurora | null {
  const a = objeto(analise)
  if (!a) return null
  const lista = (v: unknown) => (Array.isArray(v) ? v.map(objeto).filter((o): o is Obj => !!o) : [])
  const r: ResumoDaAurora = {
    resumo: texto(a.resumo),
    deficits: lista(a.deficits)
      .map(o => ({ titulo: texto(o.titulo), detalhe: texto(o.detalhe), evidencia: texto(o.evidencia), gravidade: texto(o.gravidade) }))
      .filter(o => o.titulo),
    pontosFortes: lista(a.pontos_fortes)
      .map(o => ({ titulo: texto(o.titulo), detalhe: texto(o.detalhe), evidencia: texto(o.evidencia) }))
      .filter(o => o.titulo),
    evolucao: lista(a.evolucao)
      .map(o => ({ indicador: texto(o.indicador), direcao: texto(o.direcao), detalhe: texto(o.detalhe), evidencia: texto(o.evidencia) }))
      .filter(o => o.indicador),
    cenarios: lista(a.cenarios)
      .map(o => ({ se: texto(o.se), entao: texto(o.entao), prazo: texto(o.prazo), confianca: texto(o.confianca) }))
      .filter(o => o.se && o.entao),
    prevencoes: lista(a.prevencoes)
      .map(o => ({ acao: texto(o.acao), motivo: texto(o.motivo), prioridade: texto(o.prioridade) }))
      .filter(o => o.acao),
    lacunas: lista(a.lacunas)
      .map(o => ({ oQueFalta: texto(o.o_que_falta), porQueImporta: texto(o.por_que_importa) }))
      .filter(o => o.oQueFalta),
  }
  const vazio = !r.resumo && !r.deficits.length && !r.pontosFortes.length && !r.evolucao.length &&
    !r.cenarios.length && !r.prevencoes.length && !r.lacunas.length
  return vazio ? null : r
}

export type EstadoDoResumo = {
  resumo: ResumoDaAurora | null
  geradoEm: string | null
  calculando: boolean
  /* A ficha mudou depois da última leitura. Aviso, e não gatilho: quem decide
     pedir outra é ela. */
  velha: boolean
  /* O erro gravado pela última tentativa que falhou -- é o que explica por que
     não apareceu nada. */
  erro: string | null
  /* Nulo quando o banco não disse. Aí o botão fica LIGADO e o banco decide:
     travar por não saber deixaria a nutricionista sem resumo para sempre por
     causa de um campo ausente, e a recusa do banco já vem com frase. */
  restamHoje: number | null
  limiteDiario: number
  total: number
}

/* A resposta de `aurora_estado`. */
export function estadoDoResumo(json: unknown): EstadoDoResumo {
  const e = objeto(json)
  const n = (v: unknown, reserva: number) => (typeof v === 'number' && Number.isFinite(v) ? v : reserva)
  return {
    resumo: resumoDaAurora(e?.analise),
    geradoEm: texto(e?.gerado_em) || null,
    calculando: e?.calculando === true,
    velha: e?.velha === true,
    erro: texto(e?.erro) || null,
    restamHoje: typeof e?.restam_hoje === 'number' && Number.isFinite(e.restam_hoje) ? e.restam_hoje : null,
    limiteDiario: n(e?.limite_diario, 2),
    total: n(e?.total_analises, 0),
  }
}

/* A resposta da função ao PEDIR. Três desfechos que não são erro, e a tela
   precisa separar: começou, já tinha uma andando, ou acabou a cota do dia. */
export type PedidoDoResumo =
  | { tipo: 'calculando' }
  | { tipo: 'pronto' }
  | { tipo: 'recusado'; mensagem: string }

export function pedidoDoResumo(json: unknown): PedidoDoResumo {
  const d = objeto(json)
  if (d?.bloqueado === 'em_andamento') {
    /* Já tem uma andando: para a tela é o mesmo que ter começado agora. */
    return { tipo: 'calculando' }
  }
  if (d?.bloqueado) {
    const limite = typeof d.limite === 'number' ? d.limite : 2
    return {
      tipo: 'recusado',
      mensagem: `Esta paciente já teve as ${limite} leituras de hoje. A Aurora volta a ler amanhã.`,
    }
  }
  if (d?.calculando) return { tipo: 'calculando' }
  if (d && typeof d.error === 'string' && d.error.trim()) {
    return { tipo: 'recusado', mensagem: d.error.trim() }
  }
  return { tipo: 'pronto' }
}

// ════════════════════════════ miúdos ════════════════════════════

/* Só as chaves que ESTE mapa escreveu. Um objeto comum herda do protótipo:
   `MAPA['constructor']` devolve a função Object, e não `undefined` -- um valor
   estranho numa coluna sem CHECK viraria código-fonte na tela. Apontado pela
   sessão APP 2 no mesmo padrão dentro do prompt da Aurora. `hasOwnProperty`, e
   não `Object.hasOwn`, para não depender da versão do Hermes. */
function doMapa<T>(mapa: Record<string, T>, chave: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(mapa, chave) ? mapa[chave] : undefined
}

type Obj = Record<string, unknown>

function objeto(v: unknown): Obj | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/* "12/08/2026" a partir de "2026-08-12" ou de um instante ISO. Data pura NÃO
   passa por `Date`: interpretada como UTC, vira o dia anterior no Brasil. */
export function ddmmaaaa(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''))
  return m ? m[3] + '/' + m[2] + '/' + m[1] : ''
}
