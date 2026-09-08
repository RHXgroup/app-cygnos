import { supabase } from './supabase'
import { falha } from './erros'
import type { ConsultaDoDia } from './diaDaNutri'

/* A agenda dela, lida do banco. O que DECIDE mora em `diaDaNutri`.
 *
 * ── Por que não precisa de função nova no servidor ────────────────────────
 * A política de `consultas` já é exatamente o que este app precisa:
 *
 *     nutricionista_id = get_nutricionista_id()  AND  func_pode('{agenda…}')
 *
 * Ou seja: o banco só devolve as consultas DELA, e só se a permissão de agenda
 * estiver ligada na conta. A regra não está nesta tela — está no servidor, e
 * continua valendo mesmo que alguém escreva a consulta errada aqui.
 *
 * Isso é o oposto do que acontece com o paciente, onde cada leitura passa por
 * uma função `app_*_do_paciente`. Aqui a tabela já sabe se defender, então uma
 * função a mais só acrescentaria um lugar para divergir.
 *
 * ── Duas consultas, e não um join ─────────────────────────────────────────
 * O nome do paciente mora em `pacientes`, que tem a própria política. Dava para
 * pedir aninhado numa consulta só, mas isso depende de o PostgREST enxergar a
 * relação — e quando ele não enxerga, o erro não é "faltou o nome": é a
 * consulta inteira falhando, e a agenda em branco.
 *
 * Duas leituras sempre funcionam, e a segunda só busca os ids que apareceram.
 * Sem nome, a consulta ainda aparece com o horário, que é a informação que não
 * pode faltar.
 *
 * ── Falha aqui não derruba a tela ─────────────────────────────────────────
 * Item 11 do AGENTS.md. Sem sinal, devolve lista vazia e a mensagem sobe pela
 * tela, com o gesto de puxar para tentar de novo. */

/* O intervalo de um dia no fuso do APARELHO.
 *
 * `data_hora` é `timestamptz`, então o banco compara instantes e o fuso da
 * consulta não interfere. O que precisa ser local é o RECORTE: "hoje" para ela
 * é da meia-noite dela até a meia-noite dela, e não UTC. */
function limitesDoDia(dia: Date): { inicio: string; fim: string } {
  const inicio = new Date(dia)
  inicio.setHours(0, 0, 0, 0)
  const fim = new Date(inicio)
  fim.setDate(fim.getDate() + 1)
  return { inicio: inicio.toISOString(), fim: fim.toISOString() }
}

type LinhaConsulta = {
  id: number
  data_hora: string
  duracao: number | null
  status: string | null
  tipo: string | null
  paciente_id: number | null
  nome_avulso: string | null
}

export type ResultadoAgenda =
  | { tipo: 'ok'; consultas: ConsultaDoDia[] }
  | { tipo: 'erro'; mensagem: string }

export async function consultasDoDia(dia: Date): Promise<ResultadoAgenda> {
  const { inicio, fim } = limitesDoDia(dia)

  const { data, error } = await supabase
    .from('consultas')
    .select('id, data_hora, duracao, status, tipo, paciente_id, nome_avulso')
    .gte('data_hora', inicio)
    .lt('data_hora', fim)
    .order('data_hora', { ascending: true })

  if (error) {
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui carregar a sua agenda agora. Verifique a conexão.', error),
    }
  }

  const linhas = (data ?? []) as LinhaConsulta[]
  if (linhas.length === 0) return { tipo: 'ok', consultas: [] }

  /* Os nomes, numa segunda leitura. Só os ids que apareceram no dia — pedir a
     carteira inteira para mostrar seis nomes seria trazer centenas de linhas
     para o aparelho dela em cada abertura da tela. */
  const ids = [...new Set(linhas.map(l => l.paciente_id).filter((x): x is number => x !== null))]
  const nomes = new Map<number, string>()

  if (ids.length > 0) {
    const { data: ps, error: erroNomes } = await supabase
      .from('pacientes')
      .select('id, nome')
      .in('id', ids)

    /* Nome que não veio não é motivo para esconder a consulta: o horário
       continua sendo a informação que ela precisa. Registra e segue. */
    if (erroNomes) falha('Não consegui carregar os nomes dos pacientes.', erroNomes)
    else for (const p of (ps ?? []) as { id: number; nome: string | null }[]) {
      if (p.nome?.trim()) nomes.set(p.id, p.nome.trim())
    }
  }

  const consultas: ConsultaDoDia[] = linhas.map(l => ({
    id: l.id,
    quando: l.data_hora,
    /* A ordem importa: a ficha primeiro, o avulso depois, e por fim um genérico.
       `nome_avulso` existe para o encaixe de quem ainda não tem ficha, e é o
       nome certo justamente nesse caso. */
    nome:
      (l.paciente_id !== null ? nomes.get(l.paciente_id) : undefined) ??
      l.nome_avulso?.trim() ??
      'Sem nome',
    duracao: l.duracao,
    status: l.status ?? '',
    tipo: l.tipo,
  }))

  return { tipo: 'ok', consultas }
}
