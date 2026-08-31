import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { consultarCodigo, type ProdutoLido } from '../lib/codigoBarras'
import { porcao } from '../lib/alimentos'
import { novaChave, type AlimentoEscolhido } from '../lib/plano'
import { milhar } from '../lib/formatar'
import { estilosDe, paleta } from '../lib/tema'

/* Ler o código de barras do produto.
 *
 * O pacote na mão já diz exatamente qual produto é. Digitar "biscoito recheado
 * chocolate" e escolher entre doze parecidos é o oposto do gesto — e é o que o
 * app pedia até aqui para qualquer coisa embalada.
 *
 * ── O que aparece antes de gravar ──────────────────────────────────────────
 * O produto, de onde veio o dado e a quantidade. Nunca grava direto: um código
 * lido errado — e acontece, com etiqueta amassada — colocaria comida que a
 * pessoa não comeu no diário dela. */
/* Os quatro que o rótulo brasileiro sempre traz, na ordem em que ele os
   imprime. Fibra e sódio ficam de fora: aparecem em menos rótulos e alongariam
   um formulário que a pessoa preenche de pé, no supermercado. */
const CAMPOS_ROTULO = [
  { chave: 'calorias', rotulo: 'Calorias', unidade: 'kcal' },
  { chave: 'proteinas', rotulo: 'Proteínas', unidade: 'g' },
  { chave: 'carboidratos', rotulo: 'Carboidratos', unidade: 'g' },
  { chave: 'gorduras', rotulo: 'Gorduras', unidade: 'g' },
] as const

type CampoRotulo = (typeof CAMPOS_ROTULO)[number]['chave']

export function LerCodigoScreen({
  onAdicionar,
  onFechar,
}: {
  onAdicionar: (item: AlimentoEscolhido) => void
  onFechar: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const [permissao, pedirPermissao] = useCameraPermissions()
  const [consultando, setConsultando] = useState(false)
  const [produto, setProduto] = useState<ProdutoLido | null>(null)
  const [erro, setErro] = useState('')
  const [gramas, setGramas] = useState(100)
  /* O que a pessoa corrigiu do rótulo. Guardado à parte do produto para o
     original continuar visível: quem digita 250 kcal precisa poder ver que a
     base dizia outra coisa, ou não saberá que corrigiu. */
  const [doRotulo, setDoRotulo] = useState<Record<string, string>>({})
  const [editando, setEditando] = useState(false)

  /* O leitor dispara várias vezes por segundo enquanto o código está no
     enquadramento. Sem esta trava, uma leitura vira dez consultas. */
  const lendo = useRef(false)

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (produto) {
        /* Volta a ler em vez de sair: quem escaneou o produto errado quer o
           próximo, não a tela anterior. */
        setProduto(null)
        lendo.current = false
        return true
      }
      onFechar()
      return true
    })
    return () => sub.remove()
  }, [produto, onFechar])

  async function aoLer(codigo: string) {
    if (lendo.current) return
    lendo.current = true

    setErro('')
    setConsultando(true)
    const r = await consultarCodigo(codigo)
    setConsultando(false)

    if (r.tipo === 'ok') {
      setProduto(r.produto)
      /* A embalagem inteira quando o produto informa o peso; 100 g quando não.
         Quem escaneia costuma comer o pacote ou uma fração dele, e 100 g é a
         base da tabela — o número que a pessoa reconhece do rótulo. */
      setGramas(r.produto.porcaoEmbalagem ?? 100)
      return
    }

    if (r.tipo === 'nao_encontrado') {
      setErro(
        'Não achei este produto. Ele pode não estar cadastrado ainda — use a busca pelo nome.',
      )
    } else {
      setErro(r.mensagem)
    }
    /* Destrava para tentar outro código sem sair da tela. */
    lendo.current = false
  }

  /* O número do rótulo vence o da base. Quem tem o pacote na mão está lendo a
     fonte primária; o Open Food Facts é cópia colaborativa dela. */
  function valorFinal(campo: CampoRotulo, original: number | null): number | null {
    const digitado = doRotulo[campo]
    if (digitado === undefined || digitado.trim() === '') return original
    const n = Number(digitado.replace(',', '.'))
    return Number.isFinite(n) ? n : original
  }

  function adicionar() {
    if (!produto) return

    onAdicionar({
      chave: novaChave(),
      /* Sem id: este produto não está na nossa base, e inventar um vínculo
         apontaria para uma linha que não existe. O nome e os nutrientes vão
         copiados, que é como o app já guarda tudo. */
      alimentoId: null,
      nome: produto.nome,
      marca: produto.marca,
      descricao: `${milhar(gramas)} g`,
      gramasTotais: gramas,
      caloriasPor100g: valorFinal('calorias', produto.calorias),
      proteinasPor100g: valorFinal('proteinas', produto.proteinas),
      carboidratosPor100g: valorFinal('carboidratos', produto.carboidratos),
      gordurasPor100g: valorFinal('gorduras', produto.gorduras),
      fibrasPor100g: produto.fibras,
    })
    onFechar()
  }

  /* ── Permissão ──────────────────────────────────────────────────────────*/
  if (!permissao) {
    return (
      <View style={[styles.tela, styles.centro]}>
        <ActivityIndicator color={paleta().cores.verde} />
      </View>
    )
  }

  if (!permissao.granted) {
    return (
      <View style={[styles.tela, { paddingTop: top + 8 }]}>
        <Cabecalho onFechar={onFechar} titulo="Código de barras" />
        <View style={styles.aviso}>
          <Ionicons name="camera-outline" size={34} color={paleta().cores.verde} />
          <Text style={styles.tituloAviso}>A câmera precisa da sua permissão</Text>
          <Text style={styles.textoAviso}>
            Ela é usada só para ler o código de barras do produto, aqui na tela. Nada é
            fotografado nem enviado.
          </Text>
          <Pressable
            onPress={pedirPermissao}
            style={({ pressed }) => [styles.botao, pressed && styles.pressionado]}
            accessibilityRole="button"
          >
            <Text style={styles.textoBotao}>Permitir a câmera</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  /* ── O produto lido ─────────────────────────────────────────────────────*/
  if (produto) {
    const kcal = porcao(valorFinal('calorias', produto.calorias), gramas)

    return (
      <View style={[styles.tela, { paddingTop: top + 8 }]}>
        <Cabecalho onFechar={onFechar} titulo="Confira o produto" />

        <View style={styles.conteudo}>
          <View style={styles.cartao}>
            <Text style={styles.nomeProduto}>{produto.nome}</Text>
            {!!produto.marca && <Text style={styles.marcaProduto}>{produto.marca}</Text>}

            {/* O código lido, à mostra.
                A tela dizia o nome do produto e não dizia de qual código ele
                veio — então uma leitura errada só era descoberta depois, quando
                o número do dia não fechava. Com o código na tela, quem está com
                o pacote na mão compara os treze dígitos e vê na hora.
                Foi preciso depois de uma barra de Milka voltar como biscoito
                Oreo: as duas são da Mondelez e dividem o prefixo 7622. */}
            <Text style={styles.codigoLido} selectable>
              {produto.codigo}
            </Text>

            <View style={styles.numeros}>
              <Numero rotulo="Calorias" valor={kcal === null ? '—' : `${milhar(kcal)} kcal`} />
              <Numero
                rotulo="Proteínas"
                valor={naPorcao(valorFinal('proteinas', produto.proteinas), gramas)}
              />
              <Numero
                rotulo="Carboidratos"
                valor={naPorcao(valorFinal('carboidratos', produto.carboidratos), gramas)}
              />
              <Numero
                rotulo="Gorduras"
                valor={naPorcao(valorFinal('gorduras', produto.gorduras), gramas)}
              />
            </View>

            {/* De onde veio o número. Um dado da nossa base foi conferido por
                alguém; um do Open Food Facts é colaborativo. Esconder a
                diferença seria dar a mesma confiança aos dois. */}
            <Text style={styles.origem}>
              {produto.origem === 'base'
                ? 'Da base do Cygnos'
                : 'Do Open Food Facts · dado colaborativo, confira o rótulo'}
            </Text>
          </View>

          {/* Produto brasileiro entra no Open Food Facts com metade dos campos
              vazios, e um traço na tela lê-se como app quebrado. Dizer o que
              falta, e por quê, é mais honesto — e o pacote está na mão da
              pessoa, que é a fonte primária do número. */}
          {produto.faltando.length > 0 && !editando && (
            <Pressable
              onPress={() => setEditando(true)}
              style={({ pressed }) => [styles.blocoFalta, pressed && styles.pressionado]}
              accessibilityRole="button"
              accessibilityLabel="Preencher os dados do rótulo"
            >
              <Ionicons name="alert-circle-outline" size={17} color={paleta().cores.gold} />
              <Text style={styles.textoFalta}>
                Esta base não tem {listar(produto.faltando)} deste produto. Toque para digitar do
                rótulo.
              </Text>
            </Pressable>
          )}

          {editando && (
            <View style={styles.formulario}>
              <Text style={styles.tituloFormulario}>O que diz o rótulo, por 100 g</Text>

              {CAMPOS_ROTULO.map(c => (
                <View key={c.chave} style={styles.linhaFormulario}>
                  <Text style={styles.rotuloCampo}>{c.rotulo}</Text>
                  <TextInput
                    value={doRotulo[c.chave] ?? ''}
                    onChangeText={v =>
                      setDoRotulo(atual => ({ ...atual, [c.chave]: v.replace(/[^0-9.,]/g, '') }))
                    }
                    placeholder={
                      produto[c.chave] === null ? '—' : String(produto[c.chave])
                    }
                    placeholderTextColor={paleta().inkFraco}
                    keyboardType="decimal-pad"
                    keyboardAppearance="dark"
                    maxLength={7}
                    style={styles.campoFormulario}
                    accessibilityLabel={`${c.rotulo} por 100 gramas`}
                  />
                  <Text style={styles.unidadeCampo}>{c.unidade}</Text>
                </View>
              ))}

              <Text style={styles.ajudaFormulario}>
                Em branco, vale o que a base trouxe. O que você digitar substitui.
              </Text>
            </View>
          )}

          <Text style={styles.rotuloQuantidade}>Quanto você comeu</Text>
          <View style={styles.atalhos}>
            {atalhosDePeso(produto.porcaoEmbalagem).map(g => (
              <Pressable
                key={g}
                onPress={() => setGramas(g)}
                style={({ pressed }) => [
                  styles.atalho,
                  gramas === g && styles.atalhoAtivo,
                  pressed && styles.pressionado,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: gramas === g }}
              >
                <Text style={[styles.textoAtalho, gramas === g && styles.textoAtalhoAtivo]}>
                  {milhar(g)} g
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={adicionar}
            style={({ pressed }) => [styles.botao, pressed && styles.pressionado]}
            accessibilityRole="button"
          >
            <Ionicons name="add" size={18} color={paleta().cores.branco} />
            <Text style={styles.textoBotao}>Adicionar</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setProduto(null)
              lendo.current = false
            }}
            style={styles.linkOutro}
            accessibilityRole="button"
          >
            <Text style={styles.textoLinkOutro}>Ler outro código</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  /* ── A câmera ───────────────────────────────────────────────────────────*/
  return (
    <View style={styles.tela}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{
          /* Os formatos de produto embalado. Sem QR de propósito: aqui um QR
             nunca é comida, e aceitá-lo só produziria consultas inúteis. */
          barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'],
        }}
        onBarcodeScanned={({ data }) => aoLer(data)}
      />

      <View style={[styles.sobreposto, { paddingTop: top + 8, paddingBottom: bottom + 24 }]}>
        <Cabecalho onFechar={onFechar} titulo="Código de barras" claro />

        <View style={styles.miraArea}>
          <View style={styles.mira} />
          <Text style={styles.dica}>Aponte para o código de barras do produto</Text>
        </View>

        {consultando && (
          <View style={styles.consultando}>
            <ActivityIndicator color={paleta().cores.branco} />
            <Text style={styles.textoConsultando}>Procurando o produto…</Text>
          </View>
        )}

        {!!erro && (
          <View style={styles.erroCaixa}>
            <Text style={styles.textoErro}>{erro}</Text>
          </View>
        )}
      </View>
    </View>
  )
}

function Cabecalho({
  titulo,
  onFechar,
  claro = false,
}: {
  titulo: string
  onFechar: () => void
  claro?: boolean
}) {
  const styles = estilos()
  return (
    <View style={styles.cabecalho}>
      <Pressable
        onPress={onFechar}
        style={styles.botaoVoltar}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Voltar"
      >
        <Ionicons name="chevron-back" size={22} color={claro ? paleta().cores.branco : paleta().cores.ink} />
      </Pressable>
      <Text style={[styles.tituloTela, claro && styles.tituloClaro]}>{titulo}</Text>
      <View style={styles.botaoVoltar} />
    </View>
  )
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  const styles = estilos()
  return (
    <View style={styles.numero}>
      <Text style={styles.valorNumero}>{valor}</Text>
      <Text style={styles.rotuloNumero}>{rotulo}</Text>
    </View>
  )
}

/* "calorias e proteínas", "calorias, gorduras e proteínas". A vírgula antes do
   "e" seria erro em português, e a frase aparece numa tela que pede confiança. */
function listar(itens: string[]): string {
  if (itens.length === 1) return itens[0]
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`
}

const naPorcao = (por100g: number | null, gramas: number): string => {
  const v = porcao(por100g, gramas)
  return v === null ? '—' : `${milhar(v)} g`
}

/* Os pesos que fazem sentido oferecer. A embalagem inteira entra quando o
   produto a informa, e o resto são frações da tabela — 100 g é a base de
   qualquer rótulo, e metade e um terço cobrem "comi um pedaço". */
function atalhosDePeso(embalagem: number | null): number[] {
  const base = [30, 50, 100, 200]
  if (!embalagem || embalagem <= 0) return base

  const comEmbalagem = [
    Math.round(embalagem),
    Math.round(embalagem / 2),
    Math.round(embalagem / 4),
    100,
  ]
  /* Sem repetidos e em ordem: uma embalagem de 100 g produziria dois botões
     iguais, e dois botões iguais parecem defeito. */
  return [...new Set(comEmbalagem)].filter(g => g > 0).sort((a, b) => a - b)
}

const estilos = estilosDe(t =>
  StyleSheet.create({
  tela: { flex: 1, backgroundColor: t.cores.fundo },
  centro: { alignItems: 'center', justifyContent: 'center' },

  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  botaoVoltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  tituloTela: { flexShrink: 1, fontSize: 17, fontWeight: '800', color: t.cores.ink },
  tituloClaro: { color: t.cores.branco },

  sobreposto: { flex: 1, justifyContent: 'space-between' },
  miraArea: { alignItems: 'center', gap: 14 },
  mira: {
    width: '78%',
    height: 150,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: t.cores.limao,
    backgroundColor: 'transparent',
  },
  dica: { fontSize: 14, color: t.cores.branco, textAlign: 'center', paddingHorizontal: 32 },

  consultando: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: t.veu,
    marginHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
  },
  textoConsultando: { fontSize: 14, fontWeight: '700', color: t.cores.branco },

  erroCaixa: {
    backgroundColor: t.veu,
    marginHorizontal: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  textoErro: { fontSize: 13.5, color: t.cores.branco, lineHeight: 20 },

  conteudo: { paddingHorizontal: 20, paddingTop: 4, gap: 14 },
  cartao: {
    backgroundColor: t.cores.cartao,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.cores.borda,
    padding: 16,
    gap: 4,
  },
  nomeProduto: { fontSize: 18, fontWeight: '800', color: t.cores.ink, letterSpacing: -0.3 },
  marcaProduto: { fontSize: 13, color: t.inkSuave },

  numeros: { flexDirection: 'row', gap: 10, marginTop: 12 },
  numero: { flex: 1, alignItems: 'center', gap: 2 },
  valorNumero: { fontSize: 15, fontWeight: '800', color: t.cores.limao },
  rotuloNumero: { fontSize: 10.5, color: t.inkSuave, textAlign: 'center' },

  codigoLido: {
    fontSize: 12,
    color: t.inkFraco,
    marginTop: 6,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
  },
  origem: { fontSize: 11.5, color: t.inkFraco, marginTop: 12, lineHeight: 17 },

  rotuloQuantidade: { fontSize: 13, fontWeight: '700', color: t.inkMedio },
  atalhos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  atalho: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: t.cores.borda,
    backgroundColor: t.cores.superficie,
  },
  atalhoAtivo: { backgroundColor: t.cores.limao, borderColor: t.cores.limao },
  textoAtalho: { fontSize: 14, fontWeight: '700', color: t.cores.ink },
  textoAtalhoAtivo: { color: t.cores.sobreLimao },

  blocoFalta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: t.cores.atencaoFundo,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  textoFalta: { flex: 1, fontSize: 12.5, color: t.cores.ink, lineHeight: 18 },

  formulario: {
    backgroundColor: t.cores.cartao,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.borda,
    padding: 14,
    gap: 8,
  },
  tituloFormulario: { fontSize: 13, fontWeight: '700', color: t.cores.ink, marginBottom: 2 },
  linhaFormulario: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rotuloCampo: { flex: 1, fontSize: 13.5, color: t.inkMedio },
  campoFormulario: {
    width: 88,
    backgroundColor: t.cores.superficie,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: t.cores.borda,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: '700',
    color: t.cores.ink,
    textAlign: 'right',
  },
  unidadeCampo: { width: 34, fontSize: 12.5, color: t.inkSuave },
  ajudaFormulario: { fontSize: 11.5, color: t.inkFraco, lineHeight: 17, marginTop: 2 },

  aviso: { paddingHorizontal: 28, paddingTop: 40, alignItems: 'center', gap: 10 },
  tituloAviso: { fontSize: 18, fontWeight: '800', color: t.cores.ink, textAlign: 'center' },
  textoAviso: { fontSize: 14, color: t.inkMedio, textAlign: 'center', lineHeight: 21 },

  botao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 13,
    backgroundColor: t.cores.verde,
    marginTop: 8,
  },
  textoBotao: { fontSize: 15, fontWeight: '800', color: t.cores.branco },
  pressionado: { opacity: 0.75 },

  linkOutro: { alignItems: 'center', paddingVertical: 10 },
  textoLinkOutro: { fontSize: 13.5, fontWeight: '700', color: t.inkMedio },
  }),
)
