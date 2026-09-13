import { consultasDoDia, consultasNoPeriodo } from './agendaDaNutri'
import { dinheiroDoDia, reais } from './financeiroDoDia'
import {
  respostaDaAgenda,
  respostaDoProximo,
  respostaDoRecebido,
  type PerguntaBasica,
} from './perguntaBasica'
import { supabase } from './supabase'

/* A pergunta básica respondida com o banco, e não com o modelo.
 *
 * Quem decide QUAL pergunta é e ESCREVE a resposta é `perguntaBasica`, que é
 * puro e tem teste. Aqui só se lê o que ele precisa -- as mesmas leituras que a
 * agenda e o painel do aplicativo já fazem, e por isso a resposta bate com o que
 * ela vê na tela.
 *
 * Devolve `null` sempre que não der para responder com certeza: leitura falhou,
 * sem sinal, sem permissão. Aí a pergunta segue para a Aurora de sempre, que tem
 * o próprio caminho. Uma resposta sem IA errada seria pior do que uma resposta
 * com IA um pouco mais lenta. */
export async function responderSemIA(tipo: PerguntaBasica): Promise<string | null> {
  const agora = Date.now()
  try {
    if (tipo === 'recebido_hoje') {
      return respostaDoRecebido(await dinheiroDoDia(), reais)
    }

    if (tipo === 'proximo_paciente') {
      /* Duas semanas: é o que "próximo" quer dizer num consultório. Mais longe
         que isso, a resposta certa é que não há, e não um nome de outubro. */
      const r = await consultasNoPeriodo(new Date(agora), new Date(agora + 14 * 86_400_000))
      return r.tipo === 'ok' ? respostaDoProximo(r.consultas, agora) : null
    }

    const dia = tipo === 'agenda_hoje' ? new Date(agora) : new Date(agora + 86_400_000)
    const r = await consultasDoDia(dia)
    return r.tipo === 'ok'
      ? respostaDaAgenda(r.consultas, tipo === 'agenda_hoje' ? 'hoje' : 'amanha', agora)
      : null
  } catch {
    return null
  }
}

/* ──────────────────── CONTA O QUE FOI RESPONDIDO DE GRAÇA ────────────────────
 *
 * Vai para a mesma medição da Aurora, com a ferramenta `sem_ia:<pergunta>`. É o
 * que permite ler, junto com o registro de gasto, quantas perguntas deixaram de
 * ir ao modelo -- e decidir com número quais frases acrescentar à lista.
 *
 * Solto: medir nunca atrasa a resposta que ela está esperando. */
export function medirRespostaSemIA(tipo: PerguntaBasica): void {
  void supabase
    .rpc('aurora_medir', {
      p_onde: 'app',
      p_ferramenta: 'sem_ia:' + tipo,
      p_desfecho: 'respondeu',
      p_voltas: 0,
      p_mandou_pro_computador: false,
    })
    .then(() => {}, () => {})
}
