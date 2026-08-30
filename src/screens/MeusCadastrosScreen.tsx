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
import { dataNumerica, decimal, milhar } from '../lib/formatar'
import {
  apagarPlano,
  ativarPlano,
  carregarPlanos,
  itensDoPlano,
  resumoDosDias,
  totaisDe,
  type PlanoCompleto,
} from '../lib/plano'
import {
  apagarMetas,
  ativarMetas,
  carregarListaDeMetas,
  type Metas,
  type MetasSalvas,
} from '../lib/metas'
import {
  NOME_DA_FORMULA,
  apagarCalculo,
  ativarCalculo,
  atividadePor,
  carregarCalculos,
  type CalculoSalvo,
  nomeDaFormula,
} from '../lib/energia'
import { Confirmacao } from '../components/Confirmacao'
import { estilosDe, paleta } from '../lib/tema'

/* O que o paciente cadastrou no app, em dois degraus: primeiro QUAL cadastro
 * ele quer ver, depois o conteúdo.
 *
 * Três tipos hoje: planos alimentares, metas e cálculos energéticos. Os três se
 * comportam igual — vários guardados, um ativo, e o ativo é o que o resto do app
 * usa. Água e peso NÃO entram aqui de propósito: são diários do dia a dia, e o
 * lugar deles é a própria tela, com o histórico. Cadastro é o que se define e
 * passa a valer; registro é o que se anota todo dia.
 *
 * Receitas aparecem no índice mas não viram seção: nenhuma delas é "a ativa",
 * então a mecânica das outras três não se aplica, e a tela de receitas já
 * existe inteira. A porta leva para lá. Ela precisa estar aqui porque receita
 * É cadastro — se define uma vez e passa a valer — e até agora só se chegava
 * nela por dentro do contador de calorias, que é onde se REGISTRA. Quem
 * quisesse criar uma receita fora da hora de comer não achava. */
type Secao = 'planos' | 'metas' | 'calculos'

export function MeusCadastrosScreen({
  contaId,
  versao,
  versaoMetas,
  onFechar,
  onAbrirPlano,
  onNovoPlano,
  onAbrirMetas,
  onNovasMetas,
  onNovoCalculo,
  onAbrirReceitas,
  onAtivou,
}: {
  contaId: string
  /* Muda quando um plano é salvo em qualquer lugar do app: a lista fica aberta
     por baixo da edição e precisa refletir o que acabou de mudar. */
  versao: number
  /* O mesmo para metas e cálculos. Um contador para os dois porque salvar um
     cálculo com "usar como minha meta" mexe nos dois de uma vez. */
  versaoMetas: number
  onFechar: () => void
  onAbrirPlano: (plano: PlanoCompleto) => void
  onNovoPlano: () => void
  onAbrirMetas: (metas: MetasSalvas) => void
  onNovasMetas: () => void
  onNovoCalculo: () => void
  onAbrirReceitas: () => void
  /* Avisa o App para a tela inicial buscar de novo — e, de volta, esta lista
     recarrega pelas versões. Um caminho só para as duas telas. */
  onAtivou: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  /* null = o índice. */
  const [secao, setSecao] = useState<Secao | null>(null)
  const [planos, setPlanos] = useState<PlanoCompleto[]>([])
  const [metas, setMetas] = useState<MetasSalvas[]>([])
  const [calculos, setCalculos] = useState<CalculoSalvo[]>([])
  /* O plano esperando confirmação. Guarda o plano inteiro, e não o id: a
     pergunta precisa dizer o nome do que vai sumir. */
  const [apagando, setApagando] = useState<PlanoCompleto | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  /* Qual linha está sendo ativada agora. Guardado por id, e não um booleano: é
     o cartão daquele item que mostra o giro, não a tela toda. */
  const [ativando, setAtivando] = useState<string | null>(null)

  /* O botão do aparelho faz o mesmo que a seta do topo: dentro de uma seção,
     volta para o índice; no índice, fecha a tela. Sem isto, quem entrou em
     "Metas" para conferir uma linha era jogado para fora da tela inteira.

     ── Por que este handler existe se o App já tem um ─────────────────────────
     O App tem um voltar central, e ele já fecha esta tela. O que ele não sabe
     é que existe um degrau aqui dentro — `secao` é estado local, e de fora só
     dá para fechar tudo.

     Os dois convivem porque o React roda os efeitos do filho ANTES dos do pai,
     e o BackHandler chama o último registrado primeiro. Ao abrir, o pai
     registra depois e ganha — e no índice os dois fazem a mesma coisa, então
     não muda nada. A partir da primeira re-renderização daqui (a carga dos
     dados, que sempre acontece), este passa a ser o último e ganha, que é
     justamente quando já existe seção para voltar.

     Sem lista de dependências de propósito, por duas razões: `secao` muda
     enquanto a tela está aberta, e um efeito que rodasse só uma vez guardaria
     o valor da primeira renderização; e é re-registrar a cada renderização que
     mantém este handler na frente do central. */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (secao) setSecao(null)
      else onFechar()
      return true
    })
    return () => sub.remove()
  })

  /* As três buscas acontecem já no índice, e não ao entrar em cada seção: são
     elas que deixam cada porta dizer o que tem atrás dela. Sem isso o índice
     seria uma lista de portas sem informação nenhuma. */
  useEffect(() => {
    let ativo = true
    setCarregando(true)

    Promise.all([
      carregarPlanos(contaId),
      carregarListaDeMetas(contaId),
      carregarCalculos(contaId),
    ]).then(([rPlanos, rMetas, rCalculos]) => {
      if (!ativo) return

      const falha =
        rPlanos.tipo === 'erro'
          ? rPlanos.mensagem
          : rMetas.tipo === 'erro'
            ? rMetas.mensagem
            : rCalculos.tipo === 'erro'
              ? rCalculos.mensagem
              : ''

      setErro(falha)
      if (rPlanos.tipo === 'ok') setPlanos(rPlanos.planos)
      if (rMetas.tipo === 'ok') setMetas(rMetas.lista)
      if (rCalculos.tipo === 'ok') setCalculos(rCalculos.calculos)

      setCarregando(false)
    })

    return () => {
      ativo = false
    }
  }, [contaId, versao, versaoMetas])

  async function ativar(plano: PlanoCompleto) {
    setAtivando(plano.id)
    const falha = await ativarPlano(plano.id)
    setAtivando(null)

    if (falha) {
      setErro(falha.erro)
      return
    }

    setErro('')
    onAtivou()
  }

  async function ativarConjunto(m: MetasSalvas) {
    setAtivando(m.id)
    const falha = await ativarMetas(m.id)
    setAtivando(null)

    if (falha) {
      setErro(falha.erro)
      return
    }

    setErro('')
    onAtivou()
  }

  /* Apagar um plano.
   *
   * Faltava, e a falta aparecia de um jeito torto: quem quisesse se livrar de
   * um plano tentava esvaziar as refeições e salvar, e a validação recusava —
   * plano sem refeição não é plano. Ficava-se com um cadastro impossível de
   * usar e impossível de remover.
   *
   * Otimista como os outros dois desta tela, e com a mesma volta atrás se o
   * banco recusar. */
  async function apagarOPlano(p: PlanoCompleto) {
    setApagando(null)
    setErro('')
    setPlanos(atuais => atuais.filter(x => x.id !== p.id))

    const falha = await apagarPlano(p.id)

    if (falha) {
      setPlanos(atuais => [...atuais, p].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)))
      setErro(falha.erro)
      return
    }

    /* Apagar o que estava valendo deixa a tela inicial mostrando um plano que
       não existe mais até alguém recarregar. */
    if (p.ativo) onAtivou()
  }

  async function apagarConjunto(m: MetasSalvas) {
    setErro('')
    setMetas(atuais => atuais.filter(x => x.id !== m.id))

    const falha = await apagarMetas(m.id)

    if (falha) {
      setMetas(atuais => [...atuais, m].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)))
      setErro(falha.erro)
      return
    }

    /* Apagar o ativo deixa a conta sem nenhum, e aí a água volta ao padrão de
       2.000 ml e a Home perde a meta de calorias. Avisar o resto do app não é
       zelo: é o que evita a tela inicial seguir mostrando o que sumiu. */
    if (m.ativo) onAtivou()
  }

  async function ativarCalc(c: CalculoSalvo) {
    setAtivando(c.id)
    const falha = await ativarCalculo(c.id)
    setAtivando(null)

    if (falha) {
      setErro(falha.erro)
      return
    }

    setErro('')
    onAtivou()
  }

  async function apagarCalc(c: CalculoSalvo) {
    /* Some da lista na hora e volta se o banco recusar — mesma escolha da água e
       do peso. Aqui a lista é ordenada por data, então ela reaparece no lugar. */
    setErro('')
    setCalculos(atuais => atuais.filter(x => x.id !== c.id))

    const falha = await apagarCalculo(c.id)

    if (falha) {
      setCalculos(atuais => [...atuais, c].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)))
      setErro(falha.erro)
      return
    }

    /* Apagar o ativo deixa a conta sem nenhum — quem lê cai no mais recente por
       desempate. Avisar o resto do app é obrigatório: a tela inicial pode estar
       mostrando justamente o que acabou de sumir. */
    if (c.ativo) onAtivou()
  }

  const resumo = (
    vazio: string,
    n: number,
    singular: string,
    plural: string,
  ) =>
    carregando ? 'Carregando…' : erro ? 'Não foi possível carregar' : n === 0 ? vazio : `${n} ${n === 1 ? singular : plural}`

  const tituloDaSecao =
    secao === 'planos'
      ? 'Planejamento alimentar'
      : secao === 'metas'
        ? 'Minhas metas'
        : secao === 'calculos'
          ? 'Cálculos energéticos'
          : 'Meus cadastros'

  return (
    <View style={[styles.tela, { paddingTop: top + 8 }]}>
      <View style={styles.cabecalho}>
        <Pressable
          /* De dentro de uma seção o voltar sobe um degrau, não fecha tudo:
             errar o toque não deveria custar a tela inteira. */
          onPress={() => (secao ? setSecao(null) : onFechar())}
          style={styles.botaoVoltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela} numberOfLines={1}>
          {tituloDaSecao}
        </Text>
        <View style={styles.botaoVoltar} />
      </View>

      {carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator color={paleta().cores.verde} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.conteudo}
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
        >
          {!!erro && (
            <View style={styles.blocoErro}>
              <Text style={styles.tituloErro}>Não foi possível carregar</Text>
              {/* A mensagem crua junto: sem ela, sem internet e migração
                  faltando viram o mesmo aviso e não há como saber qual foi. */}
              <Text style={styles.detalheErro}>{erro}</Text>
            </View>
          )}

          {secao === null && (
            <>
              <Text style={styles.chamada}>Qual cadastro você quer ver?</Text>

              <Porta
                icone="nutrition-outline"
                titulo="Plano alimentar"
                resumo={resumo('Nenhum plano cadastrado', planos.length, 'plano cadastrado', 'planos cadastrados')}
                onPress={() => setSecao('planos')}
              />

              <Porta
                icone="flag-outline"
                titulo="Metas"
                resumo={resumo(
                  'Nenhum conjunto cadastrado',
                  metas.length,
                  'conjunto cadastrado',
                  'conjuntos cadastrados',
                )}
                onPress={() => setSecao('metas')}
              />

              <Porta
                icone="flame-outline"
                titulo="Cálculo energético"
                resumo={resumo(
                  'Nenhum cálculo cadastrado',
                  calculos.length,
                  'cálculo cadastrado',
                  'cálculos cadastrados',
                )}
                onPress={() => setSecao('calculos')}
              />

              {/* Sai daqui para a tela de receitas em vez de abrir uma seção:
                  ver o resumo dos outros três custa uma contagem que o índice
                  já fez, e receita custaria uma quarta consulta para dizer um
                  número que ninguém procura aqui. */}
              <Porta
                icone="book-outline"
                titulo="Minhas receitas"
                resumo="O que você come junto e repete"
                onPress={onAbrirReceitas}
              />
            </>
          )}

          {secao === 'planos' &&
            (planos.length === 0 ? (
              <Text style={styles.vazio}>Você ainda não cadastrou nenhum plano alimentar.</Text>
            ) : (
              planos.map(p => (
                <CartaoPlano
                  key={p.id}
                  plano={p}
                  ativando={ativando === p.id}
                  onPress={() => onAbrirPlano(p)}
                  onAtivar={() => ativar(p)}
                  onApagar={() => setApagando(p)}
                />
              ))
            ))}

          {secao === 'metas' &&
            (metas.length === 0 ? (
              <Text style={styles.vazio}>
                Você ainda não cadastrou nenhum conjunto de metas. Dá para ter mais de um — um de
                déficit e um de manutenção, por exemplo — e alternar entre eles.
              </Text>
            ) : (
              metas.map(m => (
                <CartaoMetas
                  key={m.id}
                  metas={m}
                  ativando={ativando === m.id}
                  onPress={() => onAbrirMetas(m)}
                  onAtivar={() => ativarConjunto(m)}
                  onApagar={() => apagarConjunto(m)}
                />
              ))
            ))}

          {secao === 'calculos' &&
            (calculos.length === 0 ? (
              <Text style={styles.vazio}>
                Você ainda não fez nenhum cálculo energético. Ele descobre quantas calorias seu corpo
                gasta por dia — e vira a sua meta, se você quiser.
              </Text>
            ) : (
              calculos.map(c => (
                <CartaoCalculo
                  key={c.id}
                  calculo={c}
                  ativando={ativando === c.id}
                  onAtivar={() => ativarCalc(c)}
                  onApagar={() => apagarCalc(c)}
                />
              ))
            ))}
        </ScrollView>
      )}

      {/* Só dentro de uma seção: no índice, um botão de criar falaria por uma
          porta que ainda não foi aberta. */}
      {secao !== null && (
        <View style={[styles.rodape, { paddingBottom: Math.max(bottom, 16) }]}>
          <Pressable
            onPress={
              secao === 'planos' ? onNovoPlano : secao === 'metas' ? onNovasMetas : onNovoCalculo
            }
            style={({ pressed }) => [styles.botao, pressed && styles.botaoPressionado]}
            accessibilityRole="button"
          >
            <Ionicons name="add" size={19} color={paleta().cores.branco} />
            <Text style={styles.textoBotao}>
              {secao === 'planos'
                ? 'Novo plano alimentar'
                : secao === 'metas'
                  ? 'Novo conjunto de metas'
                  : 'Novo cálculo energético'}
            </Text>
          </Pressable>
        </View>
      )}

      <Confirmacao
        visivel={apagando !== null}
        titulo="Apagar este plano?"
        mensagem={`"${apagando?.nome ?? ''}" e todas as refeições dele serão removidos. Não dá para desfazer.`}
        rotuloConfirmar="Apagar"
        destrutiva
        onCancelar={() => setApagando(null)}
        onConfirmar={() => apagando && apagarOPlano(apagando)}
      />
    </View>
  )
}

/* Quantas metas o conjunto realmente define.
 *
 * A água fica de fora da conta de propósito: ela SEMPRE tem valor, porque a tela
 * de Água precisa de um número para desenhar. Contá-la faria todo conjunto ter
 * pelo menos uma meta, inclusive o que a pessoa deixou em branco. */
function quantasMetas(m: Metas): number {
  return [
    m.calorias,
    m.proteinas,
    m.carboidratos,
    m.gorduras,
    m.fibras,
    m.passos,
    m.treinosSemana,
    m.sonoHoras,
  ].filter(v => v !== null).length
}

/* Um conjunto de metas na lista. Toca para editar, faixa de baixo para ativar,
 * X para apagar — a mesma gramática dos planos e dos cálculos.
 *
 * O resumo mostra as três metas mais consultadas (calorias e os macros) porque
 * são elas que distinguem um conjunto de déficit de um de manutenção de relance.
 * Listar as onze faria todos os cartões parecerem iguais. */
function CartaoMetas({
  metas,
  ativando,
  onPress,
  onAtivar,
  onApagar,
}: {
  metas: MetasSalvas
  ativando: boolean
  onPress: () => void
  onAtivar: () => void
  onApagar: () => void
}) {
  const styles = estilos()
  const quantas = quantasMetas(metas)

  const resumoNumeros = [
    metas.calorias !== null ? `${milhar(metas.calorias)} kcal` : null,
    metas.proteinas !== null ? `${milhar(metas.proteinas)} g de proteína` : null,
    metas.carboidratos !== null ? `${milhar(metas.carboidratos)} g de carboidrato` : null,
  ].filter(Boolean)

  return (
    <View style={[styles.cartao, metas.ativo && styles.cartaoAtivo]}>
      <View style={styles.corpoCartao}>
        <Pressable
          onPress={onPress}
          style={styles.textoCartao}
          accessibilityRole="button"
          accessibilityLabel={`Editar as metas ${metas.nome}`}
        >
          <View style={styles.linhaNome}>
            <Text style={styles.nome} numberOfLines={1}>
              {metas.nome}
            </Text>
            {metas.ativo && (
              <View style={styles.selo}>
                <Text style={styles.textoSelo}>Ativo</Text>
              </View>
            )}
          </View>

          <Text style={styles.detalhe}>
            {quantas === 0
              ? 'Nenhuma meta preenchida'
              : `${quantas} ${quantas === 1 ? 'meta definida' : 'metas definidas'}`}
            {' · '}
            {milhar(metas.aguaMl)} ml de água
          </Text>

          {resumoNumeros.length > 0 && (
            <Text style={styles.retrato}>{resumoNumeros.join(' · ')}</Text>
          )}

          <Text style={styles.data}>Criado em {dataNumerica(new Date(metas.criadoEm))}</Text>
        </Pressable>

        <Pressable
          onPress={onApagar}
          hitSlop={10}
          style={({ pressed }) => [styles.apagar, pressed && styles.apagarPressionado]}
          accessibilityRole="button"
          accessibilityLabel={`Apagar as metas ${metas.nome}`}
        >
          <Ionicons name="close" size={17} color={paleta().inkFraco} />
        </Pressable>
      </View>

      {metas.ativo ? (
        <Text style={styles.avisoAtivo}>É este que vale — inclusive a meta de água.</Text>
      ) : (
        <Pressable
          onPress={onAtivar}
          disabled={ativando}
          style={({ pressed }) => [styles.botaoAtivar, pressed && styles.botaoAtivarPressionado]}
          accessibilityRole="button"
          accessibilityLabel={`Ativar as metas ${metas.nome}`}
        >
          {ativando ? (
            <ActivityIndicator size="small" color={paleta().cores.verde} />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={16} color={paleta().cores.verde} />
              <Text style={styles.textoAtivar}>Usar estas metas</Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  )
}


/* Um cálculo guardado. Mostra o RETRATO com que ele foi feito — peso, altura,
 * idade, fórmula, atividade —, e não os dados de hoje: é isso que deixa comparar
 * dois cálculos e ver o que mudou. Um cartão que recalculasse com o peso atual
 * mostraria números que nunca existiram. */
function CartaoCalculo({
  calculo,
  ativando,
  onAtivar,
  onApagar,
}: {
  calculo: CalculoSalvo
  ativando: boolean
  onAtivar: () => void
  onApagar: () => void
}) {
  const styles = estilos()
  return (
    <View style={[styles.cartao, calculo.ativo && styles.cartaoAtivo]}>
      <View style={styles.corpoCartao}>
        <View style={styles.textoCartao}>
          <View style={styles.linhaNome}>
            <Text style={styles.nome} numberOfLines={1}>
              {calculo.nome}
            </Text>
            {calculo.ativo && (
              <View style={styles.selo}>
                <Text style={styles.textoSelo}>Ativo</Text>
              </View>
            )}
          </View>

          <View style={styles.linhaNumeros}>
            <View style={styles.numero}>
              <Text style={styles.rotuloNumero}>Gasto do dia</Text>
              <Text style={styles.valorNumero}>{milhar(calculo.get)} kcal</Text>
            </View>
            <View style={styles.numero}>
              <Text style={styles.rotuloNumero}>Meta</Text>
              <Text style={[styles.valorNumero, styles.valorAlvo]}>
                {milhar(calculo.alvoKcal)} kcal
              </Text>
            </View>
          </View>

          <Text style={styles.detalhe}>
            {calculo.ajustePct === 0
              ? 'Manutenção'
              : `${calculo.ajustePct > 0 ? 'Superávit' : 'Déficit'} de ${Math.abs(calculo.ajustePct)}%`}
            {' · '}
            {decimal(calculo.proteinaGkg, 1)} g/kg de proteína · {calculo.carboPct}% de carboidrato
          </Text>

          {/* O retrato, em letra miúda: é a prova de com que dados a conta foi
              feita, e é o que explica dois cálculos darem números diferentes. */}
          <Text style={styles.retrato}>
            {decimal(calculo.peso)} kg · {calculo.alturaCm} cm · {calculo.idade} anos ·{' '}
            {nomeDaFormula(calculo.formula)} · {atividadePor(calculo.atividade).rotulo}
          </Text>

          <Text style={styles.data}>Feito em {dataNumerica(new Date(calculo.criadoEm))}</Text>
        </View>

        <Pressable
          onPress={onApagar}
          hitSlop={10}
          style={({ pressed }) => [styles.apagar, pressed && styles.apagarPressionado]}
          accessibilityRole="button"
          accessibilityLabel={`Apagar o cálculo ${calculo.nome}`}
        >
          <Ionicons name="close" size={17} color={paleta().inkFraco} />
        </Pressable>
      </View>

      {calculo.ativo ? (
        <Text style={styles.avisoAtivo}>É este que vale como seu gasto energético.</Text>
      ) : (
        <Pressable
          onPress={onAtivar}
          disabled={ativando}
          style={({ pressed }) => [styles.botaoAtivar, pressed && styles.botaoAtivarPressionado]}
          accessibilityRole="button"
          accessibilityLabel={`Ativar o cálculo ${calculo.nome}`}
        >
          {ativando ? (
            <ActivityIndicator size="small" color={paleta().cores.verde} />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={16} color={paleta().cores.verde} />
              <Text style={styles.textoAtivar}>Usar este cálculo</Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  )
}

function Porta({
  icone,
  titulo,
  resumo,
  onPress,
}: {
  icone: keyof typeof Ionicons.glyphMap
  titulo: string
  resumo: string
  onPress: () => void
}) {
  const styles = estilos()
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.porta, pressed && styles.cartaoPressionado]}
      accessibilityRole="button"
      accessibilityLabel={titulo}
    >
      <View style={styles.icone}>
        <Ionicons name={icone} size={22} color={paleta().cores.verde} />
      </View>
      <View style={styles.textoCartao}>
        <Text style={styles.tituloPorta}>{titulo}</Text>
        <Text style={styles.resumoPorta}>{resumo}</Text>
      </View>
      <Ionicons name="chevron-forward" size={19} color={paleta().inkFraco} />
    </Pressable>
  )
}

/* Duas ações no mesmo cartão: o corpo abre o plano, a faixa de baixo o ativa.
   Separadas por uma linha e por um Pressable cada — aninhar um botão dentro do
   outro deixaria "ativar" a um pixel de "abrir para editar". */
function CartaoPlano({
  plano,
  ativando,
  onPress,
  onAtivar,
  onApagar,
}: {
  plano: PlanoCompleto
  ativando: boolean
  onPress: () => void
  onAtivar: () => void
  onApagar: () => void
}) {
  const styles = estilos()
  const totais = totaisDe(itensDoPlano(plano.refeicoes))
  const quantasRefeicoes = plano.refeicoes.length

  return (
    <View style={[styles.cartao, plano.ativo && styles.cartaoAtivo]}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.corpoCartao, pressed && styles.corpoPressionado]}
        accessibilityRole="button"
        accessibilityLabel={`Abrir o plano ${plano.nome}`}
      >
        <View style={styles.textoCartao}>
          <View style={styles.linhaNome}>
            <Text style={styles.nome} numberOfLines={1}>
              {plano.nome}
            </Text>
            {plano.ativo && (
              <View style={styles.selo}>
                <Text style={styles.textoSelo}>Ativo</Text>
              </View>
            )}
          </View>

          <View style={styles.linhaDias}>
            <Ionicons name="repeat-outline" size={13} color={paleta().cores.verde} />
            <Text style={styles.dias} numberOfLines={1}>
              {resumoDosDias(plano.diasSemana)}
            </Text>
          </View>

          <Text style={styles.detalhe}>
            {quantasRefeicoes} {quantasRefeicoes === 1 ? 'refeição' : 'refeições'}
            {totais.calorias !== null && ` · ${milhar(totais.calorias)} kcal`}
          </Text>
          <Text style={styles.data}>Criado em {dataNumerica(new Date(plano.criadoEm))}</Text>
        </View>

        <Ionicons name="chevron-forward" size={19} color={paleta().inkFraco} />
      </Pressable>

      <Pressable
        onPress={onApagar}
        hitSlop={10}
        style={({ pressed }) => [styles.apagar, pressed && styles.apagarPressionado]}
        accessibilityRole="button"
        accessibilityLabel={`Apagar o plano ${plano.nome}`}
      >
        <Ionicons name="close" size={17} color={paleta().inkFraco} />
      </Pressable>

      {plano.ativo ? (
        <Text style={styles.avisoAtivo}>É este que aparece na sua tela inicial.</Text>
      ) : (
        <Pressable
          onPress={onAtivar}
          disabled={ativando}
          style={({ pressed }) => [styles.botaoAtivar, pressed && styles.botaoAtivarPressionado]}
          accessibilityRole="button"
          accessibilityLabel={`Ativar o plano ${plano.nome}`}
        >
          {ativando ? (
            <ActivityIndicator size="small" color={paleta().cores.verde} />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={16} color={paleta().cores.verde} />
              <Text style={styles.textoAtivar}>Ativar este plano</Text>
            </>
          )}
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
  tituloTela: { flexShrink: 1, fontSize: 17, fontWeight: '800', color: t.cores.ink },

  conteudo: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, gap: 10 },
  chamada: { marginBottom: 4, fontSize: 14, color: t.inkSuave },

  porta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 20,
    backgroundColor: t.cores.cartao,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  icone: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: t.cores.verdeClaro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tituloPorta: { fontSize: 16, fontWeight: '800', color: t.cores.ink },
  resumoPorta: { marginTop: 3, fontSize: 12.5, color: t.inkSuave },

  vazio: { fontSize: 13, lineHeight: 19, color: t.inkSuave },

  blocoErro: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.cores.erroBorda,
    backgroundColor: t.cores.erroFundo,
  },
  tituloErro: { fontSize: 13.5, fontWeight: '700', color: t.cores.erroTexto },
  detalheErro: { marginTop: 5, fontSize: 12.5, lineHeight: 18, color: t.cores.erroTexto },

  cartao: {
    borderRadius: 18,
    backgroundColor: t.cores.cartao,
    borderWidth: 1,
    borderColor: t.cores.borda,
    /* Recorta o realce do toque no arredondado do cartão. */
    overflow: 'hidden',
  },
  cartaoAtivo: { borderColor: t.cores.verdeClaro, backgroundColor: t.cores.verdeMenta },
  corpoCartao: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  corpoPressionado: { backgroundColor: t.cores.verdeClaro },
  cartaoPressionado: { backgroundColor: t.cores.verdeMenta, borderColor: t.cores.verdeClaro },
  textoCartao: { flex: 1 },
  linhaNome: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nome: { flexShrink: 1, fontSize: 15.5, fontWeight: '800', color: t.cores.ink },
  selo: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: t.cores.verde,
  },
  textoSelo: { fontSize: 10.5, fontWeight: '800', color: t.cores.branco },

  avisoAtivo: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    fontSize: 11.5,
    color: t.inkSuave,
  },
  botaoAtivar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderTopWidth: 1,
    borderTopColor: t.cores.borda,
  },
  botaoAtivarPressionado: { backgroundColor: t.cores.verdeClaro },
  textoAtivar: { fontSize: 13.5, fontWeight: '700', color: t.cores.verde },
  linhaDias: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  dias: { flexShrink: 1, fontSize: 12.5, fontWeight: '700', color: t.cores.verde },
  detalhe: { marginTop: 4, fontSize: 12.5, color: t.inkSuave },
  data: { marginTop: 2, fontSize: 11.5, color: t.inkFraco },
  retrato: { marginTop: 4, fontSize: 11, lineHeight: 15, color: t.inkFraco },

  linhaNumeros: { flexDirection: 'row', gap: 16, marginTop: 8 },
  numero: {},
  rotuloNumero: { fontSize: 11, color: t.inkSuave },
  valorNumero: { marginTop: 1, fontSize: 15, fontWeight: '800', color: t.cores.ink },
  valorAlvo: { color: t.cores.verde },

  apagar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  apagarPressionado: { backgroundColor: t.cores.trilho },

  blocoMetas: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: t.cores.cartao,
    borderWidth: 1,
    borderColor: t.cores.borda,
    gap: 8,
  },
  tituloBlocoMetas: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  textoTituloBloco: { fontSize: 14.5, fontWeight: '800', color: t.cores.ink },
  linhaMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rotuloMeta: { fontSize: 13.5, color: t.inkSuave },
  valorMeta: { flexShrink: 1, fontSize: 13.5, fontWeight: '700', color: t.inkMedio },
  notaBloco: { fontSize: 11, color: t.inkFraco },

  rodape: { paddingHorizontal: 20, paddingTop: 10 },
  botao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    borderRadius: 16,
    backgroundColor: t.cores.verde,
  },
  botaoPressionado: { backgroundColor: t.cores.verdeEscuro },
  textoBotao: { fontSize: 15.5, fontWeight: '700', color: t.cores.branco },
  }),
)
