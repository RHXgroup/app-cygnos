import { useEffect, useCallback, useRef, useState } from 'react'
import {
  Animated,
  BackHandler,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ModoPlanoScreen } from './ModoPlanoScreen'
import { MontarPlanoScreen } from './MontarPlanoScreen'
import { SugerirPlanoScreen } from './SugerirPlanoScreen'
import type { ItemAlimento } from '../lib/plano'
import { mascaraHora, validarHora } from '../lib/formulario'
import { estilosDe, paleta } from '../lib/tema'

type Item = {
  id: string
  /* Veio da lista fixa (café, almoço…) ou foi criado pelo paciente. O que muda:
     o padrão tem rótulo fixo e caixa de marcar; o criado tem nome digitado, e
     existir já significa fazer parte do dia. */
  padrao: boolean
  rotulo: string
  marcada: boolean
  hora: string
  /* Horário que aparece ao marcar. Palpite de rotina comum, não prescrição — o
     campo continua editável. */
  sugestao: string
  erro: boolean
}

const PADRAO: [string, string][] = [
  ['Café da manhã', '07:00'],
  ['Lanche da manhã', '10:00'],
  ['Almoço', '12:30'],
  ['Lanche da tarde', '16:00'],
  ['Janta', '19:30'],
  ['Ceia', '21:30'],
]

const inicial = (): Item[] =>
  PADRAO.map(([rotulo, sugestao]) => ({
    id: rotulo,
    padrao: true,
    rotulo,
    marcada: false,
    hora: '',
    sugestao,
    erro: false,
  }))

/* Altura de uma linha mais o vão até a próxima. É o passo do arraste: dividir o
   dedo percorrido por este número dá quantas posições a refeição andou. Se o
   estilo da linha mudar, este número muda junto. */
const ALTURA_LINHA = 58
const VAO_LINHA = 8
const PASSO = ALTURA_LINHA + VAO_LINHA

export type RefeicaoEscolhida = { id: string; rotulo: string; hora: string }

function mover<T>(lista: T[], de: number, para: number): T[] {
  const copia = [...lista]
  const [item] = copia.splice(de, 1)
  copia.splice(para, 0, item)
  return copia
}

/* Primeira etapa de montar o plano: quais refeições o dia tem, a que horas e em
 * que ordem.
 *
 * A ordem é do paciente, arrastando — e NÃO deduzida do horário. Parecem a
 * mesma coisa, mas não são: quem trabalha à noite pode querer a ceia antes do
 * café, e ordenar pelo relógio desmancharia isso a cada digitação. */
export function RefeicoesDoDiaScreen({
  contaId,
  onFechar,
  onSalvo,
  onDefinirMetas,
}: {
  /* Só a sugestão da Aurora usa: ela precisa ler as metas e o cálculo
     energético para saber o tamanho das porções. O resto do fluxo monta o
     plano sem consultar nada da conta. */
  contaId: string
  onFechar: () => void
  /* Sem meta de calorias a Aurora não tem o que sugerir, e a tela oferece o
     caminho em vez de virar beco sem saída. Sobe até o App porque a tela de
     metas precisa cobrir esta. */
  onDefinirMetas: () => void
  /* Plano gravado: o fluxo inteiro fecha e quem chamou volta para a tela
     inicial, onde o plano agora aparece. */
  onSalvo: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const [itens, setItens] = useState<Item[]>(inicial)
  const [erroGeral, setErroGeral] = useState('')
  const [escolhidas, setEscolhidas] = useState<RefeicaoEscolhida[] | null>(null)
  const [sugerindo, setSugerindo] = useState(false)
  /* O dia que a Aurora montou, esperando a tela de montar abrir. */
  const [iniciais, setIniciais] = useState<Record<string, ItemAlimento[]> | undefined>(undefined)
  /* E o que ela tem a dizer sobre o que montou — o que não achou na base, e o
     que achou incoerente no pedido. Vai junto porque a tela de montar é onde a
     pessoa confere, e é ali que o aviso tem serventia. */
  const [avisoDaAurora, setAvisoDaAurora] = useState<
    { observacao: string; alerta: string | null; estimados: number } | undefined
  >(undefined)
  const [montando, setMontando] = useState(false)

  /* O arraste roda dentro de callbacks criados uma vez só; sem este espelho
     eles enxergariam para sempre a lista do primeiro render. */
  const itensRef = useRef(itens)
  itensRef.current = itens

  /* O voltar do Android desfaz uma etapa do assistente por vez.
   *
   * São três em sequência — escolher as refeições, escolher como montar, montar
   * — e sem isto o botão do aparelho abandonava o plano inteiro a partir de
   * qualquer uma delas. Quem estava na terceira etapa perdia as duas primeiras
   * sem aviso, que é exatamente o tipo de perda que faz desistir de recomeçar. */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (montando) {
        setMontando(false)
        return true
      }
      if (escolhidas) {
        setEscolhidas(null)
        return true
      }
      onFechar()
      return true
    })

    return () => sub.remove()
  }, [montando, escolhidas, onFechar])

  const [arrastandoId, setArrastandoId] = useState<string | null>(null)
  /* Um deslocamento por linha, e a lista NÃO muda enquanto o dedo está na tela.
     Reordenar o array a cada troca — que era como estava — obrigava a descontar
     o caminho já andado e repunha a linha sob o dedo só no quadro seguinte: era
     daí que vinha o tranco. Agora o array só muda quando o dedo solta; até lá o
     que se move é o deslocamento de cada linha, e as vizinhas deslizam. */
  const deslocamentos = useRef(new Map<string, Animated.Value>()).current
  const deslocamentoDe = (id: string) => {
    let v = deslocamentos.get(id)
    if (!v) {
      v = new Animated.Value(0)
      deslocamentos.set(id, v)
    }
    return v
  }

  /* Zera todo mundo de uma vez. O stopAnimation não é zelo à toa: uma vizinha
     ainda no meio do deslize sobrescreveria o zero logo depois de ele ser
     posto, e a linha voltaria sozinha para o lugar errado. */
  const zerarDeslocamentos = (lista: Item[]) => {
    for (const item of lista) {
      const v = deslocamentoDe(item.id)
      v.stopAnimation()
      v.setValue(0)
    }
  }

  /* De onde a linha saiu e onde ela cairia se o dedo soltasse agora. */
  const origem = useRef(0)
  const alvo = useRef(0)
  /* A nova ordem só é gravada quando a linha termina de assentar. Se o dedo
     voltar à tela antes disso, este fecho é executado na hora — senão o arraste
     novo começaria contando as posições da ordem antiga. */
  const assentando = useRef<(() => void) | null>(null)

  function terminarArrasteAnterior() {
    const f = assentando.current
    assentando.current = null
    f?.()
  }

  const contador = useRef(0)

  const marcadas = itens.filter(i => i.marcada)

  function mexer(id: string, mudanca: Partial<Item>) {
    setItens(lista => lista.map(i => (i.id === id ? { ...i, ...mudanca, erro: false } : i)))
    setErroGeral('')
  }

  function alternar(item: Item) {
    mexer(item.id, {
      marcada: !item.marcada,
      /* Só sugere na primeira marcação: quem já digitou um horário e desmarcou
         sem querer não perde o que escreveu. */
      hora: !item.marcada && !item.hora ? item.sugestao : item.hora,
    })
  }

  function adicionarOutra() {
    contador.current += 1
    setItens(lista => [
      ...lista,
      {
        id: `outra-${contador.current}`,
        padrao: false,
        rotulo: '',
        marcada: true,
        hora: '',
        sugestao: '',
        erro: false,
      },
    ])
    setErroGeral('')
  }

  const aoPegar = useCallback((id: string) => {
    terminarArrasteAnterior()
    origem.current = itensRef.current.findIndex(i => i.id === id)
    alvo.current = origem.current
    zerarDeslocamentos(itensRef.current)
    setArrastandoId(id)
  }, [])

  const aoArrastar = useCallback((dy: number) => {
    const lista = itensRef.current
    const de = origem.current

    /* A linha arrastada acompanha o dedo em linha reta, sem conta nenhuma pelo
       caminho — é o que faz o movimento parecer preso ao toque. */
    deslocamentoDe(lista[de].id).setValue(dy)

    const novo = Math.min(Math.max(de + Math.round(dy / PASSO), 0), lista.length - 1)
    if (novo === alvo.current) return
    alvo.current = novo

    /* As vizinhas abrem espaço deslizando, em vez de trocar de lugar de um
       quadro para o outro. */
    lista.forEach((item, i) => {
      if (i === de) return

      let destino = 0
      if (novo > de && i > de && i <= novo) destino = -PASSO
      else if (novo < de && i >= novo && i < de) destino = PASSO

      Animated.timing(deslocamentoDe(item.id), {
        toValue: destino,
        duration: 160,
        /* Sem driver nativo de propósito: no fim do arraste os deslocamentos
           voltam a zero no mesmo instante em que a lista muda de ordem, e só
           passando pelo JS os dois acontecem no mesmo quadro. Pela ponte
           nativa, um chega antes do outro e a linha pisca. */
        useNativeDriver: false,
      }).start()
    })
  }, [])

  const aoSoltar = useCallback(() => {
    const lista = itensRef.current
    const de = origem.current
    const para = alvo.current

    /* Zerar e reordenar no mesmo instante: como a linha já está parada na casa
       de destino, trocar a ordem por baixo não muda nada na tela. */
    const gravar = () => {
      zerarDeslocamentos(lista)
      const nova = para === de ? lista : mover(lista, de, para)
      /* O espelho junto com o estado: um arraste que comece antes do próximo
         render precisa enxergar a ordem nova. */
      itensRef.current = nova
      setItens(nova)
      setArrastandoId(null)
    }

    assentando.current = gravar

    /* Acomoda a linha na casa onde ela vai parar antes de mexer no array. Sem
       isto ela salta até meio passo no momento em que o dedo sai. */
    Animated.timing(deslocamentoDe(lista[de].id), {
      toValue: (para - de) * PASSO,
      duration: 130,
      useNativeDriver: false,
    }).start(() => {
      /* Pode já ter sido gravado por um toque novo; nesse caso não há o que
         fazer aqui. */
      if (assentando.current !== gravar) return
      assentando.current = null
      gravar()
    })
  }, [])

  function continuar() {
    if (marcadas.length === 0) {
      setErroGeral('Marque pelo menos uma refeição.')
      return
    }

    const comProblema = new Set(
      marcadas
        .filter(i => (i.padrao ? false : !i.rotulo.trim()) || validarHora(i.hora) !== null)
        .map(i => i.id),
    )

    if (comProblema.size > 0) {
      setItens(lista => lista.map(i => ({ ...i, erro: comProblema.has(i.id) })))
      setErroGeral('Confira o nome e o horário das refeições em destaque.')
      return
    }

    setEscolhidas(marcadas.map(i => ({ id: i.id, rotulo: i.rotulo.trim(), hora: i.hora })))
  }

  /* As etapas seguintes vivem dentro desta moldura, que é só fundo e altura: o
     respiro do notch fica com cada uma. Aplicá-lo aqui em cima somaria duas
     vezes na tela de busca, que é a única a se abrir por dentro de outra. */
  if (escolhidas) {
    return (
      <View style={styles.tela}>
        {sugerindo ? (
          <SugerirPlanoScreen
            contaId={contaId}
            refeicoes={escolhidas}
            onPronto={plano => {
              /* Casa a resposta da IA com as refeições escolhidas por POSIÇÃO.
                 A função pediu para ela devolver uma para cada, na ordem, mas
                 uma a mais ou a menos não pode derrubar nada: o que sobrar do
                 lado da IA é ignorado, e o que faltar fica vazio para a pessoa
                 preencher — que é exatamente o estado de quem veio pela porta
                 manual. */
              const porRefeicao: Record<string, ItemAlimento[]> = {}
              escolhidas.forEach((r, i) => {
                const daIA = plano.refeicoes[i]
                if (daIA) porRefeicao[r.id] = daIA.itens
              })
              setIniciais(porRefeicao)
              setAvisoDaAurora({
                observacao: plano.observacao,
                alerta: plano.alerta,
                estimados: plano.estimados,
              })
              setSugerindo(false)
              setMontando(true)
            }}
            onVoltar={() => setSugerindo(false)}
            onDefinirMetas={onDefinirMetas}
          />
        ) : montando ? (
          <MontarPlanoScreen
            refeicoes={escolhidas}
            iniciais={iniciais}
            avisoDaAurora={avisoDaAurora}
            onVoltar={() => {
              setMontando(false)
              /* Voltar descarta a sugestão: quem voltou está trocando de
                 caminho, e reencontrar o plano da IA ao entrar no manual seria
                 o app decidindo por ele. */
              setIniciais(undefined)
              setAvisoDaAurora(undefined)
            }}
            onSalvo={onSalvo}
          />
        ) : (
          <ModoPlanoScreen
            quantasRefeicoes={escolhidas.length}
            onManual={() => setMontando(true)}
            onAurora={() => setSugerindo(true)}
            onVoltar={() => setEscolhidas(null)}
          />
        )}
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={[styles.tela, { paddingTop: top + 8 }]}
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
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela}>Planejamento alimentar</Text>
        <View style={styles.botaoVoltar} />
      </View>

      <ScrollView
        contentContainerStyle={styles.conteudo}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        /* Enquanto o dedo arrasta uma linha, a lista inteira não pode rolar
           junto — senão o conteúdo foge por baixo do que está sendo movido. */
        scrollEnabled={!arrastandoId}
        bounces={false}
        overScrollMode="never"
      >
        <Text style={styles.pergunta}>Quantas refeições deseja no dia?</Text>
        <Text style={styles.apoio}>
          Marque as que fazem parte da sua rotina e informe o horário de cada uma. Arraste pelo
          punho à direita para mudar a ordem do dia.
        </Text>

        <View style={styles.lista}>
          {itens.map(item => (
            <Linha
              key={item.id}
              item={item}
              arrastando={arrastandoId === item.id}
              deslocamento={deslocamentoDe(item.id)}
              onAlternar={() => alternar(item)}
              onHora={h => mexer(item.id, { hora: mascaraHora(h) })}
              onNome={n => mexer(item.id, { rotulo: n })}
              onRemover={() => {
                deslocamentos.delete(item.id)
                setItens(lista => lista.filter(i => i.id !== item.id))
              }}
              onPegar={aoPegar}
              onArrastar={aoArrastar}
              onSoltar={aoSoltar}
            />
          ))}
        </View>

        <Pressable
          onPress={adicionarOutra}
          style={({ pressed }) => [styles.botaoAdicionar, pressed && styles.botaoAdicionarPressionado]}
          accessibilityRole="button"
        >
          <Ionicons name="add" size={18} color={paleta().cores.verde} />
          <Text style={styles.textoBotaoAdicionar}>Adicionar outra refeição</Text>
        </Pressable>

        {!!erroGeral && <Text style={styles.erroGeral}>{erroGeral}</Text>}
      </ScrollView>

      <View style={[styles.rodape, { paddingBottom: Math.max(bottom, 16) }]}>
        <Text style={styles.contagem}>
          {marcadas.length === 0
            ? 'Nenhuma refeição marcada'
            : `${marcadas.length} ${marcadas.length === 1 ? 'refeição marcada' : 'refeições marcadas'}`}
        </Text>
        <Pressable
          onPress={continuar}
          style={({ pressed }) => [styles.botao, pressed && styles.botaoPressionado]}
          accessibilityRole="button"
        >
          <Text style={styles.textoBotao}>Continuar</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

function Linha({
  item,
  arrastando,
  deslocamento,
  onAlternar,
  onHora,
  onNome,
  onRemover,
  onPegar,
  onArrastar,
  onSoltar,
}: {
  item: Item
  arrastando: boolean
  deslocamento: Animated.Value
  onAlternar: () => void
  onHora: (h: string) => void
  onNome: (n: string) => void
  onRemover: () => void
  onPegar: (id: string) => void
  onArrastar: (dy: number) => void
  onSoltar: () => void
}) {
  const styles = estilos()
  /* Um PanResponder por linha, criado uma vez: é ele que sabe qual refeição o
     dedo pegou. Fica só no punho, e não na linha toda, para não disputar o
     toque com a caixa de marcar nem com os campos de texto. */
  const punho = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => onPegar(item.id),
      onPanResponderMove: (_, gesto) => onArrastar(gesto.dy),
      onPanResponderRelease: onSoltar,
      /* Sem isto, uma interrupção do sistema (chamada, notificação) deixaria a
         linha presa no ar. */
      onPanResponderTerminate: onSoltar,
      /* A lista por fora é uma ScrollView, que pede o gesto de volta assim que
         o dedo anda na vertical. Negar é o que impede o arraste de morrer no
         meio do caminho e a linha de travar. */
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    }),
  ).current

  return (
    <Animated.View
      style={[
        styles.cartao,
        item.marcada && styles.cartaoAtivo,
        item.erro && styles.cartaoComErro,
        arrastando && styles.cartaoArrastando,
        /* Toda linha carrega o próprio deslocamento, não só a que está sendo
           arrastada: são as vizinhas que precisam deslizar para abrir espaço. */
        { transform: [{ translateY: deslocamento }] },
      ]}
    >
      {item.padrao ? (
        <Pressable
          onPress={onAlternar}
          style={styles.alvoMarcar}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.marcada }}
          accessibilityLabel={item.rotulo}
        >
          <View style={[styles.caixa, item.marcada && styles.caixaMarcada]}>
            {item.marcada && <Ionicons name="checkmark" size={15} color={paleta().cores.branco} />}
          </View>
          <Text style={[styles.rotulo, item.marcada && styles.rotuloMarcado]} numberOfLines={1}>
            {item.rotulo}
          </Text>
        </Pressable>
      ) : (
        <>
          {/* Refeição criada não desmarca: ou ela existe, ou sai da lista. */}
          <Pressable
            onPress={onRemover}
            style={styles.botaoRemover}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Remover refeição"
          >
            <Ionicons name="close" size={17} color={paleta().inkFraco} />
          </Pressable>
          <TextInput
            value={item.rotulo}
            onChangeText={onNome}
            placeholder="Nome da refeição"
            placeholderTextColor={paleta().inkFraco}
            keyboardAppearance="dark"
            maxLength={40}
            autoCapitalize="sentences"
            style={styles.campoNome}
            accessibilityLabel="Nome da refeição"
          />
        </>
      )}

      {item.marcada && (
        <TextInput
          value={item.hora}
          onChangeText={onHora}
          placeholder="00:00"
          placeholderTextColor={paleta().inkFraco}
          keyboardAppearance="dark"
          keyboardType="number-pad"
          maxLength={5}
          style={styles.campoHora}
          accessibilityLabel={`Horário de ${item.rotulo || 'refeição'}`}
        />
      )}

      <View
        {...punho.panHandlers}
        style={styles.punho}
        accessibilityRole="adjustable"
        accessibilityLabel={`Mudar a posição de ${item.rotulo || 'refeição'}`}
      >
        <Ionicons name="reorder-two-outline" size={20} color={paleta().inkFraco} />
      </View>
    </Animated.View>
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

  conteudo: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  pergunta: { fontSize: 20, fontWeight: '800', color: t.cores.ink, letterSpacing: -0.4 },
  apoio: { marginTop: 6, marginBottom: 16, fontSize: 13.5, lineHeight: 20, color: t.inkSuave },

  lista: { gap: VAO_LINHA },
  cartao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    /* Altura fixa, e não conteúdo mandando: é dela que sai o passo do arraste.
       Por isso o erro é uma borda vermelha e uma mensagem no rodapé, e não um
       texto dentro da linha — que faria a linha crescer. */
    height: ALTURA_LINHA,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: t.cores.cartao,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  cartaoAtivo: { backgroundColor: t.cores.verdeMenta, borderColor: t.cores.verdeClaro },
  cartaoComErro: { borderColor: t.cores.erroBorda, backgroundColor: t.cores.erroFundo },
  cartaoArrastando: {
    /* zIndex resolve no iOS, elevation no Android — sem os dois a linha some
       por baixo da vizinha no meio do arraste. */
    zIndex: 10,
    elevation: 6,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },

  alvoMarcar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, height: '100%' },
  caixa: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: t.cores.trilho,
    backgroundColor: t.cores.superficie,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caixaMarcada: { backgroundColor: t.cores.verde, borderColor: t.cores.verde },
  rotulo: { flexShrink: 1, fontSize: 15, color: t.inkMedio },
  rotuloMarcado: { fontWeight: '700', color: t.cores.ink },

  botaoRemover: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  campoNome: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.cores.borda,
    backgroundColor: t.cores.superficie,
    paddingHorizontal: 10,
    /* 16px é o mínimo que o iOS aceita sem dar zoom automático no campo. */
    fontSize: 16,
    color: t.cores.ink,
  },
  campoHora: {
    width: 76,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.cores.borda,
    backgroundColor: t.cores.superficie,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: t.cores.ink,
  },
  punho: { width: 26, alignItems: 'center', justifyContent: 'center', height: '100%' },

  botaoAdicionar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    height: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: t.cores.verdeClaro,
  },
  botaoAdicionarPressionado: { backgroundColor: t.cores.verdeMenta },
  textoBotaoAdicionar: { fontSize: 14.5, fontWeight: '700', color: t.cores.verde },

  erroGeral: { marginTop: 14, fontSize: 13, color: t.cores.erroTexto, textAlign: 'center' },

  rodape: { paddingHorizontal: 20, paddingTop: 10, gap: 10 },
  contagem: { fontSize: 12.5, color: t.inkFraco, textAlign: 'center' },
  botao: {
    height: 54,
    borderRadius: 16,
    backgroundColor: t.cores.verde,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoPressionado: { backgroundColor: t.cores.verdeEscuro },
  textoBotao: { fontSize: 15.5, fontWeight: '700', color: t.cores.branco },
  }),
)
