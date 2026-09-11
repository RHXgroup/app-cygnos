/* As decisões do ditado que ouve pelo próprio celular.
 *
 * ──────────────────── Por que separado ────────────────────
 * O que fala com o aparelho mora em `ditadoNoAparelho.ts`, e aquele arquivo não
 * roda no Node -- importa o módulo nativo. Aqui fica o que DECIDE, e é o que
 * erra: como os pedaços de fala se juntam, o que cada erro do reconhecedor quer
 * dizer para quem está falando, e se o português está instalado.
 *
 * Nada aqui importa nada em tempo de execução. Armadilha 16 do AGENTS. */

/* ──────────────────── 1. OS PEDAÇOS DE FALA ────────────────────
 *
 * Com a escuta contínua, o Android entrega a fala em TRECHOS: cada pausa fecha
 * um trecho (`isFinal`), e o seguinte começa do zero. Enquanto um trecho está
 * aberto, chegam versões parciais dele, cada uma substituindo a anterior.
 *
 * O texto que aparece no campo é: os trechos fechados, em ordem, mais o parcial
 * do trecho aberto. Juntar errado aqui dá os dois defeitos mais visíveis que um
 * ditado ao vivo pode ter -- a frase repetida ("marca um lembrete marca um
 * lembrete pras oito") ou a frase que some quando ela respira.
 *
 * E há reconhecedor que devolve no parcial o texto INTEIRO desde o começo, e
 * não só o trecho aberto. Não dá para saber de antemão qual dos dois o celular
 * dela tem, então a junção aceita os dois: se o parcial já começa com o que foi
 * fechado, ele é o texto todo e não se soma nada. */
export function juntarFalas(fechados: string[], parcial: string): string {
  const antes = fechados.map(f => f.trim()).filter(Boolean).join(' ')
  const agora = (parcial ?? '').trim()

  if (!agora) return antes
  if (!antes) return agora

  /* O reconhecedor que repete tudo: o parcial já contém os fechados. Comparado
     sem caixa e sem pontuação, porque o parcial às vezes chega com a
     pontuação que o trecho fechado ainda não tinha. */
  const chave = (s: string) => s.toLowerCase().replace(/[.,;:!?]/g, '').replace(/\s+/g, ' ').trim()
  if (chave(agora).startsWith(chave(antes))) return agora

  return antes + ' ' + agora
}

/* ──────────────────── 2. O QUE CADA ERRO QUER DIZER ────────────────────
 *
 * O reconhecedor fala em código ("no-speech", "language-not-supported"), e
 * cada código pede uma reação DIFERENTE da tela -- não só uma frase diferente:
 *
 *   'silencio'     -- ela apertou e não falou, ou falou longe. Mesma tela do
 *                     "não ouvi nada" de sempre: tentar de novo.
 *   'reserva'      -- este celular não consegue ouvir sozinho em português. Não
 *                     é erro dela, e a frase não pode parecer que é: a tela
 *                     volta para o jeito antigo (gravar e mandar para o
 *                     servidor), sem fazer alarde.
 *   'parou'        -- ela mesma cancelou. Nada a dizer.
 *   'erro'         -- o resto, com uma frase.
 *
 * Função com genérico de reserva, e nunca `Record[codigo]`: um código novo que
 * a biblioteca passe a mandar não pode derrubar a barra de escrever no meio de
 * uma frase. Armadilha 10. */
export type DesfechoDoErro =
  | { tipo: 'silencio' }
  | { tipo: 'reserva' }
  | { tipo: 'parou' }
  | { tipo: 'erro'; mensagem: string }

export function desfechoDoErro(codigo: unknown): DesfechoDoErro {
  switch (String(codigo ?? '')) {
    case 'no-speech':
    case 'speech-timeout':
      return { tipo: 'silencio' }

    /* Tudo o que quer dizer "este aparelho não ouve sozinho". Com
       `requiresOnDeviceRecognition`, 'network' só aparece se o celular tentou
       usar a rede -- e a rede está proibida de propósito, então é o mesmo caso:
       volta para o servidor próprio, e NUNCA para o Google. */
    case 'language-not-supported':
    case 'service-not-allowed':
    case 'network':
      return { tipo: 'reserva' }

    case 'aborted':
      return { tipo: 'parou' }

    case 'not-allowed':
      return {
        tipo: 'erro',
        mensagem:
          'O Cygnos não tem permissão para usar o microfone. Libere nas ' +
          'configurações do celular e tente de novo.',
      }

    case 'busy':
      return {
        tipo: 'erro',
        mensagem: 'O microfone está ocupado com outro aplicativo. Tente de novo em um instante.',
      }

    case 'audio-capture':
      return {
        tipo: 'erro',
        mensagem: 'Não consegui usar o microfone agora. Tente de novo.',
      }

    default:
      return { tipo: 'erro', mensagem: 'Não consegui ouvir agora. Tente de novo.' }
  }
}

/* ──────────────────── 3. O PORTUGUÊS ESTÁ NO CELULAR? ────────────────────
 *
 * Com a rede proibida, o reconhecedor só funciona se o modelo de português
 * estiver BAIXADO no aparelho. A lista de idiomas instalados chega em formatos
 * diferentes conforme o fabricante -- "pt-BR", "pt_BR", "pt-br", às vezes só
 * "pt" --, e comparar com uma forma só faria um celular com português
 * instalado passar por um sem.
 *
 * Português de Portugal também serve. Transcreve pior o nosso sotaque, mas
 * transcreve -- e ouvir em pt-PT no aparelho é melhor do que mandar para um
 * servidor que leva 20 segundos. */
export function temPortugues(instalados: unknown): boolean {
  if (!Array.isArray(instalados)) return false
  return instalados.some(l => /^pt([-_]|$)/i.test(String(l ?? '').trim()))
}

/* ──────────────────── 4. AS PALAVRAS QUE ELE NÃO CONHECE ────────────────────
 *
 * `contextualStrings` puxa o reconhecedor para palavras que ele não esperaria.
 * É o equivalente, aqui, do `initial_prompt` do Whisper -- com uma diferença que
 * importa: aqui é LISTA DE PALAVRAS, e não texto que ele continua. Não há como
 * ele devolver uma frase inteira desta lista como se ela tivesse falado, que
 * foi o defeito do eco do outro lado.
 *
 * Nomes de paciente NÃO entram, pelo mesmo motivo escrito no servidor: a lista
 * de nomes é da carteira dela e não passeia por uma função de áudio. Aqui seria
 * até permitido -- o áudio não sai do celular --, mas o componente que ouve não
 * conhece a carteira, e fazer ele conhecer para melhorar transcrição é trazer
 * dado de saúde para onde ele não precisa estar. */
export const PALAVRAS_DA_NUTRI = [
  'Cygnos',
  'Aurora',
  'remarca',
  'reagenda',
  'cancela',
  'confirma',
  'agenda',
  'lembrete',
  'me lembra',
  'avisa',
  'recado',
  'retorno',
  'anamnese',
  'plano alimentar',
  'plano terapêutico',
  'despesa',
  'a receber',
  'a pagar',
]
