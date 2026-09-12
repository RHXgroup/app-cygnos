import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, BackHandler, PanResponder, StyleSheet, View } from 'react-native'
import { BarraDaNutri, type AbaDaNutri } from '../components/BarraDaNutri'
import { AgendaDaNutriScreen } from './AgendaDaNutriScreen'
import { AuroraDaNutriScreen } from './AuroraDaNutriScreen'
import { ConversasDaNutriScreen } from './ConversasDaNutriScreen'
import { FotoDoPratoDaNutriScreen } from './FotoDoPratoDaNutriScreen'
import { LerCodigoScreen } from './LerCodigoScreen'
import { MaisDaNutriScreen } from './MaisDaNutriScreen'
import { PacientesDaNutriScreen } from './PacientesDaNutriScreen'
import { PainelDaNutriScreen } from './PainelDaNutriScreen'
import {
  avisarQueChegou,
  conversasDaNutri,
  ouvirConversas,
  totalNaoLidas,
  type MensagemQueChegou,
} from '../lib/conversasDaNutri'
import { type PacienteEmFoco } from '../lib/auroraSobreAPaciente'
import { previaDaConversa } from '../lib/previaDaConversa'
import { estilosDe } from '../lib/tema'
import { abaDoDeslize } from '../lib/deslizarEntreAbas'

/* A área dela: as abas, e o que abre por cima delas.
 *
 * ──────────────────── Por que UMA aba montada por vez, e não as quatro ────────────────────
 * O app do paciente monta as quatro de uma vez e nunca desmonta -- é carrossel,
 * não navegação -- e isso custou dois defeitos documentados na armadilha 13: um
 * `useEffect` com `[]` que rodava uma vez por SESSÃO em vez de uma por abertura,
 * e uma aba marcando mensagem como lida estando invisível.
 *
 * Aqui não vale a pena pagar esse preço. As telas dela são de LEITURA de dado
 * que muda do outro lado o tempo todo, então remontar ao voltar é o
 * comportamento certo -- ela quer a agenda de agora, e não a de quando abriu o
 * app. O que se perde é o estado da tela (o mês que ela estava olhando), e isso
 * é menos grave do que ver dado velho sem saber que é velho.
 *
 * ──────────────────── O voltar ────────────────────
 * Registrado aqui e SEM lista de dependências, para ficar na frente do tratador
 * central do App -- que, estando na área logada, só sabe fechar sobreposição do
 * paciente. Armadilha 1. A ordem é a de descascar: primeiro o que está por
 * cima, depois a aba, e só então o app sai. */
export function AreaDaNutri({ onSair }: { onSair: () => void }) {
  const styles = estilos()
  const [aba, setAba] = useState<AbaDaNutri>('hoje')
  const [auroraAberta, setAuroraAberta] = useState(false)
  /* Quando a Aurora foi aberta de dentro de uma ficha, quem está nela.
   *
   * Estado separado do "aberta" porque os dois caminhos existem: pelo botão da
   * barra ela abre SEM foco (a pergunta pode ser sobre o dia, o dinheiro, a
   * agenda), e pela ficha abre COM. Um estado só, `foco | null`, faria "aberta
   * sem foco" e "fechada" virarem o mesmo `null`. */
  const [focoDaAurora, setFocoDaAurora] = useState<PacienteEmFoco | null>(null)

  /* As duas entradas passam por aqui, e por isso ninguém esquece de limpar o
     foco: abrir pela barra é abrir com foco nenhum, explicitamente. */
  const abrirAurora = (foco: PacienteEmFoco | null) => {
    setFocoDaAurora(foco)
    setAuroraAberta(true)
  }
  const [lendoCodigo, setLendoCodigo] = useState(false)
  const [fotografando, setFotografando] = useState(false)
  const [conversando, setConversando] = useState(false)
  /* O mesmo valor, num ref, só para o ouvinte do tempo real.
   *
   * O ouvinte precisa saber se a tela de conversas está na frente — para não
   * avisar de uma mensagem que ela está vendo chegar —, mas pô-lo na lista de
   * dependências faria a inscrição cair e subir de novo a cada abertura e
   * fechamento da tela. Entre a queda e a volta há uma janela em que nada
   * chega, e é trabalho à toa: um websocket derrubado por uma mudança de
   * booleano. */
  const conversandoAgora = useRef(false)
  conversandoAgora.current = conversando

  /* —————————— AS MENSAGENS DOS PACIENTES ——————————
   *
   * "Se ela não tiver no computador e o paciente mandar uma mensagem, notifica
   * ela aqui."
   *
   * —— Por que a inscrição mora AQUI, e não na tela de conversas ——
   *
   * Porque uma inscrição dentro da tela só existe com a tela ABERTA — e a tela
   * só está aberta quando ela já foi olhar, que é exatamente o caso em que
   * avisar não serve para nada. O aviso tem de valer de qualquer aba.
   *
   * A área é o lugar mais interno que continua montado em todas elas. O App
   * inteiro seria mais alto e estaria errado: lá também mora o paciente, e a
   * política que traz estas linhas é a da carteira dela.
   *
   * —— E até onde vai, sem promessa ——
   *
   * Com o app ABERTO. É um websocket vivendo no processo do app; com o app
   * fechado não há processo. Isso é push, e push exige development build — o
   * Expo Go não recebe push no Android desde o SDK 53. Está escrito na tela
   * também, para ela não descobrir num dia em que importava. */
  const [naoLidas, setNaoLidas] = useState(0)
  /* A última que chegou pelo tempo real, repassada à tela de conversas para
     entrar no fio sem ela precisar fechar e abrir. */
  const [chegada, setChegada] = useState<MensagemQueChegou | null>(null)

  /* ──────────────────── DESLIZAR ENTRE AS ABAS ────────────────────
   *
   * Pedido dele depois de usar: "raspo o lado com o dedo no do paciente e ele
   * vai navegando entre os menus; aqui não vai, tem que clicar".
   *
   * `PanResponder` e não um carrossel. O app do paciente monta as quatro abas
   * ao mesmo tempo dentro de um ScrollView horizontal, e isso custou os dois
   * defeitos da armadilha 13 -- `useEffect` com `[]` rodando uma vez por SESSÃO
   * e aba invisível marcando mensagem como lida. Esta área monta UMA por vez de
   * propósito, e o gesto não pode desfazer essa decisão: ele só troca qual
   * está montada.
   *
   * ── CAPTURA, e não bolha. Eu tinha escrito o contrário, e não funcionava ──
   *
   * A primeira versão usava `onMoveShouldSetPanResponder` (fase de bolha), com
   * o argumento de que assim as faixas horizontais -- os chips de Pacientes --
   * continuariam rolando. O argumento estava certo e a premissa errada: em
   * bolha o pai só é consultado se os filhos RECUSAREM, e cada aba é um
   * `ScrollView` que ocupa a tela inteira e agarra o toque assim que ele se
   * move. O pai nunca era perguntado, e o gesto simplesmente não existia.
   *
   * Eu commitei isso como pronto sem ter deslizado num aparelho. `tsc` limpo e
   * 307 casos verdes não dizem nada sobre quem ganha o toque -- essa parte só
   * o dedo responde.
   *
   * Com `Capture` o pai decide ANTES dos filhos, e por isso os limiares deixam
   * de ser conforto e viram a única proteção: 60px e o dobro de horizontal
   * sobre vertical. Rolagem comum passa longe dos dois.
   *
   * `useRef` porque `PanResponder.create` guarda as funções que recebeu: um
   * responder recriado a cada renderização deixa o gesto em curso apontando
   * para o `aba` de duas renderizações atrás. */
  const abaAgora = useRef<AbaDaNutri>('hoje')
  abaAgora.current = aba

  const gesto = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_e, g) => abaDoDeslize(abaAgora.current, g.dx, g.dy) !== null,

      /* ── E AGORA O QUE FALTAVA: SEGURAR O QUE FOI GANHO ──
       *
       * Relatado em uso: "eu estou na parte de hoje, eu arrasto pro lado
       * esquerdo... Se eu tiver em cima de algum menu ele não vai, tem que
       * estar fora de todos os menus."
       *
       * A captura acima é a metade que faz o pai ser PERGUNTADO antes dos
       * filhos, e ela já tinha sido consertada uma vez (era bolha, e o
       * ScrollView agarrava o toque). Mas ganhar o gesto é MANTER o gesto são
       * duas coisas, e a segunda faltava:
       *
       * - `onPanResponderTerminationRequest` responde "posso te devolver o
       *   gesto?". O padrão é SIM. Então o ScrollView de dentro do cartão pedia
       *   de volta no meio do arrasto e levava -- e o dedo continuava andando
       *   sem trocar de aba. Em cima de área vazia não há quem peça, e por isso
       *   funcionava fora dos cartões: exatamente o que ele descreveu.
       *
       * - `onShouldBlockNativeResponder` é do ANDROID, e não existe no iOS. Sem
       *   ele, a rolagem NATIVA continua correndo por baixo mesmo com o gesto
       *   do JavaScript ganho -- a tela range de lado enquanto rola de cima
       *   para baixo. */
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,

      onPanResponderRelease: (_e, g) => {
        const destino = abaDoDeslize(abaAgora.current, g.dx, g.dy)
        if (destino) setAba(destino)
      },
    }),
  ).current

  const contar = useCallback(async () => {
    const r = await conversasDaNutri()
    /* Erro não vira zero nem faixa vermelha: o ponto é enfeite comparado ao
       resto da área, e uma falha de rede aqui não pode interromper a agenda
       dela. O número anterior fica, e a próxima leitura corrige. */
    if (r.tipo === 'ok') setNaoLidas(totalNaoLidas(r.conversas))
  }, [])

  useEffect(() => {
    void contar()
  }, [contar])

  /* Ao voltar do segundo plano. É também o caminho da mensagem que chegou com
     o app fechado: sem isto, ela só apareceria na próxima vez que a área
     montasse — ou seja, no próximo login. Armadilha 8. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', e => {
      if (e === 'active') void contar()
    })
    return () => sub.remove()
  }, [contar])

  useEffect(() => {
    const desligar = ouvirConversas(m => {
      setChegada(m)
      setNaoLidas(n => n + 1)

      /* O balão só quando ela NÃO está com a tela de conversas na frente.
         Notificar a mensagem que ela está vendo chegar é o app avisando de uma
         coisa que a pessoa acabou de ler. */
      if (conversandoAgora.current) return

      /* O nome não vem no INSERT — a linha de `app_mensagens` tem `conta_id`, e
         nome mora em `app_contas`. Pedir o nome aqui seria uma ida ao banco
         dentro do ouvinte, a cada mensagem. "Mensagem nova" é menos do que o
         nome e mais do que nada, e ela abre e vê de quem é. */
      void avisarQueChegou(
        'Mensagem nova',
        previaDaConversa({
          ultima: m.texto,
          ultimaDe: m.de,
          ultimaEm: m.criadaEm,
          ultimaAnexoTipo: m.anexoTipo,
        }),
      )
    })
    return desligar
    /* Lista vazia: a inscrição vive enquanto a área viver. O único valor de
       fora que ela lê é o ref acima, que está sempre atual justamente para
       esta lista poder ficar vazia. */
  }, [])

  /* ──── O voltar central, registrado UMA VEZ e lendo por `ref` ────
   *
   * Ele já teve as duas formas, e cada uma quebrou de um lado.
   *
   * SEM lista, ele se re-registrava a cada renderização -- e a área re-renderiza
   * a cada mensagem que chega (`naoLidas`). Como os efeitos do filho rodam antes
   * dos do pai, o pai entrava por último e passava na frente de TODOS os de
   * dentro: ficha aberta, chega mensagem, ela aperta voltar e cai na aba Hoje.
   *
   * COM lista, ele se re-registrava quando o que ele lê mudava -- e `aba` é uma
   * dessas coisas. Tocar na aba da agenda MUDA `aba` aqui e MONTA a tela da
   * agenda na mesma renderização: a agenda registra primeiro, a área depois, e a
   * área ganha. Relatado em 12/09: "clico no dia trinta, aperto voltar e ele vai
   * pra página inicial -- devia voltar pro calendário".
   *
   * As duas formas erram pelo MESMO motivo, e por isso a saída é a terceira:
   * registrar uma vez só, na montagem, e nunca mais. Aqui a área é o tratador
   * mais de FORA da parte logada -- ela deve estar no fundo da fila, e quem
   * monta depois passa na frente dela sozinho. O estado vem de `ref` porque um
   * tratador registrado uma vez leria para sempre os valores da primeira
   * renderização.
   *
   * Sobra um caso, e está escrito na armadilha 1: uma tela que monta no MESMO
   * instante que a área (a primeira aba) registra ANTES dela e perde. Para essas
   * existe `useVoltarDoAparelho`, que registra numa microtarefa. */
  const oQueEstaAberto = useRef({ conversando, fotografando, lendoCodigo, auroraAberta, aba })
  oQueEstaAberto.current = { conversando, fotografando, lendoCodigo, auroraAberta, aba }

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const agora = oQueEstaAberto.current
      if (agora.conversando) {
        setConversando(false)
        return true
      }
      if (agora.fotografando) {
        setFotografando(false)
        return true
      }
      if (agora.lendoCodigo) {
        setLendoCodigo(false)
        return true
      }
      if (agora.auroraAberta) {
        setAuroraAberta(false)
        /* O foco morre junto. Sem isto, abrir a Aurora pela barra depois de a
           ter aberto por uma ficha traria a paciente anterior de volta -- e as
           perguntas iriam sobre quem ela não está olhando. */
        setFocoDaAurora(null)
        return true
      }
      /* De qualquer aba, o voltar leva à inicial antes de sair do app. É o que
         todo mundo espera, e é o degrau que impede o gesto de fechar o app com
         ela no meio da agenda. */
      if (agora.aba !== 'hoje') {
        setAba('hoje')
        return true
      }
      return false
    })
    return () => sub.remove()
  }, [])

  /* As sobreposições vêm ANTES das abas e substituem a tela inteira: as duas
     são gestos de um minuto, e a barra de abas embaixo delas só ofereceria uma
     saída que o próprio cabeçalho já oferece. */
  if (lendoCodigo) {
    return <LerCodigoScreen paraBaseDaNutri onFechar={() => setLendoCodigo(false)} />
  }
  if (fotografando) {
    return <FotoDoPratoDaNutriScreen onFechar={() => setFotografando(false)} />
  }
  if (conversando) {
    return (
      <ConversasDaNutriScreen
        chegada={chegada}
        onFechar={() => setConversando(false)}
        aoMudarNaoLidas={setNaoLidas}
      />
    )
  }
  if (auroraAberta) {
    return (
      <AuroraDaNutriScreen
        /* `?? undefined` porque a prop de lá é opcional e não aceita nulo.
           Sem foco -- aberta pelo botão da barra -- a Aurora é a de sempre. */
        sobre={focoDaAurora ?? undefined}
        onFechar={() => {
          setAuroraAberta(false)
          setFocoDaAurora(null)
        }}
      />
    )
  }

  return (
    <View style={styles.tela}>
      <View style={styles.conteudo} {...gesto.panHandlers}>
        {aba === 'hoje' && (
          <PainelDaNutriScreen
            onSair={onSair}
            onLerCodigo={() => setLendoCodigo(true)}
            onAurora={abrirAurora}
            naoLidas={naoLidas}
            onConversas={() => setConversando(true)}
          />
        )}
        {aba === 'agenda' && <AgendaDaNutriScreen onAurora={abrirAurora} />}
        {aba === 'pacientes' && <PacientesDaNutriScreen onAurora={abrirAurora} />}
        {aba === 'mais' && (
          <MaisDaNutriScreen
            onSair={onSair}
            onLerCodigo={() => setLendoCodigo(true)}
            naoLidas={naoLidas}
            onConversas={() => setConversando(true)}
          />
        )}
      </View>

      <BarraDaNutri ativa={aba} onTrocar={setAba} onAurora={() => setAuroraAberta(true)} />
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.cores.fundo },
    conteudo: { flex: 1 },
  }),
)
