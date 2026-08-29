import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AguaScreen } from './AguaScreen'
import { CalculoEnergeticoScreen } from './CalculoEnergeticoScreen'
import { ContadorCaloriasScreen } from './ContadorCaloriasScreen'
import { EmBreveScreen } from './EmBreveScreen'
import { MetasScreen } from './MetasScreen'
import { PesoScreen } from './PesoScreen'
import { SonoScreen } from './SonoScreen'
import { TreinoScreen } from './TreinoScreen'
import { RefeicoesDoDiaScreen } from './RefeicoesDoDiaScreen'
import { estilosDe, paleta } from '../lib/tema'

type Opcao = {
  chave: string
  rotulo: string
  icone: keyof typeof Ionicons.glyphMap
}

/* A ordem é a pedida, não a alfabética nem a agrupada por tipo: registro do dia
   a dia primeiro, ferramentas de cálculo no meio, treino e sono no fim. */
const OPCOES: Opcao[] = [
  { chave: 'plano', rotulo: 'Planejamento alimentar', icone: 'nutrition-outline' },
  { chave: 'agua', rotulo: 'Água', icone: 'water-outline' },
  { chave: 'metas', rotulo: 'Metas', icone: 'flag-outline' },
  { chave: 'peso', rotulo: 'Peso', icone: 'speedometer-outline' },
  { chave: 'energetico', rotulo: 'Cálculo energético', icone: 'flame-outline' },
  { chave: 'calorias', rotulo: 'Contador de calorias', icone: 'calculator-outline' },
  { chave: 'treino', rotulo: 'Treino', icone: 'barbell-outline' },
  { chave: 'sono', rotulo: 'Sono', icone: 'moon-outline' },
]

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
}) {
  const styles = estilos()
  const { top } = useSafeAreaInsets()
  const [escolhida, setEscolhida] = useState<Opcao | null>(
    () => OPCOES.find(o => o.chave === inicial) ?? null,
  )

  /* Voltar de dentro de uma opção volta para a grade: errar o toque não deveria
     custar a tela inteira. Mas quando a grade nunca apareceu — atalho —, ela
     não é "de onde se veio", e cair nela seria ir parar numa tela que ninguém
     pediu. Aí voltar fecha tudo. */
  const voltarDaOpcao = inicial ? onFechar : () => setEscolhida(null)

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
        onDefinirMetas={() => setEscolhida(OPCOES.find(o => o.chave === 'metas') ?? null)}
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

  if (escolhida?.chave === 'calorias') {
    return (
      <ContadorCaloriasScreen contaId={contaId} onFechar={voltarDaOpcao} onMudou={onConsumoMudou} />
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
          contentContainerStyle={styles.conteudo}
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
        >
          <Text style={styles.chamada}>O que você quer registrar?</Text>

          <View style={styles.grade}>
            {OPCOES.map(o => (
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
        </ScrollView>
      )}
    </View>
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
  rotulo: { fontSize: 14, fontWeight: '700', color: t.cores.ink, lineHeight: 19 },
  }),
)
