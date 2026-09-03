import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  KeyboardAvoidingView,
  Linking,
  Platform,
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
import { AvatarNutri } from '../components/AvatarNutri'
import { Confirmacao } from '../components/Confirmacao'
import {
  carregarCatalogo,
  conversaNoApp,
  desvincular,
  linkDoWhatsapp,
  telefoneFormatado,
  type Catalogo,
  type Nutricionista,
} from '../lib/nutricionista'
import {
  carregarConteudo,
  descricaoDeContagem,
  descricaoDoEnergetico,
  descricaoDoPlano,
  type ConteudoNutri,
} from '../lib/conteudoNutri'
import {
  carregarMinhasConsultas,
  consultaEmDestaque,
  consultaLegivel,
  estadoDaConsulta,
  type MinhaConsulta,
} from '../lib/agenda'
import {
  cancelarPedidoDeVinculo,
  carregarMinhasSolicitacoes,
  estadoDaSolicitacao,
  estaEmAberto,
  solicitarVinculo,
  type Solicitacao,
} from '../lib/solicitacoes'
import { ConteudoNutriScreen, type ChaveConteudo } from './ConteudoNutriScreen'
import { AgendarConsultaScreen } from './AgendarConsultaScreen'
import { dataCurta } from '../lib/formatar'
import { estilosDe, paleta } from '../lib/tema'

/* O catálogo de nutricionistas Cygnos, em tela cheia.
 *
 * Duas telas no mesmo arquivo porque são o mesmo assunto em dois estados, e o
 * que muda entre elas é pequeno: sem vínculo, a lista de todas; com vínculo, a
 * ficha de uma só. Quem decide qual dos dois é o banco — ver lib/nutricionista.ts.
 *
 * Mesma escolha das outras telas do menu: View sobreposta no App, não Modal. */
export function NutricionistasScreen({
  abrirNaRede,
  onFechar,
  onConversar,
}: {
  /* Entra direto no catálogo da rede, em vez da ficha da própria. */
  abrirNaRede?: boolean
  onFechar: () => void
  /* Fecha esta tela e leva à aba da conversa. A ficha responde "quem acompanha
     você"; falar com ela é o passo seguinte óbvio, e sem este botão o caminho
     era voltar, achar a aba e entrar — três toques para o que devia ser um. */
  onConversar: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null)
  const [conteudo, setConteudo] = useState<ConteudoNutri | null>(null)
  const [erroConteudo, setErroConteudo] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  /* Separado de `carregando`: a primeira carga troca a tela por um indicador, e
     a atualização mantém a ficha na tela enquanto relê. */
  const [atualizando, setAtualizando] = useState(false)
  /* Qual conteúdo está aberto. Estado DAQUI e não do App: o conteúdo só existe
     dentro desta tela, e o App não tem por que saber que ele existe. Mesma
     escolha do RegistrarScreen. */
  const [aberto, setAberto] = useState<ChaveConteudo | null>(null)
  const [agendando, setAgendando] = useState(false)
  /* A rede aberta por cima da ficha dela. Só existe quando há vínculo: sem
     vínculo o catálogo já É a tela.
     Começa aberta quando se chega pelo "Nutricionistas Cygnos" do Mais: quem
     entrou por ali pediu a REDE, e mostrar a ficha da própria antes seria um
     degrau que ela não pediu. */
  const [vendoRede, setVendoRede] = useState(!!abrirNaRede)
  const [consultas, setConsultas] = useState<MinhaConsulta[]>([])
  /* Os pedidos que ele já fez, e para quem o painel de pedir está aberto.
     Só existem sem vínculo: depois do aceite, isto some com a lista. */
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([])
  const [pedindo, setPedindo] = useState<Nutricionista | null>(null)
  /* Nome de quem acabou de ser encerrada, para o aviso de sucesso. */
  const [encerrou, setEncerrou] = useState('')

  /* Recarrega ao voltar da tela de agendamento: quem acabou de pedir horário
     precisa ver o pedido aparecer aqui, e não uma ficha igual à de antes. */
  const [versao, setVersao] = useState(0)

  /* O voltar do Android, descascando uma camada por vez.
   *
   * Esta tela abre outras duas POR CIMA de si — o conteúdo do acompanhamento e o
   * agendamento —, e nenhuma das duas existia para o App: lá em cima só há
   * `nutricionistasAbertas`. Sem isto, quem estivesse escolhendo horário e
   * apertasse voltar era jogado direto em "Mais", com as três telas fechadas de
   * uma vez.
   *
   * Registrado aqui, e não no App, porque o React Native chama os tratadores na
   * ordem inversa do registro: o mais interno decide primeiro, e é isso que faz
   * o voltar descascar em vez de fechar tudo. E `false` no fim devolve o evento
   * para o App, que sabe fechar esta tela. Ver a armadilha 1 do AGENTS.md. */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      /* O painel de pedir é a camada mais alta: fecha primeiro, e sem mexer em
         nada — quem desistiu de pedir volta para a lista, não para "Mais". */
      if (pedindo) {
        setPedindo(null)
        return true
      }
      if (aberto) {
        setAberto(null)
        return true
      }
      /* A rede é uma camada por cima da ficha: o voltar devolve à minha
         nutricionista, e não fecha a tela inteira. Armadilha 1. */
      if (vendoRede) {
        setVendoRede(false)
        return true
      }
      if (agendando) {
        /* Mesmo caminho do botão de voltar da tela de agendamento, versão por
           versão: quem pediu horário e saiu pelo botão do aparelho precisa ver o
           pedido na ficha igual a quem saiu pela seta. */
        setAgendando(false)
        setVersao(v => v + 1)
        return true
      }
      return false
    })

    return () => sub.remove()
  }, [aberto, agendando, pedindo, vendoRede])

  /* E recarrega também ao voltar do segundo plano.
   *
   * Quem vincula é a nutricionista, do lado dela, e nada avisa o aparelho. O
   * caso comum é o paciente ditar o código com o app aberto na mão, ela vincular
   * ali na frente dele, e ele voltar para cá — que é exatamente o instante em
   * que esta tela ainda diz que ele não tem nutricionista. Sem isto, a resposta
   * certa só chega depois de fechar e abrir o app, e ninguém fecha app.
   *
   * Vale para a consulta pelo mesmo motivo: aceitar o pedido também é ação dela,
   * e o app só descobre relendo. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', estado => {
      if (estado === 'active') setVersao(v => v + 1)
    })
    return () => sub.remove()
  }, [])

  useEffect(() => {
    let vivo = true

    /* As três juntas: a ficha, o que a nutricionista tem para a pessoa e a
       próxima consulta apareceriam em momentos diferentes se fossem em
       sequência, e a tela piscaria conteúdo novo depois de já parecer pronta. */
    Promise.all([
      carregarCatalogo(),
      carregarConteudo(),
      /* Falha aqui é silenciosa e vira "não há consulta": o cartão é um extra
         desta tela, e derrubar a ficha inteira por causa dele seria trocar o
         telefone de quem acompanha a pessoa por uma mensagem de erro. */
      carregarMinhasConsultas().catch(() => []),
      /* Os pedidos entram no mesmo lote pelo mesmo motivo das consultas: chegar
         depois faria a lista aparecer pronta e só então crescer um bloco em
         cima dela. Falha aqui vira lista vazia — sem pedido a tela continua
         inteira, e um erro no lugar do catálogo custaria mais do que o bloco. */
      carregarMinhasSolicitacoes().catch(() => ({ tipo: 'erro' as const, mensagem: '' })),
    ]).then(([cat, cont, minhas, pedidos]) => {
      if (!vivo) return

      /* O erro é limpo no sucesso, e não só escrito na falha: agora que a tela
         relê sozinha, um erro que não sai da tela quando a próxima leitura dá
         certo faria a ficha ficar escondida atrás de uma mensagem vencida. */
      if (cat.tipo === 'erro') {
        /* Frase nossa. O que vinha do banco era "Network request failed" ou
           coisa parecida: texto de programador, em inglês, ocupando a tela
           inteira no lugar da ficha de quem acompanha a pessoa. O motivo cru
           fica no console, para quem for depurar. */
        console.warn('[nutricionistas] falha ao carregar o catálogo:', cat.mensagem)
        setErro('Não consegui carregar agora. Puxe para baixo para tentar de novo.')
      } else {
        setErro(null)
        setCatalogo(cat.catalogo)
      }

      setConsultas(minhas)
      if (pedidos.tipo === 'ok') setSolicitacoes(pedidos.solicitacoes)

      /* Falha aqui NÃO derruba a tela: sem o resumo, a ficha da nutricionista
         continua inteira e útil, e trocá-la por uma mensagem de erro tiraria da
         pessoa o telefone de quem a acompanha.
         Mas também não some calada. A primeira versão engolia o erro, e quando a
         RPC quebrou de fato — cast de data inválido — a lista simplesmente não
         apareceu, sem nada na tela dizendo por quê. Falha que não se anuncia
         custa uma sessão de depuração para ser encontrada. */
      if (cont.tipo === 'ok') {
        setErroConteudo(null)
        setConteudo(cont.conteudo)
      } else setErroConteudo(cont.mensagem)

      setCarregando(false)
      setAtualizando(false)
    })

    return () => {
      vivo = false
    }
  }, [versao])

  const vinculada = catalogo?.vinculada ?? null
  /* O catálogo MENOS a dela: ela já está inteira logo acima, e repetir a mesma
     ficha duas vezes na mesma rolagem faria a pessoa achar que são duas. */
  const outras = (catalogo?.lista ?? []).filter(n => n.id !== vinculada?.id)

  /* O mesmo controle nas duas ramificações da tela — a da ficha e a do erro.
     Puxar sobe a versão, e é o efeito de cima que relê: um caminho só para
     recarregar, seja quem for que pediu. */
  const puxarParaAtualizar = (
    <RefreshControl
      refreshing={atualizando}
      onRefresh={() => {
        setAtualizando(true)
        setVersao(v => v + 1)
      }}
      tintColor={paleta().cores.limao}
    />
  )

  /* Substitui a tela em vez de sobrepor: o "voltar" do conteúdo devolve à ficha,
     e não fecha as duas de uma vez. */
  if (aberto) return <ConteudoNutriScreen chave={aberto} onFechar={() => setAberto(null)} />
  if (agendando) {
    return (
      <AgendarConsultaScreen
        onFechar={() => {
          setAgendando(false)
          setVersao(v => v + 1)
        }}
      />
    )
  }

  return (
    <View style={[styles.tela, { paddingTop: top + 8 }]}>
      <View style={styles.cabecalho}>
        <Pressable
          onPress={onFechar}
          style={styles.botaoVoltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={vendoRede ? 'Voltar para a minha nutricionista' : 'Voltar'}
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela}>
          {vendoRede || !vinculada ? 'Nutricionistas Cygnos' : 'Minha nutricionista'}
        </Text>
        <View style={styles.botaoVoltar} />
      </View>

      {carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator color={paleta().cores.verde} />
        </View>
      ) : erro ? (
        /* Rola, e não é uma View parada: é aqui que puxar para tentar de novo é
           o gesto óbvio, e a tela vinha prometendo isso por escrito sem ter o
           controle que atende ao gesto. */
        <ScrollView
          contentContainerStyle={[styles.conteudo, { paddingBottom: 32 + bottom }]}
          showsVerticalScrollIndicator={false}
          refreshControl={puxarParaAtualizar}
        >
          <View style={styles.erro}>
            <Text style={styles.textoErro}>{erro}</Text>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.conteudo, { paddingBottom: 32 + bottom }]}
          showsVerticalScrollIndicator={false}
          refreshControl={puxarParaAtualizar}
        >
          {vinculada && !vendoRede ? (
            <Ficha
              nutri={vinculada}
              conteudo={conteudo}
              erroConteudo={erroConteudo}
              consultas={consultas}
              onAbrir={setAberto}
              onAgendar={() => setAgendando(true)}
              onConversar={onConversar}
              onDesvincular={async motivo => {
                const nomeDela = vinculada.nome
                const r = await desvincular(motivo)
                /* Confirma pelo nome de quem saiu.
                 *
                 * Sem isto a tela apenas trocava de ramo — da ficha dela para o
                 * catálogo — e o sucesso ficava mudo. Ação sem volta que não diz
                 * "pronto" deixa a dúvida de sempre: aconteceu, ou eu fechei sem
                 * querer? O nome no aviso é o que prova que foi a certa. */
                if (r.tipo === 'ok') setEncerrou(nomeDela)
                /* Relê em vez de mexer no estado daqui: quem decide se o vínculo
                   acabou é o banco, e a tela inteira muda de ramo — da ficha
                   dela para o catálogo. */
                if (r.tipo === 'ok') setVersao(v => v + 1)
                return r
              }}
            />
          ) : null}

          {/* A REDE, mesmo com vínculo — mas NÃO na mesma rolagem.
           *
           * ── A primeira versão ────────────────────────────────────────────
           * Era `vinculada ? <Ficha/> : <Lista/>`: uma ou outra, nunca as duas.
           * A vitrine sumia junto com a escolha, e trocar de profissional
           * virava salto no escuro — era preciso encerrar para só então poder
           * olhar quem mais existe, e nesse intervalo ficar sem ninguém.
           *
           * ── A segunda, que consertou aquilo e criou isto ────────────────
           * Passei a desenhar as duas seguidas. No aparelho ficou ruim de um
           * jeito que não dava para prever lendo o código: abaixo da ficha da
           * profissional dela — que já é longa, com acompanhamento, consultas
           * e especialidades — vinha uma parede com seis fichas de outras
           * pessoas e a lista de pedidos. Quem abre "Minha nutricionista"
           * quer ver a SUA, e recebia um catálogo por cima.
           *
           * ── A terceira: uma porta, e não uma parede ─────────────────────
           * Com vínculo, a rede vira UMA linha que se abre. A vitrine continua
           * a um toque, que era o ponto de tê-la trazido de volta, e a tela da
           * profissional dela volta a ser só dela.
           *
           * Sem vínculo nada disso vale: aí o catálogo É a tela, e abrir uma
           * porta para o único conteúdo que existe seria um degrau à toa.
           *
           * ── E sem oferecer um segundo vínculo ───────────────────────────
           * A regra é um ativo por vez, e ela é do banco. A lista aqui é para
           * VER: as fichas abrem, o pedido não. Oferecer um botão que o
           * servidor vai recusar é pior do que não oferecer — ela toca, leva
           * um erro, e conclui que o app está quebrado. */}
          {/* ── A REDE NÃO MORA MAIS AQUI ────────────────────────────────
              Terceira e quarta versões desta tela no mesmo dia, e a lição está
              no percurso: primeiro o catálogo SUBSTITUÍA a ficha (sumia ao
              vincular), depois vinha inteiro logo ABAIXO dela (uma parede de
              seis fichas), depois virou uma porta aqui dentro — e continuava
              escondido, porque ninguém procura a rede dentro de "Minha
              nutricionista".

              O erro repetido foi tratar como problema de FORMA o que era de
              LUGAR. São dois assuntos, e agora são duas telas: a rede tem
              entrada própria no Mais, antes de Privacidade.

              Esta tela ainda desenha o catálogo quando se chega por lá — é a
              mesma tela, entrando por outra porta (`abrirNaRede`). */}

          {vinculada && vendoRede && (
            <Text style={styles.ajudaOutras}>
              Você pode conhecer as fichas. Para trocar de profissional, é preciso encerrar o
              acompanhamento atual primeiro.
            </Text>
          )}

          {(vinculada ? vendoRede && outras.length > 0 : true) && (
            <Lista
              podePedir={!vinculada}
              nutris={vinculada ? outras : (catalogo?.lista ?? [])}
              solicitacoes={solicitacoes}
              onPedir={setPedindo}
              onCancelar={async id => {
                const r = await cancelarPedidoDeVinculo(id)
                /* Relê em vez de tirar da lista aqui: quem decide se o pedido
                   pôde mesmo ser desfeito é o banco, e uma linha que some da
                   tela e volta na próxima leitura é pior do que uma que demora
                   meio segundo para sumir. */
                if (r.tipo === 'ok') setVersao(v => v + 1)
                return r
              }}
            />
          )}
        </ScrollView>
      )}

      <Confirmacao
        visivel={!!encerrou}
        titulo="Acompanhamento encerrado"
        mensagem={`Você não é mais acompanhada por ${encerrou}. O que ela registrou continua aqui, e você pode procurar outra nutricionista quando quiser.`}
        rotuloConfirmar="Entendi"
        rotuloCancelar="Fechar"
        onCancelar={() => setEncerrou('')}
        onConfirmar={() => setEncerrou('')}
      />

      {/* Por cima de tudo, e depois do ScrollView: é a camada mais alta da tela
          e precisa cobrir a lista inteira. */}
      {!!pedindo && (
        <PainelDePedido
          nutri={pedindo}
          onFechar={() => setPedindo(null)}
          onEnviou={() => {
            setPedindo(null)
            setVersao(v => v + 1)
          }}
        />
      )}
    </View>
  )
}

/* ── Pedir contato ─────────────────────────────────────────────────────────
 *
 * O primeiro contato parte SEMPRE do paciente: ele acha a profissional aqui,
 * escreve uma frase e pede. Ela recebe na caixa dela e aceita ou não. Ela não
 * navega paciente e não procura ninguém — a mão é única de propósito.
 *
 * A frase é opcional. Exigir texto para pedir contato transforma um toque num
 * formulário, e quem só quer ser atendido não tem o que escrever. */
function PainelDePedido({
  nutri,
  onFechar,
  onEnviou,
}: {
  nutri: Nutricionista
  onFechar: () => void
  onEnviou: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const [mensagem, setMensagem] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  async function enviar() {
    if (enviando) return
    setEnviando(true)
    setErro('')

    const r = await solicitarVinculo(nutri.id, mensagem)
    if (r.tipo === 'ok') {
      onEnviou()
      return
    }

    /* Só desliga o "enviando" na falha: no sucesso o painel já saiu da tela, e
       mexer no estado de um componente desmontado é aviso no console à toa. */
    setEnviando(false)
    setErro(r.mensagem)
  }

  return (
    /* behavior declarado, senão no Android o teclado cobre o campo — a caixa de
       texto fica na metade de baixo do painel. Ver a armadilha 2. */
    <KeyboardAvoidingView
      style={[styles.painel, { paddingTop: top + 8, paddingBottom: bottom + 16 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.cabecalho}>
        <Pressable
          onPress={onFechar}
          style={styles.botaoVoltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar sem pedir"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela}>Pedir contato</Text>
        <View style={styles.botaoVoltar} />
      </View>

      <ScrollView
        contentContainerStyle={styles.conteudoPainel}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.blocoPedido}>
          <AvatarNutri nutri={nutri} tamanho={72} />
          <Text style={styles.nomePedido}>{nutri.nome}</Text>
          {!!nutri.crn && <Text style={styles.crnCartao}>CRN {nutri.crn}</Text>}
          {!!lugarDe(nutri) && <Text style={styles.lugarCartao}>{lugarDe(nutri)}</Text>}
        </View>

        {nutri.especialidades.length > 0 && <Chips itens={nutri.especialidades} />}

        <Text style={styles.rotuloCampo}>Escreva algo, se quiser</Text>
        <TextInput
          value={mensagem}
          onChangeText={setMensagem}
          placeholder="Conte em uma frase o que você procura."
          placeholderTextColor={paleta().inkFraco}
          style={styles.campoPedido}
          multiline
          maxLength={500}
          textAlignVertical="top"
        />

        <Text style={styles.avisoPedido}>
          Ela recebe o seu pedido e responde quando puder. Enquanto isso, você pode pedir para
          outras — e nada muda no seu app até alguém aceitar.
        </Text>

        {/* O que acontece com os DADOS, dito antes de o pedido sair.
          *
          * Faltava, e a falta era dos dois lados. Do lado de quem usa: a pessoa
          * entregava peso, refeição e sono a uma estranha sem que a tela
          * dissesse isso em lugar nenhum — o aviso acima fala só do pedido, e
          * quem lê entende "ela me responde", não "ela vê o meu diário".
          *
          * Do lado da loja: o Google só aceita não declarar isso como
          * compartilhamento com terceiro quando a transferência parte de uma
          * AÇÃO da pessoa e ela foi avisada na hora. A ação existia; o aviso,
          * não. Ver docs/seguranca-dos-dados-play.md.
          *
          * O ciclo é citado porque ele é a exceção, e omitir a exceção seria
          * prometer a mais: ele tem interruptor próprio, nasce desligado, e
          * continua desligado depois do vínculo. Quem lê "ela vê o que você
          * registra" sem essa frase pode concluir que já está vendo. */}
        <Text style={styles.avisoDados}>
          Se ela aceitar, passa a acompanhar o que você registra aqui — peso, refeições, água, sono
          e treinos. O ciclo menstrual fica de fora: ele só é compartilhado se você ligar isso na
          tela dele. Você encerra o acompanhamento quando quiser, sem precisar dar motivo.
        </Text>

        {!!erro && <Text style={styles.erroPedido}>{erro}</Text>}
      </ScrollView>

      <Pressable
        onPress={enviar}
        disabled={enviando}
        style={({ pressed }) => [
          styles.botaoPedir,
          enviando && styles.botaoPedirApagado,
          pressed && styles.botaoPedirPressionado,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Enviar pedido de contato para ${nutri.nome}`}
      >
        {enviando ? (
          <ActivityIndicator size="small" color={paleta().cores.branco} />
        ) : (
          <Text style={styles.textoPedir}>Enviar pedido</Text>
        )}
      </Pressable>
    </KeyboardAvoidingView>
  )
}

/* ── Com vínculo ───────────────────────────────────────────────────────────*/

function Ficha({
  nutri,
  conteudo,
  erroConteudo,
  consultas,
  onAbrir,
  onAgendar,
  onConversar,
  onDesvincular,
}: {
  nutri: Nutricionista
  conteudo: ConteudoNutri | null
  erroConteudo: string | null
  consultas: MinhaConsulta[]
  onAbrir: (chave: ChaveConteudo) => void
  onAgendar: () => void
  onConversar: () => void
  onDesvincular: (motivo: string) => Promise<{ tipo: 'ok' } | { tipo: 'erro'; mensagem: string }>
}) {
  const [saindo, setSaindo] = useState(false)
  const [perguntando, setPerguntando] = useState(false)
  const [erroSaida, setErroSaida] = useState('')
  const [motivo, setMotivo] = useState('')
  const styles = estilos()
  /* Uma consulta em destaque e a contagem do resto. A ficha não é a agenda: ela
     responde "e agora?" numa linha, e quem quiser a lista inteira toca e abre a
     tela de agendamento — onde todas aparecem. */
  const destaque = consultaEmDestaque(consultas)
  const outras = consultas.length - (destaque ? 1 : 0)
  return (
    <>
      <View style={styles.blocoFicha}>
        <AvatarNutri nutri={nutri} tamanho={92} />
        <Text style={styles.nomeFicha}>{nutri.nome}</Text>
        {!!nutri.crn && <Text style={styles.crnFicha}>CRN {nutri.crn}</Text>}
        {!!lugarDe(nutri) && <Text style={styles.lugarFicha}>{lugarDe(nutri)}</Text>}

        <View style={styles.selo}>
          <Ionicons name="checkmark-circle" size={14} color={paleta().cores.verde} />
          <Text style={styles.textoSelo}>Acompanha você</Text>
        </View>
      </View>

      {/* A consulta que já existe vem antes do botão. Esta é a tela em que a
          pessoa entra para saber da nutricionista dela, e "quando eu vejo você
          de novo" é a primeira pergunta — antes de qualquer coisa que ela possa
          querer marcar. Toca e abre a tela de agendamento, onde o estado
          aparece por extenso. */}
      {!!destaque && (
        <Pressable
          onPress={onAgendar}
          style={({ pressed }) => [styles.cartaoProxima, pressed && styles.cartaoProximaPressionado]}
          accessibilityRole="button"
          accessibilityLabel={`${estadoDaConsulta(destaque.status).titulo}: ${consultaLegivel(destaque.dataHora)}${
            outras > 0 ? `. Mais ${outras} marcada${outras > 1 ? 's' : ''}.` : ''
          }`}
        >
          <View style={styles.iconeProxima}>
            <Ionicons name={estadoDaConsulta(destaque.status).icone} size={17} color={paleta().cores.verde} />
          </View>
          <View style={styles.textoProxima}>
            <Text style={styles.rotuloProxima}>{estadoDaConsulta(destaque.status).titulo}</Text>
            <Text style={styles.dataProxima}>{consultaLegivel(destaque.dataHora)}</Text>
            {/* A contagem do resto, para a ficha não dar a entender que esta é a
                única. Quem tem duas no mesmo dia precisa saber disso aqui, não
                só depois de abrir outra tela. */}
            {outras > 0 && (
              <Text style={styles.outrasProxima}>
                + {outras} outra{outras > 1 ? 's' : ''} marcada{outras > 1 ? 's' : ''}
              </Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={16} color={paleta().inkFraco} />
        </Pressable>
      )}

      {/* Antes do acompanhamento, e como botão cheio: marcar a próxima consulta
          é a coisa mais frequente que alguém quer fazer nesta tela, e ela não
          pode disputar atenção com uma lista de cinco linhas. */}
      <Pressable
        onPress={onAgendar}
        style={({ pressed }) => [styles.botaoAgendar, pressed && styles.botaoAgendarPressionado]}
        accessibilityRole="button"
        accessibilityLabel={destaque ? 'Marcar outro horário' : 'Agendar consulta'}
      >
        <Ionicons name="calendar-outline" size={17} color={paleta().cores.branco} />
        <Text style={styles.textoAgendar}>
          {destaque ? 'Marcar outro horário' : 'Agendar consulta'}
        </Text>
      </Pressable>

      {/* Segundo, e não primeiro: marcar consulta é o que mais se faz aqui. Mas
          tinha que existir — a ficha diz quem acompanha a pessoa, e falar com
          essa pessoa era voltar, achar a aba e entrar. */}
      <Pressable
        onPress={onConversar}
        style={({ pressed }) => [styles.botaoConversar, pressed && styles.botaoConversarPressionado]}
        accessibilityRole="button"
        accessibilityLabel={`Conversar com ${nutri.nome}`}
      >
        <Ionicons name="chatbubble-ellipses-outline" size={17} color={paleta().cores.verde} />
        <Text style={styles.textoConversar}>Conversar</Text>
      </Pressable>

      <Acompanhamento conteudo={conteudo} erro={erroConteudo} onAbrir={onAbrir} />

      {nutri.especialidades.length > 0 && (
        <View style={styles.cartao}>
          <Text style={styles.tituloCartao}>Especialidades</Text>
          <Chips itens={nutri.especialidades} />
        </View>
      )}

      {/* Duas condições para a mesma coisa, de propósito. Hoje o banco só
          devolve o telefone quando ela escolheu o WhatsApp, então `telefone`
          bastaria — mas o dia em que a coluna voltar a vir preenchida por
          qualquer outro motivo é o dia em que o botão verde aparece para quem
          pediu para não aparecer. A regra fica escrita aqui também. */}
      {!!nutri.telefone && (
        <Contato telefone={nutri.telefone} whatsapp={!conversaNoApp(nutri)} />
      )}

      {/* Discreto e no fim, como toda saída: quem entra aqui vem ver o
          acompanhamento, não vem sair dele. Mas existe, e sem pedir motivo —
          trocar de profissional é rotina, e um formulário de justificativa
          transformaria isso em rompimento. */}
      {/* Discreto e no fim, como toda saída: quem entra aqui vem ver o
          acompanhamento, não vem sair dele. */}
      <Pressable
        onPress={() => setPerguntando(true)}
        style={({ pressed }) => [styles.botaoSair, pressed && styles.botaoSairPressionado]}
        accessibilityRole="button"
        accessibilityLabel={`Encerrar o acompanhamento com ${nutri.nome}`}
      >
        <Text style={styles.textoSair}>Encerrar acompanhamento</Text>
      </Pressable>

      {/* A caixa da casa, e não o `Alert.alert` do sistema.
       *
       * Eu tinha usado o Alert nativo — que aparece com a cara do Android no
       * meio de um app com desenho próprio — sendo que este componente existe
       * desde antes, e existe exatamente por causa disso. O comentário dentro
       * dele diz: "uma caixa que não se parece com o app parece um aviso do
       * celular, e a pessoa lê com outra atenção".
       *
       * Escrevi novo sem procurar o que já havia. É a armadilha 5, e o meu
       * arquivo era o ÚNICO do app ainda chamando Alert.alert. */}
      <Confirmacao
        visivel={perguntando}
        titulo="Encerrar o acompanhamento?"
        mensagem={`Você deixa de ser acompanhada por ${nutri.nome}. O que ela já registrou continua no seu app, e o seu ciclo deixa de ser compartilhado.

Você pode procurar outra nutricionista depois.`}
        rotuloConfirmar="Encerrar"
        rotuloCancelar="Continuar acompanhada"
        destrutiva
        ocupada={saindo}
        onCancelar={() => {
          setPerguntando(false)
          setMotivo('')
        }}
        onConfirmar={async () => {
          setSaindo(true)
          const r = await onDesvincular(motivo)
          setSaindo(false)
          setPerguntando(false)
          setMotivo('')
          if (r.tipo === 'erro') setErroSaida(r.mensagem)
        }}
      >
        {/* Opcional de verdade, e o rótulo diz o destino ANTES de a pessoa
            escrever.
         *
         * Sem dizer que ela vai ler, o campo vira uma armadilha: quem desabafa
         * achando que é anônimo escreve uma coisa, e descobre depois que a
         * profissional leu. Com o destino à mostra, cada um escolhe o tom — e
         * quem não quiser dizer nada não diz, que é o caso mais comum.
         *
         * Não há segunda chavinha de "mandar para ela?". Um campo opcional já É
         * a escolha, e um motivo que ninguém lê é desabafo, não retorno. */}
        <Text style={styles.rotuloMotivo}>Quer dizer o motivo? Ela vai poder ler.</Text>
        <TextInput
          value={motivo}
          onChangeText={setMotivo}
          placeholder="Opcional"
          placeholderTextColor={paleta().inkFraco}
          style={styles.campoMotivo}
          multiline
          maxLength={500}
          textAlignVertical="top"
        />
      </Confirmacao>

      <Confirmacao
        visivel={!!erroSaida}
        titulo="Não deu certo"
        mensagem={erroSaida}
        rotuloConfirmar="Entendi"
        rotuloCancelar="Fechar"
        onCancelar={() => setErroSaida('')}
        onConfirmar={() => setErroSaida('')}
      />
    </>
  )
}

/* O que a nutricionista tem para esta pessoa.
 *
 * A ordem é a do atendimento, não a alfabética: anamnese primeiro (é o começo
 * de tudo), medidas depois, e o que sai delas — plano e calorias — no fim.
 *
 * Item vazio NÃO some da lista. Uma lista que encolhe conforme o que existe
 * esconde da pessoa que aquilo existe como possibilidade: quem nunca teve
 * antropometria não descobriria que antropometria é algo que a nutricionista
 * faz. "Nenhuma avaliação ainda" é informação; a ausência da linha não é.
 *
 * `chave` continua opcional de propósito: é o que permite um item existir na
 * lista antes de a tela de dentro dele existir — sem seta, sem toque, sem
 * afundar ao pressionar. Nenhum item está nesse estado hoje. */
function Acompanhamento({
  conteudo,
  erro,
  onAbrir,
}: {
  conteudo: ConteudoNutri | null
  erro: string | null
  onAbrir: (chave: ChaveConteudo) => void
}) {
  const styles = estilos()
  /* Três estados, e nenhum deles é a lista sumir sem explicação:
     - deu erro ao buscar;
     - o vínculo existe mas ainda não aponta para uma ficha (é possível: o selo
       "Acompanha você" só exige linha em app_vinculos, enquanto a lista precisa
       do paciente_id preenchido);
     - tudo certo, e aí a lista. */
  if (!conteudo) {
    return (
      <View style={styles.cartao}>
        <Text style={styles.tituloCartao}>Meu acompanhamento</Text>
        <Text style={styles.apoioItem}>
          {erro
            ? 'Não foi possível carregar agora. Puxe para atualizar mais tarde.'
            : 'Assim que a sua nutricionista abrir a sua ficha, o que ela registrar aparece aqui.'}
        </Text>
      </View>
    )
  }

  const itens: {
    icone: keyof typeof Ionicons.glyphMap
    rotulo: string
    apoio: string
    chave?: ChaveConteudo
  }[] = [
    {
      icone: 'document-text-outline',
      rotulo: 'Anamnese',
      apoio: descricaoDeContagem(conteudo.anamnese, 'anamnese', 'anamneses', 'Ainda não preenchida'),
      chave: 'anamnese',
    },
    {
      icone: 'body-outline',
      rotulo: 'Antropometria',
      apoio: descricaoDeContagem(conteudo.antropometria, 'avaliação', 'avaliações', 'Nenhuma avaliação ainda'),
      chave: 'antropometria',
    },
    {
      icone: 'camera-outline',
      rotulo: 'Evolução fotográfica',
      apoio: descricaoDeContagem(conteudo.fotos, 'foto', 'fotos', 'Nenhuma foto ainda'),
      chave: 'fotos',
    },
    {
      icone: 'flask-outline',
      rotulo: 'Exames',
      /* Sem contagem, ao contrário dos vizinhos: `app_conteudo_da_nutricionista`
         não conta exames, e inventar "0 exames" para quem tem três seria pior do
         que não dizer número nenhum. A frase convida a abrir, e a tela de dentro
         responde a pergunta. */
      apoio: 'Os exames que ela importou',
      chave: 'exames',
    },
    {
      icone: 'restaurant-outline',
      rotulo: 'Planejamento alimentar',
      apoio: descricaoDoPlano(conteudo.plano),
      chave: 'plano',
    },
    {
      icone: 'flame-outline',
      rotulo: 'Cálculo energético',
      apoio: descricaoDoEnergetico(conteudo.energetico),
      chave: 'energetico',
    },
    {
      icone: 'book-outline',
      rotulo: 'Receitas',
      /* Logo abaixo do plano, e é o lugar certo: a pergunta que vem depois de
         "o que eu como" é "como eu faço isso". Sem contagem pelo mesmo motivo
         dos exames — o resumo do banco não conta receitas. */
      apoio: 'O que ela sugeriu para você cozinhar',
      chave: 'receitas',
    },
  ]

  return (
    <View style={styles.cartao}>
      <Text style={styles.tituloCartao}>Meu acompanhamento</Text>

      <View style={styles.listaItens}>
        {itens.map(item => {
          const miolo = (
            <>
              <View style={styles.iconeItem}>
                <Ionicons name={item.icone} size={17} color={paleta().cores.verde} />
              </View>
              <View style={styles.textoItem}>
                <Text style={styles.rotuloItem}>{item.rotulo}</Text>
                <Text style={styles.apoioItem}>{item.apoio}</Text>
              </View>
              {!!item.chave && (
                <Ionicons name="chevron-forward" size={16} color={paleta().inkFraco} />
              )}
            </>
          )

          /* Item vazio continua abrindo: a tela de dentro explica o vazio com
             palavras ("a sua nutricionista ainda não preencheu uma anamnese"),
             e um botão que não responde ao toque não explica nada. */
          return item.chave ? (
            <Pressable
              key={item.rotulo}
              onPress={() => onAbrir(item.chave!)}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressionado]}
              accessibilityRole="button"
              accessibilityLabel={`${item.rotulo}. ${item.apoio}`}
            >
              {miolo}
            </Pressable>
          ) : (
            <View key={item.rotulo} style={styles.item}>
              {miolo}
            </View>
          )
        })}
      </View>
    </View>
  )
}

/* ── Sem vínculo ───────────────────────────────────────────────────────────*/

function Lista({
  nutris,
  solicitacoes,
  podePedir,
  onPedir,
  onCancelar,
}: {
  nutris: Nutricionista[]
  solicitacoes: Solicitacao[]
  /* Falso quando ela já tem vínculo: a regra de um ativo por vez é do banco, e
     um botão que o servidor vai recusar é pior do que botão nenhum — ela toca,
     leva um erro, e conclui que o app está quebrado. */
  podePedir: boolean
  onPedir: (n: Nutricionista) => void
  onCancelar: (id: number) => Promise<{ tipo: 'ok' } | { tipo: 'erro'; mensagem: string }>
}) {
  const styles = estilos()

  /* Para quem já há pedido EM ABERTO. Recusado e cancelado ficam de fora de
     propósito: pedir de novo depois de um "não" é direito dele, e um cartão
     travado para sempre por causa de uma recusa de meses atrás seria o app
     decidindo por ela. */
  const emAberto = new Set(
    solicitacoes.filter(s => estaEmAberto(s.status)).map(s => s.nutricionistaId),
  )

  if (nutris.length === 0) {
    return (
      <View style={styles.vazio}>
        <View style={styles.circuloVazio}>
          <Ionicons name="people-outline" size={26} color={paleta().cores.verde} />
        </View>
        <Text style={styles.tituloVazio}>Nenhuma nutricionista por aqui ainda</Text>
        <Text style={styles.textoVazio}>
          Assim que houver profissionais disponíveis, elas aparecem nesta lista.
        </Text>
      </View>
    )
  }

  return (
    <>
      <MeusPedidos solicitacoes={solicitacoes} onCancelar={onCancelar} />

      <Text style={styles.chamadaLista}>
        {nutris.length} {nutris.length === 1 ? 'profissional' : 'profissionais'} no Cygnos
      </Text>
      <Text style={styles.explicacaoLista}>
        {podePedir
          ? 'Toque em quem você quer que acompanhe você e mande um pedido de contato. Se você já está com ela, dê o seu código de vínculo — é com ele que ela puxa a sua conta.'
          : 'Toque para ver a ficha de cada uma.'}
      </Text>

      <View style={styles.listaCartoes}>
        {nutris.map(n => (
          <CartaoDaLista
            key={n.id}
            nutri={n}
            pedido={emAberto.has(n.id)}
            podePedir={podePedir}
            onPedir={() => onPedir(n)}
          />
        ))}
      </View>
    </>
  )
}

/* O cartão inteiro é o botão, e não um "pedir" escondido num canto: a lista tem
   uma ação só, e um alvo do tamanho do cartão erra menos do que um do tamanho
   de uma palavra.
   Sem telefone aqui. Antes do aceite não há relação, e oferecer o WhatsApp de
   quem nunca disse sim ao paciente é abrir a porta pelo lado de fora. */
function CartaoDaLista({
  nutri,
  pedido,
  podePedir,
  onPedir,
}: {
  nutri: Nutricionista
  pedido: boolean
  /* Falso quando ela já tem vínculo. O cartão continua abrindo a ficha — ver é
     o motivo de a lista existir para quem já escolheu —, e o que some é o
     pedido, que o banco recusaria. */
  podePedir: boolean
  onPedir: () => void
}) {
  const styles = estilos()

  return (
    <Pressable
      onPress={pedido || !podePedir ? undefined : onPedir}
      disabled={pedido || !podePedir}
      style={({ pressed }) => [
        styles.cartao,
        pressed && !pedido && podePedir && styles.cartaoPressionado,
      ]}
      accessibilityRole="button"
      accessibilityLabel={
        !podePedir
          ? `${nutri.nome}. Para trocar, encerre o acompanhamento atual primeiro.`
          : pedido
            ? `${nutri.nome}. Pedido enviado, aguardando resposta.`
            : `Pedir contato com ${nutri.nome}`
      }
    >
      <View style={styles.linhaCartao}>
        <AvatarNutri nutri={nutri} tamanho={54} />
        <View style={styles.textoCartao}>
          <Text style={styles.nomeCartao} numberOfLines={2}>
            {nutri.nome}
          </Text>
          {!!nutri.crn && <Text style={styles.crnCartao}>CRN {nutri.crn}</Text>}
          {!!lugarDe(nutri) && <Text style={styles.lugarCartao}>{lugarDe(nutri)}</Text>}
        </View>

        {pedido ? (
          <Ionicons name="hourglass-outline" size={18} color={paleta().inkFraco} />
        ) : (
          <Ionicons name="chevron-forward" size={18} color={paleta().inkFraco} />
        )}
      </View>

      {nutri.especialidades.length > 0 && <Chips itens={nutri.especialidades} limite={4} />}

      {/* O número aparece aqui também quando ela o publicou. Eu tinha tirado da
          lista por conta própria, com o argumento de que antes do aceite não há
          relação — mas a chave dela diz "visível para qualquer pessoa", e um
          estranho no catálogo é exatamente qualquer pessoa. A escolha é dela. */}
      {!!nutri.telefone && (
        <Contato telefone={nutri.telefone} whatsapp={!conversaNoApp(nutri)} compacto />
      )}

      {pedido && <Text style={styles.jaPedido}>Pedido enviado, aguardando resposta</Text>}
    </Pressable>
  )
}

/* ── Meus pedidos ──────────────────────────────────────────────────────────
 *
 * Fica ACIMA da lista, e não numa tela à parte: quem abre esta tela depois de
 * ter pedido vem justamente saber se responderam, e essa resposta não pode
 * estar a dois toques de distância.
 *
 * Some quando não há pedido nenhum — um bloco vazio explicando que não há nada
 * ocupa a primeira tela de quem nunca pediu, que é a maioria. */
function MeusPedidos({
  solicitacoes,
  onCancelar,
}: {
  solicitacoes: Solicitacao[]
  onCancelar: (id: number) => Promise<{ tipo: 'ok' } | { tipo: 'erro'; mensagem: string }>
}) {
  const styles = estilos()
  const [cancelando, setCancelando] = useState<number | null>(null)
  const [erro, setErro] = useState('')

  if (solicitacoes.length === 0) return null

  return (
    <View style={styles.blocoPedidos}>
      <Text style={styles.tituloPedidos}>Meus pedidos</Text>

      {solicitacoes.map(s => {
        const estado = estadoDaSolicitacao(s.status)
        const aberto = estaEmAberto(s.status)

        return (
          <View key={s.id} style={styles.pedido}>
            <View style={styles.linhaPedido}>
              <Ionicons
                name={estado.icone}
                size={18}
                color={s.status === 'aceita' ? paleta().cores.verde : paleta().inkFraco}
              />
              <View style={styles.textoPedido}>
                <Text style={styles.nomePedidoLinha} numberOfLines={1}>
                  {s.nome}
                </Text>
                <Text style={styles.estadoPedido}>
                  {estado.titulo} · {dataCurta(new Date(s.criadaEm))}
                </Text>
              </View>

              {aberto && (
                <Pressable
                  onPress={async () => {
                    setCancelando(s.id)
                    setErro('')
                    const r = await onCancelar(s.id)
                    setCancelando(null)
                    if (r.tipo === 'erro') setErro(r.mensagem)
                  }}
                  disabled={cancelando === s.id}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Desfazer o pedido para ${s.nome}`}
                >
                  {cancelando === s.id ? (
                    <ActivityIndicator size="small" color={paleta().inkFraco} />
                  ) : (
                    <Text style={styles.desfazer}>Desfazer</Text>
                  )}
                </Pressable>
              )}
            </View>

            {/* A frase que ele escreveu, do jeito que escreveu, como balão dele.
                Vem ANTES da explicação porque é o que ele foi ali conferir: sem
                isto, "aguardando resposta" era tudo o que restava de uma
                mensagem que ele escreveu e viu sumir — e a conclusão de quem lê
                isso é que a mensagem não saiu. */}
            {!!s.mensagem && (
              <View style={styles.balaoPedido}>
                <Text style={styles.textoBalaoPedido}>{s.mensagem}</Text>
              </View>
            )}

            <Text style={styles.explicacaoPedido}>{estado.explicacao}</Text>
          </View>
        )
      })}

      {!!erro && <Text style={styles.erroPedido}>{erro}</Text>}
    </View>
  )
}

/* ── Peças ─────────────────────────────────────────────────────────────────*/

const lugarDe = (n: Nutricionista) =>
  n.cidade && n.uf ? `${n.cidade} · ${n.uf}` : n.cidade ?? n.uf ?? ''

function Chips({ itens, limite }: { itens: string[]; limite?: number }) {
  const styles = estilos()
  const mostrar = limite ? itens.slice(0, limite) : itens
  const sobra = itens.length - mostrar.length

  return (
    <View style={styles.chips}>
      {mostrar.map(e => (
        <View key={e} style={styles.chip}>
          <Text style={styles.textoChip}>{e}</Text>
        </View>
      ))}
      {sobra > 0 && (
        <View style={styles.chip}>
          <Text style={styles.textoChip}>+{sobra}</Text>
        </View>
      )}
    </View>
  )
}

/* O telefone é um botão, e o toque é da PESSOA: o app não manda mensagem
   nenhuma — abre a conversa e sai da frente. */
/* O telefone dela, quando ela deixou visível.
 *
 * ── Duas chaves, duas perguntas diferentes ─────────────────────────────────
 * A chavinha "Telefone" nos parâmetros responde **se o número aparece**. O
 * `canal_de_contato` responde **para onde vai a conversa**. São coisas
 * separadas, e a tela trata como separadas: ela pode querer o número à mostra
 * sem mandar as conversas para fora do sistema.
 *
 * Antes daqui o app decidia sozinho, e decidia contra ela: escondia o número
 * sempre que o canal não fosse WhatsApp, mesmo com a chave ligada. A tela de
 * parâmetros dizia "fica visível para qualquer pessoa" e o aplicativo não
 * mostrava para ninguém — configuração que promete e não cumpre é pior do que
 * configuração que não existe.
 *
 * Quem decide o que aparece dela é ela. O app obedece. */
function Contato({
  telefone,
  whatsapp: comWhatsapp,
  compacto = false,
}: {
  telefone: string
  /* O botão verde só existe quando ela escolheu o WhatsApp como canal. Ligar
     para o número é sempre possível — é um telefone que ela publicou. */
  whatsapp: boolean
  compacto?: boolean
}) {
  const styles = estilos()
  const whatsapp = comWhatsapp ? linkDoWhatsapp(telefone) : null

  return (
    <View style={[styles.contato, compacto && styles.contatoCompacto]}>
      <Pressable
        onPress={() => Linking.openURL(`tel:${telefone.replace(/\D/g, '')}`)}
        style={({ pressed }) => [styles.botaoContato, pressed && styles.botaoContatoPressionado]}
        accessibilityRole="button"
        accessibilityLabel={`Ligar para ${telefoneFormatado(telefone)}`}
      >
        <Ionicons name="call-outline" size={15} color={paleta().cores.ink} />
        <Text style={styles.textoContato}>{telefoneFormatado(telefone)}</Text>
      </Pressable>

      {!!whatsapp && (
        <Pressable
          onPress={() => Linking.openURL(whatsapp)}
          style={({ pressed }) => [styles.botaoZap, pressed && styles.botaoZapPressionado]}
          accessibilityRole="button"
          accessibilityLabel="Abrir conversa no WhatsApp"
        >
          <Ionicons name="logo-whatsapp" size={16} color={paleta().cores.branco} />
          <Text style={styles.textoZap}>WhatsApp</Text>
        </Pressable>
      )}
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
  tela: { flex: 1, backgroundColor: t.cores.fundo },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  botaoVoltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  tituloTela: { fontSize: 17, fontWeight: '800', color: t.cores.ink },

  conteudo: { paddingHorizontal: 20, paddingBottom: 32 },

  /* ── Ficha ── */
  blocoFicha: { alignItems: 'center', paddingVertical: 18 },
  nomeFicha: {
    marginTop: 14,
    fontSize: 21,
    fontWeight: '800',
    color: t.cores.ink,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  crnFicha: { marginTop: 4, fontSize: 13, color: t.inkSuave },
  lugarFicha: { marginTop: 2, fontSize: 12.5, color: t.inkFraco },
  selo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: t.cores.verdeMenta,
  },
  textoSelo: { fontSize: 12.5, fontWeight: '700', color: t.cores.verde },

  cartaoProxima: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginTop: 4,
    marginBottom: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.cores.verdeClaro,
    backgroundColor: t.cores.verdeMenta,
  },
  cartaoProximaPressionado: { backgroundColor: t.cores.verdeClaro },
  iconeProxima: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.cores.superficie,
  },
  textoProxima: { flex: 1 },
  rotuloProxima: { fontSize: 12, fontWeight: '700', color: t.cores.verde },
  dataProxima: { marginTop: 2, fontSize: 13.5, fontWeight: '700', color: t.cores.ink },
  outrasProxima: { marginTop: 3, fontSize: 11.5, color: t.inkSuave },

  botaoAgendar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    marginTop: 4,
    borderRadius: 14,
    backgroundColor: t.cores.verde,
  },
  botaoAgendarPressionado: { backgroundColor: t.cores.verdeEscuro },
  textoAgendar: { fontSize: 14.5, fontWeight: '800', color: t.cores.branco },

  /* ── Acompanhamento ── */
  listaItens: { gap: 2 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 9,
    paddingHorizontal: 6,
    marginHorizontal: -6,
    borderRadius: 12,
  },
  itemPressionado: { backgroundColor: t.cores.superficie },
  iconeItem: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.cores.verdeMenta,
  },
  textoItem: { flex: 1 },
  rotuloItem: { fontSize: 14.5, fontWeight: '700', color: t.cores.ink },
  apoioItem: { marginTop: 2, fontSize: 12.5, lineHeight: 17, color: t.inkSuave },

  /* ── Lista ── */
  chamadaLista: { marginTop: 6, fontSize: 18, fontWeight: '800', color: t.cores.ink },
  explicacaoLista: { marginTop: 6, fontSize: 13.5, lineHeight: 20, color: t.inkSuave },
  listaCartoes: { marginTop: 16, gap: 12 },

  cartao: { borderRadius: 20, backgroundColor: t.cores.cartao, padding: 16, marginTop: 12 },
  tituloCartao: { fontSize: 15, fontWeight: '800', color: t.cores.ink, marginBottom: 10 },
  linhaCartao: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  textoCartao: { flex: 1 },
  nomeCartao: { fontSize: 15.5, fontWeight: '700', color: t.cores.ink, lineHeight: 21 },
  crnCartao: { marginTop: 2, fontSize: 12, color: t.inkSuave },
  lugarCartao: { marginTop: 1, fontSize: 11.5, color: t.inkFraco },
  cartaoPressionado: { backgroundColor: t.cores.verdeClaro },
  botaoSair: {
    alignSelf: 'center',
    marginTop: 24,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  botaoSairPressionado: { opacity: 0.6 },
  rotuloMotivo: { marginTop: 4, marginBottom: 8, fontSize: 13, color: t.inkSuave },
  campoMotivo: {
    minHeight: 76,
    padding: 12,
    borderRadius: 12,
    backgroundColor: t.cores.fundo,
    color: t.cores.ink,
    fontSize: 14,
    lineHeight: 19,
    marginBottom: 4,
  },
  textoSair: { fontSize: 13.5, fontWeight: '600', color: t.inkFraco },
  botaoConversar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    height: 48,
    borderRadius: 16,
    backgroundColor: t.cores.verdeClaro,
  },
  botaoConversarPressionado: { backgroundColor: t.cores.verdeMenta },
  textoConversar: { fontSize: 15, fontWeight: '800', color: t.cores.verde },
  jaPedido: { marginTop: 10, fontSize: 12, fontWeight: '600', color: t.inkFraco },

  /* ── Meus pedidos ── */
  blocoPedidos: {
    marginTop: 6,
    marginBottom: 22,
    padding: 14,
    borderRadius: 16,
    backgroundColor: t.cores.cartao,
    gap: 12,
  },
  tituloPedidos: { fontSize: 13, fontWeight: '800', color: t.inkSuave, letterSpacing: 0.3 },
  pedido: { gap: 4 },
  linhaPedido: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  textoPedido: { flex: 1 },
  nomePedidoLinha: { fontSize: 14.5, fontWeight: '700', color: t.cores.ink },
  estadoPedido: { marginTop: 1, fontSize: 11.5, color: t.inkFraco },
  explicacaoPedido: { marginLeft: 28, fontSize: 12, lineHeight: 17, color: t.inkSuave },
  balaoPedido: {
    marginLeft: 28,
    marginTop: 2,
    alignSelf: 'flex-start',
    maxWidth: '92%',
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 12,
    borderBottomLeftRadius: 4,
    backgroundColor: t.cores.verdeClaro,
  },
  textoBalaoPedido: { fontSize: 13, lineHeight: 18, color: t.cores.ink },
  desfazer: { fontSize: 13, fontWeight: '700', color: t.cores.verde },

  /* ── Painel de pedir contato ── */
  painel: { ...StyleSheet.absoluteFill, backgroundColor: t.cores.fundo },
  conteudoPainel: { paddingHorizontal: 20, paddingBottom: 24 },
  blocoPedido: { alignItems: 'center', paddingVertical: 16, gap: 2 },
  nomePedido: {
    marginTop: 12,
    fontSize: 20,
    fontWeight: '800',
    color: t.cores.ink,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  rotuloCampo: {
    marginTop: 22,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '700',
    color: t.inkSuave,
  },
  campoPedido: {
    minHeight: 108,
    padding: 14,
    borderRadius: 16,
    backgroundColor: t.cores.cartao,
    color: t.cores.ink,
    fontSize: 14.5,
    lineHeight: 20,
  },
  avisoPedido: { marginTop: 14, fontSize: 12.5, lineHeight: 18, color: t.inkFraco },
  /* Um pouco mais forte que o aviso de cima, e não menor: é a única linha da
     tela que diz o que a pessoa está entregando, e letra miúda de rodapé é
     exatamente o formato que se aprende a não ler. */
  avisoDados: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.cores.borda,
    fontSize: 12.5,
    lineHeight: 18,
    color: t.inkMedio,
  },
  erroPedido: { marginTop: 12, fontSize: 13, lineHeight: 19, color: t.cores.erroTexto },
  botaoPedir: {
    marginHorizontal: 20,
    marginTop: 4,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.cores.verde,
  },
  botaoPedirPressionado: { backgroundColor: t.cores.verdeEscuro },
  /* Fundo apagado, e nao `opacity`: opacidade compoe texto e fundo contra a
       pagina e destroi a razao entre os dois — medido em 1,43 num caso, com 4,5
       de minimo. `desligado` foi escolhido pela conta: branco sobre ele da 4,76. */
  botaoPedirApagado: { backgroundColor: t.cores.desligado },
  textoPedir: { fontSize: 15.5, fontWeight: '800', color: t.cores.branco },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: t.cores.superficie,
  },
  textoChip: { fontSize: 11.5, color: t.inkMedio },

  contato: { flexDirection: 'row', gap: 8, marginTop: 14 },
  contatoCompacto: { marginTop: 12 },
  botaoContato: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 42,
    borderRadius: 12,
    backgroundColor: t.cores.superficie,
  },
  botaoContatoPressionado: { backgroundColor: t.cores.trilho },
  textoContato: { fontSize: 13, fontWeight: '600', color: t.cores.ink },
  botaoZap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 42,
    borderRadius: 12,
    backgroundColor: t.cores.verde,
  },
  botaoZapPressionado: { backgroundColor: t.cores.verdeEscuro },
  textoZap: { fontSize: 13, fontWeight: '700', color: t.cores.branco },

  /* ── Vazios ── */
  vazio: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 12, gap: 8 },
  circuloVazio: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: t.cores.verdeMenta,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  tituloVazio: { fontSize: 17, fontWeight: '700', color: t.cores.ink, textAlign: 'center' },
  textoVazio: { fontSize: 13.5, lineHeight: 20, color: t.inkSuave, textAlign: 'center' },

  erro: {
    marginTop: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.erroBorda,
    backgroundColor: t.cores.erroFundo,
    padding: 14,
  },
  blocoOutras: { marginTop: 26, marginBottom: 4, gap: 5 },
  tituloOutras: { fontSize: 16, fontWeight: '800', color: t.cores.ink, letterSpacing: -0.2 },
  ajudaOutras: { fontSize: 12.5, lineHeight: 18, color: t.inkSuave },
  textoErro: { fontSize: 13, color: t.cores.erroTexto },
  }),
)
