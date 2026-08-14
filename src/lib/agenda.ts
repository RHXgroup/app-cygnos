import { supabase } from './supabase'
import { dataCurta, dataPorExtenso, horaCurta } from './formatar'

/* Pedir consulta à nutricionista.
 *
 * Ver a migração 20260803000007 no repo do sistema. O paciente não marca: ele
 * PEDE. A consulta nasce com status 'solicitada' — que é diferente de
 * 'pendente', o status do que a nutricionista mesma marcou — e fica assim até
 * ela aceitar ou recusar. O app não tem como criar consulta confirmada, e é
 * essa a regra inteira do recurso.
 *
 * ── Sobre os horários que chegam aqui ──────────────────────────────────────
 * `dia` e `hora` vêm prontos do banco, no fuso da NUTRICIONISTA, porque é o
 * fuso em que a consulta acontece. O app mostra os dois como vieram e não faz
 * conta nenhuma em cima deles: converter para o fuso do aparelho faria o
 * paciente em viagem ler um horário que não é o da sala de espera.
 *
 * `inicio` é o instante absoluto, e serve só para devolver ao banco na hora de
 * pedir. Ele não é para exibição. */

export type Vaga = {
  /* ISO com fuso. Identifica a vaga para o servidor — não formate isto. */
  inicio: string
  /* 'YYYY-MM-DD', dia local da nutricionista. */
  dia: string
  /* 'HH:MM', hora local da nutricionista. */
  hora: string
}

export type DiaComVagas = {
  dia: string
  vagas: Vaga[]
}

/* Os três estados em que uma consulta futura é notícia para quem vai a ela.
 * 'pendente' é a que a NUTRICIONISTA marcou — do lado dela é o status padrão de
 * quem ainda não confirmou, e do lado de cá é uma consulta que ela agendou. */
export type StatusConsulta = 'solicitada' | 'pendente' | 'confirmada'

export type MinhaConsulta = {
  id: number
  /* ISO com fuso, o horário da consulta. */
  dataHora: string
  status: StatusConsulta
  pedidaEm: string
}

export async function carregarVagas(dias = 30): Promise<DiaComVagas[]> {
  const { data, error } = await supabase.rpc('app_horarios_livres', { p_dias: dias })
  if (error) throw new Error(error.message)

  /* A RPC já vem ordenada por instante, então empurrar na ordem de chegada
     preserva a ordem dos dias e a das horas dentro de cada dia. */
  const agrupados: DiaComVagas[] = []

  for (const v of (data ?? []) as Vaga[]) {
    let dia = agrupados.find(d => d.dia === v.dia)
    if (!dia) {
      dia = { dia: v.dia, vagas: [] }
      agrupados.push(dia)
    }
    dia.vagas.push(v)
  }

  return agrupados
}

/* Todas as futuras, da mais próxima para a mais distante. Ver a migração
   20260803000009: era uma só, e quem tinha duas no mesmo dia via metade da
   própria agenda. */
export async function carregarMinhasConsultas(): Promise<MinhaConsulta[]> {
  const { data, error } = await supabase.rpc('app_minhas_consultas')
  if (error) throw new Error(error.message)

  return ((data ?? []) as any[]).map(l => ({
    id: l.id,
    dataHora: l.data_hora,
    status: l.status as StatusConsulta,
    pedidaEm: l.pedida_em,
  }))
}

/* A que a tela põe em destaque.
 *
 * O pedido em aberto ganha de quem vem antes no relógio: ele é o único item da
 * lista que espera uma ação, e é o único que a pessoa pode desfazer. Sem pedido,
 * o destaque é a próxima do calendário, que é a resposta para "quando eu vejo
 * minha nutricionista de novo". */
export const consultaEmDestaque = (consultas: MinhaConsulta[]): MinhaConsulta | null =>
  consultas.find(c => c.status === 'solicitada') ?? consultas[0] ?? null

/* O banco recusa horário que saiu da lista e segundo pedido em aberto, e as
   duas recusas chegam aqui como mensagem pronta para ler ("Esse horário não
   está mais disponível."). Repassar essa mensagem é melhor do que traduzi-la:
   quem sabe por que recusou é quem recusou. */
export async function solicitarConsulta(inicio: string): Promise<void> {
  const { error } = await supabase.rpc('app_solicitar_consulta', { p_inicio: inicio })
  if (error) throw new Error(error.message)
}

export async function cancelarSolicitacao(id: number): Promise<void> {
  const { error } = await supabase.rpc('app_cancelar_solicitacao', { p_id: id })
  if (error) throw new Error(error.message)
}

/* ── Apresentação ──────────────────────────────────────────────────────────*/

/* 'YYYY-MM-DD' → Date no fuso local do aparelho.
 *
 * Montado campo a campo porque `new Date('2026-08-04')` é lido como UTC e, num
 * fuso negativo, devolve o dia ANTERIOR — a vaga de terça viraria segunda na
 * fita. É o mesmo cuidado do resto do app; aqui ele importa mais, porque o
 * texto do dia é o que a pessoa usa para escolher. */
function doDiaISO(dia: string): Date {
  const [ano, mes, d] = dia.split('-').map(Number)
  return new Date(ano, mes - 1, d)
}

/* "Quinta-feira, 6 de Agosto" — o cabeçalho de cada dia na lista. */
export const diaPorExtenso = (dia: string) => dataPorExtenso(doDiaISO(dia))

/* "Qui, 6 de Ago. · 14:00" — a linha compacta das consultas que não estão em
   destaque. Curta porque são várias, uma embaixo da outra. */
export function consultaCompacta(dataHora: string): string {
  const d = new Date(dataHora)
  if (isNaN(d.getTime())) return 'Horário a confirmar'
  return `${dataCurta(d)} · ${horaCurta(d)}`
}

/* "Quinta-feira, 6 de Agosto, às 14:00".
 *
 * Aqui o `new Date` é o certo, ao contrário do de cima: `dataHora` é instante
 * com fuso escrito, e é isso que o construtor lê bem. */
export function consultaLegivel(dataHora: string): string {
  const d = new Date(dataHora)
  if (isNaN(d.getTime())) return 'Horário a confirmar'
  return `${dataPorExtenso(d)}, às ${horaCurta(d)}`
}

/* O que cada estado quer dizer para quem vai à consulta.
 *
 * O texto de 'confirmada' é afirmativo e sem ressalva — é o único momento em
 * que o app pode dizer que a consulta está marcada, e depois de uma tela
 * inteira falando em "pedido" a pessoa precisa ver a diferença sem procurar. */
export const ESTADO_DA_CONSULTA: Record<
  StatusConsulta,
  {
    titulo: string
    /* Uma palavra, para a etiqueta das linhas compactas. */
    curto: string
    icone: 'hourglass-outline' | 'checkmark-circle'
    explicacao: string
  }
> = {
  solicitada: {
    titulo: 'Aguardando resposta',
    curto: 'Pedido',
    icone: 'hourglass-outline',
    explicacao:
      'A sua nutricionista precisa aceitar o pedido. Enquanto isso não acontece, a consulta ainda não está marcada — vale esperar a confirmação antes de se programar para o dia.',
  },
  pendente: {
    titulo: 'Consulta marcada',
    curto: 'Marcada',
    icone: 'checkmark-circle',
    explicacao:
      'A sua nutricionista agendou esta consulta. Se não puder ir, avise ela com antecedência.',
  },
  confirmada: {
    titulo: 'Consulta confirmada',
    curto: 'Confirmada',
    icone: 'checkmark-circle',
    explicacao:
      'Está tudo certo para este horário. Se não puder ir, avise a sua nutricionista com antecedência.',
  },
}
