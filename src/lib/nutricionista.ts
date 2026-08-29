import { supabase } from './supabase'
import { falha } from './erros'
import { assinados } from './arquivos'

/* O catálogo de nutricionistas do app.
 *
 * Ver a migração 20260801000008. Uma chamada só, e é o BANCO que decide o que
 * volta: sem vínculo, todas as nutricionistas ativas; com vínculo, apenas a
 * dele. O app não tem como tomar essa decisão — `perfil_nutricionista` é
 * ilegível para o aparelho do paciente, e por isso a função é security definer.
 *
 * Nada aqui conversa com `pacientes`: o vínculo do app mora em app_vinculos e é
 * outra coisa que ser paciente na carteira de alguém. */

export type Nutricionista = {
  id: string
  nome: string
  /* null quando não há foto nem logo: a tela desenha as iniciais. */
  imagemUrl: string | null
  /* Logo é quadrada e não pode ser recortada num círculo; foto de rosto é
     redonda. Quem resolve a precedência entre as duas é a função do banco. */
  imagemELogo: boolean
  especialidades: string[]
  telefone: string | null
  crn: string | null
  cidade: string | null
  uf: string | null
}

export type Catalogo = {
  /* Preenchida quando o paciente já está vinculado — e então a lista tem essa
     mesma pessoa e só ela. */
  vinculada: Nutricionista | null
  lista: Nutricionista[]
}

export type ResultadoCatalogo =
  | { tipo: 'ok'; catalogo: Catalogo }
  | { tipo: 'erro'; mensagem: string }

type Linha = {
  id: string
  nome: string
  imagem_url: string | null
  imagem_e_logo: boolean
  especialidades: unknown
  telefone: string | null
  crn: string | null
  cidade: string | null
  uf: string | null
  vinculada: boolean
}

const daLinha = (l: Linha): Nutricionista => ({
  id: l.id,
  nome: l.nome,
  imagemUrl: l.imagem_url,
  imagemELogo: l.imagem_e_logo,
  /* A coluna é jsonb e o conteúdo dela é preenchido por outra tela, de outro
     sistema. Filtrar por typeof em vez de confiar no formato: um item que não
     for texto viraria "[object Object]" dentro de um chip. */
  especialidades: Array.isArray(l.especialidades)
    ? l.especialidades.filter((e): e is string => typeof e === 'string' && e.trim() !== '')
    : [],
  telefone: l.telefone,
  crn: l.crn,
  cidade: l.cidade,
  uf: l.uf,
})

/* ── As fotos ──────────────────────────────────────────────────────────────
 *
 * O endereço vem do sistema como URL pública de um bucket privado, e por isso
 * precisa ser assinado aqui. A conta mora em lib/arquivos.ts, junto com a dos
 * arquivos de exame, que sofrem do mesmo mal. */

async function comFotosAssinadas(lista: Nutricionista[]): Promise<Nutricionista[]> {
  const comFoto = lista.filter(n => n.imagemUrl)
  if (comFoto.length === 0) return lista

  const novos = await assinados(comFoto.map(n => n.imagemUrl as string))
  const porOriginal = new Map<string, string>()
  comFoto.forEach((n, i) => porOriginal.set(n.imagemUrl as string, novos[i]))

  return lista.map(n =>
    n.imagemUrl ? { ...n, imagemUrl: porOriginal.get(n.imagemUrl) ?? n.imagemUrl } : n,
  )
}

/* Já existe vínculo? Uma pergunta e um booleano.
 *
 * Serve para a tela do código perceber, sozinha, o momento em que a
 * nutricionista vincula — que acontece do lado DELA, com o app aberto na mão da
 * pessoa, e sem nada avisar o aparelho.
 *
 * Existe separada de `carregarCatalogo` por causa do custo: aquela traz o
 * catálogo inteiro quando ainda não há vínculo, e é justamente esse o estado em
 * que a pergunta se repete de poucos em poucos segundos. Esta devolve um
 * bigint. O nome dela só é buscado quando a resposta vira sim, uma vez.
 *
 * Engole a falha e responde `false`: sem sinal, "ainda não vinculou" é a
 * resposta certa, e derrubar a tela por causa de uma tentativa perdida no meio
 * de uma sequência delas seria trocar um silêncio por um erro. */
export async function jaVinculado(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('app_paciente_da_conta')
    return !error && data !== null && data !== undefined
  } catch {
    return false
  }
}

export async function carregarCatalogo(): Promise<ResultadoCatalogo> {
  const { data, error } = await supabase.rpc('app_nutricionistas')

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui carregar as nutricionistas agora. Verifique a conexão.', error),
    }

  const linhas = (data ?? []) as Linha[]
  const lista = await comFotosAssinadas(linhas.map(daLinha))

  return {
    tipo: 'ok',
    catalogo: {
      /* A flag vem em toda linha e é a mesma em todas — é uma propriedade da
         resposta, não de cada nutricionista. Ler da primeira basta. */
      vinculada: linhas[0]?.vinculada ? lista[0] : null,
      lista,
    },
  }
}

/* ── Apresentação ──────────────────────────────────────────────────────────*/

/* "(11) 91234-5678". Escrita à mão como todo o resto de lib/formatar.ts, e
   tolerante: o telefone vem de um campo livre do sistema web, então o que não
   tiver 10 ou 11 dígitos volta como está em vez de virar uma máscara torta. */
export function telefoneFormatado(bruto: string): string {
  const numeros = bruto.replace(/\D/g, '')

  if (numeros.length === 11) {
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`
  }
  if (numeros.length === 10) {
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 6)}-${numeros.slice(6)}`
  }

  return bruto
}

/* O link do WhatsApp. O 55 entra quando o número tem só o DDD e o assinante —
   que é como o campo é preenchido no Brasil inteiro. Com mais dígitos, presume-se
   que o país já veio junto. */
export function linkDoWhatsapp(bruto: string): string | null {
  const numeros = bruto.replace(/\D/g, '')
  if (numeros.length < 10) return null
  return `https://wa.me/${numeros.length <= 11 ? `55${numeros}` : numeros}`
}

/* "MC" de "Maria Clara". Duas letras no máximo, e o sobrenome vem do ÚLTIMO
   pedaço, não do segundo: "Maria de Souza" dá MS, e não MD. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(p => p.length > 1)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}
