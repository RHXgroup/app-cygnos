import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { dinheiroDoDia, reais, type DinheiroDoDia } from '../lib/financeiroDoDia'
import { carregarPerfilDaNutri, type PerfilDaNutri } from '../lib/souNutri'
import { RAIO_CARTAO, estilosDe, paleta } from '../lib/tema'
import { FONTE } from '../lib/fontes'
import { apagarAviso, avisosPendentes, criarAviso, type Aviso } from '../lib/avisosDaNutri'
import { quandoDoAviso, quandoPorExtenso } from '../lib/quandoDoAviso'
import {
  estadoDasNotificacoes,
  ligarNotificacoes,
  type EstadoDasNotificacoes,
} from '../lib/lembretes'

/* O resto: o dinheiro do dia inteiro, as ferramentas, e a saída.
 *
 * ──────────────────── Por que o financeiro mora aqui, e não numa aba própria ────────────────────
 * Porque não há tela de financeiro no app, e não vai haver tão cedo: lançar,
 * baixar e conciliar são trabalho sentado. O que cabe no bolso é o NÚMERO --
 * quanto entrou, quanto vence, quanto tenho para pagar -- e o resto ela pede à
 * Aurora, que já lança conta a receber com cartão de confirmação.
 *
 * Uma aba inteira para três números ensinaria em duas semanas que ali não tem
 * nada; três números dentro de "Mais" são encontrados por quem foi procurar. */

export function MaisDaNutriScreen({
  onSair,
  onLerCodigo,
  onFotoDoPrato,
  onConversas,
  naoLidas = 0,
}: {
  onSair: () => void
  onLerCodigo: () => void
  onFotoDoPrato: () => void
  onConversas?: () => void
  /* Ver o comentário igual em `PainelDaNutriScreen`: quem conta é a área. */
  naoLidas?: number
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()

  const [perfil, setPerfil] = useState<PerfilDaNutri | null>(null)
  const [dinheiro, setDinheiro] = useState<DinheiroDoDia | null>(null)
  const [puxando, setPuxando] = useState(false)

  const buscar = useCallback(async () => {
    setDinheiro(await dinheiroDoDia())
  }, [])

  useEffect(() => {
    let vivo = true
    void carregarPerfilDaNutri().then(p => {
      if (vivo) setPerfil(p)
    })
    void buscar()
    return () => {
      vivo = false
    }
  }, [buscar])

  useEffect(() => {
    const sub = AppState.addEventListener('change', e => {
      if (e === 'active') void buscar()
    })
    return () => sub.remove()
  }, [buscar])

  /* O bloco todo só aparece quando há movimento. Zero aqui não é resposta: as
     políticas de `contas_receber` e `contas_pagar` exigem permissão de
     financeiro, e quem não a tem recebe ZERO LINHA sem erro nenhum -- idêntico
     a "não há nada hoje". Escrever "R$ 0" cobriria os dois casos com uma
     afirmação que o app não pode fazer, para quem decide dinheiro com ela.
     Item 6 do AGENTS.md. */
  const temMovimento =
    !!dinheiro &&
    (dinheiro.quantasBaixas > 0 || dinheiro.quantasVencendo > 0 || dinheiro.quantasAPagar > 0)

  return (
    <View style={[styles.tela, { paddingTop: top + 8 }]}>
      <ScrollView
        contentContainerStyle={[styles.conteudo, { paddingBottom: bottom + 28 }]}
        showsVerticalScrollIndicator={false}
        /* "handled": os campos do aviso moram DENTRO desta rolagem, e sem isto
           o primeiro toque em "Criar" com o teclado aberto só fechava o teclado
           -- ela tocava, nada acontecia, e tocava de novo. Achado na terceira
           rodada de testes, varrendo rolagem com campo e botão juntos. */
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={puxando}
            onRefresh={() => {
              setPuxando(true)
              void buscar().finally(() => setPuxando(false))
            }}
            tintColor={paleta().cores.verde}
            colors={[paleta().cores.verde]}
            progressBackgroundColor={paleta().cores.cartao}
          />
        }
      >
        <Text style={styles.titulo}>Mais</Text>

        {temMovimento && dinheiro && (
          <View style={styles.cartao}>
            <Text style={styles.rotuloDoBloco}>O DINHEIRO DE HOJE</Text>

            {dinheiro.quantasBaixas > 0 && (
              <LinhaDeValor
                rotulo="Recebido"
                valor={reais(dinheiro.recebido)}
                quantas={dinheiro.quantasBaixas}
                cor={paleta().cores.verde}
              />
            )}
            {dinheiro.quantasVencendo > 0 && (
              <LinhaDeValor
                rotulo="A receber, vence hoje"
                valor={reais(dinheiro.vencendo)}
                quantas={dinheiro.quantasVencendo}
                cor={paleta().cores.gold}
              />
            )}
            {dinheiro.quantasAPagar > 0 && (
              <LinhaDeValor
                rotulo="A pagar hoje"
                valor={reais(dinheiro.aPagar)}
                quantas={dinheiro.quantasAPagar}
                cor={paleta().cores.gold}
              />
            )}

            {/* Diz onde se resolve, porque a tela mostra e não deixa agir --
                e uma tela que só mostra sem dizer o que fazer é um beco. */}
            <Text style={styles.dica}>
              Para lançar, peça à Aurora. Baixar e conciliar continuam no sistema.
            </Text>
          </View>
        )}

        <MeusAvisos />

        <View style={styles.cartao}>
          <Text style={styles.rotuloDoBloco}>FERRAMENTAS</Text>
          {/* As conversas têm porta aqui TAMBÉM, e não só no alto do Hoje:
              o ícone de lá é atalho para quem já sabe que ele existe, e ninguém
              descobre função nova por ícone sem rótulo. Aqui ela tem nome e
              uma linha dizendo o que faz. */}
          {!!onConversas && (
            <Opcao
              icone="chatbubbles-outline"
              titulo="Conversas"
              texto={
                naoLidas > 0
                  ? `${naoLidas} ${naoLidas === 1 ? 'mensagem esperando' : 'mensagens esperando'} resposta`
                  : 'Falar com os pacientes pelo aplicativo'
              }
              onPress={onConversas}
            />
          )}
          <Opcao
            icone="barcode-outline"
            titulo="Ler código de barras"
            texto="Guardar um produto na sua base de alimentos"
            onPress={onLerCodigo}
          />
          {/* A mesma análise que o paciente usa, do lado dela. O caso é o do
              consultório: a paciente mostra a foto do almoço, ou ela fotografa
              o prato ali na mesa, e quer o número para conversar em cima. */}
          <Opcao
            icone="camera-outline"
            titulo="Foto do prato"
            texto="Estimar o que tem no prato, para conversar na hora"
            onPress={onFotoDoPrato}
          />
        </View>

        <View style={styles.cartao}>
          <Text style={styles.rotuloDoBloco}>CONTA</Text>
          {!!perfil && <Text style={styles.nomeDaConta}>{perfil.nome}</Text>}
          <Opcao icone="log-out-outline" titulo="Sair da conta" onPress={onSair} />
        </View>

        <Text style={styles.rodape}>
          O que não tem tela aqui, a Aurora faz · e o que ela ainda não faz,
          continua no sistema, no computador.
        </Text>
      </ScrollView>
    </View>
  )
}

function LinhaDeValor({
  rotulo,
  valor,
  quantas,
  cor,
}: {
  rotulo: string
  valor: string
  quantas: number
  cor: string
}) {
  const styles = estilos()
  return (
    <View style={styles.linhaDeValor}>
      <View style={styles.textosDoValor}>
        <Text style={styles.rotuloDoValor}>{rotulo}</Text>
        {/* Quantas, e não só o total: "R$ 900" é uma coisa quando é uma conta e
            outra quando são nove. */}
        <Text style={styles.quantasDoValor}>
          {quantas === 1 ? '1 conta' : quantas + ' contas'}
        </Text>
      </View>
      <Text style={[styles.valor, { color: cor }]}>{valor}</Text>
    </View>
  )
}

function Opcao({
  icone,
  titulo,
  texto,
  onPress,
}: {
  icone: keyof typeof Ionicons.glyphMap
  titulo: string
  texto?: string
  onPress: () => void
}) {
  const styles = estilos()
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.opcao, pressed && styles.pressionado]}
      accessibilityRole="button"
      accessibilityLabel={titulo}
    >
      <Ionicons name={icone} size={20} color={paleta().cores.verde} />
      <View style={styles.textosDaOpcao}>
        <Text style={styles.tituloDaOpcao}>{titulo}</Text>
        {!!texto && <Text style={styles.textoDaOpcao}>{texto}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={16} color={paleta().inkFraco} />
    </Pressable>
  )
}

/* ──────────────────── OS AVISOS DELA ────────────────────
 *
 * "Me lembra daqui duas horas de ligar para o laboratório." Dois campos e um
 * botão -- e é de propósito que não tem mais nada: seletor de data, repetição
 * e categoria transformariam trinta segundos em uma tarefa, e aí ela não usa.
 *
 * ──── Por que os avisos vivem no APARELHO ────
 * Notificação local não precisa de servidor nem de token -- ver o cabeçalho de
 * `avisosDaNutri`. A conta honesta é que eles não aparecem no computador e
 * somem se ela reinstalar. A tela DIZ isso, em vez de deixar ela descobrir
 * sozinha no dia em que trocar de telefone. */
function MeusAvisos() {
  const styles = estilos()
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [texto, setTexto] = useState('')
  const [quando, setQuando] = useState('')
  const [salvando, setSalvando] = useState(false)
  /* A trava do toque duplo: `salvando` só vale na renderização seguinte, e
     dois toques rápidos em "Criar" agendavam o MESMO aviso duas vezes -- o
     celular tocava dobrado na hora marcada. Um `ref` muda no instante do toque. */
  const salvandoAgora = useRef(false)
  const [recado, setRecado] = useState('')
  /* Nulo até a primeira leitura: sem ele, a linha nasceria dizendo
     "desligadas" por um instante e piscaria para "ligadas" -- e quem vê o
     vermelho piscar acha que desligou alguma coisa. */
  const [notificacao, setNotificacao] = useState<EstadoDasNotificacoes | null>(null)

  const reler = useCallback(() => {
    void avisosPendentes().then(setAvisos)
    /* Relê o estado junto. É o caminho de volta de 'bloqueadas': o botão abre
       a configuração do telefone, ela liga lá e volta -- e sem reler aqui a
       linha continuaria dizendo que está bloqueado. */
    void estadoDasNotificacoes().then(setNotificacao)
  }, [])

  useEffect(reler, [reler])

  /* Relê ao voltar do segundo plano: um aviso que tocou enquanto o app estava
     fechado precisa sumir da lista quando ela volta -- senão ela vê na tela um
     lembrete que já cumpriu o papel e fica em dúvida se vai tocar de novo. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', e => {
      if (e === 'active') reler()
    })
    return () => sub.remove()
  }, [reler])

  async function criar() {
    if (salvando || salvandoAgora.current) return
    const lido = quandoDoAviso(quando)
    if (lido.tipo === 'erro') {
      setRecado(lido.mensagem)
      return
    }
    salvandoAgora.current = true
    setSalvando(true)
    setRecado('')
    const r = await criarAviso(texto, lido.quando)
    salvandoAgora.current = false
    setSalvando(false)

    if (r.tipo === 'ok') {
      setTexto('')
      setQuando('')
      /* Confirma DIZENDO QUANDO, e não "pronto". Ela escreveu "09:00" às 14h e
         o aviso foi para amanhã -- se a tela não disser, ela só descobre isso
         não sendo avisada hoje. */
      setRecado('Combinado: ' + quandoPorExtenso(new Date(r.aviso.quando)) + '.')
      reler()
      return
    }
    if (r.tipo === 'sem_permissao') {
      setRecado(
        'O aparelho não deixou avisar. Ligue as notificações do Cygnos nas ' +
        'configurações do telefone e tente de novo.',
      )
      return
    }
    setRecado(r.mensagem)
  }

  return (
    <View style={styles.cartao}>
      <Text style={styles.rotuloDoBloco}>MEUS AVISOS</Text>

      {/* —— AS NOTIFICAÇÕES, no mesmo cartão dos avisos ——
          Pedido dele: "igual o do paciente, que você vai lá na parte do mais e
          coloca que você permite as notificações".

          AQUI, e não numa seção própria: sem notificação nenhum aviso deste
          cartão toca, então é o primeiro lugar em que ela precisa ver que está
          desligado. Uma linha de "Notificações" longe dos avisos seria
          descoberta depois de o primeiro lembrete não tocar.

          E some quando está tudo certo -- uma linha verde dizendo "ligadas"
          todo dia é ruído. Só aparece quando há o que fazer. */}
      {notificacao !== null && notificacao !== 'ligadas' && (
        <Pressable
          onPress={async () => setNotificacao(await ligarNotificacoes())}
          style={({ pressed }) => [styles.notificacao, pressed && styles.pressionado]}
          accessibilityRole="button"
          accessibilityLabel={
            notificacao === 'bloqueadas'
              ? 'Abrir as configurações do telefone para ligar as notificações'
              : 'Ligar as notificações'
          }
        >
          <Ionicons name="notifications-off-outline" size={20} color={paleta().cores.ink} />
          <View style={styles.textosDaOpcao}>
            <Text style={styles.tituloDaOpcao}>Notificações desligadas</Text>
            <Text style={styles.textoDaOpcao}>
              {notificacao === 'bloqueadas'
                /* Diz o que VAI acontecer ao tocar, e não o que ela tem de
                   fazer. "Abre as configurações" é o botão fazendo; "vá nas
                   configurações" era a frase que ele achou difícil. */
                ? 'Toque para abrir as configurações e ligar. Sem isso, nenhum aviso toca.'
                : 'Toque para ligar. Sem isso, nenhum aviso toca.'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={paleta().inkFraco} />
        </Pressable>
      )}

      {avisos.map(a => (
        <View key={a.id} style={styles.aviso}>
          <View style={styles.textosDoAviso}>
            <Text style={styles.textoDoAviso}>{a.texto}</Text>
            <Text style={styles.quandoDoAviso}>{quandoPorExtenso(new Date(a.quando))}</Text>
          </View>
          <Pressable
            onPress={() => void apagarAviso(a.id).then(reler)}
            hitSlop={10}
            style={({ pressed }) => [styles.apagarAviso, pressed && styles.pressionado]}
            accessibilityRole="button"
            accessibilityLabel={'Apagar o aviso: ' + a.texto}
          >
            <Ionicons name="close" size={17} color={paleta().inkFraco} />
          </Pressable>
        </View>
      ))}

      <TextInput
        value={texto}
        onChangeText={setTexto}
        placeholder="Do que você quer ser lembrada"
        placeholderTextColor={paleta().inkFraco}
        style={styles.campoDoAviso}
        maxLength={120}
        accessibilityLabel="O que avisar"
      />

      <View style={styles.linhaDoAviso}>
        <TextInput
          value={quando}
          onChangeText={setQuando}
          placeholder="2h, 30min ou 16:30"
          placeholderTextColor={paleta().inkFraco}
          style={[styles.campoDoAviso, styles.campoQuando]}
          maxLength={20}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Quando avisar"
        />
        <Pressable
          onPress={() => void criar()}
          disabled={salvando || !texto.trim()}
          style={({ pressed }) => [
            styles.botaoDoAviso,
            (salvando || !texto.trim()) && styles.botaoDesligado,
            pressed && styles.pressionado,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Criar o aviso"
        >
          {salvando ? (
            <ActivityIndicator size="small" color={paleta().cores.branco} />
          ) : (
            <Text style={styles.textoDoBotaoDoAviso}>Avisar</Text>
          )}
        </Pressable>
      </View>

      {!!recado && <Text style={styles.recadoDoAviso}>{recado}</Text>}

      <Text style={styles.dica}>
        {avisos.length === 0
          ? 'Escreva o lembrete e quando ("2h", "30min", "16:30", "amanhã 09:00").'
          : 'Os avisos tocam neste telefone. Eles não aparecem no computador.'}
      </Text>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.cores.fundo },
    conteudo: { paddingHorizontal: 16, gap: 12 },
    titulo: {
      fontFamily: FONTE.bruta,
      fontSize: 29,
      color: t.cores.ink,
      letterSpacing: -1,
      lineHeight: 32,
      paddingBottom: 4,
    },

    cartao: {
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderRadius: 16,
      padding: 16,
      gap: 2,
    },
    /* Deixa de ser MAIÚSCULA ESPAÇADA de 10,5. Era o rótulo padrão da área
       inteira, repetido em cada bloco de cada tela -- e rótulo em tudo é
       rótulo em nada: o olho para de ler os que importam junto com os que não
       importam. Vira texto normal, um degrau abaixo do conteúdo. */
    rotuloDoBloco: {
      fontFamily: FONTE.meia,
      fontSize: 12.5,
      color: t.inkFraco,
      paddingBottom: 8,
    },

    linhaDeValor: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 8,
    },
    textosDoValor: { flex: 1 },
    rotuloDoValor: { fontFamily: FONTE.normal, fontSize: 14, color: t.cores.ink },
    quantasDoValor: { fontFamily: FONTE.normal, fontSize: 12, color: t.inkFraco, marginTop: 1 },
    valor: {
      fontFamily: FONTE.forte,
      fontSize: 19,
      letterSpacing: -0.6,
      fontVariant: ['tabular-nums'],
    },
    dica: { fontFamily: FONTE.normal, fontSize: 11.5, color: t.inkFraco, lineHeight: 17, paddingTop: 8 },

    /* ──── OS AVISOS ──── */
    aviso: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 9,
      borderBottomWidth: 1,
      borderBottomColor: t.cores.borda,
    },
    textosDoAviso: { flex: 1, minWidth: 0 },
    textoDoAviso: { fontFamily: FONTE.meia, fontSize: 14.5, color: t.cores.ink },
    quandoDoAviso: { fontFamily: FONTE.normal, fontSize: 12, color: t.inkFraco, marginTop: 1 },
    apagarAviso: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },

    campoDoAviso: {
      backgroundColor: t.cores.superficie,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderRadius: 11,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginTop: 8,
      fontFamily: FONTE.normal,
      fontSize: 14.5,
      color: t.cores.ink,
    },
    linhaDoAviso: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    campoQuando: { flex: 1 },
    botaoDoAviso: {
      minWidth: 84,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 11,
      paddingHorizontal: 14,
      borderRadius: 11,
      marginTop: 8,
      backgroundColor: t.cores.verde,
    },
    /* Cor, e não opacidade: o tema tem um `desligado` medido justamente porque
       opacity num botão compõe texto E fundo contra a página e destrói o
       contraste entre os dois. */
    botaoDesligado: { backgroundColor: t.cores.desligado },
    textoDoBotaoDoAviso: { fontFamily: FONTE.forte, fontSize: 14, color: t.cores.branco },
    recadoDoAviso: {
      fontFamily: FONTE.normal,
      fontSize: 12.5,
      color: t.cores.ink,
      lineHeight: 18,
      backgroundColor: t.cores.verdeMenta,
      padding: 10,
      borderRadius: 10,
      marginTop: 8,
    },

    opcao: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
    /* O mesmo desenho de `opcao`, com fundo: é a única linha deste cartão que
       pede ação, e precisa se distinguir dos avisos que só se leem. Menta, e
       não vermelho -- não é erro dela, e vermelho ensinaria que é. */
    notificacao: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 12,
      marginBottom: 8,
      borderRadius: 12,
      backgroundColor: t.cores.verdeMenta,
    },
    textosDaOpcao: { flex: 1 },
    tituloDaOpcao: { fontSize: 15, color: t.cores.ink },
    textoDaOpcao: { fontSize: 12.5, color: t.inkFraco, marginTop: 1 },
    nomeDaConta: { fontSize: 14, color: t.inkSuave, paddingBottom: 4 },

    rodape: { fontSize: 12, color: t.inkFraco, lineHeight: 18, paddingHorizontal: 4, paddingTop: 4 },
    pressionado: { opacity: 0.7 },
  }),
)
