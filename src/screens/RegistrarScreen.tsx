import { useEffect, useState } from 'react'
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AguaScreen } from './AguaScreen'
import { CalculoEnergeticoScreen } from './CalculoEnergeticoScreen'
import { ContadorCaloriasScreen, type PortaDoDiario } from './ContadorCaloriasScreen'
import { EmBreveScreen } from './EmBreveScreen'
import { MetasScreen } from './MetasScreen'
import { PesoScreen } from './PesoScreen'
import { SonoScreen } from './SonoScreen'
import { TreinoScreen } from './TreinoScreen'
import { ContarPlanoScreen } from './ContarPlanoScreen'
import { RefeicoesDoDiaScreen } from './RefeicoesDoDiaScreen'
import { estilosDe, paleta } from '../lib/tema'

type Opcao = {
  chave: string
  rotulo: string
  icone: keyof typeof Ionicons.glyphMap
}

/* Três grupos, e a ordem deles é a ordem da frequência.
 *
 * Antes eram oito destinos no mesmo tamanho, na mesma grade, com a mesma cor —
 * "Água" ao lado de "Cálculo energético" como se fossem a mesma classe de
 * coisa. Não são: um se faz oito vezes por dia e o outro uma vez por trimestre.
 * Quando tudo tem o mesmo destaque, nada tem, e a pessoa lê os oito toda vez.
 *
 * ── COMER vem primeiro, e leva DIRETO ────────────────────────────────────────
 * Registrar o que se comeu é a ação mais repetida do app, e era a mais cara:
 * "+" → "Contador de calorias" → escolher entre sete portas. Três toques e duas
 * telas, sendo que o degrau do meio não decidia nada.
 *
 * Agora as formas de registrar são o primeiro grupo, e cada uma abre o diário
 * já dentro dela. A referência é o Cal AI, que registra em 2,6 segundos — não
 * dá para competir com isso passando por uma tela de menu no caminho.
 *
 * Três em cima e o resto atrás de "outras formas" porque escolher entre três
 * custa menos que entre sete. Quais três é a única decisão aqui que devia sair
 * de dado e não de palpite: o app grava a `origem` de cada item do diário, e
 * uma semana de uso responde melhor. Até lá, estas são as que dispensam
 * digitar. */
const COMER: Opcao[] = [
  { chave: 'falar', rotulo: 'Falar', icone: 'mic-outline' },
  { chave: 'foto', rotulo: 'Foto', icone: 'camera-outline' },
  { chave: 'doPlano', rotulo: 'Do meu plano', icone: 'nutrition-outline' },
]

const COMER_MAIS: Opcao[] = [
  { chave: 'buscar', rotulo: 'Buscar', icone: 'search-outline' },
  { chave: 'repetir', rotulo: 'Repetir', icone: 'repeat-outline' },
  { chave: 'codigo', rotulo: 'Código de barras', icone: 'barcode-outline' },
  { chave: 'receitas', rotulo: 'Receitas', icone: 'book-outline' },
]

/* O que se anota em segundos, quase todo dia. */
const ANOTAR: Opcao[] = [
  /* Contar um plano NÃO é registrar: é dizer o que vem. Fica no grupo do dia
     mesmo assim, e em primeiro lugar nele, porque é o gesto que a pessoa faz
     no mesmo momento — abre o app para anotar o almoço e lembra que amanhã
     janta fora. Um grupo só para ele seria uma linha sozinha. */
  { chave: 'plano_futuro', rotulo: 'Contar um plano', icone: 'calendar-outline' },
  { chave: 'agua', rotulo: 'Água', icone: 'water-outline' },
  { chave: 'peso', rotulo: 'Peso', icone: 'speedometer-outline' },
  { chave: 'sono', rotulo: 'Sono', icone: 'moon-outline' },
  { chave: 'treino', rotulo: 'Treino', icone: 'barbell-outline' },
]

/* O que se define uma vez e passa a valer. Fica por último porque é raro — e
   porque estar por último não o esconde: quem veio definir uma meta veio de
   propósito, e rola a tela. */
const DEFINIR: Opcao[] = [
  { chave: 'plano', rotulo: 'Plano alimentar', icone: 'restaurant-outline' },
  { chave: 'metas', rotulo: 'Metas', icone: 'flag-outline' },
  { chave: 'energetico', rotulo: 'Cálculo energético', icone: 'flame-outline' },
]

/* Cada forma de comer aponta para uma porta do diário. Aqui, e não espalhado no
   JSX, para a lista de portas e a lista de botões não divergirem. */
const TODAS: Opcao[] = [...COMER, ...COMER_MAIS, ...ANOTAR, ...DEFINIR]

const PORTA_DE: Record<string, PortaDoDiario> = {
  falar: 'escrever',
  foto: 'foto',
  doPlano: 'plano',
  buscar: 'busca',
  repetir: 'repetir',
  codigo: 'codigo',
  receitas: 'receitas',
}

/* O que o "+" da barra abre.
 *
 * Tela cheia sobreposta, como o perfil — e não uma folha subindo de baixo —
 * porque são oito destinos: numa folha, os últimos ficariam abaixo da dobra ou
 * espremidos contra a barra de abas.
 *
 * O destino escolhido é estado DAQUI, não do App: cada opção que ganha tela de
 * verdade vira mais um caso aqui embaixo, sem o App ter de saber de nenhuma
 * delas. As que ainda não existem caem no "em breve". */
export function RegistrarScreen({
  contaId,
  inicial,
  onFechar,
  onPlanoSalvo,
  onAguaMudou,
  onMetasSalvas,
  onPesoMudou,
  onConsumoMudou,
  onSonoMudou,
  onTreinoMudou,
  onIntencaoSalva,
}: {
  contaId: string
  /* Opção já aberta na entrada, quando esta tela foi chamada por um atalho — o
     botão de cadastrar plano da Home, por exemplo. Sem ela, a grade. */
  inicial?: Opcao['chave']
  onFechar: () => void
  onPlanoSalvo: () => void
  onAguaMudou: () => void
  onMetasSalvas: () => void
  onPesoMudou: () => void
  onConsumoMudou: () => void
  onSonoMudou: () => void
  /* Treino mexe na constância que a tela inicial mostra. */
  onTreinoMudou: () => void
  /* A intenção muda o que a tela inicial COBRA — quem avisou que almoça fora
     não deve receber "almoço em 45 min". Por isso ela avisa como as outras. */
  onIntencaoSalva: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const [escolhida, setEscolhida] = useState<Opcao | null>(
    () => TODAS.find(o => o.chave === inicial) ?? null,
  )
  /* As quatro formas menos usadas ficam recolhidas. Aberto uma vez, continua
     aberto enquanto a tela existir: quem foi buscar "código de barras" costuma
     ir de novo na mesma sessão. */
  const [maisFormas, setMaisFormas] = useState(false)

  /* Voltar de dentro de uma opção volta para a grade: errar o toque não deveria
     custar a tela inteira. Mas quando a grade nunca apareceu — atalho —, ela
     não é "de onde se veio", e cair nela seria ir parar numa tela que ninguém
     pediu. Aí voltar fecha tudo. */
  const voltarDaOpcao = inicial ? onFechar : () => setEscolhida(null)

  /* O voltar do Android, descascando: opção aberta volta à lista de opções, e
   * só então fecha a tela.
   *
   * Sem isto, quem escolhia uma opção e apertava voltar perdia a tela INTEIRA:
   * o tratador central do App só sabe `setRegistrar(null)`, e ele ganha porque
   * o React roda os efeitos do filho antes dos do pai — quem registra por
   * último decide primeiro.
   *
   * SEM lista de dependências, de propósito. Re-registrar a cada renderização é
   * o que põe este tratador na frente do central a partir da primeira
   * re-renderização, que sempre acontece. Ver a armadilha 1 do AGENTS.md — este
   * comentário existe para o próximo leitor não achar que um dos dois é código
   * morto e apagar o errado. */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      /* `inicial` quer dizer que a tela abriu JÁ dentro de uma opção — veio do
         cartão de plano ou do de treino. Ali não há lista para onde voltar, e
         devolver o evento fecha a tela, que é o certo. */
      if (escolhida && !inicial) {
        setEscolhida(null)
        return true
      }
      return false
    })
    return () => sub.remove()
  })

  /* Tela pronta traz o próprio cabeçalho, então ela substitui esta inteira em
     vez de aparecer embaixo do cabeçalho daqui — dois voltares empilhados na
     mesma tela seria confuso. */
  if (escolhida?.chave === 'plano') {
    return (
      <RefeicoesDoDiaScreen
        contaId={contaId}
        onFechar={voltarDaOpcao}
        onSalvo={onPlanoSalvo}
        /* Troca a opção aberta em vez de empilhar mais uma tela: quem chegou
           aqui pela sugestão e descobriu que falta a meta vai definir a meta, e
           voltar dela ao meio do assistente de plano seria devolver a pessoa a
           um lugar que ela já abandonou. */
        onDefinirMetas={() => setEscolhida(TODAS.find(o => o.chave === 'metas') ?? null)}
      />
    )
  }

  if (escolhida?.chave === 'plano_futuro') {
    return (
      <ContarPlanoScreen
        contaId={contaId}
        onFechar={voltarDaOpcao}
        onSalvou={onIntencaoSalva}
      />
    )
  }

  if (escolhida?.chave === 'agua') {
    /* Fecha no voltar, em vez de avisar e ficar aberta: a água não tem "salvar"
       — cada copo já foi gravado quando foi tocado. O que sobe daqui é só o
       aviso para a tela inicial refazer a conta do dia. */
    return <AguaScreen contaId={contaId} onFechar={voltarDaOpcao} onMudou={onAguaMudou} />
  }

  if (escolhida?.chave === 'metas') {
    /* onSalvo e onFechar separados: a tela de Metas fecha sozinha depois de
       gravar, e o aviso serve para a Home e a de Água relerem os números. */
    /* 'ativa': quem chega pelo "+" quer mexer no conjunto que está valendo, não
       criar mais um. Um conjunto novo a cada visita encheria a lista de cópias. */
    return (
      <MetasScreen
        contaId={contaId}
        alvo="ativa"
        onFechar={voltarDaOpcao}
        onSalvo={onMetasSalvas}
      />
    )
  }

  if (escolhida?.chave === 'peso') {
    return <PesoScreen contaId={contaId} onFechar={voltarDaOpcao} onMudou={onPesoMudou} />
  }

  if (escolhida?.chave === 'treino') {
    /* A última opção do "+" que ainda caía em "Em breve". As tabelas existiam
       desde agosto, desenhadas e sem uso — ver a migração 20260803000002. */
    return <TreinoScreen contaId={contaId} onFechar={voltarDaOpcao} onMudou={onTreinoMudou} />
  }

  if (escolhida?.chave === 'sono') {
    return <SonoScreen contaId={contaId} onFechar={voltarDaOpcao} onMudou={onSonoMudou} />
  }

  /* As sete formas de comer levam à MESMA tela, cada uma abrindo numa porta
     diferente. Um `if` por forma seria sete blocos idênticos com uma palavra
     trocada. */
  if (escolhida && PORTA_DE[escolhida.chave]) {
    return (
      <ContadorCaloriasScreen
        contaId={contaId}
        portaInicial={PORTA_DE[escolhida.chave]}
        onFechar={voltarDaOpcao}
        onMudou={onConsumoMudou}
      />
    )
  }

  if (escolhida?.chave === 'energetico') {
    /* Salvar pode mexer nas metas (o "usar como minha meta" da última etapa),
       então o aviso que sobe daqui é o mesmo das metas. */
    return (
      <CalculoEnergeticoScreen contaId={contaId} onFechar={voltarDaOpcao} onSalvo={onMetasSalvas} />
    )
  }

  return (
    <View style={[styles.tela, { paddingTop: top + 8 }]}>
      <View style={styles.cabecalho}>
        <Pressable
          onPress={() => (escolhida ? voltarDaOpcao() : onFechar())}
          style={styles.botaoVoltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela} numberOfLines={1}>
          {escolhida ? escolhida.rotulo : 'Registrar'}
        </Text>
        <View style={styles.botaoVoltar} />
      </View>

      {escolhida ? (
        <EmBreveScreen titulo={escolhida.rotulo} icone={escolhida.icone} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.conteudo, { paddingBottom: 32 + bottom }]}
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
        >
          {/* O grupo de comer é o único com botões grandes, e é de propósito:
              é o que se faz cinco vezes por dia. Os outros dois são listas
              magras — cabem mais na tela e não competem pelo olhar. */}
          <Text style={styles.grupo}>Comi alguma coisa</Text>
          <View style={styles.grade}>
            {COMER.map(o => (
              <Pressable
                key={o.chave}
                onPress={() => setEscolhida(o)}
                style={({ pressed }) => [styles.cartao, pressed && styles.cartaoPressionado]}
                accessibilityRole="button"
                accessibilityLabel={o.rotulo}
              >
                <View style={styles.circulo}>
                  <Ionicons name={o.icone} size={22} color={paleta().cores.verde} />
                </View>
                <Text style={styles.rotulo} numberOfLines={2}>
                  {o.rotulo}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* O controle fica NO LUGAR, aberto ou fechado.
              Antes ele sumia ao abrir: o toque trocava o botão pela lista, e
              quem abriu perdia de vista o que tinha tocado e não tinha como
              fechar de volta. Um controle que desaparece ao ser usado deixa a
              pessoa sem saber se abriu uma gaveta ou trocou de tela.
              Agora ele continua ali, a seta vira para cima, e o segundo toque
              desfaz o primeiro. */}
          <Pressable
            onPress={() => setMaisFormas(m => !m)}
            style={({ pressed }) => [styles.maisFormas, pressed && styles.cartaoPressionado]}
            accessibilityRole="button"
            accessibilityState={{ expanded: maisFormas }}
            accessibilityLabel="Outras formas de registrar"
          >
            <Text style={styles.textoMaisFormas}>Outras formas de registrar</Text>
            <Ionicons
              name={maisFormas ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={paleta().inkSuave}
            />
          </Pressable>

          {maisFormas && (
            <View style={styles.lista}>
              {COMER_MAIS.map(o => (
                <Linha key={o.chave} opcao={o} onPress={() => setEscolhida(o)} styles={styles} />
              ))}
            </View>
          )}

          <Text style={styles.grupo}>Anotar do dia</Text>
          <View style={styles.lista}>
            {ANOTAR.map(o => (
              <Linha key={o.chave} opcao={o} onPress={() => setEscolhida(o)} styles={styles} />
            ))}
          </View>

          <Text style={styles.grupo}>Definir</Text>
          <View style={styles.lista}>
            {DEFINIR.map(o => (
              <Linha key={o.chave} opcao={o} onPress={() => setEscolhida(o)} styles={styles} />
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  )
}

/* Uma linha de lista, para os grupos que não pedem destaque. */
function Linha({
  opcao,
  onPress,
  styles,
}: {
  opcao: Opcao
  onPress: () => void
  styles: ReturnType<typeof estilos>
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.linha, pressed && styles.cartaoPressionado]}
      accessibilityRole="button"
      accessibilityLabel={opcao.rotulo}
    >
      <Ionicons name={opcao.icone} size={19} color={paleta().cores.verde} />
      <Text style={styles.rotuloLinha}>{opcao.rotulo}</Text>
      <Ionicons name="chevron-forward" size={17} color={paleta().inkFraco} />
    </Pressable>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
  tela: { flex: 1, backgroundColor: t.cores.fundo },

  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  botaoVoltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  tituloTela: { flexShrink: 1, fontSize: 17, fontWeight: '800', color: t.cores.ink },

  conteudo: { paddingHorizontal: 20, paddingBottom: 32 },
  chamada: { marginTop: 8, marginBottom: 18, fontSize: 14, color: t.inkSuave },

  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cartao: {
    /* Duas colunas com o vão de 12 no meio. A base é 47%, e não 48%, porque a
       porcentagem é calculada antes do gap: em tela de 320pt, 48% + 48% + 12
       estoura a largura e a grade desaba para uma coluna só.
     *
     * O flexGrow reparte entre os dois cartões da linha o que sobra dessa
     * conta. Sem ele a folga inteira vira margem extra na direita, e a grade
     * fica visivelmente deslocada para a esquerda dentro do padding da tela. */
    flexBasis: '47%',
    flexGrow: 1,
    /* Altura fixa para os cartões de rótulo curto ficarem do tamanho dos de
       duas linhas. Sem isso a grade fica com degraus. */
    height: 122,
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: t.cores.cartao,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  cartaoPressionado: { backgroundColor: t.cores.verdeMenta, borderColor: t.cores.verdeClaro },
  circulo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: t.cores.verdeClaro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grupo: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: t.inkSuave,
    marginTop: 18,
    marginBottom: 8,
  },

  lista: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.cores.borda,
    backgroundColor: t.cores.cartao,
    overflow: 'hidden',
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  rotuloLinha: { flex: 1, fontSize: 15, fontWeight: '600', color: t.cores.ink },

  maisFormas: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  textoMaisFormas: { fontSize: 13.5, fontWeight: '600', color: t.inkSuave },

  rotulo: { fontSize: 14, fontWeight: '700', color: t.cores.ink, lineHeight: 19 },
  }),
)
