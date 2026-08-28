import { dataISO } from './formatar'
import { falha } from './erros'
import { LIMITES, carregarMetas } from './metas'
import { supabase } from './supabase'

/* Água: um registro por gole, o total do dia é a soma.
 *
 * Ver a migração 20260801000000. A tabela `agua_registros` do app antigo, que
 * guarda só o total do dia por paciente, continua onde está — o painel do web
 * lê de lá e nada aqui escreve nela.
 *
 * A meta de água mora em `app_metas`, junto com todas as outras (migração
 * 20260801000001). Ela é editável em dois lugares — aqui e na tela de Metas —,
 * mas o número é um só: os dois caminhos passam pela mesma coluna. */

/* Os limites vêm de lib/metas.ts, que os mantém alinhados com os constraints do
   banco. Reexportados com nome de água porque é assim que a tela de Água fala. */
export const META_MIN_ML = LIMITES.aguaMl.min
export const META_MAX_ML = LIMITES.aguaMl.max
export const COPO_MIN_ML = LIMITES.copoMl.min
export const COPO_MAX_ML = LIMITES.copoMl.max

export type RegistroAgua = {
  id: string
  ml: number
  /* ISO com fuso, como o banco devolve. Vira Date na tela. */
  bebidoEm: string
}

export type DiaAgua = {
  /* 'YYYY-MM-DD', o dia do calendário de quem bebeu. */
  data: string
  ml: number
}

export type Agua = {
  metaMl: number
  copoMl: number
  /* Os de hoje, do mais recente para o mais antigo: é a ordem em que a lista
     aparece, e o desfazer é o primeiro item dela. */
  hoje: RegistroAgua[]
  /* Sete posições, do mais antigo para o mais novo, com os dias sem registro
     zerados. Dia faltando vira barra vazia no gráfico, não vira buraco. */
  semana: DiaAgua[]
}

export type ResultadoAgua = { tipo: 'ok'; agua: Agua } | { tipo: 'erro'; mensagem: string }

/* Quantos copos cheios um volume dá. Arredonda para baixo: seis copos e meio
   são seis copos bebidos — o meio ainda está na mão. */
export const coposDe = (ml: number, copoMl: number) =>
  copoMl > 0 ? Math.floor(ml / copoMl) : 0

/* Quantos copos a meta pede. Para cima, aqui: uma meta de 2.000 com copo de 300
   precisa do sétimo copo para ser batida, e desenhar seis diria que ela é 1.800. */
export const coposDaMeta = (metaMl: number, copoMl: number) =>
  copoMl > 0 ? Math.ceil(metaMl / copoMl) : 0

export const totalDe = (registros: RegistroAgua[]) =>
  registros.reduce((soma, r) => soma + r.ml, 0)

/* "1,2 L" acima de mil, "750 ml" abaixo. Trocar de unidade no meio é o que a
   pessoa faz falando: ninguém diz "mil e duzentos mililitros". */
export const volume = (ml: number) =>
  ml >= 1000 ? `${(ml / 1000).toFixed(1).replace('.', ',')} L` : `${Math.round(ml)} ml`

/* Os sete dias que terminam hoje, na ordem do calendário. Montados a partir de
   hoje para trás e não de uma consulta ao banco: dia sem nenhum registro não
   volta linha nenhuma, e é justamente ele que precisa aparecer vazio. */
function seteDias(hoje: Date): string[] {
  const dias: string[] = []
  for (let atras = 6; atras >= 0; atras--) {
    const d = new Date(hoje)
    d.setDate(d.getDate() - atras)
    dias.push(dataISO(d))
  }
  return dias
}

type LinhaRegistro = { id: string; ml: number; bebido_em: string; data: string }

/* Tudo o que a tela de água precisa, numa ida só.
 *
 * As duas consultas saem juntas: a meta e os registros são independentes, e
 * esperar uma para pedir a outra dobraria o tempo de abertura à toa. */
export async function carregarAgua(contaId: string, hoje = new Date()): Promise<ResultadoAgua> {
  const dias = seteDias(hoje)

  const [metas, registros] = await Promise.all([
    /* Pela função de metas, e não por uma consulta própria: desde que as metas
       viraram lista, "a meta de água" é a do conjunto ATIVO — e a regra de qual
       é o ativo (com a data como desempate) tem de morar num lugar só. */
    carregarMetas(contaId),
    supabase
      .from('app_agua_registros')
      .select('id, ml, bebido_em, data')
      .eq('conta_id', contaId)
      .gte('data', dias[0])
      .order('bebido_em', { ascending: false }),
  ])

  if (metas.tipo === 'erro') return { tipo: 'erro', mensagem: metas.mensagem }
  if (registros.error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui carregar a sua água agora. Verifique a conexão.', registros.error),
    }

  const linhas = (registros.data ?? []) as LinhaRegistro[]
  const deHoje = dias[dias.length - 1]
  const m = metas.metas

  const porDia: Record<string, number> = {}
  for (const l of linhas) porDia[l.data] = (porDia[l.data] ?? 0) + l.ml

  return {
    tipo: 'ok',
    agua: {
      metaMl: m.aguaMl,
      copoMl: m.copoMl,
      hoje: linhas
        .filter(l => l.data === deHoje)
        .map(l => ({ id: l.id, ml: l.ml, bebidoEm: l.bebido_em })),
      semana: dias.map(data => ({ data, ml: porDia[data] ?? 0 })),
    },
  }
}

/* Os goles de um intervalo, para a aba de Relatórios.
 *
 * Devolve gole a gole, e não o total já somado por dia: a hora de cada um é o
 * que responde "você concentra a água à noite?", e um total diário jogaria essa
 * pergunta fora antes de ela poder ser feita. */
export type GoleComData = RegistroAgua & { data: string }

export type ResultadoAguaPeriodo =
  | { tipo: 'ok'; goles: GoleComData[] }
  | { tipo: 'erro'; mensagem: string }

export async function carregarAguaPeriodo(
  contaId: string,
  de: string,
  ate: string,
): Promise<ResultadoAguaPeriodo> {
  const { data, error } = await supabase
    .from('app_agua_registros')
    .select('id, ml, bebido_em, data')
    .eq('conta_id', contaId)
    .gte('data', de)
    .lte('data', ate)
    .order('bebido_em', { ascending: true })

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui carregar o histórico de água agora. Verifique a conexão.', error),
    }

  const linhas = (data ?? []) as LinhaRegistro[]
  return {
    tipo: 'ok',
    goles: linhas.map(l => ({ id: l.id, ml: l.ml, bebidoEm: l.bebido_em, data: l.data })),
  }
}

export type ResultadoRegistro =
  | { tipo: 'ok'; registro: RegistroAgua }
  | { tipo: 'erro'; mensagem: string }

/* Um gole. A data vai daqui, do calendário do aparelho — ver o comentário da
   coluna `data` na migração. */
export async function registrarAgua(
  contaId: string,
  ml: number,
  quando = new Date(),
): Promise<ResultadoRegistro> {
  const { data, error } = await supabase
    .from('app_agua_registros')
    .insert({
      conta_id: contaId,
      ml: Math.round(ml),
      bebido_em: quando.toISOString(),
      data: dataISO(quando),
    })
    .select('id, ml, bebido_em')
    .single()

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui registrar o copo agora. Verifique a conexão.', error),
    }
  return {
    tipo: 'ok',
    registro: { id: data.id as string, ml: data.ml as number, bebidoEm: data.bebido_em as string },
  }
}

/* Desfazer. Apaga de verdade, e não marca como cancelado: um copo registrado
   por engano não é um fato que aconteceu e foi desfeito — ele nunca aconteceu, e
   guardá-lo só sujaria a soma de quem for ler isso depois. */
export async function apagarRegistro(id: string): Promise<{ erro: string } | null> {
  const { error } = await supabase.from('app_agua_registros').delete().eq('id', id)
  return error ? { erro: falha('Não consegui remover o copo agora. Verifique a conexão.', error) } : null
}

