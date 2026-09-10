import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  novaFala,
  perguntarAAurora,
  type AcaoPendente,
  type Fala,
} from '../lib/auroraDaNutri'
import {
  FECHAMENTO,
  O_QUE_ELA_FAZ,
  PERGUNTAS_DE_EXEMPLO,
  RESPOSTA_DO_MENU,
  ehPedidoDeMenu,
} from '../lib/menuDaAurora'
import { useDesvioDoTeclado } from '../lib/teclado'
import { estilosDe, paleta } from '../lib/tema'
import { FONTE } from '../lib/fontes'
import { executarAcaoConfirmada } from '../lib/acoesNoAparelho'
import { Ditado } from '../components/Ditado'

/* A Aurora dela, no bolso.
 *
 * ──────────────────── Por que uma tela de conversa, e não mais cartões no painel ────────────────────
 * Porque é a Aurora que permite a lista de telas ser curta. Não há tela de
 * financeiro no app e mesmo assim ela consegue saber quanto entrou hoje. Cada
 * cartão a mais no painel é uma tela que alguém precisa desenhar, manter e
 * traduzir para celular; uma pergunta não é.
 *
 * ──────────────────── O CARTÃO DE CONFIRMAÇÃO NÃO TEM EXCEÇÃO ────────────────────
 * Nada que grave acontece sem ela ler e tocar em Confirmar. Nem para "comando
 * simples", nem porque ela já confirmou parecido antes.
 *
 * Isso vem de um prejuízo real deste projeto: o comando de voz do treino
 * concluiu um treino sozinho DUAS vezes, sem ninguém falar nada. Reconhecimento
 * de fala erra, e vai continuar errando -- a defesa não é acertar mais, é
 * limitar o que pode acontecer quando ele erra. Ali o custo foi um treino
 * errado; numa agenda é uma paciente aparecendo no consultório num dia em que
 * ninguém a esperava, e num lançamento é um número que ela só descobre no
 * fechamento do mês.
 *
 * E o cartão mostra os VALORES, e não só o nome da ação. Um cartão que diz
 * "Agendar consulta?" é um cartão que se confirma sem ler.
 *
 * ──────────────────── O teclado ────────────────────
 * Armadilha 2: a barra de escrever fica FORA da tela sem tratamento, porque no
 * Expo Go a janela não encolhe. O desvio é teclado + área segura, que SOMAM, e
 * a altura vem do `onLayout` -- não de `useWindowDimensions`, que não encolhe
 * junto e faria a conta somar duas vezes num build de verdade. */

export function AuroraDaNutriScreen({ onFechar }: { onFechar: () => void }) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()

  const [falas, setFalas] = useState<Fala[]>([])
  const [texto, setTexto] = useState('')
  /* Qual dos dois botões a barra mostra. Derivado do campo, e não um estado
     à parte: dois estados para a mesma coisa divergem, e o sintoma seria a seta
     ficar na tela com o campo já vazio. */
  const temTexto = texto.trim().length > 0
  const [pensando, setPensando] = useState(false)

  const [alturaDaTela, setAlturaDaTela] = useState(0)
  const respiro = useDesvioDoTeclado(bottom, alturaDaTela || undefined)

  const rolagem = useRef<ScrollView>(null)

  /* Rola quando CHEGA fala, e não quando o conteúdo muda de tamanho.
     `onContentSizeChange` dispara também no crescimento provocado pela própria
     rolagem, e aí isso vira um laço que nunca converge -- foi o que prendeu a
     conversa do paciente no meio da lista por dias. Responder ao EVENTO
     resolve, porque o evento acontece uma vez. */
  useEffect(() => {
    if (falas.length === 0) return
    const id = setTimeout(() => rolagem.current?.scrollToEnd({ animated: true }), 80)
    return () => clearTimeout(id)
  }, [falas.length, pensando])

  /* Sem lista de dependências: o App tem um tratador central, e o React roda os
     efeitos do filho antes dos do pai -- com lista, o pai registraria por
     último e ganharia. Armadilha 1. */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onFechar()
      return true
    })
    return () => sub.remove()
  })

  async function mandar(pergunta: string) {
    const limpa = pergunta.trim()
    if (!limpa || pensando) return

    /* "Menu principal" não vai ao modelo.
     *
     * Ela terminou um agendamento, quis voltar para as perguntas do começo, e
     * digitou "Manu principal" -- a Aurora leu "Manu" como nome e devolveu
     * cinco pacientes parecidas, perguntando qual era. Quem procurava a saída
     * recebeu uma lista de gente.
     *
     * O prompt do servidor também aprendeu a regra, e é ele que cobre o que for
     * escrito de um jeito que ninguém previu. Aqui ficam só as frases que não
     * podem querer dizer outra coisa: é instantâneo, não custa uma ida ao
     * modelo, e não tem como ser reinterpretado -- que foi o que deu errado. */
    if (ehPedidoDeMenu(limpa)) {
      setFalas(atual => [...atual, novaFala('nutri', limpa), novaFala('aurora', RESPOSTA_DO_MENU)])
      setTexto('')
      return
    }

    /* A pergunta entra na lista ANTES da resposta, e o campo esvazia junto: sem
       isso ela fica olhando o próprio texto parado no campo sem saber se foi. */
    const minha = novaFala('nutri', limpa)
    const anteriores = falas
    setFalas(atual => [...atual, minha])
    setTexto('')
    setPensando(true)

    const r = await perguntarAAurora(limpa, anteriores)
    setPensando(false)

    if (r.tipo === 'confirmar') {
      setFalas(atual => [
        ...atual,
        /* O texto vem antes do cartão quando existe: é ali que a Aurora
           pergunta "confirma para quinta?". */
        ...(r.texto ? [novaFala('aurora', r.texto)] : []),
        { ...novaFala('aurora', r.acao.resumo), acao: r.acao },
      ])
      return
    }

    /* A falha vira uma fala da Aurora, e não uma faixa de erro no alto.
       Numa conversa, erro fora do fluxo se perde: ela rola para ler a resposta
       e a explicação ficou lá em cima, fora da tela. */
    setFalas(atual => [
      ...atual,
      novaFala('aurora', r.tipo === 'ok' ? r.texto : r.mensagem),
    ])
  }

  async function confirmar(fala: Fala, acao: AcaoPendente) {
    if (pensando) return
    /* Marca ANTES de ir à rede: sem isso um toque duplo manda duas vezes, e
       "agenda a Maria" viraria duas consultas no mesmo horário. */
    setFalas(atual => atual.map(f => (f.id === fala.id ? { ...f, decidida: 'feita' } : f)))
    setPensando(true)

    /* `executarAcaoConfirmada`, e não `confirmarAcao` direto.
       Quase toda ferramenta executa no servidor, e uma -- criar aviso -- só o
       aparelho consegue fazer, porque a notificação é agendada pelo sistema
       operacional do telefone. Um ponto único de saída é o que faz a próxima
       ferramenta local não precisar de um `if` novo aqui. */
    const r = await executarAcaoConfirmada(acao)
    setPensando(false)
    setFalas(atual => [
      ...atual,
      novaFala('aurora', r.tipo === 'ok' ? r.texto : r.tipo === 'erro' ? r.mensagem : ''),
      /* Deu certo: pergunta o próximo passo, em vez de encerrar no relato seco
         do banco. Num balão à parte, e não emendada no texto da RPC -- o
         "Consulta agendada para..." é o que QUEM GRAVOU escreveu, e essa
         fronteira é o que faz o histórico servir para conferir depois.
         Na falha não vai: quem acabou de ler que nada foi gravado não está
         procurando o que fazer em seguida. */
      ...(r.tipo === 'ok' ? [novaFala('aurora', FECHAMENTO)] : []),
    ])
  }

  function cancelar(fala: Fala) {
    setFalas(atual => atual.map(f => (f.id === fala.id ? { ...f, decidida: 'cancelada' } : f)))
  }

  const vazia = falas.length === 0
  /* Cartão esperando decisão. Enquanto houver um, nada mais é oferecido. */
  const cartaoAberto = falas.some(f => f.acao && f.decidida === undefined)

  return (
    <View
      style={[styles.tela, { paddingTop: top + 8 }]}
      onLayout={e => setAlturaDaTela(e.nativeEvent.layout.height)}
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
        <Text style={styles.tituloTela}>Aurora</Text>
        <View style={styles.botaoVoltar} />
      </View>

      <ScrollView
        ref={rolagem}
        contentContainerStyle={styles.conversa}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {vazia && (
          <View style={styles.abertura}>
            {/* A marca antes da frase. Uma tela de conversa que abre com texto
                puro parece um aviso do sistema; um símbolo antes diz que há
                alguém do outro lado -- e é o mesmo símbolo do botão redondo da
                barra, que é por onde ela chegou aqui. */}
            <View style={styles.marcaDaAurora}>
              <Ionicons name="sparkles" size={21} color={paleta().cores.limao} />
            </View>
            <Text style={styles.tituloAbertura}>O que você quer resolver agora?</Text>
            {/* Dito por escrito, e antes da primeira pergunta. Sem isto a
                primeira coisa que se pede é justamente o que ela não faz --
                "remarca a Maria" --, e uma recusa de saída ensina em dez
                segundos que a Aurora não serve para nada.

                O texto vem de `menuDaAurora` porque é o MESMO que ela responde
                a "menu principal". Escrito duas vezes, um dos dois envelhece --
                e este já tinha envelhecido: dizia que agendar continuava no
                computador depois de a Aurora passar a agendar. */}
            <Text style={styles.textoAbertura}>{O_QUE_ELA_FAZ}</Text>

            <View style={styles.exemplos}>
              {PERGUNTAS_DE_EXEMPLO.map(p => (
                <Pressable
                  key={p}
                  onPress={() => void mandar(p)}
                  style={({ pressed }) => [styles.exemplo, pressed && styles.pressionado]}
                  accessibilityRole="button"
                >
                  <Text style={styles.textoExemplo}>{p}</Text>
                  {/* A seta é o que diz que a linha É a pergunta, e não um
                      exemplo do que escrever. Sem ela, quem lê "Quem eu atendo
                      hoje?" vai digitar aquilo no campo de baixo -- e o toque
                      que resolvia em um gesto nunca é descoberto. */}
                  <Ionicons name="arrow-forward" size={15} color={paleta().inkFraco} />
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {falas.map(f =>
          f.acao ? (
            <View key={f.id} style={styles.cartao}>
              <View style={styles.topoDoCartao}>
                <Ionicons name="alert-circle-outline" size={16} color={paleta().cores.gold} />
                <Text style={styles.rotuloDoCartao}>CONFIRA ANTES</Text>
              </View>

              <Text style={styles.resumoDoCartao}>{f.texto}</Text>

              {f.decidida === undefined ? (
                <View style={styles.botoesDoCartao}>
                  {/* Cancelar é o botão LARGO e Confirmar é o estreito, ao
                      contrário do costume. Quem está com pressa toca no maior, e
                      aí o gesto sem atenção precisa ser o que NÃO grava. */}
                  <Pressable
                    onPress={() => cancelar(f)}
                    style={({ pressed }) => [styles.cancelar, pressed && styles.pressionado]}
                    accessibilityRole="button"
                  >
                    <Text style={styles.textoCancelar}>Cancelar</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void confirmar(f, f.acao!)}
                    style={({ pressed }) => [styles.confirmar, pressed && styles.pressionado]}
                    accessibilityRole="button"
                  >
                    <Text style={styles.textoConfirmar}>Confirmar</Text>
                  </Pressable>
                </View>
              ) : (
                /* A decisão fica escrita, e não some com os botões: rolar para
                   cima e ver "Confirmado" é o que responde "eu marquei mesmo
                   aquela consulta?" sem abrir o computador. */
                <Text style={styles.decidido}>
                  {f.decidida === 'feita' ? 'Confirmado por você' : 'Cancelado'}
                </Text>
              )}
            </View>
          ) : (
            <View
              key={f.id}
              style={[styles.balao, f.papel === 'nutri' ? styles.balaoDela : styles.balaoDaAurora]}
            >
              <Text style={f.papel === 'nutri' ? styles.textoDela : styles.textoDaAurora}>
                {f.texto}
              </Text>
            </View>
          ),
        )}

        {pensando && (
          <View style={[styles.balao, styles.balaoDaAurora, styles.pensando]}>
            <ActivityIndicator color={paleta().inkFraco} size="small" />
          </View>
        )}
      </ScrollView>

      {/* O caminho de volta para o começo, e a resposta a "e agora?".
          Os exemplos existiam SÓ com a conversa vazia: depois da primeira
          pergunta não havia mais nada indicando o que ela podia pedir, e foi
          procurando isso que "menu principal" virou busca de paciente.

          Some enquanto ela digita (o teclado já ocupa a tela), enquanto a
          Aurora pensa, e enquanto houver cartão esperando decisão -- ali a
          única coisa a fazer é confirmar ou cancelar. */}
      {!vazia && !pensando && !cartaoAberto && !texto.trim() && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.tira}
        >
          {PERGUNTAS_DE_EXEMPLO.map(p => (
            <Pressable
              key={p}
              onPress={() => void mandar(p)}
              style={({ pressed }) => [styles.sugestao, pressed && styles.pressionado]}
              accessibilityRole="button"
            >
              <Text style={styles.textoSugestao}>{p}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* ──────────────────── A BARRA DE ESCREVER ────────────────────
       *
       * Um botão só à DIREITA, que troca de papel: microfone quando o campo
       * está vazio, seta de enviar assim que ela escreve alguma coisa.
       *
       * É o arranjo do WhatsApp, e ele foi pedido com essas palavras. Não é
       * imitação por imitação: o polegar de quem segura o telefone com uma mão
       * alcança o canto direito de baixo, e é lá que fica a única ação que a
       * barra tem em cada momento. Com o microfone à ESQUERDA -- como estava --
       * a mão precisa atravessar a tela para falar, que é justamente o caso de
       * quem está com as mãos ocupadas entre duas consultas.
       *
       * E os dois nunca aparecem juntos de propósito: dois botões redondos lado
       * a lado, um deles desligado metade do tempo, é a barra pedindo uma
       * escolha que não existe -- ou ela escreveu, e manda; ou não escreveu, e
       * fala. */}
      <View style={[styles.barra, { paddingBottom: 10 + respiro }]}>
        <View style={styles.campoRedondo}>
          <TextInput
            value={texto}
            onChangeText={setTexto}
            placeholder="Pergunte alguma coisa"
            placeholderTextColor={paleta().inkFraco}
            keyboardAppearance="dark"
            multiline
            maxLength={600}
            onSubmitEditing={() => void mandar(texto)}
            style={styles.campo}
            accessibilityLabel="Sua pergunta para a Aurora"
          />
        </View>

        {temTexto ? (
          <Pressable
            onPress={() => void mandar(texto)}
            disabled={pensando}
            style={({ pressed }) => [
              styles.botaoMandar,
              pensando && styles.botaoDesligado,
              pressed && styles.pressionado,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Enviar a pergunta"
          >
            <Ionicons name="arrow-up" size={19} color={paleta().cores.branco} />
          </Pressable>
        ) : (
          /* ── FALAR EM VEZ DE DIGITAR ──
           *
           * O MESMO `<Ditado>` das outras duas telas, e não uma gravação escrita
           * aqui. Ele já carrega a permissão do microfone com a explicação antes
           * da caixa do sistema, o cronômetro, o limite de 60 segundos, o
           * reenvio quando a transcrição volta vazia, e o `File` do
           * expo-file-system no lugar do `{ uri, name, type }` que o `fetch` do
           * SDK 57 anexa como "[object Object]" -- a armadilha 17, que custou
           * uma semana e apareceu como quatro defeitos diferentes.
           *
           * `assunto="nutri"` não é detalhe: o contexto padrão do servidor é uma
           * lista de COMIDA, e o Whisper obedece o contexto. "Remarca a Maria
           * pra sexta" com aquele prompt volta como uma frase sobre pão de
           * queijo -- é o caso já medido, com o comando de treino.
           *
           * O texto ditado vai para o CAMPO, e não direto para a Aurora. Ela lê
           * antes de mandar, e corrige o nome que o modelo ouviu errado. E é o
           * que faz o botão virar seta sozinho quando a transcrição chega: o
           * gesto seguinte já é o de mandar. */
          <Ditado
            compacto
            assunto="nutri"
            onTexto={ouvido => {
              /* Junta ao que já estiver escrito, e não substitui: quem digitou
                 meia frase e resolveu falar o resto perderia a metade
                 digitada. */
              setTexto(antes => (antes.trim() ? antes.trim() + ' ' + ouvido : ouvido))
            }}
            /* A falha da transcrição entra como fala da Aurora, e não como
               faixa no alto -- a mesma decisão que o resto desta tela já tomou:
               numa conversa, erro fora do fluxo fica acima da rolagem e ninguém
               lê. */
            onErro={mensagem => setFalas(atual => [...atual, novaFala('aurora', mensagem)])}
          />
        )}
      </View>
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
      paddingBottom: 6,
    },
    botaoVoltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    tituloTela: { fontFamily: FONTE.forte, fontSize: 17, color: t.cores.ink },

    conversa: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },

    abertura: { paddingTop: 20, gap: 12 },
    marcaDaAurora: {
      width: 44,
      height: 44,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.cores.forest,
    },
    /* 25 e não 20. É a pergunta que dá nome à tela, e a tela inteira existe
       para respondê-la -- ela tem de ser a maior coisa aqui, e não um título
       de parágrafo. */
    tituloAbertura: {
      fontFamily: FONTE.forte,
      fontSize: 25,
      color: t.cores.ink,
      letterSpacing: -0.9,
      lineHeight: 29,
    },
    textoAbertura: { fontFamily: FONTE.normal, fontSize: 13.5, color: t.inkSuave, lineHeight: 20 },
    exemplos: { gap: 8, marginTop: 6 },
    /* Ganha borda, e o texto ganha a seta ao lado. Sem borda o botão era um
       retângulo creme sobre fundo creme -- e nada nele dizia que era tocável. */
    exemplo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    textoExemplo: { flex: 1, fontFamily: FONTE.normal, fontSize: 14, color: t.cores.ink },

    balao: { maxWidth: '86%', borderRadius: 16, paddingVertical: 11, paddingHorizontal: 14 },
    /* ──────────────────── O balão dela deixa de ser VERDE ────────────────────
       Verde é a cor da ação neste app -- o botão Confirmar, o Aceitar. Uma
       conversa inteira dela em verde punha a cor de "executa" em cima do que ela
       DISSE, e deixava o cartão de confirmar competindo com dez balões da
       mesma cor. Musgo escuro separa quem fala de quem age. */
    balaoDela: {
      alignSelf: 'flex-end',
      backgroundColor: t.cores.forest,
      borderBottomRightRadius: 5,
    },
    /* O canto quebrado do lado de quem fala: é o que faz duas falas seguidas
       de pessoas diferentes se lerem como diálogo, sem nome em cima de cada
       uma. */
    balaoDaAurora: {
      alignSelf: 'flex-start',
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderBottomLeftRadius: 5,
    },
    textoDela: { fontFamily: FONTE.normal, fontSize: 14.5, color: t.cores.mist, lineHeight: 21 },
    textoDaAurora: { fontFamily: FONTE.normal, fontSize: 14.5, color: t.cores.ink, lineHeight: 21 },
    pensando: { paddingVertical: 14, paddingHorizontal: 18 },

    /* O cartão ocupa a largura toda, e os balões não. É o que faz o olho parar
       nele em vez de ler como mais uma fala da conversa. */
    /* ──────────────────── O CARTÃO DE CONFIRMAR ────────────────────
       Fundo BRANCO -- a única superfície elevada do tema -- em vez do creme dos
       balões, e com a faixa dourada colada no topo. É a única coisa desta tela
       que grava no sistema de verdade, e antes ela era um retângulo creme com
       borda: a mesma cor dos balões, só que mais largo.

       `overflow: 'hidden'` porque a faixa vai até as bordas, e sem isso ela
       vaza pelos cantos arredondados no Android. */
    cartao: {
      backgroundColor: t.cores.superficie,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderRadius: 18,
      overflow: 'hidden',
    },
    /* A faixa ocupa a largura toda e tem fundo próprio: um rótulo dourado
       solto dentro do cartão era só mais uma linha de texto. */
    topoDoCartao: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: t.cores.atencaoFundo,
      borderBottomWidth: 1,
      borderBottomColor: t.cores.gold,
      paddingHorizontal: 15,
      paddingVertical: 9,
    },
    rotuloDoCartao: {
      fontFamily: FONTE.forte,
      fontSize: 11,
      letterSpacing: 0.9,
      color: t.cores.gold,
    },
    resumoDoCartao: {
      fontFamily: FONTE.meia,
      fontSize: 15.5,
      color: t.cores.ink,
      lineHeight: 23,
      paddingHorizontal: 15,
      paddingTop: 14,
    },
    /* O cartao perdeu o padding proprio quando a faixa dourada passou a ir ate
       a borda -- entao ele volta aqui, e nos dois filhos que ficam por fora do
       resumo. */
    botoesDoCartao: { flexDirection: 'row', gap: 10, padding: 15 },
    /* Creme, e nao `superficie`: `superficie` e o branco, que agora e o fundo
       DO PROPRIO CARTAO -- o botao Cancelar sairia branco sobre branco, com so
       uma borda de 12% para separar. Ficou um degrau abaixo do cartao, que e o
       que faz um botao de contorno existir. */
    cancelar: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 13,
      borderRadius: 13,
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.borda,
    },
    textoCancelar: { fontFamily: FONTE.meia, fontSize: 14.5, color: t.cores.ink },
    confirmar: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 13,
      paddingHorizontal: 22,
      borderRadius: 13,
      backgroundColor: t.cores.verde,
    },
    textoConfirmar: { fontFamily: FONTE.forte, fontSize: 14.5, color: t.cores.branco },
    decidido: { fontFamily: FONTE.meia, fontSize: 13, color: t.inkFraco, padding: 15, paddingTop: 12 },

    /* Chips baixos e em linha, para caberem sem empurrar a conversa. A tira
       rola: quatro perguntas não cabem na largura de um celular, e cortar a
       quarta seria esconder justamente a que ensina que a Aurora agenda. */
    tira: { gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
    sugestao: {
      backgroundColor: t.cores.cartao,
      borderRadius: 16,
      paddingVertical: 9,
      paddingHorizontal: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.cores.borda,
    },
    textoSugestao: { fontSize: 13, color: t.inkSuave },

    barra: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      paddingHorizontal: 12,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: t.cores.borda,
      backgroundColor: t.cores.fundo,
    },
    /* O campo numa cápsula, e o botão FORA dela.
       Era uma caixa só com tudo dentro; separar é o que faz o botão parecer uma
       ação e não um enfeite grudado no texto. */
    campoRedondo: {
      flex: 1,
      minHeight: 42,
      justifyContent: 'center',
      backgroundColor: t.cores.superficie,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderRadius: 21,
      paddingHorizontal: 16,
      paddingVertical: 4,
    },
    /* Sem fundo, sem borda e sem raio: quem desenha a cápsula agora é o pai
       (`campoRedondo`). Deixar os dois com fundo dava uma cápsula dentro da
       outra, com dois tons de creme quase iguais e uma borda fantasma no meio. */
    campo: {
      maxHeight: 120,
      paddingVertical: 8,
      fontFamily: FONTE.normal,
      fontSize: 14.5,
      color: t.cores.ink,
    },
    botaoMandar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.cores.verde,
    },
    /* Cor, e não opacidade -- o tema tem um `desligado` medido justamente
       porque opacity compõe texto E fundo contra a página e destrói o contraste
       entre os dois (um primário a 0.45 dava 1,43, com o mínimo em 4,5). */
    botaoDesligado: { backgroundColor: t.cores.desligado },
    pressionado: { opacity: 0.75 },
  }),
)
