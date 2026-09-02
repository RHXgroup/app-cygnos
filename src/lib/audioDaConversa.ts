import { decode } from 'base64-arraybuffer'
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
export async function guardarAudioDaConversa(
  contaId: string,
  uri: string,
): Promise<string | null> {
  if (!contaId || !uri) return null

  const aac = uri.toLowerCase().endsWith('.aac')
  const agora = new Date()
  const anoMes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`
  const caminho = `${contaId}/${anoMes}/${nomeUnico(aac ? 'aac' : 'm4a')}`

  try {
    /* ── O caminho de leitura, que erra se for o óbvio ────────────────────
     *
     * `fetch(uri).arrayBuffer()` é o que se escreveria em qualquer navegador,
     * e no React Native ele NÃO serve: o `fetch` daqui é polyfill, e sobre um
     * `file://` ou devolve vazio ou rejeita. O sintoma no aparelho foi "não
     * consegui preparar o áudio" logo depois de gravar, sem erro nenhum antes.
     *
     * O caminho que funciona é o mesmo da foto do prato, que já roda há meses:
     * base64 → `decode` → bytes. `FileReader` é a única leitura de arquivo
     * disponível sem trazer pacote nativo, e o `blob()` do `fetch` ele lê. */
    const blob = await (await fetch(uri)).blob()

    const base64 = await new Promise<string>((resolve, reject) => {
      const leitor = new FileReader()
      leitor.onerror = () => reject(leitor.error ?? new Error('FileReader falhou'))
      leitor.onload = () => {
        /* Vem como `data:audio/m4a;base64,AAAA…` — só o que está depois da
           vírgula é o conteúdo. */
        const texto = String(leitor.result ?? '')
        const virgula = texto.indexOf(',')
        resolve(virgula === -1 ? '' : texto.slice(virgula + 1))
      }
      leitor.readAsDataURL(blob)
    })

    /* Gravação que não pegou. Subir isso produz um balão que ninguém consegue
       tocar — pior que a falha, porque parece sucesso.
       O tamanho vai para o terminal do Metro com o prefixo [cygnos], como no
       ditado: sem o número, "não deu" pode ser microfone mudo, arquivo vazio
       ou upload recusado, e os três têm a mesma cara na tela. */
    console.log('[cygnos] áudio da conversa:', blob.size, 'bytes,', base64.length, 'em base64')
    if (!base64) {
      falha('A gravação saiu vazia.', new Error('0 byte em ' + uri))
      return null
    }

    const dados = decode(base64)

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(caminho, dados, { contentType: aac ? 'audio/aac' : 'audio/m4a' })

    if (error) {
      falha('Não consegui guardar o áudio.', error)
      return null
    }
    return caminho
  } catch (e) {
    falha('Não consegui preparar o áudio.', e)
    return null
  }
}
