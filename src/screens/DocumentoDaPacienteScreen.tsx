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
import Ionicons from '@expo/vector-icons/Ionicons'
/* ──────────────────── POR QUE ESTÁTICO, E NÃO `import()` ────────────────────
 *
 * Estes três entravam por `import()` DENTRO da função, para o módulo nativo não
 * ser resolvido na abertura da tela -- um cuidado escrito para o Expo Go, onde
 * um módulo faltando derrubava a tela inteira em vez de só o botão.
 *
 * O cuidado nunca protegeu do que ele prometia: `import()` carrega o lado JS, e
 * quem falta é o NATIVO -- o estouro acontecia na chamada, dentro do `try` que
 * já existe. E cobrava um preço real: o Metro dá ao pedaço carregado assim um
 * NÚMERO de módulo, resolvido só na hora do toque, e quando esse número não
 * bate com o pacote que está rodando o erro é "Requiring unknown module 1267".
 * Foi o que ele viu ao tocar em PDF -- nada a ver com a folha, com o timbrado
 * ou com a impressora.
 *
 * Desde 11/09 o app roda em build de desenvolvimento, onde os três módulos
 * nativos ESTÃO dentro do pacote. Import estático não tem número para errar. */
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import { File, Paths } from 'expo-file-system'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { comoSeChama, type DocumentoDaPaciente } from '../lib/fichaCompleta'
import {
  folhaDoDocumento,
  nomeDoArquivoDoDocumento,
  semMarcacoes,
  tituloComData,
} from '../lib/folhaDoDocumento'
import { timbradoDaNutri } from '../lib/souNutri'
import { estilosDe, paleta } from '../lib/tema'
import { falha } from '../lib/erros'

/* Um documento aberto: o que foi prescrito, inteiro, e o PDF.
 *
 * ──────────────────── O pedido ────────────────────
 * "Clico e não faz nada. Não poderia gerar o PDF igual tá pronto no sistema?"
 * A lista mostrava título e itens cortados, e tocar não levava a lugar nenhum.
 *
 * ──────────────────── O PDF sai na moldura da casa ────────────────────
 * `folhaPadrao`, a mesma do plano: timbrado com nome e registro dela, título
 * com a barra verde, rodapé da marca. Foi decisão dele que TODO papel do app
 * saia assim.
 *
 * ──────────────────── O caminho do arquivo, e a armadilha que ele esconde ────
 * `expo-print` grava numa pasta que o compartilhador não pode ler, e o `copy`
 * do `expo-file-system` falha pelo mesmo motivo -- os dois perguntam ao mesmo
 * serviço de permissão. Por isso o PDF sai em base64 e é ESCRITO direto na
 * pasta do app, sem ninguém ler o original. É o mesmo caminho do plano, e está
 * contado em detalhe lá. */
export function DocumentoDaPacienteScreen({
  documento,
  nome,
  onFechar,
}: {
  documento: DocumentoDaPaciente
  /** O nome do paciente, para o cabeçalho e para o PDF. */
  nome: string
  onFechar: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()

  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (gerando) return true
      onFechar()
      return true
    })
    return () => sub.remove()
  }, [gerando, onFechar])

  async function gerarPdf() {
    if (gerando) return
    setGerando(true)
    setErro('')

    let uri = ''
    let base64: string | undefined
    try {
      /* O timbrado é lido na hora: é o nome e o registro DELA no alto da folha,
         e sem ele o papel sai anônimo. Falhar a leitura não impede o PDF. */
      /* O TAMANHO no log, e não uma teoria sobre o corte.
         Relatado: "ele para na cláusula quinze, e a assinatura da paciente não
         tem". Este número separa as duas causas possíveis -- texto que chegou
         cortado do banco, ou folha que cortou na impressão -- e é o mesmo
         truque que resolveu o PDF do plano: medir em vez de deduzir. */
      console.log(
        '[cygnos] documento:',
        (documento.conteudo ?? '').length,
        'caracteres de texto,',
        documento.medicamentos.length,
        'itens',
      )
      const html = folhaDoDocumento(documento, nome, await timbradoDaNutri())
      console.log('[cygnos] documento: folha com', html.length, 'caracteres')
      const feito = await Print.printToFileAsync({ html, base64: true })
      uri = feito.uri
      base64 = feito.base64
    } catch (e) {
      setGerando(false)
      setErro(falha('Não consegui montar o arquivo.', e))
      return
    }

    try {
      const destino = new File(Paths.cache, nomeDoArquivoDoDocumento(documento, nome))
      if (destino.exists) destino.delete()
      if (base64) destino.write(base64, { encoding: 'base64' })
      else new File(uri).copy(destino)
      uri = destino.uri
    } catch (e) {
      falha('Não consegui mover o PDF para a pasta compartilhável.', e)
    }

    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: tituloComData(documento),
          UTI: 'com.adobe.pdf',
        })
      } else {
        await Print.printAsync({ uri })
      }
    } catch (e) {
      /* O arquivo EXISTE. Dizer "não consegui gerar" seria mentira: o que
         falhou foi abrir a bandeja do sistema. */
      setErro(falha('O documento foi montado, mas não consegui abrir para compartilhar.', e))
    } finally {
      setGerando(false)
    }
  }

  return (
    <View style={[styles.tela, { paddingTop: top + 8 }]}>
      <View style={styles.cabecalho}>
        <Pressable
          onPress={() => !gerando && onFechar()}
          style={styles.botaoVoltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela} numberOfLines={1}>
          {comoSeChama(documento)}
        </Text>
        <View style={styles.botaoVoltar} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.conteudo, { paddingBottom: bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.titulo}>{comoSeChama(documento)}</Text>
        <Text style={styles.subtitulo}>
          {nome}
          {documento.quando ? ` · ${porExtenso(documento.quando)}` : ''}
          {documento.importado ? ' · importado de outro sistema' : ''}
        </Text>

        {documento.medicamentos.length > 0 && (
          <View style={styles.bloco}>
            {documento.medicamentos.map((m, i) => (
              <View key={m.nome + i} style={styles.item}>
                <Text style={styles.nomeDoItem}>{m.nome}</Text>
                {(m.dosagem || m.frequencia) && (
                  <Text style={styles.detalheDoItem}>
                    {[m.dosagem, m.frequencia].filter(Boolean).join(' · ')}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* O texto INTEIRO, e selecionável: na lista ele vem cortado em quatro
            linhas, e é aqui que ela vem ler o que escreveu. */}
        {!!documento.conteudo && (
          <Text style={styles.texto} selectable>
            {semMarcacoes(documento.conteudo)}
          </Text>
        )}

        {documento.medicamentos.length === 0 && !documento.conteudo && (
          <Text style={styles.vazio}>
            Este documento não tem texto guardado — só o registro de que foi emitido. O arquivo
            original está no computador.
          </Text>
        )}

        {!!erro && <Text style={styles.erro}>{erro}</Text>}

        <Pressable
          onPress={() => void gerarPdf()}
          disabled={gerando}
          style={({ pressed }) => [styles.botao, gerando && styles.botaoApagado, pressed && styles.pressionado]}
          accessibilityRole="button"
          accessibilityLabel="Gerar PDF e compartilhar"
        >
          {gerando ? (
            <ActivityIndicator size="small" color={paleta().cores.branco} />
          ) : (
            <>
              <Ionicons name="document-text-outline" size={17} color={paleta().cores.branco} />
              <Text style={styles.textoDoBotao}>Gerar PDF e compartilhar</Text>
            </>
          )}
        </Pressable>

        <Text style={styles.nota}>
          Sai no mesmo padrão dos relatórios do sistema, com o seu timbrado. De onde você manda
          por WhatsApp, salva ou imprime.
        </Text>
      </ScrollView>
    </View>
  )
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

function porExtenso(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  if (!ano || !mes || !dia) return ''
  return `${dia} de ${MESES[mes - 1] ?? ''} de ${ano}`
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

    conteudo: { paddingHorizontal: 16, gap: 10 },
    titulo: { fontSize: 20, fontWeight: '800', color: t.cores.ink, lineHeight: 27 },
    subtitulo: { fontSize: 13, color: t.inkFraco },

    bloco: {
      backgroundColor: t.cores.cartao,
      borderRadius: 14,
      padding: 14,
      gap: 12,
      marginTop: 6,
    },
    item: { gap: 2 },
    nomeDoItem: { fontSize: 15, fontWeight: '700', color: t.cores.ink },
    detalheDoItem: { fontSize: 13.5, color: t.inkSuave },

    texto: { fontSize: 14.5, lineHeight: 21, color: t.cores.ink, marginTop: 6 },
    vazio: { fontSize: 13.5, lineHeight: 19, color: t.inkFraco, marginTop: 8 },
    erro: { fontSize: 13, color: t.cores.erroTexto, marginTop: 8 },

    botao: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 18,
      backgroundColor: t.cores.verde,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 50,
    },
    botaoApagado: { opacity: 0.5 },
    textoDoBotao: { fontSize: 15, fontWeight: '800', color: t.cores.branco },
    pressionado: { opacity: 0.75 },
    nota: { fontSize: 12, lineHeight: 17, color: t.inkFraco, marginTop: 10 },
  }),
)
