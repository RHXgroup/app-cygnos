import { supabase } from './supabase'
import { falha } from './erros'

/* O que faltava na ficha: o ciclo dela e o que foi prescrito.
 *
 * ──────────────────── O pedido ────────────────────
 * "Não está aparecendo o ciclo de menstruação da mulher, no caso se for
 * mulher. E a suplementação, a parte de documentação: se eu indiquei para ela
 * alguma suplementação, precisava aparecer aqui também."
 *
 * As duas coisas já existiam no sistema e não existiam no celular -- e as duas
 * são o tipo de dado que ela procura NA CONSULTA, com a paciente na frente:
 * "quando foi a última?" e "o que eu te passei da última vez?".
 *
 * ──────────────────── Leitura direta, e por quê ────────────────────
 * Como o resto do prontuário (ver `dossieDaPaciente.ts`): as políticas das
 * tabelas já recortam pela carteira dela, então uma RPC só para reembrulhar o
 * mesmo `select` seria uma peça a mais para manter dos dois lados.
 *
 * ──────────────────── Só ler ────────────────────
 * Prescrever é ato clínico com documento, assinatura e versão -- e isso mora no
 * sistema, onde ela tem teclado e timbrado. Aqui é a consulta ao que já foi
 * decidido. */

/* ════════════════════════ O CICLO ════════════════════════ */

export type CicloDaPaciente = {
  /** A menstruação mais recente que o sistema conhece, em ISO. */
  ultimaMenstruacao: string | null
  /** Quantos dias de fluxo ela registrou na última. Nulo quando não disse. */
  duracaoDoFluxo: number | null
  /** Intensidade da última: "leve", "moderado", "intenso"… como veio. */
  intensidade: string | null
  /** Quantos dias desde o primeiro dia da última menstruação. */
  diaDoCiclo: number | null
  /** A média entre os inícios, quando há pelo menos dois. */
  mediaDoCiclo: number | null
  /** Quantos inícios o sistema tem guardados. Zero = nunca registrou. */
  quantosRegistros: number
  /** O que ela anotou nos últimos dias: sintomas e humor, do mais novo. */
  ultimosSintomas: { data: string; sintomas: string[]; humor: string | null }[]
}

export type ResultadoDoCiclo =
  | { tipo: 'ok'; ciclo: CicloDaPaciente | null }
  | { tipo: 'erro'; mensagem: string }

/* Quantos inícios entram na média. Seis cobre meio ano -- o bastante para a
   média significar alguma coisa, e pouco o bastante para um ciclo de dois anos
   atrás não puxar o número de hoje. */
const INICIOS_NA_MEDIA = 6

export async function cicloDaPaciente(pacienteId: number): Promise<ResultadoDoCiclo> {
  const [inicios, registros] = await Promise.all([
    supabase
      .from('ciclos_menstruais')
      .select('data_inicio, duracao_fluxo, intensidade')
      .eq('paciente_id', pacienteId)
      .order('data_inicio', { ascending: false })
      .limit(INICIOS_NA_MEDIA),
    supabase
      .from('ciclo_registros')
      .select('data_registro, sintomas, humor')
      .eq('paciente_id', pacienteId)
      .order('data_registro', { ascending: false })
      .limit(5),
  ])

  if (inicios.error) {
    return { tipo: 'erro', mensagem: falha('Não consegui abrir o ciclo agora.', inicios.error) }
  }

  const linhas = ((inicios.data ?? []) as Record<string, unknown>[])
    .map(l => ({
      inicio: typeof l.data_inicio === 'string' ? l.data_inicio.slice(0, 10) : '',
      fluxo: Number.isFinite(Number(l.duracao_fluxo)) ? Number(l.duracao_fluxo) : null,
      intensidade: typeof l.intensidade === 'string' ? l.intensidade.trim() || null : null,
    }))
    .filter(l => l.inicio)

  /* Nunca registrou nada: a tela diz isso em vez de desenhar zeros. Uma ficha
     que mostra "dia 0 do ciclo" para quem nunca anotou é a ficha inventando. */
  if (linhas.length === 0) {
    return { tipo: 'ok', ciclo: null }
  }

  const ultima = linhas[0]
  const diaDoCiclo = diasEntre(ultima.inicio, hojeISO()) + 1

  /* A média entre inícios consecutivos. Intervalo absurdo fica de fora: seis
     meses sem registrar não é um ciclo de 180 dias, é um buraco no registro --
     e a média é o número que ela usa para dizer "está atrasada". */
  const intervalos: number[] = []
  for (let i = 0; i < linhas.length - 1; i++) {
    const d = diasEntre(linhas[i + 1].inicio, linhas[i].inicio)
    if (d >= 15 && d <= 90) intervalos.push(d)
  }
  const mediaDoCiclo =
    intervalos.length > 0
      ? Math.round(intervalos.reduce((s, x) => s + x, 0) / intervalos.length)
      : null

  const ultimosSintomas = ((registros.data ?? []) as Record<string, unknown>[])
    .map(r => ({
      data: typeof r.data_registro === 'string' ? r.data_registro.slice(0, 10) : '',
      sintomas: Array.isArray(r.sintomas) ? (r.sintomas as unknown[]).map(String).filter(Boolean) : [],
      humor: typeof r.humor === 'string' ? r.humor.trim() || null : null,
    }))
    .filter(r => r.data && (r.sintomas.length > 0 || r.humor))

  return {
    tipo: 'ok',
    ciclo: {
      ultimaMenstruacao: ultima.inicio,
      duracaoDoFluxo: ultima.fluxo,
      intensidade: ultima.intensidade,
      diaDoCiclo: diaDoCiclo >= 0 ? diaDoCiclo : null,
      mediaDoCiclo,
      quantosRegistros: linhas.length,
      ultimosSintomas,
    },
  }
}

/* ════════════════════════ O QUE FOI PRESCRITO ════════════════════════ */

export type MedicamentoDoDocumento = {
  nome: string
  dosagem: string | null
  frequencia: string | null
}

export type DocumentoDaPaciente = {
  id: number
  /** "receituario", "atestado"… como o sistema gravou. */
  tipo: string
  /** O que ela deu de nome, ou o rótulo do modelo. */
  titulo: string | null
  quando: string | null
  /** Os itens do receituário -- é aqui que mora a suplementação. */
  medicamentos: MedicamentoDoDocumento[]
  /** O texto do documento, quando houver. A tela mostra o começo. */
  conteudo: string | null
  /** Veio de fora (importado do Pitanga, do DietSmart) em vez de escrito aqui. */
  importado: boolean
}

export type ResultadoDosDocumentos =
  | { tipo: 'ok'; documentos: DocumentoDaPaciente[] }
  | { tipo: 'erro'; mensagem: string }

const TETO_DE_DOCUMENTOS = 20

export async function documentosDaPaciente(
  pacienteId: number,
): Promise<ResultadoDosDocumentos> {
  /* As três origens juntas, e não só `atestados_receituarios`: uma nutricionista
     que migrou de outro sistema tem a prescrição do paciente em
     `prescricoes_importadas`, e quem importou documento do Pitanga tem em
     `documentos_importados`. Mostrar só uma delas faria a ficha dizer "nenhuma
     prescrição" para quem tem seis. */
  const [escritos, prescricoes, importados] = await Promise.all([
    supabase
      .from('atestados_receituarios')
      .select('id, tipo, titulo, conteudo, medicamentos, created_at')
      .eq('paciente_id', pacienteId)
      .order('created_at', { ascending: false })
      .limit(TETO_DE_DOCUMENTOS),
    supabase
      .from('prescricoes_importadas')
      .select('id, titulo, conteudo, data_prescricao, importado_em')
      .eq('paciente_id', pacienteId)
      .order('importado_em', { ascending: false })
      .limit(TETO_DE_DOCUMENTOS),
    supabase
      .from('documentos_importados')
      .select('id, titulo, categoria, conteudo, data_documento, importado_em')
      .eq('paciente_id', pacienteId)
      .order('importado_em', { ascending: false })
      .limit(TETO_DE_DOCUMENTOS),
  ])

  /* Falha só na primeira derruba; as outras duas são complemento. Uma tabela
     que a conta dela não usa (nunca importou nada) não pode esconder o
     receituário que ela escreveu ontem. */
  if (escritos.error) {
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui abrir os documentos agora.', escritos.error),
    }
  }
  if (prescricoes.error) falha('Não consegui ler as prescrições importadas.', prescricoes.error)
  if (importados.error) falha('Não consegui ler os documentos importados.', importados.error)

  const doSistema: DocumentoDaPaciente[] = ((escritos.data ?? []) as Record<string, unknown>[]).map(
    d => ({
      id: Number(d.id),
      tipo: typeof d.tipo === 'string' ? d.tipo : 'documento',
      titulo: typeof d.titulo === 'string' ? d.titulo.trim() || null : null,
      quando: typeof d.created_at === 'string' ? d.created_at.slice(0, 10) : null,
      medicamentos: lerMedicamentos(d.medicamentos),
      conteudo: typeof d.conteudo === 'string' ? d.conteudo.trim() || null : null,
      importado: false,
    }),
  )

  const deFora: DocumentoDaPaciente[] = [
    ...((prescricoes.data ?? []) as Record<string, unknown>[]).map(d => ({
      id: Number(d.id),
      tipo: 'receituario',
      titulo: (typeof d.titulo === 'string' && d.titulo.trim()) || 'Prescrição importada',
      quando:
        typeof d.data_prescricao === 'string'
          ? d.data_prescricao.slice(0, 10)
          : typeof d.importado_em === 'string'
            ? d.importado_em.slice(0, 10)
            : null,
      medicamentos: [],
      conteudo: typeof d.conteudo === 'string' ? d.conteudo.trim() || null : null,
      importado: true,
    })),
    ...((importados.data ?? []) as Record<string, unknown>[]).map(d => ({
      id: Number(d.id),
      tipo: typeof d.categoria === 'string' ? d.categoria : 'documento',
      titulo: (typeof d.titulo === 'string' && d.titulo.trim()) || 'Documento importado',
      quando:
        typeof d.data_documento === 'string'
          ? d.data_documento.slice(0, 10)
          : typeof d.importado_em === 'string'
            ? d.importado_em.slice(0, 10)
            : null,
      medicamentos: [],
      conteudo: typeof d.conteudo === 'string' ? d.conteudo.trim() || null : null,
      importado: true,
    })),
  ]

  /* Ordenados pelo que a ficha pergunta: o mais recente primeiro, venha de onde
     vier. Sem data vai para o fim -- e não para o começo, que é onde um `null`
     ordenado sem cuidado costuma cair. */
  const todos = [...doSistema, ...deFora].sort((a, b) => (b.quando ?? '').localeCompare(a.quando ?? ''))

  return { tipo: 'ok', documentos: todos.slice(0, TETO_DE_DOCUMENTOS) }
}

/* O `medicamentos` é `jsonb` e vem do que a tela do sistema gravou. Cada item é
   conferido campo a campo: um formato antigo, ou um `null` no meio da lista,
   viraria "undefined - undefined" no meio da ficha. */
function lerMedicamentos(cru: unknown): MedicamentoDoDocumento[] {
  if (!Array.isArray(cru)) return []
  return cru
    .map(x => {
      const m = (x ?? {}) as Record<string, unknown>
      return {
        nome: typeof m.nome === 'string' ? m.nome.trim() : '',
        dosagem: typeof m.dosagem === 'string' ? m.dosagem.trim() || null : null,
        frequencia: typeof m.frequencia === 'string' ? m.frequencia.trim() || null : null,
      }
    })
    .filter(m => m.nome.length > 0)
}

/* ── Datas ──
   Em UTC de propósito: as duas pontas são datas peladas do banco (AAAA-MM-DD),
   e a conta entre elas não tem fuso. O "hoje" é o do APARELHO, montado campo a
   campo -- `toISOString` cortaria em Greenwich e, depois das 21h, o dia do
   ciclo daria um a mais. */
const hojeISO = (): string => {
  const d = new Date()
  const dois = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`
}

const diasEntre = (de: string, ate: string): number => {
  const a = Date.parse(de + 'T00:00:00Z')
  const b = Date.parse(ate + 'T00:00:00Z')
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.round((b - a) / 86400000)
}
