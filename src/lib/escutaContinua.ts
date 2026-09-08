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

/* O piso do PISO. Abaixo disto o ambiente não desce, por mais silêncio que o
 * medidor relate.
 *
 * ── O que este número impede ─────────────────────────────────────────────
 * Lido no log do aparelho, com o treino aberto:
 *
 *     -33.2 dB · limiar  -89.6      (o piso vinha subindo, certo)
 *     fala ACABOU com 6.0 s
 *     fala COMEÇOU
 *   -160.0 dB · limiar -124.4      (despencou 35 dB de uma vez)
 *
 * `-160` não é medição: é o valor que o Android devolve quando não há sinal
 * nenhum. E a adaptação desce RÁPIDO de propósito — 30% num passo —, então uma
 * única leitura dessas arrastava o piso para o fundo. Ele nunca convergia: subia
 * devagar durante a fala, e o primeiro silêncio o jogava de volta.
 *
 * Com o piso em -124, o limiar fica em -112 e TUDO conta como fala. A escuta
 * nunca vê silêncio, nunca fecha trecho, e a única saída é o teto — que é
 * descartado. Nada nunca é enviado.
 *
 * ── Por que -65, e não -160 ──────────────────────────────────────────────
 * Nenhum cômodo do mundo tem ruído de fundo de -160 dBFS. Sala silenciosa dá
 * -60 a -40 no microfone de um celular; fala perto do aparelho, -30 a -5. Um
 * piso em -65 põe o limiar em -53: acima do silêncio de qualquer lugar real, e
 * abaixo de qualquer fala.
 *
 * E o -160 continua sendo ÓTIMA informação — só não como piso. Ele fica bem
 * abaixo do limiar, então conta como silêncio, que é exatamente o que ele é. É
 * o silêncio que FECHA o trecho e faz o comando ser enviado. */
export const PISO_MINIMO = -65

/* Menos que isto não é frase, é batida de peso no chão ou tosse. */
export const MINIMO_DE_FALA_MS = 350

/* Silêncio que fecha o trecho. Meio segundo é o intervalo entre palavras de
   quem fala pausado; 700 ms já é fim de frase para quase todo mundo, e esperar
   mais só atrasa a resposta do app. */
export const SILENCIO_QUE_FECHA_MS = 700

/* Teto por trecho. Alguém que fala sem parar — ou uma televisão ligada perto —
   não pode gerar um arquivo de dois minutos: corta e recomeça ouvindo.

   ── 6 s, e não 12 ────────────────────────────────────────────────────────
   Fotografado no aparelho: `-12 dB · limiar -84`. Setenta e dois decibéis de
   folga, ou seja, TUDO contava como fala — a escuta nunca via silêncio, nunca
   fechava trecho, e a única saída era o teto.

   E o teto não salvava, porque quem o recebe descarta acima de 5 s
   (`COMANDO_LONGO_DEMAIS_S`, em `ModoTreino`). Com 12 aqui e 5 lá, o corte no
   teto produzia SEMPRE um trecho jogado fora. Nada nunca era enviado, e a tela
   ficava eternamente "gravando" — que foi exatamente o relato: "só fica assim e
   nunca inicia".

   Continua acima dos 5 de propósito: seis segundos de som contínuo não são um
   comando de duas palavras, e mandá-los gastaria chamada para receber lixo. O
   que o teto faz agora é RECALIBRAR (ver `ouvir`), e seis em vez de doze é
   metade do tempo até a escuta voltar a funcionar. */

/* ── E depois virou 4, por causa da ESPERA ────────────────────────────────
   Relatado com o recurso ja funcionando: "ele funcionou, porem ele ta lento".

   Lido no log, no ambiente de quem usa: TODO trecho fecha no teto -- o nivel
   nunca fica abaixo do limiar por 700 ms seguidos. Entao o teto nao e o caso
   raro que ele foi desenhado para ser: e o caminho NORMAL, e cada comando
   custava seis segundos de espera antes mesmo de o audio sair do aparelho.

   Um comando de duas palavras dura um segundo e meio. Quatro segundos cobrem
   "Cygnos, iniciar a serie" dito devagar, com folga, e cortam um terco da
   espera. Menos que isso comecaria a partir frase no meio, que e o erro caro do
   outro lado -- e o caso "nao corta no meio" continua no teste para provar que
   nao. */
/* ── E depois virou 2,8, pela mesma razão de novo ───────────
   Relatado: "ele ta demorandoooo muitoo muito para iniciar, repeti umas 4
   vezes". Quatro segundos de teto mais a rede e o Whisper dão seis ou sete
   por tentativa — e quem espera sete segundos sem resposta repete, o que
   piora tudo: cada repetição vira outro trecho para transcrever.

   "Cygnos, terminei a série" dito devagar dura menos de dois segundos. 2,8
   cobre isso com folga e devolve mais de um segundo por comando.

   Este número é CALIBRAÇÃO, e não dedução: se começar a
   cortar comando no meio — o sintoma é o app entender metade da frase,
   ou não entender nada de uma frase inteira — ele sobe de volta. O caso
   "não corta no meio" continua no teste para essa fronteira não ser
   cruzada sem alguem ver. */
/* ── E agora 2,4, que é o CHÃO MEDIDO ──────────────────
   Pedido: baixar para 2 s. Tentei, e o TESTE recusou — dois casos, e os
   dois são exatamente a fronteira que eles existem para guardar: "não corta
   no meio" (uma frase com pausa curta passou a ser partida em duas) e "fecha
   por silêncio, e não pelo teto" (o teto passou a disparar antes de a
   escuta perceber que a pessoa parou de falar).

   Bissetei: 2000 reprova três casos, 2200 reprova dois, 2400 passa. Então
   2,4 s é o chão de verdade, e não um número escolhido por gosto.
   Abaixo dele o sintoma deixa de ser lentidão e passa a ser COMANDO QUE
   SOME, que é muito pior: quem espera demais repete, quem fala e some
   conclui que a voz quebrou.

   O que sobrou de espera aqui é isto mais a transcrição. Rede e TLS
   até o servidor dão ≈0,45 s, medido de fora em seis amostras; o resto
   é o modelo, e ele não está ao alcance deste arquivo.

   Daqui para baixo não há mais o que espremer. O próximo ganho de
   verdade é reconhecimento DENTRO do aparelho — resposta em menos de um
   segundo, sem rede —, e ele exige um build de verdade, porque no Expo Go
   não entra módulo nativo. */
export const MAXIMO_DO_TRECHO_MS = 2_400

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
  const aprendido =
    nivel < estado.ambiente
      ? estado.ambiente * 0.7 + nivel * 0.3
      : estado.ambiente * 0.995 + nivel * 0.005

  /* O piso não desce abaixo do que existe no mundo — ver `PISO_MINIMO`. Sem
     esta linha, uma leitura de "sem sinal" derruba o limiar e a escuta passa a
     achar que tudo é fala. */
  const ambiente = Math.max(aprendido, PISO_MINIMO)

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
    /* ── BATER NO TETO É PROVA DE QUE O LIMIAR ESTÁ ERRADO ───────────────
     *
     * Ninguém diz um comando de duas palavras durante seis segundos seguidos.
     * Chegar aqui quer dizer quase sempre a mesma coisa: o piso de ruído ficou
     * abaixo do que o microfone realmente entrega, e por isso TUDO conta como
     * fala.
     *
     * Fotografado: piso em -96 e nível em -12. A adaptação normal não resgata
     * isso a tempo — ela sobe 0,5% por leitura, e sair de -96 para perto de -12
     * levaria centenas de leituras, todas dentro de um trecho que nunca fecha.
     *
     * Então o teto puxa o piso METADE do caminho até o nível de agora.
     *
     * Metade, e não o nível inteiro: ancorar em `nivel` deixaria o limiar
     * `nivel + 12`, ou seja, DOZE DECIBÉIS ACIMA do que se acabou de ouvir — e
     * a próxima fala, no mesmo volume, não seria ouvida. O teste pegou isso na
     * primeira tentativa, com o limiar em -3 contra fala a -15.
     *
     * Pela metade, o piso converge: -96 vira -54, depois -33, depois -22, e em
     * três tetos (dezoito segundos) o limiar passa do nível e a escuta volta a
     * enxergar silêncio. Lento o bastante para não cegar uma frase longa de
     * verdade, rápido o bastante para não precisar fechar o app.
     *
     * É a única saída que se conserta sozinha: sem ela, um piso afundado
     * deixava a escuta inútil até alguém fechar o app.
     *
     * O trecho em si continua sendo descartado por duração de quem chama — seis
     * segundos de som contínuo não são um comando, e mandá-los gastaria chamada
     * para receber lixo. */
    return {
      estado: {
        falando: false,
        comecouEm: null,
        silencioDesde: null,
        ambiente: (estado.ambiente + nivel) / 2,
      },
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
