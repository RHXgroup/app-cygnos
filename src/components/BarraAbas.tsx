import { Pressable, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { estilosDe, paleta } from '../lib/tema'

export type Aba = 'hoje' | 'comer' | 'corpo' | 'mais'

/* O botão "+" do meio NÃO é uma aba: é uma ação de registro. Por isso a lista
   tem quatro itens e o espaço central é reservado à parte. */
/* As quatro abas, por ASSUNTO e não por tela.
 *
 * A barra anterior era Início · Relatórios · Mensagens · Mais, e duas das
 * quatro vagas iam para uso raro: relatório se lê uma vez por mês, e Mensagens
 * só serve a quem tem nutricionista — para todo o resto ela nascia vazia, e
 * aba permanentemente vazia ensina em duas semanas que ali não tem nada.
 *
 * Comer e Corpo entram no lugar delas porque nenhuma das duas depende de ter
 * nutricionista: o diário alimentar e o peso existem para todo mundo. Os
 * relatórios foram para dentro de Corpo e as mensagens para dentro de Mais,
 * onde o contador de não lidas continua chamando. */
const ABAS: { chave: Aba; rotulo: string; icone: keyof typeof Ionicons.glyphMap }[] = [
  { chave: 'hoje', rotulo: 'Hoje', icone: 'home' },
  { chave: 'comer', rotulo: 'Comer', icone: 'restaurant-outline' },
  { chave: 'corpo', rotulo: 'Corpo', icone: 'pulse-outline' },
  /* "VOCE", e nao "Mais".
   *
   * "Mais" nao e um assunto -- e o resto. Nutricionista, mensagens, lembretes,
   * meta de agua, tema, conta e termos moram todos ali, e ninguem procura uma
   * coisa especifica dentro de uma palavra que nao descreve nada. Relatado
   * assim: "os nossos menus sao muito perdidos".
   *
   * "Voce" descreve o que ha dentro: voce e quem cuida de voce. E o icone
   * deixa de ser o hamburguer -- que promete "lista de opcoes", ou seja, de
   * novo o resto -- e vira uma pessoa.
   *
   * A CHAVE continua 'mais' de proposito: ela e gravada no aparelho como a
   * ultima aba aberta, e trocar o valor faria todo mundo que ja usa o app
   * voltar para a inicial uma vez, sem motivo. O nome e para quem le; a chave
   * e para quem grava. */
  { chave: 'mais', rotulo: 'Você', icone: 'person-outline' },
]

/* A ordem das abas é a mesma do deslizamento lateral. Exportada para o App não
   manter uma segunda lista que pode sair de sincronia com esta. */
export const ORDEM_ABAS = ABAS.map(a => a.chave)

const LEVANTE = 22 // quanto o botão do meio sobe acima da barra
const DIAMETRO = 56

export function BarraAbas({
  ativa,
  onTrocar,
  onRegistrar,
  naoLidas = 0,
}: {
  ativa: Aba
  onTrocar: (a: Aba) => void
  onRegistrar: () => void
  /* Mensagens dela ainda não lidas. Vira um ponto sobre o ícone de Mensagens —
     é a única coisa no app que chega de fora e espera resposta, e sem o ponto
     ela só é descoberta por quem abre a aba por acaso. */
  naoLidas?: number
}) {
  const styles = estilos()
  /* A faixa do gesto de voltar do iPhone come a parte de baixo. Sem este
     respiro, os rótulos ficam em cima dela. */
  const { bottom } = useSafeAreaInsets()

  return (
    /* O envólucro reserva a altura do levante. O botão fica DENTRO dele, e não
       estourando para fora da barra: no Android o que sai dos limites do pai é
       recortado, e o círculo apareceria cortado ao meio. */
    <View style={[styles.envolucro, { paddingBottom: Math.max(bottom, 12) }]}>
      <View style={styles.barra}>
        {ABAS.slice(0, 2).map(a => (
          <ItemAba key={a.chave} aba={a} ativa={ativa} onTrocar={onTrocar} naoLidas={naoLidas} />
        ))}

        {/* Espaço reservado para o botão flutuante do meio. */}
        <View style={styles.vao} />

        {ABAS.slice(2).map(a => (
          <ItemAba key={a.chave} aba={a} ativa={ativa} onTrocar={onTrocar} naoLidas={naoLidas} />
        ))}
      </View>

      <Pressable
        onPress={onRegistrar}
        style={({ pressed }) => [styles.botaoMais, pressed && styles.botaoMaisPressionado]}
        accessibilityRole="button"
        accessibilityLabel="Registrar"
      >
        {/* Ícone escuro, e não branco: o limão é claro demais para carregar
            branco por cima. */}
        <Ionicons name="add" size={28} color={paleta().cores.sobreLimao} />
      </Pressable>
    </View>
  )
}

function ItemAba({
  aba,
  ativa,
  onTrocar,
  naoLidas,
}: {
  aba: { chave: Aba; rotulo: string; icone: keyof typeof Ionicons.glyphMap }
  ativa: Aba
  onTrocar: (a: Aba) => void
  naoLidas: number
}) {
  const styles = estilos()
  const selecionada = aba.chave === ativa
  /* O ponto migrou de Mensagens para Mais, junto com a tela. É o único sinal
     que chega de FORA e espera resposta, e sem ele a mensagem dela só seria
     descoberta por quem abrisse a aba por acaso — agora, por quem abrisse o
     menu por acaso, que é ainda mais raro. */
  const ponto = aba.chave === 'mais' && naoLidas > 0

  return (
    <Pressable
      onPress={() => onTrocar(aba.chave)}
      style={styles.item}
      accessibilityRole="tab"
      accessibilityState={{ selected: selecionada }}
      /* O número entra no rótulo lido em voz alta, e não só no desenho: um
         ponto colorido não existe para quem usa leitor de tela. */
      accessibilityLabel={
        ponto
          ? `${aba.rotulo}, ${naoLidas} ${naoLidas === 1 ? 'não lida' : 'não lidas'}`
          : aba.rotulo
      }
    >
      <View>
        <Ionicons
          name={aba.icone}
          size={21}
          color={selecionada ? paleta().cores.limao : paleta().inkFraco}
        />
        {/* Ponto e não número: acima de nove o balão fica maior que o ícone, e
            o que importa é "tem coisa para ler", não quanta. */}
        {ponto && <View style={styles.ponto} />}
      </View>
      <Text style={[styles.rotulo, selecionada && styles.rotuloAtivo]} numberOfLines={1}>
        {aba.rotulo}
      </Text>
    </Pressable>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
  envolucro: { paddingTop: LEVANTE, backgroundColor: t.cores.fundo },
  ponto: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 9,
    height: 9,
    borderRadius: 4,
    backgroundColor: t.cores.limao,
    /* Anel da cor da barra: sobre o ícone claro, ponto sem contorno some no
       desenho em vez de saltar dele. */
    borderWidth: 1.5,
    borderColor: t.cores.superficie,
  },
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    borderRadius: 26,
    backgroundColor: t.cores.superficie,
    /* Fio de borda claro: sobre fundo quase preto, cartão sem contorno some.
       É o que separa a barra da tela em vez da sombra, que no escuro não
       aparece. */
    borderWidth: 1,
    borderColor: t.cores.borda,
    paddingVertical: 10,
  },
  item: { flex: 1, alignItems: 'center', gap: 4 },
  /* Mesma largura de um item para os quatro ficarem simétricos em volta do
     botão do meio. */
  vao: { flex: 1 },
  rotulo: { fontSize: 10.5, color: t.inkFraco },
  rotuloAtivo: { color: t.cores.limao, fontWeight: '700' },

  botaoMais: {
    position: 'absolute',
    top: 0,
    /* left 50% + metade do diâmetro para a esquerda: centraliza sem precisar
       medir a largura da tela. */
    left: '50%',
    marginLeft: -DIAMETRO / 2,
    width: DIAMETRO,
    height: DIAMETRO,
    borderRadius: DIAMETRO / 2,
    backgroundColor: t.cores.limao,
    alignItems: 'center',
    justifyContent: 'center',
    /* Sombra na cor do próprio botão: sobre fundo escuro, sombra preta não
       existe. Colorida, ela vira o brilho que o desenho tem em volta do
       círculo. */
    shadowColor: t.cores.limao,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  botaoMaisPressionado: { backgroundColor: t.cores.limaoEscuro },
  }),
)
