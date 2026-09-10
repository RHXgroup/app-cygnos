import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  BackHandler,
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
import { FichaDoPacienteScreen } from './PacientesDaNutriScreen'
import { PainelDaConsulta } from './AgendaDaNutriScreen'
import {
  consultasDoDia,
  consultasNoPeriodo,
  pedidosDeConsulta,
  responderPedido,
} from '../lib/agendaDaNutri'
import { quemPedeAtencao } from '../lib/atencaoDaNutri'
import { dinheiroDoDia, reais, type DinheiroDoDia } from '../lib/financeiroDoDia'
import {
  motivoDe,
  porUrgencia,
  resumoDaAtencao,
  type Sinalizado,
} from '../lib/sinaisDaCarteira'
import {
  dividirODia,
  emQuanto,
  hhmm,
  resumoDaAgenda,
  type ConsultaDoDia,
  type Dia,
} from '../lib/diaDaNutri'
import { FONTE } from '../lib/fontes'
import { carregarPerfilDaNutri, primeiroNome, type PerfilDaNutri } from '../lib/souNutri'
import { saudacaoDaHora } from '../lib/formatar'
import { RAIO_CARTAO, estilosDe, paleta } from '../lib/tema'

/* O painel do dia da nutricionista — a primeira tela dela no app.
 *
 * ── Por que esta tela, e não o painel do sistema inteiro ──────────────────
 * O painel do site já calcula agenda de hoje, recebido, vencendo,
 * aniversariantes, pendências. Tudo isso é "como está o meu dia", que é a
 * pergunta de quem está com o celular na mão entre uma consulta e outra.
 *
 * Aqui entra só a agenda, e de propósito: é a parte que ela consulta várias
 * vezes por dia e a única que não depende de nada que ainda não exista. O
 * resto entra quando entrar, e cada pedaço vale sozinho.
 *
 * ── A ordem é a do dia dela, e não a do menu ──────────────────────────────
 * Quem está comigo agora, quem vem depois, o que já passou. Uma lista de
 * horários responderia as três de uma vez e nenhuma de imediato — e a primeira
 * é a única que se responde de relance, que é como esta tela vai ser olhada.
 *
 * ── E não há nada aqui que grave ──────────────────────────────────────────
 * Só a agenda é leitura pura. O único gesto que grava é o leitor de
 * código de barras, e ele grava na base DELA, com confirmação. Agendar, remarcar e a Aurora vêm depois, e
 * vêm com confirmação — o comando de voz do treino já concluiu um treino
 * sozinho duas vezes, e o custo de um engano numa agenda é uma paciente
 * aparecendo no dia errado. */

/* Um minuto. É o suficiente para "agora" virar "já passou" sem ninguém tocar em
   nada, e barato o bastante para rodar numa tela aberta em cima da mesa — a
   conta é local, sem ida à rede. */
const PULSO_MS = 60_000

function useAgora(): number {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), PULSO_MS)
    return () => clearInterval(id)
  }, [])
  return agora
}

export function PainelDaNutriScreen({
  onSair,
  onLerCodigo,
}: {
  onSair: () => void
  /* Quem abre a agenda e o leitor é a área que hospeda as abas, e não esta
     tela. Sem isso, o painel teria o próprio estado de "leitor aberto" e a
     barra de abas continuaria embaixo dele -- duas saídas para a mesma coisa,
     e um `BackHandler` disputando com o de cima. */
  onLerCodigo: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const agora = useAgora()

  const [perfil, setPerfil] = useState<PerfilDaNutri | null>(null)
  const [consultas, setConsultas] = useState<ConsultaDoDia[]>([])
  /* Os pedidos esperando resposta, e a agenda de amanhã. As duas coisas que o
     painel não respondia: quem está aguardando ela, e como está o dia seguinte
     -- que é a pergunta de quem olha o telefone à noite. */
  const [pedidos, setPedidos] = useState<ConsultaDoDia[]>([])
  const [amanha, setAmanha] = useState<ConsultaDoDia[]>([])
  const [carregando, setCarregando] = useState(true)
  const [puxando, setPuxando] = useState(false)
  const [erro, setErro] = useState('')
  const [dinheiro, setDinheiro] = useState<DinheiroDoDia | null>(null)
  const [atencao, setAtencao] = useState<Sinalizado[]>([])
  /* Fechado por padrão: a linha é o aviso, e os nomes são o passo seguinte.
     Abrir sozinho faria uma lista de oito empurrar a agenda para fora da tela
     -- e a agenda é o que ela veio ver. */
  const [nomesAbertos, setNomesAbertos] = useState(false)
  /* A ficha abre POR CIMA do painel. Ela lê "14:00 Marina Alves" e quer saber
     quem é a Marina -- é o clique que este painel existe para poupar. */
  const [fichaAberta, setFichaAberta] = useState<number | null>(null)
  /* A consulta em que ela tocou para remarcar ou cancelar, aqui na tela Hoje.
     Antes so dava para agir pela aba Agenda: ela via o proximo paciente na
     frente dela, tocava, e a unica coisa que acontecia era abrir a ficha. */
  const [agindoEm, setAgindoEm] = useState<ConsultaDoDia | null>(null)

  /* ──────────────────── O VOLTAR, que esta tela NUNCA teve ────────────────────
   *
   * Armadilha 1, e eu deixei passar justamente na tela que mais abre coisa por
   * cima: a ficha do paciente e a folha de remarcar. Sem tratador aqui, o botão
   * do aparelho caía no `AreaDaNutri`, que só sabe voltar para a aba inicial ou
   * sair -- e o relato foi exatamente esse: "ele volta tudo, ele fecha o
   * aplicativo".
   *
   * SEM lista de dependências, de propósito. O `AreaDaNutri` registra o dele no
   * PAI, e o React roda os efeitos do FILHO antes dos do pai: na primeira
   * renderização o pai fica por último e ganha. Re-registrar a cada
   * renderização põe este na frente a partir da segunda, que sempre acontece --
   * nem que seja na carga dos dados. Não é código morto, e não é desleixo. */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (agindoEm) {
        setAgindoEm(null)
        return true
      }
      if (fichaAberta !== null) {
        setFichaAberta(null)
        return true
      }
      return false
    })
    return () => sub.remove()
  })
  /* Qual pedido está sendo respondido agora, e o que o banco disse do último.
     Um id, e não um booleano: com dois pedidos na tela, um booleano faria os
     dois cartões piscarem quando ela toca em um. */
  const [respondendo, setRespondendo] = useState<number | null>(null)
  const [respostaDoBanco, setRespostaDoBanco] = useState('')

  const buscar = useCallback(async () => {
    /* As três juntas: são consultas independentes, e esperar uma para começar a
       outra triplicaria a espera de uma tela que ela abre várias vezes por dia.

       E só a AGENDA vira erro na tela. As outras duas são complemento: um
       consultório sem permissão de financeiro não pode ver a agenda escondida
       atrás de um recado sobre dinheiro que ela nem deveria ver. */
    const depoisDeAmanha = new Date()
    depoisDeAmanha.setDate(depoisDeAmanha.getDate() + 1)

    const [r, caixa, sinais, aguardando, oDiaSeguinte] = await Promise.all([
      consultasDoDia(new Date()),
      dinheiroDoDia(),
      quemPedeAtencao(),
      pedidosDeConsulta(),
      consultasNoPeriodo(depoisDeAmanha, depoisDeAmanha),
    ])

    setDinheiro(caixa)
    setAtencao(sinais.tipo === 'ok' ? sinais.pessoas : [])
    setPedidos(aguardando.tipo === 'ok' ? aguardando.consultas : [])
    /* Só o que CONTA como compromisso: pedido de amanhã já aparece no cartão de
       pedidos, e contá-lo aqui também faria o mesmo pedido virar dois avisos. */
    setAmanha(
      oDiaSeguinte.tipo === 'ok'
        ? oDiaSeguinte.consultas.filter(c => c.status !== 'cancelada' && c.status !== 'solicitada')
        : [],
    )
    /* O erro é limpo no sucesso, e não só escrito na falha: esta tela relê
       sozinha ao voltar do segundo plano, e um erro que fica esconderia a
       agenda atrás de uma mensagem vencida. Armadilha 9. */
    if (r.tipo === 'ok') {
      setErro('')
      setConsultas(r.consultas)
    } else {
      setErro(r.mensagem)
    }
  }, [])

  useEffect(() => {
    let vivo = true
    void carregarPerfilDaNutri().then(p => {
      if (vivo) setPerfil(p)
    })
    void buscar().finally(() => {
      if (vivo) setCarregando(false)
    })
    return () => {
      vivo = false
    }
  }, [buscar])

  /* O que muda do lado do sistema nunca chega sozinho — item 8 do AGENTS.md.
     Ela marca uma consulta no computador e volta ao celular; sem isto, a agenda
     continuaria a de antes até fechar o app. E ninguém fecha app. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', e => {
      if (e === 'active') void buscar()
    })
    return () => sub.remove()
  }, [buscar])

  async function responder(id: number, aceitar: boolean) {
    /* Um por vez: dois toques rapidos em cartões diferentes mandariam duas
       respostas e a segunda leria o estado de antes da primeira. */
    if (respondendo !== null) return
    setRespondendo(id)
    setRespostaDoBanco('')

    const r = await responderPedido(id, aceitar)
    setRespondendo(null)
    setRespostaDoBanco(r.mensagem)

    /* Relê SEMPRE, e não só no sucesso. A recusa por choque não mudou o pedido,
       mas "já foi respondido" mudou -- e nesse caso a lista na tela está velha,
       que é justamente quando reler importa. */
    void buscar()
  }

  const dia: Dia = dividirODia(consultas, agora)

  /* Quem manda no herói: quem está na sala, ou a próxima que vem.
     Nesta ordem, e nunca as duas: com alguém na frente dela, a próxima é
     informação de daqui a uma hora. */
  const destaque = dia.agora ?? dia.aindaHoje[0] ?? null
  /* Vazio quando é noutro dia ou quando já começou -- e a leitura do vazio é
     do JSX, que então mostra só 'AGORA'. */
  const contagem = destaque && !dia.agora ? emQuanto(destaque.quando, agora) : ''

  /* ──── O DIA INTEIRO, numa linha do tempo só ────
     Antes eram dois blocos com rótulo em maiúscula, 'DEPOIS' e 'JÁ PASSARAM',
     e o que passou ficava DEPOIS do que vem -- fora de ordem no eixo que a
     tela inteira usa, que é o relógio. Numa linha única em ordem de hora,
     nenhum rótulo precisa existir: o que passou está em cima porque passou.

     O herói sai da lista para não aparecer duas vezes na mesma tela. */
  const linhaDoDia = [...dia.jaForam, ...dia.aindaHoje]
    .filter(c => c.id !== destaque?.id)
    .sort((a, b) => Date.parse(a.quando) - Date.parse(b.quando))
  const passou = (c: ConsultaDoDia) => dia.jaForam.some(j => j.id === c.id)

  if (fichaAberta !== null) {
    return <FichaDoPacienteScreen id={fichaAberta} onFechar={() => setFichaAberta(null)} />
  }

  const folhaDaConsulta = agindoEm ? (
    <PainelDaConsulta
      consulta={agindoEm}
      onFechar={() => setAgindoEm(null)}
      onMudou={() => {
        setAgindoEm(null)
        void buscar()
      }}
    />
  ) : null

  if (carregando) {
    return (
      <View style={[styles.tela, styles.centro]}>
        <ActivityIndicator color={paleta().cores.verde} />
      </View>
    )
  }

  return (
    <View style={[styles.tela, { paddingTop: top + 8 }]}>
      <ScrollView
        /* A barra de abas já ocupa o rodapé da área; aqui basta o respiro. */
        contentContainerStyle={[styles.conteudo, { paddingBottom: 20 }]}
        showsVerticalScrollIndicator={false}
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
        <View style={styles.topo}>
          <View style={styles.textosTopo}>
            {/* A data em cima e pequena, a saudação grande embaixo.
                Invertido em relação ao que era, e de propósito: a saudação é o
                que dá nome à tela, e uma tela sem título grande não tem início
                -- o olho entra por qualquer lugar. A data é contexto, e
                contexto vem antes e menor. */}
            <Text style={styles.dataDeHoje}>{porExtensoCurto(new Date(agora))}</Text>
            <Text style={styles.saudacao}>
              {saudacaoDaHora(new Date(agora).getHours())}
              {perfil ? `, ${primeiroNome(perfil.nome)}` : ''}
            </Text>
            <Text style={styles.resumo}>{resumoDaAgenda(dia)}</Text>
          </View>
          <Pressable
            onPress={onSair}
            style={styles.botaoSair}
            accessibilityRole="button"
            accessibilityLabel="Sair da conta"
          >
            <Ionicons name="log-out-outline" size={20} color={paleta().inkFraco} />
          </Pressable>
        </View>

        {/* O erro fica ACIMA do conteúdo, e não no fim: quem não vê a agenda
            que esperava precisa saber por quê antes de rolar atrás dela. */}
        {!!erro && <Text style={styles.erro}>{erro}</Text>}

        {/* ── QUEM ESTÁ COM ELA AGORA ──────────────────────────────────
            O único cartão grande da tela. Se tudo tivesse o mesmo peso, a
            resposta que ela procura de relance estaria no meio de uma lista. */}
        {/* ──────────────────── O HERÓI DA TELA ────────────────────
            UMA coisa manda, e o resto é apoio. Antes o cartão grande aparecia
            só quando alguém estava na sala -- e o resto do dia a tela abria sem
            nenhum ponto de entrada, seis linhas do mesmo tamanho.

            Agora ele mostra quem está com ela OU quem é a próxima, e a
            diferença entre as duas é dita pela contagem: 'agora' quando
            começou, 'em 18 min' quando falta. É a pergunta que ela faz de
            relance, e a resposta não pode estar no meio de uma lista. */}
        {!!destaque && (
          <Pressable
            onPress={() => destaque.pacienteId && setFichaAberta(destaque.pacienteId)}
            disabled={!destaque.pacienteId}
            style={({ pressed }) => [styles.heroi, pressed && styles.heroiPressionado]}
            accessibilityRole={destaque.pacienteId ? 'button' : 'text'}
            accessibilityLabel={
              (dia.agora ? 'Agora: ' : 'Próxima: ') + destaque.nome + ', ' +
              hhmm(destaque.quando) +
              (destaque.pacienteId ? '. Toque para abrir a ficha.' : '')
            }
          >
            {/* O círculo de acento cortado pelo canto. É o único enfeite da
                tela, e existe para o cartão não ser um retângulo escuro liso --
                mas fica ATRÁS de tudo e não carrega informação nenhuma. */}
            <View pointerEvents="none" style={styles.brilhoDoHeroi} />

            <View style={styles.rotuloDoHeroi}>
              <View style={styles.pulso} />
              <Text style={styles.textoRotuloHeroi}>
                {dia.agora ? 'AGORA' : 'PRÓXIMA'}
                {contagem ? '  ·  ' + contagem.toUpperCase() : ''}
              </Text>
            </View>

            <View style={styles.linhaDoHeroi}>
              <View style={styles.iniciais}>
                <Text style={styles.textoIniciais}>{iniciaisDe(destaque.nome)}</Text>
              </View>
              <View style={styles.textosDoHeroi}>
                <Text style={styles.nomeDoHeroi} numberOfLines={1}>
                  {destaque.nome}
                </Text>
                {!!destaque.duracao && (
                  <Text style={styles.metaDoHeroi}>{destaque.duracao} minutos</Text>
                )}
              </View>
              <Text style={styles.horaDoHeroi}>{hhmm(destaque.quando)}</Text>
            </View>

            {/* Remarcar e cancelar DAQUI, e nao so pela aba Agenda.
                Era a reclamacao mais concreta que ele fez sobre esta tela: o
                cartao mostra a proxima consulta em letra grande e nao deixava
                fazer nada com ela. Botoes dentro do heroi, e o toque no resto
                do cartao continua abrindo a ficha. */}
            {destaque.status !== 'cancelada' && destaque.status !== 'realizada' && (
              <View style={styles.acoesDoHeroi}>
                <Pressable
                  onPress={() => setAgindoEm(destaque)}
                  style={({ pressed }) => [styles.botaoDoHeroi, pressed && styles.pressionada]}
                  accessibilityRole="button"
                  accessibilityLabel={'Remarcar ou cancelar a consulta de ' + destaque.nome}
                >
                  <Ionicons name="swap-horizontal" size={15} color={paleta().cores.mist} />
                  <Text style={styles.textoBotaoDoHeroi}>Remarcar ou cancelar</Text>
                </Pressable>
              </View>
            )}
          </Pressable>
        )}

        {/* ──────────────────── QUEM ESTÁ ESPERANDO RESPOSTA ────────────────────
            A única coisa deste painel com uma PESSOA do outro lado aguardando --
            e a que não aparecia em lugar nenhum do aplicativo. `solicitada` é
            excluída da agenda de propósito (pedido não é compromisso), e
            excluída dali ela sumia inteira.

            Vem depois do AGORA e antes do resto: quem está na sala ganha da
            fila, mas a fila ganha do que já está resolvido. */}
        {pedidos.length > 0 && (
          <View style={styles.pedidos}>
            <View style={styles.topoDosPedidos}>
              <Ionicons name="hand-left-outline" size={16} color={paleta().cores.gold} />
              <Text style={styles.rotuloPedidos}>Esperando sua resposta</Text>
              <Text style={styles.contagemDePedidos}>{pedidos.length}</Text>
            </View>

            {pedidos.slice(0, 4).map(c => (
              <View key={c.id} style={styles.umPedido}>
                <Linha consulta={c} comDia onAbrir={setFichaAberta} />
                <View style={styles.botoesDoPedido}>
                  {/* Recusar é o largo e Aceitar o estreito, como no cartão da
                      Aurora: o gesto sem atenção toca no maior, e o maior tem de
                      ser o que NÃO compromete a agenda dela.

                      E aceitar aqui grava de uma vez, sem segundo cartão: o
                      horário e o nome estão na linha logo acima, lidos por ela.
                      Um cartão repetindo o que está um dedo acima ensina a
                      confirmar sem ler. */}
                  <Pressable
                    onPress={() => void responder(c.id, false)}
                    disabled={respondendo !== null}
                    style={({ pressed }) => [
                      styles.recusar,
                      respondendo !== null && styles.desligado,
                      pressed && styles.pressionada,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={'Recusar o pedido de ' + c.nome}
                  >
                    <Text style={styles.textoRecusar}>Recusar</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => void responder(c.id, true)}
                    disabled={respondendo !== null}
                    style={({ pressed }) => [
                      styles.aceitar,
                      respondendo !== null && styles.desligado,
                      pressed && styles.pressionada,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={'Aceitar o pedido de ' + c.nome}
                  >
                    {respondendo === c.id ? (
                      <ActivityIndicator color={paleta().cores.branco} size="small" />
                    ) : (
                      <Text style={styles.textoAceitar}>Aceitar</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ))}
            {pedidos.length > 4 && (
              <Text style={styles.maisPedidos}>e mais {pedidos.length - 4}</Text>
            )}

            {/* A frase que o BANCO escreveu, e não um "pronto" montado aqui: a
                recusa por choque precisa chegar com o nome de quem já está
                naquele horário, e quem sabe isso é quem consultou. */}
            {!!respostaDoBanco && <Text style={styles.respostaDoBanco}>{respostaDoBanco}</Text>}

            <Text style={styles.ondeResponder}>
              Aceitar confirma a consulta no horário pedido. Remarcar continua no
              sistema, no computador.
            </Text>
          </View>
        )}

        {linhaDoDia.length > 0 && (
          <View>
            <Text style={styles.rotuloDeSecao}>O resto do dia</Text>
            <View>
              {linhaDoDia.map((c, i) => (
                <NoTempo
                  key={c.id}
                  consulta={c}
                  passada={passou(c)}
                  primeira={i === 0}
                  ultima={i === linhaDoDia.length - 1}
                  onAbrir={setFichaAberta}
                />
              ))}
            </View>
          </View>
        )}

        {/* ──────────────────── AMANHÃ, NUMA LINHA ────────────────────
            Ela olha o painel à noite, quando o dia já acabou -- e até agora a
            tela respondia só a pergunta da manhã. Uma linha, e não um bloco: a
            agenda de amanhã inteira está a um toque na aba Agenda, e repetir
            aqui faria a tela do DIA falar de outro dia. */}
        {amanha.length > 0 && (
          <Text style={styles.amanha}>
            Amanhã: {amanha.length === 1 ? '1 consulta' : amanha.length + ' consultas'}
            {amanha[0] ? ', a primeira às ' + hhmm(amanha[0].quando) : ''}
          </Text>
        )}

        {/* Dia sem consulta NÃO é dia livre: ela pode ter mil coisas que o app
            não enxerga. A frase diz o que o app sabe, e nada além. */}
        {/* ──────────────────── O DINHEIRO DO DIA ────────────────────
            Só aparece quando HÁ movimento, e isso é decisão e não esquecimento.
            A política de `contas_receber_baixas` exige a permissão de baixar:
            quem não a tem recebe ZERO LINHA, sem erro nenhum -- idêntico a "não
            entrou nada hoje". Escrever "R$ 0" nos dois casos seria o app
            afirmando um número que ele não sabe, para quem decide dinheiro com
            ele. Item 6: zero é mentira. */}
        {/* ──────────────────── E O A PAGAR, QUE ERA LIDO E JOGADO FORA ────────────────────
            `dinheiroDoDia` já buscava `aPagar` e `quantasAPagar`, com um
            comentário explicando por que aquilo importa -- "é a pergunta que ela
            faz de manhã, e não saber custa juro". Só que nenhuma tela lia os dois
            campos: a consulta ia ao banco todo dia e a resposta era descartada.

            É o mesmo formato dos três achados que fizeram nascer o `npm run
            orfaos`: o objeto existe, e o caminho não passa por ele. Nada falha,
            nada avisa, e ninguém descobre olhando a tela -- só olhando os dois
            lados juntos. */}
        {/* ──────────────────── O DINHEIRO DE HOJE ────────────────────
            As TRÊS linhas, sempre, e zero escrito como zero.

            Isto já teve duas versões erradas, e as duas por conta minha. A
            primeira escondia o bloco quando não havia movimento; a segunda
            trocava os números por uma frase. As duas vinham do mesmo raciocínio:
            a política de baixas exige permissão, quem não a tem recebe ZERO
            LINHA, e isso é indistinguível de "não entrou nada" -- então
            escrever "R$ 0" seria afirmar um número que o app não sabe.

            O raciocínio continua verdadeiro e a decisão era dele, não minha. As
            palavras foram estas: "é pra colocar aqui que você tem pra receber
            ou tem pra pagar. Ponto. Você não tem, coloca zero." Quem lê a tela
            todo dia sabe se tem permissão de financeiro; quem não sabe é o app.

            Fica a ressalva onde ela cabe -- uma linha embaixo, e só quando tudo
            é zero, que é o único caso em que a dúvida existe. */}
        {!!dinheiro && (
          <View>
            <Text style={styles.rotuloDeSecao}>Dinheiro de hoje</Text>
            <View style={styles.caixaDoDia}>
              <View style={styles.verba}>
                <Text style={styles.rotuloVerba}>Recebido</Text>
                <Text style={[styles.valorVerba, styles.valorRecebido]}>
                  {reais(dinheiro.recebido)}
                </Text>
              </View>
              <View style={styles.verba}>
                <Text style={styles.rotuloVerba}>A receber</Text>
                <Text style={[styles.valorVerba, styles.valorVencendo]}>
                  {reais(dinheiro.vencendo)}
                </Text>
              </View>
              <View style={styles.verba}>
                <Text style={styles.rotuloVerba}>A pagar</Text>
                <Text style={[styles.valorVerba, styles.valorAPagar]}>
                  {reais(dinheiro.aPagar)}
                </Text>
              </View>
            </View>
            {dinheiro.quantasBaixas === 0 &&
              dinheiro.quantasVencendo === 0 &&
              dinheiro.quantasAPagar === 0 && (
              <Text style={styles.ressalvaDoDinheiro}>
                Nada lançado hoje. Se a sua conta não vê o financeiro, aparece
                zero do mesmo jeito.
              </Text>
            )}
          </View>
        )}

        {/* ──────────────────── QUEM PEDE ATENÇÃO ────────────────────
            Uma LINHA, e não o painel da Carteira. O site tem a leitura inteira,
            com cinco colunas e análise por IA; repetir aquilo aqui daria uma
            tela bonita e ignorada. Uma frase que aparece SÓ quando há alguém é
            lida todo dia. */}
        {atencao.length > 0 && (
          <View style={styles.blocoAtencao}>
            <Pressable
              onPress={() => setNomesAbertos(v => !v)}
              style={({ pressed }) => [styles.linhaAtencao, pressed && styles.pressionada]}
              accessibilityRole="button"
              accessibilityState={{ expanded: nomesAbertos }}
              accessibilityLabel={`${resumoDaAtencao(atencao).frase}. Toque para ver os nomes.`}
            >
              <View style={styles.textosAtencao}>
                <Text style={styles.fraseAtencao}>{resumoDaAtencao(atencao).frase}</Text>
                <Text style={styles.quebraAtencao}>{resumoDaAtencao(atencao).porSinal}</Text>
              </View>
              <Ionicons
                name={nomesAbertos ? 'chevron-up' : 'chevron-down'}
                size={17}
                color={paleta().inkFraco}
              />
            </Pressable>

            {nomesAbertos &&
              porUrgencia(atencao).map(pessoa => (
                <View key={pessoa.id} style={styles.pessoaAtencao}>
                  <Text style={styles.nomeAtencao} numberOfLines={1}>
                    {pessoa.nome}
                  </Text>
                  <Text style={styles.motivoAtencao} numberOfLines={1}>
                    {motivoDe(pessoa)}
                  </Text>
                </View>
              ))}
          </View>
        )}

        {dia.total === 0 && !erro && (
          <View style={styles.vazio}>
            <Ionicons name="calendar-outline" size={22} color={paleta().inkFraco} />
            <Text style={styles.textoVazio}>Nada marcado para hoje na sua agenda.</Text>
          </View>
        )}

        {/* ──────────────────── O QUE ELA FAZ COM O CELULAR NA MÃO ────────────────────
            Separado da agenda de propósito: a agenda é o dia dela, isto é
            ferramenta.

            "Ver a agenda inteira" SAIU daqui. Era um botão que ia para a aba
            Agenda -- que está na barra de baixo, sempre visível, a um toque.
            Duas portas para a mesma sala não dão mais acesso: dão a impressão
            de que uma delas leva a outro lugar, e quem toca descobre que não.
            Apontado pelo Helton, e ele estava certo. */}
        <Pressable
          onPress={onLerCodigo}
          style={({ pressed }) => [styles.ferramenta, pressed && styles.pressionada]}
          accessibilityRole="button"
          accessibilityLabel="Ler código de barras de um produto"
        >
          <Ionicons name="barcode-outline" size={22} color={paleta().cores.verde} />
          <View style={styles.textosFerramenta}>
            <Text style={styles.tituloFerramenta}>Ler código de barras</Text>
            <Text style={styles.textoFerramenta}>
              Guardar um produto na sua base de alimentos
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={paleta().inkFraco} />
        </Pressable>

        {/* Dito por escrito porque a ausência do resto é uma DECISÃO, e não uma
            tela pela metade. Sem isto, a primeira impressão é de app inacabado. */}
        <Text style={styles.rodape}>
          Isto é o seu dia. A agenda inteira, os pacientes e o financeiro estão
          nas abas · e o que não tem tela, a Aurora faz.
        </Text>
      </ScrollView>

      {folhaDaConsulta}
    </View>
  )
}

/* ──────────────────── UM PONTO NA LINHA DO TEMPO ────────────────────
 *
 * Três colunas: hora, trilho, cartão. A do meio é desenho puro -- um fio
 * vertical e um ponto -- e é ela que faz seis consultas se lerem como UM dia
 * em vez de seis linhas parecidas.
 *
 * ──── O que passou perde o cartão ────
 * Não só apaga: perde o fundo e a borda. Cartão é o que diz "isto é um
 * objeto que ainda te pede alguma coisa", e uma consulta atendida não pede
 * nada. Deixar os seis com a mesma caixa e mudar só a opacidade é pedir para
 * o olho medir cinza -- e ele não mede.
 *
 * ──── O fio para nas pontas ────
 * Na primeira linha ele começa NO ponto, e na última acaba nele. Um fio que
 * sai da primeira hora para cima aponta para um passado que a tela não mostra,
 * e para baixo da última promete uma consulta que não existe. */
function NoTempo({
  consulta,
  passada,
  primeira,
  ultima,
  onAbrir,
}: {
  consulta: ConsultaDoDia
  passada: boolean
  primeira: boolean
  ultima: boolean
  onAbrir: (id: number) => void
}) {
  const styles = estilos()
  const cancelada = consulta.status === 'cancelada'
  const temFicha = !!consulta.pacienteId

  return (
    <View style={styles.noTempo}>
      <Text style={[styles.horaDoTempo, passada && styles.apagado]}>
        {hhmm(consulta.quando)}
      </Text>

      <View style={styles.trilho}>
        {/* Dois pedaços de fio, e não um só com a ponta escondida: assim a
            primeira e a última param no ponto sem ninguém calcular altura. */}
        {!primeira && <View style={styles.fioDeCima} />}
        {!ultima && <View style={styles.fioDeBaixo} />}
        <View
          style={[
            styles.pontoDoTempo,
            passada && styles.pontoPassado,
            cancelada && styles.pontoCancelado,
          ]}
        />
      </View>

      <Pressable
        onPress={() => consulta.pacienteId && onAbrir(consulta.pacienteId)}
        disabled={!temFicha}
        style={({ pressed }) => [
          styles.cartaoDoTempo,
          passada && styles.cartaoPassado,
          pressed && styles.pressionada,
        ]}
        accessibilityRole={temFicha ? 'button' : 'text'}
        accessibilityLabel={
          hhmm(consulta.quando) + ', ' + consulta.nome +
          (cancelada ? ', cancelada' : passada ? ', já atendida' : '') +
          (temFicha ? '. Toque para abrir a ficha.' : '')
        }
      >
        <Text
          style={[
            styles.nomeDoTempo,
            passada && styles.apagado,
            cancelada && styles.riscado,
          ]}
          numberOfLines={1}
        >
          {consulta.nome}
        </Text>
        {!!consulta.tipo && !cancelada && (
          <Text style={styles.tipoDoTempo} numberOfLines={1}>
            {consulta.tipo === 'primeira_consulta' ? '1º consulta' : 'retorno'}
          </Text>
        )}
        {cancelada && <Text style={styles.tipoDoTempo}>cancelada</Text>}
      </Pressable>
    </View>
  )
}

/* "MA" de Maria Alves. O primeiro e o ÚLTIMO nome, e não as duas primeiras
   letras: "MA" de "Maria" não distingue Maria Alves de Maria Andrade, e numa
   agenda cheia de Marias o círculo deixaria de servir para qualquer coisa. */
function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  const primeira = partes[0]?.[0] ?? ''
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : ''
  return (primeira + ultima).toUpperCase()
}

/* "Quarta, 9 de setembro". Sem o ano: a tela fala do dia de hoje, e o ano ali
   seria o app conferindo o calendário na cara de quem já sabe em que ano está. */
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]
function porExtensoCurto(dia: Date): string {
  if (Number.isNaN(dia.getTime())) return ''
  return `${DIAS[dia.getDay()]}, ${dia.getDate()} de ${MESES[dia.getMonth()]}`
}

function Linha({
  consulta,
  apagada = false,
  comDia = false,
  onAbrir,
}: {
  consulta: ConsultaDoDia
  apagada?: boolean
  /* O pedido pode ser para outro dia, e "14:00" sozinho faria ela achar que é
     hoje. Na agenda do dia o dia é o título, e repeti-lo em cada linha seria
     ruído. */
  comDia?: boolean
  onAbrir?: (id: number) => void
}) {
  const styles = estilos()
  return (
    <Pressable
      onPress={() => consulta.pacienteId && onAbrir?.(consulta.pacienteId)}
      disabled={!consulta.pacienteId || !onAbrir}
      style={({ pressed }) => [styles.linha, pressed && styles.pressionada]}
      accessibilityRole={consulta.pacienteId && onAbrir ? 'button' : 'text'}
      accessibilityLabel={
        hhmm(consulta.quando) + ', ' + consulta.nome +
        (consulta.pacienteId && onAbrir ? '. Toque para abrir a ficha.' : '')
      }
    >
      <Text style={[styles.hora, apagada && styles.apagado, comDia && styles.horaLarga]}>
        {comDia ? diaCurto(consulta.quando) + ' ' + hhmm(consulta.quando) : hhmm(consulta.quando)}
      </Text>
      <Text style={[styles.nome, apagada && styles.apagado]} numberOfLines={1}>
        {consulta.nome}
      </Text>
      {/* A marca de realizada é um traço, e não um "✓ concluída": numa lista de
          seis, texto repetido em cada linha vira ruído e o olho para de ler. */}
      {consulta.status === 'realizada' && (
        <Ionicons name="checkmark" size={15} color={paleta().inkFraco} />
      )}
      {!!consulta.pacienteId && (
        <Ionicons name="chevron-forward" size={14} color={paleta().inkFraco} />
      )}
    </Pressable>
  )
}

/* "10/09". Sem o ano: um pedido é sempre para os próximos dias, e o ano ali só
   ocuparia a largura que o nome precisa. */
function diaCurto(iso: string): string {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return ''
  return String(dt.getDate()).padStart(2, '0') + '/' + String(dt.getMonth() + 1).padStart(2, '0')
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.cores.fundo },
    centro: { alignItems: 'center', justifyContent: 'center' },
    conteudo: { paddingHorizontal: 16, gap: 12 },

    topo: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingBottom: 4 },
    textosTopo: { flex: 1 },
    dataDeHoje: { fontFamily: FONTE.media, fontSize: 13, color: t.inkFraco },
    /* 29 e não 22, e `bruta` e não `fontWeight: '800'`.
       O peso vira FAMÍLIA quando a fonte é carregada: `fontWeight` sobre uma
       família com nome próprio não engrossa nada no Android, e desenha o
       regular sem erro nenhum. Ver `lib/fontes.ts`. */
    saudacao: {
      fontFamily: FONTE.bruta,
      fontSize: 29,
      color: t.cores.ink,
      letterSpacing: -1,
      lineHeight: 32,
      marginTop: 1,
    },
    resumo: { fontFamily: FONTE.normal, fontSize: 13.5, color: t.inkSuave, marginTop: 4 },

    /* O rótulo de seção deixa de ser MAIÚSCULA ESPAÇADA em toda a tela.
       Sobrou UM, e é por isso que ele ainda funciona: quando tudo é rótulo,
       rótulo nenhum separa coisa nenhuma. */
    rotuloDeSecao: {
      fontFamily: FONTE.meia,
      fontSize: 12.5,
      color: t.inkFraco,
      marginBottom: 8,
    },
    botaoSair: { padding: 8, marginTop: -4, marginRight: -8 },

    erro: { fontSize: 13.5, color: t.cores.ink, backgroundColor: t.cores.verdeMenta, padding: 12, borderRadius: 10 },

    /* ──────────────────── O HERÓI ────────────────────
       Escuro, e não verde. O verde preenchido era a cor da AÇÃO -- a mesma do
       botão Aceitar logo abaixo -- e um cartão inteiro dela dizia "toque aqui"
       sobre uma coisa que é informação. Musgo escuro tira o cartão do fluxo
       das cores de ação e devolve o verde para quem tem o que executar. */
    heroi: {
      backgroundColor: t.cores.forest,
      borderRadius: 20,
      padding: 17,
      paddingBottom: 15,
      gap: 13,
      overflow: 'hidden',
    },
    heroiPressionado: { opacity: 0.92 },
    /* O único enfeite da tela. `pointerEvents="none"` no JSX porque um círculo
       decorativo por cima do cartão comeria o toque no canto direito -- e o
       canto direito é onde mora o horário. */
    brilhoDoHeroi: {
      position: 'absolute',
      right: -46,
      top: -46,
      width: 150,
      height: 150,
      borderRadius: 75,
      backgroundColor: t.cores.limao,
      opacity: 0.14,
    },
    rotuloDoHeroi: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    pulso: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: t.cores.limao },
    textoRotuloHeroi: {
      fontFamily: FONTE.forte,
      fontSize: 11,
      letterSpacing: 1.1,
      color: t.cores.limao,
    },
    linhaDoHeroi: { flexDirection: 'row', alignItems: 'center', gap: 13 },
    iniciais: {
      width: 46,
      height: 46,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(244,239,228,0.13)',
      borderWidth: 1,
      borderColor: 'rgba(244,239,228,0.16)',
    },
    textoIniciais: { fontFamily: FONTE.forte, fontSize: 15, color: t.cores.mist },
    textosDoHeroi: { flex: 1, minWidth: 0 },
    nomeDoHeroi: {
      fontFamily: FONTE.forte,
      fontSize: 21,
      color: t.cores.mist,
      letterSpacing: -0.5,
    },
    metaDoHeroi: {
      fontFamily: FONTE.normal,
      fontSize: 13,
      color: 'rgba(244,239,228,0.66)',
      marginTop: 1,
    },
    acoesDoHeroi: { flexDirection: 'row' },
    botaoDoHeroi: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      flex: 1,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: 'rgba(244,239,228,0.11)',
      borderWidth: 1,
      borderColor: 'rgba(244,239,228,0.15)',
    },
    textoBotaoDoHeroi: { fontFamily: FONTE.meia, fontSize: 13.5, color: t.cores.mist },
    horaDoHeroi: {
      fontFamily: FONTE.forte,
      fontSize: 20,
      color: t.cores.mist,
      letterSpacing: -0.4,
      fontVariant: ['tabular-nums'],
    },

    /* ──────────────────── A LINHA DO TEMPO ──────────────────── */
    noTempo: { flexDirection: 'row', alignItems: 'stretch' },
    horaDoTempo: {
      width: 44,
      paddingTop: 11,
      fontFamily: FONTE.meia,
      fontSize: 12.5,
      color: t.inkFraco,
      fontVariant: ['tabular-nums'],
    },
    trilho: { width: 20, alignItems: 'center' },
    /* O fio de cima vai do topo até o ponto; o de baixo, do ponto ao fim.
       Separados porque a primeira e a última linha escondem um deles, e um fio
       só exigiria calcular a altura da linha -- que depende do texto. */
    fioDeCima: { position: 'absolute', top: 0, height: 14, width: 1.5, backgroundColor: t.cores.trilho },
    fioDeBaixo: { position: 'absolute', top: 14, bottom: 0, width: 1.5, backgroundColor: t.cores.trilho },
    pontoDoTempo: {
      position: 'absolute',
      top: 9.5,
      width: 9,
      height: 9,
      borderRadius: 4.5,
      backgroundColor: t.cores.verde,
    },
    pontoPassado: { backgroundColor: t.cores.trilho },
    pontoCancelado: { backgroundColor: t.cores.fundo, borderWidth: 1.5, borderColor: t.cores.trilho },
    cartaoDoTempo: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 9,
      marginTop: 3,
      marginBottom: 7,
    },
    /* Sem fundo e sem borda. O que passou deixa de ser um objeto que pede algo,
       e vira texto -- que é o que ele é. */
    cartaoPassado: { backgroundColor: 'transparent', borderColor: 'transparent' },
    nomeDoTempo: { flex: 1, fontFamily: FONTE.meia, fontSize: 14.5, color: t.cores.ink, letterSpacing: -0.2 },
    tipoDoTempo: { fontFamily: FONTE.normal, fontSize: 12, color: t.inkFraco },
    riscado: { textDecorationLine: 'line-through', textDecorationColor: t.cores.trilho },
    linha: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
    /* Largura fixa e dígitos tabulares: sem isso "09:00" e "11:30" desalinham o
       nome ao lado, e uma coluna torta se lê como tela desleixada. */
    hora: {
      fontFamily: FONTE.meia,
      fontSize: 13.5,
      color: t.inkSuave,
      width: 46,
      fontVariant: ['tabular-nums'],
    },
    nome: { flex: 1, fontFamily: FONTE.meia, fontSize: 15, color: t.cores.ink, letterSpacing: -0.2 },
    /* Só cor. O peso vem da família agora, e trocar `fontWeight` aqui não
       afinaria nada -- desenharia o mesmo arquivo, sem erro. */
    apagado: { color: t.inkFraco },

    vazio: {
      alignItems: 'center',
      gap: 8,
      paddingVertical: 34,
      backgroundColor: t.cores.cartao,
      borderRadius: RAIO_CARTAO,
    },
    textoVazio: { fontFamily: FONTE.normal, fontSize: 14, color: t.inkSuave },

    /* Os dois lado a lado, e sem cartão em volta de cada um: são dois números
       de relance, e uma moldura por número faria a tela parecer um relatório. */
    /* Uma caixa POR número, e não os três dentro de uma só.
       Era o contrário, com o argumento de que moldura por número pareceria
       relatório. O argumento estava certo numa tela onde tudo tinha moldura --
       e essa tela deixou de existir: agora a linha do tempo NÃO tem, e o
       resumo do dinheiro passa a ser a única coisa emoldurada da metade de
       baixo. É o que faz três valores se lerem como três respostas. */
    caixaDoDia: { flexDirection: 'row', gap: 9 },
    diaSemMovimento: {
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 13,
    },
    textoSemMovimento: { fontFamily: FONTE.normal, fontSize: 13, color: t.inkSuave, lineHeight: 19 },
    verba: {
      flex: 1,
      gap: 1,
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderRadius: 14,
      paddingVertical: 11,
      paddingHorizontal: 13,
    },
    /* O que SAI não pode ter a cor do que entra, e também não é erro: dívida do
       dia é informação, e vermelho de erro neste app quer dizer "alguma coisa
       quebrou". Fica no tom de aviso, o mesmo do cartão de conferir. */
    /* Deixa de ser MAIÚSCULA ESPAÇADA. Três rótulos gritados lado a lado
       competiam com os próprios números que eles nomeiam. */
    rotuloVerba: { fontFamily: FONTE.normal, fontSize: 11.5, color: t.inkFraco },
    valorVerba: {
      fontFamily: FONTE.forte,
      fontSize: 19,
      color: t.cores.ink,
      letterSpacing: -0.6,
      fontVariant: ['tabular-nums'],
    },
    /* O que vence ainda não entrou. Cor de atenção, e não de erro: não há nada
       errado em uma conta vencer hoje. */
    valorRecebido: { color: t.cores.verde },
    valorVencendo: { color: t.cores.gold },
    ressalvaDoDinheiro: {
      fontFamily: FONTE.normal,
      fontSize: 11.5,
      color: t.inkFraco,
      lineHeight: 16,
      paddingTop: 6,
    },
    valorAPagar: { color: t.inkSuave },

    /* Preenchido em dourado FRACO, e não contornado.
       O contorno existia para não brigar com o cartão do AGORA, que era verde
       cheio. O herói virou musgo escuro, então a briga acabou -- e o dourado
       preenchido separa este cartão de tudo o que é creme na tela, que é
       exatamente o que ele precisa: é a única coisa aqui com uma PESSOA do
       outro lado esperando resposta. */
    pedidos: {
      backgroundColor: t.cores.atencaoFundo,
      borderWidth: 1,
      borderColor: t.cores.gold,
      borderRadius: 18,
      paddingHorizontal: 15,
      paddingVertical: 13,
    },
    topoDosPedidos: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 2 },
    rotuloPedidos: { flex: 1, fontFamily: FONTE.forte, fontSize: 13.5, color: t.cores.ink, letterSpacing: -0.2 },
    /* O número sai do texto e vira pastilha. "3 PEDIDOS ESPERANDO RESPOSTA" é
       uma frase que se lê; "Esperando sua resposta" mais um `3` é uma coisa que
       se vê -- e ela olha isto de relance, entre duas consultas. */
    contagemDePedidos: {
      fontFamily: FONTE.forte,
      fontSize: 11.5,
      color: t.cores.branco,
      backgroundColor: t.cores.gold,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 1,
      overflow: 'hidden',
      fontVariant: ['tabular-nums'],
    },
    maisPedidos: { fontFamily: FONTE.normal, fontSize: 12.5, color: t.inkFraco, paddingVertical: 6 },
    umPedido: { paddingBottom: 6 },
    botoesDoPedido: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
    recusar: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 9,
      borderRadius: 10,
      backgroundColor: t.cores.superficie,
      borderWidth: 1,
      borderColor: t.cores.borda,
    },
    textoRecusar: { fontFamily: FONTE.meia, fontSize: 13.5, color: t.cores.ink },
    aceitar: {
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 96,
      paddingVertical: 9,
      paddingHorizontal: 16,
      borderRadius: 10,
      backgroundColor: t.cores.verde,
    },
    textoAceitar: { fontFamily: FONTE.forte, fontSize: 13.5, color: t.cores.branco },
    desligado: { opacity: 0.5 },
    respostaDoBanco: {
      fontFamily: FONTE.normal,
      fontSize: 12.5,
      color: t.cores.ink,
      lineHeight: 18,
      backgroundColor: t.cores.verdeMenta,
      padding: 10,
      borderRadius: 10,
      marginTop: 4,
    },
    ondeResponder: { fontFamily: FONTE.normal, fontSize: 11.5, color: t.inkFraco, lineHeight: 17, paddingTop: 6 },

    amanha: { fontFamily: FONTE.normal, fontSize: 13, color: t.inkSuave, paddingHorizontal: 4, paddingTop: 2 },
    horaLarga: { width: 82 },

    blocoAtencao: {
      backgroundColor: t.cores.cartao,
      borderRadius: RAIO_CARTAO,
      paddingHorizontal: 16,
      overflow: 'hidden',
    },
    linhaAtencao: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
    textosAtencao: { flex: 1 },
    fraseAtencao: { fontFamily: FONTE.meia, fontSize: 15, color: t.cores.ink },
    quebraAtencao: { fontSize: 12.5, color: t.inkSuave, marginTop: 2 },
    pessoaAtencao: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.cores.borda,
      paddingVertical: 11,
    },
    nomeAtencao: { fontSize: 14.5, color: t.cores.ink },
    motivoAtencao: { fontSize: 12.5, color: t.inkSuave, marginTop: 1 },

    ferramenta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: t.cores.cartao,
      borderRadius: RAIO_CARTAO,
      paddingVertical: 14,
      paddingHorizontal: 14,
      marginTop: 2,
    },
    textosFerramenta: { flex: 1 },
    tituloFerramenta: { fontFamily: FONTE.meia, fontSize: 15, color: t.cores.ink },
    textoFerramenta: { fontSize: 12.5, color: t.inkSuave, marginTop: 1 },
    pressionada: { opacity: 0.75 },

    rodape: { fontSize: 12.5, color: t.inkFraco, lineHeight: 18, paddingTop: 6, paddingHorizontal: 4 },

    rodapeDaAurora: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 16,
      paddingTop: 8,
      backgroundColor: t.cores.fundo,
    },
    barraAurora: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderRadius: 22,
      paddingVertical: 13,
      paddingHorizontal: 16,
    },
    textoBarraAurora: { flex: 1, fontSize: 14, color: t.inkSuave },
  }),
)
