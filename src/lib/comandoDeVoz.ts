import { semAcento } from './texto.ts'

/* O que a pessoa quer que aconteça, dito em voz alta no meio do treino.
 *
 * ── Por que toque-e-fala, e não escuta contínua ───────────────────────────
 * Mãos-livres de verdade exige reconhecimento de fala nativo — que não roda no
 * Expo Go, precisa de um build — e deixa o microfone aberto o treino inteiro,
 * o que come bateria e é uma promessa de privacidade difícil de manter.
 *
 * Toque-e-fala usa o Whisper que já está no app para o ditado: a pessoa toca,
 * fala uma frase curta, e solta. Não é mãos-livres, mas resolve o problema real
 * — mexer no telefone com a mão suada, no meio da série, para dizer uma coisa
 * de duas palavras.
 *
 * ── E por que a decisão mora aqui, e não na tela ─────────────────────────
 * Isto é texto vindo de fora, chegando torto: sotaque, ruído de academia,
 * palavra cortada. É exatamente o caso em que vale testar de verdade, e a tela
 * não dá para exercitar. Aqui não há import de runtime — só de `texto`, que
 * também é puro. */

export type Comando =
  | 'fiz'
  | 'pausar'
  | 'continuar'
  | 'mais_descanso'
  | 'menos_descanso'
  | 'pular_descanso'
  | 'terminar'

/* As frases, por comando.
 *
 * São FRAGMENTOS, e a comparação é por conter — não por igualdade. O Whisper
 * devolve a frase inteira com pontuação e às vezes com uma palavra a mais
 * ("ok, terminei essa aí"), e exigir a frase exata jogaria fora quase tudo.
 *
 * A ordem importa: `pular_descanso` é testado antes de `fiz` porque "pular" e
 * "já fiz" podem aparecer na mesma frase, e quem diz "pula o descanso" não
 * está pedindo para contar outra série. */
const FRASES: [Comando, string[]][] = [
  ['pular_descanso', ['pula', 'pular', 'sem descanso', 'ja to pronto', 'to pronto', 'proxima serie']],
  /* `espera` sozinho SAIU daqui.
     Ele casava com "espera aí", que é pedido de PAUSA e não de mais descanso —
     e como esta linha vem antes, "espera aí" virava mais 15 segundos. O teste
     pegou.
     A palavra é ambígua de verdade: durante o descanso ela quer mais tempo,
     durante a série quer parar. Resolver isso pelo estado do treino seria
     possível, e seria pior: a mesma frase faria coisas diferentes conforme o
     segundo em que foi dita, e ninguém consegue prever isso falando. Fica com
     o sentido único, e quem quer mais tempo diz "mais tempo". */
  ['mais_descanso', ['mais tempo', 'mais descanso', 'mais um pouco', 'aumenta']],
  ['menos_descanso', ['menos tempo', 'menos descanso', 'diminui', 'encurta']],
  ['pausar', ['pausa', 'pausar', 'para', 'parar', 'espera ai', 'segura']],
  ['continuar', ['continua', 'continuar', 'volta', 'voltar', 'retoma', 'bora', 'vamos']],
  [
    'terminar',
    ['terminar o treino', 'acabou o treino', 'encerrar', 'finalizar', 'chega por hoje', 'acabei o treino'],
  ],
  ['fiz', ['fiz', 'feito', 'terminei', 'acabei', 'pronto', 'completei', 'ok']],
]

/* Palavras que INVERTEM o pedido.
 *
 * "não pausa" e "ainda não terminei" carregam a palavra do comando e querem o
 * contrário. Sem isto, quem falasse "ainda não terminei" veria a série ser
 * contada — o pior erro possível aqui, porque ele entra no registro do treino
 * e ninguém confere depois. Na dúvida, não faz nada. */
const NEGACOES = ['nao ', 'ainda nao', 'nem ', 'para de', 'deixa pra la', 'esquece']

/* ── A PALAVRA-CHAVE, e o que ela faz e não faz ───────────────────────────
 *
 * Ela NÃO economiza chamada. Para saber que a pessoa disse "Cygnos" é preciso
 * transcrever primeiro — não há detecção de palavra sem passar pelo Whisper
 * aqui. Quem economiza é o filtro de duração, em `escutaContinua`.
 *
 * O que ela evita é AGIR por engano. Num modo mãos-livres dentro de uma
 * academia, o microfone ouve a conversa alheia inteira, e "terminei" dito por
 * outra pessoa contaria uma série que não aconteceu — que entra no histórico
 * do treino e ninguém confere depois.
 *
 * ── E o Whisper vai errar o nome ─────────────────────────────────────────
 * "Cygnos" não é palavra do dicionário, e transcrição devolve o que soa: signos,
 * cisnes, cignus, sygnos. Exigir a grafia certa faria a palavra-chave falhar
 * mais do que a conversa alheia acertar. A lista aceita o que SOA parecido. */
const CHAMADOS = ['cygnos', 'cignos', 'signos', 'cisnos', 'cisnes', 'cygnus', 'cignus', 'sygnos', 'signus']

export const temChamado = (bruto: string): boolean => {
  const t = semAcento(bruto)
  return CHAMADOS.some(c => t.includes(c))
}

/* Tira o chamado e o que vier grudado nele, para o resto ser lido como
   comando. "cygnos terminei" precisa virar "terminei". */
export const semChamado = (bruto: string): string => {
  let t = semAcento(bruto)
  for (const c of CHAMADOS) t = t.split(c).join(' ')
  return t.replace(/\s+/g, ' ').trim()
}

export function comandoDoTexto(bruto: string): Comando | null {
  const t = semAcento(bruto)
  if (!t) return null

  /* Negação em qualquer lugar da frase cancela tudo. É deliberadamente
     grosseiro: entender errado aqui custa uma série falsa no histórico, e não
     entender custa um toque a mais. */
  if (NEGACOES.some(n => t.includes(n))) return null

  for (const [comando, frases] of FRASES) {
    if (frases.some(f => t.includes(f))) return comando
  }
  return null
}

/* O que a tela mostra depois de ouvir.
 *
 * Confirmar em texto é obrigatório e não é enfeite: reconhecimento de fala erra,
 * e uma ação que acontece sem dizer o que entendeu deixa a pessoa sem saber se
 * a série foi contada. Ela precisa ver "contei a série" para poder desfazer se
 * não era isso. */
export const RESPOSTA: Record<Comando, string> = {
  fiz: 'Contei a série',
  pausar: 'Pausado',
  continuar: 'Voltando',
  mais_descanso: 'Mais 15 segundos de descanso',
  menos_descanso: 'Menos 15 segundos de descanso',
  pular_descanso: 'Descanso encerrado',
  terminar: 'Encerrando o treino',
}

/* O que dizer quando não deu para entender.
 *
 * Repete o que OUVIU, e não só "não entendi": quem falou "terminei" e viu
 * "tá bem" na tela descobre que o problema é o microfone, e não a frase. Sem
 * isso a pessoa repete a mesma palavra três vezes achando que falou baixo. */
export const naoEntendi = (ouvido: string): string =>
  ouvido.trim() ? `Ouvi "${ouvido.trim()}", e não sei o que fazer com isso.` : 'Não ouvi nada.'
