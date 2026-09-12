import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  BackHandler,
  Image,
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
  daParaAnalisar,
  importarExame,
  type ArquivoDoExame,
} from '../lib/importarExame'
import { escolherArquivoDoExame, type EscolhaDeArquivo } from '../lib/escolherArquivo'
import { mascaraData } from '../lib/formulario'
import { dataISO } from '../lib/formatar'
import { useDesvioDoTeclado } from '../lib/teclado'
import { estilosDe, paleta } from '../lib/tema'
import { FONTE } from '../lib/fontes'

/* Importar exame, do celular dela para a ficha -- e para o sistema.
 *
 * ──────────────────── O pedido ────────────────────
 * "A paciente mandou o exame no meu WhatsApp. Posso ir no meu aplicativo aqui e
 * importar aqui mesmo? E aparece depois lá no site." O arquivo já está no
 * celular; o computador só estava no caminho.
 *
 * ──────────────────── Três origens, e a ordem importa ────────────────────
 * ARQUIVO primeiro: exame de laboratório chega em PDF, e o PDF que veio do
 * WhatsApp está nos arquivos, não na galeria. Depois a galeria (foto do laudo
 * que a paciente tirou) e a câmera (o papel na mão dela).
 *
 * ──────────────────── A data é a da COLETA ────────────────────
 * E não a de hoje. É por ela que a evolução se ordena, e um exame de março
 * importado em setembro com a data de hoje desalinha a série inteira. O site
 * exige, e aqui exige igual -- começa com hoje preenchido porque o caso comum é
 * o exame recém-colhido. */
export function ImportarExameScreen({
  pacienteId,
  nome,
  onFechar,
  onImportou,
}: {
  pacienteId: number
  /** O nome do paciente, só para o cabeçalho. */
  nome: string
  onFechar: () => void
  onImportou: (mensagem: string) => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()

  const [arquivo, setArquivo] = useState<ArquivoDoExame | null>(null)
  const [nomeDoExame, setNomeDoExame] = useState('')
  const [data, setData] = useState(() => hojeEmBarras())
  const [observacoes, setObservacoes] = useState('')

  const [escolhendo, setEscolhendo] = useState(false)
  const [subindo, setSubindo] = useState(false)
  const subindoAgora = useRef(false)
  const [erro, setErro] = useState('')

  const [alturaDaTela, setAlturaDaTela] = useState(0)
  const respiro = useDesvioDoTeclado(bottom, alturaDaTela || undefined)

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      /* Enquanto sobe, o voltar não fecha: sair no meio deixaria ela sem saber
         se o exame entrou. */
      if (subindo) return true
      onFechar()
      return true
    })
    return () => sub.remove()
  }, [subindo, onFechar])

  async function escolher(origem: 'arquivo' | 'galeria' | 'camera') {
    if (escolhendo || subindo) return
    setEscolhendo(true)
    setErro('')
    const r: EscolhaDeArquivo = await escolherArquivoDoExame(origem)
    setEscolhendo(false)

    if (r.tipo === 'cancelado') return
    if (r.tipo === 'erro') {
      setErro(r.mensagem)
      return
    }

    setArquivo(r.arquivo)
    /* O nome do arquivo vira o nome do exame quando ela ainda não escreveu
       nada: "hemograma_completo.pdf" já diz o que é, e digitar de novo o que o
       laboratório escreveu é trabalho à toa. */
    if (!nomeDoExame.trim() && r.arquivo.nomeDoArquivo) {
      setNomeDoExame(semExtensao(r.arquivo.nomeDoArquivo))
    }
  }

  const dataLida = lerDataDaColeta(data)
  const pronto = arquivo !== null && dataLida !== null && !subindo

  async function importar() {
    if (subindo || subindoAgora.current) return
    if (!arquivo) {
      setErro('Escolha o arquivo do exame.')
      return
    }
    if (!dataLida) {
      setErro('Escreva a data da coleta, como 12/09/2026.')
      return
    }

    subindoAgora.current = true
    setSubindo(true)
    setErro('')

    const r = await importarExame({
      pacienteId,
      arquivo,
      nome: nomeDoExame,
      dataExame: dataLida,
      observacoes,
    })

    subindoAgora.current = false
    setSubindo(false)

    if (r.tipo === 'erro') {
      setErro(r.mensagem)
      return
    }
    onImportou(
      r.analisou
        ? 'Exame guardado, e a leitura da Aurora já está na ficha.'
        : 'Exame guardado na ficha.',
    )
  }

  const ehImagem = arquivo?.mimeType.startsWith('image/') ?? false

  return (
    <View
      style={[styles.tela, { paddingTop: top + 8 }]}
      onLayout={e => setAlturaDaTela(e.nativeEvent.layout.height)}
    >
      <View style={styles.cabecalho}>
        <Pressable
          onPress={() => !subindo && onFechar()}
          style={styles.botaoVoltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela} numberOfLines={1}>
          Exame de {nome.split(' ')[0]}
        </Text>
        <View style={styles.botaoVoltar} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.conteudo, { paddingBottom: respiro + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {arquivo ? (
          <View style={styles.cartaoDoArquivo}>
            {ehImagem ? (
              <Image source={{ uri: arquivo.uri }} style={styles.miniatura} resizeMode="cover" />
            ) : (
              <View style={styles.iconeDoArquivo}>
                <Ionicons name="document-text-outline" size={26} color={paleta().cores.verde} />
              </View>
            )}
            <View style={styles.textoDoArquivo}>
              <Text style={styles.nomeDoArquivo} numberOfLines={2}>
                {arquivo.nomeDoArquivo || (ehImagem ? 'Foto do laudo' : 'Arquivo escolhido')}
              </Text>
              <Text style={styles.detalheDoArquivo}>
                {daParaAnalisar(arquivo.mimeType)
                  ? 'A Aurora lê este arquivo ao guardar.'
                  : 'Fica na ficha para abrir e ler. A leitura automática só faz PDF e foto.'}
              </Text>
            </View>
            <Pressable
              onPress={() => setArquivo(null)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Tirar este arquivo"
            >
              <Ionicons name="close" size={20} color={paleta().inkFraco} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.origens}>
            <Origem
              icone="document-attach-outline"
              rotulo="Arquivo"
              ajuda="PDF do laboratório"
              onPress={() => void escolher('arquivo')}
              styles={styles}
            />
            <Origem
              icone="images-outline"
              rotulo="Galeria"
              ajuda="Foto que ela mandou"
              onPress={() => void escolher('galeria')}
              styles={styles}
            />
            <Origem
              icone="camera-outline"
              rotulo="Câmera"
              ajuda="Laudo na sua mão"
              onPress={() => void escolher('camera')}
              styles={styles}
            />
          </View>
        )}

        {escolhendo && <ActivityIndicator color={paleta().cores.verde} style={styles.girando} />}

        <Text style={styles.rotulo}>NOME DO EXAME</Text>
        <TextInput
          value={nomeDoExame}
          onChangeText={setNomeDoExame}
          placeholder="Hemograma, vitamina D, perfil lipídico…"
          placeholderTextColor={paleta().inkFraco}
          style={styles.campo}
          accessibilityLabel="Nome do exame"
        />

        <Text style={styles.rotulo}>DATA DA COLETA</Text>
        <TextInput
          value={data}
          onChangeText={t => setData(mascaraData(t))}
          placeholder="12/09/2026"
          placeholderTextColor={paleta().inkFraco}
          keyboardType="number-pad"
          maxLength={10}
          style={styles.campo}
          accessibilityLabel="Data da coleta"
        />
        <Text style={styles.dica}>
          A data do exame, e não a de hoje — é por ela que a evolução se ordena.
        </Text>

        <Text style={styles.rotulo}>OBSERVAÇÃO (OPCIONAL)</Text>
        <TextInput
          value={observacoes}
          onChangeText={setObservacoes}
          placeholder="De onde veio, o que pedir de novo…"
          placeholderTextColor={paleta().inkFraco}
          multiline
          style={[styles.campo, styles.campoLongo]}
          accessibilityLabel="Observação do exame"
        />

        {!!erro && <Text style={styles.erro}>{erro}</Text>}

        <Pressable
          onPress={() => void importar()}
          disabled={!pronto}
          style={({ pressed }) => [styles.botao, !pronto && styles.botaoApagado, pressed && styles.pressionado]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !pronto }}
          accessibilityLabel="Guardar exame"
        >
          {subindo ? (
            <ActivityIndicator size="small" color={paleta().cores.branco} />
          ) : (
            <Text style={styles.textoDoBotao}>Guardar exame</Text>
          )}
        </Pressable>

        <Text style={styles.nota}>
          Vai para o mesmo lugar do sistema: no computador ele aparece na ficha
          dela, com a leitura como rascunho — publicar para o paciente continua
          sendo decisão sua.
        </Text>
      </ScrollView>
    </View>
  )
}

function Origem({
  icone,
  rotulo,
  ajuda,
  onPress,
  styles,
}: {
  icone: keyof typeof Ionicons.glyphMap
  rotulo: string
  ajuda: string
  onPress: () => void
  styles: ReturnType<typeof estilos>
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.origem, pressed && styles.pressionado]}
      accessibilityRole="button"
      accessibilityLabel={rotulo + '. ' + ajuda}
    >
      <Ionicons name={icone} size={22} color={paleta().cores.verde} />
      <Text style={styles.rotuloDaOrigem}>{rotulo}</Text>
      <Text style={styles.ajudaDaOrigem}>{ajuda}</Text>
    </Pressable>
  )
}

const semExtensao = (nome: string) => nome.replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/[_-]+/g, ' ').trim()

function hojeEmBarras(): string {
  const d = new Date()
  const dois = (n: number) => String(n).padStart(2, '0')
  return dois(d.getDate()) + '/' + dois(d.getMonth() + 1) + '/' + d.getFullYear()
}

/* "12/09/2026" vira "2026-09-12", ou nulo quando a data não existe. A volta é a
   prova, como em toda data deste app: o JavaScript aceita 31 de fevereiro. */
function lerDataDaColeta(texto: string): string | null {
  const d = texto.replace(/\D/g, '')
  if (d.length !== 8) return null
  const dia = Number(d.slice(0, 2))
  const mes = Number(d.slice(2, 4))
  const ano = Number(d.slice(4))
  if (mes < 1 || mes > 12 || ano < 1900) return null
  const data = new Date(ano, mes - 1, dia)
  if (data.getDate() !== dia || data.getMonth() !== mes - 1 || data.getFullYear() !== ano) return null
  return dataISO(data)
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

    conteudo: { paddingHorizontal: 16, gap: 8 },

    origens: { flexDirection: 'row', gap: 10 },
    origem: {
      flex: 1,
      alignItems: 'center',
      gap: 4,
      paddingVertical: 18,
      borderRadius: 14,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: t.cores.borda,
      backgroundColor: t.cores.cartao,
    },
    rotuloDaOrigem: { fontSize: 13.5, fontWeight: '800', color: t.cores.ink },
    ajudaDaOrigem: { fontSize: 11, color: t.inkFraco, textAlign: 'center', paddingHorizontal: 4 },

    cartaoDoArquivo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: t.cores.cartao,
      borderRadius: 14,
      padding: 12,
    },
    miniatura: { width: 54, height: 54, borderRadius: 10 },
    iconeDoArquivo: {
      width: 54,
      height: 54,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.cores.superficie,
    },
    textoDoArquivo: { flex: 1, gap: 2 },
    nomeDoArquivo: { fontSize: 14, fontWeight: '700', color: t.cores.ink },
    detalheDoArquivo: { fontSize: 11.5, color: t.inkFraco, lineHeight: 16 },

    rotulo: {
      marginTop: 10,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.6,
      color: t.inkFraco,
    },
    campo: {
      backgroundColor: t.cores.superficie,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 16,
      color: t.cores.ink,
      fontFamily: FONTE.normal,
    },
    campoLongo: { minHeight: 74, textAlignVertical: 'top' },
    dica: { fontSize: 12, color: t.inkFraco, lineHeight: 16 },
    erro: { fontSize: 13, color: t.cores.erroTexto, marginTop: 6 },

    botao: {
      marginTop: 14,
      backgroundColor: t.cores.verde,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 50,
    },
    botaoApagado: { opacity: 0.45 },
    textoDoBotao: { fontSize: 15, fontWeight: '800', color: t.cores.branco },
    pressionado: { opacity: 0.75 },
    nota: { fontSize: 12, lineHeight: 17, color: t.inkFraco, marginTop: 10 },
    girando: { marginVertical: 10 },
  }),
)
