/* Paleta do app.
 *
 * O verde vivo daqui NÃO é o verde-musgo da marca usado no sistema web — é o
 * do desenho da tela inicial, que pede um tom mais fresco para uso diário. As
 * telas de login e cadastro seguem no musgo; unificar as duas pontas é uma
 * decisão em aberto. */
export const cores = {
  verde: '#22C55E',       // ação e destaque
  verdeEscuro: '#16A34A', // pressionado
  verdeClaro: '#DCFCE7',  // fundo de ícone e realce
  verdeMenta: '#EAFBF1',  // fundo de bloco muito claro

  fundo: '#FFFFFF',       // fundo da tela
  cartao: '#F7F9F8',      // fundo dos cartões
  trilho: '#E8ECEA',      // barra de progresso vazia
  borda: '#EDF1EF',

  ink: '#101413',         // texto-base
  branco: '#FFFFFF',

  /* Herança do sistema web: continuam em uso no login, no cadastro e no ícone
     do app. */
  deep: '#3F4A2E',
  forest: '#2F3722',
  mist: '#F4EFE4',
  moss: '#DFE3D4',
  gold: '#C49A5E',
  musgoClaro: '#6F7C52',
  line: 'rgba(168,90,59,0.16)',

  erroBorda: '#FECACA',
  erroFundo: '#FEF2F2',
  erroTexto: '#DC2626',
} as const

/* Um matiz por macro, e não três tons do verde da marca: na barra empilhada do
   resumo as fatias ficam encostadas uma na outra, e variações da mesma cor
   viram uma faixa só — ainda mais para quem enxerga pouco contraste. */
export const coresMacro = {
  proteinas: '#22C55E',
  carboidratos: '#F59E0B',
  gorduras: '#6366F1',
} as const

/* Opacidades do grafite usadas em texto secundário. Ficam aqui para não virar
   número mágico espalhado pelos estilos. */
export const inkSuave = 'rgba(16,20,19,0.55)'
export const inkMedio = 'rgba(16,20,19,0.72)'
export const inkFraco = 'rgba(16,20,19,0.38)'
