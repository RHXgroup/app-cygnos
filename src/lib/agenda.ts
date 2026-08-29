import { falha } from './erros'
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
  /* Texto cru do banco, e não `StatusConsulta`: os três acima são os estados de
     hoje, e o app não tem como impedir que amanhã chegue um quarto. Quem
     traduz é `estadoDaConsulta`, que sabe cair no genérico. */
  status: string
  pedidaEm: string
}

export async function carregarVagas(dias = 30): Promise<DiaComVagas[]> {
  const { data, error } = await supabase.rpc('app_horarios_livres', { p_dias: dias })
  if (error) throw new Error(falha('Não consegui carregar os horários. Verifique a conexão.', error))

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
  if (error) throw new Error(falha('Não consegui carregar as suas consultas. Verifique a conexão.', error))

  return ((data ?? []) as any[]).map(l => ({
    id: l.id,
    dataHora: l.data_hora,
    status: l.status,
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

/* Aqui NÃO se repassa o texto do banco, ao contrário do pedido logo acima.
 *
 * A diferença é quem escreveu a frase. `app_solicitar_consulta` levanta
 * mensagem para gente ler — é ela que explica por que o toque não virou
 * consulta. `app_cancelar_solicitacao` não levanta nada: é um update simples,
 * então tudo que chega até aqui é falha de rede ou de permissão, e o que a
 * pessoa leria seria "Network request failed" na hora de desistir de um pedido. */
export async function cancelarSolicitacao(id: number): Promise<void> {
  const { error } = await supabase.rpc('app_cancelar_solicitacao', { p_id: id })
  if (error) throw new Error(falha('Não consegui cancelar o pedido agora. Verifique a conexão.', error))
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

/* O relógio da consulta, no fuso em que ela acontece.
 *
 * ── O problema ─────────────────────────────────────────────────────────────
 * As VAGAS chegam com `dia` e `hora` prontos, no fuso da nutricionista, e o app
 * as mostra como vieram — está certo, e o comentário lá em cima explica por quê:
 * o paciente em viagem precisa ler o horário da sala de espera, não o do lugar
 * onde ele está.
 *
 * As consultas MARCADAS chegavam só como instante, e `new Date(...)` mais
 * `getHours()` devolvem o relógio DO APARELHO. Duas réguas na mesma tela: o
 * paciente em Lisboa escolhia "14:00" e, depois de marcado, lia "18:00".
 *
 * ── O que dá para fazer daqui ──────────────────────────────────────────────
 * O instante vem com o deslocamento escrito ("...T14:00:00-03:00"), e esse
 * deslocamento É o fuso dela. Lendo os campos literais da string, sem construir
 * Date nenhum, sai o relógio da sala de espera — que é o que a pessoa quer.
 *
 * Quando o banco manda em UTC (`+00:00` ou `Z`), o deslocamento não diz nada
 * sobre o fuso dela e não há o que deduzir: aí cai no comportamento antigo, o
 * relógio do aparelho. Não é regressão — é exatamente o que a tela já fazia.
 *
 * ── O conserto de verdade ──────────────────────────────────────────────────
 * É `app_minhas_consultas` devolver `dia` e `hora` prontos, como
 * `app_horarios_livres` já faz. Aí isto aqui vira duas linhas. Ver
 * docs/o-que-o-app-precisa-do-sistema.md, item 1.2. */

/* "2026-08-06T14:00:00-03:00" → os campos como estão escritos. Null quando não
   há deslocamento, ou quando ele é zero — nos dois casos a string não conta
   nada sobre o fuso da nutricionista. */
function relogioDaNutri(dataHora: string): { data: Date; hora: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?(?:\.\d+)?([+-]\d{2}):?(\d{2})$/.exec(
    dataHora,
  )
  if (!m) return null

  const [, ano, mes, dia, hora, minuto, desloque, deslocMin] = m
  if (Number(desloque) === 0 && Number(deslocMin) === 0) return null

  /* Date montado campo a campo e lido como local, só para o dia da semana e o
     nome do mês saírem certos. Ele NÃO representa o instante da consulta — a
     hora vem da string, não daqui. */
  return {
    data: new Date(Number(ano), Number(mes) - 1, Number(dia)),
    hora: `${hora}:${minuto}`,
  }
}

/* "Qui, 6 de Ago. · 14:00" — a linha compacta das consultas que não estão em
   destaque. Curta porque são várias, uma embaixo da outra. */
export function consultaCompacta(dataHora: string): string {
  const dela = relogioDaNutri(dataHora)
  if (dela) return `${dataCurta(dela.data)} · ${dela.hora}`

  const d = new Date(dataHora)
  if (isNaN(d.getTime())) return 'Horário a confirmar'
  return `${dataCurta(d)} · ${horaCurta(d)}`
}

/* "Quinta-feira, 6 de Agosto, às 14:00". */
export function consultaLegivel(dataHora: string): string {
  const dela = relogioDaNutri(dataHora)
  if (dela) return `${dataPorExtenso(dela.data)}, às ${dela.hora}`

  const d = new Date(dataHora)
  if (isNaN(d.getTime())) return 'Horário a confirmar'
  return `${dataPorExtenso(d)}, às ${horaCurta(d)}`
}

/* O que cada estado quer dizer para quem vai à consulta.
 *
 * O texto de 'confirmada' é afirmativo e sem ressalva — é o único momento em
 * que o app pode dizer que a consulta está marcada, e depois de uma tela
 * inteira falando em "pedido" a pessoa precisa ver a diferença sem procurar. */
type Estado = {
  titulo: string
  /* Uma palavra, para a etiqueta das linhas compactas. */
  curto: string
  icone: 'hourglass-outline' | 'checkmark-circle' | 'calendar-outline'
  explicacao: string
}

/* Interno de propósito: quem lê de fora usa `estadoDaConsulta`, que é o único
   caminho que sobrevive a um status que este arquivo não conhece. */
const ESTADO_DA_CONSULTA: Record<StatusConsulta, Estado> = {
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

/* O estado que o app usa quando o banco manda uma palavra que ele não conhece.
 *
 * Sem isto, `ESTADO_DA_CONSULTA[status]` devolve undefined e a linha seguinte lê
 * `.titulo` dele — a tela inteira morre por causa de um valor novo numa coluna.
 * E esse dia tem hora marcada: no momento em que a nutricionista puder recusar
 * do lado dela, a recusa chega aqui como um status que este arquivo nunca viu.
 *
 * O texto é vago de propósito. Inventar significado para um estado desconhecido
 * é como errar dizendo "confirmada" — e o erro caro desta tela é sempre o mesmo,
 * a pessoa aparecer no consultório num dia em que não era esperada. Admitir que
 * o app não sabe, e mandar perguntar, é a única saída honesta. */
const DESCONHECIDO: Estado = {
  titulo: 'Consulta',
  curto: 'Consulta',
  icone: 'calendar-outline',
  explicacao:
    'Não foi possível identificar a situação desta consulta. Confirme com a sua nutricionista antes de se programar para o dia.',
}

export const estadoDaConsulta = (status: string): Estado =>
  ESTADO_DA_CONSULTA[status as StatusConsulta] ?? DESCONHECIDO
