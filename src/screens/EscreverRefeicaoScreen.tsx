import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
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
import { BuscarAlimentoScreen } from './BuscarAlimentoScreen'
import { buscarAlimentos, porcao, type Alimento } from '../lib/alimentos'
import { descricaoDe, gramasDe, lerRefeicao, type ItemLido } from '../lib/interpretador'
import { Ditado } from '../components/Ditado'
import { novaChave, type AlimentoEscolhido } from '../lib/plano'
import { milhar } from '../lib/formatar'
import { estilosDe, paleta } from '../lib/tema'

/* Escrever a refeição inteira de uma vez.
 *
 * A alternativa é a busca: digitar "pão", escolher, informar a quantidade,
 * voltar, digitar "café", escolher, informar, voltar. São seis toques por
 * alimento, e é aí que um leigo desiste de montar o próprio plano.
 *
 * Aqui ela escreve como fala — "2 fatias de pão integral, 1 xícara de café e
 * 200g de mamão" — e a tela mostra o que entendeu ANTES de gravar qualquer
 * coisa. Mostrar antes é o que separa isto de um chute: a pessoa confere linha
 * por linha, tira o que não era e adiciona o resto.
 *
 * O que não é encontrado na base fica visível como não encontrado, em vez de
 * sumir em silêncio. Sumir seria pior do que falhar: ela contaria com um
 * alimento que nunca entrou. */

type Linha = {
  lido: ItemLido
  /* undefined enquanto procura; null quando a base não tem. */
  alimento?: Alimento | null
  /* Os outros resultados da mesma busca. "Pão" traz pão francês, de forma, de
     leite — e o primeiro nem sempre é o que a pessoa quis. Sem eles, errar o
     alimento custava remover a linha e ir para a busca; com eles, custa dois
     toques. */
  alternativas?: Alimento[]
  /* O peso que a pessoa informou ao procurar o alimento à mão. Vence tudo: ela
     acabou de dizer, com precisão e olhando para o alimento certo, o que tinha
     dito de improviso ao falar. */
  gramasEscolhidos?: number | null
}

export function EscreverRefeicaoScreen({
  refeicao,
  onAdicionar,
  onFechar,
}: {
  /* Só para o título dizer onde isto vai cair. */
  refeicao: string
  onAdicionar: (itens: AlimentoEscolhido[]) => void
  onFechar: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const [texto, setTexto] = useState('')
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [procurando, setProcurando] = useState(false)
  const [conferido, setConferido] = useState(false)
  /* Qual linha está com a lista de alternativas aberta. */
  const [trocando, setTrocando] = useState<number | null>(null)
  /* O que deu errado no ditado. Vive aqui e não no componente porque a faixa
     aparece acima do campo, fora dele. */
  const [erroVoz, setErroVoz] = useState<string | null>(null)
  /* A linha cujo alimento a base não achou e a pessoa foi procurar à mão.
     Guarda o índice porque é a linha que vai receber o resultado. */
  const [procurandoNaMao, setProcurandoNaMao] = useState<number | null>(null)

  /* Fecha o teclado ANTES de sair.
   *
   * Com o teclado no ar, a janela do Android está encolhida — o edge-to-edge
   * não redimensiona, mas o KeyboardAvoidingView encolhe o conteúdo. Sair
   * assim faz a tela de trás ser medida no tamanho errado e se desenhar
   * comprimida, e ela só se conserta quando algo a força a medir de novo.
   *
   * Todas as saídas passam por aqui: o botão de voltar, o do aparelho e o
   * "adicionar". Uma delas de fora e o defeito volta pelo caminho esquecido. */
  function sair() {
    Keyboard.dismiss()
    onFechar()
  }

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      sair()
      return true
    })
    return () => sub.remove()
  })

  /* Procura cada item na base. Uma consulta por linha, e não uma só com tudo:
     a busca do banco recebe um termo, e "pão café mamão" não é um alimento. */
  async function conferir() {
    const itens = lerRefeicao(texto)
    if (itens.length === 0) return

    /* O teclado ocupa metade da tela, e o que a pessoa precisa ver agora é a
       lista do que foi entendido — que nasce logo abaixo do botão. */
    Keyboard.dismiss()

    setProcurando(true)
    setConferido(true)
    setLinhas(itens.map(lido => ({ lido })))

    const achados = await Promise.all(
      itens.map(async i => {
        const r = await buscarAlimentos(i.nome)
        /* O primeiro entra escolhido; os próximos ficam à mão. A busca do banco
           já ordena por relevância, então acertar de primeira é o caso comum —
           mas quando erra, trocar tem de ser barato. */
        return r.tipo === 'ok' ? r.alimentos.slice(0, 6) : []
      }),
    )

    setLinhas(
      itens.map((lido, i) => ({
        lido,
        alimento: achados[i][0] ?? null,
        alternativas: achados[i].slice(1),
      })),
    )
    setProcurando(false)
  }

  /* Quantos gramas este item representa.
   *
   * Três fontes, nesta ordem: o peso que a pessoa escreveu ("200 g"), o peso da
   * medida caseira que a base conhece ("1 fatia = 25 g") e, faltando os dois,
   * nada — que é honesto. Inventar o peso de uma fatia colocaria na soma do dia
   * um número que ninguém mediu. */
  function gramasDaLinha(l: Linha): number | null {
    if (l.gramasEscolhidos !== undefined && l.gramasEscolhidos !== null) return l.gramasEscolhidos

    const escrito = gramasDe(l.lido)
    if (escrito !== null) return escrito

    const a = l.alimento
    if (a?.porcaoG && a.medidaCaseira && ehMesmaMedida(a.medidaCaseira, l.lido.medida)) {
      return l.lido.quantidade * a.porcaoG
    }
    return null
  }

  /* Troca o alimento escolhido por uma das alternativas, e devolve o antigo
     para a lista: quem trocou por engano desfaz pelo mesmo caminho. */
  function trocar(indice: number, novo: Alimento) {
    setLinhas(atuais =>
      atuais.map((l, i) => {
        if (i !== indice) return l
        const outras = (l.alternativas ?? []).filter(a => a.id !== novo.id)
        return {
          ...l,
          alimento: novo,
          alternativas: l.alimento ? [l.alimento, ...outras] : outras,
        }
      }),
    )
    setTrocando(null)
  }

  function remover(indice: number) {
    setLinhas(atuais => atuais.filter((_, i) => i !== indice))
  }

  function adicionar() {
    const escolhidos: AlimentoEscolhido[] = []

    for (const l of linhas) {
      if (!l.alimento) continue
      escolhidos.push({
        chave: novaChave(),
        alimentoId: l.alimento.id,
        nome: l.alimento.nome,
        marca: l.alimento.marca,
        descricao: descricaoDe(l.lido),
        gramasTotais: gramasDaLinha(l),
        caloriasPor100g: l.alimento.calorias,
        proteinasPor100g: l.alimento.proteinas,
        carboidratosPor100g: l.alimento.carboidratos,
        gordurasPor100g: l.alimento.gorduras,
        fibrasPor100g: l.alimento.fibras,
      })
    }

    if (escolhidos.length > 0) onAdicionar(escolhidos)
    sair()
  }

  const encontrados = linhas.filter(l => l.alimento).length
  const perdidos = linhas.filter(l => l.alimento === null).length

  /* A busca à mão, por cima desta tela. O resultado volta para a MESMA linha —
     ela deixa de ser "não encontrado" e passa a contar na soma, sem a pessoa
     ter de reescrever a refeição inteira. */
  if (procurandoNaMao !== null) {
    const linha = linhas[procurandoNaMao]
    return (
      <BuscarAlimentoScreen
        refeicao={refeicao}
        termoInicial={linha?.lido.nome ?? ''}
        onFechar={() => setProcurandoNaMao(null)}
        onAdicionar={(escolhido: AlimentoEscolhido) => {
          const i = procurandoNaMao
          setProcurandoNaMao(null)
          setLinhas(atuais =>
            atuais.map((l, j) =>
              j === i
                ? {
                    ...l,
                    /* O peso vem do que a pessoa informou na busca, e substitui
                       a quantidade falada: ela acabou de dizer, com mais
                       precisão, o que tinha dito antes de improviso. */
                    alimento: {
                      id: escolhido.alimentoId ?? 0,
                      nome: escolhido.nome,
                      marca: escolhido.marca,
                      calorias: escolhido.caloriasPor100g,
                      proteinas: escolhido.proteinasPor100g,
                      carboidratos: escolhido.carboidratosPor100g,
                      gorduras: escolhido.gordurasPor100g,
                      fibras: escolhido.fibrasPor100g,
                    } as Alimento,
                    gramasEscolhidos: escolhido.gramasTotais,
                    /* A descrição também: "1 copo (200 g)" que ela escolheu diz
                       mais do que o "um copo" que ela falou. */
                    lido: { ...l.lido, original: escolhido.descricao || l.lido.original },
                  }
                : l,
            ),
          )
        }}
      />
    )
  }

  return (
    <KeyboardAvoidingView
      style={[styles.tela, { paddingTop: top + 8 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.cabecalho}>
        <Pressable
          onPress={sair}
          style={styles.botaoVoltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela} numberOfLines={1}>
          Falar ou escrever
        </Text>
        <View style={styles.botaoVoltar} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.conteudo, { paddingBottom: bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.explicacao}>
          Fale ou escreva o seu {refeicao.toLowerCase()} como você contaria para alguém.
          Separe por vírgula ou uma por linha.
        </Text>

        <Ditado
          onTexto={t => {
            setErroVoz(null)
            /* Junta ao que já estava escrito, em linha nova. Substituir
               apagaria o que a pessoa digitou antes de lembrar que podia
               falar o resto. */
            setTexto(atual => (atual.trim() ? atual.trim() + "\n" + t : t))
            setConferido(false)
          }}
          onErro={setErroVoz}
        />

        {erroVoz && (
          <View style={styles.blocoErro}>
            <Text style={styles.textoErro}>{erroVoz}</Text>
          </View>
        )}

        <TextInput
          value={texto}
          onChangeText={t => {
            setTexto(t)
            setConferido(false)
          }}
          placeholder={'2 fatias de pão integral\n1 xícara de café\n200g de mamão'}
          placeholderTextColor={paleta().inkFraco}
          multiline
          keyboardAppearance="dark"
          style={styles.campo}
          accessibilityLabel="O que você comeu"
        />

        <Pressable
          onPress={conferir}
          disabled={!texto.trim() || procurando}
          style={({ pressed }) => [
            styles.botaoConferir,
            (!texto.trim() || procurando) && styles.botaoDesligado,
            pressed && styles.pressionado,
          ]}
          accessibilityRole="button"
        >
          {procurando ? (
            <ActivityIndicator size="small" color={paleta().cores.branco} />
          ) : (
            <>
              <Ionicons name="sparkles-outline" size={17} color={paleta().cores.branco} />
              <Text style={styles.textoBotaoConferir}>Ver o que eu entendi</Text>
            </>
          )}
        </Pressable>

        {conferido && !procurando && linhas.length === 0 && (
          <Text style={styles.vazio}>
            Não consegui separar nenhum alimento nesse texto. Tente uma linha por alimento, como
            "2 fatias de pão".
          </Text>
        )}

        {linhas.length > 0 && (
          <>
            <Text style={styles.tituloSecao}>O que eu entendi</Text>

            {linhas.map((l, i) => {
              const gramas = gramasDaLinha(l)
              const kcal =
                l.alimento && gramas !== null ? porcao(l.alimento.calorias, gramas) : null

              return (
                <View key={`${l.lido.original}-${i}`} style={styles.linha}>
                  <Pressable
                    style={styles.textoLinha}
                    onPress={() =>
                      (l.alternativas?.length ?? 0) > 0 &&
                      setTrocando(trocando === i ? null : i)
                    }
                    disabled={(l.alternativas?.length ?? 0) === 0}
                    accessibilityRole="button"
                    accessibilityLabel={
                      (l.alternativas?.length ?? 0) > 0
                        ? `Trocar ${l.alimento?.nome ?? l.lido.nome} por outro alimento`
                        : undefined
                    }
                  >
                    <View style={styles.linhaNome}>
                      <Text style={styles.nomeLinha} numberOfLines={1}>
                        {l.alimento ? l.alimento.nome : l.lido.nome}
                      </Text>
                      {(l.alternativas?.length ?? 0) > 0 && (
                        <Ionicons
                          name={trocando === i ? 'chevron-up' : 'swap-horizontal'}
                          size={14}
                          color={paleta().inkFraco}
                        />
                      )}
                    </View>

                    <Text style={styles.detalheLinha} numberOfLines={1}>
                      {descricaoDe(l.lido)}
                      {gramas !== null && ` · ${milhar(gramas)} g`}
                      {kcal !== null && ` · ${milhar(kcal)} kcal`}
                    </Text>

                    {/* Não achar deixou de ser um beco.
                        Antes isto era só um aviso, e o item sumia da conta: a
                        pessoa lia "fica de fora" e a única saída era abandonar
                        a tela e procurar o alimento à mão, do zero. Agora a
                        própria linha leva à busca, já com o termo dentro. */}
                    {l.alimento === null && (
                      <Pressable
                        onPress={() => setProcurandoNaMao(i)}
                        style={({ pressed }) => [styles.procurar, pressed && styles.pressionado]}
                        accessibilityRole="button"
                        accessibilityLabel={`Procurar ${l.lido.nome} na base`}
                      >
                        <Ionicons name="search-outline" size={14} color={paleta().cores.verde} />
                        <Text style={styles.textoProcurar}>
                          Não achei "{l.lido.nome}". Toque para procurar.
                        </Text>
                      </Pressable>
                    )}
                    {l.alimento && gramas === null && (
                      <Text style={styles.semPeso}>
                        Sem peso: entra no plano, mas fora da soma.
                      </Text>
                    )}

                    {/* As outras opções da mesma busca, abertas sob a linha em
                        vez de numa folha por cima: o que se compara é o nome
                        contra o nome, e uma folha esconderia o que está sendo
                        trocado. */}
                    {trocando === i &&
                      (l.alternativas ?? []).map(a => (
                        <Pressable
                          key={a.id}
                          onPress={() => trocar(i, a)}
                          style={({ pressed }) => [styles.alternativa, pressed && styles.pressionado]}
                          accessibilityRole="button"
                        >
                          <Ionicons name="return-down-forward" size={13} color={paleta().inkFraco} />
                          <Text style={styles.textoAlternativa} numberOfLines={1}>
                            {a.nome}
                            {a.marca ? ` · ${a.marca}` : ''}
                          </Text>
                        </Pressable>
                      ))}
                  </Pressable>

                  <Pressable
                    onPress={() => remover(i)}
                    hitSlop={10}
                    style={({ pressed }) => [styles.remover, pressed && styles.pressionado]}
                    accessibilityRole="button"
                    accessibilityLabel={`Remover ${l.lido.nome}`}
                  >
                    <Ionicons name="close" size={16} color={paleta().inkFraco} />
                  </Pressable>
                </View>
              )
            })}

            <Pressable
              onPress={adicionar}
              disabled={encontrados === 0}
              style={({ pressed }) => [
                styles.botaoAdicionar,
                encontrados === 0 && styles.botaoDesligado,
                pressed && styles.pressionado,
              ]}
              accessibilityRole="button"
            >
              <Ionicons name="add" size={18} color={paleta().cores.branco} />
              <Text style={styles.textoBotaoConferir}>
                {encontrados === 0
                  ? 'Nenhum alimento encontrado'
                  : `Adicionar ${encontrados} ${encontrados === 1 ? 'alimento' : 'alimentos'}`}
              </Text>
            </Pressable>

            {perdidos > 0 && (
              <Text style={styles.rodape}>
                {perdidos === 1
                  ? '1 item não foi encontrado e ficará de fora.'
                  : `${perdidos} itens não foram encontrados e ficarão de fora.`}{' '}
                Você pode adicioná-los depois pela busca.
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

/* "fatia" da base e "fatia" do texto são a mesma medida; "colher de sopa" e
   "colher" também. Comparação frouxa de propósito: exigir igualdade exata
   descartaria o peso conhecido por uma diferença de plural. */
function ehMesmaMedida(daBase: string, doTexto: string): boolean {
  const n = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
  const a = n(daBase)
  const b = n(doTexto)
  return a === b || a.startsWith(b) || b.startsWith(a)
}

const estilos = estilosDe(t =>
  StyleSheet.create({
  tela: { flex: 1, backgroundColor: t.cores.fundo },

  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  botaoVoltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  tituloTela: { flexShrink: 1, fontSize: 17, fontWeight: '800', color: t.cores.ink },

  conteudo: { paddingHorizontal: 20, paddingTop: 4, gap: 12 },
  explicacao: { fontSize: 13.5, color: t.inkSuave, lineHeight: 20 },

  campo: {
    minHeight: 120,
    maxHeight: 200,
    backgroundColor: t.cores.superficie,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.borda,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    lineHeight: 22,
    color: t.cores.ink,
    textAlignVertical: 'top',
  },

  blocoErro: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.erroBorda,
    backgroundColor: t.cores.erroFundo,
  },
  textoErro: { fontSize: 13, lineHeight: 18, color: t.cores.erroTexto },

  botaoConferir: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 13,
    backgroundColor: t.cores.verde,
  },
  botaoAdicionar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 13,
    backgroundColor: t.cores.verde,
    marginTop: 6,
  },
  botaoDesligado: { opacity: 0.4 },
  pressionado: { opacity: 0.75 },
  textoBotaoConferir: { fontSize: 15, fontWeight: '800', color: t.cores.branco },

  tituloSecao: {
    fontSize: 12,
    fontWeight: '700',
    color: t.inkFraco,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: 6,
  },

  linha: {
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
  textoLinha: { flex: 1, gap: 2 },
  linhaNome: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  alternativa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingLeft: 2,
  },
  textoAlternativa: { flex: 1, fontSize: 13, color: t.inkMedio },
  nomeLinha: { fontSize: 15, fontWeight: '700', color: t.cores.ink },
  detalheLinha: { fontSize: 12.5, color: t.inkMedio },
  naoAchei: { fontSize: 12, color: t.cores.gold },
  procurar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  textoProcurar: { fontSize: 12, fontWeight: '600', color: t.cores.verde },
  semPeso: { fontSize: 12, color: t.inkSuave },
  remover: { padding: 4 },

  vazio: { fontSize: 13.5, color: t.inkSuave, lineHeight: 20 },
  rodape: { fontSize: 12.5, color: t.inkFraco, lineHeight: 18 },
  }),
)
