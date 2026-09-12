import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
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
  conversaAnterior,
  dequemEAConversa,
  esquecerConversa,
  guardarConversa,
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
  fraseDeAberturaDaAurora,
  semRestos,
  ehPedidoDeMenu,
} from '../lib/menuDaAurora'
import { consultasDoDia, pedidosDeConsulta } from '../lib/agendaDaNutri'
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

export function AuroraDaNutriScreen({
  onFechar,
  /* ──────────────────── ABRIR JÁ FALANDO DE ALGUÉM ────────────────────
   *
   * Quando a Aurora é aberta de dentro da ficha, ela chega sabendo de quem se
   * trata -- e a nutricionista não precisa dizer "a Maria Alves" para uma tela
   * que acabou de mostrar a Maria Alves.
   *
   * O NOME serve só para a tela: aparece na primeira fala, que é LOCAL e não
   * entra no histórico mandado ao servidor. Para o servidor vai `#412`, que é
   * o recorte do DPA 1.7. Duas coisas diferentes com a mesma origem, e é a
   * separação inteira desta funcionalidade. */
  sobre,
}: {
  onFechar: () => void
  sobre?: { pacienteId: number; nome: string }
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()

  /* Começa de onde parou. Ver `conversaAnterior` em `auroraDaNutri`: dura a
     sessão do app e não escreve nada no aparelho. */
  const [falas, setFalas] = useState<Fala[]>(() => {
    /* Conversa nova quando o paciente é OUTRO -- ou quando a anterior era geral
       e esta é sobre alguém. Continuar a conversa da Maria dentro da ficha do
       João daria resposta certa sobre a pessoa errada. */
    if (sobre && dequemEAConversa() !== sobre.pacienteId) {
      return [{ ...novaFala('aurora', 'Sobre ' + sobre.nome + '. O que você quer saber?'), local: true }]
    }
    return conversaAnterior()
  })
  const [texto, setTexto] = useState('')
  /* Qual dos dois botões a barra mostra. Derivado do campo, e não um estado
     à parte: dois estados para a mesma coisa divergem, e o sintoma seria a seta
     ficar na tela com o campo já vazio. */
  const temTexto = texto.trim().length > 0
  /* A trava do toque duplo. `useRef` e não estado: ele muda no mesmo instante
     do toque, enquanto `setPensando` só vale na renderização seguinte -- e é
     nessa janela que o segundo toque passava. */
  const emVoo = useRef(false)

  /* O que estava no campo quando ela começou a falar.
   *
   * O ditado do próprio celular manda a frase INTEIRA a cada pedaço, e não o
   * pedaço novo. Juntar cada um ao campo daria "remarca remarca a remarca a
   * consulta"; SUBSTITUIR o campo inteiro apagaria a meia frase que ela tinha
   * digitado antes de resolver falar. O certo é guardar o começo uma vez e
   * mostrar começo + o que está sendo ouvido, trocando só a segunda metade.
   *
   * Nulo fora de um ditado. Voltar a nulo no fim -- e no erro -- é o que
   * impede o próximo ditado de herdar o começo do anterior. */
  const baseDoDitado = useRef<string | null>(null)

  /* ──────────────────── O QUE O DIA PEDE, na frente dos exemplos ────────────────────
   *
   * Os quatro exemplos ensinam o que ela PODE perguntar, e continuam. O que
   * faltava era o que ela PRECISA fazer hoje: pedido de consulta esperando
   * resposta é a única coisa nesta tela com alguém do outro lado, e sem isto
   * ela só descobre abrindo o painel -- ou não descobre.
   *
   * Uma leitura pequena, e SÓ ela: a tela de conversa não vira painel. Se
   * falhar, o chip não aparece e o resto da tela nem fica sabendo (item 11). */
  const [pedidos, setPedidos] = useState(0)
  const [consultasHoje, setConsultasHoje] = useState(0)
  /* As de HOJE que ainda estão como pendente -- "agendada e não confirmada",
     que é outra coisa que pedido (item que já custou uma conversa inteira). */
  const [aConfirmar, setAConfirmar] = useState(0)

  const contar = useCallback(async () => {
    /* As duas juntas: são independentes, e esperar uma para começar a outra
       dobraria a espera de uma tela que abre para uma pergunta rápida. */
    const [p, d] = await Promise.all([pedidosDeConsulta(), consultasDoDia(new Date())])
    if (p.tipo === 'ok') setPedidos(p.consultas.length)
    if (d.tipo === 'ok') {
      /* Canceladas fora da conta: "6 consultas hoje" contando duas desmarcadas
         e um numero que nao bate com o dia dela -- e numero que nao bate faz ela
         parar de acreditar no resto da frase. */
      const valem = d.consultas.filter(c => c.status !== 'cancelada')
      setConsultasHoje(valem.length)
      setAConfirmar(valem.filter(c => c.status === 'pendente').length)
    }
  }, [])

  useEffect(() => {
    void contar()
  }, [contar])

  /* Relê ao voltar do segundo plano -- item 8 do AGENTS. Ela confirma uma
     consulta no computador, volta ao celular, e sem isto o chip continuaria
     oferecendo confirmar o que já está confirmado. E ao contrário do painel,
     aqui não há o que piscar: são dois números que só mudam um rótulo. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', e => {
      if (e === 'active') void contar()
    })
    return () => sub.remove()
  }, [contar])
  const [pensando, setPensando] = useState(false)
  /* Há um ditado em curso? Enquanto houver, a barra NÃO troca o microfone pelo
     botão de enviar -- trocar desmonta o `<Ditado>` e cancela a escuta no meio
     da fala, que era o defeito da primeira palavra. */
  const [ditandoAgora, setDitandoAgora] = useState(false)

  const [alturaDaTela, setAlturaDaTela] = useState(0)
  const respiro = useDesvioDoTeclado(bottom, alturaDaTela || undefined)

  const rolagem = useRef<ScrollView>(null)

  /* Guarda a cada mudança, e não só ao sair: a tela pode ser desmontada pelo
     voltar do aparelho, e um `useEffect` de limpeza roda depois de o estado já
     ter ido embora em alguns caminhos. Gravar sempre custa uma atribuição. */
  useEffect(() => {
    guardarConversa(falas, sobre ? sobre.pacienteId : undefined)
  }, [falas, sobre])

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
    /* O `ref` também aqui, e não só no confirmar. `pensando` só vale na
       renderização seguinte, e o campo só esvazia nela: dois toques rápidos na
       seta -- ou num chip -- liam o mesmo texto no mesmo instante e mandavam a
       pergunta duas vezes. Achado na segunda rodada de testes, lendo a trava do
       confirmar e perguntando por que o mandar não tinha a mesma. */
    if (!limpa || pensando || emVoo.current) return

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
      setFalas(atual => [
        ...atual,
        novaFala('nutri', limpa),
        /* LOCAL: este texto é nosso, e mandá-lo de volta ao modelo na pergunta
           seguinte gastaria contexto para ensinar a ele o que ele já sabe. */
        { ...novaFala('aurora', RESPOSTA_DO_MENU), local: true },
      ])
      setTexto('')
      return
    }

    /* A pergunta entra na lista ANTES da resposta, e o campo esvazia junto: sem
       isso ela fica olhando o próprio texto parado no campo sem saber se foi. */
    const minha = novaFala('nutri', limpa)
    const anteriores = falas
    setFalas(atual => [...atual, minha])
    setTexto('')
    emVoo.current = true
    setPensando(true)

    /* Na tela ela lê o que escreveu; o servidor recebe de quem se trata, por
       número. Sem isto a Aurora teria de adivinhar o paciente a cada pergunta
       -- ou pedir o nome, dentro da ficha da pessoa. */
    const r = await perguntarAAurora(
      sobre ? 'Sobre o paciente #' + sobre.pacienteId + ': ' + limpa : limpa,
      anteriores,
    )
    emVoo.current = false
    setPensando(false)

    if (r.tipo === 'confirmar') {
      setFalas(atual => [
        ...atual,
        /* O texto vem antes do cartão quando existe: é ali que a Aurora
           pergunta "confirma para quinta?". */
        ...(r.texto ? [novaFala('aurora', r.texto)] : []),
        /* Um cartao por acao. Ela pediu duas coisas na mesma fala, entao le e
            confirma as duas -- e nenhuma delas grava nada antes disso. */
        ...r.acoes.map(a => ({ ...novaFala('aurora', a.resumo), acao: a })),
      ])
      return
    }

    /* A falha vira uma fala da Aurora, e não uma faixa de erro no alto.
       Numa conversa, erro fora do fluxo se perde: ela rola para ler a resposta
       e a explicação ficou lá em cima, fora da tela. */
    setFalas(atual => [
      ...atual,
      r.tipo === 'ok'
        ? novaFala('aurora', r.texto)
        /* A falha guarda a pergunta junto: é ela que o "tentar de novo" reenvia.
           Sem isso, sem sinal, a pessoa redigita tudo -- e uma pergunta longa
           ditada no meio do consultório ninguém redigita: desiste. */
        : { ...novaFala('aurora', r.mensagem), falhou: true, pergunta: limpa },
    ])
  }

  async function confirmar(fala: Fala, acao: AcaoPendente): Promise<boolean> {
    /* ──────────────────── O CARTÃO SÓ DIZ "CONFIRMADO" DEPOIS DE SER ────────────────────
     *
     * Antes ele era marcado ANTES da ida à rede, para um toque duplo não mandar
     * duas vezes. O efeito colateral só apareceu quando a APP 2 perguntou o que
     * acontece quando a ação FALHA: o cartão ficava dizendo "Confirmado por
     * você" e o balão logo abaixo dizia que nada tinha sido gravado. Duas
     * frases opostas, uma embaixo da outra, sobre a mesma consulta.
     *
     * E marcar antes nunca foi a trava que se pensava: `setFalas` é assíncrono
     * como `setPensando`, então os dois têm a mesma janela. Quem barra o toque
     * duplo de verdade é um `ref`, que muda no MESMO instante do toque -- e é o
     * que está aqui agora.
     *
     * Vale para o servidor e para o aparelho igual. `criar_aviso` executa no
     * telefone, então a frase de sucesso vem de nós e não do banco; a única
     * coisa que não podia acontecer era o cartão afirmar o que a frase nega. */
    if (pensando || emVoo.current) return false
    emVoo.current = true
    setPensando(true)

    /* `executarAcaoConfirmada`, e não `confirmarAcao` direto.
       Quase toda ferramenta executa no servidor, e uma -- criar aviso -- só o
       aparelho consegue fazer, porque a notificação é agendada pelo sistema
       operacional do telefone. Um ponto único de saída é o que faz a próxima
       ferramenta local não precisar de um `if` novo aqui. */
    const r = await executarAcaoConfirmada(acao)
    emVoo.current = false
    setPensando(false)

    /* Só agora. Na falha o cartão CONTINUA aberto, com os dois botões: ela
       acabou de ler que nada foi gravado, e o gesto seguinte é tentar de novo
       ou desistir -- não há por que tirar dela essa escolha. */
    if (r.tipo === 'ok') {
      setFalas(atual => atual.map(f => (f.id === fala.id ? { ...f, decidida: 'feita' } : f)))
      /* E reconta: ela acabou de confirmar as três consultas de hoje, e o chip
         continuaria oferecendo confirmar as três. Oferta que não some depois de
         atendida é a mesma coisa que uma tela que não percebeu o que a pessoa
         fez. */
      void contar()
    }

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

    return r.tipo === 'ok'
  }

  /* ──────────────────── VÁRIAS DE UMA VEZ ────────────────────
   *
   * "Ela tem que dar dez comandos, tem que mostrar dez autorizações, ou onde
   * autorizar todos." Quando ela pede várias coisas numa fala só, cada uma vira
   * um cartão -- e confirmar dez cartões um por um é o mesmo trabalho que ela
   * queria evitar falando de uma vez.
   *
   * UM DE CADA VEZ, por dentro: são gravações diferentes, e mandar tudo junto
   * esconderia qual falhou. Na primeira que falhar, PARA: o cartão dela fica
   * aberto com o motivo, e os seguintes continuam esperando decisão -- ninguém
   * grava metade de um pedido sem ela saber qual metade. */
  async function confirmarTodos(pendentes: Fala[]) {
    for (const f of pendentes) {
      if (!f.acao) continue
      const deuCerto = await confirmar(f, f.acao)
      if (!deuCerto) return
    }
  }

  function cancelarTodos(pendentes: Fala[]) {
    const ids = new Set(pendentes.map(f => f.id))
    setFalas(atual => atual.map(f => (ids.has(f.id) ? { ...f, decidida: 'cancelada' } : f)))
  }

  function cancelar(fala: Fala) {
    setFalas(atual => atual.map(f => (f.id === fala.id ? { ...f, decidida: 'cancelada' } : f)))
  }

  /* O chip do dia vem PRIMEIRO, e some quando não há pedido nenhum -- um chip
     que diz "0 pedidos" seria uma linha a mais para ler todo dia sem motivo. */
  const sugestoes = [
    ...(pedidos > 0
      ? [pedidos === 1
          ? 'Responder o pedido de consulta que está esperando'
          : 'Responder os ' + pedidos + ' pedidos de consulta']
      : []),
    /* Depois do pedido, e não antes: pedido tem alguém esperando resposta;
       confirmar é arrumação da agenda dela. */
    ...(aConfirmar > 0
      ? [aConfirmar === 1
          ? 'Confirmar a consulta de hoje que está pendente'
          : 'Confirmar as ' + aConfirmar + ' consultas de hoje']
      : []),
    ...PERGUNTAS_DE_EXEMPLO,
  ]

  const oResumo = fraseDeAberturaDaAurora({ consultas: consultasHoje, semConfirmar: aConfirmar, pedidos })

  const vazia = falas.length === 0
  /* Cartão esperando decisão. Enquanto houver um, nada mais é oferecido. */
  const pendentes = falas.filter(f => f.acao && f.decidida === undefined)
  const cartaoAberto = pendentes.length > 0

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
        {/* Recomeçar. Aparece só com conversa na tela -- botão que não faz nada
            ensina que os botões daqui não fazem nada. E não pergunta antes: o
            que se perde é uma conversa, não um dado, e a confirmação para uma
            coisa reversível é atrito em cima de quem já decidiu. */}
        {falas.length > 0 ? (
          <Pressable
            onPress={() => {
              esquecerConversa()
              setFalas([])
              setTexto('')
            }}
            style={styles.botaoVoltar}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Começar uma conversa nova"
          >
            <Ionicons name="create-outline" size={20} color={paleta().inkFraco} />
          </Pressable>
        ) : (
          <View style={styles.botaoVoltar} />
        )}
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
            {/* O que ela responderia se fosse perguntada, dito antes de ser
                perguntada -- e é o que explica os chips logo abaixo. */}
            {oResumo ? <Text style={styles.fraseDeAberturaDaAurora}>{oResumo}</Text> : null}
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
              {sugestoes.map(p => (
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
                {semRestos(f.texto)}
              </Text>
              {f.falhou && f.pergunta ? (
                <Pressable
                  onPress={() => void mandar(f.pergunta!)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Perguntar de novo"
                >
                  <Text style={styles.tentarDeNovo}>Tentar de novo</Text>
                </Pressable>
              ) : null}
            </View>
          ),
        )}

        {/* A barra só existe com DUAS ou mais esperando: com uma, o próprio
            cartão já tem os botões, e uma segunda linha dizendo a mesma coisa
            seria ruído. */}
        {pendentes.length >= 2 && !pensando && (
          <View style={styles.varias}>
            <Text style={styles.textoVarias}>
              {pendentes.length} ações esperando você. Confira cada cartão acima.
            </Text>
            <View style={styles.botoesDoCartao}>
              <Pressable
                onPress={() => cancelarTodos(pendentes)}
                style={({ pressed }) => [styles.cancelar, pressed && styles.pressionado]}
                accessibilityRole="button"
                accessibilityLabel={'Cancelar as ' + pendentes.length + ' ações'}
              >
                <Text style={styles.textoCancelar}>Cancelar todas</Text>
              </Pressable>
              <Pressable
                onPress={() => void confirmarTodos(pendentes)}
                style={({ pressed }) => [styles.confirmar, pressed && styles.pressionado]}
                accessibilityRole="button"
                accessibilityLabel={'Confirmar as ' + pendentes.length + ' ações'}
              >
                <Text style={styles.textoConfirmar}>Confirmar todas</Text>
              </Pressable>
            </View>
          </View>
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
          /* ──────────────────── A FAIXA PRECISA DE ALTURA PRÓPRIA ────────────────────
             Sem `style` própria, esta faixa ficava com o que SOBRASSE da
             coluna -- e o que sobrava, entre a conversa e a barra de escrever,
             era uma tira de uns oito pixels. Na tela apareciam dois retângulos
             cortados pela borda de baixo, sem texto legível, que se leem como
             ação pendente: "uns risquinho embaixo", nas palavras dela.

             `flexShrink: 0` é o que impede a coluna de espremer, e a altura
             fixa é o que faz a faixa ser sempre do mesmo tamanho. */
          style={styles.faixaDeSugestoes}
          contentContainerStyle={styles.tira}
        >
          {sugestoes.map(p => (
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

        {temTexto && !ditandoAgora ? (
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
            aoMudarEscuta={setDitandoAgora}
            compacto
            assunto="nutri"
            onParcial={parcial => {
              setTexto(atual => {
                if (baseDoDitado.current === null) baseDoDitado.current = atual.trim()
                const base = baseDoDitado.current
                return base ? base + ' ' + parcial : parcial
              })
            }}
            onTexto={ouvido => {
              /* Junta ao que já estiver escrito, e não substitui: quem digitou
                 meia frase e resolveu falar o resto perderia a metade
                 digitada.

                 Se houve texto parcial, o começo certo é o que foi guardado
                 ANTES do primeiro pedaço -- o campo agora contém a frase
                 parcial, e juntar a final nele duplicaria a fala. */
              const base = baseDoDitado.current
              baseDoDitado.current = null
              setTexto(antes => {
                const inicio = base !== null ? base : antes.trim()
                return inicio ? inicio + ' ' + ouvido : ouvido
              })
            }}
            /* A falha da transcrição entra como fala da Aurora, e não como
               faixa no alto -- a mesma decisão que o resto desta tela já tomou:
               numa conversa, erro fora do fluxo fica acima da rolagem e ninguém
               lê. */
            onErro={mensagem => {
              /* O que foi ouvido até a falha fica no campo -- é dela, e ela pode
                 terminar à mão --, mas o começo guardado sai, senão o próximo
                 ditado recomeçaria em cima dele. */
              baseDoDitado.current = null
              setFalas(atual => [...atual, novaFala('aurora', mensagem)])
            }}
          />
        )}
      </View>
    </View>
  )
}

/* A altura do chip de sugestao, num lugar so.
   Ela aparece em dois estilos -- o chip e a faixa que o carrega -- e os dois
   precisam concordar: faixa menor que o chip corta o chip, e foi assim que
   apareceram os retangulos cortados na borda de baixo. */
const ALTURA_DA_SUGESTAO = 36

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
    /* Em negrito e no acento: é a única linha da abertura que muda todo dia, e
       precisa se distinguir do texto explicativo, que é sempre o mesmo. */
    fraseDeAberturaDaAurora: { fontSize: 14.5, fontWeight: '700', color: t.cores.verde, marginTop: 2 },
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
    tentarDeNovo: {
      fontSize: 13,
      fontWeight: '700',
      color: t.cores.verde,
      marginTop: 8,
    },
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
    varias: {
      gap: 10,
      padding: 14,
      borderRadius: 16,
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.gold,
    },
    textoVarias: { fontFamily: FONTE.meia, fontSize: 13.5, color: t.cores.ink, lineHeight: 19 },
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
    faixaDeSugestoes: { flexGrow: 0, flexShrink: 0, height: ALTURA_DA_SUGESTAO + 8 },
    tira: { gap: 8, paddingHorizontal: 12, alignItems: 'center' },
    /* Altura FIXA, e não derivada do texto: dois chips lado a lado com alturas
       diferentes leem-se como dois tipos de coisa. */
    sugestao: {
      height: ALTURA_DA_SUGESTAO,
      justifyContent: 'center',
      backgroundColor: t.cores.cartao,
      borderRadius: 16,
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
