import { supabase } from './supabase'
import { assinados } from './arquivos'
import { falha } from './erros'

/* Os exames que a nutricionista importou para a ficha do paciente.
 *
 * Leitura pura: o app não envia exame, não apaga e não comenta. Quem importa é
 * ela, do sistema — e este é o único conteúdo do acompanhamento em que o
 * paciente às vezes já tem o arquivo no e-mail e mesmo assim não o encontra na
 * hora da consulta.
 *
 * A função do banco é `app_exames_do_paciente`, no mesmo molde das outras: o
 * paciente vem da sessão, o app nunca manda `paciente_id`. Lista vazia significa
 * "não há exames" OU "esta conta não está vinculada" — indistinguíveis, e de
 * propósito, como no resto de lib/conteudoNutri.ts. */

export type Exame = {
  id: number
  nome: string
  /* Já assinado quando o endereço veio como URL pública de bucket privado —
     ver lib/arquivos.ts. Serve para abrir o arquivo fora do app. */
  arquivoUrl: string
  /* 'application/pdf', 'image/jpeg'… Pode faltar. */
  tipoArquivo: string | null
  /* Em bytes. Null quando o sistema não gravou. */
  tamanho: number | null
  /* 'YYYY-MM-DD', a data do exame em si — que não é a data em que ele foi
     importado. Null é possível, e a tela então mostra a de importação. */
  dataExame: string | null
  observacoes: string | null
  /* A nutricionista escreveu uma análise deste exame no sistema.
   *
   * Só o sim/não. O conteúdo é jsonb de formato desconhecido daqui, e desenhar
   * jsonb que não se entende é como o app já se queimou uma vez — a coluna de
   * especialidades virava "[object Object]" dentro de um chip. Dizer que existe
   * é informação; fingir que se sabe o que é seria invenção. */
  temAnalise: boolean
  criadoEm: string
}

/* Onde o sistema guarda exame e documento do paciente. Privado, e por isso todo
   endereço precisa ser assinado com a sessão de quem está olhando. */
export const BUCKET_DOCUMENTOS = 'documentos-paciente'

export type ResultadoExames = { tipo: 'ok'; exames: Exame[] } | { tipo: 'erro'; mensagem: string }

type Linha = {
  id: number
  nome: string
  arquivo_url: string
  tipo_arquivo: string | null
  tamanho: number | null
  data_exame: string | null
  observacoes: string | null
  tem_analise: boolean
  criado_em: string
}

export async function carregarExames(): Promise<ResultadoExames> {
  const { data, error } = await supabase.rpc('app_exames_do_paciente')

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui carregar os seus exames. Verifique a conexão.', error),
    }

  const linhas = (data ?? []) as Linha[]
  if (linhas.length === 0) return { tipo: 'ok', exames: [] }

  /* Uma ida à rede para assinar todos, e não uma por exame.
   *
   * O bucket vai explícito porque o sistema guarda o exame como CAMINHO PURO
   * ("exames/<nutri>/<pac>/x.pdf"), e não como URL — não há de onde deduzir o
   * bucket. Sem isto o assinador devolvia o caminho como veio, e o cartão do
   * exame não abria nada. */
  const enderecos = await assinados(linhas.map(l => l.arquivo_url), BUCKET_DOCUMENTOS)

  return {
    tipo: 'ok',
    exames: linhas.map((l, i) => ({
      id: l.id,
      nome: l.nome,
      arquivoUrl: enderecos[i],
      tipoArquivo: l.tipo_arquivo,
      tamanho: l.tamanho,
      dataExame: l.data_exame,
      observacoes: l.observacoes,
      temAnalise: l.tem_analise,
      criadoEm: l.criado_em,
    })),
  }
}

/* ── Apresentação ──────────────────────────────────────────────────────────*/

/* "1,4 MB". Null vira string vazia: o tamanho é um detalhe de apoio, e um "0 KB"
   no lugar do desconhecido mentiria sobre um arquivo que pode ter 10 MB. */
export function tamanhoLegivel(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

/* O que o ícone do cartão mostra. PDF é o caso esmagador; imagem aparece quando
   alguém fotografa o papel do laboratório em vez de anexar o arquivo. */
export function ehImagem(tipo: string | null): boolean {
  return (tipo ?? '').startsWith('image/')
}
