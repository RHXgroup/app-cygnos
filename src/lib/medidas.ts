/* As circunferências: cintura, quadril e braço.
 *
 * ── Por que existem ───────────────────────────────────────────────────────
 * O app registrava peso e mais nada, e os dois concorrentes diretos mostram a
 * evolução das medidas no aplicativo do paciente.
 *
 * Mas o motivo bom não é paridade: é que a CINTURA continua se movendo quando a
 * balança para. Quem perde gordura e ganha músculo vê o peso parado e conclui
 * que estagnou — o mesmo susto que a linha de tendência existe para desarmar,
 * com a diferença de que aqui o número que desarmaria não existia.
 *
 * ── Uma medição, e não três ───────────────────────────────────────────────
 * As três saem da mesma fita no mesmo momento. Cada uma é anulável: quem só
 * quer a cintura registra só a cintura, e um zero no lugar do que não foi
 * medido entraria no gráfico como se fosse verdade (item 6). */

import { dataISO } from './formatar'
import { falha } from './erros'
import { supabase } from './supabase'

export type Medida = {
  id: string
  data: string
  cinturaCm: number | null
  quadrilCm: number | null
  bracoCm: number | null
}

/* Qual das três. Existe como tipo porque a tela desenha as três iguais e o
   gráfico é o mesmo — o que muda é a coluna e o rótulo. */
export type Parte = 'cintura' | 'quadril' | 'braco'

export const NOME_DA_PARTE: Record<Parte, string> = {
  cintura: 'Cintura',
  quadril: 'Quadril',
  braco: 'Braço',
}

export type ResultadoMedidas =
  | { tipo: 'ok'; medidas: Medida[] }
  | { tipo: 'erro'; mensagem: string }

const COLUNAS = 'id, data, cintura_cm, quadril_cm, braco_cm'

type Linha = {
  id: string
  data: string
  cintura_cm: number | string | null
  quadril_cm: number | string | null
  braco_cm: number | string | null
}

/* `numeric` volta como string do PostgREST quando não cabe em float sem perda.
 * E o que chega fora da faixa vira nulo em vez de número: o `check` do banco
 * protege o dado novo, e isto protege a tela de um valor estranho que já esteja
 * gravado — o mesmo par de cuidados que o peso usa. */
const cm = (v: number | string | null): number | null => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n > 0 && n < 300 ? n : null
}

const daLinha = (l: Linha): Medida => ({
  id: l.id,
  data: l.data,
  cinturaCm: cm(l.cintura_cm),
  quadrilCm: cm(l.quadril_cm),
  bracoCm: cm(l.braco_cm),
})

/* Da mais recente para a mais antiga — a ordem em que a tela lista, e a ordem
   que o gráfico inverte para desenhar. */
export async function carregarMedidas(contaId: string): Promise<ResultadoMedidas> {
  const { data, error } = await supabase
    .from('app_medidas')
    .select(COLUNAS)
    .eq('conta_id', contaId)
    .order('data', { ascending: false })
    .limit(180)

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui carregar as suas medidas. Verifique a conexão.', error),
    }
  return { tipo: 'ok', medidas: ((data ?? []) as Linha[]).map(daLinha) }
}

export type MedidaNova = {
  cinturaCm: number | null
  quadrilCm: number | null
  bracoCm: number | null
}

/* Grava a medição do dia, SUBSTITUINDO a que já houver.
 *
 * Quem mede duas vezes no mesmo dia está corrigindo, e corrigir deve
 * substituir: duas linhas do mesmo dia poriam dois pontos na mesma vertical do
 * gráfico e fariam a média contar a mesma medição duas vezes. Quem garante é o
 * índice único no banco; aqui o `upsert` usa ele.
 *
 * E o que ela deixou em branco fica NULO, e não zero — ver `cm` acima e o item
 * 6 do AGENTS.md. */
export async function registrarMedida(
  contaId: string,
  m: MedidaNova,
  quando = new Date(),
): Promise<{ tipo: 'ok'; medida: Medida } | { tipo: 'erro'; mensagem: string }> {
  if (m.cinturaCm === null && m.quadrilCm === null && m.bracoCm === null) {
    return { tipo: 'erro', mensagem: 'Preencha pelo menos uma medida.' }
  }

  const { data, error } = await supabase
    .from('app_medidas')
    .upsert(
      {
        conta_id: contaId,
        data: dataISO(quando),
        cintura_cm: m.cinturaCm,
        quadril_cm: m.quadrilCm,
        braco_cm: m.bracoCm,
      },
      { onConflict: 'conta_id,data' },
    )
    .select(COLUNAS)
    .single()

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui salvar a medida agora. Verifique a conexão.', error),
    }
  return { tipo: 'ok', medida: daLinha(data as Linha) }
}

export async function apagarMedida(id: string): Promise<{ erro: string } | null> {
  const { error } = await supabase.from('app_medidas').delete().eq('id', id)
  if (!error) return null
  return { erro: falha('Não consegui apagar esta medida agora. Verifique a conexão.', error) }
}
