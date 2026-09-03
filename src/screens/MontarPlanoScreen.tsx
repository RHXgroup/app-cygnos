import { useEffect, useState } from 'react'
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BuscarAlimentoScreen } from './BuscarAlimentoScreen'
import { EscreverRefeicaoScreen } from './EscreverRefeicaoScreen'
import { ResumoPlanoScreen } from './ResumoPlanoScreen'
import { milhar } from '../lib/formatar'
import { detalheDoItem, totaisDe, type ItemAlimento, type RefeicaoMontada } from '../lib/plano'
import { estilosDe, paleta } from '../lib/tema'
import type { RefeicaoEscolhida } from './RefeicoesDoDiaScreen'

/* O dia montado: cada refeição definida na primeira etapa, com os alimentos
   embaixo. Os itens ficam num mapa por refeição, e não numa lista só com o id
   junto, porque toda leitura desta tela é "o que tem nesta refeição". */
export function MontarPlanoScreen({
  refeicoes,
  iniciais,
  avisoDaAurora,
  onVoltar,
  onSalvo,
}: {
  refeicoes: RefeicaoEscolhida[]
  /* O dia já preenchido, quando se chega aqui pela sugestão da Aurora em vez
     da tela em branco. A partir daqui é tudo igual: a pessoa tira, troca e
     ajusta o que quiser, e grava pelo mesmo caminho.

     É por isso que a IA desemboca NESTA tela, e não numa tela própria de
     "confirmar sugestão": uma segunda tela de conferência teria de repetir a
     edição inteira que já existe aqui — ou não repetir, e aí a pessoa
     aprovaria um plano que ela não pôde corrigir. */
  iniciais?: Record<string, ItemAlimento[]>
  /* O que a Aurora tem a dizer sobre a sugestão que ela acabou de montar.
     Ausente quando se chegou aqui pela porta manual. */
  avisoDaAurora?: {
    observacao: string
    /* O que ela achou incoerente no que foi pedido. */
    alerta: string | null
    /* Quantos itens não foram achados na nossa base e estão com a estimativa
       DELA. É o aviso que não pode faltar: número estimado e número conferido
       não valem o mesmo, e a soma do dia é feita com os dois juntos. */
    estimados: number
  }
  onVoltar: () => void
  onSalvo: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const [itens, setItens] = useState<Record<string, ItemAlimento[]>>(iniciais ?? {})
  const [buscandoPara, setBuscandoPara] = useState<RefeicaoEscolhida | null>(null)
  /* A mesma refeição, pela outra porta: escrever tudo de uma vez em vez de
     buscar alimento por alimento. */
  const [escrevendoPara, setEscrevendoPara] = useState<RefeicaoEscolhida | null>(null)
  const [resumindo, setResumindo] = useState(false)
  const [erro, setErro] = useState('')

  /* O voltar do Android nas camadas desta tela.
   *
   * Sem isto, voltar do resumo caía na etapa anterior do assistente e levava
   * junto todos os alimentos já adicionados — o trabalho inteiro de montar o
   * dia, perdido por um toque no botão do aparelho.
   *
   * A busca não aparece aqui porque ela cuida de si: o tratador dela é
   * registrado depois e decide primeiro. */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (buscandoPara || escrevendoPara) return false
      if (resumindo) {
        setResumindo(false)
        return true
      }
      onVoltar()
      return true
    })

    return () => sub.remove()
  }, [buscandoPara, escrevendoPara, resumindo, onVoltar])

  /* O que segue para o resumo e para o banco: a refeição sem o id da tela, que
     não interessa a mais ninguém, e com os alimentos já dentro. A ordem é a
     desta lista — a mesma que o paciente arrastou na primeira etapa. */
  const montadas: RefeicaoMontada[] = refeicoes.map(r => ({
    chave: r.id,
    rotulo: r.rotulo,
    hora: r.hora,
    itens: itens[r.id] ?? [],
  }))

  if (resumindo) {
    return (
      <ResumoPlanoScreen
        refeicoes={montadas}
        onVoltar={() => setResumindo(false)}
        onSalvo={onSalvo}
      />
    )
  }

  if (escrevendoPara) {
    return (
      <EscreverRefeicaoScreen
        refeicao={escrevendoPara.rotulo}
        onFechar={() => setEscrevendoPara(null)}
        onAdicionar={novos => {
          setItens(atual => ({
            ...atual,
            [escrevendoPara.id]: [
              ...(atual[escrevendoPara.id] ?? []),
              ...novos.map(a => ({ ...a, variacoes: [] })),
            ],
          }))
          setErro('')
        }}
      />
    )
  }

  if (buscandoPara) {
    return (
      <BuscarAlimentoScreen
        refeicao={buscandoPara.rotulo}
        onFechar={() => setBuscandoPara(null)}
        onAdicionar={alimento => {
          /* Nasce sem variação: alternativa é assunto da tela de edição, depois
             de o plano existir. */
          setItens(atual => ({
            ...atual,
            [buscandoPara.id]: [...(atual[buscandoPara.id] ?? []), { ...alimento, variacoes: [] }],
          }))
          setErro('')
        }}
      />
    )
  }

  const totalDoDia = totaisDe(montadas.flatMap(r => r.itens))
  const quantosItens = montadas.reduce((soma, r) => soma + r.itens.length, 0)

  function continuar() {
    if (quantosItens === 0) {
      setErro('Adicione pelo menos um alimento antes de continuar.')
      return
    }
    setResumindo(true)
  }

  return (
    <>
      <View style={[styles.cabecalho, { paddingTop: top + 8 }]}>
        <Pressable
          onPress={onVoltar}
          style={styles.botaoVoltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela}>Seu plano</Text>
        <View style={styles.botaoVoltar} />
      </View>

      <ScrollView
        /* `flex: 1` na ROLAGEM, e nao so no container.
               Sem isto ela se dimensiona pelo conteudo e o rodape fixo -- irmao
               dela -- para onde o conteudo achar que acabou: no MEIO da tela.
               `contentContainerStyle` NAO resolve: ele estiliza o conteudo
               dentro da rolagem, e nao a rolagem. */
        style={styles.rolagem}
        contentContainerStyle={styles.conteudo}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
      >
        {avisoDaAurora && (
          <View style={styles.blocoAurora}>
            <View style={styles.linhaTituloAurora}>
              <Ionicons name="sparkles-outline" size={15} color={paleta().cores.verde} />
              <Text style={styles.tituloAurora}>Sugestão da Aurora</Text>
            </View>

            {!!avisoDaAurora.observacao && (
              <Text style={styles.textoAurora}>{avisoDaAurora.observacao}</Text>
            )}

            <Text style={styles.textoAurora}>
              Confira item por item antes de salvar. Tire o que você não come e ajuste as
              quantidades — depois de salvo, o plano é seu.
            </Text>

            {avisoDaAurora.estimados > 0 && (
              <Text style={styles.estimadosAurora}>
                {avisoDaAurora.estimados === 1
                  ? '1 alimento não está na nossa tabela, e os nutrientes dele são estimativa da Aurora.'
                  : `${avisoDaAurora.estimados} alimentos não estão na nossa tabela, e os nutrientes deles são estimativa da Aurora.`}
              </Text>
            )}

            {!!avisoDaAurora.alerta && (
              <Text style={styles.alertaAurora}>{avisoDaAurora.alerta}</Text>
            )}
          </View>
        )}

        {refeicoes.map(r => {
          const lista = itens[r.id] ?? []
          const t = totaisDe(lista)

          return (
            <View key={r.id} style={styles.bloco}>
              <View style={styles.cabecalhoRefeicao}>
                <View style={styles.hora}>
                  <Text style={styles.textoHora}>{r.hora}</Text>
                </View>
                <Text style={styles.nomeRefeicao} numberOfLines={1}>
                  {r.rotulo}
                </Text>
                {t.calorias !== null && (
                  <Text style={styles.kcalRefeicao}>{milhar(t.calorias)} kcal</Text>
                )}
              </View>

              {lista.map(item => (
                <View key={item.chave} style={styles.item}>
                  <View style={styles.textoItem}>
                    <Text style={styles.nomeItem} numberOfLines={2}>
                      {item.nome}
                    </Text>
                    <Text style={styles.detalheItem}>{detalheDoItem(item)}</Text>
                  </View>

                  <Pressable
                    onPress={() =>
                      setItens(atual => ({
                        ...atual,
                        [r.id]: (atual[r.id] ?? []).filter(i => i.chave !== item.chave),
                      }))
                    }
                    hitSlop={8}
                    style={styles.botaoRemover}
                    accessibilityRole="button"
                    accessibilityLabel={`Remover ${item.nome}`}
                  >
                    <Ionicons name="close" size={16} color={paleta().inkFraco} />
                  </Pressable>
                </View>
              ))}

              {t.semPeso > 0 && (
                <Text style={styles.semPeso}>
                  {t.semPeso === 1
                    ? '1 item sem peso informado — fora da soma'
                    : `${t.semPeso} itens sem peso informado — fora da soma`}
                </Text>
              )}

              <Pressable
                onPress={() => setBuscandoPara(r)}
                style={({ pressed }) => [styles.botaoAdicionar, pressed && styles.botaoPressionado]}
                accessibilityRole="button"
              >
                <Ionicons name="add" size={17} color={paleta().cores.verde} />
                <Text style={styles.textoBotaoAdicionar}>Adicionar alimentos</Text>
              </Pressable>

              {/* A segunda porta para a mesma refeição. Buscar um a um é preciso
                  e lento; escrever é rápido e às vezes erra o alimento. Cada uma
                  serve a um momento, e nenhuma substitui a outra — por isso as
                  duas ficam lado a lado, com a busca em primeiro. */}
              <Pressable
                onPress={() => setEscrevendoPara(r)}
                style={({ pressed }) => [styles.botaoEscrever, pressed && styles.botaoPressionado]}
                accessibilityRole="button"
                accessibilityLabel={`Escrever ${r.rotulo} de uma vez`}
              >
                <Ionicons name="create-outline" size={16} color={paleta().inkMedio} />
                <Text style={styles.textoBotaoEscrever}>Escrever tudo de uma vez</Text>
              </Pressable>
            </View>
          )
        })}

        {totalDoDia.calorias !== null && (
          <View style={styles.totalDia}>
            <Text style={styles.rotuloTotal}>Total do dia</Text>
            <Text style={styles.valorTotal}>{milhar(totalDoDia.calorias)} kcal</Text>
          </View>
        )}

        {!!erro && <Text style={styles.erro}>{erro}</Text>}
      </ScrollView>

      {/* Fora da rolagem: o Continuar é a saída da tela e não pode depender de
          rolar até o fim de um dia com seis refeições. */}
      <View style={[styles.rodape, { paddingBottom: Math.max(bottom, 16) }]}>
        <Text style={styles.contagem}>
          {quantosItens === 0
            ? 'Nenhum alimento adicionado'
            : `${quantosItens} ${quantosItens === 1 ? 'alimento' : 'alimentos'} no plano`}
        </Text>
        <Pressable
          onPress={continuar}
          style={({ pressed }) => [styles.botao, pressed && styles.botaoContinuarPressionado]}
          accessibilityRole="button"
        >
          <Text style={styles.textoBotao}>Continuar</Text>
        </Pressable>
      </View>
    </>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    rolagem: { flex: 1 },
  blocoAurora: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.cores.verde,
    backgroundColor: t.cores.verdeMenta,
    gap: 7,
    marginBottom: 14,
  },
  linhaTituloAurora: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  tituloAurora: { fontSize: 14, fontWeight: '800', color: t.cores.ink },
  textoAurora: { fontSize: 12.5, lineHeight: 18, color: t.inkMedio },
  estimadosAurora: { fontSize: 12.5, lineHeight: 18, color: t.inkSuave },
  alertaAurora: {
    fontSize: 12.5,
    lineHeight: 18,
    color: t.cores.erroTexto,
  },

  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  botaoVoltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  tituloTela: { flexShrink: 1, fontSize: 17, fontWeight: '800', color: t.cores.ink },

  conteudo: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 28, gap: 18 },

  bloco: { gap: 8 },
  cabecalhoRefeicao: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  hora: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: t.cores.verdeClaro,
  },
  textoHora: { fontSize: 12.5, fontWeight: '800', color: t.cores.verdeEscuro },
  nomeRefeicao: { flex: 1, fontSize: 16, fontWeight: '800', color: t.cores.ink },
  kcalRefeicao: { fontSize: 12.5, fontWeight: '700', color: t.inkMedio },

  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: t.cores.cartao,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  textoItem: { flex: 1 },
  nomeItem: { fontSize: 14, fontWeight: '600', color: t.cores.ink, lineHeight: 19 },
  detalheItem: { marginTop: 2, fontSize: 12, color: t.inkSuave },
  botaoRemover: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },

  semPeso: { marginTop: 2, fontSize: 11.5, color: t.inkFraco },

  botaoEscrever: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 8,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  textoBotaoEscrever: { fontSize: 13, fontWeight: '700', color: t.inkMedio },
  botaoAdicionar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: t.cores.verdeClaro,
  },
  botaoPressionado: { backgroundColor: t.cores.verdeMenta },
  textoBotaoAdicionar: { fontSize: 14, fontWeight: '700', color: t.cores.verde },

  totalDia: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: t.cores.verdeMenta,
  },
  rotuloTotal: { fontSize: 14, fontWeight: '700', color: t.inkMedio },
  valorTotal: { fontSize: 18, fontWeight: '800', color: t.cores.verdeEscuro, letterSpacing: -0.4 },

  erro: { fontSize: 13, color: t.cores.erroTexto, textAlign: 'center' },

  rodape: { paddingHorizontal: 20, paddingTop: 10, gap: 10 },
  contagem: { fontSize: 12.5, color: t.inkFraco, textAlign: 'center' },
  botao: {
    height: 54,
    borderRadius: 16,
    backgroundColor: t.cores.verde,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoContinuarPressionado: { backgroundColor: t.cores.verdeEscuro },
  textoBotao: { fontSize: 15.5, fontWeight: '700', color: t.cores.branco },
  }),
)
