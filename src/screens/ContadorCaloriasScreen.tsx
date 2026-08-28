import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BuscarAlimentoScreen } from './BuscarAlimentoScreen'
import { EscreverRefeicaoScreen } from './EscreverRefeicaoScreen'
import {
  REFEICOES,
  ajustarQuantidade,
  analisarFoto,
  apagarConsumo,
  carregarConsumo,
  carregarFrequentes,
  carregarUltimaRefeicao,
  moverDeRefeicao,
  porRefeicao,
  refeicaoPelaHora,
  registrarConsumo,
  totaisConsumidos,
  type Estimativa,
  type ItemConsumo,
  type ItemFrequente,
  type ItemParaGravar,
  type UltimaRefeicao,
} from '../lib/consumo'
import { METAS_VAZIAS, carregarMetas, type Metas } from '../lib/metas'
import { carregarPlanoAtivo, type PlanoCompleto, type RefeicaoSalva } from '../lib/plano'
import { porcao } from '../lib/alimentos'
import type { AlimentoEscolhido, Nutrientes } from '../lib/plano'
import { horaCurta, milhar } from '../lib/formatar'
import { cores, inkFraco, inkMedio, inkSuave } from '../theme'

/* O contador de calorias: o que a pessoa comeu hoje, contra a meta dela.
 *
 * Quatro portas para registrar, e a escolha entre elas é sobre esforço, não sobre
 * capricho: fotografar resolve o prato de restaurante que ninguém sabe pesar;
 * a busca resolve o alimento embalado, com número de tabela; e "do meu plano"
 * resolve o caso mais comum de todos — quem montou um plano e comeu o que
 * planejou não deveria ter de descrever isso de novo, alimento por alimento; e
 * "repetir" resolve o dia comum, em que se come o mesmo de ontem.
 *
 * A refeição é escolhida UMA vez, no alto, e vale para as quatro portas. Perguntar
 * "em qual refeição?" no fim de cada fluxo somaria um toque a cada registro, e
 * são vários por dia. */
export function ContadorCaloriasScreen({
  contaId,
  onFechar,
  onMudou,
}: {
  contaId: string
  onFechar: () => void
  /* A tela inicial mostra o mesmo consumo; avisado ao fechar, e não a cada item,
     para não refazer a busca da Home a cada alimento registrado. */
  onMudou: () => void
}) {
  const { top, bottom } = useSafeAreaInsets()
  const [itens, setItens] = useState<ItemConsumo[]>([])
  const [metas, setMetas] = useState<Metas>(METAS_VAZIAS)
  const [plano, setPlano] = useState<PlanoCompleto | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [mudou, setMudou] = useState(false)
  const [refeicao, setRefeicao] = useState(() => refeicaoPelaHora())

  /* null = a tela principal. As quatro portas abrem por cima dela. */
  const [porta, setPorta] = useState<'busca' | 'plano' | 'repetir' | 'escrever' | null>(null)
  /* O que a pessoa já come nesta refeição. Carregado só quando a porta abre —
     são duas consultas que a maioria das visitas não usa, e pagá-las na abertura
     da tela atrasaria o caso comum por causa do caso eventual. */
  const [frequentes, setFrequentes] = useState<ItemFrequente[]>([])
  const [ultima, setUltima] = useState<UltimaRefeicao | null>(null)
  const [buscandoRepetir, setBuscandoRepetir] = useState(false)
  /* O item do diário com o menu de correção aberto. Errar a refeição e comer
     diferente do que se anotou são os dois enganos comuns, e até aqui os dois
     custavam apagar e descrever tudo de novo. */
  const [acoesDe, setAcoesDe] = useState<ItemConsumo | null>(null)
  const [analisando, setAnalisando] = useState(false)
  /* A estimativa esperando confirmação. Nada é gravado antes de a pessoa ver o
     número — a IA erra, e um item errado no diário estraga o total do dia. */
  const [estimativa, setEstimativa] = useState<Estimativa | null>(null)

  useEffect(() => {
    let ativo = true

    Promise.all([carregarConsumo(contaId), carregarMetas(contaId), carregarPlanoAtivo(contaId)]).then(
      ([rConsumo, rMetas, rPlano]) => {
        if (!ativo) return

        if (rConsumo.tipo === 'erro') setErro(rConsumo.mensagem)
        else setItens(rConsumo.itens)
        if (rMetas.tipo === 'ok') setMetas(rMetas.metas)
        if (rPlano.tipo === 'ok') setPlano(rPlano.plano)

        setCarregando(false)
      },
    )

    return () => {
      ativo = false
    }
  }, [contaId])

  /* O voltar do Android dentro desta tela.
   *
   * Sem isto, quem abre a busca, digita "pão" e aperta voltar perde o contador
   * inteiro e cai na tela inicial — em vez de voltar para a refeição que estava
   * montando. O App tem o seu próprio tratamento, mas ele só enxerga as telas
   * que ele mesmo abriu; o que acontece DENTRO desta é esta tela que sabe.
   *
   * Registrado depois do App de propósito: o React Native chama os tratadores
   * na ordem inversa do registro, então o mais interno decide primeiro — que é
   * o que faz o voltar descascar uma camada por vez. */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (acoesDe) {
        setAcoesDe(null)
        return true
      }
      /* A estimativa da foto vem por cima de tudo, inclusive das portas. */
      if (estimativa) {
        setEstimativa(null)
        return true
      }
      if (porta) {
        setPorta(null)
        return true
      }
      /* Nada aberto aqui dentro: devolve o evento, e quem fecha a tela é o App
         — que precisa avisar a Home de que houve mudança. */
      return false
    })

    return () => sub.remove()
  }, [porta, estimativa, acoesDe])

  function fechar() {
    if (mudou) onMudou()
    onFechar()
  }

  async function gravar(novos: ItemParaGravar[]) {
    setErro('')
    const r = await registrarConsumo(contaId, novos)

    if (r.tipo === 'erro') {
      setErro(r.mensagem)
      return
    }

    setMudou(true)
    setItens(atuais => [...atuais, ...r.itens])
  }

  async function apagar(item: ItemConsumo) {
    /* Some da lista na hora e volta se o banco recusar — mesma escolha da água
       e do peso. A lista é ordenada por relógio, então ele reaparece no lugar. */
    setErro('')
    setItens(atuais => atuais.filter(i => i.id !== item.id))

    const falha = await apagarConsumo(item.id)

    if (falha) {
      setItens(atuais =>
        [...atuais, item].sort((a, b) => a.comidoEm.localeCompare(b.comidoEm)),
      )
      setErro(falha.erro)
      return
    }

    setMudou(true)
  }

  /* Muda a refeição de um item já registrado.
   *
   * Otimista, como o apagar: a lista se reorganiza na hora e volta atrás se o
   * banco recusar. A correção é de um toque, e esperar a ida e volta para ver o
   * item mudar de grupo faria parecer que nada aconteceu. */
  async function mover(item: ItemConsumo, destino: string) {
    setAcoesDe(null)
    if (destino === item.refeicao) return

    setErro('')
    setItens(atuais => atuais.map(i => (i.id === item.id ? { ...i, refeicao: destino } : i)))

    const falha = await moverDeRefeicao(item.id, destino)

    if (falha) {
      setItens(atuais => atuais.map(i => (i.id === item.id ? item : i)))
      setErro(falha.erro)
      return
    }

    setMudou(true)
  }

  /* Comi metade, comi o dobro. Proporção, e não peso novo: a tabela guarda os
     nutrientes absolutos da porção e não o quanto era, então dobrar tudo é a
     única conta que fecha sem inventar um número que ninguém informou. */
  async function ajustar(item: ItemConsumo, fator: number) {
    setAcoesDe(null)
    setErro('')

    const r = await ajustarQuantidade(item, fator)

    if (r.tipo === 'erro') {
      setErro(r.mensagem)
      return
    }

    setItens(atuais => atuais.map(i => (i.id === r.item.id ? r.item : i)))
    setMudou(true)
  }

  async function fotografar(origem: 'camera' | 'galeria') {
    setErro('')
    setAnalisando(true)

    const r = await analisarFoto(origem)
    setAnalisando(false)

    if (r.tipo === 'erro') setErro(r.mensagem)
    else if (r.tipo === 'ok') setEstimativa(r.estimativa)
    /* 'cancelado' não é erro: a pessoa desistiu da foto e a tela fica como
       estava, sem aviso nenhum. */
  }

  /* Abre a porta do repetir e busca as duas listas.
   *
   * A busca refaz-se a cada abertura em vez de guardar o que já veio: a pessoa
   * registra algo, fecha, abre de novo — e o que ela acabou de comer precisa
   * aparecer entre os frequentes, senão a lista parece desatualizada logo no
   * momento em que ela está prestando atenção nela. */
  async function abrirRepetir() {
    setPorta('repetir')
    setBuscandoRepetir(true)
    setFrequentes([])
    setUltima(null)

    const [rFreq, rUlt] = await Promise.all([
      carregarFrequentes(contaId, refeicao),
      carregarUltimaRefeicao(contaId, refeicao),
    ])

    setBuscandoRepetir(false)
    /* Falha aqui não vira aviso vermelho: a porta é um atalho, e quem não
       conseguir carregá-la ainda tem as outras três. Uma lista vazia com o
       texto de "nada ainda" diz o suficiente. */
    if (rFreq.tipo === 'ok') setFrequentes(rFreq.itens)
    if (rUlt.tipo === 'ok') setUltima(rUlt.refeicao)
  }

  /* Um frequente vira consumo. Os nutrientes vão como estão: já são absolutos
     da porção, porque saíram de um registro anterior — não passam pela conversão
     de 100 g que o plano e a busca precisam. */
  function repetirItem(f: ItemFrequente) {
    gravar([
      {
        refeicao,
        nome: f.nome,
        descricao: f.descricao,
        calorias: f.calorias,
        proteinas: f.proteinas,
        carboidratos: f.carboidratos,
        gorduras: f.gorduras,
        fibras: f.fibras,
        origem: 'manual',
        /* Sem confiança: ela existe para marcar estimativa de foto. Repetir o
           que já foi registrado herda a exatidão do original, seja qual for. */
        confianca: null,
      },
    ])
  }

  /* A refeição inteira de outro dia, de uma vez. */
  function repetirUltima() {
    if (!ultima) return
    setPorta(null)
    gravar(
      ultima.itens.map(i => ({
        refeicao,
        nome: i.nome,
        descricao: i.descricao,
        calorias: i.calorias,
        proteinas: i.proteinas,
        carboidratos: i.carboidratos,
        gorduras: i.gorduras,
        fibras: i.fibras,
        origem: 'manual' as const,
        confianca: null,
      })),
    )
  }

  /* Uma refeição inteira do plano vira consumo de uma vez.
   *
   * O rótulo gravado é o DO PLANO ("Pré-treino"), e não o da faixa lá em cima:
   * quem registra o pré-treino do plano comeu o pré-treino, mesmo que o relógio
   * ache que é hora do almoço. */
  function comerDoPlano(r: RefeicaoSalva) {
    setPorta(null)
    gravar(r.itens.map(i => doPlano(i, r.rotulo)))
  }

  if (porta === 'escrever') {
    return (
      <EscreverRefeicaoScreen
        refeicao={refeicao}
        onFechar={() => setPorta(null)}
        onAdicionar={novos => gravar(novos.map(a => doAlimento(a, refeicao)))}
      />
    )
  }

  if (porta === 'busca') {
    return (
      <BuscarAlimentoScreen
        refeicao={refeicao}
        motivo="consumo"
        onAdicionar={a => gravar([doAlimento(a, refeicao)])}
        onFechar={() => setPorta(null)}
      />
    )
  }

  const totais = totaisConsumidos(itens)
  const grupos = porRefeicao(itens)

  return (
    <View style={[styles.tela, { paddingTop: top + 8 }]}>
      <View style={styles.cabecalho}>
        <Pressable
          onPress={fechar}
          style={styles.botaoVoltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela}>Contador de calorias</Text>
        <View style={styles.botaoVoltar} />
      </View>

      {carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator color={cores.verde} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.conteudo, { paddingBottom: Math.max(bottom, 16) + 16 }]}
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
        >
          <CartaoDoDia totais={totais} metas={metas} />

          {/* ── A refeição, escolhida uma vez ── */}
          <View style={styles.bloco}>
            <Text style={styles.tituloBloco}>Registrar em</Text>
            <View style={styles.chips}>
              {REFEICOES.map(r => (
                <Pressable
                  key={r}
                  onPress={() => setRefeicao(r)}
                  style={({ pressed }) => [
                    styles.chip,
                    refeicao === r && styles.chipAtivo,
                    pressed && styles.chipPressionado,
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: refeicao === r }}
                >
                  <Text style={[styles.textoChip, refeicao === r && styles.textoChipAtivo]}>
                    {r}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* ── As três portas ── */}
          <View style={styles.portas}>
            <Porta
              icone="camera-outline"
              titulo="Fotografar"
              detalhe="A IA estima"
              ocupada={analisando}
              onPress={() => fotografar('camera')}
              onLongPress={() => fotografar('galeria')}
            />
            <Porta
              icone="search-outline"
              titulo="Buscar"
              detalhe="Tabela"
              onPress={() => setPorta('busca')}
            />
            <Porta
              icone="nutrition-outline"
              titulo="Do meu plano"
              detalhe={plano ? 'Um toque' : 'Sem plano'}
              desligada={!plano}
              onPress={() => setPorta('plano')}
            />
            {/* A quarta porta resolve o caso mais frequente de todos: comer
                hoje o mesmo que ontem. As outras três descrevem comida nova. */}
            <Porta
              icone="repeat-outline"
              titulo="Repetir"
              detalhe="O de sempre"
              onPress={abrirRepetir}
            />
            {/* Escrever a refeição inteira: a porta que dispensa buscar
                alimento por alimento. Fica por último porque erra mais que as
                outras — e quem escolhe assumir isso o faz de propósito. */}
            <Porta
              icone="create-outline"
              titulo="Escrever"
              detalhe="Tudo de uma vez"
              onPress={() => setPorta('escrever')}
            />
          </View>

          <Text style={styles.dicaPortas}>
            Segure em "Fotografar" para escolher uma foto da galeria em vez de tirar na hora.
          </Text>

          {!!erro && (
            <View style={styles.blocoErro}>
              <Text style={styles.tituloErro}>Não deu certo</Text>
              {/* A mensagem crua junto. Depois da correção da edge function ela
                  distingue foto ruim de chave errada — antes as duas chegavam
                  aqui como "não identifiquei o alimento". */}
              <Text style={styles.detalheErro}>{erro}</Text>
            </View>
          )}

          {/* ── O dia ── */}
          {itens.length === 0 ? (
            <View style={styles.bloco}>
              <Text style={styles.tituloBloco}>Hoje</Text>
              <Text style={styles.vazio}>
                Nada registrado ainda. Escolha a refeição acima e use uma das quatro portas.
              </Text>
            </View>
          ) : (
            grupos.map(g => (
              <View key={g.refeicao} style={styles.bloco}>
                <View style={styles.linhaTituloBloco}>
                  <Text style={styles.tituloBloco}>{g.refeicao}</Text>
                  <Text style={styles.kcalGrupo}>
                    {(() => {
                      const t = totaisConsumidos(g.itens)
                      return t.calorias === null ? '—' : `${milhar(t.calorias)} kcal`
                    })()}
                  </Text>
                </View>

                {g.itens.map(i => (
                  <LinhaItem
                    key={i.id}
                    item={i}
                    onApagar={() => apagar(i)}
                    onCorrigir={() => setAcoesDe(i)}
                  />
                ))}
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* ── Confirmar a estimativa da foto ── */}
      {estimativa && (
        <ConfirmarFoto
          estimativa={estimativa}
          refeicao={refeicao}
          onDescartar={() => setEstimativa(null)}
          onRegistrar={() => {
            const e = estimativa
            setEstimativa(null)
            gravar([
              {
                refeicao,
                nome: e.descricao,
                descricao: e.porcaoEstimada || null,
                calorias: e.calorias,
                proteinas: e.proteinas,
                carboidratos: e.carboidratos,
                gorduras: e.gorduras,
                fibras: e.fibras,
                origem: 'foto',
                confianca: e.confianca,
              },
            ])
          }}
        />
      )}

      {/* ── Escolher a refeição do plano ── */}
      {porta === 'plano' && plano && (
        <EscolherDoPlano
          plano={plano}
          onEscolher={comerDoPlano}
          onFechar={() => setPorta(null)}
        />
      )}

      {acoesDe && (
        <AcoesDoItem
          item={acoesDe}
          onMover={destino => mover(acoesDe, destino)}
          onAjustar={fator => ajustar(acoesDe, fator)}
          onApagar={() => { const i = acoesDe; setAcoesDe(null); apagar(i) }}
          onFechar={() => setAcoesDe(null)}
        />
      )}

      {porta === 'repetir' && (
        <Repetir
          refeicao={refeicao}
          buscando={buscandoRepetir}
          ultima={ultima}
          frequentes={frequentes}
          onRepetirUltima={repetirUltima}
          onRepetirItem={repetirItem}
          onFechar={() => setPorta(null)}
        />
      )}

      {analisando && (
        <View style={styles.veu} pointerEvents="auto">
          <View style={styles.caixaAnalise}>
            <ActivityIndicator color={cores.verde} />
            <Text style={styles.textoAnalise}>Analisando a foto…</Text>
          </View>
        </View>
      )}
    </View>
  )
}

/* ── Conversões ────────────────────────────────────────────────────────────
   O plano e a busca guardam nutrientes POR 100 g mais o peso; o consumo guarda
   o valor absoluto da porção. A conversão acontece aqui, na fronteira, e não
   nas duas pontas — ver o comentário da coluna na migração. */

const absolutos = (n: Nutrientes) => ({
  calorias: n.gramasTotais === null ? null : porcao(n.caloriasPor100g, n.gramasTotais),
  proteinas: n.gramasTotais === null ? null : porcao(n.proteinasPor100g, n.gramasTotais),
  carboidratos: n.gramasTotais === null ? null : porcao(n.carboidratosPor100g, n.gramasTotais),
  gorduras: n.gramasTotais === null ? null : porcao(n.gordurasPor100g, n.gramasTotais),
  fibras: n.gramasTotais === null ? null : porcao(n.fibrasPor100g, n.gramasTotais),
})

const doAlimento = (a: AlimentoEscolhido, refeicao: string): ItemParaGravar => ({
  refeicao,
  nome: a.nome,
  descricao: a.descricao,
  ...absolutos(a),
  origem: 'busca',
  confianca: null,
  alimentoId: a.alimentoId,
})

const doPlano = (
  i: Nutrientes & { nome: string; descricao: string; alimentoId: number | null },
  refeicao: string,
): ItemParaGravar => ({
  refeicao,
  nome: i.nome,
  descricao: i.descricao,
  ...absolutos(i),
  origem: 'plano',
  confianca: null,
  alimentoId: i.alimentoId,
})

/* ── Cartão do dia ─────────────────────────────────────────────────────────*/

function CartaoDoDia({ totais, metas }: { totais: ReturnType<typeof totaisConsumidos>; metas: Metas }) {
  const comido = totais.calorias ?? 0
  const meta = metas.calorias

  return (
    <View style={styles.cartaoDia}>
      <View style={styles.linhaTituloDia}>
        <Ionicons name="flame-outline" size={16} color={cores.branco} />
        <Text style={styles.tituloDia}>Hoje</Text>
      </View>

      <View style={styles.linhaValorDia}>
        <Text style={styles.valorDia}>{milhar(comido)}</Text>
        <Text style={styles.unidadeDia}>kcal</Text>
        {meta !== null && <Text style={styles.metaDia}>de {milhar(meta)} kcal</Text>}
      </View>

      {meta === null ? (
        <Text style={styles.rodapeDia}>
          Você ainda não definiu uma meta de calorias. Sem ela o app soma o dia, mas não tem contra
          o que comparar.
        </Text>
      ) : (
        <>
          <View style={styles.trilhoDia}>
            <View
              style={[styles.preenchimentoDia, { width: `${Math.min((comido / meta) * 100, 100)}%` }]}
            />
          </View>
          <Text style={styles.rodapeDia}>
            {comido <= meta
              ? `Faltam ${milhar(meta - comido)} kcal para a sua meta.`
              : `${milhar(comido - meta)} kcal acima da meta de hoje.`}
          </Text>
        </>
      )}

      <View style={styles.macrosDia}>
        <MacroDia rotulo="Proteínas" valor={totais.proteinas} meta={metas.proteinas} />
        <MacroDia rotulo="Carboidratos" valor={totais.carboidratos} meta={metas.carboidratos} />
        <MacroDia rotulo="Gorduras" valor={totais.gorduras} meta={metas.gorduras} />
      </View>

      {/* Os dois avisos que impedem o total de mentir por omissão. */}
      {totais.deFoto > 0 && (
        <Text style={styles.avisoDia}>
          {totais.deFoto === 1
            ? '1 item foi estimado por foto — o total é aproximado.'
            : `${totais.deFoto} itens foram estimados por foto — o total é aproximado.`}
        </Text>
      )}
      {totais.semCalorias > 0 && (
        <Text style={styles.avisoDia}>
          {totais.semCalorias === 1
            ? '1 item entrou sem caloria e ficou de fora da soma.'
            : `${totais.semCalorias} itens entraram sem caloria e ficaram de fora da soma.`}
        </Text>
      )}
    </View>
  )
}

function MacroDia({
  rotulo,
  valor,
  meta,
}: {
  rotulo: string
  valor: number | null
  meta: number | null
}) {
  return (
    <View style={styles.macroDia}>
      <Text style={styles.rotuloMacroDia}>{rotulo}</Text>
      <Text style={styles.valorMacroDia}>
        {valor === null ? '—' : `${Math.round(valor)}`}
        {meta !== null && <Text style={styles.metaMacroDia}> / {meta}g</Text>}
      </Text>
    </View>
  )
}

/* ── Portas ────────────────────────────────────────────────────────────────*/

function Porta({
  icone,
  titulo,
  detalhe,
  onPress,
  onLongPress,
  desligada,
  ocupada,
}: {
  icone: keyof typeof Ionicons.glyphMap
  titulo: string
  detalhe: string
  onPress: () => void
  onLongPress?: () => void
  desligada?: boolean
  ocupada?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={desligada || ocupada}
      style={({ pressed }) => [
        styles.porta,
        desligada && styles.portaDesligada,
        pressed && styles.portaPressionada,
      ]}
      accessibilityRole="button"
      accessibilityLabel={titulo}
    >
      <Ionicons name={icone} size={22} color={desligada ? inkFraco : cores.verde} />
      <Text style={[styles.tituloPorta, desligada && styles.textoDesligado]}>{titulo}</Text>
      <Text style={styles.detalhePorta}>{detalhe}</Text>
    </Pressable>
  )
}

function LinhaItem({
  item,
  onApagar,
  onCorrigir,
}: {
  item: ItemConsumo
  onApagar: () => void
  onCorrigir: () => void
}) {
  return (
    /* A linha inteira abre a correção; o X continua apagando direto. Apagar é o
       que já existia e é o gesto mais rápido — escondê-lo dentro do menu seria
       trocar um toque por três para o caso mais comum. */
    <Pressable
      onPress={onCorrigir}
      style={({ pressed }) => [styles.linhaItem, pressed && styles.linhaItemPressionada]}
      accessibilityRole="button"
      accessibilityLabel={`Corrigir ${item.nome}`}
    >
      <View style={styles.textoItem}>
        <View style={styles.linhaNomeItem}>
          <Text style={styles.nomeItem} numberOfLines={2}>
            {item.nome}
          </Text>
          {/* O selo só aparece na foto. Busca e plano vêm de tabela; foto é
              chute educado, e o total do dia herda essa diferença. */}
          {item.origem === 'foto' && (
            <View style={styles.seloFoto}>
              <Ionicons name="camera" size={10} color={cores.verdeEscuro} />
              <Text style={styles.textoSeloFoto}>
                {item.confianca === 'alta' ? 'foto' : `foto · ${item.confianca}`}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.detalheItem}>
          {[item.descricao, horaCurta(new Date(item.comidoEm))].filter(Boolean).join(' · ')}
        </Text>
      </View>

      <Text style={styles.kcalItem}>
        {item.calorias === null ? '—' : `${milhar(item.calorias)}`}
      </Text>

      <Pressable
        onPress={onApagar}
        hitSlop={10}
        style={({ pressed }) => [styles.apagar, pressed && styles.apagarPressionado]}
        accessibilityRole="button"
        accessibilityLabel={`Apagar ${item.nome}`}
      >
        <Ionicons name="close" size={16} color={inkFraco} />
      </Pressable>
    </Pressable>
  )
}

/* ── Confirmar a foto ──────────────────────────────────────────────────────
   Nada é gravado antes de a pessoa ver o número. A IA erra em prato composto,
   e um item errado no diário estraga o total do dia até alguém notar. */
function ConfirmarFoto({
  estimativa,
  refeicao,
  onRegistrar,
  onDescartar,
}: {
  estimativa: Estimativa
  refeicao: string
  onRegistrar: () => void
  onDescartar: () => void
}) {
  const { bottom } = useSafeAreaInsets()

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={styles.fundoFolha} onPress={onDescartar} />
      <View style={[styles.folha, { paddingBottom: Math.max(bottom, 16) }]}>
        <View style={styles.puxador} />

        <Text style={styles.tituloFolha}>{estimativa.descricao}</Text>
        {!!estimativa.porcaoEstimada && (
          <Text style={styles.porcaoFolha}>{estimativa.porcaoEstimada}</Text>
        )}

        {/* Número solto, e não um arco: um arco mede progresso contra alguma
            coisa, e aqui não há contra o quê — é um item, não o dia. */}
        <View style={styles.arcoFolha}>
          <Text style={styles.kcalFolha}>
            {estimativa.calorias === null ? '—' : milhar(estimativa.calorias)}
          </Text>
          <Text style={styles.unidadeFolha}>kcal</Text>
        </View>

        <View style={styles.macrosFolha}>
          <MacroFolha rotulo="Proteínas" valor={estimativa.proteinas} />
          <MacroFolha rotulo="Carboidratos" valor={estimativa.carboidratos} />
          <MacroFolha rotulo="Gorduras" valor={estimativa.gorduras} />
        </View>

        {/* A confiança vem da IA e é mostrada como ela respondeu. Esconder um
            "baixa" faria a pessoa tratar o chute como medida. */}
        {estimativa.confianca !== 'alta' && (
          <View style={styles.avisoFolha}>
            <Ionicons name="information-circle-outline" size={16} color={cores.verdeEscuro} />
            <Text style={styles.textoAvisoFolha}>
              {estimativa.confianca === 'baixa'
                ? 'A imagem ficou difícil de ler — esses números são um palpite grosseiro.'
                : 'Há dúvida sobre o prato ou a porção. Confira antes de registrar.'}
            </Text>
          </View>
        )}

        <Text style={styles.rodapeFolha}>
          Toda estimativa por foto é aproximada. Vai entrar em <Text style={styles.negrito}>{refeicao}</Text>.
        </Text>

        <View style={styles.botoesFolha}>
          <Pressable
            onPress={onDescartar}
            style={({ pressed }) => [styles.botaoDescartar, pressed && styles.botaoDescartarPress]}
            accessibilityRole="button"
          >
            <Text style={styles.textoDescartar}>Descartar</Text>
          </Pressable>

          <Pressable
            onPress={onRegistrar}
            style={({ pressed }) => [styles.botaoRegistrar, pressed && styles.botaoRegistrarPress]}
            accessibilityRole="button"
          >
            <Text style={styles.textoRegistrar}>Registrar</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

function MacroFolha({ rotulo, valor }: { rotulo: string; valor: number | null }) {
  return (
    <View style={styles.macroFolha}>
      <Text style={styles.rotuloMacroFolha}>{rotulo}</Text>
      <Text style={styles.valorMacroFolha}>{valor === null ? '—' : `${Math.round(valor)} g`}</Text>
    </View>
  )
}

/* ── Comer do plano ────────────────────────────────────────────────────────*/

function EscolherDoPlano({
  plano,
  onEscolher,
  onFechar,
}: {
  plano: PlanoCompleto
  onEscolher: (r: RefeicaoSalva) => void
  onFechar: () => void
}) {
  const { bottom } = useSafeAreaInsets()
  const comAlimento = plano.refeicoes.filter(r => r.itens.length > 0)

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={styles.fundoFolha} onPress={onFechar} />
      <View style={[styles.folha, { paddingBottom: Math.max(bottom, 16) }]}>
        <View style={styles.puxador} />

        <Text style={styles.tituloFolha}>Qual refeição você comeu?</Text>
        <Text style={styles.porcaoFolha}>Do plano "{plano.nome}"</Text>

        <ScrollView style={styles.listaPlano} bounces={false}>
          {comAlimento.length === 0 ? (
            <Text style={styles.vazio}>
              Nenhuma refeição do seu plano tem alimentos, então não há o que registrar a partir dele.
            </Text>
          ) : (
            comAlimento.map(r => {
              /* Soma pela mesma conversão da gravação: o número que a pessoa vê
                 aqui é o que vai entrar no diário, não uma aproximação dele. */
              const kcal = r.itens.reduce((s, i) => {
                const v = i.gramasTotais === null ? null : porcao(i.caloriasPor100g, i.gramasTotais)
                return s + (v ?? 0)
              }, 0)

              return (
                <Pressable
                  key={r.id}
                  onPress={() => onEscolher(r)}
                  style={({ pressed }) => [styles.refeicaoPlano, pressed && styles.chipPressionado]}
                  accessibilityRole="button"
                  accessibilityLabel={`Registrar ${r.rotulo}`}
                >
                  <View style={styles.horaPlano}>
                    <Text style={styles.textoHoraPlano}>{r.hora}</Text>
                  </View>
                  <View style={styles.textoItem}>
                    <Text style={styles.nomeItem}>{r.rotulo}</Text>
                    <Text style={styles.detalheItem}>
                      {r.itens.length} {r.itens.length === 1 ? 'alimento' : 'alimentos'}
                      {kcal > 0 && ` · ${milhar(kcal)} kcal`}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={inkFraco} />
                </Pressable>
              )
            })
          )}
        </ScrollView>
      </View>
    </View>
  )
}

/* A porta do repetir.
 *
 * Duas listas, e a ordem entre elas é a do esforço: primeiro a refeição inteira
 * de outro dia, que resolve tudo num toque; depois os alimentos avulsos, para
 * quem come quase o mesmo, mas não exatamente.
 *
 * Sem confirmação em nenhuma das duas. O que se grava aqui já foi comido antes
 * pela própria pessoa, e apagar da lista do dia é um toque — pedir "tem
 * certeza?" a cada café da manhã seria devolver o atrito que esta tela existe
 * para tirar. */
function Repetir({
  refeicao,
  buscando,
  ultima,
  frequentes,
  onRepetirUltima,
  onRepetirItem,
  onFechar,
}: {
  refeicao: string
  buscando: boolean
  ultima: UltimaRefeicao | null
  frequentes: ItemFrequente[]
  onRepetirUltima: () => void
  onRepetirItem: (f: ItemFrequente) => void
  onFechar: () => void
}) {
  const { bottom } = useSafeAreaInsets()

  const kcalUltima =
    ultima?.itens.reduce((s, i) => s + (i.calorias ?? 0), 0) ?? 0

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={styles.fundoFolha} onPress={onFechar} />
      <View style={[styles.folha, { paddingBottom: Math.max(bottom, 16) }]}>
        <View style={styles.puxador} />

        <Text style={styles.tituloFolha}>O que você já come</Text>
        <Text style={styles.porcaoFolha}>Em {refeicao.toLowerCase()}</Text>

        {buscando ? (
          <View style={styles.centroRepetir}>
            <ActivityIndicator color={cores.verde} />
          </View>
        ) : (
          <ScrollView style={styles.listaPlano} bounces={false}>
            {ultima && (
              <Pressable
                onPress={onRepetirUltima}
                style={({ pressed }) => [styles.refeicaoPlano, pressed && styles.chipPressionado]}
                accessibilityRole="button"
                accessibilityLabel={`Repetir ${refeicao} de ${diaRelativo(ultima.data)}`}
              >
                <View style={styles.horaPlano}>
                  <Ionicons name="repeat-outline" size={18} color={cores.verde} />
                </View>
                <View style={styles.textoItem}>
                  <Text style={styles.nomeItem}>Repetir a de {diaRelativo(ultima.data)}</Text>
                  <Text style={styles.detalheItem}>
                    {ultima.itens.length} {ultima.itens.length === 1 ? 'item' : 'itens'}
                    {kcalUltima > 0 && ` · ${milhar(kcalUltima)} kcal`}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={inkFraco} />
              </Pressable>
            )}

            {frequentes.length > 0 && (
              <Text style={styles.subtituloRepetir}>Seus mais frequentes</Text>
            )}

            {frequentes.map(f => (
              <Pressable
                key={f.chave}
                onPress={() => onRepetirItem(f)}
                style={({ pressed }) => [styles.refeicaoPlano, pressed && styles.chipPressionado]}
                accessibilityRole="button"
                accessibilityLabel={`Adicionar ${f.nome}`}
              >
                <View style={styles.horaPlano}>
                  <Text style={styles.textoHoraPlano}>{f.vezes}×</Text>
                </View>
                <View style={styles.textoItem}>
                  <Text style={styles.nomeItem} numberOfLines={1}>
                    {f.nome}
                  </Text>
                  <Text style={styles.detalheItem} numberOfLines={1}>
                    {f.descricao ? `${f.descricao} · ` : ''}
                    {f.calorias === null ? 'sem caloria' : `${milhar(f.calorias)} kcal`}
                  </Text>
                </View>
                <Ionicons name="add" size={20} color={cores.verde} />
              </Pressable>
            ))}

            {!ultima && frequentes.length === 0 && (
              <Text style={styles.vazio}>
                Você ainda não registrou nada em {refeicao.toLowerCase()}. Depois do primeiro
                registro, o que se repetir aparece aqui para você repetir num toque.
              </Text>
            )}
          </ScrollView>
        )}
      </View>
    </View>
  )
}

/* "ontem" pesa mais que "25/08" para quem está olhando o próprio dia. Além de
   anteontem a data volta a ser mais clara que a contagem — "há 9 dias" obriga a
   fazer a conta de cabeça. */
function diaRelativo(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  const alvo = new Date(ano, mes - 1, dia)
  const hoje = new Date()
  const zerar = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const dias = Math.round((zerar(hoje) - zerar(alvo)) / 86400000)

  if (dias === 1) return 'ontem'
  if (dias === 2) return 'anteontem'
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`
}

/* Corrigir um item já registrado.
 *
 * Três enganos, três saídas. Errar a refeição — o pão do café lançado no almoço
 * porque o relógio já tinha virado — se conserta mudando de grupo. Comer
 * diferente do que se anotou se conserta por proporção. E apagar continua ali,
 * para quando o registro não deveria existir.
 *
 * Antes disto, os três custavam o mesmo: apagar e descrever tudo de novo. Um
 * preço alto para consertar um toque errado, e alto o bastante para a pessoa
 * deixar o diário errado em vez de arrumar. */
function AcoesDoItem({
  item,
  onMover,
  onAjustar,
  onApagar,
  onFechar,
}: {
  item: ItemConsumo
  onMover: (destino: string) => void
  onAjustar: (fator: number) => void
  onApagar: () => void
  onFechar: () => void
}) {
  const { bottom } = useSafeAreaInsets()

  /* A refeição atual sai da lista de destinos: mover para onde já está não é
     uma opção, é um caminho sem efeito ocupando espaço. */
  const destinos = REFEICOES.filter(r => r !== item.refeicao)

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={styles.fundoFolha} onPress={onFechar} />
      <View style={[styles.folha, { paddingBottom: Math.max(bottom, 16) }]}>
        <View style={styles.puxador} />

        <Text style={styles.tituloFolha} numberOfLines={2}>
          {item.nome}
        </Text>
        <Text style={styles.porcaoFolha}>
          {[item.descricao, item.refeicao].filter(Boolean).join(' · ')}
        </Text>

        <ScrollView style={styles.listaPlano} bounces={false}>
          <Text style={styles.subtituloAcoes}>Comi diferente do que anotei</Text>

          <View style={styles.linhaProporcao}>
            <Pressable
              onPress={() => onAjustar(0.5)}
              style={({ pressed }) => [styles.botaoProporcao, pressed && styles.chipPressionado]}
              accessibilityRole="button"
              accessibilityLabel="Comi metade"
            >
              <Text style={styles.textoProporcao}>Comi metade</Text>
            </Pressable>
            <Pressable
              onPress={() => onAjustar(2)}
              style={({ pressed }) => [styles.botaoProporcao, pressed && styles.chipPressionado]}
              accessibilityRole="button"
              accessibilityLabel="Comi o dobro"
            >
              <Text style={styles.textoProporcao}>Comi o dobro</Text>
            </Pressable>
          </View>

          <Text style={styles.subtituloAcoes}>Era outra refeição</Text>

          {destinos.map(destino => (
            <Pressable
              key={destino}
              onPress={() => onMover(destino)}
              style={({ pressed }) => [styles.refeicaoPlano, pressed && styles.chipPressionado]}
              accessibilityRole="button"
              accessibilityLabel={`Mover para ${destino}`}
            >
              <View style={styles.horaPlano}>
                <Ionicons name="arrow-forward" size={16} color={cores.verde} />
              </View>
              <View style={styles.textoItem}>
                <Text style={styles.nomeItem}>{destino}</Text>
              </View>
            </Pressable>
          ))}

          <Pressable
            onPress={onApagar}
            style={({ pressed }) => [styles.botaoApagarItem, pressed && styles.chipPressionado]}
            accessibilityRole="button"
            accessibilityLabel={`Apagar ${item.nome}`}
          >
            <Ionicons name="trash-outline" size={16} color={cores.erroTexto} />
            <Text style={styles.textoApagarItem}>Apagar do diário</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  linhaItemPressionada: { opacity: 0.65 },
  subtituloAcoes: {
    fontSize: 12,
    fontWeight: '700',
    color: inkFraco,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 6,
  },
  linhaProporcao: { flexDirection: 'row', gap: 10 },
  botaoProporcao: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
  },
  textoProporcao: { fontSize: 14, fontWeight: '700', color: cores.ink },
  botaoApagarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 18,
    paddingVertical: 13,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: cores.erroBorda,
    backgroundColor: cores.erroFundo,
  },
  textoApagarItem: { fontSize: 14, fontWeight: '700', color: cores.erroTexto },

  tela: { flex: 1, backgroundColor: cores.fundo },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centroRepetir: { paddingVertical: 40, alignItems: 'center' },
  subtituloRepetir: {
    fontSize: 12,
    fontWeight: '700',
    color: inkFraco,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 6,
  },

  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  botaoVoltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  tituloTela: { flexShrink: 1, fontSize: 17, fontWeight: '800', color: cores.ink },

  conteudo: { paddingHorizontal: 20, paddingTop: 8, gap: 14 },

  /* ── Cartão do dia ── */
  cartaoDia: { borderRadius: 20, backgroundColor: cores.verde, padding: 18 },
  linhaTituloDia: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  tituloDia: { flex: 1, fontSize: 15, fontWeight: '700', color: cores.branco },
  linhaValorDia: { flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 8 },
  valorDia: { fontSize: 40, fontWeight: '800', color: cores.branco, letterSpacing: -1.4 },
  unidadeDia: { fontSize: 15, fontWeight: '700', color: cores.branco },
  metaDia: { marginLeft: 4, fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.8)' },
  trilhoDia: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden',
    marginTop: 12,
  },
  preenchimentoDia: { height: '100%', borderRadius: 4, backgroundColor: cores.branco },
  rodapeDia: { marginTop: 10, fontSize: 12.5, lineHeight: 18, color: 'rgba(255,255,255,0.92)' },
  avisoDia: { marginTop: 6, fontSize: 11.5, lineHeight: 16, color: 'rgba(255,255,255,0.8)' },

  macrosDia: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.28)',
  },
  macroDia: { flex: 1 },
  rotuloMacroDia: { fontSize: 11, color: 'rgba(255,255,255,0.8)' },
  valorMacroDia: { marginTop: 2, fontSize: 15, fontWeight: '800', color: cores.branco },
  metaMacroDia: { fontSize: 11.5, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },

  /* ── Blocos ── */
  bloco: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: cores.cartao,
    borderWidth: 1,
    borderColor: cores.borda,
    gap: 10,
  },
  linhaTituloBloco: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tituloBloco: { flex: 1, fontSize: 15, fontWeight: '800', color: cores.ink },
  kcalGrupo: { fontSize: 12.5, fontWeight: '700', color: inkMedio },
  vazio: { fontSize: 12.5, lineHeight: 18, color: inkSuave },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  chipAtivo: { backgroundColor: cores.verde, borderColor: cores.verde },
  chipPressionado: { backgroundColor: cores.verdeClaro, borderColor: cores.verdeClaro },
  textoChip: { fontSize: 12.5, fontWeight: '700', color: cores.ink },
  textoChipAtivo: { color: cores.branco },

  /* ── Portas ── */
  /* Duas por linha, e não quatro lado a lado. Com três cabia; a quarta
     espremeu todas, e "Do meu plano" — o rótulo mais longo — passou a sair do
     enquadramento. Numa tela de telefone, quatro colunas dão menos de 80
     pontos por porta, que não sustenta nem o texto nem o alvo do dedo. */
  portas: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  porta: {
    /* Base de 47% para caberem duas por linha com o vão de 10 entre elas, e
       crescendo para dividir a sobra por igual. */
    flexBasis: '47%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: cores.cartao,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  portaPressionada: { backgroundColor: cores.verdeMenta, borderColor: cores.verdeClaro },
  portaDesligada: { opacity: 0.55 },
  tituloPorta: { fontSize: 13, fontWeight: '800', color: cores.ink, textAlign: 'center' },
  textoDesligado: { color: inkFraco },
  detalhePorta: { fontSize: 10.5, color: inkSuave, textAlign: 'center' },
  dicaPortas: { marginTop: -6, fontSize: 11, lineHeight: 15, color: inkFraco },

  blocoErro: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: cores.erroBorda,
    backgroundColor: cores.erroFundo,
  },
  tituloErro: { fontSize: 13.5, fontWeight: '700', color: cores.erroTexto },
  detalheErro: { marginTop: 5, fontSize: 12.5, lineHeight: 18, color: cores.erroTexto },

  /* ── Itens do dia ── */
  linhaItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  textoItem: { flex: 1 },
  linhaNomeItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nomeItem: { flexShrink: 1, fontSize: 14, fontWeight: '700', color: cores.ink },
  seloFoto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: cores.verdeClaro,
  },
  textoSeloFoto: { fontSize: 9.5, fontWeight: '800', color: cores.verdeEscuro },
  detalheItem: { marginTop: 1, fontSize: 11.5, color: inkSuave },
  kcalItem: { fontSize: 14, fontWeight: '800', color: cores.verde },
  apagar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  apagarPressionado: { backgroundColor: cores.trilho },

  /* ── Véu de análise ── */
  veu: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  caixaAnalise: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 28,
    paddingVertical: 24,
    borderRadius: 20,
    backgroundColor: cores.fundo,
  },
  textoAnalise: { fontSize: 14, fontWeight: '700', color: cores.ink },

  /* ── Folhas ── */
  fundoFolha: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.62)' },
  folha: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '82%',
    backgroundColor: cores.fundo,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 20,
  },
  puxador: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: cores.trilho,
    marginBottom: 14,
  },
  tituloFolha: { fontSize: 19, fontWeight: '800', color: cores.ink, letterSpacing: -0.3 },
  porcaoFolha: { marginTop: 3, fontSize: 13, color: inkSuave },
  arcoFolha: { alignItems: 'center', marginTop: 14, marginBottom: 4 },
  kcalFolha: { fontSize: 26, fontWeight: '800', color: cores.ink, letterSpacing: -0.8 },
  unidadeFolha: { fontSize: 12, fontWeight: '600', color: inkMedio },
  macrosFolha: { flexDirection: 'row', gap: 8, marginTop: 6 },
  macroFolha: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: cores.cartao,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  rotuloMacroFolha: { fontSize: 11, color: inkSuave },
  valorMacroFolha: { marginTop: 2, fontSize: 14.5, fontWeight: '800', color: cores.ink },
  avisoFolha: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    padding: 11,
    borderRadius: 14,
    backgroundColor: cores.verdeMenta,
    marginTop: 12,
  },
  textoAvisoFolha: { flex: 1, fontSize: 12, lineHeight: 17, color: cores.verdeEscuro },
  rodapeFolha: { marginTop: 12, fontSize: 11.5, lineHeight: 16, color: inkFraco },
  negrito: { fontWeight: '800', color: inkMedio },

  botoesFolha: { flexDirection: 'row', gap: 10, marginTop: 14 },
  botaoDescartar: {
    paddingHorizontal: 22,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: cores.cartao,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  botaoDescartarPress: { backgroundColor: cores.trilho },
  textoDescartar: { fontSize: 15, fontWeight: '700', color: inkMedio },
  botaoRegistrar: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: cores.verde,
  },
  botaoRegistrarPress: { backgroundColor: cores.verdeEscuro },
  textoRegistrar: { fontSize: 15, fontWeight: '700', color: cores.branco },

  listaPlano: { marginTop: 12 },
  refeicaoPlano: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: cores.cartao,
    borderWidth: 1,
    borderColor: cores.borda,
    marginBottom: 8,
  },
  horaPlano: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: cores.verdeClaro,
  },
  textoHoraPlano: { fontSize: 11.5, fontWeight: '800', color: cores.verdeEscuro },
})
