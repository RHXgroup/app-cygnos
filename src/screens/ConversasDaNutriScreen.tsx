import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Image,
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

import { AudioDoBalao } from '../components/AudioDoBalao'
import { Ditado } from '../components/Ditado'
import {
  conversaCom,
  conversasDaNutri,
  marcarLidas,
  responder,
  type ConversaDaNutri,
  type MensagemDaConversa,
  type MensagemQueChegou,
} from '../lib/conversasDaNutri'
import { enderecoNoDiario } from '../lib/fotoDoDiario'
import { FONTE } from '../lib/fontes'
import {
  desdeQuando,
  horaDaMensagem,
  legendaDoBalao,
  previaDaConversa,
} from '../lib/previaDaConversa'
import { estilosDe, paleta } from '../lib/tema'
import { useDesvioDoTeclado } from '../lib/teclado'

/* As conversas com os pacientes.
 *
 * ──────────────────── O pedido ────────────────────
 * "Se ela não tiver no computador e o paciente mandar uma mensagem, notifica ela
 * aqui. O aplicativo notifica que chegou uma mensagem pra ela."
 *
 * ──────────────────── Duas telas num arquivo, de propósito ────────────────────
 * A lista e a conversa aberta. Separá-las em dois componentes obrigaria a
 * levantar o estado da lista para o pai -- porque responder MUDA a lista (a
 * prévia, a ordem) -- e o pai aqui é a área inteira, que não tem nada com isso.
 * O degrau do voltar mora aqui pelo mesmo motivo: a conversa fecha para a
 * lista, e a lista fecha para a aba. Armadilha 1.
 *
 * ──────────────────── O que ela NÃO manda por aqui ────────────────────
 * Foto e áudio. `nutri_enviar_mensagem` recebe só texto -- é assim desde 31/08,
 * e é o que o site também faz. Podia-se estender a função, e não foi feito
 * agora de propósito: o anexo dela exige pasta no balde, conferência do caminho
 * no mesmo instante em que a linha nasce, e assinatura de endereço na volta.
 * Prometer o botão e entregar meio caminho é pior do que a barra dizer só o que
 * faz.
 *
 * O microfone da barra é DITADO, não gravação: vira texto no campo, ela lê antes
 * de mandar. É o mesmo `<Ditado>` da Aurora, com `assunto="recado"`.
 *
 * Esta linha dizia `assunto="nutri"`, e estava errada -- achado caçando defeito
 * na mesma tarde. `nutri` é vocabulário de COMANDO ("remarca", "cancela",
 * horários), e aqui ela escreve PARA a paciente. O `initial_prompt` do Whisper
 * não é conselho, é continuação: ele segue de onde o contexto parou. O padrão
 * (`refeicao`) seria pior ainda, que é lista de alimento. */
/* Quantas linhas a lista desenha.
 *
 * `nutri_conversas` devolve TODO vínculo, e não só quem já conversou -- é o que
 * permite ela começar a conversa com quem nunca escreveu. Numa carteira de 300
 * pacientes isso são 300 linhas, e esta tela usa `ScrollView`: todas montam de
 * uma vez, e a maioria diz "Nenhuma mensagem ainda".
 *
 * Achado caçando defeito, e não em uso -- o consultório de teste tem poucos
 * pacientes, então isto só apareceria no dia em que uma carteira de verdade
 * abrisse a tela. A lista de pacientes já tinha teto pelo mesmo motivo.
 *
 * 60: a ordem põe quem tem mensagem nova em cima e quem nunca falou embaixo,
 * então as 60 primeiras são sempre as que importam. O resto ganha uma linha
 * dizendo quantos são e por onde se começa uma conversa nova. */
const TETO_DA_LISTA = 60

export function ConversasDaNutriScreen({
  onFechar,
  aoMudarNaoLidas,
  chegada,
}: {
  onFechar: () => void
  /* Avisa o pai quantas ficaram por ler, para o ponto na barra apagar assim que
     ela lê -- e não só na próxima leitura do painel. */
  aoMudarNaoLidas?: (quantas: number) => void
  /* A última mensagem que chegou pelo tempo real.
   *
   * Vem do pai, e não de uma inscrição aqui: a inscrição precisa valer com esta
   * tela FECHADA, que é quando avisar serve para alguma coisa. Duas inscrições
   * ouvindo a mesma tabela dariam dois avisos para a mesma mensagem. */
  chegada?: MensagemQueChegou | null
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()

  const [conversas, setConversas] = useState<ConversaDaNutri[]>([])
  const [carregando, setCarregando] = useState(true)
  const [puxando, setPuxando] = useState(false)
  const [erro, setErro] = useState('')

  const [aberta, setAberta] = useState<ConversaDaNutri | null>(null)
  const [fio, setFio] = useState<MensagemDaConversa[]>([])
  const [abrindo, setAbrindo] = useState(false)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)

  /* Falso até a primeira leitura voltar. Ver o efeito que avisa o pai. */
  const jaCarregou = useRef(false)

  const [alturaDaTela, setAlturaDaTela] = useState(0)
  const respiro = useDesvioDoTeclado(bottom, alturaDaTela || undefined)
  const rolagem = useRef<ScrollView>(null)

  /* O que a barra mostra: seta quando há texto, microfone quando não há.
     Derivado do campo, e não um estado paralelo que pode divergir dele. */
  const temTexto = texto.trim().length > 0

  /* Quando foi a última mensagem da conversa ABERTA. Sai do fio enquanto ele
     tiver algo, e só cai para o que a lista trouxe enquanto o fio carrega. */
  const ultimaDoFio = fio.length ? fio[fio.length - 1]?.criadaEm : aberta?.ultimaEm

  const carregar = useCallback(async () => {
    const r = await conversasDaNutri()
    setCarregando(false)
    setPuxando(false)
    if (r.tipo === 'erro') {
      setErro(r.mensagem)
      return
    }
    /* Limpa o erro no sucesso. Sem isto, a leitura que dá certo depois de uma
       que falhou fica escondida atrás de uma mensagem vencida. Armadilha 9. */
    setErro('')
    setConversas(r.conversas)
    jaCarregou.current = true
  }, [])

  /* O número do pai sai DAQUI, de um lugar só, e sempre da lista.
   *
   * A primeira versão avisava o pai de dentro de três lugares diferentes — a
   * carga, a abertura, a chegada — e um deles já estava errado: o pai somava
   * +1 em toda mensagem que chegava, inclusive na conversa que ela estava
   * lendo naquele instante. O ponto vermelho acendia para o que ela acabava de
   * ler.
   *
   * `jaCarregou` porque a lista começa vazia: sem ele, a montagem da tela
   * zeraria o contador do pai antes da primeira leitura chegar — e o ponto
   * sumiria no toque, voltando um segundo depois. */
  useEffect(() => {
    if (!jaCarregou.current) return
    aoMudarNaoLidas?.(conversas.reduce((s, c) => s + c.naoLidas, 0))
  }, [conversas, aoMudarNaoLidas])

  useEffect(() => {
    void carregar()
  }, [carregar])

  /* Relê ao voltar do segundo plano: ela responde no computador, volta ao
     celular, e sem isto a lista continuaria com o ponto vermelho de uma
     conversa que ela já resolveu. Armadilha 8.

     Sem piscar -- `setCarregando` fica de fora, porque o indicador só vale para
     a primeira carga. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', e => {
      if (e === 'active') void carregar()
    })
    return () => sub.remove()
  }, [carregar])

  /* O voltar descasca: conversa aberta → lista → aba.
     Sem lista de dependências, para ficar na frente do tratador da área, que
     desta tela só sabe fechar tudo. */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (aberta) {
        fechar()
        return true
      }
      onFechar()
      return true
    })
    return () => sub.remove()
  })

  async function abrir(c: ConversaDaNutri) {
    setAberta(c)
    setFio([])
    setTexto('')
    setAbrindo(true)
    setErro('')

    const r = await conversaCom(c.contaId)
    setAbrindo(false)
    if (r.tipo === 'erro') {
      setErro(r.mensagem)
      return
    }
    setFio(r.mensagens)

    if (c.naoLidas > 0) {
      await marcarLidas(c.contaId)
      /* Zera na lista aqui, sem reler tudo: reler reordenaria a lista debaixo
         dela enquanto a conversa está aberta, e ao voltar o item teria mudado
         de lugar. */
      setConversas(atual =>
        atual.map(x => (x.contaId === c.contaId ? { ...x, naoLidas: 0 } : x)),
      )
    }
  }

  function fechar() {
    setAberta(null)
    setFio([])
    setTexto('')
    setErro('')
  }

  async function enviar() {
    const limpo = texto.trim()
    if (!limpo || !aberta || enviando) return
    setEnviando(true)
    setErro('')

    const r = await responder(aberta.contaId, limpo)
    setEnviando(false)
    if (r.tipo === 'erro') {
      setErro(r.mensagem)
      return
    }

    setTexto('')
    /* Relê a conversa em vez de acrescentar à mão: o id e o instante são do
       banco, e inventá-los aqui faria o balão pular de lugar quando a leitura
       seguinte trouxesse os de verdade. */
    const lida = await conversaCom(aberta.contaId)
    if (lida.tipo === 'ok') setFio(lida.mensagens)

    /* E atualiza a prévia da lista sem reler o servidor. */
    setConversas(atual =>
      [...atual]
        .map(x =>
          x.contaId === aberta.contaId
            ? {
                ...x,
                ultima: limpo,
                ultimaDe: 'nutricionista',
                ultimaEm: new Date().toISOString(),
                ultimaAnexoTipo: null,
              }
            : x,
        )
        /* A conversa em que ela acabou de falar sobe. Sem isto ela ficaria no
           lugar antigo até a próxima leitura, e a ordem da lista mentiria. */
        .sort((a, b) => (b.ultimaEm ?? '').localeCompare(a.ultimaEm ?? '')),
    )
  }

  useEffect(() => {
    if (fio.length) rolagem.current?.scrollToEnd({ animated: true })
  }, [fio])

  /* O TECLADO também manda rolar, e isto era um defeito relatado em uso:
   *
   *   "se eu clico pra digitar, ele tinha que arrastar o texto pra cima. Ele
   *    não faz isso, ele sobe o meu teclado pra digitar, e ele corta pra
   *    debaixo, então eu não sei onde parou a mensagem -- tenho que ir lá com o
   *    dedo e subir."
   *
   * A barra de escrever cresce com o teclado (`respiro`), e como ela é irmã da
   * rolagem numa coluna, a rolagem ENCOLHE. Encolher por baixo mantém o topo
   * parado: o que estava no fim sai da tela, e a última mensagem -- a que ela
   * está respondendo -- fica escondida atrás do teclado.
   *
   * `respiro` na lista de dependências, e não um ouvinte próprio de teclado:
   * ele JÁ é a altura medida, e um segundo ouvinte seria uma segunda fonte para
   * o mesmo número. Sem animação: o teclado já está animando, e duas animações
   * ao mesmo tempo dão um solavanco.
   *
   * `setTimeout` de zero porque a rolagem precisa acontecer DEPOIS do layout
   * novo. Sem ele, o `scrollToEnd` mede a altura antiga e para no meio. */
  useEffect(() => {
    if (!fio.length) return
    const id = setTimeout(() => rolagem.current?.scrollToEnd({ animated: false }), 0)
    return () => clearTimeout(id)
  }, [respiro, fio.length])

  /* A mensagem que chegou pelo tempo real entra sem reler o servidor.
   *
   * Duas coisas mudam, e as duas precisam: o FIO, se a conversa dela estiver
   * aberta -- senão a paciente responde e o balão só apareceria ao fechar e
   * abrir --, e a LISTA, cuja prévia e ordem envelheceram.
   *
   * `aberta` fica de fora das dependências de propósito: incluí-la faria este
   * efeito rodar de novo ao abrir qualquer conversa, com a MESMA `chegada` de
   * antes -- e a mensagem entraria no fio de outra paciente. Só a chegada
   * dispara. */
  useEffect(() => {
    if (!chegada) return

    setFio(atual => {
      if (!aberta || aberta.contaId !== chegada.contaId) return atual
      /* O mesmo id não entra duas vezes. Um `subscribe` que reconecta pode
         reentregar o que já chegou, e a mensagem duplicada na tela se lê como
         a paciente tendo escrito duas vezes. */
      return atual.some(m => m.id === chegada.id) ? atual : [...atual, chegada]
    })

    setConversas(atual =>
      [...atual]
        .map(x =>
          x.contaId === chegada.contaId
            ? {
                ...x,
                ultima: chegada.texto,
                ultimaDe: chegada.de,
                ultimaEm: chegada.criadaEm,
                ultimaAnexoTipo: chegada.anexoTipo,
                /* Já lida quando a conversa dela está na frente: ela está
                   olhando. Marcar no banco vem logo abaixo. */
                naoLidas:
                  aberta && aberta.contaId === chegada.contaId ? 0 : x.naoLidas + 1,
              }
            : x,
        )
        .sort((a, b) => (b.ultimaEm ?? '').localeCompare(a.ultimaEm ?? '')),
    )

    if (aberta && aberta.contaId === chegada.contaId) void marcarLidas(chegada.contaId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chegada])

  /* ──────────────────── A CONVERSA ABERTA ──────────────────── */
  if (aberta) {
    return (
      <View
        style={[styles.tela, { paddingTop: top + 8 }]}
        onLayout={e => setAlturaDaTela(e.nativeEvent.layout.height)}
      >
        <View style={styles.cabecalho}>
          <Pressable
            onPress={fechar}
            style={styles.voltar}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Voltar para a lista de conversas"
          >
            <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
          </Pressable>
          <View style={styles.tituloDaConversa}>
            <Text style={styles.nomeNoTopo} numberOfLines={1}>
              {aberta.nome}
            </Text>
            {/* Do FIO, e não de `aberta.ultimaEm`.
                `aberta` é a linha da lista congelada no instante em que ela
                tocou: enquanto as duas conversam, aquele valor envelhece na
                tela — e o cabeçalho diria "última mensagem há 2 horas" com a
                resposta recém-enviada logo acima dele. */}
            {!!ultimaDoFio && (
              <Text style={styles.desdeQuandoNoTopo}>
                última mensagem {desdeQuando(ultimaDoFio)}
              </Text>
            )}
          </View>
          <View style={styles.voltar} />
        </View>

        {!!erro && <Text style={styles.erro}>{erro}</Text>}

        <ScrollView
          ref={rolagem}
          contentContainerStyle={styles.fio}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {abrindo && <ActivityIndicator color={paleta().cores.verde} style={styles.girando} />}

          {!abrindo && fio.length === 0 && (
            <Text style={styles.convite}>
              Vocês ainda não conversaram por aqui. O que você escrever aparece
              no aplicativo de {aberta.nome.split(' ')[0]}.
            </Text>
          )}

          {fio.map(m => (
            <Balao key={m.id} mensagem={m} autor={aberta.nome} />
          ))}
        </ScrollView>

        {/* A barra do WhatsApp: um botão só à direita, que troca de papel.
            O polegar de quem segura o telefone com uma mão alcança o canto
            direito de baixo, e é lá que fica a única ação que a barra tem em
            cada momento. Mesma decisão da Aurora, e pelo mesmo motivo. */}
        <View style={[styles.barra, { paddingBottom: 10 + respiro }]}>
          <View style={styles.campoRedondo}>
            <TextInput
              value={texto}
              onChangeText={setTexto}
              placeholder="Escreva para a paciente"
              placeholderTextColor={paleta().inkFraco}
              multiline
              maxLength={2000}
              style={styles.campo}
              accessibilityLabel="Sua mensagem"
            />
          </View>

          {temTexto ? (
            <Pressable
              onPress={() => void enviar()}
              disabled={enviando}
              style={({ pressed }) => [
                styles.botaoMandar,
                enviando && styles.botaoDesligado,
                pressed && styles.pressionado,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Enviar a mensagem"
            >
              <Ionicons name="arrow-up" size={19} color={paleta().cores.branco} />
            </Pressable>
          ) : (
            <Ditado
              compacto
              /* 'recado', e nao 'nutri'. Achado cacando defeito depois de
                 subir: 'nutri' e vocabulario de COMANDO -- "remarca",
                 "cancela", "lanca", horarios --, e aqui ela esta escrevendo
                 PARA a paciente: "oi Ana, seu exame chegou". O
                 `initial_prompt` do Whisper nao e conselho, e continuacao: um
                 recado ditado contra uma lista de comandos puxa para comando.
                 O padrao ('refeicao') seria pior ainda, que e lista de
                 alimento. */
              assunto="recado"
              onTexto={ouvido =>
                setTexto(antes => (antes.trim() ? antes.trim() + ' ' + ouvido : ouvido))
              }
              onErro={mensagem => setErro(mensagem)}
            />
          )}
        </View>
      </View>
    )
  }

  /* ──────────────────── A LISTA ──────────────────── */
  return (
    <View style={[styles.tela, { paddingTop: top + 8 }]}>
      <View style={styles.cabecalho}>
        <Pressable
          onPress={onFechar}
          style={styles.voltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloDaTela}>Conversas</Text>
        <View style={styles.voltar} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.lista, { paddingBottom: 24 + bottom }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={puxando}
            onRefresh={() => {
              setPuxando(true)
              void carregar()
            }}
            tintColor={paleta().cores.verde}
          />
        }
      >
        {/* O erro fica DENTRO da rolagem, e a rolagem tem o controle de puxar:
            é justamente aqui que puxar para tentar de novo é o gesto óbvio. */}
        {!!erro && <Text style={styles.erro}>{erro}</Text>}

        {carregando && <ActivityIndicator color={paleta().cores.verde} style={styles.girando} />}

        {!carregando && conversas.length === 0 && !erro && (
          <Text style={styles.convite}>
            Você ainda não tem pacientes vinculados ao aplicativo. Quando alguém
            se vincular, a conversa aparece aqui.
          </Text>
        )}

        {conversas.slice(0, TETO_DA_LISTA).map(c => (
          <Pressable
            key={c.contaId}
            onPress={() => void abrir(c)}
            style={({ pressed }) => [styles.linha, pressed && styles.linhaPressionada]}
            accessibilityRole="button"
            accessibilityLabel={
              c.naoLidas > 0
                ? `Conversa com ${c.nome}, ${c.naoLidas} sem ler`
                : `Conversa com ${c.nome}`
            }
          >
            <View style={[styles.inicial, c.naoLidas > 0 && styles.inicialComNovas]}>
              <Text style={[styles.letra, c.naoLidas > 0 && styles.letraComNovas]}>
                {(c.nome.trim()[0] ?? '?').toUpperCase()}
              </Text>
            </View>

            <View style={styles.meio}>
              <Text style={[styles.nome, c.naoLidas > 0 && styles.nomeComNovas]} numberOfLines={1}>
                {c.nome}
              </Text>
              {/* Vazio quando nunca houve mensagem -- e aí a linha diz isso, em
                  vez de deixar um espaço em branco que se lê como falha. */}
              <Text style={[styles.previa, c.naoLidas > 0 && styles.previaComNovas]} numberOfLines={1}>
                {previaDaConversa(c) || 'Nenhuma mensagem ainda'}
              </Text>
            </View>

            <View style={styles.direita}>
              <Text style={styles.quando}>{desdeQuando(c.ultimaEm)}</Text>
              {c.naoLidas > 0 && (
                <View style={styles.ponto}>
                  <Text style={styles.numeroDoPonto}>{c.naoLidas > 99 ? '99+' : c.naoLidas}</Text>
                </View>
              )}
            </View>
          </Pressable>
        ))}

        {conversas.length > TETO_DA_LISTA && (
          /* Dito por escrito porque lista que acaba sem avisar é pior do que
             lista curta: ela veria terminar e não teria como desconfiar. Mesma
             decisão da lista de pacientes. */
          <Text style={styles.rodape}>
            Mostrando as {TETO_DA_LISTA} primeiras. Outros{' '}
            {conversas.length - TETO_DA_LISTA} pacientes usam o aplicativo · para
            falar com alguém pela primeira vez, abra a ficha dele.
          </Text>
        )}

        {conversas.length > 0 && (
          /* A limitação, escrita. Ela vai descobrir isto sozinha num dia em que
             importava; melhor descobrir aqui, num dia em que não importa. */
          <Text style={styles.rodape}>
            Com o aplicativo aberto, mensagem nova avisa na hora. Com ele
            fechado, ela aparece aqui quando você voltar.
          </Text>
        )}
      </ScrollView>
    </View>
  )
}

/* ──────────────────── UM BALÃO ──────────────────── */

function Balao({ mensagem, autor }: { mensagem: MensagemDaConversa; autor: string }) {
  const styles = estilos()
  /* "Minha" é a mensagem DELA: esta tela é a dela. No app do paciente a mesma
     palavra quer dizer o contrário -- e é por isso que a comparação fica aqui,
     escrita por extenso, em vez de numa função compartilhada chamada `minha`. */
  const minha = mensagem.de === 'nutricionista'
  const legenda = legendaDoBalao(mensagem.texto, mensagem.anexoTipo)

  const [foto, setFoto] = useState<string | null>(null)
  const [fotoFalhou, setFotoFalhou] = useState<string | null>(null)

  useEffect(() => {
    if (mensagem.anexoTipo !== 'foto' || !mensagem.anexoPath) return
    let vivo = true
    /* Assinar é `async` e o endereço VENCE em uma hora -- por isso ele é
       estado, e não conta feita no meio do render. Armadilha 7. */
    void enderecoNoDiario(mensagem.anexoPath).then(u => {
      if (vivo) setFoto(u)
    })
    return () => {
      vivo = false
    }
  }, [mensagem.anexoPath, mensagem.anexoTipo])

  return (
    <View style={[styles.balao, minha ? styles.balaoMeu : styles.balaoDela]}>
      {mensagem.anexoTipo === 'foto' &&
        (foto && foto !== fotoFalhou ? (
          <Image
            source={{ uri: foto }}
            style={styles.fotoDoBalao}
            resizeMode="cover"
            /* Guarda QUAL endereço falhou, e não um booleano: um endereço novo
               -- reassinado depois de vencer -- entra tentando de novo. */
            onError={() => setFotoFalhou(foto)}
          />
        ) : (
          <View style={styles.fotoQuebrada}>
            <Ionicons name="image-outline" size={18} color={paleta().inkFraco} />
            <Text style={styles.avisoDaFoto}>
              {foto === null ? 'Abrindo a foto…' : 'Não consegui abrir a foto'}
            </Text>
          </View>
        ))}

      {mensagem.anexoTipo === 'audio' && mensagem.anexoPath && (
        <AudioDoBalao caminho={mensagem.anexoPath} minha={minha} autor={`de ${autor}`} />
      )}

      {!!legenda && (
        <Text style={[styles.textoDoBalao, minha && styles.textoDoBalaoMeu]}>{legenda}</Text>
      )}

      <Text style={[styles.horaDoBalao, minha && styles.horaDoBalaoMeu]}>
        {horaDaMensagem(mensagem.criadaEm)}
      </Text>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.cores.fundo },

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
    tituloDaConversa: { flex: 1, alignItems: 'center' },
    nomeNoTopo: { fontFamily: FONTE.forte, fontSize: 16, color: t.cores.ink },
    desdeQuandoNoTopo: { fontFamily: FONTE.normal, fontSize: 11.5, color: t.inkFraco },

    erro: {
      fontFamily: FONTE.normal,
      fontSize: 13.5,
      color: t.cores.ink,
      backgroundColor: t.cores.verdeMenta,
      marginHorizontal: 16,
      marginBottom: 8,
      padding: 12,
      borderRadius: 10,
    },
    girando: { marginTop: 32 },
    convite: {
      fontFamily: FONTE.normal,
      fontSize: 13.5,
      color: t.inkSuave,
      textAlign: 'center',
      lineHeight: 20,
      paddingHorizontal: 24,
      paddingTop: 40,
    },

    /* ── A lista ── */
    lista: { paddingHorizontal: 12, gap: 2 },
    linha: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 11,
      paddingHorizontal: 8,
      borderRadius: 14,
    },
    linhaPressionada: { backgroundColor: t.cores.superficie },

    inicial: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.cores.superficie,
      borderWidth: 1,
      borderColor: t.cores.borda,
    },
    inicialComNovas: { backgroundColor: t.cores.verde, borderColor: t.cores.verde },
    letra: { fontFamily: FONTE.forte, fontSize: 17, color: t.inkSuave },
    letraComNovas: { color: t.cores.branco },

    meio: { flex: 1, gap: 2 },
    /* Família, e não `fontWeight`: com a fonte carregada o peso vira ARQUIVO, e
       `fontWeight: '700'` sobre a regular desenha a regular no Android sem
       levantar erro nenhum -- a conversa com mensagem nova ficaria igual às
       outras. Ver `lib/fontes.ts`. */
    nome: { fontFamily: FONTE.meia, fontSize: 15, color: t.cores.ink },
    nomeComNovas: { fontFamily: FONTE.forte },
    previa: { fontFamily: FONTE.normal, fontSize: 13, color: t.inkFraco },
    previaComNovas: { fontFamily: FONTE.media, color: t.inkSuave },

    direita: { alignItems: 'flex-end', gap: 5, minWidth: 56 },
    quando: { fontFamily: FONTE.normal, fontSize: 11, color: t.inkFraco },
    ponto: {
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      paddingHorizontal: 6,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.cores.verde,
    },
    numeroDoPonto: {
      fontFamily: FONTE.forte,
      fontSize: 11,
      color: t.cores.branco,
      fontVariant: ['tabular-nums'],
    },

    rodape: {
      fontFamily: FONTE.normal,
      fontSize: 11.5,
      color: t.inkFraco,
      textAlign: 'center',
      lineHeight: 17,
      paddingHorizontal: 20,
      paddingTop: 20,
    },

    /* ── A conversa ── */
    fio: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
    balao: {
      maxWidth: '82%',
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 4,
    },
    balaoDela: {
      alignSelf: 'flex-start',
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderBottomLeftRadius: 5,
    },
    balaoMeu: {
      alignSelf: 'flex-end',
      backgroundColor: t.cores.verde,
      borderBottomRightRadius: 5,
    },
    textoDoBalao: { fontFamily: FONTE.normal, fontSize: 14.5, color: t.cores.ink, lineHeight: 20 },
    textoDoBalaoMeu: { color: t.cores.branco },
    horaDoBalao: {
      fontFamily: FONTE.normal,
      fontSize: 10.5,
      color: t.inkFraco,
      alignSelf: 'flex-end',
      fontVariant: ['tabular-nums'],
    },
    horaDoBalaoMeu: { color: t.cores.branco, opacity: 0.75 },

    fotoDoBalao: { width: 200, height: 200, borderRadius: 10, backgroundColor: t.cores.trilho },
    fotoQuebrada: {
      width: 200,
      height: 90,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: t.cores.trilho,
    },
    avisoDaFoto: { fontFamily: FONTE.normal, fontSize: 11.5, color: t.inkFraco },

    /* ── A barra ── */
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
    /* Cor, e não opacidade: o tema tem um `desligado` medido para isto. */
    botaoDesligado: { backgroundColor: t.cores.desligado },
    pressionado: { opacity: 0.75 },
  }),
)
