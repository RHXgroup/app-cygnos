import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  BackHandler,
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
import { hhmm } from '../lib/diaDaNutri'
import { reais } from '../lib/financeiroDoDia'
import { tituloDoDia, diaLocalDe } from '../lib/calendarioDaAgenda'
import {
  buscarPacientes,
  fichaDoPaciente,
  idadeDe,
  type FichaDoPaciente,
  type Medida,
  type PacienteDaLista,
} from '../lib/pacientesDaNutri'
import { useDesvioDoTeclado } from '../lib/teclado'
import { RAIO_CARTAO, estilosDe, paleta } from '../lib/tema'
import { FONTE } from '../lib/fontes'
import { situacaoDoPaciente, type Selo } from '../lib/situacaoDoPaciente'
import { type PacienteEmFoco } from '../lib/auroraSobreAPaciente'
import { PlanoDaPacienteScreen } from './PlanoDaPacienteScreen'
import { DossieDaPacienteScreen, type SecaoDoDossie } from './DossieDaPacienteScreen'
import { ConstanciaDoPaciente } from '../components/ConstanciaDoPaciente'

/* A carteira dela, no bolso.
 *
 * ──────────────────── O que entra na ficha, e o que NÃO entra ────────────────────
 * Entra o que ela precisa com a pessoa na frente: quem é, quando foi a última,
 * quando é a próxima, qual plano está valendo, o que está em aberto, e se ele
 * usa o app.
 *
 * Não entra prontuário -- exame, antropometria, anamnese. Não por limitar: é
 * que os três são ENTRADA de muitos números, onde errar um dígito muda a
 * conduta, e uma tela estreita é o pior lugar possível para digitar dezoito
 * campos. Ler eles aqui viria depois; digitar continua no computador.
 *
 * ──────────────────── A busca espera ela parar de digitar ────────────────────
 * Sem isso, "Marina" manda seis consultas ao banco -- uma por letra -- e a
 * resposta da terceira pode chegar depois da sexta e sobrescrever a lista certa
 * com a de "Mar". */

/* 350 ms: acima disso a busca parece travada, abaixo ela dispara no meio da
   palavra. Medido no que dá para digitar sem pausa. */
const ESPERA_DA_BUSCA = 350

export function PacientesDaNutriScreen({
  onAurora,
}: {
  /* Só atravessa até a ficha. A lista não tem o que perguntar sobre ninguém --
     a pergunta é sobre UMA paciente, e a lista é o lugar onde ainda não se
     escolheu qual. */
  onAurora?: (foco: PacienteEmFoco) => void
} = {}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()

  const [termo, setTermo] = useState('')
  const [lista, setLista] = useState<PacienteDaLista[]>([])
  const [temMais, setTemMais] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [puxando, setPuxando] = useState(false)
  const [erro, setErro] = useState('')
  const [aberto, setAberto] = useState<number | null>(null)

  /* O voltar do aparelho fecha a FICHA antes de sair da aba. Armadilha 1: sem
     isto o botão caía no `AreaDaNutri`, que só sabe voltar para a inicial ou
     sair do app -- e quem estava lendo uma ficha era jogado para fora de tudo.
     Sem lista de dependências: é o que põe este na frente do tratador do pai a
     partir da segunda renderização. */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (aberto !== null) {
        setAberto(null)
        return true
      }
      return false
    })
    return () => sub.remove()
  })

  const [alturaDaTela, setAlturaDaTela] = useState(0)
  const respiro = useDesvioDoTeclado(bottom, alturaDaTela || undefined)

  /* Qual busca está valendo. Sem isto, a resposta de uma consulta antiga que
     demorou sobrescreve a da atual -- e a lista passa a mostrar o resultado de
     um texto que não está mais no campo. */
  const daVez = useRef(0)

  const buscar = useCallback(async (texto: string) => {
    const minha = ++daVez.current
    const r = await buscarPacientes(texto)
    if (minha !== daVez.current) return

    if (r.tipo === 'ok') {
      setErro('')
      setLista(r.pacientes)
      setTemMais(r.temMais)
    } else {
      setErro(r.mensagem)
    }
  }, [])

  useEffect(() => {
    setCarregando(true)
    const id = setTimeout(() => {
      void buscar(termo).finally(() => setCarregando(false))
    }, termo ? ESPERA_DA_BUSCA : 0)
    return () => clearTimeout(id)
  }, [termo, buscar])

  /* Ela cadastra no computador e volta ao celular -- item 8. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', e => {
      if (e === 'active') void buscar(termo)
    })
    return () => sub.remove()
  }, [buscar, termo])

  if (aberto !== null) {
    return (
      <FichaDoPacienteScreen
        id={aberto}
        onFechar={() => setAberto(null)}
        onAurora={onAurora}
      />
    )
  }

  /* Contado sobre o que ESTÁ na tela, e não sobre a carteira inteira: a lista
     tem teto, e dizer "12 sem retorno" a partir de 40 linhas quando há 218
     pessoas seria um número com cara de total. A frase ao lado diz "na lista",
     e as duas só fazem sentido juntas. */
  const semRetorno = lista.filter(
    x => situacaoDoPaciente(x, new Date()).selo === 'semRetorno',
  ).length

  return (
    <View
      style={[styles.tela, { paddingTop: top + 8 }]}
      onLayout={e => setAlturaDaTela(e.nativeEvent.layout.height)}
    >
      <View style={styles.topo}>
        <Text style={styles.titulo}>Pacientes</Text>
        {/* Diz o TAMANHO da carteira e quantos estão pendurados. Sem isto o
            título era a única coisa da tela que não informava nada -- e
            "12 sem retorno" é a única linha aqui que faz ela agir. */}
        {!carregando && lista.length > 0 && (
          <Text style={styles.subtituloDaLista}>
            {lista.length}
            {temMais ? '+' : ''} na lista
            {semRetorno > 0 ? ' · ' + semRetorno + ' sem retorno marcado' : ''}
          </Text>
        )}
      </View>

      <View style={styles.busca}>
        <Ionicons name="search" size={17} color={paleta().inkFraco} />
        <TextInput
          value={termo}
          onChangeText={setTermo}
          placeholder="Procurar pelo nome"
          placeholderTextColor={paleta().inkFraco}
          keyboardAppearance="dark"
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.campoBusca}
          accessibilityLabel="Procurar paciente pelo nome"
        />
        {termo.length > 0 && (
          <Pressable
            onPress={() => setTermo('')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Limpar a busca"
          >
            <Ionicons name="close-circle" size={17} color={paleta().inkFraco} />
          </Pressable>
        )}
      </View>

      {!!erro && <Text style={styles.erro}>{erro}</Text>}

      {carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator color={paleta().cores.verde} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.conteudo, { paddingBottom: 24 + respiro }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={puxando}
              onRefresh={() => {
                setPuxando(true)
                void buscar(termo).finally(() => setPuxando(false))
              }}
              tintColor={paleta().cores.verde}
              colors={[paleta().cores.verde]}
              progressBackgroundColor={paleta().cores.cartao}
            />
          }
        >
          {lista.length === 0 ? (
            <View style={styles.vazio}>
              <Ionicons name="people-outline" size={22} color={paleta().inkFraco} />
              <Text style={styles.textoVazio}>
                {termo
                  ? 'Nenhum paciente com esse nome.'
                  : 'Nenhum paciente ativo na sua carteira.'}
              </Text>
            </View>
          ) : (
            <View style={styles.pessoas}>
              {lista.map(p => {
                /* Calculada aqui e não lá dentro: a função recebe o relógio, e
                   chamar por linha com `new Date()` daria quarenta relógios
                   diferentes na mesma lista -- imperceptível hoje, e a raiz de
                   "por que às vezes um aparece como hoje e o de baixo não". */
                const s = situacaoDoPaciente(p, new Date())
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => setAberto(p.id)}
                    style={({ pressed }) => [styles.pessoa, pressed && styles.pressionado]}
                    accessibilityRole="button"
                    accessibilityLabel={
                      p.nome + (s.detalhe ? '. ' + s.detalhe : '') + '. ' + s.rotulo + '.'
                    }
                  >
                    <View style={[styles.avatar, corDoAvatar(s.selo)]}>
                      <Text style={[styles.textoAvatar, corDoTextoDoAvatar(s.selo)]}>
                        {iniciaisDe(p.nome)}
                      </Text>
                    </View>

                    <View style={styles.textosDaLinha}>
                      <Text style={styles.nome} numberOfLines={1}>
                        {p.nome}
                      </Text>
                      {/* O celular sai da linha e a SITUAÇÃO entra.
                          O número está na ficha, a um toque, e ele nunca
                          respondeu a pergunta que se faz olhando uma lista de
                          duzentos nomes. */}
                      {!!s.detalhe && (
                        <Text style={styles.abaixoDoNome} numberOfLines={1}>
                          {s.detalhe}
                        </Text>
                      )}
                    </View>

                    <View style={[styles.selo, corDoSelo(s.selo)]}>
                      <Text style={[styles.textoDoSelo, corDoTextoDoSelo(s.selo)]}>
                        {s.rotulo}
                      </Text>
                    </View>
                  </Pressable>
                )
              })}
            </View>
          )}

          {/* Dito por escrito porque lista que acaba sem avisar é pior do que
              lista curta: ela veria terminar no meio do alfabeto e não teria
              como desconfiar. */}
          {temMais && (
            <Text style={styles.temMais}>
              Mostrando os primeiros. Escreva o nome para achar quem falta.
            </Text>
          )}
        </ScrollView>
      )}
    </View>
  )
}

/* A ficha, exportada para a AGENDA e o PAINEL também abrirem.
 *
 * ──────────────────── Por que ela não virou arquivo próprio ────────────────────
 * Porque ela divide a folha de estilos com a lista, e mover significaria copiar
 * a folha -- duas definições do mesmo cartão, que divergem no dia em que
 * alguém ajustar o espaçamento de uma. É a armadilha 5 pelo lado do CSS, e o
 * preço de evitá-la é um import que parece estranho: uma tela importando de
 * outra.
 *
 * ──────────────────── E por que a agenda precisa dela ────────────────────
 * Ela lê "14:00 Marina Alves" e quer saber quem é a Marina -- o plano, o que
 * ficou combinado da última vez, se há conta em aberto. Sem isto, o nome na
 * agenda é um texto que não leva a lugar nenhum, e ela abre o computador. */
export function FichaDoPacienteScreen({
  id,
  onFechar,
  onAurora,
}: {
  id: number
  onFechar: () => void
  /* Abre a Aurora com ESTA paciente no contexto.
   *
   * Opcional porque a ficha é aberta de três lugares (lista, agenda, painel) e
   * quem hospeda a Aurora é a área, lá em cima -- sem o opcional, um caminho
   * que ainda não passa a função quebraria a ficha inteira em vez de ficar
   * sem um botão. */
  onAurora?: (foco: PacienteEmFoco) => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()

  const [ficha, setFicha] = useState<FichaDoPaciente | null>(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)
  /* O plano abre POR CIMA da ficha, e não numa aba: ela chegou aqui pela
     paciente, e o plano é uma coisa da paciente. Voltar tem de devolver à
     ficha, não à lista. */
  const [planoAberto, setPlanoAberto] = useState(false)
  /* Qual seção do dossiê está aberta por cima da ficha, ou nenhuma. Um estado
     só para as duas: elas nunca aparecem juntas, e dois booleanos deixariam
     existir o estado impossível de "as duas abertas". */
  const [dossie, setDossie] = useState<SecaoDoDossie | null>(null)

  const carregar = useCallback(async () => {
    const r = await fichaDoPaciente(id)
    if (r.tipo === 'ok') {
      setErro('')
      setFicha(r.ficha)
    } else {
      setErro(r.mensagem)
    }
  }, [id])

  useEffect(() => {
    setCarregando(true)
    void carregar().finally(() => setCarregando(false))
  }, [carregar])

  useEffect(() => {
    const sub = AppState.addEventListener('change', e => {
      if (e === 'active') void carregar()
    })
    return () => sub.remove()
  }, [carregar])

  const idade = idadeDe(ficha?.nascimento ?? null)

  /* O plano SUBSTITUI a ficha em vez de abrir por cima dela.
     A ficha é uma tela cheia com rolagem própria; uma folha por cima daria duas
     rolagens disputando o mesmo dedo. E o voltar de lá devolve para cá, que é o
     degrau que a pessoa espera. */
  if (planoAberto) {
    return (
      <PlanoDaPacienteScreen
        pacienteId={id}
        nome={primeiroNomeDe(ficha?.nome ?? '')}
        onFechar={() => setPlanoAberto(false)}
      />
    )
  }

  if (dossie) {
    return (
      <DossieDaPacienteScreen
        pacienteId={id}
        nome={primeiroNomeDe(ficha?.nome ?? '')}
        secao={dossie}
        onFechar={() => setDossie(null)}
      />
    )
  }

  return (
    <View style={[styles.tela, { paddingTop: top + 8 }]}>
      <View style={styles.cabecalhoDaFicha}>
        <Pressable
          onPress={onFechar}
          hitSlop={10}
          style={styles.voltar}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloDaFicha} numberOfLines={1}>
          {ficha?.nome ?? 'Ficha'}
        </Text>
        <View style={styles.voltar} />
      </View>

      {carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator color={paleta().cores.verde} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.conteudo, { paddingBottom: bottom + 28 }]}
          showsVerticalScrollIndicator={false}
        >
          {!!erro && <Text style={styles.erro}>{erro}</Text>}

          {ficha && (
            <>
              <View style={styles.cartao}>
                <Text style={styles.nomeGrande}>{ficha.nome}</Text>
                <Text style={styles.subtitulo}>
                  {[
                    idade !== null ? idade + ' anos' : null,
                    ficha.genero,
                    ficha.status !== 'ativo' ? 'Inativo' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Sem dados de cadastro'}
                </Text>

                {/* O telefone é selecionável, e não um botão de ligar: abrir o
                    discador daqui interrompe o que ela estava fazendo, e na
                    maioria das vezes ela só quer copiar para o WhatsApp. */}
                {!!ficha.celular && (
                  <Text style={styles.contato} selectable>
                    {ficha.celular}
                  </Text>
                )}
                {!!ficha.email && (
                  <Text style={styles.contato} selectable>
                    {ficha.email}
                  </Text>
                )}
              </View>

              <View style={styles.cartao}>
                <Text style={styles.rotuloDoBloco}>CONSULTAS</Text>
                <Item
                  rotulo="Próxima"
                  valor={
                    ficha.proximaConsulta
                      ? tituloDoDia(diaLocalDe(ficha.proximaConsulta)) +
                        ', ' +
                        hhmm(ficha.proximaConsulta)
                      : 'Nenhuma marcada'
                  }
                  aviso={!ficha.proximaConsulta}
                />
                <Item
                  rotulo="Última realizada"
                  valor={
                    ficha.ultimaConsulta
                      ? tituloDoDia(diaLocalDe(ficha.ultimaConsulta))
                      : 'Ainda não teve'
                  }
                />
              </View>

              {/* ──────────────────── AS MEDIDAS ────────────────────
                  Um peso sozinho não diz nada. "78,4 kg" é um número; "78,4, era
                  81,0" é a conversa que ela vai ter com a pessoa na frente. Por
                  isso a variação vem colada, e só aparece quando há com o que
                  comparar. */}
              {ficha.medidas.length > 0 && (
                <View style={styles.cartao}>
                  <Text style={styles.rotuloDoBloco}>
                    MEDIDAS · {rotuloDaData(ficha.medidas[0].quando)}
                  </Text>
                  <View style={styles.numeros}>
                    <Numero
                      rotulo="Peso"
                      valor={ficha.medidas[0].peso}
                      unidade=" kg"
                      antes={ficha.medidas[1]?.peso ?? null}
                    />
                    <Numero rotulo="IMC" valor={ficha.medidas[0].imc} antes={ficha.medidas[1]?.imc ?? null} />
                    <Numero
                      rotulo="Cintura"
                      valor={ficha.medidas[0].cintura}
                      unidade=" cm"
                      antes={ficha.medidas[1]?.cintura ?? null}
                    />
                    <Numero
                      rotulo="Gordura"
                      valor={ficha.medidas[0].gordura}
                      unidade="%"
                      antes={ficha.medidas[1]?.gordura ?? null}
                    />
                  </View>
                  {ficha.medidas.length > 1 && (
                    <Text style={styles.comparadoCom}>
                      Comparação com a avaliação de {rotuloDaData(ficha.medidas[1].quando)}
                    </Text>
                  )}
                </View>
              )}

              <View style={styles.cartao}>
                <Text style={styles.rotuloDoBloco}>ACOMPANHAMENTO</Text>
                {/* Linha TOCÁVEL, e não texto. O relato foi este: "não consigo
                    clicar pra ver nada aqui". A ficha dizia o NOME do plano, que
                    é a única coisa sobre o plano que não interessa quando a
                    paciente está na frente perguntando o que pode comer.

                    Abre mesmo sem plano ativo: a tela de lá sabe dizer que não
                    há, e some com a dúvida de "será que não carregou?". */}
                <Item
                  rotulo="Plano alimentar ativo"
                  valor={ficha.planoAtivo ?? 'Nenhum plano ativo'}
                  aviso={!ficha.planoAtivo}
                  onAbrir={() => setPlanoAberto(true)}
                />
                <Item
                  rotulo="Plano terapêutico"
                  valor={
                    ficha.planoTerapeutico
                      /* Parênteses, e não o `·`.
                         "Introdução alimentar · em andamento" se lê como duas
                         coisas emendadas, e o Helton leu o ponto como um
                         sublinhado. O título é o NOME do plano e o resto é o
                         ESTADO dele -- o parêntese diz isso sem precisar de
                         legenda. */
                      ? ficha.planoTerapeutico.titulo + ' (' + ficha.planoTerapeutico.status + ')'
                      : 'Nenhum'
                  }
                  aviso={!ficha.planoTerapeutico}
                  onAbrir={() => setDossie('terapeutico')}
                />
                <Item
                  rotulo="Consultas realizadas"
                  valor={String(ficha.quantasConsultas)}
                  onAbrir={() => setDossie('consultas')}
                />
                <Item rotulo="Usa o aplicativo" valor={ficha.usaOApp ? 'Sim' : 'Não'} />
                {/* A constância logo abaixo do "Sim": é a pergunta seguinte --
                    usa, mas está registrando? Só para quem usa: para quem não
                    usa, o "Não" de cima já diz tudo, e a linha repetiria.
                    Carregando ou falhou, ela não desenha nada (ver o componente). */}
                {ficha.usaOApp && (
                  <View style={styles.constancia}>
                    <ConstanciaDoPaciente pacienteId={id} />
                  </View>
                )}
              </View>

              {/* ──────────────────── O PRONTUÁRIO ────────────────────
                  "A ficha completa: anamnese, exames, energético, medidas." Tudo
                  para LER -- digitar continua no computador. Cada linha abre a
                  seção por cima da ficha, e o voltar devolve para cá.

                  O resumo da Aurora vem primeiro: é a leitura da ficha INTEIRA, e
                  quem tem dois minutos antes da consulta começa por ele. É o
                  mesmo resumo da aba Aurora do sistema. */}
              <View style={styles.cartao}>
                <Text style={styles.rotuloDoBloco}>PRONTUÁRIO</Text>
                <Item rotulo="Resumo da Aurora" valor="Abrir" onAbrir={() => setDossie('resumo')} />
                <Item
                  rotulo="Anamnese"
                  valor={ficha.ultimaAnamnese ? rotuloDaData(ficha.ultimaAnamnese) : 'Nenhuma'}
                  aviso={!ficha.ultimaAnamnese}
                  onAbrir={() => setDossie('anamnese')}
                />
                <Item rotulo="Exames" valor="Abrir" onAbrir={() => setDossie('exames')} />
                <Item rotulo="Gasto energético" valor="Abrir" onAbrir={() => setDossie('energetico')} />
                <Item
                  rotulo="Evolução das medidas"
                  valor={ficha.medidas.length ? 'Abrir' : 'Sem avaliação'}
                  aviso={!ficha.medidas.length}
                  onAbrir={() => setDossie('evolucao')}
                />
              </View>

              {/* ──────────────────── ONDE A GENTE PAROU ────────────────────
                  A observação da última consulta é o motivo pelo qual a maioria
                  das fichas é aberta -- e é texto que ELA escreveu, então vai
                  inteiro e selecionável, sem cortar em três linhas. */}
              {!!ficha.notasDaUltima && (
                <View style={styles.cartao}>
                  <Text style={styles.rotuloDoBloco}>DA ÚLTIMA CONSULTA</Text>
                  <Text style={styles.notas} selectable>
                    {ficha.notasDaUltima}
                  </Text>
                </View>
              )}

              {/* O financeiro só aparece quando HÁ algo em aberto. Zero aqui não
                  é resposta: a política de `contas_receber` exige permissão de
                  financeiro, e quem não a tem recebe zero linha SEM erro --
                  idêntico a "não deve nada". Item 6. */}
              {ficha.quantasEmAberto > 0 && (
                <View style={styles.cartao}>
                  <Text style={styles.rotuloDoBloco}>EM ABERTO</Text>
                  <Item
                    rotulo={
                      ficha.quantasEmAberto === 1
                        ? '1 conta a receber'
                        : ficha.quantasEmAberto + ' contas a receber'
                    }
                    valor={reais(ficha.emAberto)}
                  />
                </View>
              )}

              {/* —————————— PERGUNTAR SOBRE ELA ——————————
                  "A Aurora tinha que abrir aqui, se eu quiser gerar o mesmo
                  resumo que eu gero pelo sistema."

                  Aberta pelo botão da barra, a Aurora não sabe de quem se está
                  falando -- e ela teria de digitar o nome de quem está na tela
                  na frente dela.

                  No FIM da ficha, e não no alto: quem abre a ficha vem ler o
                  que está nela. A pergunta é o que sobra depois de ler. */}
              {!!onAurora && (
                <Pressable
                  onPress={() => onAurora({ pacienteId: id, nome: ficha.nome })}
                  style={({ pressed }) => [styles.perguntar, pressed && { opacity: 0.8 }]}
                  accessibilityRole="button"
                  accessibilityLabel={'Perguntar à Aurora sobre ' + primeiroNomeDe(ficha.nome)}
                >
                  <Ionicons name="sparkles" size={17} color={paleta().cores.sobreLimao} />
                  <Text style={styles.textoPerguntar}>
                    Perguntar sobre {primeiroNomeDe(ficha.nome)}
                  </Text>
                </Pressable>
              )}

              {/* Dito por escrito porque não poder editar daqui é decisão, e
                  não tela pela metade. */}
              <Text style={styles.rodape}>
                Anamnese, exames e medidas se leem aqui e se preenchem no sistema,
                no computador: são muitos números para digitar numa tela estreita,
                e um dígito errado ali muda a conduta.
              </Text>
            </>
          )}
        </ScrollView>
      )}
    </View>
  )
}

/* Um número com a variação desde a avaliação anterior.
 *
 * A seta diz o SENTIDO e nada mais -- sem verde de "bom" e vermelho de "ruim".
 * Quem está em ganho de massa sobe de propósito, e pintar isso de vermelho
 * seria o app dando conduta. Quem interpreta é ela. */
function Numero({
  rotulo,
  valor,
  antes,
  unidade = '',
}: {
  rotulo: string
  valor: number | null
  antes?: number | null
  unidade?: string
}) {
  const styles = estilos()
  /* Null vira traço, e nunca zero: a base não tem todo campo de toda avaliação,
     e um zero ali somaria como verdade. Item 6. */
  if (valor === null) {
    return (
      <View style={styles.numero}>
        <Text style={styles.valorNumero}>·</Text>
        <Text style={styles.rotuloNumero}>{rotulo}</Text>
      </View>
    )
  }

  const delta = antes === null || antes === undefined ? null : valor - antes
  /* Meio dígito de folga: uma diferença de 40 gramas entre duas balanças não é
     evolução, e mostrar "↑ 0,0" é ruído que ensina a ignorar a seta. */
  const mudou = delta !== null && Math.abs(delta) >= 0.05

  return (
    <View style={styles.numero}>
      <Text style={styles.valorNumero}>
        {String(Math.round(valor * 10) / 10).replace('.', ',')}
        {unidade}
      </Text>
      {mudou && delta !== null && (
        <Text style={styles.delta}>
          {delta > 0 ? '↑' : '↓'}{' '}
          {String(Math.abs(Math.round(delta * 10) / 10)).replace('.', ',')}
        </Text>
      )}
      <Text style={styles.rotuloNumero}>{rotulo}</Text>
    </View>
  )
}

/* "12/08/2026" a partir de 'AAAA-MM-DD' ou de um instante.
   Sem passar por `Date` quando já é data pura: lida como UTC, ela vira o dia
   anterior no Brasil -- e a ficha mostraria a avaliação um dia antes. */
function rotuloDaData(valor: string): string {
  const so = valor.slice(0, 10)
  const m = so.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? m[3] + '/' + m[2] + '/' + m[1] : valor
}

function Item({
  rotulo,
  valor,
  aviso = false,
  onAbrir,
}: {
  rotulo: string
  valor: string
  aviso?: boolean
  /* Quando existe, a linha vira botão e ganha a seta. Sem ele continua sendo
     texto -- e é isso que impede a ficha inteira de PARECER tocável quando
     metade dela não leva a lugar nenhum: uma seta que não abre nada ensina em
     dez segundos a não tentar mais. */
  onAbrir?: () => void
}) {
  const styles = estilos()

  const conteudo = (
    <>
      <Text style={styles.rotuloDoItem}>{rotulo}</Text>
      <Text style={[styles.valorDoItem, aviso && styles.valorAusente]} numberOfLines={2}>
        {valor}
      </Text>
      {!!onAbrir && (
        <Ionicons name="chevron-forward" size={15} color={paleta().inkFraco} />
      )}
    </>
  )

  if (!onAbrir) return <View style={styles.item}>{conteudo}</View>

  return (
    <Pressable
      onPress={onAbrir}
      style={({ pressed }) => [styles.item, pressed && styles.pressionado]}
      accessibilityRole="button"
      accessibilityLabel={`${rotulo}: ${valor}. Toque para abrir.`}
    >
      {conteudo}
    </Pressable>
  )
}

/* ──────────────────── A COR DO SELO, num lugar só ────────────────────
 *
 * Quatro funções e não um `Record`: `CORES[selo]` devolve `undefined` para
 * qualquer valor fora dos cinco, e a linha seguinte lê `.backgroundColor` dele
 * -- a tela inteira morre por causa de um selo novo. É o item 10 do AGENTS.md,
 * e a forma que ele manda usar é esta: função com genérico de reserva.
 *
 * O genérico é o CINZA, e isso é escolha: um selo que o app não conhece não
 * pode sair verde dizendo "em dia" nem dourado dizendo "olhe aqui". Cinza é o
 * único tom que não afirma nada. */
function corDoAvatar(selo: Selo) {
  const t = paleta()
  if (selo === 'hoje') return { backgroundColor: t.cores.atencaoFundo }
  if (selo === 'emDia') return { backgroundColor: t.cores.verdeMenta }
  return { backgroundColor: t.cores.trilho }
}
function corDoTextoDoAvatar(selo: Selo) {
  const t = paleta()
  if (selo === 'hoje') return { color: t.cores.gold }
  if (selo === 'emDia') return { color: t.cores.verde }
  return { color: t.inkSuave }
}
function corDoSelo(selo: Selo) {
  const t = paleta()
  if (selo === 'hoje') return { backgroundColor: t.cores.atencaoFundo }
  if (selo === 'emDia') return { backgroundColor: t.cores.verdeMenta }
  return { backgroundColor: t.cores.trilho }
}
function corDoTextoDoSelo(selo: Selo) {
  const t = paleta()
  if (selo === 'hoje') return { color: t.cores.gold }
  if (selo === 'emDia') return { color: t.cores.verde }
  return { color: t.inkSuave }
}

/* Só o primeiro nome, para "Plano de Maria Aparecida da Silva Santos" não
   estourar o cabeçalho da tela. */
function primeiroNomeDe(nome: string): string {
  return nome.trim().split(/\s+/)[0] || 'paciente'
}

/* "MA" de Maria Alves: o primeiro e o ÚLTIMO nome. As duas primeiras letras do
   primeiro nome dariam "MA" para Maria Alves e Maria Andrade, e numa carteira
   cheia de Marias o círculo deixaria de distinguir qualquer coisa. */
function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  const primeira = partes[0]?.[0] ?? ''
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : ''
  return (primeira + ultima).toUpperCase()
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.cores.fundo },
    centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    topo: { paddingHorizontal: 16, paddingBottom: 12 },
    titulo: {
      fontFamily: FONTE.bruta,
      fontSize: 29,
      color: t.cores.ink,
      letterSpacing: -1,
      lineHeight: 32,
    },
    subtituloDaLista: { fontFamily: FONTE.normal, fontSize: 13, color: t.inkFraco, marginTop: 3 },

    busca: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      marginHorizontal: 16,
      marginBottom: 10,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: 13,
      backgroundColor: t.cores.superficie,
      borderWidth: 1,
      borderColor: t.cores.borda,
    },
    campoBusca: { flex: 1, fontFamily: FONTE.normal, fontSize: 15, color: t.cores.ink, padding: 0 },

    erro: {
      marginHorizontal: 16,
      marginBottom: 8,
      fontSize: 13.5,
      color: t.cores.ink,
      backgroundColor: t.cores.verdeMenta,
      padding: 12,
      borderRadius: 10,
    },

    conteudo: { paddingHorizontal: 16, gap: 12 },

    /* ──────────────────── UM CARTÃO POR PESSOA, e não um cartão com linhas dentro ────────────────────
       Era uma caixa só com divisões -- e uma caixa de duzentos nomes é uma
       parede. Cada pessoa com a própria borda e o próprio respiro vira um
       objeto que dá para mirar com o dedo, e a lista passa a ter ritmo em vez
       de ter linhas. */
    pessoas: { gap: 7 },
    pessoa: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderRadius: 15,
      paddingHorizontal: 13,
      paddingVertical: 11,
    },
    /* Quadrado de canto redondo, e não círculo. Nenhum destes pacientes tem
       foto no app da nutricionista, então o que está ali é SEMPRE letra -- e
       círculo com letra dentro promete uma foto que nunca vem. */
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    textoAvatar: { fontFamily: FONTE.forte, fontSize: 13.5, letterSpacing: 0.2 },
    textosDaLinha: { flex: 1, minWidth: 0 },
    nome: { fontFamily: FONTE.meia, fontSize: 15, color: t.cores.ink, letterSpacing: -0.25 },
    abaixoDoNome: { fontFamily: FONTE.normal, fontSize: 12.5, color: t.inkFraco, marginTop: 1 },
    /* `overflow: 'hidden'` junto do raio: sem ele, no Android o fundo escapa
       pelos cantos da pastilha e ela sai com quina. */
    selo: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, overflow: 'hidden' },
    textoDoSelo: { fontFamily: FONTE.forte, fontSize: 10.5, letterSpacing: 0.1 },
    temMais: { fontFamily: FONTE.normal, fontSize: 12, color: t.inkFraco, textAlign: 'center', paddingTop: 4 },

    vazio: {
      alignItems: 'center',
      gap: 8,
      paddingVertical: 40,
      backgroundColor: t.cores.cartao,
      borderRadius: RAIO_CARTAO,
    },
    textoVazio: { fontSize: 14, color: t.inkSuave, textAlign: 'center', paddingHorizontal: 24 },

    cabecalhoDaFicha: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingBottom: 8,
    },
    voltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    tituloDaFicha: { flex: 1, fontFamily: FONTE.forte, fontSize: 17, color: t.cores.ink, textAlign: 'center' },

    cartao: {
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderRadius: 16,
      padding: 16,
      gap: 3,
    },
    /* 24, e o nome é a única coisa grande da ficha. Era 20, do tamanho de um
       subtítulo -- e a ficha abre para responder "quem é essa pessoa". */
    nomeGrande: { fontFamily: FONTE.bruta, fontSize: 24, color: t.cores.ink, letterSpacing: -0.8 },
    subtitulo: { fontFamily: FONTE.normal, fontSize: 13.5, color: t.inkSuave },
    contato: { fontFamily: FONTE.media, fontSize: 14, color: t.cores.verde, marginTop: 6 },

    /* O mesmo corte do resto da área: sai a maiúscula espaçada. */
    rotuloDoBloco: {
      fontFamily: FONTE.meia,
      fontSize: 12.5,
      color: t.inkFraco,
      paddingBottom: 6,
    },
    item: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 7 },
    rotuloDoItem: { flex: 1, fontFamily: FONTE.normal, fontSize: 13.5, color: t.inkSuave },
    valorDoItem: { flex: 1.3, fontFamily: FONTE.meia, fontSize: 14, color: t.cores.ink, textAlign: 'right' },
    /* Ausência em tom apagado, e não em vermelho: não ter plano ativo não é
       erro, é um fato que ela pode querer resolver. */
    valorAusente: { color: t.inkFraco },

    numeros: { flexDirection: 'row', gap: 8, paddingTop: 2 },
    numero: { flex: 1, alignItems: 'center', gap: 1 },
    valorNumero: {
      fontFamily: FONTE.forte,
      fontSize: 18,
      color: t.cores.ink,
      letterSpacing: -0.5,
      fontVariant: ['tabular-nums'],
    },
    /* A seta em tom neutro, e não em verde ou vermelho: ela diz o sentido, e
       quem julga se é bom é a nutricionista. */
    delta: { fontFamily: FONTE.meia, fontSize: 11, color: t.inkSuave },
    rotuloNumero: { fontFamily: FONTE.normal, fontSize: 10.5, color: t.inkFraco, textAlign: 'center', marginTop: 1 },
    comparadoCom: { fontFamily: FONTE.normal, fontSize: 11, color: t.inkFraco, paddingTop: 10 },

    notas: { fontFamily: FONTE.normal, fontSize: 14, color: t.cores.ink, lineHeight: 21 },

    /* O botão da Aurora usa o limão e não o verde: é a cor DELA na barra de
       baixo, e é o que faz a pessoa reconhecer que este botão leva ao mesmo
       lugar que o círculo levantado. Cor nova aqui inventaria uma quarta ação. */
    perguntar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 13,
      borderRadius: 14,
      backgroundColor: t.cores.limao,
    },
    textoPerguntar: { fontFamily: FONTE.forte, fontSize: 14.5, color: t.cores.sobreLimao },

    constancia: { paddingTop: 2, paddingBottom: 4 },
    rodape: { fontSize: 12, color: t.inkFraco, lineHeight: 18, paddingHorizontal: 4, paddingTop: 4 },
    pressionado: { opacity: 0.7 },
  }),
)
