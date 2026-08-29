/* A paleta do app, nos dois temas.
 *
 * ── Como ler este arquivo ──────────────────────────────────────────────────
 * `ESCURO` e `CLARO` são paletas completas e independentes. Tudo o que o resto
 * do app importa — `cores`, `coresMacro`, `inkSuave`, `veu`, `degrades` —
 * continua existindo e continua apontando para o ESCURO, que é o padrão. Nenhuma
 * tela precisa mudar por causa deste arquivo.
 *
 * Isso é de propósito. A troca em tempo real exige que cada tela monte os
 * estilos a partir do tema atual, porque `StyleSheet.create` congela as cores no
 * instante em que o arquivo é carregado. São 55 arquivos, e convertê-los é
 * trabalho mecânico que pode ser feito um por um: tela convertida responde ao
 * tema, tela não convertida segue no escuro, e o app nunca fica quebrado no
 * meio do caminho.
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
    verde: '#22C55E',
    verdeEscuro: '#16A34A',

    /* O papel do limão, traduzido.
     *
     * Puxado para o amarelo-esverdeado, e não para o verde da ação: no escuro
     * os dois são matizes diferentes de propósito, e igualá-los aqui faria o
     * anel de progresso sumir dentro do botão que está ao lado dele. Escuro o
     * bastante para se ler sobre o creme — é traço, não preenchimento. */
    limao: '#4D7C0F',
    limaoEscuro: '#3F6212',
    sobreLimao: '#FFFFFF',

    verdeClaro: '#DCFCE7',
    verdeMenta: '#EAFBF1',

    /* Creme, e não branco puro. É o mesmo do ícone adaptativo na loja e o mesmo
       do sistema web — e é ele que faz o tema claro parecer ESTE app, e não um
       app qualquer de fundo branco. O cartão sobe para o branco justamente para
       se destacar dele. */
    fundo: '#FDFBF6',
    cartao: '#FFFFFF',
    superficie: '#FFFFFF',
    trilho: '#E8ECEA',
    borda: '#EDF1EF',

    ink: '#101413',
    branco: '#FFFFFF',

    deep: '#3F4A2E',
    forest: '#2F3722',
    mist: '#F4EFE4',
    moss: '#DFE3D4',
    gold: '#C49A5E',
    musgoClaro: '#6F7C52',
    line: 'rgba(168,90,59,0.16)',

    /* O creme dourado da marca, para o bloco de atenção dos relatórios. */
    atencaoFundo: 'rgba(196,154,94,0.16)',

    erroBorda: '#FECACA',
    erroFundo: '#FEF2F2',
    erroTexto: '#DC2626',
  },

  coresMacro: { proteinas: '#22C55E', carboidratos: '#F59E0B', gorduras: '#6366F1' },

  inkSuave: 'rgba(16,20,19,0.56)',
  inkMedio: 'rgba(16,20,19,0.74)',
  inkFraco: 'rgba(16,20,19,0.42)',

  /* Grafite a 35%, e não preto: sobre fundo claro o preto forte fecha demais e
     a folha parece um recorte, não uma camada. */
  veu: 'rgba(16,20,19,0.35)',

  degrades: { destaque: ['#22C55E', '#16A34A'] },
}

/* ── O que o resto do app importa ──────────────────────────────────────────
 *
 * Continua sendo o escuro, e continua sendo constante. Enquanto uma tela não
 * for convertida para ler o tema atual, é daqui que ela tira as cores — e é
 * isso que permite converter uma por vez sem quebrar as outras cinquenta e
 * quatro. */
export const PADRAO: Paleta = ESCURO

export const cores = PADRAO.cores
export const coresMacro = PADRAO.coresMacro
export const inkSuave = PADRAO.inkSuave
export const inkMedio = PADRAO.inkMedio
export const inkFraco = PADRAO.inkFraco
export const veu = PADRAO.veu
export const degrades = PADRAO.degrades
