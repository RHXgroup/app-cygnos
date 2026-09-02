import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
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

import { Aviso } from '../components/Aviso'
import { resumoDoAlimento, type Registro } from '../lib/escadaDaAceitacao'
import {
  carregarExposicoes,
  carregarPlanoTerapeutico,
  registrarExposicao,
  type ObjetivoDoPlano,
} from '../lib/planoTerapeutico'
import { estilosDe, paleta } from '../lib/tema'
import { RegistrarExposicaoScreen } from './RegistrarExposicaoScreen'

/* O plano terapêutico, do lado de quem oferece a comida.
 *
 * ── O caminho que não existia ─────────────────────────────────────────────
 * `RegistrarExposicaoScreen` estava pronta e testada havia dias, e NENHUMA tela
 * a montava — aparecia na varredura de órfãos como tela sem caminho. Faltavam
 * duas coisas: as funções do lado do sistema, e uma tela que soubesse qual
 * alimento abrir. Esta é a segunda.
 *
 * ── Por que uma lista, e não a escada direto ─────────────────────────────
 * Um plano tem mais de um objetivo — cenoura numa semana, brócolis na outra. A
 * escada é sobre UM alimento por vez: sem a lista antes, o app teria de
 * escolher sozinho qual, e escolher errado faz a mãe registrar o jantar no
 * alimento errado.
 *
 * ── O limite das cinco ───────────────────────────────────────────────────
 * `resumoDoAlimento` diz quando as ofertas chegaram ao ponto em que o ganho
 * estabiliza. Daí em diante o cartão para de pedir a próxima e passa a dizer
 * que já deu — insistir além disso não melhora a aceitação e gasta a paciência
 * de quem está oferecendo. */
export function PlanoTerapeuticoScreen({ onFechar }: { onFechar: () => void }) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()

  const [objetivos, setObjetivos] = useState<ObjetivoDoPlano[]>([])
  const [historico, setHistorico] = useState<Map<number, Registro[]>>(new Map())
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [erro, setErro] = useState('')
  const [versao, setVersao] = useState(0)
  const [aberto, setAberto] = useState<ObjetivoDoPlano | null>(null)

  useEffect(() => {
    let vivo = true
    void (async () => {
      const r = await carregarPlanoTerapeutico()
      if (!vivo) return

      if (r.tipo === 'erro') {
        setErro(r.mensagem)
      } else {
        /* O `else` limpa. Enquanto a tela carregava uma vez só, escrever o erro
           e nunca apagá-lo era inofensivo; relendo sozinha, vira defeito — a
           leitura seguinte dá certo e o conteúdo fica atrás de uma mensagem
           vencida. */
        setErro('')
        setObjetivos(r.objetivos)

        /* Um histórico por objetivo, em paralelo. São poucos objetivos ativos,
           e sem eles o cartão não sabe dizer em que ponto a criança está. */
        const pares = await Promise.all(
          r.objetivos.map(async o => [o.objetivoId, await carregarExposicoes(o.objetivoId)] as const),
        )
        if (vivo) setHistorico(new Map(pares))
      }
      setCarregando(false)
      setAtualizando(false)
    })()
    return () => {
      vivo = false
    }
  }, [versao])

  /* Quem publica o plano é a nutricionista, no sistema dela, e nada avisa o
     aparelho — não há realtime em lugar nenhum do app. Voltar do segundo plano
     relê, sem piscar: o indicador de carregando vale só para a primeira carga,
     e trocar o conteúdo por um spinner a cada volta paga um susto por uma
     leitura que quase sempre não muda nada. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', e => {
      if (e === 'active') setVersao(v => v + 1)
    })
    return () => sub.remove()
  }, [])

  /* Sem lista de dependências, de propósito: re-registrar a cada renderização é
     o que põe este tratador na frente do central do App a partir da primeira
     re-renderização — que sempre acontece, nem que seja na carga dos dados.
     Sem isso, o voltar dentro da escada fecharia a tela inteira em vez de
     devolver à lista. Ver a armadilha 1 do AGENTS. */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (aberto) {
        setAberto(null)
        return true
      }
      return false
    })
    return () => sub.remove()
  })

  const gravar = useCallback(
    async (o: ObjetivoDoPlano, degrau: string, reacao: 'tranquilo' | 'indiferente' | 'dificil' | null) => {
      const r = await registrarExposicao({
        objetivoId: o.objetivoId,
        alimentoBaseId: o.alimentoBaseId,
        preparacaoId: o.preparacaoId,
        degrau,
        reacao,
      })
      setAberto(null)
      if (r.tipo === 'erro') setErro(r.mensagem)
      /* Relê em vez de montar a linha aqui: quem decide se entrou é o banco. */
      else setVersao(v => v + 1)
    },
    [],
  )

  if (aberto) {
    return (
      <RegistrarExposicaoScreen
        alimento={aberto.alimento}
        preparacao={aberto.preparacao}
        nomeDaCrianca={aberto.nomeDaCrianca}
        registros={historico.get(aberto.objetivoId) ?? []}
        onRegistrar={({ degrau, reacao }) => void gravar(aberto, degrau.chave, reacao)}
        onFechar={() => setAberto(null)}
      />
    )
  }

  const puxarParaAtualizar = (
    <RefreshControl
      refreshing={atualizando}
      onRefresh={() => {
        setAtualizando(true)
        setVersao(v => v + 1)
      }}
      tintColor={paleta().cores.limao}
    />
  )

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
        <Text style={styles.tituloTela}>Plano da nutricionista</Text>
        <View style={styles.botaoVoltar} />
      </View>

      {carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator color={paleta().cores.verde} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.conteudo, { paddingBottom: 32 + bottom }]}
          showsVerticalScrollIndicator={false}
          /* O controle vive nas DUAS ramificações, inclusive na de erro: é
             justamente ali que puxar para tentar de novo é o gesto óbvio. */
          refreshControl={puxarParaAtualizar}
        >
          {!!erro && (
            <View style={styles.erro}>
              <Text style={styles.textoErro}>{erro}</Text>
            </View>
          )}

          {objetivos.length === 0 && !erro ? (
            <Aviso texto="A sua nutricionista ainda não montou um plano de alimentos para oferecer em casa." />
          ) : (
            <>
              <Text style={styles.explicacao}>
                O que oferecer em casa, e como foi cada vez. Registre no dia — é isso que ela vai
                ler na próxima consulta.
              </Text>

              {objetivos.map(o => {
                const registros = historico.get(o.objetivoId) ?? []
                const resumo = resumoDoAlimento(registros)
                return (
                  <Pressable
                    key={o.objetivoId}
                    onPress={() => setAberto(o)}
                    style={({ pressed }) => [styles.cartao, pressed && { opacity: 0.75 }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Registrar como foi com ${o.alimento}`}
                  >
                    <View style={styles.linhaTopo}>
                      <View style={styles.textos}>
                        <Text style={styles.alimento}>{o.alimento}</Text>
                        {!!o.preparacao && <Text style={styles.preparacao}>{o.preparacao}</Text>}
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={paleta().inkFraco} />
                    </View>

                    {!!o.orientacoes && <Text style={styles.orientacoes}>{o.orientacoes}</Text>}
                    {!!o.frequencia && <Text style={styles.frequencia}>{o.frequencia}</Text>}

                    {/* Três frases diferentes, e a ordem importa.
                        `pedeAtencao` vem primeiro porque é o único caso em que
                        a conversa deve sair do app e ir para a nutricionista.
                        `jaDaParaSaber` vem antes da contagem porque, chegando
                        ali, o app PARA de pedir a próxima: insistir além disso
                        não melhora a aceitação e gasta a paciência de quem está
                        oferecendo — e a mãe precisa saber que pode parar. */}
                    <Text
                      style={[styles.resumo, resumo.pedeAtencao && styles.resumoAtencao]}
                    >
                      {registros.length === 0
                        ? 'Ainda não registrado'
                        : resumo.pedeAtencao
                          ? 'Tem sido difícil — vale falar com a sua nutricionista'
                          : resumo.jaDaParaSaber
                            ? `Já dá para saber · ${resumo.atual?.paraMae ?? '—'}`
                            : `${resumo.ofertas} ${resumo.ofertas === 1 ? 'vez' : 'vezes'} · ${resumo.atual?.paraMae ?? '—'}`}
                    </Text>
                  </Pressable>
                )
              })}
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
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingBottom: 8,
    },
    botaoVoltar: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
    tituloTela: { fontSize: 17, fontWeight: '800', color: t.cores.ink },
    conteudo: { paddingHorizontal: 20, gap: 12 },
    explicacao: { fontSize: 13.5, color: t.inkMedio, lineHeight: 20 },

    cartao: {
      padding: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: t.cores.borda,
      backgroundColor: t.cores.cartao,
      gap: 4,
    },
    linhaTopo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    textos: { flex: 1 },
    alimento: { fontSize: 16, fontWeight: '800', color: t.cores.ink },
    preparacao: { fontSize: 12.5, color: t.inkMedio, marginTop: 1 },
    orientacoes: { fontSize: 13, color: t.inkMedio, lineHeight: 19, marginTop: 4 },
    frequencia: { fontSize: 12, color: t.inkFraco },
    resumo: { fontSize: 12, fontWeight: '700', color: t.cores.verde, marginTop: 4 },
    resumoAtencao: { color: t.cores.gold },

    erro: {
      padding: 13,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.cores.erroBorda,
      backgroundColor: t.cores.erroFundo,
    },
    textoErro: { fontSize: 13, color: t.cores.erroTexto, lineHeight: 19 },
  }),
)
