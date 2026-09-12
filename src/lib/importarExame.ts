import { File } from 'expo-file-system'
import { decode } from 'base64-arraybuffer'
import { supabase } from './supabase'
import { falha } from './erros'

/* Importar exame pelo celular.
 *
 * ──────────────────── O pedido ────────────────────
 * "A paciente mandou o exame no meu WhatsApp. Posso ir no meu aplicativo aqui e
 * importar aqui mesmo, e aparece depois lá no site?" Dava para LER os exames no
 * celular desde 11/09, e não para pôr nenhum -- então o caminho continuava
 * sendo mandar o arquivo para si mesma e abrir o computador.
 *
 * ──────────────────── Faz o MESMO que o site ────────────────────
 * Mesmo balde (`documentos-paciente`), mesma pasta
 * (`exames/<carteira>/<paciente>/<instante>.<ext>`), mesmas colunas, e a mesma
 * análise automática pela função `analisar-exame` -- que nasce RASCUNHO e não
 * vai para o paciente até ela publicar. Qualquer diferença aqui seria um exame
 * que aparece no app e não no sistema, ou uma pasta que a política do balde não
 * deixa abrir depois: foi o que já aconteceu no site quando a pasta era do
 * usuário em vez da carteira.
 *
 * A PASTA é da CARTEIRA, e não de quem subiu: a política do balde casa a pasta
 * com o dono, e a funcionária que subisse pelo login dela criaria um arquivo
 * que a nutricionista vê na lista e não consegue abrir.
 *
 * ──────────────────── Bytes, e não `fetch` ────────────────────
 * Armadilha 17: o `fetch` do SDK 57 não lê `file://` e não avisa -- devolve
 * vazio, e o exame subiria com zero byte. O arquivo é lido com `expo-file-system`
 * e vai como bytes. */

const BUCKET = 'documentos-paciente'

/* O teto do que vale a pena mandar pela rede do consultório, e o que a função
   de análise aguenta num corpo JSON. Acima disso a frase diz o tamanho, em vez
   de a subida morrer no meio sem explicação. */
const MAXIMO_MB = 20

export type ArquivoDoExame = {
  /** `file://...` -- da câmera, da galeria ou do seletor de arquivos. */
  uri: string
  /** "image/jpeg", "application/pdf". */
  mimeType: string
  /** O nome com extensão, quando a origem souber. Só para descobrir a extensão. */
  nomeDoArquivo?: string | null
}

export type ResultadoDoExame =
  | { tipo: 'ok'; exameId: number; analisou: boolean }
  | { tipo: 'erro'; mensagem: string }

const extensaoDe = (a: ArquivoDoExame): string => {
  const doNome = (a.nomeDoArquivo ?? '').split('.').pop()
  if (doNome && /^[A-Za-z0-9]{1,5}$/.test(doNome)) return doNome.toLowerCase()
  if (a.mimeType === 'application/pdf') return 'pdf'
  if (a.mimeType === 'image/png') return 'png'
  return 'jpg'
}

/* A função de análise lê PDF e imagem. Documento do Word entra na ficha do
   mesmo jeito -- ela abre e lê --, mas não passa pela IA, e a tela diz isso em
   vez de prometer uma leitura que não vem. */
export const daParaAnalisar = (mimeType: string): boolean =>
  mimeType === 'application/pdf' || mimeType.startsWith('image/')

export async function importarExame(pedido: {
  pacienteId: number
  arquivo: ArquivoDoExame
  /** "Hemograma", "Vitamina D". O que ela chama na lista. */
  nome: string
  /** A data da COLETA, em ISO (AAAA-MM-DD). Obrigatória, como no site. */
  dataExame: string
  observacoes?: string | null
}): Promise<ResultadoDoExame> {
  const nome = pedido.nome.trim() || 'Exame'

  /* ── 1. O arquivo, em bytes ── */
  let bytes: ArrayBuffer
  let base64 = ''
  let tamanho = 0
  try {
    const arquivo = new File(pedido.arquivo.uri)
    if (!arquivo.exists) {
      return { tipo: 'erro', mensagem: 'Não achei esse arquivo no celular. Escolha de novo.' }
    }
    tamanho = arquivo.size ?? 0
    if (tamanho > MAXIMO_MB * 1024 * 1024) {
      return {
        tipo: 'erro',
        mensagem: `Esse arquivo tem mais de ${MAXIMO_MB} MB. Mande pelo computador, ou tire uma foto do laudo.`,
      }
    }
    bytes = await arquivo.arrayBuffer()
    if (daParaAnalisar(pedido.arquivo.mimeType)) base64 = await arquivo.base64()
  } catch (e) {
    return { tipo: 'erro', mensagem: falha('Não consegui ler esse arquivo.', e) }
  }

  /* ── 2. A carteira, que decide a pasta ──
     Lida do próprio paciente: a política de `pacientes` já recorta pela
     carteira dela, então esta leitura é ao mesmo tempo a conferência de que o
     paciente é dela. */
  const { data: dono, error: erroDono } = await supabase
    .from('pacientes')
    .select('nutricionista_id, gestante_ativa, paciente_pediatrico')
    .eq('id', pedido.pacienteId)
    .maybeSingle()

  const carteira = (dono as { nutricionista_id?: string } | null)?.nutricionista_id
  if (erroDono || !carteira) {
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui confirmar de quem é esse paciente.', erroDono),
    }
  }

  /* ── 3. Sobe ── */
  const caminho = `exames/${carteira}/${pedido.pacienteId}/${Date.now()}.${extensaoDe(pedido.arquivo)}`
  const { error: erroSubida } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, bytes, { contentType: pedido.arquivo.mimeType, upsert: true })

  if (erroSubida) {
    return { tipo: 'erro', mensagem: falha('Não consegui enviar o arquivo do exame.', erroSubida) }
  }

  /* ── 4. A linha do exame ──
     Guarda o CAMINHO, e não um endereço público: o balde é privado, e quem lê
     gera um endereço assinado na hora (armadilha 7). */
  const { data: usuario } = await supabase.auth.getUser()
  const { data: inserido, error: erroLinha } = await supabase
    .from('exames_laboratoriais')
    .insert({
      nutricionista_id: carteira,
      paciente_id: pedido.pacienteId,
      nome,
      arquivo_url: caminho,
      tipo_arquivo: pedido.arquivo.mimeType || null,
      tamanho,
      data_exame: pedido.dataExame,
      observacoes: pedido.observacoes?.trim() || null,
      importado_por: usuario?.user?.id ?? null,
      importado_por_nome: 'Aplicativo',
    })
    .select('id')
    .single()

  if (erroLinha || !inserido) {
    return { tipo: 'erro', mensagem: falha('Não consegui salvar o exame.', erroLinha) }
  }

  const exameId = Number((inserido as { id: number }).id)

  /* ── 5. A leitura por IA, que não pode travar o import ──
     Falhar aqui deixa o exame na ficha do mesmo jeito -- ela abre o arquivo e
     lê, ou pede a análise no computador. O que não pode é a falha da IA
     desfazer o que já subiu. */
  let analisou = false
  if (base64) {
    try {
      const { data, error } = await supabase.functions.invoke('analisar-exame', {
        body: {
          fileBase64: base64,
          mimeType: pedido.arquivo.mimeType,
          contextoClinico: {
            gestante: (dono as { gestante_ativa?: boolean } | null)?.gestante_ativa ?? false,
            pediatrico: (dono as { paciente_pediatrico?: boolean } | null)?.paciente_pediatrico ?? false,
          },
          paciente_id: pedido.pacienteId,
          data_coleta: pedido.dataExame,
        },
      })

      const analise = data as { error?: unknown } | null
      if (!error && analise && !analise.error) {
        /* RASCUNHO: quem escreveu foi a IA, no instante do import, e ela ainda
           não olhou. Publicar para o paciente é ato dela, no sistema. */
        const { error: erroAnalise } = await supabase.from('analises_de_exame').upsert(
          {
            exame_id: exameId,
            nutricionista_id: carteira,
            texto: analise,
            atualizada_em: new Date().toISOString(),
          },
          { onConflict: 'exame_id,nutricionista_id' },
        )
        if (erroAnalise) falha('Não consegui guardar a leitura do exame.', erroAnalise)
        else analisou = true
      } else {
        falha('A leitura automática do exame não veio.', error ?? analise?.error)
      }
    } catch (e) {
      falha('A leitura automática do exame falhou.', e)
    }
  }

  return { tipo: 'ok', exameId, analisou }
}

/* O `decode` do base64 fica aqui só para o dia em que alguma origem só entregar
   base64 (a câmera do app, por exemplo, devolve os dois). Sem uso hoje, e
   escrito para não virar `fetch` de novo. */
export const bytesDoBase64 = (b64: string): ArrayBuffer => decode(b64)
