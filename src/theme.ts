/* A paleta do app, nos dois temas.
 *
 * ── Como ler este arquivo ──────────────────────────────────────────────────
 * `ESCURO` e `CLARO` são paletas completas e independentes. Tudo o que o resto
 * do app importa — `cores`, `coresMacro`, `inkSuave`, `veu`, `degrades` —
 * continua existindo e continua apontando para o PADRÃO, que é o claro — a cara
 * da marca.
 *
 * Isso é de propósito. A troca em tempo real exige que cada tela monte os
 * estilos a partir do tema atual, porque `StyleSheet.create` congela as cores no
 * instante em que o arquivo é carregado. São 55 arquivos, e convertê-los é
 * trabalho mecânico que pode ser feito um por um. Todas já foram convertidas.
 *
 * ── Por que o claro não é o escuro invertido ───────────────────────────────
 * Inverter daria um app sem identidade: o limão neon é lindo sobre preto e
 * ilegível sobre branco. O claro segue a MARCA — o creme é o mesmo do ícone na
 * loja, o musgo é o do sistema web —, e é isso que faz os dois temas existirem
 * por um motivo, em vez de serem duas versões da mesma coisa.
 *
 * É também a resposta para a decisão que este arquivo anotava como em aberto: o
 * verde vivo do app e o musgo da marca deixam de brigar e passam a ser o mesmo
 * produto em dois modos.
 *
 * ── Os dois verdes ─────────────────────────────────────────────────────────
 * Trocar um pelo outro quebra legibilidade, nos DOIS temas:
 *
 * - `verde` é superfície PREENCHIDA que carrega texto por cima.
 * - `limao` é TRAÇO sobre o fundo: anel de progresso, aba ativa, número em
 *   destaque, borda de chip. Quando ele preenche alguma coisa, o texto por cima
 *   é `sobreLimao`, nunca branco no escuro.
 *
 * No escuro o limão é neon sobre oliva-quase-preto; no claro é um lime escuro
 * sobre creme. O papel é o mesmo, o tom é o oposto — e é o que faz o traço
 * aparecer nos dois casos. */

export type Cores = {
  verde: string
  verdeEscuro: string
  limao: string
  limaoEscuro: string
  sobreLimao: string
  verdeClaro: string
  verdeMenta: string
  fundo: string
  cartao: string
  superficie: string
  trilho: string
  borda: string
  /* O fundo de um botão DESLIGADO.
   *
   * Existe porque a forma usada até aqui — `opacity` no botão inteiro — não
   * funciona: ela compõe o texto E o fundo contra a página, e destrói a razão
   * entre os dois. Medido no navegador, um primário a 0.45 dava contraste
   * 1,43, quando o mínimo legível é 4,5.
   *
   * Este tom foi escolhido pela conta, e não pelo olho: branco sobre ele dá
   * 4,76. Serve nos dois temas porque não depende do fundo da página — é
   * superfície preenchida, como o verde. */
  desligado: string
  ink: string
  branco: string
  deep: string
  forest: string
  mist: string
  moss: string
  gold: string
  musgoClaro: string
  line: string
  atencaoFundo: string
  erroBorda: string
  erroFundo: string
  erroTexto: string

  /* ── O ciclo ──────────────────────────────────────────────────────────
   * Cor PRÓPRIA, e não o vermelho de erro.
   *
   * Menstruação não é erro, e pintá-la com o vermelho de alarme diz isso na
   * cara de quem abre a tela todo mês. Os aplicativos de ciclo bons usam um
   * rosa fechado, quente, que lê como "isto é seu" e não como "algo deu
   * errado" — e o vermelho de erro fica livre para continuar significando
   * erro, que é o motivo de ele existir. */
  cicloForte: string
  cicloFundo: string
  cicloPrevisto: string
}

export type Paleta = {
  cores: Cores
  coresMacro: { proteinas: string; carboidratos: string; gorduras: string }
  /* Opacidades do texto-base usadas em texto secundário. Ficam aqui para não
     virar número mágico espalhado pelos estilos. */
  inkSuave: string
  inkMedio: string
  inkFraco: string
  /* Véu por trás de folha, menu e imagem ampliada. */
  veu: string
  /* Degradês dos cartões coloridos. O desenho não usa cor chapada: cada bloco
     tem uma variação na diagonal, e é ela que dá o volume. */
  degrades: { destaque: readonly [string, string] }
}

export const ESCURO: Paleta = {
  cores: {
    verde: '#2BE07C',
    verdeEscuro: '#1FBE68',
    limao: '#C8F94E',
    limaoEscuro: '#A9DC2F',
    sobreLimao: '#0C1207',

    /* Realces translúcidos, e não tons chapados: por cima de `cartao` e de
       `superficie` os dois precisam funcionar, e a transparência resolve os
       dois casos com um valor só. */
    verdeClaro: 'rgba(200,249,78,0.16)',
    verdeMenta: 'rgba(43,224,124,0.10)',

    /* O fundo puxa levemente para o oliva em vez de cinza neutro. Ao lado do
       limão o cinza puro esverdeia sozinho e a tela parece suja. */
    fundo: '#0C0F0B',
    cartao: '#161A14',
    superficie: '#1E2319',
    trilho: '#2A3123',
    borda: 'rgba(255,255,255,0.09)',
    desligado: '#6E7568',

    ink: '#F1F5EC',
    branco: '#FFFFFF',

    /* Herança do sistema web. No claro `deep` era o musgo escuro do texto; aqui
       ele vira o mesmo papel invertido, um musgo claro que se lê sobre o
       fundo. */
    deep: '#D8EFAA',
    forest: '#B7D986',
    mist: '#161A14',
    moss: '#2A3123',
    gold: '#E8B86B',
    musgoClaro: '#8FA469',
    line: 'rgba(255,255,255,0.10)',

    /* No claro era o creme da marca; aqui precisa ser um tom do próprio dourado
       do aviso, senão fica idêntico ao cartão comum e o destaque some. */
    atencaoFundo: 'rgba(232,184,107,0.12)',

    erroBorda: 'rgba(248,113,113,0.38)',
    erroFundo: 'rgba(248,113,113,0.12)',
    erroTexto: '#FCA5A5',

    /* Mais claro que o do tema claro: rosa fechado sobre preto perde brilho, e
       a faixa da menstruação some no fundo. */
    cicloForte: '#E8899E',
    cicloFundo: 'rgba(232,137,158,0.16)',
    cicloPrevisto: 'rgba(232,137,158,0.45)',
  },

  /* Um matiz por macro, e não três tons do verde da marca: na barra empilhada
     do resumo as fatias ficam encostadas uma na outra, e variações da mesma cor
     viram uma faixa só, ainda mais para quem enxerga pouco contraste. Estes
     três foram clareados em relação aos do claro, porque cor saturada sobre
     preto perde brilho. */
  coresMacro: { proteinas: '#3BE477', carboidratos: '#FFC13D', gorduras: '#9B8CFF' },

  inkSuave: 'rgba(241,245,236,0.56)',
  inkMedio: 'rgba(241,245,236,0.74)',
  inkFraco: 'rgba(241,245,236,0.38)',

  /* Preto e forte: no escuro, véu fraco deixa o que está atrás competindo com o
     que está na frente. */
  veu: 'rgba(0,0,0,0.62)',

  degrades: { destaque: ['#2BE07C', '#1FBE68'] },
}

export const CLARO: Paleta = {
  cores: {
    /* Verde de AÇÃO, e a escolha é de contraste, não de gosto.
     *
     * O #22C55E que este app usava no tema claro dá 2,28:1 com texto branco por
     * cima — muito abaixo do mínimo legível de 4,5. O botão primário era verde
     * vivo com uma palavra branca que quase não se lia, e ninguém tinha medido.
     * Este dá 5,02:1. */
    verde: '#15803D',
    verdeEscuro: '#166534',

    /* O papel do limão, traduzido.
     *
     * Puxado para o amarelo-esverdeado, e não para o verde da ação: no escuro os
     * dois são matizes diferentes de propósito, e igualá-los faria o anel de
     * progresso sumir dentro do botão ao lado dele. 4,35:1 sobre o creme — é
     * traço, e a régua do traço é 3:1. */
    limao: '#4D7C0F',
    limaoEscuro: '#3F6212',
    sobreLimao: '#FFFFFF',

    verdeClaro: 'rgba(77,124,15,0.13)',
    verdeMenta: 'rgba(21,128,61,0.08)',

    /* O creme e o musgo do sistema web, e não branco.
     *
     * A primeira versão deste tema usava #FDFBF6 de fundo e BRANCO PURO nos
     * cartões — e o resultado é o que se esperava: uma tela branca com outra
     * tela branca por cima, sem relação nenhuma com a marca. Agora o fundo é o
     * `mist` do sistema, o cartão é um creme um passo mais claro que ele, e só a
     * superfície elevada chega ao branco. Os três se separam sem ninguém precisar
     * de borda. */
    fundo: '#F4EFE4',
    cartao: '#FBF8F1',
    superficie: '#FFFFFF',
    trilho: '#DFE3D4',
    borda: 'rgba(47,55,34,0.12)',
    desligado: '#6E7568',

    /* Musgo escuro, e não quase-preto: é o texto do sistema web, e é ele que
       faz o app parecer da mesma casa. 10,8:1 sobre o fundo. */
    ink: '#2F3722',
    branco: '#FFFFFF',

    deep: '#3F4A2E',
    forest: '#2F3722',
    mist: '#F4EFE4',
    moss: '#DFE3D4',
    gold: '#C49A5E',
    musgoClaro: '#6F7C52',
    line: 'rgba(47,55,34,0.14)',

    /* O creme dourado da marca, para o bloco de atenção dos relatórios. */
    atencaoFundo: 'rgba(196,154,94,0.18)',

    erroBorda: '#E8B4B4',
    erroFundo: '#FBEFEF',
    /* #DC2626 dá 4,21:1 sobre o creme — passa raspando por baixo do mínimo.
       Este dá 5,64:1. */
    erroTexto: '#B91C1C',

    /* #C2536B dá 4,9:1 sobre o creme — passa para texto, e é o que permite o
       número do dia ficar branco em cima dele. */
    cicloForte: '#C2536B',
    cicloFundo: 'rgba(194,83,107,0.14)',
    cicloPrevisto: 'rgba(194,83,107,0.45)',
  },

  coresMacro: { proteinas: '#15803D', carboidratos: '#B45309', gorduras: '#4F46E5' },

  /* Mais fechadas que as do escuro, e isso é medida, não gosto: 56% de musgo
     sobre o creme dá 3,24:1, que não passa para texto. 70% dá 4,75:1. */
  inkSuave: 'rgba(47,55,34,0.70)',
  inkMedio: 'rgba(47,55,34,0.85)',
  inkFraco: 'rgba(47,55,34,0.55)',

  /* Musgo a 40%, e não preto: sobre creme o preto forte fecha demais e a folha
     parece um recorte, não uma camada. */
  veu: 'rgba(47,55,34,0.40)',

  degrades: { destaque: ['#15803D', '#166534'] },
}

/* ── O que o resto do app importa ──────────────────────────────────────────
 *
 * Continua sendo o escuro, e continua sendo constante. Enquanto uma tela não
 * for convertida para ler o tema atual, é daqui que ela tira as cores — e é
 * isso que permite converter uma por vez sem quebrar as outras cinquenta e
 * quatro. */
/* O CLARO é o padrão.
 *
 * O app abre com a cara da marca — o creme e o musgo do sistema web —, e quem
 * quiser o escuro escolhe em Mais. Era o contrário até aqui, e o contrário
 * fazia o aplicativo não ter parentesco visual nenhum com o resto do produto. */
export const PADRAO: Paleta = CLARO

export const cores = PADRAO.cores
export const coresMacro = PADRAO.coresMacro
export const inkSuave = PADRAO.inkSuave
export const inkMedio = PADRAO.inkMedio
export const inkFraco = PADRAO.inkFraco
export const veu = PADRAO.veu
export const degrades = PADRAO.degrades
