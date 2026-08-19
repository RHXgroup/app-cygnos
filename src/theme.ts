/* Paleta do app, tema escuro.
 *
 * Dois verdes com papéis diferentes, e trocar um pelo outro quebra legibilidade:
 *
 * - `verde` é superfície preenchida que carrega texto BRANCO por cima: botão
 *   primário, cartão de água, cartão do dia. Por isso ele é escuro o bastante
 *   para o branco funcionar em cima.
 * - `limao` é o neon do desenho, e só aparece como TRAÇO sobre fundo escuro:
 *   anel de progresso, aba ativa, número em destaque, borda de chip. Quando ele
 *   preenche alguma coisa, o texto por cima é `sobreLimao`, nunca branco.
 *
 * O fundo puxa levemente para o oliva em vez de cinza neutro. Ao lado do limão
 * o cinza puro esverdeia sozinho e a tela parece suja. */
export const cores = {
  verde: '#2BE07C',       // superfície de ação, texto branco por cima
  verdeEscuro: '#1FBE68', // pressionado
  limao: '#C8F94E',       // neon: anel, aba ativa, destaque
  limaoEscuro: '#A9DC2F', // pressionado do limão
  sobreLimao: '#0C1207',  // texto e ícone em cima do limão

  /* Realces translúcidos, e não tons chapados: por cima de `cartao` e de
     `superficie` os dois precisam funcionar, e a transparência resolve os dois
     casos com um valor só. */
  verdeClaro: 'rgba(200,249,78,0.16)', // fundo de ícone, chip e borda de realce
  verdeMenta: 'rgba(43,224,124,0.10)', // bloco de realce discreto

  fundo: '#0C0F0B',       // fundo da tela
  cartao: '#161A14',      // cartão padrão
  superficie: '#1E2319',  // o que era branco: folha, campo, menu, cartão elevado
  trilho: '#2A3123',      // barra de progresso vazia
  borda: 'rgba(255,255,255,0.09)',

  ink: '#F1F5EC',         // texto-base
  branco: '#FFFFFF',      // texto e ícone sobre superfície colorida

  /* Herança do sistema web, hoje só no login, no cadastro e na força da senha.
     No claro `deep` era o musgo escuro do texto; no escuro ele vira o mesmo
     papel invertido, um musgo claro que se lê sobre o fundo. */
  deep: '#D8EFAA',
  forest: '#B7D986',
  mist: '#161A14',
  moss: '#2A3123',
  gold: '#E8B86B',
  musgoClaro: '#8FA469',
  line: 'rgba(255,255,255,0.10)',

  /* Fundo do bloco de atenção dos relatórios. No claro ele era o creme da
     marca; no escuro precisa ser um tom do próprio dourado do aviso, senão
     fica idêntico ao cartão comum e o destaque some. */
  atencaoFundo: 'rgba(232,184,107,0.12)',

  erroBorda: 'rgba(248,113,113,0.38)',
  erroFundo: 'rgba(248,113,113,0.12)',
  erroTexto: '#FCA5A5',
} as const

/* Um matiz por macro, e não três tons do verde da marca: na barra empilhada do
   resumo as fatias ficam encostadas uma na outra, e variações da mesma cor
   viram uma faixa só, ainda mais para quem enxerga pouco contraste. Os três
   foram clareados em relação ao tema claro porque cor saturada sobre preto
   perde brilho. */
export const coresMacro = {
  proteinas: '#3BE477',
  carboidratos: '#FFC13D',
  gorduras: '#9B8CFF',
} as const

/* Opacidades do texto-base usadas em texto secundário. Ficam aqui para não
   virar número mágico espalhado pelos estilos. */
export const inkSuave = 'rgba(241,245,236,0.56)'
export const inkMedio = 'rgba(241,245,236,0.74)'
export const inkFraco = 'rgba(241,245,236,0.38)'

/* Véu por trás de folha, menu e imagem ampliada. No claro era o grafite a 35%;
   no escuro precisa ser preto e mais forte, senão o que está atrás continua
   competindo com o que está na frente. */
export const veu = 'rgba(0,0,0,0.62)'

/* Degradês dos cartões coloridos. O desenho não usa cor chapada: cada bloco
   tem uma variação na diagonal, e é ela que dá o volume. Fica aqui para as
   telas não repetirem pares de hex soltos. */
export const degrades = {
  destaque: ['#2BE07C', '#1FBE68'] as const,
} as const
