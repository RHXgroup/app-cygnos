import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { carregarPlanoAtivo, type PlanoCompleto } from '../lib/plano'
import { estilosDe, paleta } from '../lib/tema'

/* A aba Comer: o que entra.
 *
 * ── Por que ela existe ─────────────────────────────────────────────────────
 * Plano alimentar, receitas, lista de compras e diário estavam em quatro
 * caminhos diferentes — dois atrás do botão de registrar, um dentro de um
 * cartão da tela inicial e um sem porta fixa nenhuma. São o mesmo assunto, e
 * estar espalhados obrigava a decorar onde cada um mora.
 *
 * ── Por que ela NUNCA nasce vazia ──────────────────────────────────────────
 * Este é o ponto que decidiu o desenho. A aba Mensagens, que sai da barra
 * nesta mesma mudança, nascia vazia para quem não tem nutricionista — e aba
 * permanentemente vazia ensina em duas semanas que ali não tem nada.
 *
 * Aqui isso não acontece por duas razões: o diário alimentar está sempre
 * presente, tenha a pessoa plano ou não; e quem não tem plano vê no topo o
 * convite para montar um com IA, no lugar do quadro de horários. O espaço mais
 * nobre da tela nunca fica em branco. */

export function ComerScreen({
  contaId,
  versaoPlano,
  onAbrirPlano,
  onMontarPlano,
  onAbrirDiario,
  onAbrirReceitas,
  onAbrirCompras,
}: {
  contaId: string
  /* Sobe quando o plano muda em qualquer tela. A aba fica montada dentro do
     carrossel e nunca remonta sozinha — sem isto, quem troca de plano e desliza
     para cá vê o anterior. */
  versaoPlano: number
  onAbrirPlano: (plano: PlanoCompleto) => void
  onMontarPlano: () => void
  onAbrirDiario: () => void
  onAbrirReceitas: () => void
  onAbrirCompras: (plano: PlanoCompleto) => void
}) {
  const styles = estilos()
  const { top } = useSafeAreaInsets()

  const [plano, setPlano] = useState<PlanoCompleto | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [puxando, setPuxando] = useState(false)
  /* Sobe quando o app volta do segundo plano. Regra 8 do projeto: o plano é
     publicado do lado DA NUTRICIONISTA e nada avisa o aparelho — sem isto, quem
     recebe o plano com o app aberto continua vendo "monte seu plano". */
  const [versaoLocal, setVersaoLocal] = useState(0)

  useEffect(() => {
    const sub = AppState.addEventListener('change', e => {
      if (e === 'active') setVersaoLocal(v => v + 1)
    })
    return () => sub.remove()
  }, [])

  const carregar = useCallback(
    async (dePuxao = false) => {
      const r = await carregarPlanoAtivo(contaId)
      /* Falhar em carregar NÃO é o mesmo que não ter plano.
         A primeira versão tratava os dois igual, e o efeito era uma mentira:
         a rede caía e a tela dizia "monte seu plano alimentar" para quem já
         tinha um. Pior que erro na tela é erro que se disfarça de resposta. */
      if (r.tipo === 'erro') {
        if (!dePuxao) setErro(r.mensagem)
      } else {
        /* O `else` limpa. Regra 9: enquanto a tela carregava uma vez, deixar o
           erro para sempre era inofensivo; relendo sozinha, ele esconde o
           conteúdo da leitura seguinte, que deu certo. */
        setErro('')
        setPlano(r.plano)
      }
      setCarregando(false)
    },
    [contaId],
  )

  useEffect(() => {
    /* Sem piscar: o indicador de carregando só vale para a PRIMEIRA carga.
       Trocar o conteúdo por um spinner a cada volta do segundo plano paga um
       susto por uma leitura que quase sempre não muda nada. */
    void carregar()
  }, [carregar, versaoPlano, versaoLocal])

  const hoje = new Date().getDay()
  const valeHoje = plano !== null && plano.diasSemana.includes(hoje as never)

  return (
    <View style={[styles.tela, { paddingTop: top + 8 }]}>
      <ScrollView
        contentContainerStyle={styles.conteudo}
        showsVerticalScrollIndicator={false}
        /* Puxar para atualizar vale MAIS na ramificação de erro: é ali que o
           gesto é o óbvio, e a tela prometia "tente de novo" sem ter o controle
           que atende ao gesto. */
        refreshControl={
          <RefreshControl
            refreshing={puxando}
            onRefresh={async () => {
              setPuxando(true)
              await carregar(true)
              setPuxando(false)
            }}
            tintColor={paleta().cores.verde}
          />
        }
      >
        <Text style={styles.titulo}>Comer</Text>

        {erro ? <Text style={styles.erro}>{erro}</Text> : null}

        {carregando ? (
          <View style={styles.cartao}>
            <ActivityIndicator color={paleta().cores.verde} />
          </View>
        ) : plano === null ? (
          /* O convite ocupa o lugar do plano, e não uma linha discreta embaixo
             dele: quem não tem plano tem AQUI o seu próximo passo, e ele é o
             degrau mais alto do app. */
          <Pressable
            onPress={onMontarPlano}
            style={({ pressed }) => [styles.convite, pressed && styles.pressionada]}
            accessibilityRole="button"
          >
            <Ionicons name="sparkles-outline" size={22} color={paleta().cores.verde} />
            <View style={styles.textoConvite}>
              <Text style={styles.tituloConvite}>Monte seu plano alimentar</Text>
              <Text style={styles.subConvite}>
                Diga o que você come e do que não abre mão. Eu monto e você ajusta antes de valer.
              </Text>
            </View>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => onAbrirPlano(plano)}
            style={({ pressed }) => [styles.cartao, pressed && styles.pressionada]}
            accessibilityRole="button"
          >
            <View style={styles.linhaTitulo}>
              <Text style={styles.rotuloCartao}>
                {valeHoje ? 'Plano de hoje' : 'Seu plano'}
              </Text>
              <Ionicons name="chevron-forward" size={17} color={paleta().inkFraco} />
            </View>
            {/* Quando o plano não vale hoje, dizer isso é mais útil que listar
                horários de outro dia — quem lê "07:00 Café" num sábado sem plano
                acha que esqueceu de comer. */}
            {valeHoje ? (
              plano.refeicoes.map(r => (
                <View key={r.id} style={styles.linhaRefeicao}>
                  <Text style={styles.hora}>{r.hora}</Text>
                  <Text style={styles.nomeRefeicao} numberOfLines={1}>
                    {r.rotulo}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.foraDoDia}>
                Seu plano não vale para hoje. Toque para ver a semana.
              </Text>
            )}
          </Pressable>
        )}

        <View style={styles.lista}>
          <Linha
            icone="reader-outline"
            titulo="Diário alimentar"
            sub="Tudo o que você já anotou"
            onPress={onAbrirDiario}
            styles={styles}
          />
          <Linha
            icone="book-outline"
            titulo="Minhas receitas"
            sub="O que você monta sempre igual"
            onPress={onAbrirReceitas}
            styles={styles}
          />
          {/* A lista de compras só faz sentido com plano: ela sai dos itens
              dele. Sem plano, a linha existiria para abrir uma tela vazia. */}
          {plano !== null && (
            <Linha
              icone="cart-outline"
              titulo="Lista de compras"
              sub="A partir do seu plano da semana"
              onPress={() => onAbrirCompras(plano)}
              styles={styles}
            />
          )}
          <Linha
            icone="sparkles-outline"
            titulo={plano === null ? 'Montar plano com IA' : 'Montar outro plano'}
            sub="Em uma frase, e você confere antes"
            onPress={onMontarPlano}
            styles={styles}
          />
        </View>
      </ScrollView>
    </View>
  )
}

function Linha({
  icone,
  titulo,
  sub,
  onPress,
  styles,
}: {
  icone: keyof typeof Ionicons.glyphMap
  titulo: string
  sub: string
  onPress: () => void
  styles: ReturnType<typeof estilos>
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.linha, pressed && styles.pressionada]}
      accessibilityRole="button"
      accessibilityLabel={titulo}
    >
      <View style={styles.icone}>
        <Ionicons name={icone} size={19} color={paleta().cores.verde} />
      </View>
      <View style={styles.texto}>
        <Text style={styles.rotulo}>{titulo}</Text>
        <Text style={styles.sub}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color={paleta().inkFraco} />
    </Pressable>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.cores.fundo },
    conteudo: { paddingBottom: 24 },
    titulo: {
      fontSize: 27,
      fontWeight: '800',
      color: t.cores.ink,
      letterSpacing: -0.6,
      paddingHorizontal: 20,
      paddingBottom: 14,
    },

    cartao: {
      marginHorizontal: 20,
      backgroundColor: t.cores.cartao,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.cores.borda,
      padding: 16,
      gap: 8,
      marginBottom: 12,
    },
    linhaTitulo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    rotuloCartao: { fontSize: 13, fontWeight: '700', color: t.inkMedio },
    linhaRefeicao: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    hora: {
      fontSize: 13,
      color: t.inkFraco,
      width: 46,
      fontVariant: ['tabular-nums'],
    },
    nomeRefeicao: { flex: 1, fontSize: 15, color: t.cores.ink },
    erro: {
      marginHorizontal: 20,
      marginBottom: 10,
      fontSize: 13,
      color: t.cores.erroTexto,
      lineHeight: 18,
    },
    foraDoDia: { fontSize: 13, color: t.inkMedio, lineHeight: 19 },

    convite: {
      marginHorizontal: 20,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      backgroundColor: t.cores.verdeMenta,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.cores.verde,
      padding: 16,
      marginBottom: 12,
    },
    textoConvite: { flex: 1, gap: 4 },
    tituloConvite: { fontSize: 15, fontWeight: '800', color: t.cores.ink },
    subConvite: { fontSize: 13, color: t.inkMedio, lineHeight: 18 },

    lista: {
      marginHorizontal: 20,
      backgroundColor: t.cores.cartao,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.cores.borda,
      overflow: 'hidden',
    },
    linha: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 13,
    },
    pressionada: { backgroundColor: t.cores.superficie },
    icone: {
      width: 34,
      height: 34,
      borderRadius: 16,
      backgroundColor: t.cores.verdeMenta,
      alignItems: 'center',
      justifyContent: 'center',
    },
    texto: { flex: 1, gap: 1 },
    rotulo: { fontSize: 15, fontWeight: '600', color: t.cores.ink },
    sub: { fontSize: 12, color: t.inkFraco },
  }),
)
