import { supabase } from './supabase'
import { falha, mensagemDoBanco } from './erros'

/* A conversa entre o paciente e a nutricionista dele.
 *
 * Só existe com vínculo. Antes do aceite não há conversa — há pedido, que é
 * outra coisa e mora em lib/solicitacoes.ts.
 *
 * ── A primeira coisa do app que chega sozinha ──────────────────────────────
 * Todo o resto do Cygnos descobre o que mudou relendo: ao abrir a tela, ao
 * voltar do segundo plano, ao puxar. Serve para plano e consulta, que mudam uma
 * vez por semana. Não serve para conversa: uma resposta que só aparece quando a
 * pessoa sai do app e volta não é conversa, é caixa de correio.
 *
 * Por isso a leitura é direta na tabela, com RLS, em vez de por função: é o que
 * o realtime do Supabase exige, porque ele entrega o que a política deixa ler.
 * Escrever continua sendo por função, que é onde o vínculo é conferido e onde se
 * decide de quem é a mensagem — se `de` viesse do cliente, um lado poderia
 * escrever se passando pelo outro. */

/* 'foto' ou 'audio'. O app precisa saber ANTES de baixar — imagem se desenha,
   áudio se toca —, e descobrir pela extensão do caminho quebraria no dia em que
   o formato mudar. */
export type TipoDeAnexo = 'foto' | 'audio'

export type Mensagem = {
  id: number
  /* 'paciente' ou 'nutricionista'. Texto cru: o app não decide isto, o banco
     decide, e um valor novo não pode derrubar a tela. */
  de: string
  texto: string
  criadaEm: string
  lidaEm: string | null
  /* O CAMINHO no bucket privado, e não o endereço.
   *
   * Endereço assinado vence em uma hora, e guardar um aqui faria o anexo
   * quebrar depois do almoço numa tela que fica aberta (item 7). Quem
   * transforma em endereço é `fotoDoDiario`, na hora de desenhar. */
  anexoPath: string | null
  anexoTipo: TipoDeAnexo | null
}

export type ResultadoMensagens =
  | { tipo: 'ok'; mensagens: Mensagem[] }
  | { tipo: 'erro'; mensagem: string }

type Linha = {
  id: number
  de: string
  texto: string
  criada_em: string
  lida_em: string | null
  anexo_path?: string | null
  anexo_tipo?: string | null
}

const daLinha = (l: Linha): Mensagem => ({
  id: l.id,
  de: l.de,
  texto: l.texto,
  criadaEm: l.criada_em,
  lidaEm: l.lida_em,
  anexoPath: l.anexo_path ?? null,
  /* Tipo desconhecido vira nulo, e não é indexado num `Record` (item 10): um
     valor novo na coluna derrubaria a conversa inteira, e conversa é a tela em
     que a pessoa está esperando resposta de gente. Sem tipo, o anexo
     simplesmente não desenha — o texto continua lá. */
  anexoTipo: l.anexo_tipo === 'foto' || l.anexo_tipo === 'audio' ? l.anexo_tipo : null,
})

export const ehMinha = (m: Mensagem) => m.de === 'paciente'

/* Em ordem de calendário, da mais antiga para a mais nova — que é a ordem em
   que uma conversa se lê. A tela rola para o fim ao abrir. */
export async function carregarMensagens(): Promise<ResultadoMensagens> {
  const { data, error } = await supabase
    .from('app_mensagens')
    .select('id, de, texto, criada_em, lida_em, anexo_path, anexo_tipo')
    .order('criada_em', { ascending: true })

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui carregar a conversa agora. Verifique a conexão.', error),
    }

  return { tipo: 'ok', mensagens: ((data ?? []) as Linha[]).map(daLinha) }
}

/* Quantas ela mandou e ele ainda não leu — o número do ponto vermelho.
 *
 * `head: true` traz só a contagem, sem uma linha de texto: o sino pergunta isto
 * a cada abertura do app, e baixar a conversa inteira para contar seria pagar a
 * conversa toda por um número.
 *
 * Engole a falha e responde zero. Sem sinal, "nenhuma nova" é a resposta certa:
 * um ponto vermelho que aparece por causa de rede ruim manda a pessoa abrir uma
 * conversa onde não há nada para ler. */
export async function contarNaoLidas(): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('app_mensagens')
      .select('id', { count: 'exact', head: true })
      .eq('de', 'nutricionista')
      .is('lida_em', null)

    return error ? 0 : (count ?? 0)
  } catch {
    return 0
  }
}

export type ResultadoEnvio = { tipo: 'ok' } | { tipo: 'erro'; mensagem: string }

/* Falha aqui devolve a frase do BANCO. Ele escreve em português para alguém ler
   — "Você ainda não tem uma nutricionista para conversar." —, e traduzir isso
   seria perder o motivo. Mesma exceção de lib/agenda.ts. */
/* O anexo vai JUNTO com o texto, na mesma mensagem.
 *
 * Duas mensagens — uma com a foto e outra com a legenda — chegariam separadas do
 * lado dela, e às vezes fora de ordem. E não há como mandar só o caminho depois:
 * o servidor confere que ele começa na pasta de quem envia, e essa conferência
 * tem de acontecer no mesmo momento em que a linha nasce.
 *
 * Texto vazio deixou de ser erro quando há anexo: uma foto sem legenda é uma
 * mensagem inteira, e exigir texto obrigaria a pessoa a escrever "olha" para
 * poder mandar o prato. */
export async function enviarMensagem(
  texto: string,
  anexo?: { path: string; tipo: TipoDeAnexo } | null,
): Promise<ResultadoEnvio> {
  const { error } = await supabase.rpc('app_enviar_mensagem', {
    p_texto: texto,
    p_anexo_path: anexo?.path ?? null,
    p_anexo_tipo: anexo?.tipo ?? null,
  })
  if (error)
    return {
      tipo: 'erro',
      /* A frase do banco quando ela foi escrita para alguém ler; a nossa quando
         o que voltou foi "Network request failed" ou "permission denied". */
      mensagem: mensagemDoBanco(error, 'Não consegui enviar a sua mensagem agora. Verifique a conexão.'),
    }
  return { tipo: 'ok' }
}

/* Melhor esforço, e em silêncio: falhar em marcar como lida não muda nada para
   quem está lendo, e um aviso vermelho por causa disso seria pior do que o
   contador ficar um minuto atrasado do outro lado. */
export async function marcarLidas(): Promise<void> {
  try {
    await supabase.rpc('app_marcar_mensagens_lidas')
  } catch {
    /* Ver acima. */
  }
}

/* Avisa quando chega mensagem nova, sem a tela precisar perguntar.
 *
 * Devolve a função de desligar — e chamá-la no desmonte não é detalhe: uma
 * inscrição que sobrevive à tela continua recebendo e mirando um componente que
 * já não existe.
 *
 * Só INSERT, e só as dela: o que o paciente escreve já entra na tela pelo envio,
 * e reagir ao próprio insert faria a mensagem aparecer duas vezes. */
export function ouvirMensagens(aoChegar: (m: Mensagem) => void): () => void {
  const canal = supabase
    .channel('app_mensagens_do_paciente')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'app_mensagens' },
      carga => {
        const l = carga.new as Linha
        if (l && l.de === 'nutricionista') aoChegar(daLinha(l))
      },
    )
    .subscribe()

  return () => {
    supabase.removeChannel(canal)
  }
}
