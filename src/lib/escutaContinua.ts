/* Quando cortar o que a pessoa falou, sem ela tocar em nada.
 *
 * ── O problema ────────────────────────────────────────────────────────────
 * Mãos livres de verdade quer o microfone aberto o treino inteiro. Mas mandar
 * TUDO para transcrever seria absurdo em duas frentes: custo — uma chamada paga
 * a cada poucos segundos, durante uma hora — e ruído: academia tem música,
 * conversa alheia e barulho de ferro, e cada pedaço disso voltaria como uma
 * frase inventada que o app tentaria obedecer.
 *
 * ── O que resolve ─────────────────────────────────────────────────────────
 * O gravador entrega o NÍVEL do som a cada leitura (`metering`, em decibéis
 * negativos: -160 é silêncio absoluto, 0 é o máximo). Dá para acompanhar esse
 * número e mandar só o trecho em que houve fala: começa quando o nível sobe,
 * termina quando volta ao silêncio e fica lá.
 *
 * Isso é reconhecimento de ATIVIDADE de voz, e não de fala — ele não sabe o que
 * foi dito, só que alguém falou. Quem diz o que foi é o Whisper, depois, e só
 * sobre o pedaço que interessa.
 *
 * ── Por que é uma lib, e pura ────────────────────────────────────────────
 * Porque é aqui que mora o erro caro. Cortar cedo demais parte a frase no meio
 * ("termi—"), e cortar tarde demais gasta chamada com silêncio. Os números
 * abaixo têm de poder ser exercitados com séries inventadas, e a tela não dá
 * para exercitar. Nenhum import: nem de runtime, nem de outra lib. */

/* Acima disto é fala. Ambiente de academia fica por volta de -45 a -35 dB com
   música; uma pessoa falando perto do telefone passa de -25. O limiar precisa
   ficar acima do ambiente e abaixo da fala — e por isso ele é RELATIVO ao que
   se ouviu antes, e não um número fixo. Ver `limiarDe`. */
export const MARGEM_ACIMA_DO_AMBIENTE = 12

/* Menos que isto não é frase, é batida de peso no chão ou tosse. */
export const MINIMO_DE_FALA_MS = 350

/* Silêncio que fecha o trecho. Meio segundo é o intervalo entre palavras de
   quem fala pausado; 700 ms já é fim de frase para quase todo mundo, e esperar
   mais só atrasa a resposta do app. */
export const SILENCIO_QUE_FECHA_MS = 700

/* Teto por trecho. Alguém que fala sem parar — ou uma televisão ligada perto —
   não pode gerar um arquivo de dois minutos: corta, manda o que tem, e recomeça
   ouvindo. */
export const MAXIMO_DO_TRECHO_MS = 12_000

export type Estado = {
  /* Se estamos dentro de um trecho de fala. */
  falando: boolean
  /* Quando o trecho atual começou, em ms do relógio do aparelho. */
  comecouEm: number | null
  /* Quando o silêncio atual começou. Nulo enquanto há som. */
  silencioDesde: number | null
  /* A média do que se ouviu quando ninguém falava. É ela que faz o limiar se
     adaptar à academia barulhenta e à sala silenciosa sem ninguém configurar
     nada. */
  ambiente: number
}

export const ESTADO_INICIAL: Estado = {
  falando: false,
  comecouEm: null,
  silencioDesde: null,
  /* Começa pessimista: -50 é sala silenciosa. Sobe sozinho nas primeiras
     leituras se o lugar for barulhento. */
  ambiente: -50,
}

export type Decisao = 'nada' | 'comecou' | 'terminou' | 'cortar_no_teto'

export const limiarDe = (ambiente: number): number => ambiente + MARGEM_ACIMA_DO_AMBIENTE

/* Uma leitura do medidor. Devolve o estado novo e o que fazer.
 *
 * `nivel` pode vir indefinido: nem todo aparelho entrega medição em toda
 * leitura, e uma leitura sem número não pode nem abrir nem fechar trecho — ela
 * simplesmente não conta. */
export function ouvir(
  estado: Estado,
  nivel: number | undefined | null,
  agora: number,
): { estado: Estado; decisao: Decisao } {
  if (nivel === undefined || nivel === null || !Number.isFinite(nivel)) {
    return { estado, decisao: 'nada' }
  }

  const limiar = limiarDe(estado.ambiente)
  const temSom = nivel > limiar

  /* O ambiente DESCE rápido e SOBE devagar.
   *
   * A primeira versão só aprendia com o silêncio — e não conseguia sair do
   * lugar numa academia barulhenta: o ambiente nascia em -50, o barulho
   * constante de -30 ficava acima do limiar, era tratado como fala o tempo
   * todo, e por isso nunca contava como silêncio para o ambiente aprender. O
   * teste pegou: vinte leituras seguidas a -30 dB deixavam o ambiente em -50.
   *
   * Descer rápido é o que faz o app reagir quando a pessoa sai do ginásio para
   * o corredor. Subir MUITO devagar (0,5% por leitura) é o que impede a voz
   * dela de virar o novo normal: uma frase de dois segundos são ~20 leituras e
   * move o ambiente em menos de 1 dB, enquanto barulho constante de um minuto
   * move o suficiente. */
  const ambiente =
    nivel < estado.ambiente
      ? estado.ambiente * 0.7 + nivel * 0.3
      : estado.ambiente * 0.995 + nivel * 0.005

  if (!estado.falando) {
    if (!temSom) return { estado: { ...estado, ambiente }, decisao: 'nada' }
    return {
      estado: { falando: true, comecouEm: agora, silencioDesde: null, ambiente },
      decisao: 'comecou',
    }
  }

  /* Dentro de um trecho. */
  const desdeOComeco = agora - (estado.comecouEm ?? agora)

  if (desdeOComeco >= MAXIMO_DO_TRECHO_MS) {
    return {
      estado: { falando: false, comecouEm: null, silencioDesde: null, ambiente },
      decisao: 'cortar_no_teto',
    }
  }

  if (temSom) {
    return { estado: { ...estado, silencioDesde: null, ambiente }, decisao: 'nada' }
  }

  const silencioDesde = estado.silencioDesde ?? agora
  if (agora - silencioDesde < SILENCIO_QUE_FECHA_MS) {
    return { estado: { ...estado, silencioDesde, ambiente }, decisao: 'nada' }
  }

  /* Silêncio suficiente: fecha. Mas só vale como fala se durou o mínimo —
     senão foi ruído curto, e o trecho é descartado sem gastar chamada. */
  const durou = silencioDesde - (estado.comecouEm ?? silencioDesde)
  return {
    estado: { falando: false, comecouEm: null, silencioDesde: null, ambiente },
    decisao: durou >= MINIMO_DE_FALA_MS ? 'terminou' : 'nada',
  }
}
