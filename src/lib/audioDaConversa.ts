import { File } from 'expo-file-system'
import { falha } from './erros'
import { supabase } from './supabase'

/* O áudio da conversa, guardado.
 *
 * ── Por que áudio, e não "escreva aí" ─────────────────────────────────────
 * É justamente quem tem mais dificuldade de escrever que mais precisa falar
 * com a nutricionista. O Dietbox aceita áudio na conversa; nós aceitávamos só
 * texto, e a coluna `anexo_tipo` já previa `'audio'` desde o primeiro dia —
 * faltava o app.
 *
 * ── O bucket é o mesmo da foto, de propósito ──────────────────────────────
 * `fotos-diario`. Mesma dona, mesmo leitor, mesmas políticas — a pasta da
 * conta é a primeira parte do caminho, e é por ela que o storage decide.
 *
 * E tem a razão que pesa mais: a exclusão de conta limpa a pasta da pessoa
 * NESSE bucket. Um bucket novo nasceria fora daquela limpeza, e o áudio
 * sobreviveria ao pedido de exclusão — o mesmo furo que acabou de ser fechado,
 * recriado logo em seguida.
 *
 * ── O formato sai do arquivo, não de uma constante ────────────────────────
 * Quem decide a extensão é o preset de gravação, por plataforma: `.m4a` no
 * Android, `.aac` no iOS. Um `contentType` mentindo sobre o conteúdo faz o
 * tocador escolher o leitor errado, e o sintoma disso é silêncio — que se
 * confunde com gravação muda, com arquivo vazio e com upload que não anexou.
 * Três defeitos diferentes com a mesma cara. */

const BUCKET = 'fotos-diario'

/* Um minuto, e o mesmo número do ditado — mas NÃO a mesma decisão.
 *
 * O do ditado existe porque ninguém dita uma refeição em mais que isso. Este
 * existe para o recado caber no que a nutricionista consegue ouvir entre
 * atendimentos: áudio de cinco minutos não é respondido, fica para depois, e
 * "depois" é quando a pessoa já desistiu de esperar.
 *
 * Por isso são duas constantes e não uma importada da outra: no dia em que o
 * ditado aceitar dois minutos, o recado não deve mudar junto sem que alguém
 * tenha decidido isso.
 *
 * E o NOME diz "recado" em vez de repetir `LIMITE_SEGUNDOS`, que é como se
 * chama o do ditado. Os dois são segundos, os dois são `number`, e trocar um
 * pelo outro compilaria — que foi exatamente o defeito dos dois `relogio`
 * (armadilha 5). Nome igual para decisões diferentes é a mesma armadilha pelo
 * outro lado. */
export const LIMITE_DO_RECADO = 60

/* Abaixo disso é toque sem querer, e não recado. Mandar meio segundo de
   silêncio gasta a atenção dela à toa. */
export const MINIMO_DO_RECADO = 1

const nomeUnico = (extensao: string) =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.${extensao}`

/* Sobe o arquivo gravado e devolve o CAMINHO, ou null.
 *
 * Null, e nunca uma rejeição: item 11 do AGENTS. Esta função alimenta a barra
 * de escrever, e uma rejeição não tratada por falta de sinal derrubaria a
 * conversa inteira — a tela em que a pessoa está esperando resposta de gente.
 * Quem decide o que fazer com a ausência é a tela, que continua deixando
 * escrever.
 *
 * O caminho começa em `contaId` porque é o que o servidor confere quando a
 * mensagem nasce: `app_enviar_mensagem` recusa caminho que não comece na pasta
 * de quem chamou. Sem isso, alguém chamando a função direto apontaria a
 * mensagem para o arquivo de outra conta e faria a própria nutricionista abrir
 * a gravação de um terceiro. */
/* ── TRÊS causas, e uma frase só era o problema ────────────────────────────
 *
 * Falhava em três lugares — ler o arquivo, o arquivo sair vazio, o servidor
 * recusar — e os três produziam "Não consegui preparar o áudio". Quem testou
 * não tinha como dizer qual foi, e eu não tinha como consertar sem adivinhar.
 *
 * Agora cada uma tem a sua frase. Continuam todas em português e sem jargão: a
 * diferença é útil para quem lê TAMBÉM, porque "a gravação saiu sem som" e "o
 * servidor não aceitou" pedem coisas diferentes de quem está com o telefone na
 * mão. */
export type ResultadoDoAudio =
  | { tipo: 'ok'; caminho: string }
  | { tipo: 'erro'; mensagem: string }

export async function guardarAudioDaConversa(
  contaId: string,
  uri: string,
): Promise<ResultadoDoAudio> {
  if (!contaId || !uri)
    return { tipo: 'erro', mensagem: 'A gravação não chegou até aqui. Tente gravar de novo.' }

  const aac = uri.toLowerCase().endsWith('.aac')
  const agora = new Date()
  const anoMes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`
  const caminho = `${contaId}/${anoMes}/${nomeUnico(aac ? 'aac' : 'm4a')}`

  try {
    /* ── Por que NAO e fetch, e por que a versao anterior parecia certa ──
     *
     * Estava assim: `fetch(uri).blob()`, depois `FileReader` para base64,
     * depois `decode` para bytes. Tres travessias para ler um arquivo que ja
     * esta no aparelho, e um comentario meu explicando que `arrayBuffer()` do
     * fetch nao servia -- o que era verdade quando foi escrito.
     *
     * O projeto esta no SDK 57, e o SDK 57 troca o `fetch` global pelo fetch da
     * Expo. Ele segue o padrao da web, e o padrao da web nao diz nada sobre
     * `file://`. Sobre um arquivo local ele nao levanta erro: devolve algo
     * vazio. E vazio, aqui, atravessava tudo -- `FileReader` lia zero, o
     * base64 saia vazio, e a pessoa recebia "a gravacao saiu sem som" logo
     * depois de falar. O microfone estava certo; a leitura e que nao era.
     *
     * `new File(uri).arrayBuffer()` e a leitura nativa do proprio Expo, e o
     * supabase-js aceita `ArrayBuffer` direto. Some o fetch, some o Blob, some
     * o FileReader e some o base64 -- que ainda por cima era 33% maior que o
     * arquivo, sem nenhuma razao para existir no meio do caminho. */
    const arquivo = new File(uri)

    if (!arquivo.exists) {
      falha('A gravacao nao existe no aparelho.', new Error(uri))
      return {
        tipo: 'erro',
        mensagem: 'Nao consegui achar a gravacao no aparelho. Tente gravar de novo.',
      }
    }

    const dados = await arquivo.arrayBuffer()

    /* O tamanho vai para o terminal do Metro com o prefixo [cygnos]. Sem o
       numero, "nao deu" pode ser microfone mudo, arquivo vazio ou upload
       recusado, e os tres tem a mesma cara na tela. Foi a AUSENCIA deste
       numero que deixou o defeito do fetch passar por gravacao muda. */
    console.log('[cygnos] audio da conversa:', dados.byteLength, 'bytes')

    /* Gravacao que nao pegou. Subir isso produz um balao que ninguem consegue
       tocar -- pior que a falha, porque parece sucesso. */
    if (dados.byteLength === 0) {
      falha('A gravacao saiu vazia.', new Error('0 byte em ' + uri))
      return {
        tipo: 'erro',
        mensagem: 'A gravacao saiu sem som. Verifique se algum outro aplicativo esta usando o microfone.',
      }
    }

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(caminho, dados, { contentType: aac ? 'audio/aac' : 'audio/m4a' })

    if (error) {
      falha('Não consegui guardar o áudio.', error)
      return {
        tipo: 'erro',
        /* O servidor recusou. A causa mais provável é o balde não aceitar o
           tipo do arquivo — ele foi criado pelo painel, para foto, e pode ter
           lista de tipos permitidos. O texto cru está no console. */
        mensagem: 'O servidor não aceitou o áudio. Me avise que isso é configuração, não o seu aparelho.',
      }
    }
    return { tipo: 'ok', caminho }
  } catch (e) {
    falha('Não consegui preparar o áudio.', e)
    return {
      tipo: 'erro',
      mensagem: 'Não consegui ler a gravação do aparelho. Tente gravar de novo.',
    }
  }
}
