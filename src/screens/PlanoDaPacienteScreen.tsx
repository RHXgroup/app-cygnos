import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  BackHandler,
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
import {
  kcalDaRefeicao,
  planoDaPaciente,
  semCaloriaEm,
  type PlanoDaPaciente,
} from '../lib/planoDoPacienteDaNutri'
import { folhaDoPlano, nomeDoArquivo } from '../lib/folhaDoPlano'
import {
  procurarAlimento,
  trocarItem,
  type AlimentoDaBusca,
} from '../lib/trocaDoItemDoPlano'
import { FONTE } from '../lib/fontes'
import { estilosDe, paleta } from '../lib/tema'
import { falha } from '../lib/erros'

/* O plano alimentar da paciente, aberto pela ficha.
 *
 * ──────────────────── Por que esta tela existe ────────────────────
 * A ficha dizia "Plano alimentar ativo: Plano alimentar da IA" e parava ali --
 * um nome, sem nada por trás. O relato foi direto: "não consigo clicar pra ver
 * nada aqui". Ela está com a paciente na frente, ou na rua, e a pergunta que
 * ela faz é o que a pessoa deve comer -- não como o arquivo se chama.
 *
 * ──────────────────── Ela LÊ, e não edita ────────────────────
 * Trocar item, mudar gramagem e ver o macro recalcular é entrada de muitos
 * números numa tela estreita, onde errar um dígito muda a conduta. Isso continua
 * no computador, e a tela diz onde -- em vez de deixar um botão que não existe
 * ser procurado.
 *
 * ──────────────────── O que ela mostra e o site não mostra ────────────────────
 * Se o plano foi ENVIADO ao aplicativo. É a coisa mais fácil de esquecer depois
 * de montar, e o sintoma é do lado do paciente: ele abre o app e não vê nada,
 * sem saber por quê. Aqui isso aparece em uma linha, no topo. */
export function PlanoDaPacienteScreen({
  pacienteId,
  nome,
  onFechar,
}: {
  pacienteId: number
  nome: string
  onFechar: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()

  const [plano, setPlano] = useState<PlanoDaPaciente | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [puxando, setPuxando] = useState(false)
  const [erro, setErro] = useState('')
  const [gerando, setGerando] = useState(false)
  /* O item que ela tocou para trocar, ou nenhum. Guarda o rótulo junto e não
     só o id: a folha mostra o nome do que está saindo, e ir buscar isso de novo
     seria uma leitura para um dado que já estava na mão. */
  const [trocando, setTrocando] = useState<{ id: number; rotulo: string } | null>(null)

  const carregar = useCallback(async () => {
    const r = await planoDaPaciente(pacienteId)
    /* O erro é limpo no sucesso -- armadilha 9. Esta tela relê ao puxar, e um
       erro que fica esconderia o plano atrás de uma mensagem vencida. */
    if (r.tipo === 'ok') {
      setErro('')
      setPlano(r.plano)
    } else {
      setErro(r.mensagem)
    }
  }, [pacienteId])

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    void carregar().finally(() => {
      if (vivo) setCarregando(false)
    })
    return () => {
      vivo = false
    }
  }, [carregar])

  /* ──────────────────── O PDF ────────────────────
   *
   * `expo-print` monta o arquivo a partir do HTML e `expo-sharing` abre a
   * bandeja do sistema -- de onde ela manda por WhatsApp, salva no Drive ou
   * imprime. Não é o app que decide o destino, e isso é o certo: a bandeja do
   * telefone dela já tem os aplicativos que ela usa.
   *
   * Os dois entram por `import()` DENTRO da função, e não no topo do arquivo.
   * Import estático desses dois faria o módulo nativo ser resolvido na abertura
   * da tela; num Expo Go que não os tenha completos, isso derruba a tela em vez
   * de derrubar o botão -- e a tela existe para LER o plano, que funciona sem
   * PDF nenhum.
   *
   * Falhar aqui vira frase e não estouro: item 11. */
  async function gerarPdf() {
    if (!plano || gerando) return
    setGerando(true)
    setErro('')

    /* ── DUAS ETAPAS, DUAS FRASES ──
     *
     * Relatado em uso: "coloquei pra gerar um pdf e está extremamente lento...
     * aí ele falou não consegui gerar o pdf". As duas etapas caíam no MESMO
     * `catch` e na mesma frase, então "não consegui" cobria três defeitos
     * diferentes: montar o arquivo, achar a bandeja de compartilhar, e abrir a
     * bandeja.
     *
     * Cada um pede um conserto que não serve para os outros -- e um teste dela
     * não distinguia nenhum. Agora a frase diz em qual etapa parou, em
     * português, e o erro cru vai para o log com prefixo próprio.
     *
     * O tempo também sai medido: `printToFileAsync` sobe uma WebView por
     * baixo, e a primeira vez é lenta por natureza. Sem o número, "lento" não
     * diz se são dois segundos ou vinte. */
    const comecou = Date.now()

    let Print: typeof import('expo-print')
    let Sharing: typeof import('expo-sharing')
    try {
      Print = await import('expo-print')
      Sharing = await import('expo-sharing')
    } catch (e) {
      setGerando(false)
      setErro(falha('Este aplicativo não consegue gerar PDF neste aparelho.', e))
      return
    }

    let uri = ''
    try {
      const html = folhaDoPlano(plano, nome)
      console.log('[cygnos] pdf: montando', html.length, 'caracteres')
      const feito = await Print.printToFileAsync({ html })
      uri = feito.uri
      console.log('[cygnos] pdf: arquivo pronto em', ((Date.now() - comecou) / 1000).toFixed(1) + 's')
    } catch (e) {
      setGerando(false)
      setErro(falha('Não consegui montar o arquivo do plano.', e))
      return
    }

    /* ── A CAUSA, achada pela frase separada ──
     *
     * O terminal dele, depois de separar as três etapas:
     *
     *   pdf: arquivo pronto em 3.1s
     *   O plano foi montado, mas não consegui abrir para compartilhar.
     *     Caused by: Not allowed to read file under given URL.
     *
     * O PDF nascia. O `expo-print` escreve numa pasta PRÓPRIA dentro do cache,
     * e o compartilhador do Android só entrega arquivo das pastas que o app
     * declara como compartilháveis -- aquela não está entre elas. O arquivo
     * existia e o sistema recusava ler.
     *
     * Copiar para o cache do `expo-file-system` põe o arquivo onde o
     * compartilhador tem permissão. E de brinde ele ganha NOME: antes chegava
     * no WhatsApp da paciente como um código aleatório, e agora chega como
     * `plano-Maria-Silva-20260911.pdf`.
     *
     * Sem a frase separada isto seria "não consegui gerar o PDF" -- e eu teria
     * mexido no `expo-print`, que funcionava. */
    try {
      const { File, Paths } = await import('expo-file-system')
      const destino = new File(Paths.cache, nomeDoArquivo(nome))
      await new File(uri).copy(destino, { overwrite: true })
      uri = destino.uri
    } catch (e) {
      /* Sem conseguir copiar, tenta compartilhar o original mesmo: pior caso,
         cai no mesmo erro de antes e a frase continua dizendo onde parou. */
      falha('Não consegui mover o PDF para a pasta compartilhável.', e)
    }

    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: nomeDoArquivo(nome),
          UTI: 'com.adobe.pdf',
        })
      } else {
        /* Sem bandeja de compartilhar, imprimir direto ainda funciona -- e e o
           que ela quer quando esta no consultorio com a impressora ao lado. */
        await Print.printAsync({ uri })
      }
    } catch (e) {
      /* O ARQUIVO EXISTE. Dizer "não consegui gerar o PDF" aqui seria mentira:
         o plano foi montado e o que falhou foi abrir a bandeja do sistema. */
      setErro(falha('O plano foi montado, mas não consegui abrir para compartilhar.', e))
    } finally {
      setGerando(false)
    }
  }

  /* Sem lista de dependências: é o que põe este tratador na frente do da ficha
     e do da área a partir da segunda renderização. Armadilha 1. */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onFechar()
      return true
    })
    return () => sub.remove()
  })

  return (
    <View style={[styles.tela, { paddingTop: top + 8 }]}>
      <View style={styles.cabecalho}>
        <Pressable
          onPress={onFechar}
          style={styles.voltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar para a ficha"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloDaTela} numberOfLines={1}>
          Plano de {nome}
        </Text>
        <View style={styles.voltar} />
      </View>

      {carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator color={paleta().cores.verde} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.conteudo, { paddingBottom: 24 + bottom }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={puxando}
              onRefresh={() => {
                setPuxando(true)
                void carregar().finally(() => setPuxando(false))
              }}
              tintColor={paleta().cores.verde}
              colors={[paleta().cores.verde]}
              progressBackgroundColor={paleta().cores.cartao}
            />
          }
        >
          {!!erro && <Text style={styles.erro}>{erro}</Text>}

          {!erro && !plano && (
            <View style={styles.vazio}>
              <Ionicons name="restaurant-outline" size={22} color={paleta().inkFraco} />
              <Text style={styles.textoVazio}>
                {nome} ainda não tem plano alimentar ativo.
              </Text>
              <Text style={styles.ondeSeFaz}>Montar o plano continua no sistema.</Text>
            </View>
          )}

          {!!plano && (
            <>
              <View style={styles.topoDoPlano}>
                <Text style={styles.tituloDoPlano}>{plano.titulo}</Text>
                {!!plano.descricao && (
                  <Text style={styles.descricaoDoPlano}>{plano.descricao}</Text>
                )}

                {/* Enviado ou não. É o que o site não mostra de relance, e o
                    sintoma de esquecer aparece do lado do PACIENTE: ele abre o
                    app e não vê plano nenhum. */}
                <View style={[styles.selo, plano.enviadoEm ? styles.seloOk : styles.seloAviso]}>
                  <Ionicons
                    name={plano.enviadoEm ? 'checkmark-circle' : 'alert-circle-outline'}
                    size={14}
                    color={plano.enviadoEm ? paleta().cores.verde : paleta().cores.gold}
                  />
                  <Text
                    style={[
                      styles.textoDoSelo,
                      { color: plano.enviadoEm ? paleta().cores.verde : paleta().cores.gold },
                    ]}
                  >
                    {plano.enviadoEm
                      ? 'A paciente vê este plano no aplicativo'
                      : 'Ainda não enviado ao aplicativo'}
                  </Text>
                </View>
              </View>

              {plano.refeicoes.length === 0 && (
                <Text style={styles.ondeSeFaz}>
                  Este plano ainda não tem refeições montadas.
                </Text>
              )}

              {plano.refeicoes.map(r => {
                const total = kcalDaRefeicao(r)
                const faltando = semCaloriaEm(r)
                return (
                  <View key={r.id} style={styles.refeicao}>
                    <View style={styles.topoDaRefeicao}>
                      {!!r.horario && <Text style={styles.horario}>{r.horario}</Text>}
                      <Text style={styles.nomeDaRefeicao}>{r.nome}</Text>
                      {/* "—" quando NENHUM item tem caloria. Zero seria mentira:
                          é a diferença entre "esta refeição não tem caloria" e
                          "eu não sei a caloria desta refeição". Item 6. */}
                      <Text style={styles.kcalDaRefeicao}>
                        {total === null ? '—' : `${total} kcal`}
                      </Text>
                    </View>

                    {r.itens.length === 0 ? (
                      <Text style={styles.refeicaoVazia}>Sem itens.</Text>
                    ) : (
                      r.itens.map(i => (
                        /* Tocar no item abre a troca. É a única edição que esta
                           tela faz, e é a que ele pediu com a paciente na
                           frente: "agora pediu pra trocar". */
                        <Pressable
                          key={i.id}
                          onPress={() => setTrocando({ id: i.id, rotulo: i.rotulo })}
                          style={({ pressed }) => [styles.item, pressed && styles.pressionado]}
                          accessibilityRole="button"
                          accessibilityLabel={`${i.rotulo}. Toque para trocar por outro alimento.`}
                        >
                          <Text style={styles.rotuloDoItem} numberOfLines={2}>
                            {i.rotulo}
                          </Text>
                          {!!i.quantidade && (
                            <Text style={styles.quantidadeDoItem}>{i.quantidade}</Text>
                          )}
                          <Ionicons name="swap-horizontal" size={14} color={paleta().inkFraco} />
                        </Pressable>
                      ))
                    )}

                    {/* Dito, e não escondido: um total que ignora três itens sem
                        caloria é um total que ela some de cabeça e não bate. */}
                    {faltando > 0 && total !== null && (
                      <Text style={styles.semCaloria}>
                        {faltando === 1
                          ? 'Um item sem caloria cadastrada não entrou na conta.'
                          : `${faltando} itens sem caloria cadastrada não entraram na conta.`}
                      </Text>
                    )}
                  </View>
                )
              })}

              {/* O botão fica no FIM, e não no cabeçalho.
                  Gerar o PDF é o que ela faz depois de ler e concordar com o
                  que está ali -- no topo, seria a primeira coisa oferecida
                  sobre um plano que ela ainda não conferiu. */}
              <Pressable
                onPress={() => void gerarPdf()}
                disabled={gerando}
                style={({ pressed }) => [
                  styles.botaoPdf,
                  gerando && styles.botaoDesligado,
                  pressed && styles.pressionado,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Gerar o PDF deste plano"
              >
                {gerando ? (
                  <ActivityIndicator size="small" color={paleta().cores.branco} />
                ) : (
                  <>
                    <Ionicons name="document-text-outline" size={17} color={paleta().cores.branco} />
                    <Text style={styles.textoDoBotaoPdf}>Gerar PDF</Text>
                  </>
                )}
              </Pressable>

              <Text style={styles.ondeSeFaz}>
                O PDF abre a bandeja do telefone -- dá para mandar no WhatsApp,
                salvar ou imprimir. Trocar item e mudar quantidade continuam no
                sistema.
              </Text>
            </>
          )}
        </ScrollView>
      )}

      {!!trocando && (
        <FolhaDaTroca
          item={trocando}
          onFechar={() => setTrocando(null)}
          onTrocou={() => {
            setTrocando(null)
            void carregar()
          }}
        />
      )}
    </View>
  )
}

/* ──────────────────── A TROCA ────────────────────
 *
 * Busca, escolhe, pronto. Sem campo de gramagem e sem macro recalculando: a
 * quantidade fica IGUAL, e a folha diz isso ANTES de ela escolher -- não
 * depois, quando já não dá para desistir sem desfazer.
 *
 * E ela não confirma duas vezes. Escolher um alimento na lista JÁ é a
 * confirmação: a linha mostra o nome e a caloria, e um segundo cartão
 * perguntando "tem certeza?" sobre uma coisa reversível ensina a confirmar sem
 * ler -- e o que ela confirma sem ler depois é o cartão de cancelar consulta. */
function FolhaDaTroca({
  item,
  onFechar,
  onTrocou,
}: {
  item: { id: number; rotulo: string }
  onFechar: () => void
  onTrocou: () => void
}) {
  const styles = estilos()
  const [termo, setTermo] = useState('')
  const [achados, setAchados] = useState<AlimentoDaBusca[]>([])
  const [procurando, setProcurando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [recado, setRecado] = useState('')

  /* Descarta resposta velha: quem digita "arr" e depois "arroz" pode receber a
     de "arr" por último, e a lista mostraria o resultado da busca anterior.
     Mesmo mecanismo do `daVez` da lista de pacientes. */
  const daVez = useRef(0)

  useEffect(() => {
    const meu = ++daVez.current
    if (termo.trim().length < 3) {
      setAchados([])
      return
    }
    setProcurando(true)
    const espera = setTimeout(() => {
      void procurarAlimento(termo).then(r => {
        if (meu !== daVez.current) return
        setProcurando(false)
        if (r.tipo === 'ok') setAchados(r.alimentos)
        else setRecado(r.mensagem)
      })
    }, 350)
    return () => clearTimeout(espera)
  }, [termo])

  /* Sem lista de dependências -- põe este na frente do da tela do plano. */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!salvando) onFechar()
      return true
    })
    return () => sub.remove()
  })

  async function escolher(a: AlimentoDaBusca) {
    if (salvando) return
    setSalvando(true)
    setRecado('')
    const r = await trocarItem(item.id, a.id, a.nome)
    setSalvando(false)
    if (r.ok) onTrocou()
    else setRecado(r.mensagem)
  }

  return (
    <View style={styles.sobreposta}>
      <Pressable
        style={styles.fundoDaFolha}
        onPress={() => !salvando && onFechar()}
        accessibilityLabel="Fechar"
      />
      <View style={styles.folha}>
        <View style={styles.puxador} />
        <Text style={styles.tituloDaFolha} numberOfLines={1}>
          Trocar {item.rotulo}
        </Text>
        <Text style={styles.subtituloDaFolha}>
          A quantidade não muda. Para ajustar gramagem, o lugar é o sistema.
        </Text>

        <TextInput
          value={termo}
          onChangeText={setTermo}
          placeholder="Procurar alimento"
          placeholderTextColor={paleta().inkFraco}
          autoFocus
          autoCorrect={false}
          style={styles.campoDaBusca}
          accessibilityLabel="Procurar o alimento que vai entrar"
        />

        {!!recado && <Text style={styles.recadoDaFolha}>{recado}</Text>}

        {salvando ? (
          <View style={styles.centroDaFolha}>
            <ActivityIndicator color={paleta().cores.verde} />
          </View>
        ) : (
          <ScrollView
            style={styles.listaDaBusca}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {termo.trim().length < 3 ? (
              <Text style={styles.dicaDaFolha}>Escreva ao menos três letras.</Text>
            ) : procurando ? (
              <Text style={styles.dicaDaFolha}>Procurando...</Text>
            ) : achados.length === 0 ? (
              <Text style={styles.dicaDaFolha}>
                Nenhum alimento com esse nome na sua base nem na base pública.
              </Text>
            ) : (
              achados.map(a => (
                <Pressable
                  key={a.id}
                  onPress={() => void escolher(a)}
                  style={({ pressed }) => [styles.achado, pressed && styles.pressionado]}
                  accessibilityRole="button"
                  accessibilityLabel={'Trocar por ' + a.nome}
                >
                  <Text style={styles.nomeDoAchado} numberOfLines={2}>
                    {a.nome}
                  </Text>
                  {/* "—" quando não há caloria cadastrada. Zero seria mentira. */}
                  <Text style={styles.kcalDoAchado}>
                    {a.kcal100 === null ? '—' : Math.round(a.kcal100) + ' kcal/100g'}
                  </Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        )}
      </View>
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

    conteudo: { paddingHorizontal: 16, gap: 12 },

    erro: {
      fontFamily: FONTE.normal,
      fontSize: 13.5,
      color: t.cores.ink,
      backgroundColor: t.cores.verdeMenta,
      padding: 12,
      borderRadius: 10,
    },

    topoDoPlano: { gap: 6, paddingBottom: 2 },
    tituloDoPlano: {
      fontFamily: FONTE.bruta,
      fontSize: 24,
      color: t.cores.ink,
      letterSpacing: -0.8,
    },
    descricaoDoPlano: {
      fontFamily: FONTE.normal,
      fontSize: 13.5,
      color: t.inkSuave,
      lineHeight: 20,
    },
    selo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      alignSelf: 'flex-start',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    seloOk: { backgroundColor: t.cores.verdeMenta },
    seloAviso: { backgroundColor: t.cores.atencaoFundo },
    textoDoSelo: { fontFamily: FONTE.meia, fontSize: 12 },

    refeicao: {
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 2,
    },
    topoDaRefeicao: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 9,
      paddingBottom: 6,
    },
    horario: {
      fontFamily: FONTE.meia,
      fontSize: 13,
      color: t.inkFraco,
      fontVariant: ['tabular-nums'],
    },
    nomeDaRefeicao: { flex: 1, fontFamily: FONTE.forte, fontSize: 15, color: t.cores.ink },
    kcalDaRefeicao: {
      fontFamily: FONTE.meia,
      fontSize: 12.5,
      color: t.inkFraco,
      fontVariant: ['tabular-nums'],
    },

    item: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 10,
      paddingVertical: 5,
    },
    rotuloDoItem: { flex: 1, fontFamily: FONTE.normal, fontSize: 14.5, color: t.cores.ink },
    quantidadeDoItem: {
      fontFamily: FONTE.meia,
      fontSize: 13,
      color: t.inkSuave,
      fontVariant: ['tabular-nums'],
    },
    refeicaoVazia: { fontFamily: FONTE.normal, fontSize: 13, color: t.inkFraco, paddingVertical: 4 },
    semCaloria: {
      fontFamily: FONTE.normal,
      fontSize: 11.5,
      color: t.inkFraco,
      lineHeight: 16,
      paddingTop: 6,
    },

    botaoPdf: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: t.cores.verde,
      borderRadius: 14,
      paddingVertical: 13,
      marginTop: 4,
    },
    textoDoBotaoPdf: { fontFamily: FONTE.forte, fontSize: 14.5, color: t.cores.branco },
    /* Cor, e não opacidade: o tema tem um `desligado` medido justamente porque
       opacity destrói o contraste entre texto e fundo. */
    botaoDesligado: { backgroundColor: t.cores.desligado },
    pressionado: { opacity: 0.8 },

    /* ──── A FOLHA DA TROCA ──── */
    sobreposta: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end' },
    /* Escurece o que está atrás em vez de esconder: ela continua vendo a
       refeição de onde saiu, e é isso que diz que a folha é um degrau. */
    fundoDaFolha: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.35)' },
    folha: {
      backgroundColor: t.cores.cartao,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 18,
      paddingTop: 8,
      paddingBottom: 20,
      /* Altura fixa e não `flex`: a lista cresce e encolhe conforme ela digita,
         e uma folha que muda de altura a cada letra é a tela inteira pulando
         debaixo do dedo. */
      height: '68%',
    },
    puxador: {
      alignSelf: 'center',
      width: 38,
      height: 4,
      borderRadius: 2,
      backgroundColor: t.cores.borda,
      marginBottom: 10,
    },
    tituloDaFolha: {
      fontFamily: FONTE.forte,
      fontSize: 17,
      color: t.cores.ink,
      letterSpacing: -0.4,
    },
    subtituloDaFolha: {
      fontFamily: FONTE.normal,
      fontSize: 12.5,
      color: t.inkFraco,
      lineHeight: 17,
      marginTop: 3,
    },
    campoDaBusca: {
      backgroundColor: t.cores.superficie,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderRadius: 12,
      paddingHorizontal: 13,
      paddingVertical: 11,
      marginTop: 12,
      fontFamily: FONTE.normal,
      fontSize: 15,
      color: t.cores.ink,
    },
    recadoDaFolha: {
      fontFamily: FONTE.normal,
      fontSize: 12.5,
      color: t.cores.ink,
      lineHeight: 18,
      backgroundColor: t.cores.verdeMenta,
      padding: 10,
      borderRadius: 10,
      marginTop: 8,
    },
    centroDaFolha: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    listaDaBusca: { flex: 1, marginTop: 8 },
    achado: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: t.cores.borda,
    },
    nomeDoAchado: { flex: 1, fontFamily: FONTE.media, fontSize: 14.5, color: t.cores.ink },
    kcalDoAchado: {
      fontFamily: FONTE.normal,
      fontSize: 12,
      color: t.inkFraco,
      fontVariant: ['tabular-nums'],
    },
    dicaDaFolha: {
      fontFamily: FONTE.normal,
      fontSize: 13,
      color: t.inkFraco,
      textAlign: 'center',
      paddingVertical: 24,
      lineHeight: 18,
    },

    vazio: {
      alignItems: 'center',
      gap: 8,
      paddingVertical: 40,
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderRadius: 16,
    },
    textoVazio: { fontFamily: FONTE.normal, fontSize: 14, color: t.inkSuave, textAlign: 'center' },
    ondeSeFaz: {
      fontFamily: FONTE.normal,
      fontSize: 12,
      color: t.inkFraco,
      textAlign: 'center',
      lineHeight: 17,
      paddingHorizontal: 12,
    },
  }),
)
