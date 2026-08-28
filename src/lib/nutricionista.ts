import { supabase } from './supabase'
import { falha } from './erros'

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
 * O sistema entrega URL PÚBLICA para um bucket PRIVADO. `getPublicUrl` não
 * pergunta nada a ninguém: concatena uma string e devolve um endereço com cara
 * de válido, que o servidor recusa com "Bucket not found". Era por isso que
 * nenhuma foto do catálogo carregava — e sem erro nenhum, porque do ponto de
 * vista do app estava tudo certo até a imagem simplesmente não aparecer.
 *
 * Aqui o endereço é desmontado, o caminho é extraído e assinado com a sessão de
 * quem está usando o app. É remendo, e o conserto de verdade é o sistema assinar
 * na origem — mas o remendo é honesto: se um dia o bucket virar público, ou o
 * sistema passar a assinar, este código continua funcionando sem mudar. */

const VALIDADE_SEGUNDOS = 60 * 60

/* .../storage/v1/object/public/<bucket>/<caminho>[?query] */
const ENDERECO_PUBLICO = /\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/

function partesDoEndereco(url: string): { bucket: string; caminho: string } | null {
  const achado = ENDERECO_PUBLICO.exec(url)
  if (!achado) return null

  /* O `?t=` que o sistema pendura no fim é quebra-cache dele, não faz parte do
     nome do arquivo — assinar com ele junto procuraria um arquivo que não
     existe. */
  const caminho = decodeURIComponent(achado[2].split('?')[0])
  return caminho ? { bucket: achado[1], caminho } : null
}

async function comFotosAssinadas(lista: Nutricionista[]): Promise<Nutricionista[]> {
  const doIndice = new Map<number, { bucket: string; caminho: string }>()
  const porBucket = new Map<string, string[]>()

  lista.forEach((n, i) => {
    if (!n.imagemUrl) return
    const partes = partesDoEndereco(n.imagemUrl)
    /* Endereço fora do formato conhecido fica como veio: pode ser de outro lugar
       que já funciona, e reescrever o que não se entende é pior que não mexer. */
    if (!partes) return

    doIndice.set(i, partes)
    porBucket.set(partes.bucket, [...(porBucket.get(partes.bucket) ?? []), partes.caminho])
  })

  if (doIndice.size === 0) return lista

  /* Uma chamada por bucket, e não uma por foto: o catálogo é a vitrine e vai
     crescer, e uma ida à rede por linha cresceria junto com ele. */
  const assinados = new Map<string, string>()

  await Promise.all(
    [...porBucket].map(async ([bucket, caminhos]) => {
      /* O try é o que impede uma foto de derrubar o catálogo. Assinar é ida à
         rede: sem sinal, a promessa REJEITA em vez de devolver `error`, e essa
         rejeição subiria por `carregarCatalogo` até a tela — que ficaria sem
         nutricionista nenhuma por causa de uma imagem.
         Sem assinatura, cada uma fica com o endereço que veio, e o AvatarNutri
         desenha as iniciais para as que não carregarem. */
      try {
        const { data } = await supabase.storage
          .from(bucket)
          .createSignedUrls(caminhos, VALIDADE_SEGUNDOS)

        for (const item of data ?? []) {
          if (item.path && item.signedUrl) assinados.set(`${bucket}/${item.path}`, item.signedUrl)
        }
      } catch {
        /* Silêncio de propósito: a lista continua, só sem foto. */
      }
    }),
  )

  return lista.map((n, i) => {
    const partes = doIndice.get(i)
    if (!partes) return n

    const assinado = assinados.get(`${partes.bucket}/${partes.caminho}`)
    /* Não deu para assinar — arquivo que não está lá, ou permissão que não
       alcança aquela pasta. Fica o endereço original: se ele funcionar, ótimo; e
       se não funcionar, o AvatarNutri desenha as iniciais quando a imagem falha,
       que é melhor do que o buraco que ficava antes. */
    return assinado ? { ...n, imagemUrl: assinado } : n
  })
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
