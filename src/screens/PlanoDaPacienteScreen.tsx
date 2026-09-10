import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  kcalDaRefeicao,
  planoDaPaciente,
  semCaloriaEm,
  type PlanoDaPaciente,
} from '../lib/planoDoPacienteDaNutri'
import { FONTE } from '../lib/fontes'
import { estilosDe, paleta } from '../lib/tema'

/* O plano alimentar da paciente, aberto pela ficha.
 *
 * ──────────────────── Por que esta tela existe ────────────────────
 * A ficha dizia "Plano alimentar ativo: Plano alimentar da IA" e parava ali --
 * um nome, sem nada por trás. O relato foi direto: "não consigo clicar pra ver
 * nada aqui". Ela está com a paciente na frente, ou na rua, e a pergunta que
 * ela faz é o que a pessoa deve comer -- não como o arquivo se chama.
 *
 * ──────────────────── Ela LÊ, e não edita ────────────────────
 * Trocar item, mudar gramagem e ver o macro recalcular é entrada de muitos
 * números numa tela estreita, onde errar um dígito muda a conduta. Isso continua
 * no computador, e a tela diz onde -- em vez de deixar um botão que não existe
 * ser procurado.
 *
 * ──────────────────── O que ela mostra e o site não mostra ────────────────────
 * Se o plano foi ENVIADO ao aplicativo. É a coisa mais fácil de esquecer depois
 * de montar, e o sintoma é do lado do paciente: ele abre o app e não vê nada,
 * sem saber por quê. Aqui isso aparece em uma linha, no topo. */
export function PlanoDaPacienteScreen({
  pacienteId,
  nome,
  onFechar,
}: {
  pacienteId: number
  nome: string
  onFechar: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()

  const [plano, setPlano] = useState<PlanoDaPaciente | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [puxando, setPuxando] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    const r = await planoDaPaciente(pacienteId)
    /* O erro é limpo no sucesso -- armadilha 9. Esta tela relê ao puxar, e um
       erro que fica esconderia o plano atrás de uma mensagem vencida. */
    if (r.tipo === 'ok') {
      setErro('')
      setPlano(r.plano)
    } else {
      setErro(r.mensagem)
    }
  }, [pacienteId])

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    void carregar().finally(() => {
      if (vivo) setCarregando(false)
    })
    return () => {
      vivo = false
    }
  }, [carregar])

  /* Sem lista de dependências: é o que põe este tratador na frente do da ficha
     e do da área a partir da segunda renderização. Armadilha 1. */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onFechar()
      return true
    })
    return () => sub.remove()
  })

  return (
    <View style={[styles.tela, { paddingTop: top + 8 }]}>
      <View style={styles.cabecalho}>
        <Pressable
          onPress={onFechar}
          style={styles.voltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar para a ficha"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloDaTela} numberOfLines={1}>
          Plano de {nome}
        </Text>
        <View style={styles.voltar} />
      </View>

      {carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator color={paleta().cores.verde} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.conteudo, { paddingBottom: 24 + bottom }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={puxando}
              onRefresh={() => {
                setPuxando(true)
                void carregar().finally(() => setPuxando(false))
              }}
              tintColor={paleta().cores.verde}
              colors={[paleta().cores.verde]}
              progressBackgroundColor={paleta().cores.cartao}
            />
          }
        >
          {!!erro && <Text style={styles.erro}>{erro}</Text>}

          {!erro && !plano && (
            <View style={styles.vazio}>
              <Ionicons name="restaurant-outline" size={22} color={paleta().inkFraco} />
              <Text style={styles.textoVazio}>
                {nome} ainda não tem plano alimentar ativo.
              </Text>
              <Text style={styles.ondeSeFaz}>Montar o plano continua no sistema.</Text>
            </View>
          )}

          {!!plano && (
            <>
              <View style={styles.topoDoPlano}>
                <Text style={styles.tituloDoPlano}>{plano.titulo}</Text>
                {!!plano.descricao && (
                  <Text style={styles.descricaoDoPlano}>{plano.descricao}</Text>
                )}

                {/* Enviado ou não. É o que o site não mostra de relance, e o
                    sintoma de esquecer aparece do lado do PACIENTE: ele abre o
                    app e não vê plano nenhum. */}
                <View style={[styles.selo, plano.enviadoEm ? styles.seloOk : styles.seloAviso]}>
                  <Ionicons
                    name={plano.enviadoEm ? 'checkmark-circle' : 'alert-circle-outline'}
                    size={14}
                    color={plano.enviadoEm ? paleta().cores.verde : paleta().cores.gold}
                  />
                  <Text
                    style={[
                      styles.textoDoSelo,
                      { color: plano.enviadoEm ? paleta().cores.verde : paleta().cores.gold },
                    ]}
                  >
                    {plano.enviadoEm
                      ? 'A paciente vê este plano no aplicativo'
                      : 'Ainda não enviado ao aplicativo'}
                  </Text>
                </View>
              </View>

              {plano.refeicoes.length === 0 && (
                <Text style={styles.ondeSeFaz}>
                  Este plano ainda não tem refeições montadas.
                </Text>
              )}

              {plano.refeicoes.map(r => {
                const total = kcalDaRefeicao(r)
                const faltando = semCaloriaEm(r)
                return (
                  <View key={r.id} style={styles.refeicao}>
                    <View style={styles.topoDaRefeicao}>
                      {!!r.horario && <Text style={styles.horario}>{r.horario}</Text>}
                      <Text style={styles.nomeDaRefeicao}>{r.nome}</Text>
                      {/* "—" quando NENHUM item tem caloria. Zero seria mentira:
                          é a diferença entre "esta refeição não tem caloria" e
                          "eu não sei a caloria desta refeição". Item 6. */}
                      <Text style={styles.kcalDaRefeicao}>
                        {total === null ? '—' : `${total} kcal`}
                      </Text>
                    </View>

                    {r.itens.length === 0 ? (
                      <Text style={styles.refeicaoVazia}>Sem itens.</Text>
                    ) : (
                      r.itens.map(i => (
                        <View key={i.id} style={styles.item}>
                          <Text style={styles.rotuloDoItem} numberOfLines={2}>
                            {i.rotulo}
                          </Text>
                          {!!i.quantidade && (
                            <Text style={styles.quantidadeDoItem}>{i.quantidade}</Text>
                          )}
                        </View>
                      ))
                    )}

                    {/* Dito, e não escondido: um total que ignora três itens sem
                        caloria é um total que ela some de cabeça e não bate. */}
                    {faltando > 0 && total !== null && (
                      <Text style={styles.semCaloria}>
                        {faltando === 1
                          ? 'Um item sem caloria cadastrada não entrou na conta.'
                          : `${faltando} itens sem caloria cadastrada não entraram na conta.`}
                      </Text>
                    )}
                  </View>
                )
              })}

              <Text style={styles.ondeSeFaz}>
                Trocar item, mudar quantidade e recalcular continuam no sistema, no
                computador.
              </Text>
            </>
          )}
        </ScrollView>
      )}
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.cores.fundo },
    centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    cabecalho: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingBottom: 6,
    },
    voltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    tituloDaTela: {
      flex: 1,
      fontFamily: FONTE.forte,
      fontSize: 17,
      color: t.cores.ink,
      textAlign: 'center',
    },

    conteudo: { paddingHorizontal: 16, gap: 12 },

    erro: {
      fontFamily: FONTE.normal,
      fontSize: 13.5,
      color: t.cores.ink,
      backgroundColor: t.cores.verdeMenta,
      padding: 12,
      borderRadius: 10,
    },

    topoDoPlano: { gap: 6, paddingBottom: 2 },
    tituloDoPlano: {
      fontFamily: FONTE.bruta,
      fontSize: 24,
      color: t.cores.ink,
      letterSpacing: -0.8,
    },
    descricaoDoPlano: {
      fontFamily: FONTE.normal,
      fontSize: 13.5,
      color: t.inkSuave,
      lineHeight: 20,
    },
    selo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      alignSelf: 'flex-start',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    seloOk: { backgroundColor: t.cores.verdeMenta },
    seloAviso: { backgroundColor: t.cores.atencaoFundo },
    textoDoSelo: { fontFamily: FONTE.meia, fontSize: 12 },

    refeicao: {
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 2,
    },
    topoDaRefeicao: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 9,
      paddingBottom: 6,
    },
    horario: {
      fontFamily: FONTE.meia,
      fontSize: 13,
      color: t.inkFraco,
      fontVariant: ['tabular-nums'],
    },
    nomeDaRefeicao: { flex: 1, fontFamily: FONTE.forte, fontSize: 15, color: t.cores.ink },
    kcalDaRefeicao: {
      fontFamily: FONTE.meia,
      fontSize: 12.5,
      color: t.inkFraco,
      fontVariant: ['tabular-nums'],
    },

    item: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 10,
      paddingVertical: 5,
    },
    rotuloDoItem: { flex: 1, fontFamily: FONTE.normal, fontSize: 14.5, color: t.cores.ink },
    quantidadeDoItem: {
      fontFamily: FONTE.meia,
      fontSize: 13,
      color: t.inkSuave,
      fontVariant: ['tabular-nums'],
    },
    refeicaoVazia: { fontFamily: FONTE.normal, fontSize: 13, color: t.inkFraco, paddingVertical: 4 },
    semCaloria: {
      fontFamily: FONTE.normal,
      fontSize: 11.5,
      color: t.inkFraco,
      lineHeight: 16,
      paddingTop: 6,
    },

    vazio: {
      alignItems: 'center',
      gap: 8,
      paddingVertical: 40,
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderRadius: 16,
    },
    textoVazio: { fontFamily: FONTE.normal, fontSize: 14, color: t.inkSuave, textAlign: 'center' },
    ondeSeFaz: {
      fontFamily: FONTE.normal,
      fontSize: 12,
      color: t.inkFraco,
      textAlign: 'center',
      lineHeight: 17,
      paddingHorizontal: 12,
    },
  }),
)
