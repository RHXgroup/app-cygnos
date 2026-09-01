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
    /* `fetch` no `file://` é como o ditado lê o que acabou de gravar — não há
       `expo-file-system` no projeto, e não vale trazer um pacote nativo para
       uma leitura que já funciona. */
    const dados = await (await fetch(uri)).arrayBuffer()

    /* Zero byte é gravação que não pegou, e subir isso produz um balão que
       ninguém consegue tocar — pior que a falha, porque parece sucesso. */
    if (dados.byteLength === 0) {
      falha('A gravação saiu vazia.', new Error('arquivo de 0 byte em ' + uri))
      return null
    }

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
