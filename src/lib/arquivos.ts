import { supabase } from './supabase'

/* Endereços de arquivo que vêm do sistema.
 *
 * O sistema entrega URL PÚBLICA para buckets PRIVADOS. `getPublicUrl`, do lado
 * de lá, não pergunta nada a ninguém: concatena uma string e devolve um endereço
 * com cara de válido, que o servidor recusa com "Bucket not found". Foi assim
 * que a foto de perfil de todo mundo ficou meses sem carregar — sem erro
 * nenhum, porque do ponto de vista de quem exibia estava tudo certo.
 *
 * Aqui o endereço é desmontado, o caminho extraído e assinado com a sessão de
 * quem está usando o app. É remendo: o conserto de verdade é o sistema assinar
 * na origem, e está pedido em docs/o-que-o-app-precisa-do-sistema.md. Mas é
 * remendo que não atrapalha — no dia em que o outro lado assinar, ou o bucket
 * virar público, este código continua funcionando sem mudar uma linha.
 *
 * Mora aqui, e não dentro de quem usa, porque já são dois: as fotos do catálogo
 * de nutricionistas e os arquivos de exame. Duas cópias da mesma conta divergem
 * no primeiro ajuste, e ninguém descobre por qual delas a tela passou. */

const VALIDADE_SEGUNDOS = 60 * 60

/* .../storage/v1/object/public/<bucket>/<caminho>[?query] */
const ENDERECO_PUBLICO = /\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/

export type PartesDoEndereco = { bucket: string; caminho: string }

/* O `bucketPadrao` existe por um caso medido, e não por precaução.
 *
 * O sistema guarda o exame como CAMINHO PURO — "exames/<nutri>/<pac>/x.pdf" —,
 * e não como URL. A expressão acima não casa, a função devolvia null, e o
 * assinador então devolvia o caminho como veio: uma string que não é endereço
 * de nada, posta num link.
 *
 * Somado à falta de policy no Storage (corrigida na 20260831030000), a tela de
 * exames listava seis cartões e não abria nenhum — sem erro em lugar nenhum,
 * porque cada metade falhava em silêncio. Quem sabe em que bucket o caminho
 * mora é quem chama; aqui só se aceita a informação. */
export function partesDoEndereco(url: string, bucketPadrao?: string): PartesDoEndereco | null {
  const achado = ENDERECO_PUBLICO.exec(url)
  if (!achado) {
    /* Caminho puro: sem esquema, sem barra na frente, e com pelo menos uma
       pasta. `http...` que não casou com o formato conhecido continua saindo
       null — é endereço de outro lugar, e reescrevê-lo seria chutar. */
    const limpo = (url ?? '').trim()
    if (
      bucketPadrao &&
      limpo !== '' &&
      !limpo.includes('://') &&
      !limpo.startsWith('/') &&
      limpo.includes('/')
    ) {
      return { bucket: bucketPadrao, caminho: limpo }
    }
    return null
  }

  /* O `?t=` que o sistema pendura no fim é quebra-cache dele, não faz parte do
     nome do arquivo — assinar com ele junto procuraria um arquivo que não
     existe. */
  const caminho = decodeURIComponent(achado[2].split('?')[0])
  return caminho ? { bucket: achado[1], caminho } : null
}

/* Assina um endereço só. Devolve o original quando não dá — se ele funcionar,
   ótimo; se não, quem exibe já sabe lidar com imagem que não carrega. */
export async function assinado(url: string): Promise<string> {
  const partes = partesDoEndereco(url)
  if (!partes) return url

  try {
    const { data, error } = await supabase.storage
      .from(partes.bucket)
      .createSignedUrl(partes.caminho, VALIDADE_SEGUNDOS)

    if (error || !data) return url
    return data.signedUrl
  } catch {
    /* Sem sinal a promessa REJEITA em vez de devolver `error`, e essa rejeição
       subiria até quem só queria mostrar uma foto. */
    return url
  }
}

/* Assina uma lista, agrupando por bucket: uma ida à rede por bucket, e não uma
   por arquivo. O catálogo é vitrine e vai crescer; uma chamada por linha
   cresceria junto com ele.
 *
 * Devolve na mesma ordem que recebeu. O que não deu para assinar volta como
 * veio. */
export async function assinados(urls: string[], bucketPadrao?: string): Promise<string[]> {
  const porBucket = new Map<string, string[]>()
  const doIndice = new Map<number, PartesDoEndereco>()

  urls.forEach((url, i) => {
    const partes = partesDoEndereco(url, bucketPadrao)
    /* Endereço fora do formato conhecido fica como veio: pode ser de outro lugar
       que já funciona, e reescrever o que não se entende é pior que não mexer. */
    if (!partes) return

    doIndice.set(i, partes)
    porBucket.set(partes.bucket, [...(porBucket.get(partes.bucket) ?? []), partes.caminho])
  })

  if (doIndice.size === 0) return urls

  const prontos = new Map<string, string>()

  await Promise.all(
    [...porBucket].map(async ([bucket, caminhos]) => {
      try {
        const { data } = await supabase.storage
          .from(bucket)
          .createSignedUrls(caminhos, VALIDADE_SEGUNDOS)

        for (const item of data ?? []) {
          if (item.path && item.signedUrl) prontos.set(`${bucket}/${item.path}`, item.signedUrl)
        }
      } catch {
        /* Silêncio de propósito: a lista continua, só sem assinatura. */
      }
    }),
  )

  return urls.map((url, i) => {
    const partes = doIndice.get(i)
    if (!partes) return url
    return prontos.get(`${partes.bucket}/${partes.caminho}`) ?? url
  })
}
