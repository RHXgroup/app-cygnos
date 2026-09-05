import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import {
  ActivityIndicator,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Confirmacao } from '../components/Confirmacao'
import { ModoTreino } from '../components/ModoTreino'
import { RotinaPorIA } from '../components/RotinaPorIA'
import { AdaptarExercicio } from '../components/AdaptarExercicio'
import { carregarCalculoAtivo } from '../lib/energia'
import { carregarNoites, tempoDormindo } from '../lib/sono'
import { prontidaoDeHoje, SEM_PRONTIDAO, type Prontidao } from '../lib/prontidaoDeHoje'
import { carregarPeso } from '../lib/peso'
import {
  apagarFotoDoDiario,
  enderecoNoDiario,
  escolherFoto,
  guardarFotoDoDiario,
} from '../lib/fotoDoDiario'
import {
  NOME_DO_ESFORCO,
  adicionarExercicio,
  apagarExercicio,
  editarExercicio,
  salvarCarga,
  salvarDescanso,
  trocarPorAdaptado,
  apagarSessao,
  carregarRotina,
  carregarSessoes,
  refinarSessao,
  registrarSessao,
  sequencia,
  sessoesNaSemana,
  type Exercicio,
  type Sessao,
  nomeDoEsforco,
} from '../lib/treino'
import { DIAS_CURTOS, DIAS_LONGOS, dataNumerica } from '../lib/formatar'
import type { DiaSemana } from '../lib/plano'
import { dataISO } from '../lib/formatar'
import { estilosDe, paleta } from '../lib/tema'
import { Botao } from '../components/Botao'

/* Treino.
 *
 * Duas coisas que parecem uma: a ROTINA é o que se pretende fazer em cada dia
 * da semana e quase não muda; a SESSÃO é o que aconteceu hoje, e é o que se
 * registra. Misturá-las numa tela só faria a pessoa editar a rotina quando
 * queria anotar o treino de hoje.
 *
 * ── O que o registro pede, e o que ele não pede ────────────────────────────
 * Tempo e esforço, e nada mais. Este é um app de nutrição: o que a nutricionista
 * faz com treino é estimar gasto e ver constância. Pedir série, repetição e
 * carga a cada sessão transformaria trinta segundos de registro em três
 * minutos, e ninguém registra por três minutos, todo dia. Isso mora na rotina,
 * onde serve de lembrete. */

type Aba = 'hoje' | 'rotina'

export function TreinoScreen({
  contaId,
  onFechar,
  onMudou,
}: {
  contaId: string
  onFechar: () => void
  onMudou: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const [aba, setAba] = useState<Aba>('hoje')
  const [sessoes, setSessoes] = useState<Sessao[]>([])
  const [rotina, setRotina] = useState<Exercicio[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [mudou, setMudou] = useState(false)
  const [apagandoSessao, setApagandoSessao] = useState<Sessao | null>(null)
  const [iaAberta, setIaAberta] = useState(false)
  /* Quanto o cronômetro mediu. Vira sugestão de duração no registro. */
  const [minutosMedidos, setMinutosMedidos] = useState(0)
  const [modoAberto, setModoAberto] = useState(false)

  /* O que está montado para HOJE, na ordem. É o que o modo treino conduz — e é
     por isso que ele não pergunta nada antes de começar: o dia da semana já
     responde qual treino é. */
  const doHoje = rotina
    .filter(e => e.dia === (new Date().getDay() as DiaSemana))
    .sort((a, b) => a.ordem - b.ordem)
  /* ── O PRÓXIMO dia com treino montado ──────────────────────────────────
   *
   * A tela dizia "Sem treino montado para hoje" e parava aí. Quem tinha uma
   * rotina inteira montada — em quatro dias da semana — lia isso como "a rotina
   * não entrou", porque a única evidência da rotina estava na OUTRA aba, e nada
   * dizia para ir lá.
   *
   * Foi exatamente o que aconteceu: a IA montou e pôs no sábado, e a tela de
   * quarta-feira não deu nenhum sinal de que existia sábado.
   *
   * Procura a partir de amanhã e dá a volta na semana. `undefined` quando não
   * há rotina nenhuma — aí a frase continua sendo a de sempre, porque aí não
   * ter treino hoje é a verdade inteira. */
  /* Em que dia a aba "Minha rotina" abre.
   *
   * Nulo quer dizer "hoje", que é o padrão de quem entra ali para mexer. Vira
   * um dia quando a pessoa chega pelo atalho do próximo treino: quem tocou em
   * "o próximo é sábado" quer VER sábado, e abrir na quarta seria devolver a
   * mesma pergunta. */
  const [diaDaRotina, setDiaDaRotina] = useState<DiaSemana | null>(null)

  const proximoDia = (() => {
    if (rotina.length === 0) return undefined
    const hoje = new Date().getDay()
    for (let i = 1; i <= 7; i++) {
      const d = ((hoje + i) % 7) as DiaSemana
      if (rotina.some(e => e.dia === d)) return d
    }
    return undefined
  })()

  /* O que a IA precisa saber da pessoa. Vem do cálculo energético e do último
     peso do diário — o mesmo par que a sugestão de plano usa, e pelo mesmo
     motivo: o peso do cálculo pode ser de meses atrás. Nulo é aceitável; a
     função do servidor monta rotina sem isso, só monta pior. */
  /* COMO O CORPO DELA CHEGOU HOJE.
   *
   * A análise comparativa dos três melhores aplicativos de treino do mercado
   * (Strong, Hevy, Fitbod) diz, sobre os três juntos: "nenhum deles lê sono,
   * HRV ou dados de recuperação para ajustar o treino de hoje".
   *
   * Este app tem o sono. É a mesma vantagem de sempre — os dados moram juntos —
   * e esta é a tela em que ela aparece. */
  const [prontidao, setProntidao] = useState<Prontidao>(SEM_PRONTIDAO)

  const [corpo, setCorpo] = useState<{
    idade: number | null
    genero: string | null
    pesoKg: number | null
  }>({ idade: null, genero: null, pesoKg: null })

  useEffect(() => {
    let vivo = true
    Promise.all([
      carregarSessoes(contaId),
      carregarRotina(contaId),
      carregarCalculoAtivo(contaId),
      carregarPeso(contaId),
      carregarNoites(contaId),
    ]).then(([rS, rR, rC, rP, rN]) => {
      if (!vivo) return
      /* Falha aqui não atrapalha a tela: sem peso e idade a rotina sai mais
         genérica, e é só isso. Por isso nada de `setErro` neste trecho. */
      const calculo = rC?.tipo === 'ok' ? rC.calculo : null
      const registros = rP?.tipo === 'ok' ? rP.peso.registros : []
      const ultimo =
        registros.length > 0 ? registros.reduce((a, b) => (a.data >= b.data ? a : b)).kg : null
      setCorpo({
        idade: calculo?.idade ?? null,
        genero: calculo?.sexo ?? null,
        pesoKg: ultimo ?? calculo?.peso ?? null,
      })
      if (rS.tipo === 'erro') setErro(rS.mensagem)
      else {
        setErro('')
        setSessoes(rS.sessoes)
      }
      if (rR.tipo === 'ok') setRotina(rR.exercicios)
      /* Falha no sono não atrapalha a tela: sem noite, a prontidão fica vazia e
         a tela simplesmente não diz nada sobre disposição. Item 11 do
         AGENTS.md. */
      if (rN?.tipo === 'ok') {
        setProntidao(
          prontidaoDeHoje(
            rN.noites.map(n => ({
              data: n.data,
              /* `tempoDormindo` e não a diferença crua entre deitar e levantar:
                 a latência já está descontada lá, e é o tempo DORMINDO que a
                 disposição de hoje depende. */
              minutos: tempoDormindo(n),
              qualidade: n.qualidade,
            })),
            dataISO(new Date()),
          ),
        )
      }
      setCarregando(false)
    })
    return () => {
      vivo = false
    }
  }, [contaId])

  /* A camada aberta DENTRO da aba Rotina, se houver — hoje o editor de um
   * exercício, amanhã o que vier.
   *
   * Um ref e não um estado, e um ref do PAI passado para o filho, e isso tem
   * motivo. O AGENTS.md manda registrar o tratador no filho sem lista de
   * dependências para ele ganhar do central; a receita não serve aqui, porque
   * o tratador desta tela TAMBÉM re-registra a cada renderização. Os efeitos do
   * filho rodam antes dos do pai, então o pai sempre registra por último — e,
   * como o React Native chama na ordem inversa, o pai sempre ganharia.
   *
   * Sem isto, o voltar do aparelho fechava a tela de treino inteira com a
   * correção em andamento, que é o gesto que mais se usa para "cancelar". */
  const camadaDaRotina = useRef<(() => void) | null>(null)

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      /* Descasca uma camada por vez, de dentro para fora. */
      if (camadaDaRotina.current) {
        camadaDaRotina.current()
        return true
      }
      if (iaAberta) {
        setIaAberta(false)
        return true
      }
      /* A ABA é um degrau, e faltava.
         Quem entrava em "Minha rotina" e apertava voltar era jogado para fora
         da tela inteira, de volta ao Corpo — quando o esperado é voltar ao
         treino de hoje, que é de onde se veio. É o mesmo defeito que a tela de
         cadastros teve, e a armadilha 1 diz exatamente isto: descascar UMA
         camada por vez. */
      if (aba === 'rotina') {
        setAba('hoje')
        return true
      }
      fechar()
      return true
    })
    return () => sub.remove()
  })

  function fechar() {
    if (mudou) onMudou()
    onFechar()
  }

  async function apagar(s: Sessao) {
    setApagandoSessao(null)
    setSessoes(atuais => atuais.filter(x => x.id !== s.id))

    const falha = await apagarSessao(s.id)
    if (falha) {
      setSessoes(atuais => [...atuais, s].sort((a, b) => b.data.localeCompare(a.data)))
      setErro(falha.erro)
      return
    }
    setMudou(true)
  }

  /* O que a tela DIZ na primeira dobra. Calculado aqui, e não dentro do JSX:
     é a resposta às três perguntas de quem chega na academia — é dia de quê,
     quanto tem para fazer, e como eu vou. */
  const treinouHoje = sessoes.some(s => s.data === dataISO(new Date()))
  /* O "foco" do dia sai do primeiro exercício quando a rotina não tem nome de
     bloco. É melhor do que "6 exercícios": "Supino reto e mais 5" diz de que
     treino se trata sem a pessoa abrir nada. */
  const focoDeHoje =
    doHoje.length === 0
      ? ''
      : doHoje.length === 1
        ? doHoje[0].nome
        : `${doHoje[0].nome} e mais ${doHoje.length - 1}`

  const naSemana = sessoesNaSemana(sessoes)
  const seguidos = sequencia(sessoes)

  return (
    <KeyboardAvoidingView
      style={[styles.tela, { paddingTop: top + 8 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.cabecalho}>
        <Pressable
          onPress={() => (aba === 'rotina' ? setAba('hoje') : fechar())}
          style={styles.botaoVoltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela}>{aba === 'hoje' ? 'Treino' : 'Minha rotina'}</Text>
        <View style={styles.botaoVoltar} />
      </View>


      <ScrollView
        contentContainerStyle={[styles.conteudo, { paddingBottom: bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {carregando ? (
          <ActivityIndicator color={paleta().cores.verde} style={styles.girando} />
        ) : aba === 'hoje' ? (
          <>
            {/* A tela DIZ o que é hoje, em vez de perguntar em qual aba entrar.
                Era esse o problema: rotina numa aba, registro noutra, e a
                pessoa tinha de saber onde procurar antes de saber o que fazer.

                Aqui a primeira dobra responde as três perguntas de quem chega
                na academia: é dia de quê, quanto tem para fazer, e como eu vou. */}
            <View style={styles.hoje}>
              <Text style={styles.rotuloHoje}>
                {DIAS_LONGOS[new Date().getDay() as DiaSemana]}
              </Text>
              <Text style={styles.tituloHoje}>
                {treinouHoje
                  ? 'Você já treinou hoje'
                  : doHoje.length > 0
                    ? focoDeHoje || `${doHoje.length} ${doHoje.length === 1 ? 'exercício' : 'exercícios'}`
                    : proximoDia !== undefined
                      ? 'Nada para hoje'
                      : 'Sem treino montado para hoje'}
              </Text>

              {/* DIZER onde está não basta: tem de LEVAR.
                  A tela informava "o próximo é sábado" e parava aí, e o único
                  caminho até lá passava por "Montar na mão" — que é o nome
                  errado para "ver a minha semana", e por isso ninguém tentava.
                  Agora a própria frase é o caminho. */}
              {!treinouHoje && doHoje.length === 0 && proximoDia !== undefined && (
                <Pressable
                  onPress={() => {
                    setDiaDaRotina(proximoDia)
                    setAba('rotina')
                  }}
                  style={({ pressed }) => [styles.atalhoProximo, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Ver o treino de ${DIAS_LONGOS[proximoDia]}`}
                >
                  <Ionicons name="calendar-outline" size={15} color={paleta().cores.verdeEscuro} />
                  <Text style={styles.textoAtalhoProximo}>
                    Ver o treino de {DIAS_LONGOS[proximoDia].toLowerCase()}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={paleta().cores.verdeEscuro} />
                </Pressable>
              )}
              <Text style={styles.subHoje}>
                {naSemana === 0
                  ? 'Nenhum treino nos últimos 7 dias'
                  : `${naSemana} ${naSemana === 1 ? 'treino' : 'treinos'} nos últimos 7 dias` +
                    (seguidos > 1 ? ` · ${seguidos} dias seguidos` : '')}
              </Text>
            </View>

            {/* COMO VOCE CHEGOU HOJE.
                Entre o cabecalho e o botao de comecar, que e onde ela decide.
                Depois do botao seria tarde; antes do titulo seria antes de ela
                saber que dia e.

                E SUGESTAO, nunca ordem -- ver `prontidaoDeHoje`. O app mede
                uma noite, e nao o corpo: quem dormiu mal por causa de filho
                doente pode estar otimo, e quem dormiu oito horas pode estar
                gripado. Uma ordem ignorada uma vez vira ruido para sempre. */}
            {prontidao.frase !== null && (
              <View
                style={[
                  styles.prontidao,
                  prontidao.nivel === 'baixa' && styles.prontidaoBaixa,
                ]}
              >
                {/* `sem_hoje` e a noite que ela nao anotou: o app diz a media
                    e nenhum conselho. Icone de interrogacao, e nao de lua: lua
                    diria que ele sabe como ela dormiu, e ele nao sabe. */}
                <Ionicons
                  name={
                    prontidao.nivel === 'boa'
                      ? 'sunny-outline'
                      : prontidao.nivel === 'sem_hoje'
                        ? 'help-circle-outline'
                        : 'moon-outline'
                  }
                  size={17}
                  color={prontidao.nivel === 'boa' ? paleta().cores.verde : paleta().inkMedio}
                />
                <Text style={styles.textoProntidao}>{prontidao.frase}</Text>
              </View>
            )}

            {/* O modo treino vem antes do registro porque é o que se usa
                DURANTE; registrar é o que se faz no fim. E o tempo que ele mede
                preenche a duração sozinho — a pergunta "quanto tempo" sempre
                teve resposta chutada, porque ninguém cronometra o próprio
                treino.

                Botão grande e sozinho: é o primeiro toque de quem chegou na
                academia, e ele tem de estar onde o polegar já está. */}
            <Pressable
              onPress={() => setModoAberto(true)}
              style={({ pressed }) => [styles.botaoModo, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
              accessibilityLabel="Abrir o modo treino"
            >
              <Ionicons name="play" size={20} color={paleta().cores.branco} />
              <View style={styles.textoModo}>
                <Text style={styles.tituloModo}>
                  {doHoje.length > 0 ? 'Começar o treino' : 'Treinar mesmo assim'}
                </Text>
                <Text style={styles.subModo}>
                  {doHoje.length > 0
                    ? 'O descanso conta sozinho e avisa'
                    : 'Sem rotina montada, só o cronômetro'}
                </Text>
              </View>
            </Pressable>

            {/* O treino de hoje, à vista. Antes ele morava na outra aba, e quem
                chegava na academia tinha de trocar de aba para lembrar o que ia
                fazer — depois voltar para começar. */}
            {doHoje.length > 0 && (
              <View style={styles.listaHoje}>
                {doHoje.map((e, i) => (
                  <View key={e.id} style={styles.linhaHoje}>
                    <Text style={styles.ordemHoje}>{i + 1}</Text>
                    <View style={styles.textoSessao}>
                      <Text style={styles.nomeSessao} numberOfLines={1}>
                        {e.nome}
                      </Text>
                      <Text style={styles.detalheSessao}>{descreverExercicio(e)}</Text>
                    </View>
                  </View>
                ))}
                <Pressable
                  onPress={() => setAba('rotina')}
                  style={styles.linkRotina}
                  accessibilityRole="button"
                >
                  <Text style={styles.textoLink}>Mexer na minha rotina</Text>
                  <Ionicons name="chevron-forward" size={15} color={paleta().cores.verde} />
                </Pressable>
              </View>
            )}

            {/* Sem rotina, o caminho de sair disso vem inteiro e à vista — foi
                a queixa de não achar onde a IA monta o treino. */}
            {doHoje.length === 0 && (
              <View style={styles.semRotina}>
                <Pressable
                  onPress={() => setIaAberta(true)}
                  style={({ pressed }) => [styles.botaoIA, pressed && { opacity: 0.85 }]}
                  accessibilityRole="button"
                >
                  <Ionicons name="sparkles" size={18} color={paleta().cores.verde} />
                  <View style={styles.textoModo}>
                    <Text style={styles.tituloIA}>Montar com a IA</Text>
                    <Text style={styles.subIA}>
                      Diga o que você quer, ou fotografe a ficha da academia
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => setAba('rotina')}
                  style={styles.linkRotina}
                  accessibilityRole="button"
                >
                  {/* "Montar na mão" descrevia o que se faz LÁ DENTRO, e não
                      para onde o toque leva. Quem só queria ver o treino de
                      sábado não clicava, porque não queria montar nada. */}
                  <Text style={styles.textoLink}>Ver a minha semana</Text>
                  <Ionicons name="chevron-forward" size={15} color={paleta().cores.verde} />
                </Pressable>
              </View>
            )}

            <RegistrarTreino
              contaId={contaId}
              minutosMedidos={minutosMedidos}
              rotina={rotina}
              sessaoDeHoje={sessoes.find(s => s.data === dataISO(new Date())) ?? null}
              onRegistrou={s => {
                setSessoes(atuais => [s, ...atuais])
                setMudou(true)
                setErro('')
              }}
              onRefinou={s => {
                setSessoes(atuais => atuais.map(x => (x.id === s.id ? s : x)))
                setMudou(true)
              }}
              onErro={setErro}
            />

            {!!erro && <Text style={styles.erro}>{erro}</Text>}

            {sessoes.length > 0 && (
              <>
                <Text style={styles.tituloSecao}>Últimos treinos</Text>
                {sessoes.map(s => (
                  <View key={s.id} style={styles.linhaSessao}>
                    <View style={styles.textoSessao}>
                      <Text style={styles.nomeSessao} numberOfLines={1}>
                        {s.titulo || (s.dia !== null ? DIAS_CURTOS[s.dia] : 'Treino')}
                      </Text>
                      <Text style={styles.detalheSessao}>
                        {dataNumerica(comoData(s.data))}
                        {s.duracaoMin !== null && ` · ${s.duracaoMin} min`}
                        {s.esforco !== null && ` · ${nomeDoEsforco(s.esforco)}`}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => setApagandoSessao(s)}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel="Apagar este treino"
                    >
                      <Ionicons name="close" size={16} color={paleta().inkFraco} />
                    </Pressable>
                  </View>
                ))}
              </>
            )}
          </>
        ) : (
          <Rotina
            diaInicial={diaDaRotina}
            contaId={contaId}
            exercicios={rotina}
            onMudou={setRotina}
            onErro={setErro}
            erro={erro}
            onPedirIA={() => setIaAberta(true)}
            camadaAberta={camadaDaRotina}
          />
        )}
      </ScrollView>

      <ModoTreino
        visivel={modoAberto}
        contaId={contaId}
        pesoKg={corpo.pesoKg}
        exercicios={doHoje}
        /* Persiste na hora. Ajustar o descanso toda semana é exatamente o
           atrito que este modo existe para tirar. */
        /* A carga sobe de semana em semana, e era a única coisa que a pessoa
           ajustava e o app esquecia. */
        onCargaMudou={(id, kg) => {
          void salvarCarga(id, kg)
          setRotina(atuais => atuais.map(e => (e.id === id ? { ...e, cargaKg: kg } : e)))
        }}
        onDescansoMudou={(id, seg) => {
          void salvarDescanso(id, seg)
          setRotina(atuais =>
            atuais.map(e => (e.id === id ? { ...e, descansoSeg: seg } : e)),
          )
        }}
        onTerminar={min => {
          setMinutosMedidos(min)
          setModoAberto(false)
        }}
        onFechar={() => setModoAberto(false)}
      />

      <RotinaPorIA
        visivel={iaAberta}
        contaId={contaId}
        perfil={corpo}
        onFechar={() => setIaAberta(false)}
        onUsar={async novos => {
          setIaAberta(false)
          /* Grava um por um pelo MESMO caminho de quem monta na mão. Um insert
             em lote seria mais rápido e criaria um segundo jeito de a rotina
             nascer — e dois caminhos para o mesmo dado sempre divergem. */
          const criados: Exercicio[] = []
          for (const e of novos) {
            const r = await adicionarExercicio(contaId, e)
            if (r.tipo === 'erro') {
              setErro(r.mensagem)
              break
            }
            criados.push(r.exercicio)
          }
          if (criados.length > 0) {
            setRotina(atuais => [...atuais, ...criados])
            setMudou(true)
            setAba('rotina')
          }
        }}
      />

      <Confirmacao
        visivel={apagandoSessao !== null}
        titulo="Apagar este treino?"
        mensagem="O registro sai do seu histórico e da contagem de constância."
        rotuloConfirmar="Apagar"
        destrutiva
        onCancelar={() => setApagandoSessao(null)}
        onConfirmar={() => apagandoSessao && apagar(apagandoSessao)}
      />
    </KeyboardAvoidingView>
  )
}

/* A foto do treino: tirar, ver, trocar, tirar de novo.
 *
 * ── Por que o endereço é estado, e não conta no render ────────────────────
 * O bucket é privado. `getPublicUrl` devolveria um endereço com cara de válido
 * que o servidor recusa, e SEM ERRO NENHUM do lado do app — item 7, e ele já
 * custou meses de foto de perfil quebrada. Assinar é `async`, então o endereço
 * vira estado, refeito quando o caminho muda.
 *
 * ── E o endereço vence ────────────────────────────────────────────────────
 * Uma hora. Por isso o `onError` guarda QUAL endereço falhou, e não um
 * booleano: um endereço novo entra tentando de novo. Sem ele, a imagem que
 * falha não desenha nada e sobra um buraco do tamanho dela, que se lê como app
 * quebrado — pior do que nunca ter tido foto. */
function FotoDoTreino({
  contaId,
  caminho,
  onMudou,
  onErro,
}: {
  contaId: string
  caminho: string | null
  onMudou: (caminho: string | null) => void
  onErro: (m: string) => void
}) {
  const styles = estilos()
  const [endereco, setEndereco] = useState<string | null>(null)
  const [falhou, setFalhou] = useState<string | null>(null)
  const [subindo, setSubindo] = useState(false)
  const [salvou, setSalvou] = useState(false)

  useEffect(() => {
    let vivo = true
    if (!caminho) {
      setEndereco(null)
      return
    }
    void enderecoNoDiario(caminho).then(u => {
      if (vivo) setEndereco(u)
    })
    return () => {
      vivo = false
    }
  }, [caminho])

  async function tirar(origem: 'camera' | 'galeria') {
    const escolha = await escolherFoto(origem)
    /* 'cancelado' não é erro: ela desistiu, e a tela fica como estava. */
    if (escolha.tipo === 'cancelado') return
    if (escolha.tipo === 'erro') {
      onErro(escolha.mensagem)
      return
    }

    setSubindo(true)
    const novo = await guardarFotoDoDiario(contaId, escolha.base64)
    setSubindo(false)

    if (!novo) {
      onErro('Não consegui guardar a foto agora. O treino continua registrado.')
      return
    }

    /* DIZ que guardou.
       Ela some sozinha, e não há botão de salvar: a foto sobe no momento em que
       a pessoa escolhe. Sem esta linha o único sinal era a imagem aparecer, e
       "apareceu na tela" e "está guardada no servidor" são coisas diferentes —
       ela não tinha como saber se podia sair da tela. */
    setSalvou(true)
    setTimeout(() => setSalvou(false), 2600)

    /* A anterior sai do bucket. Foto órfã ocupa espaço para sempre e ninguém
       vai procurá-la depois — e a linha só guarda um caminho. */
    if (caminho) void apagarFotoDoDiario(caminho)
    setFalhou(null)
    onMudou(novo)
  }

  function remover() {
    const antigo = caminho
    onMudou(null)
    if (antigo) void apagarFotoDoDiario(antigo)
  }

  return (
    <>
      <Text style={styles.rotulo}>Foto do treino (opcional)</Text>

      {caminho && endereco && endereco !== falhou ? (
        <View style={styles.fotoDoTreino}>
          <Image
            source={{ uri: endereco }}
            style={styles.imagemDoTreino}
            onError={() => setFalhou(endereco)}
            accessibilityLabel="Foto do seu treino de hoje"
          />
          <View style={styles.acoesDaFoto}>
            <Pressable
              onPress={() => tirar('camera')}
              disabled={subindo}
              style={({ pressed }) => [styles.chip, pressed && styles.pressionado]}
              accessibilityRole="button"
            >
              <Text style={styles.textoChip}>Trocar</Text>
            </Pressable>
            <Pressable
              onPress={remover}
              disabled={subindo}
              style={({ pressed }) => [styles.chip, pressed && styles.pressionado]}
              accessibilityRole="button"
            >
              <Text style={styles.textoChip}>Tirar a foto</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        /* Duas portas, e as duas ditas. A galeria importa: quem fotografou a
            ficha da academia ontem já tem a imagem no aparelho, e obrigá-la a
            fotografar de novo é pedir para ela desistir.

            Botão, e não etiqueta. Eram dois chips pequenos, do mesmo tamanho e
            forma das etiquetas de escolher duração e esforço logo acima — e
            etiqueta se lê como opção de uma lista, não como "isto abre a
            câmera". Agora seguem o mesmo desenho do microfone: pílula alta,
            com o ícone num círculo cheio. */
        <View style={styles.portasDaFoto}>
          <Pressable
            onPress={() => tirar('camera')}
            disabled={subindo}
            style={({ pressed }) => [styles.portaFoto, pressed && styles.pressionado]}
            accessibilityRole="button"
            accessibilityLabel="Tirar foto do treino"
          >
            <View style={styles.bolhaDaFoto}>
              {subindo ? (
                <ActivityIndicator size="small" color={paleta().cores.branco} />
              ) : (
                <Ionicons name="camera" size={18} color={paleta().cores.branco} />
              )}
            </View>
            <Text style={styles.textoPortaFoto}>Tirar foto</Text>
          </Pressable>

          <Pressable
            onPress={() => tirar('galeria')}
            disabled={subindo}
            style={({ pressed }) => [styles.portaFoto, pressed && styles.pressionado]}
            accessibilityRole="button"
            accessibilityLabel="Escolher foto da galeria"
          >
            <View style={[styles.bolhaDaFoto, styles.bolhaSecundaria]}>
              <Ionicons name="images" size={17} color={paleta().cores.verde} />
            </View>
            <Text style={styles.textoPortaFoto}>Da galeria</Text>
          </Pressable>
        </View>
      )}

      {salvou && (
        <View style={styles.fotoSalva}>
          <Ionicons name="checkmark-circle" size={15} color={paleta().cores.verde} />
          <Text style={styles.textoFotoSalva}>Foto guardada.</Text>
        </View>
      )}

      {/* Só quando ela JÁ tem foto: dizer para que serve antes de existir uma
          seria explicar um recurso que ninguém pediu. */}
      {caminho && (
        <Text style={styles.ajuda}>
          Sua nutricionista consegue ver esta foto junto com o treino.
        </Text>
      )}
    </>
  )
}

/* ── Registrar o treino de hoje ────────────────────────────────────────────*/

/* Durações que cobrem quase tudo. Números redondos porque ninguém cronometra o
   próprio treino: "uns 45 minutos" é a resposta real. */
const DURACOES = [20, 30, 45, 60, 90]

function RegistrarTreino({
  contaId,
  rotina,
  minutosMedidos,
  sessaoDeHoje,
  onRegistrou,
  onRefinou,
  onErro,
}: {
  contaId: string
  rotina: Exercicio[]
  /* O que o cronômetro mediu, em minutos. Zero quando ninguém o usou. */
  minutosMedidos: number
  /* A sessão de hoje, quando já existe. É ela que decide se a tela pergunta
     "treinou?" ou oferece os detalhes opcionais. */
  sessaoDeHoje: Sessao | null
  onRegistrou: (s: Sessao) => void
  onRefinou: (s: Sessao) => void
  onErro: (m: string) => void
}) {
  const styles = estilos()
  const hoje = new Date().getDay() as DiaSemana
  const daRotina = rotina.filter(e => e.dia === hoje)

  const [titulo, setTitulo] = useState('')
  const [salvando, setSalvando] = useState(false)

  /* O foco do dia, tirado da rotina: "Supino · Crucifixo · Tríceps testa" não
     é nome de treino, é lista de tarefas. O que a pessoa reconhece é o primeiro
     exercício e quantos são. */
  const focoDeHoje =
    daRotina.length === 0
      ? null
      : daRotina.length === 1
        ? daRotina[0].nome
        : `${daRotina[0].nome} e mais ${daRotina.length - 1}`

  async function registrar() {
    setSalvando(true)
    const r = await registrarSessao(contaId, {
      /* Veio da rotina quando o dia de hoje tem exercícios e a pessoa não deu
         outro nome. É o que liga a sessão ao que estava planejado. */
      dia: daRotina.length > 0 && !titulo.trim() ? hoje : null,
      titulo: titulo.trim() || null,
      /* O tempo NÃO é perguntado, mas se o cronômetro rodou ele já está
         medido — e medido vale mais que a estimativa que a pessoa daria
         depois. Zero significa que ninguém cronometrou, e aí fica nulo. */
      duracaoMin: minutosMedidos > 0 ? minutosMedidos : null,
      esforco: null,
      observacao: null,
    })
    setSalvando(false)

    if (r.tipo === 'erro') {
      onErro(r.mensagem)
      return
    }
    onRegistrou(r.sessao)
    setTitulo('')
  }

  async function refinar(campos: {
    duracaoMin?: number | null
    esforco?: number | null
    fotoPath?: string | null
  }) {
    if (!sessaoDeHoje) return
    /* Pinta na hora e conserta se falhar. Esperar a rede para acender um chip
       de "45 min" faz o toque parecer que não funcionou. */
    onRefinou({ ...sessaoDeHoje, ...campos })
    const r = await refinarSessao(sessaoDeHoje.id, campos)
    if (r.tipo === 'erro') {
      onRefinou(sessaoDeHoje)
      onErro(r.mensagem)
      return
    }
    onRefinou(r.sessao)
  }

  /* ── Já treinou hoje: só os detalhes, e todos opcionais ─────────────────*/
  if (sessaoDeHoje) {
    return (
      <View style={styles.cartao}>
        <View style={styles.linhaFeito}>
          <View style={styles.selo}>
            <Ionicons name="checkmark" size={18} color={paleta().cores.branco} />
          </View>
          <Text style={styles.tituloFeito}>
            {sessaoDeHoje.titulo || focoDeHoje || 'Treino de hoje'} registrado
          </Text>
        </View>

        {/* Ele já mediu: então DIZ, em vez de perguntar.
            O cronômetro do modo treino preenche a duração sozinho, e a tela
            continuava mostrando "Quanto tempo?" por cima do número que ela
            mesma acabou de calcular — o que se lê como o app não ter reparado
            no treino inteiro que a pessoa acabou de fazer com ele na mão. */}
        <Text style={styles.rotulo}>
          {minutosMedidos > 0 && sessaoDeHoje.duracaoMin !== null
            ? `Cronometrei ${sessaoDeHoje.duracaoMin} min. Toque se quiser mudar.`
            : 'Quanto tempo? (opcional)'}
        </Text>
        <View style={styles.chips}>
          {DURACOES.map(d => (
            <Pressable
              key={d}
              onPress={() => refinar({ duracaoMin: sessaoDeHoje.duracaoMin === d ? null : d })}
              style={({ pressed }) => [
                styles.chip,
                sessaoDeHoje.duracaoMin === d && styles.chipAtivo,
                pressed && styles.pressionado,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: sessaoDeHoje.duracaoMin === d }}
            >
              <Text
                style={[styles.textoChip, sessaoDeHoje.duracaoMin === d && styles.textoChipAtivo]}
              >
                {d} min
              </Text>
            </Pressable>
          ))}
        </View>

        {/* O que a escala QUER DIZER, antes de escolher.
            Os cinco números apareciam sozinhos, e o nome de cada um só surgia
            depois do toque — quem nunca viu a escala precisava tocar nos cinco
            para descobrir o que estava respondendo. */}
        <Text style={styles.rotulo}>Como foi? (opcional)</Text>
        <Text style={styles.escala}>
          1 é muito leve, 5 é o máximo que você conseguiria fazer.
        </Text>
        <View style={styles.chips}>
          {[1, 2, 3, 4, 5].map(n => (
            <Pressable
              key={n}
              onPress={() => refinar({ esforco: sessaoDeHoje.esforco === n ? null : n })}
              style={({ pressed }) => [
                styles.chipEsforco,
                sessaoDeHoje.esforco === n && styles.chipAtivo,
                pressed && styles.pressionado,
              ]}
              accessibilityRole="button"
              accessibilityLabel={NOME_DO_ESFORCO[n]}
              accessibilityState={{ selected: sessaoDeHoje.esforco === n }}
            >
              <Text style={[styles.textoChip, sessaoDeHoje.esforco === n && styles.textoChipAtivo]}>
                {n}
              </Text>
            </Pressable>
          ))}
        </View>
        {sessaoDeHoje.esforco !== null && (
          <Text style={styles.legendaEsforco}>{nomeDoEsforco(sessaoDeHoje.esforco)}</Text>
        )}

        {/* A FOTO do treino.
            A coluna existia no banco e nada escrevia nela. E ela é uma das
            duas coisas que a nutricionista pediria para ver — a outra é o
            prato. Fica aqui, entre os opcionais, e não antes do botão: quem
            só quer marcar presença não passa por nada disto. */}
        <FotoDoTreino
          contaId={contaId}
          caminho={sessaoDeHoje.fotoPath}
          onMudou={fotoPath => refinar({ fotoPath })}
          onErro={onErro}
        />
      </View>
    )
  }

  /* ── Ainda não treinou: um toque, e acabou ──────────────────────────────*/
  return (
    <View style={styles.cartao}>
      {focoDeHoje ? (
        <>
          <Text style={styles.tituloCartao}>Hoje na sua rotina</Text>
          <Text style={styles.listaRotina} numberOfLines={2}>
            {focoDeHoje}
          </Text>
        </>
      ) : (
        <Text style={styles.tituloCartao}>Treinou hoje?</Text>
      )}

      <Pressable
        onPress={registrar}
        disabled={salvando}
        style={({ pressed }) => [styles.botaoGrande, pressed && styles.pressionado]}
        accessibilityRole="button"
      >
        {salvando ? (
          <ActivityIndicator size="small" color={paleta().cores.branco} />
        ) : (
          <>
            <Ionicons name="checkmark" size={20} color={paleta().cores.branco} />
            <Text style={styles.textoBotaoGrande}>{focoDeHoje ? 'Fiz esse treino' : 'Treinei'}</Text>
          </>
        )}
      </Pressable>

      {/* O campo de nome só aparece quando não há rotina para hoje, e mesmo
          assim depois do botão: quem correu no sábado pode dizer o que foi,
          mas quem só quer marcar presença não precisa passar por aqui. */}
      {!focoDeHoje && (
        <>
          <TextInput
            value={titulo}
            onChangeText={setTitulo}
            placeholder="Foi o quê? Corrida, natação… (opcional)"
            placeholderTextColor={paleta().inkFraco}
            maxLength={40}
            style={styles.campo}
            accessibilityLabel="O que você treinou"
          />
          <Text style={styles.ajuda}>
            Pode deixar em branco. O que conta é marcar que você treinou.
          </Text>
        </>
      )}
    </View>
  )
}

/* ── A rotina da semana ────────────────────────────────────────────────────*/

function Rotina({
  diaInicial,
  contaId,
  exercicios,
  onMudou,
  onErro,
  erro,
  onPedirIA,
  camadaAberta,
}: {
  contaId: string
  exercicios: Exercicio[]
  onMudou: (e: Exercicio[]) => void
  onErro: (m: string) => void
  erro: string
  onPedirIA: () => void
  /* Onde este componente anuncia que tem uma camada aberta por cima. Quem lê é
     o voltar do aparelho, lá na tela de treino — ver o comentário de
     `camadaDaRotina`. */
  camadaAberta: MutableRefObject<(() => void) | null>
  /* O dia em que abrir. Nulo é hoje. */
  diaInicial: DiaSemana | null
}) {
  const styles = estilos()
  const [dia, setDia] = useState<DiaSemana>(
    () => diaInicial ?? (new Date().getDay() as DiaSemana),
  )

  /* Segue o pedido de fora quando ele MUDA, e não a cada renderização: sem a
     dependência, trocar de dia aqui dentro seria desfeito no render seguinte e
     a fileira ficaria presa. */
  useEffect(() => {
    if (diaInicial !== null) setDia(diaInicial)
  }, [diaInicial])
  const [nome, setNome] = useState('')
  const [series, setSeries] = useState('')
  const [repeticoes, setRepeticoes] = useState('')
  const [carga, setCarga] = useState('')
  const [salvando, setSalvando] = useState(false)
  /* Qual exercício está sendo adaptado. A folha de adaptação é um Modal, e o
     voltar do aparelho já a fecha pelo `onRequestClose` dela — por isso não há
     BackHandler aqui: um segundo tratador para a mesma camada fecharia duas. */
  const [adaptando, setAdaptando] = useState<Exercicio | null>(null)
  /* Qual exercício está aberto para correção, e o rascunho dele.

     O id, e não o objeto: o objeto é substituído a cada gravação, e guardá-lo
     deixaria o editor apontando para uma versão que não existe mais. */
  const [editando, setEditando] = useState<string | null>(null)
  const [rascunho, setRascunho] = useState({
    nome: '',
    series: '',
    repeticoes: '',
    carga: '',
  })

  const doDia = exercicios.filter(e => e.dia === dia)

  async function adicionar() {
    const limpo = nome.trim()
    if (!limpo) {
      onErro('Dê um nome ao exercício.')
      return
    }

    setSalvando(true)
    const r = await adicionarExercicio(contaId, {
      dia,
      nome: limpo,
      ordem: doDia.length,
      series: series ? Number(series) : null,
      repeticoes: repeticoes || null,
      cargaKg: carga ? Number(carga.replace(',', '.')) : null,
      observacao: null,
      adaptadoDe: null,
      descansoSeg: null,
    })
    setSalvando(false)

    if (r.tipo === 'erro') {
      onErro(r.mensagem)
      return
    }

    onMudou([...exercicios, r.exercicio])
    setNome('')
    setSeries('')
    setRepeticoes('')
    setCarga('')
    onErro('')
  }

  function abrirEditor(e: Exercicio) {
    setEditando(e.id)
    setRascunho({
      nome: e.nome,
      /* Arredondado ao PREENCHER. A coluna é numeric, e um 4.0 que voltasse
         como "4.5" entraria num campo que só aceita dígito — e o primeiro
         toque para corrigir faria o filtro virar isso em "45". Foi assim que
         a medida caseira multiplicou um peso por dez. */
      series: e.series === null ? '' : String(Math.round(e.series)),
      repeticoes: e.repeticoes ?? '',
      /* Vírgula, porque é assim que se digita peso aqui. `salvarEdicao` troca
         por ponto na volta — sem isso, `Number("22,5")` é NaN. */
      carga: e.cargaKg === null ? '' : String(e.cargaKg).replace('.', ','),
    })
    onErro('')
  }

  async function salvarEdicao(alvo: Exercicio) {
    const r = await editarExercicio(alvo.id, {
      nome: rascunho.nome,
      series: rascunho.series ? Number(rascunho.series) : null,
      repeticoes: rascunho.repeticoes.trim() || null,
      cargaKg: rascunho.carga ? Number(rascunho.carga.replace(',', '.')) : null,
    })
    if (r.tipo === 'erro') {
      onErro(r.mensagem)
      return
    }
    setEditando(null)
    onErro('')
    onMudou(exercicios.map(x => (x.id === alvo.id ? r.exercicio : x)))
  }

  /* Avisa o voltar do aparelho de que há um degrau a descer antes de fechar a
     tela. A limpeza é obrigatória: sem ela, sair da aba Rotina com o editor
     aberto deixaria o voltar apontando para um `setEditando` de um componente
     que não está mais na tela, e o botão pararia de funcionar. */
  useEffect(() => {
    camadaAberta.current = editando ? () => setEditando(null) : null
    return () => {
      camadaAberta.current = null
    }
  }, [editando, camadaAberta])

  /* Grava a troca e atualiza a linha no lugar.
   *
   * Sem otimismo aqui, ao contrário do remover: a pessoa acabou de escolher
   * entre três alternativas, e ver o nome novo aparecer e voltar atrás por
   * falha de rede seria pior do que esperar o meio segundo da gravação. */
  async function adaptar(alvo: Exercicio, nomeNovo: string) {
    setAdaptando(null)
    const r = await trocarPorAdaptado(alvo.id, nomeNovo, alvo.adaptadoDe ?? alvo.nome)
    if (r.tipo === 'erro') {
      onErro(r.mensagem)
      return
    }
    onErro('')
    onMudou(exercicios.map(x => (x.id === alvo.id ? r.exercicio : x)))
  }

  async function remover(e: Exercicio) {
    onMudou(exercicios.filter(x => x.id !== e.id))
    const falha = await apagarExercicio(e.id)
    if (falha) {
      onMudou([...exercicios])
      onErro(falha.erro)
    }
  }

  return (
    <>
      <View style={styles.seletorDias}>
        {([0, 1, 2, 3, 4, 5, 6] as DiaSemana[]).map(d => {
          const tem = exercicios.some(e => e.dia === d)
          return (
            <Pressable
              key={d}
              onPress={() => setDia(d)}
              style={[styles.diaChip, dia === d && styles.diaChipAtivo]}
              accessibilityRole="button"
              accessibilityState={{ selected: dia === d }}
              accessibilityLabel={DIAS_CURTOS[d]}
            >
              <Text style={[styles.textoDia, dia === d && styles.textoDiaAtivo]}>
                {DIAS_CURTOS[d]}
              </Text>
              {/* O ponto diz quais dias já têm treino sem precisar visitá-los um
                  a um — é a leitura da semana inteira num relance. */}
              {tem && <View style={[styles.pontoDia, dia === d && styles.pontoDiaAtivo]} />}
            </Pressable>
          )
        })}
      </View>

      {exercicios.length === 0 ? (
        /* Rotina vazia é o momento de desistir: montar sete dias de exercício
           na mão, um campo por vez, é o degrau mais alto desta tela. Por isso o
           convite ocupa o lugar todo aqui, e vira um link discreto assim que
           existe qualquer coisa montada. */
        <Pressable
          onPress={onPedirIA}
          style={({ pressed }) => [styles.convite, pressed && styles.pressionado]}
          accessibilityRole="button"
        >
          <Ionicons name="sparkles-outline" size={22} color={paleta().cores.verde} />
          <View style={styles.textoConvite}>
            <Text style={styles.tituloConvite}>Montar minha rotina</Text>
            <Text style={styles.subConvite}>
              Diga o que você quer treinar — pode falar — e eu monto a semana. Você confere antes.
            </Text>
          </View>
        </Pressable>
      ) : (
        /* Botão, e não link.
           Com rotina montada isto era um texto pequeno com um ícone de 15px, e
           quem quis montar de novo não achou. O convite grande continua sendo
           só da rotina vazia — mas "discreto" não pode significar "invisível":
           montar de novo é a segunda ação mais comum desta tela. */
        <Botao
          rotulo="Montar outra rotina com IA"
          tipo="secundario"
          icone="sparkles-outline"
          onPress={onPedirIA}
        />
      )}

      {doDia.length === 0 ? (
        <Text style={styles.vazio}>
          Nada em {DIAS_CURTOS[dia]} ainda. Monte aqui o que você pretende fazer, e no dia o
          registro já vem com o nome certo.
        </Text>
      ) : (
        doDia.map(e =>
          editando === e.id ? (
            /* O editor no LUGAR da linha, e não numa tela por cima: o que ela
               está corrigindo é o que a foto leu errado, e os vizinhos na tela
               são a referência de como o resto saiu. */
            <View key={e.id} style={styles.editorExercicio}>
              <TextInput
                value={rascunho.nome}
                onChangeText={t => setRascunho(r => ({ ...r, nome: t }))}
                placeholder="Supino reto"
                placeholderTextColor={paleta().inkFraco}
                keyboardAppearance="dark"
                maxLength={60}
                autoFocus
                style={styles.campo}
                accessibilityLabel="Nome do exercício"
              />
              <View style={styles.linhaCampos}>
                <View style={styles.campoPequeno}>
                  <Text style={styles.rotuloPequeno}>Séries</Text>
                  <TextInput
                    value={rascunho.series}
                    onChangeText={t =>
                      setRascunho(r => ({ ...r, series: t.replace(/[^0-9]/g, '') }))
                    }
                    placeholder="4"
                    placeholderTextColor={paleta().inkFraco}
                    keyboardType="number-pad"
                    keyboardAppearance="dark"
                    maxLength={2}
                    style={styles.campo}
                    accessibilityLabel="Séries"
                  />
                </View>
                <View style={styles.campoPequeno}>
                  <Text style={styles.rotuloPequeno}>Reps</Text>
                  <TextInput
                    value={rascunho.repeticoes}
                    onChangeText={t => setRascunho(r => ({ ...r, repeticoes: t }))}
                    placeholder="8-12"
                    placeholderTextColor={paleta().inkFraco}
                    keyboardAppearance="dark"
                    maxLength={20}
                    style={styles.campo}
                    accessibilityLabel="Repetições"
                  />
                </View>
                <View style={styles.campoPequeno}>
                  <Text style={styles.rotuloPequeno}>Carga</Text>
                  <TextInput
                    value={rascunho.carga}
                    onChangeText={t =>
                      setRascunho(r => ({ ...r, carga: t.replace(/[^0-9,.]/g, '') }))
                    }
                    placeholder="20"
                    placeholderTextColor={paleta().inkFraco}
                    keyboardType="decimal-pad"
                    keyboardAppearance="dark"
                    maxLength={6}
                    style={styles.campo}
                    accessibilityLabel="Carga em quilos"
                  />
                </View>
              </View>
              <View style={styles.linhaBotoesEditor}>
                <Pressable
                  onPress={() => setEditando(null)}
                  style={styles.botaoCancelar}
                  accessibilityRole="button"
                >
                  <Text style={styles.textoCancelar}>Cancelar</Text>
                </Pressable>
                <Pressable
                  onPress={() => void salvarEdicao(e)}
                  style={styles.botaoPronto}
                  accessibilityRole="button"
                >
                  <Text style={styles.textoPronto}>Pronto</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View key={e.id} style={styles.linhaExercicio}>
              {/* A linha inteira abre a correção. A ficha vem de foto de letra
                  pequena, e o nome sai errado de vez em quando — enquanto só
                  dava para remover, corrigir uma letra custava apagar e
                  redigitar as quatro informações, que é o trabalho que a foto
                  existe para poupar. */}
              <Pressable
                onPress={() => abrirEditor(e)}
                style={styles.textoSessao}
                accessibilityRole="button"
                accessibilityLabel={`Editar ${e.nome}`}
              >
                <Text style={styles.nomeSessao} numberOfLines={1}>
                  {e.nome}
                </Text>
                <Text style={styles.detalheSessao}>{descreverExercicio(e)}</Text>
                {/* De onde ele veio. Sem esta linha, "Leg press" no lugar onde
                    havia "Agachamento livre" some sem explicação, e daqui a um
                    mês ninguém — nem ela — sabe por que a rotina mudou. */}
                {e.adaptadoDe && (
                  <Text style={styles.veioDe} numberOfLines={1}>
                    no lugar de {e.adaptadoDe}
                  </Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => setAdaptando(e)}
                hitSlop={10}
                style={styles.botaoAdaptar}
                accessibilityRole="button"
                accessibilityLabel={`Adaptar ${e.nome}`}
              >
                <Ionicons name="swap-horizontal" size={17} color={paleta().cores.verde} />
              </Pressable>
              <Pressable
                onPress={() => remover(e)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`Remover ${e.nome}`}
              >
                <Ionicons name="close" size={16} color={paleta().inkFraco} />
              </Pressable>
            </View>
          ),
        )
      )}

      {adaptando && (
        <AdaptarExercicio
          visivel
          contaId={contaId}
          exercicio={adaptando.nome}
          observacao={adaptando.observacao}
          onde=""
          onTrocar={nome => void adaptar(adaptando, nome)}
          onFechar={() => setAdaptando(null)}
        />
      )}

      <View style={styles.cartao}>
        <Text style={styles.tituloCartao}>Adicionar em {DIAS_CURTOS[dia]}</Text>

        <TextInput
          value={nome}
          onChangeText={setNome}
          placeholder="Supino reto"
          placeholderTextColor={paleta().inkFraco}
          keyboardAppearance="dark"
          maxLength={60}
          style={styles.campo}
          accessibilityLabel="Nome do exercício"
        />

        <View style={styles.linhaCampos}>
          <View style={styles.campoPequeno}>
            <Text style={styles.rotuloPequeno}>Séries</Text>
            <TextInput
              value={series}
              onChangeText={t => setSeries(t.replace(/[^0-9]/g, ''))}
              placeholder="4"
              placeholderTextColor={paleta().inkFraco}
              keyboardType="number-pad"
              keyboardAppearance="dark"
              maxLength={2}
              style={styles.campo}
              accessibilityLabel="Séries"
            />
          </View>

          <View style={styles.campoPequeno}>
            {/* Texto livre: "8-12", "até a falha" e "30s" são respostas comuns, e
                nenhuma cabe num número. A coluna do banco é texto pelo mesmo
                motivo. */}
            <Text style={styles.rotuloPequeno}>Repetições</Text>
            <TextInput
              value={repeticoes}
              onChangeText={setRepeticoes}
              placeholder="8-12"
              placeholderTextColor={paleta().inkFraco}
              keyboardAppearance="dark"
              maxLength={20}
              style={styles.campo}
              accessibilityLabel="Repetições"
            />
          </View>

          <View style={styles.campoPequeno}>
            <Text style={styles.rotuloPequeno}>Carga</Text>
            <TextInput
              value={carga}
              onChangeText={t => setCarga(t.replace(/[^0-9.,]/g, ''))}
              placeholder="40"
              placeholderTextColor={paleta().inkFraco}
              keyboardType="decimal-pad"
              keyboardAppearance="dark"
              maxLength={6}
              style={styles.campo}
              accessibilityLabel="Carga em quilos"
            />
          </View>
        </View>

        {!!erro && <Text style={styles.erro}>{erro}</Text>}

        <Pressable
          onPress={adicionar}
          disabled={salvando}
          style={({ pressed }) => [styles.botao, pressed && styles.pressionado]}
          accessibilityRole="button"
        >
          {salvando ? (
            <ActivityIndicator size="small" color={paleta().cores.branco} />
          ) : (
            <>
              <Ionicons name="add" size={18} color={paleta().cores.branco} />
              <Text style={styles.textoBotao}>Adicionar exercício</Text>
            </>
          )}
        </Pressable>
      </View>
    </>
  )
}

function descreverExercicio(e: Exercicio): string {
  const partes: string[] = []
  if (e.series !== null && e.repeticoes) partes.push(`${e.series}x${e.repeticoes}`)
  else if (e.series !== null) partes.push(`${e.series} séries`)
  else if (e.repeticoes) partes.push(e.repeticoes)
  if (e.cargaKg !== null) partes.push(`${e.cargaKg} kg`)
  return partes.join(' · ') || 'Sem detalhes'
}

/* "2026-08-28" para Date, montado campo a campo. `new Date('2026-08-28')` é
   lido como UTC e, num fuso negativo, devolve o dia anterior. */
function comoData(iso: string): Date {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return new Date(ano, mes - 1, dia)
}

const estilos = estilosDe(t =>
  StyleSheet.create({
  tela: { flex: 1, backgroundColor: t.cores.fundo },
  /* BRANCO SOBRE BRANCO, e eu não vi.
     Escrevi este atalho com texto branco sobre um véu branco, supondo que o
     bloco de cima fosse verde. Ele é `cores.cartao` — claro. Ficou ilegível, e
     foi o que apareceu no aparelho: "está branco, não dá para ver nada".
     Não custava conferir o fundo antes de escolher a cor do texto. */
  atalhoProximo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 20,
    backgroundColor: t.cores.verdeMenta,
    borderWidth: 1,
    borderColor: t.cores.verde,
  },
  textoAtalhoProximo: { fontSize: 13, fontWeight: '700', color: t.cores.verdeEscuro },

  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  botaoVoltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  tituloTela: { flexShrink: 1, fontSize: 17, fontWeight: '800', color: t.cores.ink },

  abas: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
  aba: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.borda,
    backgroundColor: t.cores.cartao,
  },
  conteudo: { paddingHorizontal: 20, gap: 10 },
  girando: { marginTop: 40 },

  convite: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: t.cores.verdeMenta,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.verde,
    padding: 16,
  },
  textoConvite: { flex: 1, gap: 4 },
  tituloConvite: { fontSize: 15, fontWeight: '800', color: t.cores.ink },
  subConvite: { fontSize: 13, color: t.inkMedio, lineHeight: 18 },
  linhaFeito: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  selo: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: t.cores.verde,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tituloFeito: { flex: 1, fontSize: 15, fontWeight: '800', color: t.cores.ink },
  botaoGrande: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: t.cores.verde,
    borderRadius: 14,
    paddingVertical: 17,
  },
  textoBotaoGrande: { color: t.cores.branco, fontSize: 16, fontWeight: '800' },
  cartao: {
    backgroundColor: t.cores.cartao,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.cores.borda,
    padding: 16,
    gap: 8,
  },
  tituloCartao: { fontSize: 14.5, fontWeight: '800', color: t.cores.ink },
  listaRotina: { fontSize: 13, color: t.inkMedio, lineHeight: 19 },

  rotulo: { fontSize: 12.5, fontWeight: '700', color: t.inkMedio, marginTop: 6 },
  ajuda: { fontSize: 11.5, color: t.inkFraco, lineHeight: 17 },

  campo: {
    backgroundColor: t.cores.superficie,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: t.cores.borda,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14.5,
    color: t.cores.ink,
  },
  linhaCampos: { flexDirection: 'row', gap: 8 },
  campoPequeno: { flex: 1, gap: 4 },
  rotuloPequeno: { fontSize: 11.5, color: t.inkSuave },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: t.cores.borda,
    backgroundColor: t.cores.superficie,
  },
  chipEsforco: {
    width: 46,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: t.cores.borda,
    backgroundColor: t.cores.superficie,
  },
  chipAtivo: { backgroundColor: t.cores.limao, borderColor: t.cores.limao },
  textoChip: { fontSize: 13.5, fontWeight: '700', color: t.cores.ink },
  textoChipAtivo: { color: t.cores.sobreLimao },
  fotoDoTreino: { marginTop: 8, gap: 8 },
  portasDaFoto: { flexDirection: 'row', gap: 9, marginTop: 8 },
  portaFoto: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    height: 52,
    paddingHorizontal: 12,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: t.cores.borda,
    backgroundColor: t.cores.cartao,
  },
  bolhaDaFoto: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.cores.verde,
  },
  /* A galeria é a porta secundária: mesmo tamanho, peso menor. Duas cheias
     disputariam a mesma decisão, e a câmera é a que resolve o caso comum. */
  bolhaSecundaria: { backgroundColor: t.cores.verdeClaro },
  textoPortaFoto: { flex: 1, fontSize: 13.5, fontWeight: '700', color: t.cores.ink },
  imagemDoTreino: {
    width: '100%',
    height: 180,
    borderRadius: 14,
    backgroundColor: t.cores.superficie,
  },
  acoesDaFoto: { flexDirection: 'row', gap: 7 },
  fotoSalva: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  textoFotoSalva: { fontSize: 12, fontWeight: '600', color: t.cores.verde },
  escala: { fontSize: 11.5, color: t.inkFraco, marginTop: 3, marginBottom: 2 },
  legendaEsforco: { fontSize: 12, color: t.inkSuave },

  botao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: t.cores.verde,
    marginTop: 6,
  },
  textoBotao: { fontSize: 14.5, fontWeight: '800', color: t.cores.branco },
  pressionado: { opacity: 0.75 },

  tituloSecao: {
    fontSize: 12,
    fontWeight: '700',
    color: t.inkFraco,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: 12,
  },

  linhaSessao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: t.cores.cartao,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.cores.borda,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  linhaExercicio: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: t.cores.cartao,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.cores.borda,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  veioDe: { fontSize: 11.5, color: t.inkFraco, marginTop: 2, fontStyle: 'italic' },
  hoje: {
    backgroundColor: t.cores.cartao,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.cores.borda,
    padding: 17,
    gap: 3,
  },
  rotuloHoje: { fontSize: 12, color: t.inkFraco, fontWeight: '700' },
  /* Grande e curto: é o que se lê de relance na porta da academia. */
  /* Tingido de leve, e sem cor de alerta na noite ruim: dormir pouco nao e
     erro dela, e pintar de vermelho transformaria a sugestao em repreensao. */
  prontidao: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: t.cores.cartao,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.borda,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 14,
  },
  prontidaoBaixa: { backgroundColor: t.cores.fundo },
  textoProntidao: { flex: 1, fontSize: 13, color: t.inkMedio, lineHeight: 18 },
  tituloHoje: { fontSize: 22, fontWeight: '800', color: t.cores.ink, letterSpacing: -0.5 },
  subHoje: { fontSize: 13, color: t.inkMedio, marginTop: 4 },

  listaHoje: {
    backgroundColor: t.cores.cartao,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.borda,
    overflow: 'hidden',
  },
  linhaHoje: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  ordemHoje: {
    width: 20,
    fontSize: 12.5,
    fontWeight: '800',
    color: t.inkFraco,
    fontVariant: ['tabular-nums'],
  },
  linkRotina: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: t.cores.borda,
  },
  textoLink: { fontSize: 13.5, fontWeight: '700', color: t.cores.verde },

  semRotina: {
    backgroundColor: t.cores.cartao,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.borda,
    overflow: 'hidden',
  },
  botaoIA: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 15,
    paddingVertical: 15,
  },
  tituloIA: { fontSize: 15, fontWeight: '800', color: t.cores.ink },
  subIA: { fontSize: 12, color: t.inkFraco },

  botaoModo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: t.cores.verde,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  textoModo: { flex: 1, gap: 2 },
  tituloModo: { fontSize: 16.5, fontWeight: '800', color: t.cores.branco },
  subModo: { fontSize: 12, color: t.cores.branco, opacity: 0.85 },
  editorExercicio: {
    gap: 8,
    backgroundColor: t.cores.cartao,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.cores.verde,
    padding: 12,
  },
  linhaBotoesEditor: { flexDirection: 'row', gap: 8 },
  botaoCancelar: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  textoCancelar: { fontSize: 14, fontWeight: '700', color: t.inkMedio },
  botaoPronto: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
    borderRadius: 14,
    backgroundColor: t.cores.verde,
  },
  textoPronto: { fontSize: 14, fontWeight: '800', color: t.cores.branco },
  botaoAdaptar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.cores.verdeMenta,
  },
  textoSessao: { flex: 1, gap: 1 },
  nomeSessao: { fontSize: 14.5, fontWeight: '700', color: t.cores.ink },
  detalheSessao: { fontSize: 12, color: t.inkSuave },

  seletorDias: { flexDirection: 'row', gap: 6 },
  diaChip: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: t.cores.borda,
    backgroundColor: t.cores.cartao,
  },
  diaChipAtivo: { backgroundColor: t.cores.limao, borderColor: t.cores.limao },
  textoDia: { fontSize: 12, fontWeight: '700', color: t.inkMedio },
  textoDiaAtivo: { color: t.cores.sobreLimao },
  pontoDia: { width: 4, height: 4, borderRadius: 4, backgroundColor: t.cores.verde },
  pontoDiaAtivo: { backgroundColor: t.cores.sobreLimao },

  vazio: { fontSize: 13.5, color: t.inkSuave, lineHeight: 20, paddingVertical: 8 },
  erro: { fontSize: 13, color: t.cores.erroTexto, lineHeight: 19 },
  }),
)
