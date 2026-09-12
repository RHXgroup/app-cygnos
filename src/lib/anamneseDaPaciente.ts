import { supabase } from './supabase'
import { falha } from './erros'

/* A anamnese feita pelo celular, ditando.
 *
 * ──────────────────── O pedido ────────────────────
 * "Aí você não vai fazer uma anamnese aqui porque é muito campo pra fazer. E se
 * usar a Aurora pra fazer anamnese? A anamnese já tem lá a transcrição. E se
 * usar a transcrição aqui também, e preencher tudo pra mim? Tem que ter
 * facilidades, não complicações."
 *
 * É o mesmo caminho do sistema, e de propósito: ela fala (ou cola o que
 * transcreveu), a função `preencher-anamnese-ia` devolve campo a campo, ela
 * confere e salva. O modelo é o DELA, com as seções e os campos que ela montou
 * -- nada é inventado aqui.
 *
 * ──────────────────── O que fica igual ao sistema ────────────────────
 * A linha gravada em `anamnese_preenchidas` tem o mesmo formato: as respostas
 * por id de campo E o retrato `_secoes` com rótulo e valor. É esse retrato que
 * faz a anamnese continuar legível no dia em que ela mudar o modelo -- e a
 * ficha do app já lê por ele.
 *
 * A transcrição também é gravada, em `transcricoes_anamnese`, e ligada à
 * anamnese depois: é a origem do registro, e é o que permite conferir de onde
 * saiu cada resposta. */

export type CampoDoModelo = {
  id: number
  label: string
  /* 'texto', 'textarea', 'numero', 'radio', 'booleano', 'checkbox_multi',
     'data'… como o sistema gravou. A tela decide o desenho por ele. */
  tipo: string
  opcoes: string[]
  obrigatorio: boolean
}

export type SecaoDoModelo = {
  id: number
  titulo: string
  campos: CampoDoModelo[]
}

export type ModeloDeAnamnese = {
  id: number
  nome: string
  /* 'adulto', 'pediatrico', 'gestante'… O sistema separa, e mostrar o modelo
     pediátrico para uma adulta seria a ficha errando de pessoa. */
  tipoPaciente: string
  secoes: SecaoDoModelo[]
}

export type ResultadoDosModelos =
  | { tipo: 'ok'; modelos: { id: number; nome: string; tipoPaciente: string }[] }
  | { tipo: 'erro'; mensagem: string }

export async function modelosDeAnamnese(): Promise<ResultadoDosModelos> {
  const { data, error } = await supabase
    .from('anamnese_templates')
    .select('id, nome, tipo_paciente')
    .eq('ativo', true)
    .order('created_at')

  if (error) {
    return { tipo: 'erro', mensagem: falha('Não consegui abrir os seus modelos de anamnese.', error) }
  }

  return {
    tipo: 'ok',
    modelos: ((data ?? []) as Record<string, unknown>[]).map(m => ({
      id: Number(m.id),
      nome: (typeof m.nome === 'string' && m.nome.trim()) || 'Anamnese',
      tipoPaciente: typeof m.tipo_paciente === 'string' ? m.tipo_paciente : 'adulto',
    })),
  }
}

export type ResultadoDoModelo =
  | { tipo: 'ok'; modelo: ModeloDeAnamnese }
  | { tipo: 'erro'; mensagem: string }

export async function modeloCompleto(templateId: number): Promise<ResultadoDoModelo> {
  const [cabecalho, secoes] = await Promise.all([
    supabase.from('anamnese_templates').select('id, nome, tipo_paciente').eq('id', templateId).maybeSingle(),
    supabase.from('anamnese_template_secoes').select('id, titulo, ordem').eq('template_id', templateId).order('ordem'),
  ])

  if (cabecalho.error || !cabecalho.data) {
    return { tipo: 'erro', mensagem: falha('Não consegui abrir esse modelo.', cabecalho.error) }
  }
  if (secoes.error) {
    return { tipo: 'erro', mensagem: falha('Não consegui abrir as seções desse modelo.', secoes.error) }
  }

  const ids = ((secoes.data ?? []) as { id: number }[]).map(s => s.id)

  /* Uma busca só para os campos de TODAS as seções. Um modelo de quinze seções
     viraria quinze idas ao banco -- o comentário do sistema conta que foi assim
     que começou lá. */
  const campos = ids.length
    ? await supabase
        .from('anamnese_template_campos')
        .select('id, label, tipo, opcoes, obrigatorio, ordem, secao_id')
        .in('secao_id', ids)
        .order('ordem')
    : { data: [] as Record<string, unknown>[], error: null }

  if (campos.error) {
    return { tipo: 'erro', mensagem: falha('Não consegui abrir os campos desse modelo.', campos.error) }
  }

  const linhas = (campos.data ?? []) as Record<string, unknown>[]
  const c = cabecalho.data as Record<string, unknown>

  return {
    tipo: 'ok',
    modelo: {
      id: Number(c.id),
      nome: (typeof c.nome === 'string' && c.nome.trim()) || 'Anamnese',
      tipoPaciente: typeof c.tipo_paciente === 'string' ? c.tipo_paciente : 'adulto',
      secoes: ((secoes.data ?? []) as Record<string, unknown>[]).map(s => ({
        id: Number(s.id),
        titulo: (typeof s.titulo === 'string' && s.titulo.trim()) || 'Seção',
        campos: linhas
          .filter(x => Number(x.secao_id) === Number(s.id))
          .map(x => ({
            id: Number(x.id),
            label: (typeof x.label === 'string' && x.label.trim()) || 'Campo',
            tipo: typeof x.tipo === 'string' ? x.tipo : 'texto',
            opcoes: Array.isArray(x.opcoes) ? (x.opcoes as unknown[]).map(String) : [],
            obrigatorio: x.obrigatorio === true,
          })),
      })),
    },
  }
}

export type PreenchimentoDaAurora = {
  respostas: Record<string, unknown>
  resumo: string | null
  naoAbordados: string[]
  tipoConsulta: string | null
}

export type ResultadoDoPreenchimento =
  | { tipo: 'ok'; preenchimento: PreenchimentoDaAurora }
  | { tipo: 'erro'; mensagem: string }

/**
 * Manda a fala para a mesma função do sistema e recebe campo a campo.
 *
 * O que ela devolve é SUGESTÃO: nada é gravado antes de a nutricionista ver a
 * tela de conferência. É a mesma regra do cartão da Aurora na agenda, e pelo
 * mesmo motivo -- reconhecimento de fala erra, e a defesa é limitar o que
 * acontece quando ele erra.
 */
export async function preencherComAAurora(
  transcricao: string,
  secoes: SecaoDoModelo[],
): Promise<ResultadoDoPreenchimento> {
  const texto = transcricao.trim()
  if (texto.length < 40) {
    return {
      tipo: 'erro',
      mensagem: 'Fale um pouco mais sobre a consulta — com pouca coisa a Aurora chuta, e chute numa anamnese é pior que campo vazio.',
    }
  }

  const { data, error } = await supabase.functions.invoke('preencher-anamnese-ia', {
    body: {
      transcricao: texto,
      secoes: secoes.map(s => ({
        titulo: s.titulo,
        campos: s.campos.map(c => ({ id: c.id, label: c.label, tipo: c.tipo, opcoes: c.opcoes })),
      })),
    },
  })

  if (error) {
    return { tipo: 'erro', mensagem: falha('A Aurora não conseguiu preencher agora.', error) }
  }

  const r = (data ?? {}) as Record<string, unknown>
  /* A recusa do teste grátis vem PRONTA do servidor, com o que fazer no lugar.
     Trocá-la pela nossa frase genérica manda ela tentar de novo uma coisa que
     nunca vai funcionar -- foi o defeito que o site teve e corrigiu. */
  if (typeof r.error === 'string') return { tipo: 'erro', mensagem: r.error }

  return {
    tipo: 'ok',
    preenchimento: {
      respostas: (r.respostas ?? {}) as Record<string, unknown>,
      resumo: typeof r.resumo === 'string' ? r.resumo.trim() || null : null,
      naoAbordados: Array.isArray(r.campos_nao_abordados)
        ? (r.campos_nao_abordados as unknown[]).map(String)
        : [],
      tipoConsulta: typeof r.tipo_consulta === 'string' ? r.tipo_consulta : null,
    },
  }
}

export type ResultadoDoSalvamento =
  | { tipo: 'ok'; anamneseId: number }
  | { tipo: 'erro'; mensagem: string }

export async function salvarAnamnese(pedido: {
  pacienteId: number
  modelo: ModeloDeAnamnese
  respostas: Record<string, unknown>
  /** A fala que originou tudo. Vai para `transcricoes_anamnese`. */
  transcricao: string
  /** ISO (AAAA-MM-DD). */
  dataAnamnese: string
  tipoConsulta: string | null
  titulo?: string | null
}): Promise<ResultadoDoSalvamento> {
  const { data: dono, error: erroDono } = await supabase
    .from('pacientes')
    .select('nutricionista_id')
    .eq('id', pedido.pacienteId)
    .maybeSingle()

  const carteira = (dono as { nutricionista_id?: string } | null)?.nutricionista_id
  if (erroDono || !carteira) {
    return { tipo: 'erro', mensagem: falha('Não consegui confirmar de quem é esse paciente.', erroDono) }
  }

  /* A transcrição primeiro, e o id guardado: se a anamnese falhar depois, a
     fala dela não se perde -- e é a fala que não dá para refazer. */
  const { data: transcricao } = await supabase
    .from('transcricoes_anamnese')
    .insert({
      nutricionista_id: carteira,
      paciente_id: pedido.pacienteId,
      transcricao_bruta: pedido.transcricao.trim(),
      consentimento_confirmado: true,
      iniciada_em: new Date().toISOString(),
      encerrada_em: new Date().toISOString(),
    })
    .select('id')
    .single()

  /* O retrato das seções, no mesmo formato do sistema: rótulo e valor juntos.
     Sem ele, mudar o modelo amanhã deixaria a anamnese de hoje como uma lista
     de números sem pergunta. */
  const secoesSnapshot = pedido.modelo.secoes.map(s => ({
    titulo: s.titulo,
    campos: s.campos.map(c => ({
      label: c.label,
      tipo: c.tipo,
      valor: pedido.respostas[String(c.id)] ?? null,
    })),
  }))

  const { data: nova, error } = await supabase
    .from('anamnese_preenchidas')
    .insert({
      paciente_id: pedido.pacienteId,
      nutricionista_id: carteira,
      template_id: pedido.modelo.id,
      template_nome: pedido.modelo.nome,
      data_anamnese: pedido.dataAnamnese,
      tipo_consulta: pedido.tipoConsulta,
      titulo: pedido.titulo?.trim() || null,
      respostas: {
        _secoes: secoesSnapshot,
        _template_id: pedido.modelo.id,
        ...pedido.respostas,
      },
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error || !nova) {
    return { tipo: 'erro', mensagem: falha('Não consegui salvar a anamnese.', error) }
  }

  const anamneseId = Number((nova as { id: number }).id)

  /* Liga a fala à anamnese que ela virou. Falhar aqui não desfaz nada: as duas
     linhas existem, e o que se perde é o rastro entre elas. */
  const transcricaoId = (transcricao as { id?: number } | null)?.id
  if (transcricaoId) {
    const { error: erroLigacao } = await supabase
      .from('transcricoes_anamnese')
      .update({ anamnese_preenchida_id: anamneseId })
      .eq('id', transcricaoId)
    if (erroLigacao) falha('Não consegui ligar a gravação à anamnese.', erroLigacao)
  }

  return { tipo: 'ok', anamneseId }
}
