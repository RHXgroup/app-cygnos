import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { analisarFoto } from '../lib/consumo'
import { type Estimativa } from '../lib/estimativaDaFoto'
import { FONTE } from '../lib/fontes'
import { estilosDe, paleta } from '../lib/tema'

/* A foto do prato, do lado dela. ESTACIONADA desde 12/09/2026.
 *
 * ──────────────────── Sem entrada, e de propósito ────────────────────
 * "A foto do prato eu ainda não sei se eu vou deixar aqui, viu? Eu acho que a
 * nutri não vai usar isso, acho que era bom a gente tirar essa opção aí."
 *
 * Ele disse "ainda não sei", então a TELA fica e a entrada sai. Para trazer de
 * volta são duas linhas: o `<Opcao>` em `MaisDaNutriScreen` (o comentário está
 * no lugar exato) e `onFotoDoPrato={() => setFotografando(true)}` em
 * `AreaDaNutri`. O estado `fotografando` e o degrau do voltar continuam lá.
 *
 * Se a decisão virar definitiva, o que se apaga é isto, o estado e o degrau --
 * e não antes, porque apagar é o único movimento que custa caro para desfazer.
 *
 * ──────────────────── Por que ela também ────────────────────
 * "Eu acho que pra nutri a gente também tinha que colocar a opção dela tirar
 * foto com o prato." O caso é o do consultório: a paciente mostra a foto do
 * almoço no celular dela, ou a nutricionista fotografa o prato ali na mesa, e
 * quer o número para conversar em cima -- não para registrar.
 *
 * ──────────────────── E por que NÃO grava nada ────────────────────
 * Do lado do paciente, a foto vira registro no diário: ele confirma, e aquilo
 * conta no dia dele. Aqui não existe diário para gravar -- a estimativa é
 * argumento de conversa, e some quando ela fecha a tela.
 *
 * Gravar seria pior: um registro de foto na carteira dela, sem paciente
 * atrelado e sem dia a que pertença, é uma linha que ninguém sabe explicar
 * depois. E atrelar a um paciente exigiria escolher qual, o que transforma um
 * gesto de dez segundos numa tarefa.
 *
 * ──────────────────── A MESMA análise do paciente ────────────────────
 * `analisarFoto` já carrega a permissão da câmera, o redimensionamento, o envio
 * em bytes (e não em base64, que estourava a memória logo depois de a câmera
 * devolver o bitmap) e o teto de itens. Uma segunda análise escrita aqui
 * nasceria sem nada disso -- e a primeira coisa que erraria seria exatamente o
 * envio, que é a armadilha 17.
 *
 * E o portão da função do servidor pede só usuário autenticado, sem passar por
 * `app_contas`. Conferido antes de escrever esta tela: a conta dela entra. */
export function FotoDoPratoDaNutriScreen({ onFechar }: { onFechar: () => void }) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()

  const [estimativa, setEstimativa] = useState<Estimativa | null>(null)
  const [imagem, setImagem] = useState<string | null>(null)
  const [lendo, setLendo] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (lendo) return true
      onFechar()
      return true
    })
    return () => sub.remove()
  })

  async function tirar(origem: 'camera' | 'galeria') {
    if (lendo) return
    setLendo(true)
    setErro('')
    const r = await analisarFoto(origem)
    setLendo(false)

    if (r.tipo === 'ok') {
      setEstimativa(r.estimativa)
      setImagem(r.uri)
      return
    }
    /* Cancelar não é erro: quem abriu a câmera e desistiu não precisa de frase
       nenhuma na tela. Sem isto, fechar a câmera deixava um recado vermelho. */
    if (r.tipo === 'cancelado') return
    setErro(r.mensagem)
  }

  const total = somarCalorias(estimativa)

  return (
    <View style={[styles.tela, { paddingTop: top + 8 }]}>
      <View style={styles.cabecalho}>
        <Pressable
          onPress={onFechar}
          style={styles.voltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloDaTela}>Foto do prato</Text>
        <View style={styles.voltar} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.conteudo, { paddingBottom: 24 + bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {!!erro && <Text style={styles.erro}>{erro}</Text>}

        {!estimativa && !lendo && (
          <View style={styles.convite}>
            <Ionicons name="camera-outline" size={26} color={paleta().inkFraco} />
            <Text style={styles.textoDoConvite}>
              Fotografe o prato e eu estimo o que tem nele. Serve para conversar
              com a paciente na hora — não fica guardado em lugar nenhum.
            </Text>
          </View>
        )}

        {lendo && (
          <View style={styles.convite}>
            <ActivityIndicator color={paleta().cores.verde} />
            <Text style={styles.textoDoConvite}>Olhando a foto…</Text>
          </View>
        )}

        {!!estimativa && !lendo && (
          <>
            {!!imagem && (
              /* A foto fica na tela junto da lista. Sem ela, a estimativa vira
                 uma lista de palavras sem nada com que conferir -- e conferir
                 é o único uso desta tela. */
              <Image source={{ uri: imagem }} style={styles.foto} resizeMode="cover" />
            )}

            <View style={styles.cartaoDoResultado}>
              <Text style={styles.descricao}>{estimativa.descricao}</Text>
              <Text style={styles.total}>
                {total === null ? 'Sem caloria estimada' : `≈ ${total} kcal`}
              </Text>

              {estimativa.itens.map((i, n) => (
                <View key={i.nome + n} style={styles.linhaDoItem}>
                  <Text style={styles.nomeDoItem} numberOfLines={2}>
                    {i.nome}
                  </Text>
                  {/* "—" quando a IA não estimou. Zero somaria como verdade num
                      total que ela usa para argumentar. Item 6. */}
                  <Text style={styles.kcalDoItem}>
                    {i.calorias === null || i.calorias === undefined
                      ? '—'
                      : `${Math.round(i.calorias)} kcal`}
                  </Text>
                </View>
              ))}

              {/* A confiança sai por escrito, e não some quando é baixa.
                  Uma estimativa de foto com confiança baixa apresentada com a
                  mesma cara de uma de confiança alta é o app emprestando
                  autoridade que ele não tem -- e quem repete o número para a
                  paciente é ela. */}
              <Text style={styles.confianca}>
                {estimativa.confianca === 'alta'
                  ? 'Estimativa com boa confiança — ainda assim, é estimativa.'
                  : estimativa.confianca === 'media'
                    ? 'Confiança média: confira as porções antes de usar o número.'
                    : 'Confiança baixa: a foto não deixou claro o que é ou quanto tem.'}
              </Text>
            </View>
          </>
        )}

        <View style={styles.botoes}>
          <Pressable
            onPress={() => void tirar('camera')}
            disabled={lendo}
            style={({ pressed }) => [
              styles.botao,
              styles.principal,
              lendo && styles.desligado,
              pressed && styles.pressionado,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Tirar foto do prato"
          >
            <Ionicons name="camera" size={17} color={paleta().cores.branco} />
            <Text style={styles.textoPrincipal}>
              {estimativa ? 'Outra foto' : 'Tirar foto'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => void tirar('galeria')}
            disabled={lendo}
            style={({ pressed }) => [
              styles.botao,
              styles.secundario,
              lendo && styles.desligado,
              pressed && styles.pressionado,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Escolher uma foto da galeria"
          >
            <Ionicons name="images-outline" size={17} color={paleta().cores.ink} />
            <Text style={styles.textoSecundario}>Da galeria</Text>
          </Pressable>
        </View>

        <Text style={styles.rodape}>
          Para registrar no diário de alguém, quem faz isso é a própria paciente,
          no aplicativo dela.
        </Text>
      </ScrollView>
    </View>
  )
}

/* O total, ou `null` quando NENHUM item tem caloria.
 *
 * Nulo e não zero: é a diferença entre "este prato não tem caloria" e "eu não
 * consegui estimar" -- e ela vai repetir esse número em voz alta. */
function somarCalorias(e: Estimativa | null): number | null {
  if (!e) return null
  const comValor = e.itens.filter(i => typeof i.calorias === 'number' && Number.isFinite(i.calorias))
  if (comValor.length === 0) return null
  return Math.round(comValor.reduce((s, i) => s + (i.calorias ?? 0), 0))
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.cores.fundo },

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

    convite: {
      alignItems: 'center',
      gap: 10,
      paddingVertical: 40,
      paddingHorizontal: 16,
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderRadius: 16,
    },
    textoDoConvite: {
      fontFamily: FONTE.normal,
      fontSize: 13.5,
      color: t.inkSuave,
      textAlign: 'center',
      lineHeight: 20,
    },

    foto: { width: '100%', height: 190, borderRadius: 16, backgroundColor: t.cores.trilho },

    cartaoDoResultado: {
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 13,
      gap: 2,
    },
    descricao: { fontFamily: FONTE.meia, fontSize: 13, color: t.inkFraco },
    total: {
      fontFamily: FONTE.bruta,
      fontSize: 26,
      color: t.cores.ink,
      letterSpacing: -0.9,
      marginBottom: 6,
      fontVariant: ['tabular-nums'],
    },
    linhaDoItem: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 10,
      paddingVertical: 5,
      borderTopWidth: 1,
      borderTopColor: t.cores.borda,
    },
    nomeDoItem: { flex: 1, fontFamily: FONTE.normal, fontSize: 14.5, color: t.cores.ink },
    kcalDoItem: {
      fontFamily: FONTE.meia,
      fontSize: 13,
      color: t.inkSuave,
      fontVariant: ['tabular-nums'],
    },
    confianca: {
      fontFamily: FONTE.normal,
      fontSize: 11.5,
      color: t.inkFraco,
      lineHeight: 16,
      paddingTop: 10,
    },

    botoes: { flexDirection: 'row', gap: 8 },
    botao: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 13,
      borderRadius: 14,
    },
    principal: { backgroundColor: t.cores.verde },
    secundario: {
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.borda,
    },
    textoPrincipal: { fontFamily: FONTE.forte, fontSize: 14.5, color: t.cores.branco },
    textoSecundario: { fontFamily: FONTE.meia, fontSize: 14.5, color: t.cores.ink },
    /* Cor, e não opacidade -- o tema tem um `desligado` medido para isso. */
    desligado: { backgroundColor: t.cores.desligado, borderColor: t.cores.desligado },
    pressionado: { opacity: 0.8 },

    rodape: {
      fontFamily: FONTE.normal,
      fontSize: 12,
      color: t.inkFraco,
      textAlign: 'center',
      lineHeight: 17,
      paddingHorizontal: 12,
    },
  }),
)
