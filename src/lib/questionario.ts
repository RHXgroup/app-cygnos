import { falha } from './erros'
import { supabase } from './supabase'
import { modeloDoBanco, type Modelo, type Respostas } from './questionarioDaNutri'

/* O questionário pré-consulta, do lado da rede.
 *
 * ── Três funções, e duas delas já existiam ────────────────────────────────
 * `get_questionario_pre_consulta_publico` e `responder_questionario_pre_consulta`
 * são as MESMAS que a página pública do link usa, e já aceitavam `authenticated`.
 * Nada foi tocado nelas.
 *
 * A única nova é `app_questionario_pendente`, e ela faz uma coisa só: dizer qual
 * é o token do questionário desta conta. Era o que faltava — o link chega por
 * WhatsApp e se perde na conversa, e o app não tinha como descobrir o que era
 * dele.
 *
 * ── Por que o token e não os dados direto ─────────────────────────────────
 * Porque assim o app percorre exatamente o mesmo caminho da página do link:
 * mesmo modelo, mesma gravação, mesma validação do lado de lá. Uma função nova
 * que devolvesse tudo pronto seria a segunda leitura do mesmo questionário, e
 * as duas divergiriam no dia em que um tipo de campo novo aparecesse. */

export type Questionario = {
  token: string
  /* Para a tela poder falar com ela pelo nome, e dizer de quem é o pedido. */
  paciente: { nome: string | null; feminino: boolean; pediatrico: boolean }
  nutri: { nome: string | null } | null
  /* Os objetivos que a NUTRICIONISTA cadastrou. As opções do campo `objetivo`
     não moram no modelo: vêm da carteira dela. */
  objetivos: { id: number; nome: string }[]
  modelo: Modelo
  /* O que já foi respondido, se ela começou e parou. */
  respostas: Respostas
}

export type ResultadoQuestionario =
  | { tipo: 'ok'; questionario: Questionario }
  /* Não há nada a responder. É o caso comum, e não é erro. */
  | { tipo: 'nenhum' }
  /* Existe, mas veio de antes dos modelos e o app não sabe desenhá-lo. */
  | { tipo: 'formato_antigo' }
  | { tipo: 'erro'; mensagem: string }

const texto = (v: unknown): string | null => {
  const t = typeof v === 'string' ? v.trim() : ''
  return t === '' ? null : t
}

export async function carregarQuestionario(): Promise<ResultadoQuestionario> {
  const pendente = await supabase.rpc('app_questionario_pendente')
  if (pendente.error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui verificar se há questionário para você.', pendente.error),
    }

  const token = texto((pendente.data as { token?: unknown } | null)?.token)
  if (!token) return { tipo: 'nenhum' }

  const r = await supabase.rpc('get_questionario_pre_consulta_publico', { p_token: token })
  if (r.error || !r.data)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui abrir o seu questionário agora. Verifique a conexão.', r.error),
    }

  const d = r.data as {
    paciente?: { nome?: unknown; genero?: unknown; pediatrico?: unknown }
    nutri?: { nome?: unknown } | null
    objetivos?: unknown
    modelo?: unknown
    respostas?: unknown
  }

  /* Modelo nulo é o questionário enviado ANTES de os modelos existirem. A página
     do link cai no modelo do sistema; o app não pode fazer o mesmo sem carregar
     uma cópia daquele modelo aqui — e duas cópias do mesmo formulário divergem,
     que é o defeito que este arquivo inteiro existe para não ter.
     São poucos e só históricos: o envio de hoje sempre aponta para um modelo.
     Então a tela manda pelo link, que continua funcionando. */
  const modelo = modeloDoBanco(d.modelo)
  if (modelo.secoes.length === 0) return { tipo: 'formato_antigo' }

  const pediatrico = d.paciente?.pediatrico === true

  return {
    tipo: 'ok',
    questionario: {
      token,
      paciente: {
        nome: texto(d.paciente?.nome),
        /* Só isto decide se a pergunta de gestação aparece. Criança nunca, mesmo
           sendo menina — a pergunta não é sobre o corpo, é sobre a situação. */
        feminino: d.paciente?.genero === 'feminino' && !pediatrico,
        pediatrico,
      },
      nutri: d.nutri ? { nome: texto(d.nutri.nome) } : null,
      objetivos: (Array.isArray(d.objetivos) ? d.objetivos : [])
        .map(o => o as { id?: unknown; nome?: unknown })
        .filter(o => typeof o?.id === 'number' && texto(o?.nome) !== null)
        .map(o => ({ id: o.id as number, nome: texto(o.nome) as string })),
      modelo,
      respostas:
        d.respostas && typeof d.respostas === 'object' ? (d.respostas as Respostas) : {},
    },
  }
}

export async function responderQuestionario(
  token: string,
  respostas: Respostas,
): Promise<{ erro: string } | null> {
  const { data, error } = await supabase.rpc('responder_questionario_pre_consulta', {
    p_token: token,
    p_respostas: respostas,
  })

  if (error)
    return { erro: falha('Não consegui enviar as suas respostas. Verifique a conexão.', error) }

  /* A função devolve `false` quando recusa — token vencido, já respondido, ou
     desativado do lado dela. Sem esta checagem a tela diria "enviado" e nada
     teria sido gravado, que é o pior desfecho possível depois de a pessoa
     responder trinta perguntas. */
  if (data !== true)
    return {
      erro:
        'Esse questionário não está mais aceitando respostas. Peça um novo para a sua nutricionista.',
    }
  return null
}
