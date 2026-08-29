import { falha } from './erros'
import { supabase } from './supabase'
import { dataNumerica } from './formatar'

/* As fotos de evolução que a nutricionista registrou.
 *
 * Único conteúdo do painel "Meu nutricionista" que NÃO é RPC: o bucket
 * `fotos-consulta` é privado e cada foto precisa de URL assinada, coisa que SQL
 * não emite. Quem assina é a edge function `app-fotos`, no repo do sistema.
 *
 * As URLs que chegam aqui valem UMA HORA. Não são para guardar em lugar nenhum:
 * a tela pede de novo a cada abertura, e um cache disfarçaria o vencimento como
 * foto quebrada. */

export type AnguloFoto = 'frente' | 'costas' | 'lado_esquerdo' | 'lado_direito'

export type FotoDaSessao = {
  angulo: AnguloFoto
  url: string
}

/* Um dia de fotos — o que a nutricionista tirou numa consulta, os quatro ângulos
   ou os que ela conseguiu. É a unidade que a comparação usa: um momento contra
   outro. */
export type SessaoDeFotos = {
  consultaId: number
  /* ISO completo (a data_hora da consulta). Null é possível, e a tela mostra a
     sessão mesmo assim — foto sem data ainda é foto. */
  data: string | null
  fotos: FotoDaSessao[]
}

/* A ordem em que os ângulos aparecem, e o nome de cada um. Mesma ordem e mesmos
   rótulos do comparativo do sistema web, para a pessoa não ter de reaprender
   nada ao trocar de tela. */
export const ANGULOS: { chave: AnguloFoto; rotulo: string }[] = [
  { chave: 'frente', rotulo: 'De frente' },
  { chave: 'costas', rotulo: 'De costas' },
  { chave: 'lado_esquerdo', rotulo: 'Lado esquerdo' },
  { chave: 'lado_direito', rotulo: 'Lado direito' },
]

const ROTULO_CURTO: Record<AnguloFoto, string> = {
  frente: 'Frente',
  costas: 'Costas',
  lado_esquerdo: 'Lado esq.',
  lado_direito: 'Lado dir.',
}

export const rotuloCurtoDoAngulo = (a: AnguloFoto) => ROTULO_CURTO[a] ?? a

const CONHECIDOS = new Set<string>(['frente', 'costas', 'lado_esquerdo', 'lado_direito'])

export async function carregarSessoes(): Promise<SessaoDeFotos[]> {
  const { data, error } = await supabase.functions.invoke('app-fotos')
  if (error) throw new Error(falha('Não consegui carregar as suas fotos. Verifique a conexão.', error))

  /* A função responde `{ sessoes: [] }` quando a conta não está vinculada, e o
     erro dela vem no corpo com status próprio — o `error` acima já cobre isso. */
  const sessoes = (data?.sessoes ?? []) as SessaoDeFotos[]

  return sessoes
    /* `angulo` é texto livre no banco. Um valor fora dos quatro conhecidos não
       tem rótulo nem lugar na fita, e chegaria à tela como uma foto que existe e
       não dá para escolher. Cai fora aqui, na porta — e a sessão que ficar sem
       nenhuma foto sai junto, para não virar uma data escolhível e vazia. */
    .map(s => ({ ...s, fotos: (s.fotos ?? []).filter(f => CONHECIDOS.has(f.angulo)) }))
    .filter(s => s.fotos.length > 0)
}

/* ── Leitura ───────────────────────────────────────────────────────────────*/

/* Só os ângulos que existem, na ordem de ANGULOS. Uma fita com "Lado direito"
   que abre vazia promete o que a nutricionista não fotografou. */
export function angulosComFoto(sessoes: SessaoDeFotos[]): AnguloFoto[] {
  const tem = new Set(sessoes.flatMap(s => s.fotos.map(f => f.angulo)))
  return ANGULOS.map(a => a.chave).filter(a => tem.has(a))
}

/* As sessões que têm foto deste ângulo, na ordem em que vieram (mais antiga
   primeiro). É a lista que vira as datas escolhíveis. */
export const sessoesComAngulo = (sessoes: SessaoDeFotos[], angulo: AnguloFoto) =>
  sessoes.filter(s => s.fotos.some(f => f.angulo === angulo))

export const fotoDoAngulo = (sessao: SessaoDeFotos | undefined, angulo: AnguloFoto) =>
  sessao?.fotos.find(f => f.angulo === angulo) ?? null

/* ── Apresentação ──────────────────────────────────────────────────────────*/

/* `data` é timestamp com fuso ("2026-05-06T13:00:00+00:00"), diferente das datas
   peladas do resto do painel. Aqui `new Date()` é o certo — ele lê o fuso que
   vem escrito — e os getters locais devolvem o dia como quem tirou a foto viveu.
   (É o mesmo cuidado de conteudoNutri.ts, pelo motivo oposto.) */
export function dataDaSessao(iso: string | null): string {
  if (!iso) return 'Sem data'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? 'Sem data' : dataNumerica(d)
}

/* "3 meses depois", "1 ano e 2 meses depois" — a distância entre as duas fotos.
 *
 * É o número que a pessoa procura quando vê as duas lado a lado. Contado em
 * meses de calendário, e não em dias divididos por 30: quem fotografou em 5 de
 * janeiro e em 5 de abril viveu três meses, e "89 dias" seria uma resposta
 * tecnicamente certa para uma pergunta que ninguém fez. */
export function distanciaEntre(isoA: string | null, isoB: string | null): string | null {
  if (!isoA || !isoB) return null

  const a = new Date(isoA)
  const b = new Date(isoB)
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return null

  const [antes, depois] = a <= b ? [a, b] : [b, a]

  const dias = Math.round((depois.getTime() - antes.getTime()) / 86_400_000)
  if (dias === 0) return 'No mesmo dia'
  if (dias < 31) return `${dias} ${dias === 1 ? 'dia' : 'dias'} depois`

  let meses = (depois.getFullYear() - antes.getFullYear()) * 12 + (depois.getMonth() - antes.getMonth())
  /* O mês só fecha no dia: de 31 de janeiro a 1º de março não são dois meses. */
  if (depois.getDate() < antes.getDate()) meses -= 1
  if (meses < 1) return `${dias} dias depois`

  const anos = Math.floor(meses / 12)
  const resto = meses % 12

  const parte = (n: number, singular: string, plural: string) =>
    `${n} ${n === 1 ? singular : plural}`

  if (anos === 0) return `${parte(meses, 'mês', 'meses')} depois`
  if (resto === 0) return `${parte(anos, 'ano', 'anos')} depois`
  return `${parte(anos, 'ano', 'anos')} e ${parte(resto, 'mês', 'meses')} depois`
}
