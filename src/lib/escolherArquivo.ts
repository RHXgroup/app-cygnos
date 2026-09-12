import { falha } from './erros'
import type { ArquivoDoExame } from './importarExame'

/* De onde vem o arquivo do exame: arquivos, galeria ou câmera.
 *
 * ──────────────────── Por que `import()` dentro da função ────────────────────
 * `expo-document-picker` é módulo NATIVO, e entrou no projeto depois do build de
 * desenvolvimento que está no celular dele hoje. Um `import` no topo derrubaria
 * a tela inteira com "Cannot find native module" nesse build -- e a tela existe
 * para importar exame, que ainda dá para fazer pela galeria e pela câmera. Com
 * o `import()` dentro do `try`, a falta do módulo vira uma FRASE, e as outras
 * duas origens continuam funcionando. Mesma defesa do `expo-print` na tela do
 * plano e do reconhecimento de voz no ditado.
 *
 * No próximo build ele existe, e a frase deixa de aparecer sozinha. */

export type EscolhaDeArquivo =
  | { tipo: 'ok'; arquivo: ArquivoDoExame }
  | { tipo: 'cancelado' }
  | { tipo: 'erro'; mensagem: string }

/* O que o site aceita no seletor de exame. PDF e imagem passam pela leitura
   automática; os outros entram como anexo para ela abrir. */
const TIPOS = [
  'application/pdf',
  'image/*',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

export async function escolherArquivoDoExame(
  origem: 'arquivo' | 'galeria' | 'camera',
): Promise<EscolhaDeArquivo> {
  if (origem === 'arquivo') return doSeletorDeArquivos()
  return daCamera(origem === 'camera')
}

/* ──────────── O `import()` daqui FICA, e o do PDF foi embora ────────────
 *
 * Os dois seletores seguem dinâmicos de propósito, e a diferença vale escrita
 * porque ela não é óbvia: o `import()` dá ao módulo um NÚMERO que o Metro
 * resolve só na hora do toque, e número errado vira "Requiring unknown module
 * 1267" -- foi o que aconteceu no botão de PDF, e por isso lá passou a estático.
 *
 * Aqui o preço se paga por algo: quando o seletor não existe no pacote
 * instalado, a falha vira a frase "ainda não funciona nesta versão, use a
 * galeria" e a pessoa segue por outro caminho. Import estático não deixa
 * escolher: ele resolve na avaliação do módulo, e um módulo faltando derruba
 * quem importa esta lib.
 *
 * A regra, então: dinâmico só onde exista uma SAÍDA para a ausência. Se algum
 * dia o `catch` daqui só souber dizer "não deu", ele virou estático também. */
async function doSeletorDeArquivos(): Promise<EscolhaDeArquivo> {
  let DocumentPicker: typeof import('expo-document-picker')
  try {
    DocumentPicker = await import('expo-document-picker')
  } catch (e) {
    falha('O seletor de arquivos não existe neste build.', e)
    return {
      tipo: 'erro',
      mensagem:
        'Escolher PDF ainda não funciona nesta versão instalada. Use a galeria ou a câmera — ' +
        'na próxima atualização do aplicativo o PDF entra.',
    }
  }

  try {
    const r = await DocumentPicker.getDocumentAsync({
      type: TIPOS,
      /* Copiado para a pasta do app: sem isto, o endereço aponta para dentro do
         outro aplicativo (o WhatsApp, o Drive) e pode deixar de valer entre a
         escolha e a subida. */
      copyToCacheDirectory: true,
      multiple: false,
    })

    if (r.canceled) return { tipo: 'cancelado' }
    const escolhido = r.assets?.[0]
    if (!escolhido?.uri) return { tipo: 'cancelado' }

    return {
      tipo: 'ok',
      arquivo: {
        uri: escolhido.uri,
        mimeType: escolhido.mimeType || 'application/octet-stream',
        nomeDoArquivo: escolhido.name ?? null,
      },
    }
  } catch (e) {
    return { tipo: 'erro', mensagem: falha('Não consegui abrir os seus arquivos.', e) }
  }
}

async function daCamera(usarCamera: boolean): Promise<EscolhaDeArquivo> {
  let ImagePicker: typeof import('expo-image-picker')
  try {
    ImagePicker = await import('expo-image-picker')
  } catch (e) {
    return { tipo: 'erro', mensagem: falha('Não consegui abrir a câmera neste aparelho.', e) }
  }

  try {
    const permissao = usarCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()

    if (!permissao.granted) {
      return {
        tipo: 'erro',
        mensagem: usarCamera
          ? 'O Cygnos precisa da câmera para fotografar o laudo. Libere nas configurações do celular.'
          : 'O Cygnos precisa das fotos para pegar o exame. Libere nas configurações do celular.',
      }
    }

    const r = usarCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8, exif: false })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.8,
          exif: false,
        })

    if (r.canceled) return { tipo: 'cancelado' }
    const foto = r.assets?.[0]
    if (!foto?.uri) return { tipo: 'cancelado' }

    return {
      tipo: 'ok',
      arquivo: {
        uri: foto.uri,
        mimeType: foto.mimeType || 'image/jpeg',
        nomeDoArquivo: foto.fileName ?? null,
      },
    }
  } catch (e) {
    return { tipo: 'erro', mensagem: falha('Não consegui pegar a foto do exame.', e) }
  }
}
