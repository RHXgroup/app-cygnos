import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
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
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  apagarRegistro,
  carregarAgua,
  coposDaMeta,
  coposDe,
  mediaDiaria,
  porHoraDoDia,
  registrarAgua,
  sequenciaNaMeta,
  totalDe,
  volume,
  COPO_MAX_ML,
  COPO_MIN_ML,
  META_MAX_ML,
  META_MIN_ML,
  type Agua,
  type DiaAgua,
  type RegistroAgua,
} from '../lib/agua'
/* De metas, e não de agua: a versão que vivia ali usava ON CONFLICT em
   conta_id, que deixou de ser chave única quando as metas viraram lista — o
   Postgres recusava toda gravação com 42P10 e a meta nunca salvava. */
import { salvarMetaAgua } from '../lib/metas'
import { DIAS_CURTOS, horaCurta, milhar } from '../lib/formatar'
import { estilosDe, paleta } from '../lib/tema'

/* Água: registrar, desfazer, ver o dia e a semana.
 *
 * O centro da tela é o botão de um copo. Tudo o mais — a lista de hoje, as sete
 * barras, a meta — está abaixo dele, porque registrar água é o que se faz aqui
 * oito vezes por dia; o resto se olha uma vez por semana. */
export function AguaScreen({
  contaId,
  onFechar,
  onMudou,
}: {
  contaId: string
  onFechar: () => void
  /* Avisa quem estiver por baixo (a tela inicial) que o total de hoje mudou.
     Chamado ao fechar, e não a cada copo: a Home refaz a busca inteira, e fazer
     isso a cada toque seria uma consulta por copo sem ninguém olhando. */
  onMudou: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const [agua, setAgua] = useState<Agua | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  /* Alguma coisa mudou desde que a tela abriu? Sem isto, fechar sem registrar
     nada mandaria a Home buscar tudo de novo à toa. */
  const [mudou, setMudou] = useState(false)
  const [outroAberto, setOutroAberto] = useState(false)
  const [metaAberta, setMetaAberta] = useState(false)

  useEffect(() => {
    let ativo = true
    setCarregando(true)

    carregarAgua(contaId).then(r => {
      if (!ativo) return

      if (r.tipo === 'erro') setErro(r.mensagem)
      else {
        setErro('')
        setAgua(r.agua)
      }
      setCarregando(false)
    })

    return () => {
      ativo = false
    }
  }, [contaId])

  function fechar() {
    if (mudou) onMudou()
    onFechar()
  }

  /* Registrar é otimista: a linha entra na tela antes de o banco confirmar.
   *
   * Não é enfeite. O gesto é tocar e guardar o telefone, e um copo que só
   * aparece depois da ida e volta faz a pessoa tocar duas vezes — e aí são dois
   * copos no histórico. A linha provisória ganha um id que o banco nunca
   * geraria; quando a resposta chega, ela é trocada pela de verdade, e se falhar
   * ela sai e o erro aparece. */
  async function registrar(ml: number) {
    if (!agua) return

    const provisorio: RegistroAgua = {
      id: `provisorio-${Date.now()}`,
      ml,
      bebidoEm: new Date().toISOString(),
    }

    setErro('')
    setAgua(a => (a ? { ...a, hoje: [provisorio, ...a.hoje] } : a))

    const r = await registrarAgua(contaId, ml)

    if (r.tipo === 'erro') {
      setAgua(a => (a ? { ...a, hoje: a.hoje.filter(x => x.id !== provisorio.id) } : a))
      setErro(r.mensagem)
      return
    }

    setMudou(true)
    setAgua(a =>
      a ? { ...a, hoje: a.hoje.map(x => (x.id === provisorio.id ? r.registro : x)) } : a,
    )
  }

  /* Some da tela na hora, pelo mesmo motivo. Se o banco recusar, volta ao lugar:
     a lista é curta e ordenada por hora, então ela reaparece onde estava. */
  async function apagar(registro: RegistroAgua) {
    setErro('')
    setAgua(a => (a ? { ...a, hoje: a.hoje.filter(x => x.id !== registro.id) } : a))

    const falha = await apagarRegistro(registro.id)

    if (falha) {
      setAgua(a =>
        a
          ? {
              ...a,
              /* Comparado como instante, e não como texto: o banco devolve
                 "+00:00" e o registro otimista devolve "Z" — o mesmo momento
                 escrito de dois jeitos, que ordenam diferente como string. */
              hoje: [...a.hoje, registro].sort(
                (x, y) => Date.parse(y.bebidoEm) - Date.parse(x.bebidoEm),
              ),
            }
          : a,
      )
      setErro(falha.erro)
      return
    }

    setMudou(true)
  }

  async function salvarMeta(metaMl: number, copoMl: number) {
    if (!agua) return

    const anterior = { metaMl: agua.metaMl, copoMl: agua.copoMl }
    setErro('')
    setAgua(a => (a ? { ...a, metaMl, copoMl } : a))

    const falha = await salvarMetaAgua(contaId, { metaMl, copoMl })

    if (falha) {
      setAgua(a => (a ? { ...a, ...anterior } : a))
      setErro(falha.erro)
      return
    }

    setMudou(true)
    setMetaAberta(false)
    Keyboard.dismiss()
  }

  const bebido = agua ? totalDe(agua.hoje) : 0

  return (
    /* Na raiz, como nas outras telas com campo: sem isto o teclado numérico
       sobe por cima do bloco da meta, que é o último da rolagem, e a pessoa
       digita às cegas.
     *
     * 'height' no Android, e não `undefined`. Sem comportamento definido este
     * componente não faz nada — e o que antes cobria a lacuna era o sistema
     * encolher a janela sozinho, que deixou de acontecer quando o Expo passou a
     * ligar edge-to-edge por padrão. A documentação do SDK avisa disso e aponta
     * o KeyboardAvoidingView como o caminho; sem os dois, o campo ficava
     * escondido atrás do teclado. */
    <KeyboardAvoidingView
      style={[styles.tela, { paddingTop: top + 8 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.cabecalho}>
        <Pressable
          onPress={fechar}
          style={styles.botaoVoltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela}>Água</Text>
        <View style={styles.botaoVoltar} />
      </View>

      {carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator color={paleta().cores.verde} />
        </View>
      ) : !agua ? (
        <View style={styles.conteudoErro}>
          <View style={styles.blocoErro}>
            <Text style={styles.tituloErro}>Não foi possível carregar</Text>
            {/* A mensagem crua junto: sem ela, "sem internet" e "migração não
                aplicada" viram o mesmo aviso e não há como saber qual foi. */}
            <Text style={styles.detalheErro}>{erro}</Text>
          </View>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.conteudo, { paddingBottom: Math.max(bottom, 16) + 16 }]}
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
          keyboardShouldPersistTaps="handled"
          /* Rolar fecha o teclado. É a única saída sem tocar num botão: o
             teclado numérico do iOS não tem tecla de retorno, então "concluir"
             não existe — sem isto, quem abre o campo e desiste fica preso. */
          keyboardDismissMode="on-drag"
        >
          <CartaoDoDia bebido={bebido} metaMl={agua.metaMl} copoMl={agua.copoMl} />

          <View style={styles.botoes}>
            <BotaoRegistrar
              ml={agua.copoMl}
              rotulo="1 copo"
              icone="water-outline"
              onPress={() => registrar(agua.copoMl)}
            />
            <BotaoRegistrar
              ml={agua.copoMl * 2}
              rotulo="2 copos"
              icone="beaker-outline"
              onPress={() => registrar(agua.copoMl * 2)}
            />
            <BotaoRegistrar
              rotulo="Outro"
              icone="create-outline"
              onPress={() => setOutroAberto(a => !a)}
              ativo={outroAberto}
            />
          </View>

          {outroAberto && (
            <CampoOutro
              onRegistrar={ml => {
                setOutroAberto(false)
                Keyboard.dismiss()
                registrar(ml)
              }}
            />
          )}

          {!!erro && (
            <View style={styles.blocoErro}>
              <Text style={styles.tituloErro}>Não foi possível salvar</Text>
              <Text style={styles.detalheErro}>{erro}</Text>
            </View>
          )}

          <AoLongoDoDia registros={agua.hoje} />

          <ListaDeHoje registros={agua.hoje} onApagar={apagar} />

          <Semana dias={agua.semana} metaMl={agua.metaMl} />

          <BlocoMeta
            metaMl={agua.metaMl}
            copoMl={agua.copoMl}
            aberto={metaAberta}
            onAbrir={() => setMetaAberta(a => !a)}
            onSalvar={salvarMeta}
          />
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  )
}

/* Quanto já foi hoje. O que falta vem escrito por extenso, e não só a
   porcentagem: "faltam 750 ml" diz o que fazer agora; "62%" pede uma conta. */
function CartaoDoDia({
  bebido,
  metaMl,
  copoMl,
}: {
  bebido: number
  metaMl: number
  copoMl: number
}) {
  const styles = estilos()
  const fracao = metaMl > 0 ? Math.min(bebido / metaMl, 1) : 0
  const faltam = Math.max(metaMl - bebido, 0)
  const copos = coposDe(bebido, copoMl)
  const coposMeta = coposDaMeta(metaMl, copoMl)

  return (
    <View style={styles.cartaoDia}>
      <View style={styles.linhaTituloDia}>
        <Ionicons name="water" size={16} color={paleta().cores.branco} />
        <Text style={styles.tituloDia}>Hoje</Text>
        <Text style={styles.percentualDia}>{Math.round(fracao * 100)}%</Text>
      </View>

      <View style={styles.linhaValorDia}>
        <Text style={styles.valorDia}>{milhar(bebido)}</Text>
        <Text style={styles.unidadeDia}>ml</Text>
        <Text style={styles.metaDia}>de {milhar(metaMl)} ml</Text>
      </View>

      <View style={styles.trilhoDia}>
        <View style={[styles.preenchimentoDia, { width: `${fracao * 100}%` }]} />
      </View>

      {/* Os copos desenhados são a mesma informação da barra, em unidades que se
          contam. Acima de doze eles ficariam finos demais para contar, e aí a
          barra sozinha diz mais. */}
      {coposMeta <= 12 && (
        <View style={styles.copos}>
          {Array.from({ length: coposMeta }, (_, i) => (
            <View key={i} style={[styles.copo, i >= copos && styles.copoVazio]} />
          ))}
        </View>
      )}

      <Text style={styles.rodapeDia}>
        {faltam === 0
          ? 'Meta do dia batida. 🎉'
          : `Faltam ${volume(faltam)} — cerca de ${Math.max(coposMeta - copos, 1)} ${
              coposMeta - copos === 1 ? 'copo' : 'copos'
            }.`}
      </Text>
    </View>
  )
}

function BotaoRegistrar({
  ml,
  rotulo,
  icone,
  onPress,
  ativo,
}: {
  ml?: number
  rotulo: string
  icone: keyof typeof Ionicons.glyphMap
  onPress: () => void
  ativo?: boolean
}) {
  const styles = estilos()
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.botaoRegistrar,
        ativo && styles.botaoRegistrarAtivo,
        pressed && styles.botaoRegistrarPressionado,
      ]}
      accessibilityRole="button"
      accessibilityLabel={ml ? `Registrar ${rotulo}, ${ml} mililitros` : rotulo}
    >
      <Ionicons name={icone} size={20} color={paleta().cores.verde} />
      <Text style={styles.rotuloBotao}>{rotulo}</Text>
      {/* Sempre visível, e não só no rótulo: "1 copo" muda de tamanho conforme
          a meta da pessoa, e o número é o que diz quanto vai entrar. */}
      <Text style={styles.mlBotao}>{ml ? `${milhar(ml)} ml` : 'quanto?'}</Text>
    </Pressable>
  )
}

/* A quantidade avulsa. Vive num estado próprio para o texto sendo digitado não
   fazer a tela inteira renderizar a cada tecla. */
function CampoOutro({ onRegistrar }: { onRegistrar: (ml: number) => void }) {
  const styles = estilos()
  const [texto, setTexto] = useState('')
  const ml = Number(texto)
  const valido = Number.isFinite(ml) && ml >= 1 && ml <= 5000

  return (
    <View style={styles.blocoOutro}>
      <TextInput
        value={texto}
        onChangeText={t => setTexto(t.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        placeholder="Quantos ml?"
        placeholderTextColor={paleta().inkFraco}
        keyboardAppearance="dark"
        autoFocus
        maxLength={4}
        style={styles.campoOutro}
        onSubmitEditing={() => valido && onRegistrar(ml)}
        returnKeyType="done"
        accessibilityLabel="Quantidade em mililitros"
      />
      <Pressable
        onPress={() => onRegistrar(ml)}
        disabled={!valido}
        style={({ pressed }) => [
          styles.confirmarOutro,
          !valido && styles.confirmarDesligado,
          pressed && styles.confirmarPressionado,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Registrar"
      >
        <Ionicons name="checkmark" size={20} color={paleta().cores.branco} />
      </Pressable>
    </View>
  )
}

/* Quando, dentro do dia, a água foi bebida.
 *
 * É a leitura que o app tinha desde sempre e nunca mostrou. O horário de cada
 * gole está gravado; o total do topo da tela, não. E dois litros bebidos todos
 * depois das nove da noite não é a mesma coisa que dois litros distribuídos —
 * só que o número diz exatamente a mesma coisa nos dois casos.
 *
 * Vinte e quatro barras finas, uma por hora, sem esconder nada: agrupar de três
 * em três caberia melhor, mas apagaria justamente a informação que faz a pessoa
 * mudar de hábito, que é reconhecer o próprio buraco da tarde.
 *
 * A altura é relativa à MAIOR hora do dia, e não à meta: a pergunta aqui é
 * "quando", não "quanto" — o quanto já está no cartão de cima. */
function AoLongoDoDia({ registros }: { registros: RegistroAgua[] }) {
  const styles = estilos()
  const horas = porHoraDoDia(registros)
  const pico = Math.max(...horas)

  return (
    <View style={styles.bloco}>
      <View style={styles.linhaTituloBloco}>
        <Text style={styles.tituloBloco}>Ao longo do dia</Text>
        {pico > 0 && <Text style={styles.contagemBloco}>{resumoDoDia(horas)}</Text>}
      </View>

      {pico === 0 ? (
        <Text style={styles.vazioBloco}>
          Assim que você registrar o primeiro copo, o horário aparece aqui.
        </Text>
      ) : (
        <>
          <View style={styles.faixaHoras}>
            {horas.map((ml, hora) => (
              <View key={hora} style={styles.colunaHora}>
                <View
                  style={[
                    styles.barraHora,
                    /* Zero fica como trilho, e não como barra de altura mínima:
                       aqui a ausência É a informação. */
                    ml > 0 && { height: Math.max((ml / pico) * ALTURA_HORAS, 4) },
                    ml > 0 && styles.barraHoraCheia,
                  ]}
                />
              </View>
            ))}
          </View>

          {/* Quatro marcas, e não vinte e quatro: o eixo serve para situar, e
              legenda ilegível não situa ninguém. */}
          <View style={styles.eixoHoras}>
            {['0h', '6h', '12h', '18h'].map(h => (
              <Text key={h} style={styles.marcaHora}>
                {h}
              </Text>
            ))}
          </View>
        </>
      )}
    </View>
  )
}

/* "mais da metade depois das 18h" — a frase só aparece quando há concentração
   de verdade. Sem um período dominante ela não é dita: inventar padrão onde não
   há é o mesmo defeito do anel que mistura dois dias. */
function resumoDoDia(horas: number[]): string {
  const total = horas.reduce((s, h) => s + h, 0)
  if (total === 0) return ''

  const faixas: { rotulo: string; de: number; ate: number }[] = [
    { rotulo: 'de manhã', de: 6, ate: 12 },
    { rotulo: 'à tarde', de: 12, ate: 18 },
    { rotulo: 'à noite', de: 18, ate: 24 },
    { rotulo: 'de madrugada', de: 0, ate: 6 },
  ]

  const somas = faixas.map(f => ({
    ...f,
    ml: horas.slice(f.de, f.ate).reduce((s, h) => s + h, 0),
  }))
  const maior = somas.reduce((a, b) => (b.ml > a.ml ? b : a))
  const parte = maior.ml / total

  if (parte < 0.5) return 'bem distribuído'
  return `${Math.round(parte * 100)}% ${maior.rotulo}`
}

function ListaDeHoje({
  registros,
  onApagar,
}: {
  registros: RegistroAgua[]
  onApagar: (r: RegistroAgua) => void
}) {
  const styles = estilos()
  return (
    <View style={styles.bloco}>
      <View style={styles.linhaTituloBloco}>
        <Text style={styles.tituloBloco}>Registros de hoje</Text>
        {registros.length > 0 && (
          <Text style={styles.contagemBloco}>
            {registros.length} {registros.length === 1 ? 'registro' : 'registros'}
          </Text>
        )}
      </View>

      {registros.length === 0 ? (
        <Text style={styles.vazio}>
          Nenhum copo registrado hoje. Toque em um dos botões acima quando beber.
        </Text>
      ) : (
        registros.map(r => (
          <View key={r.id} style={styles.linhaRegistro}>
            <View style={styles.gotaRegistro}>
              <Ionicons name="water" size={14} color={paleta().cores.verde} />
            </View>
            <Text style={styles.mlRegistro}>{milhar(r.ml)} ml</Text>
            <Text style={styles.horaRegistro}>{horaCurta(new Date(r.bebidoEm))}</Text>
            {/* O X fica na ponta e com hitSlop: é o desfazer de um toque errado,
                e ele mesmo não pode ser fácil de acertar sem querer. */}
            <Pressable
              onPress={() => onApagar(r)}
              hitSlop={10}
              style={({ pressed }) => [styles.apagar, pressed && styles.apagarPressionado]}
              accessibilityRole="button"
              accessibilityLabel={`Apagar o registro de ${r.ml} mililitros`}
            >
              <Ionicons name="close" size={16} color={paleta().inkFraco} />
            </Pressable>
          </View>
        ))
      )}
    </View>
  )
}

/* As sete barras. A altura é medida contra a MAIOR das duas — a meta ou o maior
   dia —, e não contra a meta sozinha: num dia de 3 L com meta de 2 L, a barra
   estouraria o topo e três dias diferentes ficariam do mesmo tamanho. */
function Semana({ dias, metaMl }: { dias: DiaAgua[]; metaMl: number }) {
  const styles = estilos()
  const teto = Math.max(metaMl, ...dias.map(d => d.ml), 1)
  const bateram = dias.filter(d => d.ml >= metaMl).length
  const seguidos = sequenciaNaMeta(dias, metaMl)
  const media = mediaDiaria(dias)

  return (
    <View style={styles.bloco}>
      <View style={styles.linhaTituloBloco}>
        <Text style={styles.tituloBloco}>Últimos 7 dias</Text>
        <Text style={styles.contagemBloco}>
          {bateram} de 7 {bateram === 1 ? 'dia na meta' : 'dias na meta'}
        </Text>
      </View>

      {/* Dois números que o app já sabia e nunca disse. A sequência é o que
          sustenta hábito — "não quebrar" move mais gente do que "bater a meta" —
          e a média responde o que sete barras não respondem de relance: no
          geral, você bebe quanto? */}
      <View style={styles.linhaResumo}>
        <View style={styles.resumo}>
          <Text style={styles.numeroResumo}>{seguidos}</Text>
          <Text style={styles.rotuloResumo}>
            {seguidos === 1 ? 'dia seguido na meta' : 'dias seguidos na meta'}
          </Text>
        </View>
        <View style={styles.divisorResumo} />
        <View style={styles.resumo}>
          <Text style={styles.numeroResumo}>{volume(media)}</Text>
          <Text style={styles.rotuloResumo}>por dia, em média</Text>
        </View>
      </View>

      <View style={styles.grafico}>
        {/* A linha da meta atravessa o gráfico: sem ela, sete barras coloridas
            não dizem contra o quê estão sendo comparadas. */}
        <View style={[styles.linhaMeta, { bottom: (metaMl / teto) * ALTURA_GRAFICO }]} />

        {dias.map((d, i) => {
          /* A data vem como 'YYYY-MM-DD' e é lida como número, não com
             new Date(texto): a string sem hora é interpretada como UTC, e no
             fuso de Brasília isso devolve o dia anterior. */
          const [ano, mes, dia] = d.data.split('-').map(Number)
          const diaSemana = new Date(ano, mes - 1, dia).getDay()
          const bateu = d.ml >= metaMl
          const hoje = i === dias.length - 1

          return (
            <View key={d.data} style={styles.colunaDia}>
              <View style={styles.trilhoBarra}>
                <View
                  style={[
                    styles.barra,
                    /* Um fio de altura mesmo no zero: uma coluna sem nada seria
                       indistinguível de uma coluna que não existe. */
                    { height: Math.max((d.ml / teto) * ALTURA_GRAFICO, 3) },
                    bateu && styles.barraNaMeta,
                    d.ml === 0 && styles.barraVazia,
                  ]}
                />
              </View>
              <Text style={[styles.rotuloDia, hoje && styles.rotuloHoje]}>
                {DIAS_CURTOS[diaSemana]}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

function BlocoMeta({
  metaMl,
  copoMl,
  aberto,
  onAbrir,
  onSalvar,
}: {
  metaMl: number
  copoMl: number
  aberto: boolean
  onAbrir: () => void
  onSalvar: (metaMl: number, copoMl: number) => void
}) {
  const styles = estilos()
  const [meta, setMeta] = useState(String(metaMl))
  const [copo, setCopo] = useState(String(copoMl))

  /* Volta ao que está salvo toda vez que o bloco abre: quem digitou 9000, mudou
     de ideia e fechou não deve reencontrar o 9000 esperando na próxima vez. */
  useEffect(() => {
    if (aberto) {
      setMeta(String(metaMl))
      setCopo(String(copoMl))
    }
  }, [aberto, metaMl, copoMl])

  const nMeta = Number(meta)
  const nCopo = Number(copo)
  const metaOk = Number.isFinite(nMeta) && nMeta >= META_MIN_ML && nMeta <= META_MAX_ML
  const copoOk = Number.isFinite(nCopo) && nCopo >= COPO_MIN_ML && nCopo <= COPO_MAX_ML

  return (
    <View style={styles.bloco}>
      <View style={styles.linhaTituloBloco}>
        <Text style={styles.tituloBloco}>Sua meta</Text>
        <Text style={styles.contagemBloco}>
          {milhar(metaMl)} ml · copo de {milhar(copoMl)} ml
        </Text>
      </View>

      {!aberto ? (
        <>
          <Text style={styles.vazio}>
            A meta é sua. Estes dois números também aparecem na tela de Metas, junto com as de
            caloria, passos e treino — é o mesmo número nos dois lugares.
          </Text>

          {/* Um botão de verdade, e não a faixa do título com uma seta.
              A seta sozinha não se lê como algo tocável quando está ao lado de
              um texto que parece explicação — e quem procurava como mudar a meta
              não achava o caminho. */}
          <Pressable
            onPress={onAbrir}
            style={({ pressed }) => [styles.botaoAjustar, pressed && styles.botaoAjustarPressionado]}
            accessibilityRole="button"
            accessibilityLabel="Ajustar a meta de água"
          >
            <Ionicons name="create-outline" size={17} color={paleta().cores.verde} />
            <Text style={styles.textoBotaoAjustar}>Ajustar meta</Text>
          </Pressable>
        </>
      ) : (
        <>
          <View style={styles.linhaCampos}>
            <View style={styles.campoMeta}>
              <Text style={styles.rotuloCampo}>Meta do dia (ml)</Text>
              <TextInput
                value={meta}
                onChangeText={t => setMeta(t.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                maxLength={5}
                style={[styles.campo, !metaOk && styles.campoComErro]}
                accessibilityLabel="Meta do dia em mililitros"
              />
              <Text style={styles.ajudaCampo}>
                {META_MIN_ML} a {milhar(META_MAX_ML)} ml
              </Text>
            </View>

            <View style={styles.campoMeta}>
              <Text style={styles.rotuloCampo}>Seu copo (ml)</Text>
              <TextInput
                value={copo}
                onChangeText={t => setCopo(t.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                maxLength={3}
                style={[styles.campo, !copoOk && styles.campoComErro]}
                accessibilityLabel="Tamanho do seu copo em mililitros"
              />
              <Text style={styles.ajudaCampo}>
                {COPO_MIN_ML} a {COPO_MAX_ML} ml
              </Text>
            </View>
          </View>

          {metaOk && copoOk && (
            <Text style={styles.previaMeta}>
              São {coposDaMeta(nMeta, nCopo)} copos por dia.
            </Text>
          )}

          {/* Cancelar existe porque o título deixou de ser o interruptor: sem
              ele, quem abriu por curiosidade não teria como fechar sem gravar. */}
          <View style={styles.linhaBotoes}>
            <Pressable
              onPress={onAbrir}
              style={({ pressed }) => [styles.botaoCancelar, pressed && styles.botaoCancelarPressionado]}
              accessibilityRole="button"
            >
              <Text style={styles.textoBotaoCancelar}>Cancelar</Text>
            </Pressable>

            <Pressable
              onPress={() => onSalvar(nMeta, nCopo)}
              disabled={!metaOk || !copoOk}
              style={({ pressed }) => [
                styles.botaoSalvar,
                (!metaOk || !copoOk) && styles.botaoDesligado,
                pressed && styles.botaoSalvarPressionado,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.textoBotaoSalvar}>Salvar meta</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  )
}

const ALTURA_GRAFICO = 96
/* Mais baixo que o da semana: são vinte e quatro colunas em vez de sete, e a
   mesma altura viraria um paredão. */
const ALTURA_HORAS = 56

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

  conteudo: { paddingHorizontal: 20, paddingTop: 8, gap: 14 },
  conteudoErro: { paddingHorizontal: 20, paddingTop: 8 },

  blocoErro: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.cores.erroBorda,
    backgroundColor: t.cores.erroFundo,
  },
  tituloErro: { fontSize: 13.5, fontWeight: '700', color: t.cores.erroTexto },
  detalheErro: { marginTop: 5, fontSize: 12.5, lineHeight: 18, color: t.cores.erroTexto },

  /* ── Cartão do dia ── */
  cartaoDia: { borderRadius: 20, backgroundColor: t.cores.verde, padding: 18 },
  linhaTituloDia: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  tituloDia: { flex: 1, fontSize: 15, fontWeight: '700', color: t.cores.branco },
  percentualDia: { fontSize: 15, fontWeight: '800', color: 'rgba(255,255,255,0.9)' },
  linhaValorDia: { flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 10 },
  valorDia: { fontSize: 40, fontWeight: '800', color: t.cores.branco, letterSpacing: -1.4 },
  unidadeDia: { fontSize: 15, fontWeight: '700', color: t.cores.branco },
  metaDia: { marginLeft: 4, fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.8)' },
  trilhoDia: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden',
    marginTop: 12,
  },
  preenchimentoDia: { height: '100%', borderRadius: 4, backgroundColor: t.cores.branco },
  copos: { flexDirection: 'row', gap: 4, marginTop: 10 },
  copo: { flex: 1, height: 18, borderRadius: 4, backgroundColor: t.cores.branco },
  copoVazio: { backgroundColor: 'rgba(255,255,255,0.32)' },
  rodapeDia: { marginTop: 12, fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.92)' },

  /* ── Botões de registro ── */
  botoes: { flexDirection: 'row', gap: 10 },
  botaoRegistrar: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: t.cores.cartao,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  botaoRegistrarAtivo: { backgroundColor: t.cores.verdeMenta, borderColor: t.cores.verdeClaro },
  botaoRegistrarPressionado: { backgroundColor: t.cores.verdeClaro, borderColor: t.cores.verdeClaro },
  rotuloBotao: { fontSize: 13.5, fontWeight: '800', color: t.cores.ink },
  mlBotao: { fontSize: 11.5, color: t.inkSuave },

  blocoOutro: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  campoOutro: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.borda,
    backgroundColor: t.cores.cartao,
    paddingHorizontal: 16,
    /* 16 é o mínimo que o iOS aceita sem dar zoom automático no campo. */
    fontSize: 16,
    color: t.cores.ink,
  },
  confirmarOutro: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.cores.verde,
  },
  confirmarPressionado: { backgroundColor: t.cores.verdeEscuro },
  confirmarDesligado: { backgroundColor: t.cores.trilho },

  /* ── Blocos ── */
  bloco: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: t.cores.cartao,
    borderWidth: 1,
    borderColor: t.cores.borda,
    gap: 8,
  },
  linhaTituloBloco: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tituloBloco: { flex: 1, fontSize: 15, fontWeight: '800', color: t.cores.ink },
  contagemBloco: { fontSize: 11.5, fontWeight: '600', color: t.inkSuave },
  vazio: { fontSize: 12.5, lineHeight: 18, color: t.inkSuave },

  linhaRegistro: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  gotaRegistro: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: t.cores.verdeClaro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mlRegistro: { flex: 1, fontSize: 14, fontWeight: '700', color: t.cores.ink },
  horaRegistro: { fontSize: 12.5, color: t.inkMedio },
  apagar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  apagarPressionado: { backgroundColor: t.cores.trilho },

  /* ── Gráfico da semana ── */
  grafico: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 6 },

  linhaResumo: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  resumo: { flex: 1, alignItems: 'center', gap: 2 },
  numeroResumo: { fontSize: 20, fontWeight: '800', color: t.cores.limao },
  rotuloResumo: { fontSize: 11.5, color: t.inkFraco, textAlign: 'center' },
  divisorResumo: { width: 1, alignSelf: 'stretch', backgroundColor: t.cores.borda },

  faixaHoras: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: ALTURA_HORAS,
    marginTop: 10,
  },
  colunaHora: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  barraHora: { height: 2, borderRadius: 2, backgroundColor: t.cores.trilho },
  barraHoraCheia: { backgroundColor: t.cores.limao },
  eixoHoras: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  marcaHora: { fontSize: 10.5, color: t.inkFraco },
  vazioBloco: { marginTop: 8, fontSize: 13, lineHeight: 19, color: t.inkFraco },
  linhaMeta: {
    position: 'absolute',
    left: 0,
    right: 0,
    /* O rótulo do dia mora abaixo do trilho, então a linha da meta é medida a
       partir do pé das barras — daí o deslocamento. */
    marginBottom: 20,
    height: 1,
    backgroundColor: t.cores.verdeClaro,
  },
  colunaDia: { flex: 1, alignItems: 'center', gap: 5 },
  trilhoBarra: { height: ALTURA_GRAFICO, width: '100%', justifyContent: 'flex-end' },
  barra: { width: '100%', borderRadius: 6, backgroundColor: t.cores.verdeClaro },
  barraNaMeta: { backgroundColor: t.cores.verde },
  barraVazia: { backgroundColor: t.cores.trilho },
  rotuloDia: { fontSize: 11, fontWeight: '600', color: t.inkFraco },
  rotuloHoje: { color: t.cores.verde, fontWeight: '800' },

  /* ── Meta ── */
  linhaCampos: { flexDirection: 'row', gap: 10, marginTop: 4 },
  campoMeta: { flex: 1 },
  rotuloCampo: { marginBottom: 6, fontSize: 12.5, fontWeight: '600', color: t.inkMedio },
  campo: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.borda,
    backgroundColor: t.cores.superficie,
    paddingHorizontal: 14,
    fontSize: 16,
    color: t.cores.ink,
  },
  campoComErro: { borderColor: t.cores.erroBorda, backgroundColor: t.cores.erroFundo },
  ajudaCampo: { marginTop: 4, fontSize: 11, color: t.inkFraco },
  previaMeta: { fontSize: 12.5, fontWeight: '600', color: t.cores.verde },

  /* Contornado e não preenchido: ajustar a meta é o que se faz uma vez, e um
     botão verde cheio aqui competiria com os de registrar copo lá em cima, que
     são o motivo de a tela existir. */
  botaoAjustar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.verdeClaro,
    backgroundColor: t.cores.verdeMenta,
    marginTop: 4,
  },
  botaoAjustarPressionado: { backgroundColor: t.cores.verdeClaro },
  textoBotaoAjustar: { fontSize: 14.5, fontWeight: '700', color: t.cores.verde },

  linhaBotoes: { flexDirection: 'row', gap: 10, marginTop: 4 },
  botaoCancelar: {
    /* Menor que o salvar de propósito: os dois lado a lado com o mesmo peso
       fariam desistir e confirmar parecerem a mesma decisão. */
    paddingHorizontal: 20,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.cores.superficie,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  botaoCancelarPressionado: { backgroundColor: t.cores.trilho },
  textoBotaoCancelar: { fontSize: 14.5, fontWeight: '700', color: t.inkMedio },
  botaoSalvar: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.cores.verde,
  },
  botaoSalvarPressionado: { backgroundColor: t.cores.verdeEscuro },
  botaoDesligado: { backgroundColor: t.cores.trilho },
  textoBotaoSalvar: { fontSize: 15, fontWeight: '700', color: t.cores.branco },
  }),
)
