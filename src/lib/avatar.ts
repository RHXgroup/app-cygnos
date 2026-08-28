import { decode } from 'base64-arraybuffer'
import * as ImagePicker from 'expo-image-picker'
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator'
import { supabase } from './supabase'

const BUCKET = 'avatares'
/* 512px de lado é o suficiente para a maior exibição da foto (o avatar grande
   do perfil, 76pt em tela 3x = 228px) com folga para telas futuras. Enviar o
   original de 12 megapixels gastaria dados do paciente à toa. */
const LADO = 512

export type ResultadoAvatar =
  | { tipo: 'ok'; path: string }
  | { tipo: 'cancelado' }
  | { tipo: 'erro'; mensagem: string }

/* Quanto tempo o endereço assinado vale. Uma hora é folgado para o que ele
   serve — mostrar a foto enquanto a tela de Perfil está aberta —, e a imagem já
   carregada não some quando o prazo vence. */
const VALIDADE_SEGUNDOS = 60 * 60

/* Monta a URL a partir do caminho. O banco guarda só o caminho de propósito —
 * ver o comentário da migration.
 *
 * ASSINADA, e não pública. O bucket é privado, e `getPublicUrl` não pergunta
 * nada a ninguém: ele concatena uma string e devolve um endereço com cara de
 * válido, que o servidor recusa com "Bucket not found". Era isso que deixava a
 * foto de perfil de todo mundo sem carregar — sem erro na tela, porque do ponto
 * de vista do app estava tudo certo até a imagem simplesmente não aparecer.
 *
 * Privado é o certo aqui: foto de paciente não é vitrine, e endereço público
 * vale para sempre e para qualquer um que o tenha. Assinado expira.
 *
 * Nada disto mexe no que está gravado. O `avatar_path` continua o mesmo, e quem
 * mais lê esse campo — relatório, PDF, o sistema — continua lendo igual. O que
 * mudou é só como ESTE app transforma o caminho em endereço na hora de exibir. */
export async function urlDoAvatar(path: string | null): Promise<string | null> {
  if (!path) return null

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, VALIDADE_SEGUNDOS)

  /* Devolve null em vez de estourar: a tela já sabe desenhar as iniciais quando
     não há endereço, e é uma resposta melhor do que um erro para uma foto. */
  if (error) return null
  return data.signedUrl
}

async function pedirPermissao(origem: 'galeria' | 'camera'): Promise<boolean> {
  const { granted } =
    origem === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
  return granted
}

/* Escolhe, recorta, reduz e envia. Devolve o caminho novo já gravado em
   app_contas. */
export async function trocarAvatar(
  origem: 'galeria' | 'camera',
  userId: string,
  pathAntigo: string | null,
): Promise<ResultadoAvatar> {
  if (!(await pedirPermissao(origem))) {
    return {
      tipo: 'erro',
      mensagem:
        origem === 'camera'
          ? 'Preciso de acesso à câmera. Você pode liberar nos ajustes do aparelho.'
          : 'Preciso de acesso às suas fotos. Você pode liberar nos ajustes do aparelho.',
    }
  }

  const opcoes: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    /* É este allowsEditing que abre o recorte do sistema, onde dá para
       arrastar e dar zoom. O aspect trava em quadrado, que é o formato do
       avatar — deixar livre permitiria uma foto retangular que o app cortaria
       de qualquer jeito depois, sem a pessoa escolher onde. */
    allowsEditing: true,
    aspect: [1, 1],
    /* Qualidade cheia aqui; quem comprime é o passo seguinte, depois de
       reduzir o tamanho. Comprimir duas vezes só piora a imagem. */
    quality: 1,
    /* Tela cheia, e não o padrão "Automatic" (que no iOS moderno vira uma
       folha por cima). Apresentação em folha em cima de outra apresentação é
       o que fazia a promise da câmera nunca resolver — o spinner girava para
       sempre porque a chamada simplesmente não voltava. */
    presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN,
  }

  const escolha =
    origem === 'camera'
      ? await ImagePicker.launchCameraAsync(opcoes)
      : await ImagePicker.launchImageLibraryAsync(opcoes)

  if (escolha.canceled || !escolha.assets?.[0]) return { tipo: 'cancelado' }

  try {
    const reduzida = await manipulateAsync(
      escolha.assets[0].uri,
      [{ resize: { width: LADO, height: LADO } }],
      { compress: 0.8, format: SaveFormat.JPEG, base64: true },
    )

    if (!reduzida.base64) return { tipo: 'erro', mensagem: 'Não consegui preparar a imagem.' }

    /* Nome novo a cada envio, em vez de sobrescrever "perfil.jpg": com nome
       fixo a URL não muda e o cache do aparelho continua mostrando a foto
       antiga. O arquivo velho é apagado logo abaixo. */
    const path = `${userId}/${Date.now()}.jpg`

    const { error: erroUpload } = await supabase.storage
      .from(BUCKET)
      .upload(path, decode(reduzida.base64), { contentType: 'image/jpeg' })

    if (erroUpload) return { tipo: 'erro', mensagem: 'Não consegui enviar a foto. Tente de novo.' }

    const { error: erroBanco } = await supabase
      .from('app_contas')
      .update({ avatar_path: path })
      .eq('id', userId)

    if (erroBanco) {
      /* O arquivo subiu mas a conta não aponta para ele: limpa para não deixar
         lixo órfão no bucket. */
      await supabase.storage.from(BUCKET).remove([path])
      return { tipo: 'erro', mensagem: 'Não consegui salvar a foto no seu perfil.' }
    }

    /* Melhor esforço: falhar aqui deixa um arquivo a mais no bucket, o que é
       bem menos grave do que travar a troca da foto por causa disso. */
    if (pathAntigo) await supabase.storage.from(BUCKET).remove([pathAntigo])

    return { tipo: 'ok', path }
  } catch {
    return { tipo: 'erro', mensagem: 'Não consegui preparar a imagem. Tente outra foto.' }
  }
}

/* Remove a foto e limpa a referência. */
export async function removerAvatar(userId: string, path: string): Promise<ResultadoAvatar> {
  const { error } = await supabase.from('app_contas').update({ avatar_path: null }).eq('id', userId)
  if (error) return { tipo: 'erro', mensagem: 'Não consegui remover a foto agora.' }

  await supabase.storage.from(BUCKET).remove([path])
  return { tipo: 'ok', path: '' }
}
