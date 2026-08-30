import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AvatarNutri } from '../components/AvatarNutri'
import {
  carregarCatalogo,
  conversaNoApp,
  linkDoWhatsapp,
  telefoneFormatado,
  type Nutricionista,
} from '../lib/nutricionista'
import {
  carregarMensagens,
  ehMinha,
  enviarMensagem,
  marcarLidas,
  ouvirMensagens,
  type Mensagem,
} from '../lib/mensagens'
import { horaCurta } from '../lib/formatar'
import { estilosDe, paleta } from '../lib/tema'
import { useAlturaTeclado } from '../lib/teclado'

/* A conversa com a nutricionista.
 *
 * Existe só com vínculo. Antes dele não há conversa — há pedido, que mora no
 * catálogo. Sem vínculo esta tela convida a procurar alguém, e é só isso que
 * ela faz.
 *
 * ── O canal é escolha DELA ─────────────────────────────────────────────────
 * O padrão é conversar aqui dentro. Quem marca WhatsApp no parâmetro do sistema
 * aparece com o botão verde e o número; quem não marca nem tem número devolvido
 * pelo banco. A tela não decide isso — ela obedece.
 *
 * ── A primeira tela do app que chega sozinha ───────────────────────────────
 * Todo o resto relê ao voltar do segundo plano, o que serve para plano e
 * consulta. Não serve aqui: resposta que só aparece quando a pessoa sai do app e
 * volta não é conversa. Esta tem realtime — e mantém a releitura do segundo
 * plano como rede, para o caso de a inscrição ter caído sem avisar. */
export function MensagensScreen({
  onFechar,
  onAbrirNutricionistas,
  visivel,
  versaoVinculo,
  onLeu,
  onChegou,
}: {
  /* Existe desde que Mensagens deixou de ser aba e virou tela aberta por cima.
     Como aba ela não precisava fechar — a barra levava embora. */
  onFechar: () => void
  onAbrirNutricionistas: () => void
  /* Esta tela é a aba que a pessoa está vendo AGORA?
   *
   * Ela não monta quando a aba é escolhida: as quatro abas vivem no mesmo
   * carrossel e existem desde o primeiro instante. Sem esta distinção, a
   * conversa marcaria tudo como lido no fundo, com a pessoa na tela inicial — e
   * o ponto da aba, que existe justamente para avisar quem NÃO está aqui, nunca
   * acenderia. */
  visivel: boolean
  /* Sobe quando o vínculo aparece. Sem isto, quem vincula com o app aberto vê
     esta aba continuar dizendo que não há com quem conversar. */
  versaoVinculo: number
  /* Avisa o App de que a conversa foi lida, para o ponto da aba apagar sem uma
     segunda ida ao banco só para descobrir que agora é zero. */
  onLeu: () => void
  /* E o contrário: chegou mensagem com a pessoa em outra aba. Como a inscrição
     vive aqui e nunca desliga, é daqui que o ponto acende na hora, sem esperar
     a próxima contagem. */
  onChegou: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  /* A área segura de baixo SÓ com o teclado fechado.
   *
   * Esta tela deixou de ser aba e virou sobreposição de tela cheia — ela cobre
   * a barra de abas, que era quem cuidava do rodapé. Sem isto, a barra de
   * escrever fica POR BAIXO da barra de gestos do Android e não dá para tocar
   * nela: foi exatamente o que aconteceu na primeira conversa de verdade.
   *
   * E com o teclado aberto vira zero, senão sobra um vão do tamanho de um dedo
   * entre o campo e o teclado. Ver lib/teclado.ts. */
  /* A altura do teclado, medida — e não um KeyboardAvoidingView.
   *
   * Esta tela vive dentro de <Sobreposta>, que é `absoluteFillObject`. O
   * AGENTS.md separa os dois casos justamente aqui: em tela comum o
   * KeyboardAvoidingView resolve; em coisa posicionada por absoluto ele erra,
   * porque com edge-to-edge a janela do Android não encolhe e o componente
   * desconta a altura do teclado de uma altura que não mudou. O resultado é o
   * campo saltando para o meio da tela.
   *
   * Foi o que aconteceu: a tela nasceu como aba — onde o KAV estava certo —, e
   * virou sobreposição sem trocar a ferramenta. Mesma raiz do rodapé. */
  const alturaTeclado = useAlturaTeclado()

  /* O respiro de baixo: o teclado quando ele está aberto, a área segura quando
     não está. Nunca os dois — o teclado já cobre a barra de gestos. */
  const respiro = alturaTeclado > 0 ? alturaTeclado : bottom

  const [nutri, setNutri] = useState<Nutricionista | null>(null)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  /* Separado do erro de enviar: um é sobre a mensagem que não saiu, o outro
     sobre a conversa que não veio, e trocar um pelo outro confunde. */
  const [erroCarga, setErroCarga] = useState('')
  const [atualizando, setAtualizando] = useState(false)

  const rolagem = useRef<ScrollView>(null)

  /* As funções de avisar ficam FORA das dependências de propósito: são
     recriadas a cada renderização do App, e incluí-las faria `buscar` mudar de
     identidade toda vez — o que refaz o efeito de carga, que chama `buscar`,
     que… Uma função de avisar não é motivo para recarregar a conversa. O mesmo
     vale para `visivel`, lido por referência para não reatar a inscrição a cada
     troca de aba. */
  const visivelRef = useRef(visivel)
  visivelRef.current = visivel

  const buscar = useCallback(async () => {
    const [cat, msgs] = await Promise.all([carregarCatalogo(), carregarMensagens()])

    /* Falhou a leitura do catálogo: FICA com o que já estava. Zerar aqui trocaria
       a conversa em andamento pelo convite a procurar nutricionista, por causa
       de um túnel — e dizer a alguém que ela não tem profissional é a pior coisa
       que esta tela pode dizer errado. */
    if (cat.tipo === 'ok') setNutri(cat.catalogo.vinculada)

    /* O erro é limpo no sucesso, e não só escrito na falha: esta tela relê
       sozinha, e um erro que fica faria a conversa aparecer atrás de uma
       mensagem vencida. Ver a armadilha 9. */
    if (msgs.tipo === 'ok') {
      setErroCarga('')
      setMensagens(msgs.mensagens)
    } else {
      /* Sem isto, falhar em carregar parecia conversa vazia — "vocês ainda não
         trocaram mensagens" sobre uma conversa que existe e não desceu. Silêncio
         que se lê como fato é pior do que erro. */
      setErroCarga(msgs.mensagem)
    }
  }, [])

  /* Ler é ter a conversa NA FRENTE, e não tê-la carregado.
   *
   * Roda quando a aba passa a ser a visível e sempre que a conversa muda com
   * ela aberta. `marcarLidas` é barato e idempotente: chamá-lo sem nada para
   * marcar não faz nada, e é mais simples do que manter a contagem aqui só para
   * decidir se vale a pena perguntar. */
  useEffect(() => {
    if (!visivel) return
    marcarLidas()
    onLeu()
  }, [visivel, mensagens.length])

  useEffect(() => {
    let vivo = true
    buscar().finally(() => vivo && setCarregando(false))
    return () => {
      vivo = false
    }
  }, [buscar, versaoVinculo])

  /* Rede de segurança, e não o caminho principal: se a inscrição do realtime
     cair sem avisar — sinal ruim, app suspenso por horas —, voltar ao app
     recompõe a conversa. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', estado => {
      if (estado === 'active') buscar()
    })
    return () => sub.remove()
  }, [buscar])

  /* O que ela escreve entra sem ninguém pedir. Só as dela: o que eu escrevo já
     entrou na tela no envio, e reagir ao próprio insert duplicaria a linha. */
  useEffect(() => {
    if (!nutri) return
    const desligar = ouvirMensagens(nova => {
      setMensagens(atuais =>
        atuais.some(m => m.id === nova.id) ? atuais : [...atuais, nova],
      )
      /* Com a conversa na frente, o efeito acima marca como lida assim que a
         lista cresce. Com a pessoa em outra aba, o ponto acende na hora — é o
         único ponto do app que não espera a próxima leitura. */
      if (!visivelRef.current) onChegou()
    })
    return desligar
  }, [nutri])

  /* Sempre no fim: uma conversa que abre no começo obriga a rolar para ler o que
     acabou de chegar. */
  useEffect(() => {
    if (mensagens.length > 0) {
      requestAnimationFrame(() => rolagem.current?.scrollToEnd({ animated: false }))
    }
  }, [mensagens.length])

  async function enviar() {
    const limpo = texto.trim()
    if (!limpo || enviando) return

    setEnviando(true)
    setErro('')
    const r = await enviarMensagem(limpo)
    setEnviando(false)

    if (r.tipo === 'erro') {
      setErro(r.mensagem)
      return
    }

    /* Limpa o campo e relê. Reler em vez de montar a linha aqui: o id e o
       horário vêm do banco, e uma linha montada na mão apareceria com hora do
       aparelho e id inventado — que some e reaparece na próxima leitura. */
    setTexto('')
    const msgs = await carregarMensagens()
    if (msgs.tipo === 'ok') setMensagens(msgs.mensagens)
  }

  const whatsapp = nutri?.telefone ? linkDoWhatsapp(nutri.telefone) : null
  const noApp = nutri ? conversaNoApp(nutri) : true

  if (carregando) {
    return (
      <View style={[styles.tela, styles.centro, { paddingTop: top + 8, paddingBottom: bottom }]}>
        <ActivityIndicator color={paleta().cores.verde} />
      </View>
    )
  }

  if (!nutri) {
    return (
      <View style={[styles.tela, { paddingTop: top + 8, paddingBottom: bottom }]}>
        <View style={styles.linhaTopo}>
        <Pressable
          onPress={onFechar}
          style={styles.botaoVoltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
          <Text style={styles.tituloComVolta}>Mensagens</Text>
        </View>
        <View style={styles.vazio}>
          <View style={styles.circulo}>
            <Ionicons name="chatbubble-ellipses-outline" size={26} color={paleta().cores.verde} />
          </View>
          <Text style={styles.tituloVazio}>Ainda não há com quem conversar</Text>
          <Text style={styles.textoVazio}>
            A conversa começa quando uma nutricionista aceita o seu pedido. Conheça quem está no
            Cygnos e mande o primeiro contato.
          </Text>

          <Pressable
            onPress={onAbrirNutricionistas}
            style={({ pressed }) => [styles.botaoVer, pressed && styles.botaoVerPressionado]}
            accessibilityRole="button"
            accessibilityLabel="Ver as nutricionistas do Cygnos"
          >
            <Text style={styles.textoVer}>Ver nutricionistas</Text>
            <Ionicons name="chevron-forward" size={16} color={paleta().cores.verde} />
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    /* View comum, e não KeyboardAvoidingView: quem desvia do teclado aqui é a
       barra de escrever, ancorada por absoluto e subindo a altura medida do
       teclado. Sem respiro no pai — a barra cuida do dela, e o bloco do
       WhatsApp do dele. */
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
        <AvatarNutri nutri={nutri} tamanho={38} />
        <View style={styles.textoCabecalho}>
          <Text style={styles.nome} numberOfLines={1}>
            {nutri.nome}
          </Text>
          {!!nutri.crn && <Text style={styles.crn}>CRN {nutri.crn}</Text>}
        </View>

        {/* Só quando ela escolheu o WhatsApp. No padrão o banco nem devolve o
            número, e este botão não tem como existir. */}
        {!noApp && !!whatsapp && (
          <Pressable
            onPress={() => Linking.openURL(whatsapp)}
            style={({ pressed }) => [styles.botaoZap, pressed && styles.botaoZapPressionado]}
            accessibilityRole="button"
            accessibilityLabel={`Abrir conversa com ${nutri.nome} no WhatsApp`}
          >
            <Ionicons name="logo-whatsapp" size={18} color={paleta().cores.branco} />
          </Pressable>
        )}
      </View>

      {!noApp ? (
        /* Ela conversa por fora. Dizer isso é melhor do que abrir um campo que
           escreve para um lugar que ela não lê. */
        <View style={[styles.vazio, { paddingBottom: bottom }]}>
          <View style={styles.circulo}>
            <Ionicons name="logo-whatsapp" size={26} color={paleta().cores.verde} />
          </View>
          <Text style={styles.tituloVazio}>Ela prefere conversar pelo WhatsApp</Text>
          <Text style={styles.textoVazio}>
            {nutri.telefone
              ? `Toque no botão acima, ou chame no ${telefoneFormatado(nutri.telefone)}.`
              : 'Use o botão acima para abrir a conversa.'}
          </Text>
        </View>
      ) : (
        <>
          <ScrollView
            ref={rolagem}
            style={styles.conversa}
            /* Reserva embaixo o tamanho da barra de escrever, que está ancorada
               por absoluto e portanto flutua POR CIMA desta lista. Sem isto as
               últimas mensagens — as que importam — ficam atrás dela. É o preço
               de ancorar, e é barato de pagar. */
            contentContainerStyle={[
              styles.conteudoConversa,
              { paddingBottom: 74 + respiro },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            /* Puxar para tentar de novo é o gesto óbvio de quem viu a conversa
               não descer, e a tela precisa atender ao gesto que ela sugere. */
            refreshControl={
              <RefreshControl
                refreshing={atualizando}
                onRefresh={() => {
                  setAtualizando(true)
                  buscar().finally(() => setAtualizando(false))
                }}
                tintColor={paleta().cores.limao}
              />
            }
          >
            {erroCarga ? (
              <Text style={styles.primeira}>{erroCarga}</Text>
            ) : mensagens.length === 0 ? (
              <Text style={styles.primeira}>
                Vocês ainda não trocaram mensagens. Escreva a primeira.
              </Text>
            ) : (
              mensagens.map(m => <Balao key={m.id} mensagem={m} />)
            )}
          </ScrollView>

          {!!erro && <Text style={styles.erro}>{erro}</Text>}

          <View style={[styles.barraEnvio, { bottom: respiro }]}>
            <TextInput
              value={texto}
              onChangeText={setTexto}
              placeholder="Escreva uma mensagem"
              placeholderTextColor={paleta().inkFraco}
              style={styles.campo}
              /* Cresce até quatro linhas e para: uma caixa que cresce sem limite
                 come a conversa inteira em quem escreve muito. */
              multiline
              maxLength={4000}
            />
            <Pressable
              onPress={enviar}
              disabled={!texto.trim() || enviando}
              style={({ pressed }) => [
                styles.botaoEnviar,
                (!texto.trim() || enviando) && styles.botaoEnviarApagado,
                pressed && styles.botaoZapPressionado,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Enviar mensagem"
            >
              {enviando ? (
                <ActivityIndicator size="small" color={paleta().cores.branco} />
              ) : (
                <Ionicons name="arrow-up" size={20} color={paleta().cores.branco} />
              )}
            </Pressable>
          </View>
        </>
      )}
    </View>
  )
}

/* Minhas à direita e cheias, as dela à esquerda e claras — o lado diz de quem é
   antes de qualquer palavra ser lida. */
function Balao({ mensagem }: { mensagem: Mensagem }) {
  const styles = estilos()
  const minha = ehMinha(mensagem)

  return (
    <View style={[styles.linhaBalao, minha && styles.linhaBalaoMinha]}>
      <View style={[styles.balao, minha ? styles.balaoMeu : styles.balaoDela]}>
        <Text style={[styles.textoBalao, minha && styles.textoBalaoMeu]}>{mensagem.texto}</Text>
        <Text style={[styles.hora, minha && styles.horaMinha]}>
          {horaCurta(new Date(mensagem.criadaEm))}
        </Text>
      </View>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.cores.fundo },
    centro: { alignItems: 'center', justifyContent: 'center' },
    titulo: {
      paddingHorizontal: 20,
      fontSize: 27,
      fontWeight: '800',
      color: t.cores.ink,
      letterSpacing: -0.6,
    },

    linhaTopo: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingBottom: 4 },
    botaoVoltar: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    tituloComVolta: { fontSize: 22, fontWeight: '800', color: t.cores.ink, letterSpacing: -0.4 },
    cabecalho: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 20,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: t.cores.borda,
    },
    textoCabecalho: { flex: 1, gap: 1 },
    nome: { fontSize: 16, fontWeight: '800', color: t.cores.ink },
    crn: { fontSize: 12, color: t.inkFraco },

    botaoZap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.cores.verde,
    },
    botaoZapPressionado: { backgroundColor: t.cores.verdeEscuro },

    conversa: { flex: 1 },
    conteudoConversa: {
      paddingHorizontal: 16,
      paddingTop: 14,
      /* Mais embaixo do que em cima: sem folga, o último balão encosta na barra
         de escrever e a conversa parece cortada bem onde ela está viva. */
      paddingBottom: 20,
      gap: 8,
    },
    primeira: {
      marginTop: 40,
      fontSize: 13.5,
      lineHeight: 20,
      color: t.inkFraco,
      textAlign: 'center',
      paddingHorizontal: 24,
    },

    linhaBalao: { flexDirection: 'row' },
    linhaBalaoMinha: { justifyContent: 'flex-end' },
    balao: { maxWidth: '82%', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 16 },
    balaoDela: { backgroundColor: t.cores.cartao, borderBottomLeftRadius: 5 },
    balaoMeu: { backgroundColor: t.cores.verde, borderBottomRightRadius: 5 },
    textoBalao: { fontSize: 14.5, lineHeight: 20, color: t.cores.ink },
    textoBalaoMeu: { color: t.cores.branco },
    hora: { marginTop: 3, fontSize: 10.5, color: t.inkFraco, alignSelf: 'flex-end' },
    horaMinha: { color: 'rgba(255,255,255,0.75)' },

    erro: { paddingHorizontal: 20, paddingBottom: 6, fontSize: 12.5, color: t.cores.erroTexto },

    /* ANCORADA POR ABSOLUTO, e não empurrada por margem no fim de uma coluna.
     *
     * É o mesmo desenho do painel do BuscarAlimentoScreen, que funciona neste
     * app há semanas com o mesmo problema — campo de digitar dentro de tela
     * sobreposta. As minhas duas tentativas anteriores mexiam no fluxo da
     * coluna e erraram para lados opostos; esta ancora no fundo da tela e sobe
     * exatamente a altura do teclado.
     *
     * Copiar o que já funciona no aparelho de quem usa vale mais do que a minha
     * terceira teoria sobre o Android. */
    barraEnvio: {
      position: 'absolute',
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 10,
      borderTopWidth: 1,
      borderTopColor: t.cores.borda,
    },
    campo: {
      flex: 1,
      minHeight: 44,
      maxHeight: 120,
      paddingHorizontal: 14,
      paddingTop: 11,
      paddingBottom: 11,
      borderRadius: 22,
      backgroundColor: t.cores.cartao,
      color: t.cores.ink,
      fontSize: 14.5,
    },
    botaoEnviar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.cores.verde,
    },
    botaoEnviarApagado: { opacity: 0.4 },

    vazio: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 20, gap: 10 },
    circulo: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: t.cores.verdeMenta,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    tituloVazio: { fontSize: 17, fontWeight: '800', color: t.cores.ink, textAlign: 'center' },
    textoVazio: {
      fontSize: 13.5,
      lineHeight: 20,
      color: t.inkFraco,
      textAlign: 'center',
      paddingHorizontal: 16,
    },
    botaoVer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 8,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 13,
      backgroundColor: t.cores.verdeClaro,
    },
    botaoVerPressionado: { backgroundColor: t.cores.verdeMenta },
    textoVer: { fontSize: 14, fontWeight: '700', color: t.cores.verde },

    pedidos: { alignSelf: 'stretch', marginTop: 16, gap: 14, paddingHorizontal: 4 },
    pedido: { gap: 5 },
    nomePedido: { fontSize: 12.5, fontWeight: '700', color: t.inkSuave },
    /* Balão à direita e verde, igual ao das mensagens dele na conversa: é a
       mesma coisa — o que ele escreveu —, e desenhar diferente sugeriria que é
       outra. */
    balaoPedido: {
      alignSelf: 'flex-end',
      maxWidth: '90%',
      paddingHorizontal: 13,
      paddingVertical: 9,
      borderRadius: 16,
      borderBottomRightRadius: 5,
      backgroundColor: t.cores.verde,
    },
    textoBalaoPedido: { fontSize: 14.5, lineHeight: 20, color: t.cores.branco },
    semTextoPedido: { fontSize: 12.5, color: t.inkFraco, fontStyle: 'italic' },
  }),
)
