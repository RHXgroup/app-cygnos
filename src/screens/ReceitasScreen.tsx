import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
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
import { BuscarAlimentoScreen } from './BuscarAlimentoScreen'
import { EscreverRefeicaoScreen } from './EscreverRefeicaoScreen'
import { Confirmacao } from '../components/Confirmacao'
import {
  apagarReceita,
  caloriasDaPorcao,
  carregarReceitas,
  porcaoDaReceita,
  salvarReceita,
  type ItemReceita,
  type Receita,
} from '../lib/receitas'
import { detalheDoItem, novaChave, type AlimentoEscolhido } from '../lib/plano'
import { milhar } from '../lib/formatar'
import { estilosDe, paleta } from '../lib/tema'

/* As receitas do paciente: o que ele come junto e repete.
 *
 * Uma tela, dois modos. A lista é o que se vê quase sempre — abrir uma receita
 * para comê-la é o gesto de todo dia. O editor aparece quando se cria ou se
 * ajusta, que acontece uma vez por receita.
 *
 * ── O que acontece ao usar ─────────────────────────────────────────────────
 * A receita vira os alimentos dela, na proporção da porção escolhida. Ela NÃO
 * entra no diário como uma linha só: a nutricionista precisa ver banana, aveia
 * e leite, e "minha vitamina" não diria nada a ela. */
export function ReceitasScreen({
  contaId,
  onUsar,
  onFechar,
}: {
  contaId: string
  /* Os alimentos de uma porção, prontos para o consumo ou para o plano.
     Ausente quando a tela é aberta para ORGANIZAR e não para comer — em
     "Meus cadastros" não existe refeição em curso para onde mandar a receita,
     e um botão "usar" ali perguntaria "usar onde?". Sem ele, tocar na receita
     abre a edição, que é o que se quer fazer naquele lugar. */
  onUsar?: (itens: AlimentoEscolhido[], nomeDaReceita: string) => void
  onFechar: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const [receitas, setReceitas] = useState<Receita[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  /* null = a lista. Um objeto = o editor, com a receita que está sendo mexida
     (ou uma vazia, quando é nova). */
  const [editando, setEditando] = useState<Receita | null>(null)
  const [apagandoRec, setApagandoRec] = useState<Receita | null>(null)
  /* Qual receita está com o seletor de porções aberto. */
  const [usando, setUsando] = useState<Receita | null>(null)

  useEffect(() => {
    let vivo = true
    carregarReceitas(contaId).then(r => {
      if (!vivo) return
      if (r.tipo === 'erro') setErro(r.mensagem)
      else {
        setErro('')
        setReceitas(r.receitas)
      }
      setCarregando(false)
    })
    return () => {
      vivo = false
    }
  }, [contaId])

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (usando) {
        setUsando(null)
        return true
      }
      if (editando) return false
      onFechar()
      return true
    })
    return () => sub.remove()
  }, [usando, editando, onFechar])

  async function apagar(r: Receita) {
    setApagandoRec(null)
    setReceitas(atuais => atuais.filter(x => x.id !== r.id))

    const falha = await apagarReceita(r.id)
    if (falha) {
      setReceitas(atuais => [...atuais, r].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)))
      setErro(falha.erro)
    }
  }

  function usar(r: Receita, porcoes: number) {
    if (!onUsar) return
    setUsando(null)
    onUsar(porcaoDaReceita(r, porcoes), r.nome)
    onFechar()
  }

  if (editando) {
    return (
      <EditorDeReceita
        receita={editando}
        onFechar={() => setEditando(null)}
        onSalvo={salva => {
          setReceitas(atuais => {
            const outras = atuais.filter(r => r.id !== salva.id)
            return [salva, ...outras]
          })
          setEditando(null)
        }}
      />
    )
  }

  return (
    <View style={[styles.tela, { paddingTop: top + 8 }]}>
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
        <Text style={styles.tituloTela}>Minhas receitas</Text>
        <View style={styles.botaoVoltar} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.conteudo, { paddingBottom: bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {carregando ? (
          <ActivityIndicator color={paleta().cores.verde} style={styles.girando} />
        ) : (
          <>
            {!!erro && <Text style={styles.erro}>{erro}</Text>}

            {receitas.length === 0 && !erro && (
              <Text style={styles.vazio}>
                Uma receita é o que você come junto e repete: a vitamina da manhã, o sanduíche
                da tarde. Monte uma vez e registre com um toque, em vez de buscar alimento por
                alimento toda vez.
              </Text>
            )}

            {receitas.map(r => {
              const kcal = caloriasDaPorcao(r)
              return (
                <View key={r.id} style={styles.cartao}>
                  <Pressable
                    onPress={() =>
                      !onUsar ? setEditando(r) : r.porcoes === 1 ? usar(r, 1) : setUsando(r)
                    }
                    style={({ pressed }) => [styles.corpoCartao, pressed && styles.pressionado]}
                    accessibilityRole="button"
                    accessibilityLabel={
                      onUsar ? `Usar a receita ${r.nome}` : `Editar a receita ${r.nome}`
                    }
                  >
                    <View style={styles.textoCartao}>
                      <Text style={styles.nomeReceita} numberOfLines={1}>
                        {r.nome}
                      </Text>
                      <Text style={styles.detalheReceita} numberOfLines={1}>
                        {r.itens.length} {r.itens.length === 1 ? 'alimento' : 'alimentos'}
                        {r.porcoes > 1 && ` · rende ${r.porcoes} porções`}
                        {kcal !== null && ` · ${milhar(kcal)} kcal por porção`}
                      </Text>
                    </View>
                    <Ionicons
                      name={onUsar ? 'add-circle-outline' : 'chevron-forward'}
                      size={22}
                      color={onUsar ? paleta().cores.verde : paleta().inkFraco}
                    />
                  </Pressable>

                  <View style={styles.acoes}>
                    <Pressable
                      onPress={() => setEditando(r)}
                      hitSlop={8}
                      style={styles.acao}
                      accessibilityRole="button"
                      accessibilityLabel={`Editar ${r.nome}`}
                    >
                      <Ionicons name="create-outline" size={15} color={paleta().inkMedio} />
                      <Text style={styles.textoAcao}>Editar</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => setApagandoRec(r)}
                      hitSlop={8}
                      style={styles.acao}
                      accessibilityRole="button"
                      accessibilityLabel={`Apagar ${r.nome}`}
                    >
                      <Ionicons name="trash-outline" size={15} color={paleta().inkFraco} />
                      <Text style={styles.textoAcaoFraca}>Apagar</Text>
                    </Pressable>
                  </View>
                </View>
              )
            })}

            <Pressable
              onPress={() =>
                setEditando({ id: '', nome: '', porcoes: 1, criadoEm: '', itens: [] })
              }
              style={({ pressed }) => [styles.botaoNova, pressed && styles.pressionado]}
              accessibilityRole="button"
            >
              <Ionicons name="add" size={18} color={paleta().cores.verde} />
              <Text style={styles.textoBotaoNova}>Nova receita</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      {/* Quantas porções desta vez. Só aparece quando a receita rende mais de
          uma: perguntar "quantas porções?" para algo que rende uma só seria um
          toque a mais sem escolha nenhuma. */}
      {usando && (
        <View style={StyleSheet.absoluteFill}>
          <Pressable style={styles.fundoFolha} onPress={() => setUsando(null)} />
          <View style={[styles.folha, { paddingBottom: Math.max(bottom, 16) }]}>
            <View style={styles.puxador} />
            <Text style={styles.tituloFolha}>Quanto você comeu?</Text>
            <Text style={styles.subFolha}>
              {usando.nome} rende {usando.porcoes} porções
            </Text>

            <View style={styles.porcoes}>
              {Array.from({ length: usando.porcoes }, (_, i) => i + 1).map(n => (
                <Pressable
                  key={n}
                  onPress={() => usar(usando, n)}
                  style={({ pressed }) => [styles.botaoPorcao, pressed && styles.pressionado]}
                  accessibilityRole="button"
                >
                  <Text style={styles.textoPorcao}>
                    {n === usando.porcoes ? 'Tudo' : `${n} de ${usando.porcoes}`}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      )}

      <Confirmacao
        visivel={apagandoRec !== null}
        titulo="Apagar esta receita?"
        mensagem={`"${apagandoRec?.nome ?? ''}" será removida. O que você já registrou com ela continua no diário.`}
        rotuloConfirmar="Apagar"
        destrutiva
        onCancelar={() => setApagandoRec(null)}
        onConfirmar={() => apagandoRec && apagar(apagandoRec)}
      />
    </View>
  )
}

/* ── O editor ──────────────────────────────────────────────────────────────*/

function EditorDeReceita({
  receita,
  onFechar,
  onSalvo,
}: {
  receita: Receita
  onFechar: () => void
  onSalvo: (r: Receita) => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const [nome, setNome] = useState(receita.nome)
  const [porcoes, setPorcoes] = useState(receita.porcoes)
  const [itens, setItens] = useState<ItemReceita[]>(receita.itens)
  const [buscando, setBuscando] = useState(false)
  const [escrevendo, setEscrevendo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (buscando) {
        setBuscando(false)
        return true
      }
      if (escrevendo) {
        setEscrevendo(false)
        return true
      }
      onFechar()
      return true
    })
    return () => sub.remove()
  }, [buscando, escrevendo, onFechar])

  function juntar(novos: AlimentoEscolhido[]) {
    setItens(atuais => [
      ...atuais,
      ...novos.map(a => ({
        chave: novaChave(),
        alimentoId: a.alimentoId,
        nome: a.nome,
        marca: a.marca,
        descricao: a.descricao,
        gramasTotais: a.gramasTotais,
        caloriasPor100g: a.caloriasPor100g,
        proteinasPor100g: a.proteinasPor100g,
        carboidratosPor100g: a.carboidratosPor100g,
        gordurasPor100g: a.gordurasPor100g,
        fibrasPor100g: a.fibrasPor100g,
      })),
    ])
    setErro('')
  }

  async function salvar() {
    const limpo = nome.trim()
    if (!limpo) {
      setErro('Dê um nome à receita.')
      return
    }
    if (itens.length === 0) {
      setErro('Adicione pelo menos um alimento.')
      return
    }

    setSalvando(true)
    const r = await salvarReceita({
      id: receita.id || null,
      nome: limpo,
      porcoes,
      itens,
    })
    setSalvando(false)

    if (r.tipo === 'erro') {
      setErro(r.mensagem)
      return
    }

    onSalvo({
      id: r.id,
      nome: limpo,
      porcoes,
      criadoEm: receita.criadoEm || new Date().toISOString(),
      itens,
    })
  }

  if (buscando) {
    return (
      <BuscarAlimentoScreen
        refeicao={nome || 'Receita'}
        onFechar={() => setBuscando(false)}
        onAdicionar={a => juntar([a])}
      />
    )
  }

  if (escrevendo) {
    return (
      <EscreverRefeicaoScreen
        refeicao={nome || 'a receita'}
        onFechar={() => setEscrevendo(false)}
        onAdicionar={juntar}
      />
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
        <Text style={styles.tituloTela}>{receita.id ? 'Editar receita' : 'Nova receita'}</Text>
        <View style={styles.botaoVoltar} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.conteudo, { paddingBottom: bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <TextInput
          value={nome}
          onChangeText={t => {
            setNome(t)
            setErro('')
          }}
          placeholder="Vitamina da manhã"
          placeholderTextColor={paleta().inkFraco}
          keyboardAppearance="dark"
          maxLength={60}
          style={styles.campoNome}
          accessibilityLabel="Nome da receita"
        />

        <Text style={styles.rotulo}>Rende quantas porções</Text>
        <View style={styles.porcoes}>
          {[1, 2, 3, 4, 6].map(n => (
            <Pressable
              key={n}
              onPress={() => setPorcoes(n)}
              style={({ pressed }) => [
                styles.chipPorcao,
                porcoes === n && styles.chipPorcaoAtivo,
                pressed && styles.pressionado,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: porcoes === n }}
            >
              <Text style={[styles.textoChip, porcoes === n && styles.textoChipAtivo]}>{n}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.ajuda}>
          Uma porção é o que você come de cada vez. Uma vitamina que enche dois copos rende
          duas.
        </Text>

        <Text style={styles.rotulo}>Alimentos</Text>
        {itens.map(i => (
          <View key={i.chave} style={styles.item}>
            <View style={styles.textoItem}>
              <Text style={styles.nomeItem} numberOfLines={1}>
                {i.nome}
              </Text>
              <Text style={styles.detalheItem}>{detalheDoItem(i)}</Text>
            </View>
            <Pressable
              onPress={() => setItens(atuais => atuais.filter(x => x.chave !== i.chave))}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Remover ${i.nome}`}
            >
              <Ionicons name="close" size={16} color={paleta().inkFraco} />
            </Pressable>
          </View>
        ))}

        <Pressable
          onPress={() => setBuscando(true)}
          style={({ pressed }) => [styles.botaoNova, pressed && styles.pressionado]}
          accessibilityRole="button"
        >
          <Ionicons name="add" size={17} color={paleta().cores.verde} />
          <Text style={styles.textoBotaoNova}>Adicionar alimento</Text>
        </Pressable>

        <Pressable
          onPress={() => setEscrevendo(true)}
          style={({ pressed }) => [styles.botaoEscrever, pressed && styles.pressionado]}
          accessibilityRole="button"
        >
          <Ionicons name="create-outline" size={15} color={paleta().inkMedio} />
          <Text style={styles.textoBotaoEscrever}>Escrever tudo de uma vez</Text>
        </Pressable>

        {!!erro && <Text style={styles.erro}>{erro}</Text>}

        <Pressable
          onPress={salvar}
          disabled={salvando}
          style={({ pressed }) => [
            styles.botaoSalvar,
            salvando && styles.pressionado,
            pressed && styles.pressionado,
          ]}
          accessibilityRole="button"
        >
          {salvando ? (
            <ActivityIndicator size="small" color={paleta().cores.branco} />
          ) : (
            <Text style={styles.textoBotaoSalvar}>Salvar receita</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
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

  conteudo: { paddingHorizontal: 20, paddingTop: 4, gap: 10 },
  girando: { marginTop: 40 },
  vazio: { fontSize: 14, color: t.inkSuave, lineHeight: 21, paddingVertical: 10 },
  erro: { fontSize: 13, color: t.cores.erroTexto, lineHeight: 19 },

  cartao: {
    backgroundColor: t.cores.cartao,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.borda,
    overflow: 'hidden',
  },
  corpoCartao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 15,
  },
  textoCartao: { flex: 1, gap: 2 },
  nomeReceita: { fontSize: 15.5, fontWeight: '700', color: t.cores.ink },
  detalheReceita: { fontSize: 12.5, color: t.inkSuave },

  acoes: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: t.cores.borda,
  },
  acao: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  textoAcao: { fontSize: 12.5, fontWeight: '700', color: t.inkMedio },
  textoAcaoFraca: { fontSize: 12.5, fontWeight: '700', color: t.inkFraco },

  botaoNova: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: t.cores.trilho,
    marginTop: 4,
  },
  textoBotaoNova: { fontSize: 14, fontWeight: '700', color: t.cores.verde },

  botaoEscrever: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  textoBotaoEscrever: { fontSize: 12.5, fontWeight: '700', color: t.inkMedio },

  campoNome: {
    backgroundColor: t.cores.superficie,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.cores.borda,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    fontWeight: '700',
    color: t.cores.ink,
  },
  rotulo: { fontSize: 12.5, fontWeight: '700', color: t.inkMedio, marginTop: 6 },
  ajuda: { fontSize: 12, color: t.inkFraco, lineHeight: 18 },

  porcoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipPorcao: {
    minWidth: 46,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.cores.borda,
    backgroundColor: t.cores.superficie,
  },
  chipPorcaoAtivo: { backgroundColor: t.cores.limao, borderColor: t.cores.limao },
  textoChip: { fontSize: 14, fontWeight: '700', color: t.cores.ink },
  textoChipAtivo: { color: t.cores.sobreLimao },

  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: t.cores.cartao,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.cores.borda,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  textoItem: { flex: 1, gap: 1 },
  nomeItem: { fontSize: 14.5, fontWeight: '700', color: t.cores.ink },
  detalheItem: { fontSize: 12, color: t.inkSuave },

  botaoSalvar: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: t.cores.verde,
    marginTop: 8,
  },
  textoBotaoSalvar: { fontSize: 15, fontWeight: '800', color: t.cores.branco },

  pressionado: { opacity: 0.75 },

  fundoFolha: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  folha: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: t.cores.superficie,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 8,
  },
  puxador: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 4,
    backgroundColor: t.cores.trilho,
    marginBottom: 8,
  },
  tituloFolha: { fontSize: 17, fontWeight: '800', color: t.cores.ink },
  subFolha: { fontSize: 13, color: t.inkSuave, marginBottom: 6 },
  botaoPorcao: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.cores.borda,
    backgroundColor: t.cores.cartao,
  },
  textoPorcao: { fontSize: 14, fontWeight: '700', color: t.cores.ink },
  }),
)
