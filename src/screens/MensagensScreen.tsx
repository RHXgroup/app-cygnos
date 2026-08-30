import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Linking,
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
  onAbrirNutricionistas,
  onLeu,
}: {
  onAbrirNutricionistas: () => void
  /* Avisa o App de que a conversa foi lida, para o ponto da aba apagar sem uma
     segunda ida ao banco só para descobrir que agora é zero. */
  onLeu: () => void
}) {
  const styles = estilos()
  const { top } = useSafeAreaInsets()

  const [nutri, setNutri] = useState<Nutricionista | null>(null)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  const rolagem = useRef<ScrollView>(null)

  /* `onLeu` fora das dependências de propósito: ele é recriado a cada
     renderização do App, e incluí-lo faria `buscar` mudar de identidade toda
     vez — o que refaz o efeito de carga, que chama `buscar`, que… Uma função de
     avisar não é motivo para recarregar a conversa. */
  const buscar = useCallback(async () => {
    const [cat, msgs] = await Promise.all([carregarCatalogo(), carregarMensagens()])

    setNutri(cat.tipo === 'ok' ? cat.catalogo.vinculada : null)
    if (msgs.tipo === 'ok') {
      setMensagens(msgs.mensagens)
      /* Marcar como lida é consequência de ter aberto a tela, não de ter
         carregado: quem chegou aqui viu o que estava escrito. */
      marcarLidas()
      onLeu()
    }
  }, [])

  useEffect(() => {
    let vivo = true
    buscar().finally(() => vivo && setCarregando(false))
    return () => {
      vivo = false
    }
  }, [buscar])

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
      /* Chegou com a conversa aberta: já foi lida, e o ponto não pode acender
         para uma mensagem que está na tela. */
      marcarLidas()
      onLeu()
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
      <View style={[styles.tela, styles.centro, { paddingTop: top + 8 }]}>
        <ActivityIndicator color={paleta().cores.verde} />
      </View>
    )
  }

  if (!nutri) {
    return (
      <View style={[styles.tela, { paddingTop: top + 8 }]}>
        <Text style={styles.titulo}>Mensagens</Text>
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
    /* 'height' no Android, e não indefinido: sem comportamento declarado o
       componente não faz nada, e o campo fica atrás do teclado. Ver a armadilha
       2 do AGENTS.md. */
    <KeyboardAvoidingView
      style={[styles.tela, { paddingTop: top + 8 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.cabecalho}>
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
        <View style={styles.vazio}>
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
            contentContainerStyle={styles.conteudoConversa}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {mensagens.length === 0 ? (
              <Text style={styles.primeira}>
                Vocês ainda não trocaram mensagens. Escreva a primeira.
              </Text>
            ) : (
              mensagens.map(m => <Balao key={m.id} mensagem={m} />)
            )}
          </ScrollView>

          {!!erro && <Text style={styles.erro}>{erro}</Text>}

          <View style={styles.barraEnvio}>
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
    </KeyboardAvoidingView>
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
    conteudoConversa: { paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
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

    barraEnvio: {
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
  }),
)
