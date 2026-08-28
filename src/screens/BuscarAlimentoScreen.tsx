import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { NOME_NOVA, buscarAlimentos, porcao, type Alimento } from '../lib/alimentos'
import { mascaraQuantidade, numeroDigitado, soDigitos } from '../lib/formulario'
import { decimal } from '../lib/formatar'
import { novaChave, type AlimentoEscolhido } from '../lib/plano'
import { cores, inkFraco, inkMedio, inkSuave } from '../theme'

type Modo = 'gramas' | 'medida'

/* Medidas do dia a dia, na ordem em que aparecem numa cozinha. Servem de atalho
   — o campo continua aceitando qualquer texto. */
const MEDIDAS = [
  'unidade',
  'fatia',
  'colher de sopa',
  'colher de chá',
  'xícara',
  'copo',
  'ml',
  'litro',
  'pedaço',
]

/* Volume vira peso pela densidade da água: 1 ml ≈ 1 g. É aproximação, não
   verdade — azeite dá 0,92 e leite 1,03 —, por isso entra como sugestão no
   campo, que continua editável. Para o resto não há palpite possível: uma
   colher de sopa de azeite e uma de farinha não pesam nem perto do mesmo. */
const PESO_SUGERIDO: Record<string, string> = { ml: '1', litro: '1000' }

/* Abreviação não flexiona: "200 mls" não existe. */
const INVARIAVEIS = new Set(['ml', 'l', 'g', 'kg'])

/* "unidade" → "unidades", "colher de sopa" → "colheres de sopa". Regra curta
   porque cobre as medidas acima e erra pouco no texto livre. */
function plural(medida: string): string {
  if (INVARIAVEIS.has(medida.toLowerCase())) return medida
  if (medida.startsWith('colher')) return medida.replace('colher', 'colheres')
  if (medida.endsWith('s')) return medida
  return `${medida}s`
}

/* O rótulo do botão muda com o motivo de a tela ter sido aberta: adicionar à
   refeição, trocar um alimento por outro ou pendurar uma alternativa nele. É a
   mesma busca nos três casos — o que não pode é o botão mentir sobre o que vai
   acontecer no toque. */
const ROTULO_ACAO = {
  adicionar: 'Adicionar à refeição',
  substituir: 'Substituir alimento',
  variacao: 'Adicionar como variação',
  /* O contador de calorias usa a mesma busca, mas o que acontece no toque é
     outro: aqui não se planeja, registra-se o que já foi comido. */
  consumo: 'Registrar o que comi',
} as const

export type MotivoBusca = keyof typeof ROTULO_ACAO

const GRAMAS_PADRAO = '100'
const QUANTIDADE_PADRAO = '1'
/* Tempo parado depois da última tecla antes de consultar o banco. Curto o
   bastante para parecer imediato, longo o bastante para não disparar uma
   consulta por letra. */
const ESPERA_BUSCA = 350

/* Altura que o teclado ocupa agora, em pontos.
 *
 * O KeyboardAvoidingView não serve para o painel de quantidade: ele empurra o
 * conteúdo por padding, e um filho posicionado por absoluto ignora esse padding
 * — o painel ficava exatamente onde estava, atrás do teclado. Com a altura na
 * mão, o painel sobe sozinho.
 *
 * Os dois sistemas deslocam. Antes só o iOS o fazia, porque o Android encolhia
 * a janela inteira quando o teclado subia e somar a altura empurraria duas
 * vezes. Essa premissa caiu: o Expo passou a ligar edge-to-edge por padrão, a
 * janela deixou de encolher, e o painel voltou a ficar escondido atrás do
 * teclado — justamente no campo de quantidade, que é onde se digita. */
function useAlturaTeclado(): number {
  const [altura, setAltura] = useState(0)

  useEffect(() => {
    /* Will* no iOS acompanha a animação do teclado; o Android só emite Did*, e
       lá o painel salta depois que ela termina — feio, mas visível, que é o
       oposto do que acontecia antes. */
    const ehIOS = Platform.OS === 'ios'

    const aoAbrir = Keyboard.addListener(ehIOS ? 'keyboardWillShow' : 'keyboardDidShow', e =>
      setAltura(e.endCoordinates.height),
    )
    const aoFechar = Keyboard.addListener(ehIOS ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setAltura(0),
    )

    return () => {
      aoAbrir.remove()
      aoFechar.remove()
    }
  }, [])

  return altura
}

export function BuscarAlimentoScreen({
  refeicao,
  motivo = 'adicionar',
  onAdicionar,
  onFechar,
}: {
  refeicao: string
  motivo?: MotivoBusca
  onAdicionar: (item: AlimentoEscolhido) => void
  onFechar: () => void
}) {
  const { top, bottom } = useSafeAreaInsets()
  const [termo, setTermo] = useState('')
  const [resultados, setResultados] = useState<Alimento[]>([])
  const [buscando, setBuscando] = useState(false)
  const [erro, setErro] = useState('')
  const [selecionado, setSelecionado] = useState<Alimento | null>(null)
  const [modo, setModo] = useState<Modo>('gramas')
  const [gramas, setGramas] = useState(GRAMAS_PADRAO)
  const [quantidade, setQuantidade] = useState(QUANTIDADE_PADRAO)
  const [medida, setMedida] = useState(MEDIDAS[0])
  const [pesoUnidade, setPesoUnidade] = useState('')
  const [adicionados, setAdicionados] = useState(0)
  const busca = useRef<TextInput>(null)
  const alturaTeclado = useAlturaTeclado()

  /* O voltar do Android com o painel de quantidade aberto.
   *
   * Escolher o alimento abre o painel POR CIMA da lista. Sem isto, quem
   * selecionou "pão", viu a quantidade e apertou voltar saía da busca inteira —
   * e voltava à refeição sem o alimento e sem o termo digitado, tendo de buscar
   * de novo. Agora o voltar desfaz só a escolha, e a lista continua onde
   * estava. */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (selecionado) {
        setSelecionado(null)
        return true
      }
      onFechar()
      return true
    })

    return () => sub.remove()
  }, [selecionado, onFechar])

  /* Keyboard.dismiss() sozinho não resolve: ele manda o teclado descer, mas o
     campo de busca continua sendo o campo focado, e o iOS o traz de volta assim
     que o toque termina. Quem faz o teclado ficar embaixo é o blur. */
  function fecharTeclado() {
    busca.current?.blur()
    Keyboard.dismiss()
  }

  /* Guarda para o caso de o foco voltar depois do toque: com o painel aberto o
     teclado não tem o que fazer na tela. */
  useEffect(() => {
    if (selecionado) fecharTeclado()
  }, [selecionado])

  useEffect(() => {
    const limpo = termo.trim()
    if (limpo.length < 2) {
      setResultados([])
      setErro('')
      setBuscando(false)
      return
    }

    setBuscando(true)
    let atual = true

    const id = setTimeout(async () => {
      const r = await buscarAlimentos(limpo)
      /* Resposta de uma busca já abandonada não pode sobrescrever a atual. */
      if (!atual) return

      if (r.tipo === 'erro') {
        setErro(r.mensagem)
        setResultados([])
      } else {
        setErro('')
        setResultados(r.alimentos)
      }
      setBuscando(false)
    }, ESPERA_BUSCA)

    return () => {
      atual = false
      clearTimeout(id)
    }
  }, [termo])

  function limparPainel() {
    setSelecionado(null)
    setModo('gramas')
    setGramas(GRAMAS_PADRAO)
    setQuantidade(QUANTIDADE_PADRAO)
    setMedida(MEDIDAS[0])
    setPesoUnidade('')
  }

  function confirmar() {
    if (!selecionado || !podeAdicionar) return

    onAdicionar({
      chave: novaChave(),
      alimentoId: selecionado.id,
      nome: selecionado.nome,
      marca: selecionado.marca,
      descricao,
      gramasTotais,
      caloriasPor100g: selecionado.calorias,
      proteinasPor100g: selecionado.proteinas,
      carboidratosPor100g: selecionado.carboidratos,
      gordurasPor100g: selecionado.gorduras,
      fibrasPor100g: selecionado.fibras,
    })

    fecharTeclado()

    /* Substituir e adicionar variação são atos de UM alimento: escolhido, a
       tela cumpriu o seu papel e sai. Só o "adicionar" continua aberto — quem
       está montando uma refeição quase sempre tem mais de um para pôr nela. */
    if (motivo !== 'adicionar') {
      onFechar()
      return
    }

    setAdicionados(n => n + 1)
    limparPainel()
  }

  const qtd = numeroDigitado(quantidade)
  const peso = numeroDigitado(pesoUnidade)

  /* Em gramas o peso é o que foi digitado. Em medida caseira só há peso se a
     pessoa disser quanto pesa uma unidade — e sem isso o item entra no plano
     mesmo assim, só não conta calorias. */
  const gramasTotais =
    modo === 'gramas' ? numeroDigitado(gramas) || null : peso > 0 ? qtd * peso : null

  const descricao =
    modo === 'gramas'
      ? `${gramas} g`
      : `${quantidade} ${qtd === 1 ? medida.trim() : plural(medida.trim())}`

  const podeAdicionar =
    modo === 'gramas' ? numeroDigitado(gramas) > 0 : qtd > 0 && medida.trim().length > 0

  const kcal = selecionado && gramasTotais ? porcao(selecionado.calorias, gramasTotais) : null

  return (
    <View style={[styles.tela, { paddingTop: top + 8 }]}>
      {/* O KeyboardAvoidingView cobre só a busca e a lista. O painel de
          quantidade fica FORA dele, como irmão: por ser posicionado por
          absoluto, ele ignoraria o padding do KAV e continuaria atrás do
          teclado — quem o levanta é a altura medida acima. */}
      <KeyboardAvoidingView
        style={styles.corpo}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.cabecalho}>
          <Pressable
            onPress={onFechar}
            style={styles.botaoVoltar}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
          >
            <Ionicons name="chevron-back" size={22} color={cores.ink} />
          </Pressable>
          <Text style={styles.tituloTela} numberOfLines={1}>
            {refeicao}
          </Text>
          <View style={styles.botaoVoltar} />
        </View>

        <View style={styles.caixaBusca}>
          <Ionicons name="search" size={17} color={inkFraco} />
          <TextInput
            ref={busca}
            value={termo}
            onChangeText={setTermo}
            placeholder="Buscar alimento"
            placeholderTextColor={inkFraco}
            keyboardAppearance="dark"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            style={styles.campoBusca}
            accessibilityLabel="Buscar alimento"
          />
          {!!termo && (
            <Pressable onPress={() => setTermo('')} hitSlop={8} accessibilityLabel="Limpar busca">
              <Ionicons name="close-circle" size={17} color={inkFraco} />
            </Pressable>
          )}
        </View>

        <ScrollView
          contentContainerStyle={styles.conteudo}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          bounces={false}
          overScrollMode="never"
        >
          {termo.trim().length < 2 ? (
            <Text style={styles.dica}>
              Digite ao menos duas letras para procurar na tabela de alimentos.
            </Text>
          ) : buscando ? (
            <ActivityIndicator color={cores.verde} style={styles.carregando} />
          ) : erro ? (
            /* A mensagem crua do banco junto: sem ela, "não achei" e "a consulta
               falhou" ficam iguais na tela e não há como saber qual foi. */
            <View style={styles.blocoErro}>
              <Text style={styles.tituloErro}>Não foi possível buscar</Text>
              <Text style={styles.detalheErro}>{erro}</Text>
            </View>
          ) : resultados.length === 0 ? (
            <Text style={styles.dica}>Nenhum alimento encontrado com esse nome.</Text>
          ) : (
            resultados.map(a => (
              <Pressable
                key={a.id}
                onPress={() => {
                  /* O teclado da busca precisa sair de cena antes do painel: ele
                     ocupa metade da tela e cobriria justamente o campo de
                     quantidade que acaba de aparecer. */
                  fecharTeclado()
                  setSelecionado(a)
                  setGramas(GRAMAS_PADRAO)
                }}
                style={({ pressed }) => [styles.resultado, pressed && styles.resultadoPressionado]}
                accessibilityRole="button"
              >
                <View style={styles.textoResultado}>
                  <Text style={styles.nomeResultado} numberOfLines={2}>
                    {a.nome}
                  </Text>
                  <Text style={styles.detalheResultado}>
                    {a.marca ? `${a.marca} · ` : ''}
                    {a.calorias === null ? 'sem dado' : `${Math.round(a.calorias)} kcal`} por 100 g
                  </Text>
                </View>
                <Ionicons name="add-circle-outline" size={22} color={cores.verde} />
              </Pressable>
            ))
          )}
        </ScrollView>

        {adicionados > 0 && !selecionado && (
          <View style={[styles.rodapeContagem, { paddingBottom: Math.max(bottom, 16) }]}>
            <Ionicons name="checkmark-circle" size={17} color={cores.verde} />
            <Text style={styles.textoContagem}>
              {adicionados} {adicionados === 1 ? 'alimento adicionado' : 'alimentos adicionados'}
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Painel da quantidade: sobreposto e não Modal, pelo mesmo motivo do
          resto do app — Modal empilhado no iOS dá problema com o teclado. */}
      {selecionado && (
        <View style={StyleSheet.absoluteFill}>
          <Pressable
            style={styles.fundoPainel}
            onPress={() => {
              fecharTeclado()
              limparPainel()
            }}
          />
          <View
            style={[
              styles.painel,
              {
                bottom: alturaTeclado,
                /* Com o teclado aberto, o respiro do gesto do iPhone fica por
                   baixo dele — repetir a folga aqui abriria um vão à toa. */
                paddingBottom: alturaTeclado > 0 ? 16 : Math.max(bottom, 16),
              },
            ]}
          >
            <View style={styles.puxador} />

            <Text style={styles.nomePainel} numberOfLines={2}>
              {selecionado.nome}
            </Text>
            {!!selecionado.marca && <Text style={styles.marcaPainel}>{selecionado.marca}</Text>}

            {/* O que a tabela sabe além dos macros, e que estava sendo
                descartado no caminho: a classificação NOVA e o que costuma vir
                com aviso no rótulo. Só aparece o que a base informou — linha
                vazia diria "não tem" sobre um dado que apenas falta. */}
            <DetalheDoAlimento alimento={selecionado} />

            {/* Duas formas de dizer a mesma coisa: arroz se pesa, pão francês se
                conta. Obrigar a escolher uma só empurraria alguém a chutar. */}
            <View style={styles.seletor}>
              {(['gramas', 'medida'] as Modo[]).map(m => (
                <Pressable
                  key={m}
                  onPress={() => setModo(m)}
                  style={[styles.opcaoSeletor, modo === m && styles.opcaoSeletorAtiva]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: modo === m }}
                >
                  <Text style={[styles.textoSeletor, modo === m && styles.textoSeletorAtivo]}>
                    {m === 'gramas' ? 'Gramas' : 'Quantidade'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {modo === 'gramas' ? (
              <View style={styles.linhaQuantidade}>
                <View style={styles.blocoCampo}>
                  <Text style={styles.rotuloCampo}>Peso</Text>
                  <View style={styles.campoComUnidade}>
                    <TextInput
                      value={gramas}
                      onChangeText={t => setGramas(soDigitos(t).slice(0, 4))}
                      keyboardType="number-pad"
                      selectTextOnFocus
                      style={styles.entradaNumero}
                      accessibilityLabel="Peso em gramas"
                    />
                    <Text style={styles.unidade}>g</Text>
                  </View>
                </View>

                <View style={styles.blocoTotal}>
                  <Text style={styles.rotuloCampo}>Nesta quantidade</Text>
                  <Text style={styles.total}>{kcal === null ? '—' : `${Math.round(kcal)} kcal`}</Text>
                  <Text style={styles.macros}>{resumoMacros(selecionado, gramasTotais ?? 0)}</Text>
                </View>
              </View>
            ) : (
              <>
                <View style={styles.linhaQuantidade}>
                  <View style={styles.blocoQuantas}>
                    <Text style={styles.rotuloCampo}>Quantas</Text>
                    <View style={styles.campoComUnidade}>
                      <TextInput
                        value={quantidade}
                        onChangeText={t => setQuantidade(mascaraQuantidade(t))}
                        keyboardType="decimal-pad"
                        selectTextOnFocus
                        style={styles.entradaNumero}
                        accessibilityLabel="Quantas unidades"
                      />
                    </View>
                  </View>

                  <View style={styles.blocoMedida}>
                    <Text style={styles.rotuloCampo}>Medida</Text>
                    <View style={styles.campoComUnidade}>
                      <TextInput
                        value={medida}
                        onChangeText={setMedida}
                        placeholder="unidade"
                        placeholderTextColor={inkFraco}
                        keyboardAppearance="dark"
                        maxLength={24}
                        autoCapitalize="none"
                        style={styles.entradaTexto}
                        accessibilityLabel="Medida"
                      />
                    </View>
                  </View>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.fitas}
                >
                  {MEDIDAS.map(m => (
                    <Pressable
                      key={m}
                      onPress={() => {
                        setMedida(m)
                        /* Escolher a fita é ato explícito, então pode
                           sobrescrever o peso: ml e litro têm equivalência
                           conhecida, o resto continua com o que estava. */
                        if (PESO_SUGERIDO[m]) setPesoUnidade(PESO_SUGERIDO[m])
                      }}
                      style={[styles.fita, medida === m && styles.fitaAtiva]}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.textoFita, medida === m && styles.textoFitaAtivo]}>
                        {m}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <View style={styles.linhaQuantidade}>
                  <View style={styles.blocoCampo}>
                    <Text style={styles.rotuloCampo}>Peso de 1 {medida.trim() || 'unidade'}</Text>
                    <View style={styles.campoComUnidade}>
                      <TextInput
                        value={pesoUnidade}
                        onChangeText={t => setPesoUnidade(soDigitos(t).slice(0, 4))}
                        placeholder="—"
                        placeholderTextColor={inkFraco}
                        keyboardAppearance="dark"
                        keyboardType="number-pad"
                        selectTextOnFocus
                        style={styles.entradaNumero}
                        accessibilityLabel="Peso de uma unidade em gramas"
                      />
                      <Text style={styles.unidade}>g</Text>
                    </View>
                  </View>

                  <View style={styles.blocoTotal}>
                    <Text style={styles.rotuloCampo}>Nesta quantidade</Text>
                    <Text style={styles.total}>
                      {kcal === null ? '—' : `${Math.round(kcal)} kcal`}
                    </Text>
                    {/* Sem chute de peso: o item entra no plano do mesmo jeito,
                        só fica de fora da soma — e a tela diz isso. */}
                    <Text style={styles.macros}>
                      {gramasTotais === null
                        ? 'Informe o peso para contar as calorias'
                        : resumoMacros(selecionado, gramasTotais)}
                    </Text>
                  </View>
                </View>
              </>
            )}

            <Pressable
              onPress={confirmar}
              disabled={!podeAdicionar}
              style={({ pressed }) => [
                styles.botaoAdicionar,
                pressed && styles.botaoAdicionarPressionado,
                !podeAdicionar && styles.botaoDesativado,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.textoBotaoAdicionar}>{ROTULO_ACAO[motivo]}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  )
}

function resumoMacros(a: Alimento, gramas: number): string {
  const p = porcao(a.proteinas, gramas)
  const c = porcao(a.carboidratos, gramas)
  const g = porcao(a.gorduras, gramas)
  if (p === null && c === null && g === null) return 'sem dados de macros'

  const parte = (rotulo: string, v: number | null) => (v === null ? null : `${rotulo} ${decimal(v)}g`)
  return [parte('P', p), parte('C', c), parte('G', g)].filter(Boolean).join(' · ')
}

/* O detalhe nutricional que não são os macros.
 *
 * Fica escondido atrás da própria ausência: quem escolhe uma maçã não vê nada,
 * porque a base não tem gordura trans de maçã — e não deve ver. Quem escolhe um
 * biscoito recheado vê ultraprocessado, açúcar adicionado e gordura trans, que
 * é a informação que muda a decisão no segundo antes de registrar.
 *
 * Valores POR 100 g, como a tabela guarda. Não são reescalados para a porção de
 * propósito: aqui a pessoa ainda está escolhendo o alimento, e comparar dois
 * rótulos exige a mesma base — que é como o rótulo do mundo real também fala. */
function DetalheDoAlimento({ alimento }: { alimento: Alimento }) {
  const linhas: { rotulo: string; valor: string; alerta?: boolean }[] = []

  if (alimento.nova !== null && NOME_NOVA[alimento.nova]) {
    linhas.push({
      rotulo: 'Classificação',
      valor: NOME_NOVA[alimento.nova],
      /* Só o ultraprocessado vira alerta. Marcar "processado" de vermelho faria
         queijo e pão virarem vilões, e o aviso perderia o sentido de tanto
         aparecer. */
      alerta: alimento.nova === 4,
    })
  }

  const g = (v: number | null) => `${decimal(v ?? 0, 1)} g`

  if (alimento.acucaresAdicionados !== null && alimento.acucaresAdicionados > 0) {
    linhas.push({ rotulo: 'Açúcar adicionado', valor: g(alimento.acucaresAdicionados), alerta: true })
  } else if (alimento.acucaresTotais !== null && alimento.acucaresTotais > 0) {
    /* O total só aparece quando não há o adicionado: dizer os dois lado a lado
       confundiria, e o adicionado é o que interessa — o açúcar da fruta não é o
       mesmo problema que o do refrigerante. */
    linhas.push({ rotulo: 'Açúcares', valor: g(alimento.acucaresTotais) })
  }

  if (alimento.gorduraTrans !== null && alimento.gorduraTrans > 0) {
    linhas.push({ rotulo: 'Gordura trans', valor: g(alimento.gorduraTrans), alerta: true })
  }
  if (alimento.gorduraSaturada !== null && alimento.gorduraSaturada > 0) {
    linhas.push({ rotulo: 'Gordura saturada', valor: g(alimento.gorduraSaturada) })
  }

  if (linhas.length === 0) return null

  return (
    <View style={styles.detalhe}>
      {linhas.map(l => (
        <View key={l.rotulo} style={styles.linhaDetalhe}>
          <Text style={styles.rotuloDetalhe}>{l.rotulo}</Text>
          <Text style={[styles.valorDetalhe, l.alerta && styles.valorAlerta]}>{l.valor}</Text>
        </View>
      ))}
      <Text style={styles.baseDetalhe}>por 100 g</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  detalhe: {
    marginTop: 10,
    gap: 4,
    backgroundColor: cores.cartao,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: cores.borda,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  linhaDetalhe: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rotuloDetalhe: { fontSize: 12.5, color: inkSuave },
  valorDetalhe: { fontSize: 12.5, fontWeight: '700', color: cores.ink },
  valorAlerta: { color: cores.gold },
  baseDetalhe: { fontSize: 11, color: inkFraco, marginTop: 2 },

  tela: { flex: 1, backgroundColor: cores.fundo },
  corpo: { flex: 1 },

  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  botaoVoltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  tituloTela: { flexShrink: 1, fontSize: 17, fontWeight: '800', color: cores.ink },

  caixaBusca: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 14,
    height: 48,
    borderRadius: 14,
    backgroundColor: cores.cartao,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  /* 16px é o mínimo que o iOS aceita sem dar zoom automático no campo. */
  campoBusca: { flex: 1, fontSize: 16, color: cores.ink },

  conteudo: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 24, gap: 8 },
  carregando: { marginTop: 28 },
  dica: {
    marginTop: 28,
    fontSize: 13.5,
    lineHeight: 20,
    color: inkSuave,
    textAlign: 'center',
  },

  blocoErro: {
    marginTop: 24,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: cores.erroBorda,
    backgroundColor: cores.erroFundo,
  },
  tituloErro: { fontSize: 14, fontWeight: '700', color: cores.erroTexto },
  detalheErro: { marginTop: 6, fontSize: 12.5, lineHeight: 18, color: cores.erroTexto },

  resultado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: cores.cartao,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  resultadoPressionado: { backgroundColor: cores.verdeMenta, borderColor: cores.verdeClaro },
  textoResultado: { flex: 1 },
  nomeResultado: { fontSize: 14.5, fontWeight: '700', color: cores.ink, lineHeight: 19 },
  detalheResultado: { marginTop: 3, fontSize: 12, color: inkSuave },

  rodapeContagem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 10,
    paddingHorizontal: 20,
  },
  textoContagem: { fontSize: 13, fontWeight: '600', color: inkMedio },

  fundoPainel: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.62)' },
  painel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: cores.fundo,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 20,
  },
  puxador: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: cores.trilho,
    marginBottom: 14,
  },
  nomePainel: { fontSize: 17, fontWeight: '800', color: cores.ink, lineHeight: 23 },
  marcaPainel: { marginTop: 2, fontSize: 13, color: inkSuave },

  seletor: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 16,
    padding: 4,
    borderRadius: 14,
    backgroundColor: cores.cartao,
  },
  opcaoSeletor: { flex: 1, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  opcaoSeletorAtiva: { backgroundColor: cores.superficie },
  textoSeletor: { fontSize: 13.5, fontWeight: '600', color: inkSuave },
  textoSeletorAtivo: { fontWeight: '800', color: cores.ink },

  linhaQuantidade: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginTop: 16 },
  blocoCampo: { width: 130 },
  blocoQuantas: { width: 96 },
  blocoMedida: { flex: 1 },
  blocoTotal: { flex: 1 },
  rotuloCampo: { marginBottom: 6, fontSize: 12.5, fontWeight: '600', color: inkSuave },
  campoComUnidade: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.cartao,
  },
  entradaNumero: { flex: 1, fontSize: 18, fontWeight: '700', color: cores.ink },
  entradaTexto: { flex: 1, fontSize: 16, fontWeight: '600', color: cores.ink },

  fitas: { gap: 8, paddingTop: 10, paddingRight: 20 },
  fita: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.cartao,
  },
  fitaAtiva: { backgroundColor: cores.verdeMenta, borderColor: cores.verdeClaro },
  textoFita: { fontSize: 12.5, fontWeight: '600', color: inkMedio },
  textoFitaAtivo: { color: cores.verdeEscuro, fontWeight: '700' },
  unidade: { fontSize: 14, fontWeight: '600', color: inkSuave },
  total: { fontSize: 22, fontWeight: '800', color: cores.verde, letterSpacing: -0.4 },
  macros: { marginTop: 3, fontSize: 12, color: inkSuave },

  botaoAdicionar: {
    marginTop: 20,
    height: 54,
    borderRadius: 16,
    backgroundColor: cores.verde,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoAdicionarPressionado: { backgroundColor: cores.verdeEscuro },
  botaoDesativado: { opacity: 0.5 },
  textoBotaoAdicionar: { fontSize: 15.5, fontWeight: '700', color: cores.branco },
})
