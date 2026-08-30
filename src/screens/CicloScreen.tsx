import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Confirmacao } from '../components/Confirmacao'
import {
  apagarCiclo,
  carregarCiclos,
  compartilharCiclo,
  estadoDoCompartilhamento,
  marcarFim,
  registrarComeco,
  sincronizarCiclo,
  type RegistroCiclo,
} from '../lib/ciclo'
import {
  compararAntesDaMenstruacao,
  situacaoDoCiclo,
  type Comparacao,
  type Fase,
  type Situacao,
} from '../lib/cicloDaPessoa'
import { carregarConsumoPeriodo } from '../lib/consumo'
import { dataISO, milhar } from '../lib/formatar'
import { estilosDe, paleta } from '../lib/tema'

/* O ciclo menstrual, do jeito que dá para fazer honestamente.
 *
 * ── O que esta tela NÃO faz, e por quê ─────────────────────────────────────
 * Não dá conselho por fase. "Coma mais carboidrato na lútea", "treine pesado na
 * folicular" — isso é o que os aplicativos de ciclo vendem, e a evidência é
 * fraca: o metabolismo de repouso não muda de forma relevante entre as fases.
 *
 * O contrário tem evidência boa: a dieta afeta os sintomas. Então a tela mostra
 * o que ELA registrou e cruza com o diário que ela mesma preencheu — "nos seus
 * últimos três ciclos, você comeu em média 300 kcal a mais nos quatro dias
 * antes". Isso é medida, não palpite de população, e é o que a nutricionista
 * consegue usar.
 *
 * ── Nada de 28 dias ───────────────────────────────────────────────────────
 * Enquanto não houver dois registros, a tela diz que ainda não sabe prever.
 * Ciclo de 28 é média de população: prever com 28 quem tem 34 é errar seis dias
 * e chamar isso de previsão.
 *
 * ── E quem vê ─────────────────────────────────────────────────────────────
 * Por padrão, só ela: a tabela tem RLS de dono, e a nutricionista não enxerga
 * nada. Dado menstrual é dos mais sensíveis que um app de saúde guarda, e
 * compartilhar por omissão seria a escolha errada para ele.
 *
 * Mas o sistema DELA já tem controle de ciclo, e faz sentido o dado chegar lá —
 * quando a pessoa quiser. Então há uma chave nesta tela, desligada de origem, e
 * ligá-la espelha o que já existe. Desligar apaga o que foi enviado: um
 * consentimento retirado que só interrompe o fluxo futuro deixa para trás
 * exatamente o dado que ela decidiu não compartilhar mais.
 *
 * Todo caminho que muda um registro chama `sincronizarCiclo()` logo depois —
 * inclusive o de apagar. Sem isso, a data digitada errada continuaria no
 * histórico da nutricionista, deslocando a média dela, e o botão de apagar
 * mentiria. */

const NOME_DA_FASE: Record<Fase, string> = {
  menstrual: 'Menstruação',
  folicular: 'Fase folicular',
  ovulatoria: 'Perto da ovulação',
  lutea: 'Fase lútea',
}

/* Quantos dias de diário puxar para a comparação. Três meses cobrem dois ou
   três ciclos completos, que é o mínimo para a média não ser ruído — e é o
   máximo que vale trazer para o aparelho de uma vez. */
const DIAS_DE_DIARIO = 120

const diaEMes = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

export function CicloScreen({
  contaId,
  onMudou,
  onFechar,
}: {
  contaId: string
  /* Avisa a tela de cima que algo mudou, para ela reler quando voltar. */
  onMudou: () => void
  onFechar: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()

  const [registros, setRegistros] = useState<RegistroCiclo[] | null>(null)
  const [comparacao, setComparacao] = useState<Comparacao | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [relendo, setRelendo] = useState(false)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [mudou, setMudou] = useState(false)
  const [apagando, setApagando] = useState<RegistroCiclo | null>(null)
  const [versao, setVersao] = useState(0)
  const [compartilha, setCompartilha] = useState(false)
  const [temNutricionista, setTemNutricionista] = useState(false)
  const [mudandoChave, setMudandoChave] = useState(false)

  const hoje = dataISO(new Date())

  /* Volta do segundo plano relendo. A pessoa marca o começo, sai para o
     aplicativo do parceiro ou para a agenda, e volta — e o que ela vê tem de
     ser o que está gravado. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', e => {
      if (e === 'active') setVersao(v => v + 1)
    })
    return () => sub.remove()
  }, [])

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      /* A confirmação de apagar é o degrau de dentro, e o voltar desce um por
         vez. Sem lista de dependências: ver o item 1 do AGENTS.md. */
      if (apagando) {
        setApagando(null)
        return true
      }
      fechar()
      return true
    })
    return () => sub.remove()
  })

  function fechar() {
    if (mudou) onMudou()
    onFechar()
  }

  const carregar = useCallback(async () => {
    const r = await carregarCiclos(contaId)
    if (r.tipo === 'erro') {
      /* O erro fica, e o conteúdo antigo também: trocar a lista por uma
         mensagem a cada volta do segundo plano pagaria um susto por uma leitura
         que quase sempre não muda nada. */
      setErro(r.mensagem)
      return
    }
    /* O else limpa. Sem isto, a leitura seguinte dá certo e o conteúdo fica
       escondido atrás de uma mensagem vencida — item 9 do AGENTS.md. */
    setErro('')
    setRegistros(r.registros)

    /* O estado da chave vem junto da lista. Ele muda do lado de fora desta tela
       — desvincular da nutricionista desliga a chave por gatilho —, e uma tela
       que mostra "compartilhando" depois de o vínculo acabar estaria mentindo
       sobre quem vê o que. */
    const e = await estadoDoCompartilhamento(contaId)
    setCompartilha(e.ligado)
    setTemNutricionista(e.temNutricionista)

    /* A comparação com o diário só faz sentido com dois começos ou mais: um
       ciclo não tem "o resto" para comparar contra. */
    if (r.registros.length < 2) {
      setComparacao(null)
      return
    }
    const de = dataISO(new Date(Date.now() - DIAS_DE_DIARIO * 86400000))
    const c = await carregarConsumoPeriodo(contaId, de, hoje)
    if (c.tipo === 'erro') {
      /* Silêncio de propósito, e só aqui: a lista de ciclos já apareceu, e
         falhar em desenhar um bloco extra não é motivo para cobrir a tela com
         um erro sobre "histórico de refeições". */
      setComparacao(null)
      return
    }
    const porDia = new Map<string, number>()
    for (const i of c.itens) {
      if (i.calorias === null) continue
      porDia.set(i.data, (porDia.get(i.data) ?? 0) + i.calorias)
    }
    setComparacao(
      compararAntesDaMenstruacao(
        r.registros,
        [...porDia].map(([data, calorias]) => ({ data, calorias: Math.round(calorias) })),
      ),
    )
  }, [contaId, hoje])

  useEffect(() => {
    let vivo = true
    void carregar().then(() => {
      if (vivo) setCarregando(false)
    })
    return () => {
      vivo = false
    }
  }, [carregar, versao])

  const situacao: Situacao = situacaoDoCiclo(registros ?? [], hoje)
  const atual = registros?.[0] ?? null
  const jaComecouHoje = atual?.comecou === hoje

  async function comecouHoje() {
    setSalvando(true)
    const r = await registrarComeco(contaId, hoje)
    setSalvando(false)
    if (r.tipo === 'erro') {
      setErro(r.mensagem)
      return
    }
    setErro('')
    setMudou(true)
    setRegistros(atuais => [
      r.registro,
      ...(atuais ?? []).filter(x => x.comecou !== r.registro.comecou),
    ])
    void sincronizarCiclo()
    setVersao(v => v + 1)
  }

  async function terminouHoje(alvo: RegistroCiclo) {
    setSalvando(true)
    const r = await marcarFim(alvo.id, alvo.terminou ? null : hoje)
    setSalvando(false)
    if (r.tipo === 'erro') {
      setErro(r.mensagem)
      return
    }
    setErro('')
    setMudou(true)
    setRegistros(atuais => (atuais ?? []).map(x => (x.id === alvo.id ? r.registro : x)))
    void sincronizarCiclo()
  }

  async function apagar(alvo: RegistroCiclo) {
    setApagando(null)
    setRegistros(atuais => (atuais ?? []).filter(x => x.id !== alvo.id))
    setMudou(true)
    const f = await apagarCiclo(alvo.id)
    if (f) {
      setErro(f.erro)
      setVersao(v => v + 1)
      return
    }
    /* Depois de apagar, e não antes: o espelho é refeito a partir do que
       sobrou, e sincronizar com a linha ainda lá a reenviaria. */
    void sincronizarCiclo()
  }

  async function trocarChave(ligar: boolean) {
    /* Otimista NÃO. Em qualquer outro interruptor do app o otimismo é o certo,
       porque errar custa um piscar; aqui ele mostraria "a sua nutricionista vê"
       para quem, no servidor, não está compartilhando nada — ou o contrário, que
       é pior. Meio segundo de espera é o preço de a tela não mentir sobre isso. */
    setMudandoChave(true)
    const r = await compartilharCiclo(ligar)
    setMudandoChave(false)
    if (r.tipo === 'erro') {
      setErro(r.mensagem)
      return
    }
    setErro('')
    setCompartilha(r.estado.compartilhando)
    /* O servidor desliga sozinho quando não há vínculo. Se ela pediu para ligar
       e voltou desligado, é porque não há para quem mandar — e a linha de baixo
       já explica isso. */
    if (ligar && !r.estado.compartilhando) setTemNutricionista(false)
  }

  return (
    <View style={[styles.tela, { paddingTop: top + 8 }]}>
      <View style={styles.cabecalho}>
        <Pressable
          onPress={fechar}
          style={styles.botaoVoltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela}>Ciclo</Text>
        <View style={styles.botaoVoltar} />
      </View>

      {carregando ? (
        <ActivityIndicator color={paleta().cores.verde} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.conteudo, { paddingBottom: bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            /* Também na ramificação de erro, e é ali que ele mais importa:
               puxar para tentar de novo é o gesto óbvio de quem leu "verifique
               a conexão". */
            <RefreshControl
              refreshing={relendo}
              onRefresh={() => {
                setRelendo(true)
                void carregar().then(() => setRelendo(false))
              }}
              tintColor={paleta().inkFraco}
            />
          }
        >
          {erro ? (
            <View style={styles.blocoErro}>
              <Text style={styles.textoErro}>{erro}</Text>
            </View>
          ) : null}

          {/* ── Onde ela está ─────────────────────────────────────────────*/}
          <View style={styles.cartaoAgora}>
            {situacao.diaDoCiclo === null ? (
              <>
                <Text style={styles.grande}>Ainda não sei</Text>
                <Text style={styles.explicacao}>
                  Marque o primeiro dia quando ele chegar. Com dois registros eu já consigo dizer a
                  duração dos SEUS ciclos — e não a média de 28 dias, que é de população e não é a
                  sua.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.rotuloAgora}>Dia do ciclo</Text>
                <Text style={styles.grande}>{situacao.diaDoCiclo}</Text>
                {situacao.fase ? (
                  <Text style={styles.fase}>{NOME_DA_FASE[situacao.fase]}</Text>
                ) : (
                  <Text style={styles.faseIncerta}>
                    Com mais um ciclo registrado eu consigo dizer a fase.
                  </Text>
                )}
              </>
            )}
          </View>

          {/* ── A previsão, quando ela tem base ───────────────────────────*/}
          {situacao.duracaoTipica !== null && (
            <View style={styles.cartao}>
              <Text style={styles.tituloCartao}>Os seus ciclos</Text>
              <Text style={styles.linhaInfo}>
                Duram <Text style={styles.forte}>{situacao.duracaoTipica} dias</Text>, tipicamente.
              </Text>

              {situacao.irregular ? (
                /* A ausência da previsão é a informação honesta. Mostrar uma
                   data para quem varia doze dias entre um ciclo e outro é criar
                   susto com um número que nunca teve base. */
                <Text style={styles.linhaInfo}>
                  Eles variam bastante entre si, então não vou arriscar uma data. Um ciclo
                  irregular pode ser normal — e também pode valer uma conversa com quem te
                  acompanha.
                </Text>
              ) : situacao.atrasoEmDias !== null ? (
                <Text style={styles.linhaInfo}>
                  A previsão era {diaEMes(situacao.proximaPrevista ?? '')}, há{' '}
                  <Text style={styles.forte}>
                    {situacao.atrasoEmDias} {situacao.atrasoEmDias === 1 ? 'dia' : 'dias'}
                  </Text>
                  . Previsão é estimativa, e atrasar acontece.
                </Text>
              ) : (
                <Text style={styles.linhaInfo}>
                  A próxima deve começar por volta de{' '}
                  <Text style={styles.forte}>{diaEMes(situacao.proximaPrevista ?? '')}</Text>.
                </Text>
              )}
            </View>
          )}

          {/* ── O cruzamento com o diário: o motivo de isto existir aqui ──*/}
          {comparacao &&
            comparacao.mediaNosDiasAntes !== null &&
            comparacao.mediaNoResto !== null && (
              <View style={styles.cartao}>
                <Text style={styles.tituloCartao}>Você, nos dias antes</Text>
                <Text style={styles.linhaInfo}>
                  Nos {comparacao.ciclosComparados} últimos ciclos, nos{' '}
                  {comparacao.diasAntes} dias antes da menstruação você comeu em média{' '}
                  <Text style={styles.forte}>
                    {milhar(comparacao.mediaNosDiasAntes)} kcal
                  </Text>{' '}
                  por dia, contra {milhar(comparacao.mediaNoResto)} no resto do ciclo.
                </Text>
                <Text style={styles.ajuda}>
                  Isto é o que o SEU diário mostra, e não uma regra sobre fases — dessas eu não
                  tenho nenhuma para te dar. Serve para você reconhecer o padrão, e para levar a
                  quem te acompanha.
                </Text>
              </View>
            )}

          {/* ── Registrar ─────────────────────────────────────────────────*/}
          <Pressable
            onPress={comecouHoje}
            disabled={salvando || jaComecouHoje}
            style={({ pressed }) => [
              styles.botaoPrincipal,
              (salvando || jaComecouHoje) && styles.botaoDesligado,
              pressed && styles.pressionado,
            ]}
            accessibilityRole="button"
          >
            {salvando ? (
              <ActivityIndicator color={paleta().cores.branco} />
            ) : (
              <Text style={styles.textoBotaoPrincipal}>
                {jaComecouHoje ? 'Começou hoje — anotado' : 'Minha menstruação começou hoje'}
              </Text>
            )}
          </Pressable>

          {atual && !atual.terminou && !jaComecouHoje && (
            <Pressable
              onPress={() => void terminouHoje(atual)}
              disabled={salvando}
              style={({ pressed }) => [styles.botaoSecundario, pressed && styles.pressionado]}
              accessibilityRole="button"
            >
              <Text style={styles.textoBotaoSecundario}>Terminou hoje</Text>
            </Pressable>
          )}

          {/* ── O histórico ───────────────────────────────────────────────*/}
          {registros && registros.length > 0 && (
            <>
              <Text style={styles.tituloSecao}>Registros</Text>
              {registros.map(r => (
                <View key={r.id} style={styles.linhaRegistro}>
                  <View style={styles.textoRegistro}>
                    <Text style={styles.dataRegistro}>{diaEMes(r.comecou)}</Text>
                    <Text style={styles.detalheRegistro}>
                      {r.terminou
                        ? `até ${diaEMes(r.terminou)}`
                        : 'sem fim marcado'}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => setApagando(r)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Apagar o registro de ${diaEMes(r.comecou)}`}
                  >
                    <Ionicons name="close" size={16} color={paleta().inkFraco} />
                  </Pressable>
                </View>
              ))}
            </>
          )}

          {/* A chave por ÚLTIMO, depois de registrar e do histórico.
              Quem abre esta tela veio marcar uma data, não decidir sobre
              privacidade — e uma pergunta sobre compartilhamento no topo faria
              a decisão parecer obrigatória para usar a tela. */}
          <View style={styles.cartaoChave}>
            <View style={styles.linhaChave}>
              <View style={styles.textoChave}>
                <Text style={styles.tituloCartao}>Mostrar para a minha nutricionista</Text>
                <Text style={styles.ajuda}>
                  {!temNutricionista
                    ? 'Você ainda não tem nutricionista vinculada. Quando tiver, esta opção liga.'
                    : compartilha
                      ? 'Ela vê as datas que você registra aqui. Desligar apaga o que já foi enviado.'
                      : 'Hoje ninguém além de você vê isto. Ligando, ela passa a ver as datas — e só elas.'}
                </Text>
              </View>
              {mudandoChave ? (
                <ActivityIndicator color={paleta().cores.verde} />
              ) : (
                <Switch
                  value={compartilha}
                  onValueChange={v => void trocarChave(v)}
                  disabled={!temNutricionista}
                  trackColor={{ false: paleta().cores.trilho, true: paleta().cores.verde }}
                  accessibilityLabel="Mostrar o meu ciclo para a minha nutricionista"
                />
              )}
            </View>
          </View>

          <Text style={styles.rodape}>
            {compartilha
              ? 'Só as datas vão para ela. O que você escreve em outras telas do app continua separado disto.'
              : 'Isto fica só com você. Nem a sua nutricionista vê, a não ser que você ligue a opção acima.'}
          </Text>
        </ScrollView>
      )}

      {apagando && (
        <Confirmacao
          visivel
          titulo="Apagar este registro?"
          mensagem={`O registro de ${diaEMes(apagando.comecou)} sai da conta da duração dos seus ciclos.`}
          rotuloConfirmar="Apagar"
          destrutiva
          onConfirmar={() => void apagar(apagando)}
          onCancelar={() => setApagando(null)}
        />
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
    tituloTela: { fontSize: 17, fontWeight: '800', color: t.cores.ink },
    conteudo: { paddingHorizontal: 20, gap: 12 },

    blocoErro: {
      backgroundColor: t.cores.erroFundo,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.cores.erroBorda,
      padding: 13,
    },
    textoErro: { fontSize: 13, color: t.cores.erroTexto, lineHeight: 19 },

    cartaoAgora: {
      backgroundColor: t.cores.cartao,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: t.cores.borda,
      padding: 18,
      gap: 2,
    },
    rotuloAgora: { fontSize: 12.5, color: t.inkFraco, fontWeight: '600' },
    grande: {
      fontSize: 40,
      fontWeight: '800',
      color: t.cores.ink,
      letterSpacing: -1.2,
      fontVariant: ['tabular-nums'],
    },
    fase: { fontSize: 15, fontWeight: '700', color: t.cores.verde },
    faseIncerta: { fontSize: 13, color: t.inkMedio, lineHeight: 19, marginTop: 4 },
    explicacao: { fontSize: 13.5, color: t.inkMedio, lineHeight: 20, marginTop: 6 },

    cartao: {
      backgroundColor: t.cores.cartao,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.cores.borda,
      padding: 15,
      gap: 7,
    },
    tituloCartao: { fontSize: 14.5, fontWeight: '800', color: t.cores.ink },
    linhaInfo: { fontSize: 13.5, color: t.inkMedio, lineHeight: 20 },
    forte: { fontWeight: '800', color: t.cores.ink },
    ajuda: { fontSize: 12, color: t.inkFraco, lineHeight: 17 },

    botaoPrincipal: {
      backgroundColor: t.cores.verde,
      borderRadius: 14,
      height: 50,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    botaoDesligado: { opacity: 0.5 },
    pressionado: { opacity: 0.75 },
    textoBotaoPrincipal: { color: t.cores.branco, fontSize: 15, fontWeight: '800' },
    botaoSecundario: {
      borderRadius: 14,
      height: 46,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: t.cores.borda,
    },
    textoBotaoSecundario: { color: t.inkMedio, fontSize: 14, fontWeight: '700' },

    tituloSecao: {
      fontSize: 12.5,
      fontWeight: '800',
      color: t.inkFraco,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginTop: 10,
    },
    linhaRegistro: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: t.cores.cartao,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: t.cores.borda,
      paddingVertical: 11,
      paddingHorizontal: 13,
    },
    textoRegistro: { flex: 1, gap: 1 },
    dataRegistro: { fontSize: 15, fontWeight: '700', color: t.cores.ink },
    detalheRegistro: { fontSize: 12, color: t.inkFraco },

    cartaoChave: {
      backgroundColor: t.cores.cartao,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.cores.borda,
      padding: 15,
      marginTop: 14,
    },
    linhaChave: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    textoChave: { flex: 1, gap: 4 },

    rodape: { fontSize: 11.5, color: t.inkFraco, lineHeight: 17, marginTop: 10 },
  }),
)
