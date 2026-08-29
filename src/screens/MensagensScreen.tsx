import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AvatarNutri } from '../components/AvatarNutri'
import {
  carregarCatalogo,
  linkDoWhatsapp,
  telefoneFormatado,
  type Nutricionista,
} from '../lib/nutricionista'
import { estilosDe, paleta } from '../lib/tema'

/* A aba Mensagens, enquanto a conversa dentro do app não existe.
 *
 * Ela era o EmBreveScreen: uma tela que dizia "está sendo construída" e nada
 * mais. Honesta, e mesmo assim um beco — a pessoa toca na aba querendo falar
 * com a nutricionista e recebe um aviso de obra.
 *
 * O canal existe hoje, só não é aqui dentro: é o WhatsApp dela, que já está na
 * ficha. Esta tela leva a pessoa até ele e diz, sem enfeite, que a conversa por
 * dentro está a caminho. Mandar quem quer conversar para o lugar onde a conversa
 * acontece é mais útil do que uma placa de obra — e continua sendo verdade, que
 * é o que uma casca vazia não era.
 *
 * Quando a tabela de mensagens existir (ver docs/o-que-o-app-precisa-do-sistema.md,
 * item 3.5), esta tela vira a lista da conversa e o cartão do WhatsApp desce
 * para o rodapé, ou some. */
export function MensagensScreen({
  onAbrirNutricionistas,
}: {
  onAbrirNutricionistas: () => void
}) {
  const styles = estilos()
  const { top } = useSafeAreaInsets()
  const [nutri, setNutri] = useState<Nutricionista | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)

  const buscar = useCallback(async () => {
    const r = await carregarCatalogo()
    /* Falha vira "sem vínculo", em silêncio: esta tela não tem o que fazer com
       uma mensagem de erro, e o convite para conhecer as nutricionistas é uma
       saída melhor do que um aviso vermelho. */
    setNutri(r.tipo === 'ok' ? r.catalogo.vinculada : null)
  }, [])

  useEffect(() => {
    let vivo = true
    buscar().finally(() => vivo && setCarregando(false))
    return () => {
      vivo = false
    }
  }, [buscar])

  /* O vínculo nasce do lado dela, e esta é uma das telas em que a pessoa espera
     que ele já exista. Ver a armadilha 8 do AGENTS.md. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', estado => {
      if (estado === 'active') buscar()
    })
    return () => sub.remove()
  }, [buscar])

  const whatsapp = nutri?.telefone ? linkDoWhatsapp(nutri.telefone) : null

  return (
    <ScrollView
      style={styles.tela}
      contentContainerStyle={[styles.conteudo, { paddingTop: top + 8 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={atualizando}
          onRefresh={async () => {
            setAtualizando(true)
            await buscar()
            setAtualizando(false)
          }}
          tintColor={paleta().cores.limao}
        />
      }
    >
      <Text style={styles.titulo}>Mensagens</Text>

      {carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator color={paleta().cores.verde} />
        </View>
      ) : nutri ? (
        <>
          <View style={styles.cartao}>
            <View style={styles.linhaNutri}>
              <AvatarNutri nutri={nutri} tamanho={54} />
              <View style={styles.textoNutri}>
                <Text style={styles.nome} numberOfLines={2}>
                  {nutri.nome}
                </Text>
                {!!nutri.telefone && (
                  <Text style={styles.telefone}>{telefoneFormatado(nutri.telefone)}</Text>
                )}
              </View>
            </View>

            {whatsapp ? (
              <Pressable
                onPress={() => Linking.openURL(whatsapp)}
                style={({ pressed }) => [styles.botaoZap, pressed && styles.botaoZapPressionado]}
                accessibilityRole="button"
                accessibilityLabel={`Abrir conversa com ${nutri.nome} no WhatsApp`}
              >
                <Ionicons name="logo-whatsapp" size={18} color={paleta().cores.branco} />
                <Text style={styles.textoZap}>Conversar no WhatsApp</Text>
              </Pressable>
            ) : (
              <Text style={styles.semTelefone}>
                A sua nutricionista ainda não cadastrou um telefone de contato.
              </Text>
            )}
          </View>

          {/* Dito uma vez, sem alarde e sem data. Prometer prazo numa tela é a
              forma mais barata de quebrar a promessa. */}
          <Text style={styles.rodape}>
            A conversa por dentro do Cygnos está sendo construída. Até lá, o WhatsApp é o caminho
            mais rápido até ela.
          </Text>
        </>
      ) : (
        <View style={styles.vazio}>
          <View style={styles.circulo}>
            <Ionicons name="chatbubble-ellipses-outline" size={26} color={paleta().cores.verde} />
          </View>
          <Text style={styles.tituloVazio}>Ainda não há com quem conversar</Text>
          <Text style={styles.textoVazio}>
            Assim que uma nutricionista acompanhar você, o contato dela aparece aqui.
          </Text>

          <Pressable
            onPress={onAbrirNutricionistas}
            style={({ pressed }) => [styles.botaoVer, pressed && styles.botaoVerPressionado]}
            accessibilityRole="button"
            accessibilityLabel="Ver as nutricionistas do Cygnos"
          >
            <Text style={styles.textoVer}>Ver nutricionistas</Text>
            <Ionicons name="chevron-forward" size={16} color={paleta().cores.verde} />
          </Pressable>
        </View>
      )}
    </ScrollView>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
  tela: { flex: 1, backgroundColor: t.cores.fundo },
  conteudo: { paddingHorizontal: 20, paddingBottom: 28, gap: 14 },
  centro: { paddingTop: 60, alignItems: 'center' },

  titulo: { fontSize: 27, fontWeight: '800', color: t.cores.ink, letterSpacing: -0.6 },

  cartao: { borderRadius: 20, backgroundColor: t.cores.cartao, padding: 16, gap: 14 },
  linhaNutri: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  textoNutri: { flex: 1, gap: 2 },
  nome: { fontSize: 16, fontWeight: '800', color: t.cores.ink },
  telefone: { fontSize: 13, color: t.inkSuave },

  botaoZap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
    backgroundColor: t.cores.verde,
  },
  botaoZapPressionado: { backgroundColor: t.cores.verdeEscuro },
  textoZap: { fontSize: 14.5, fontWeight: '700', color: t.cores.branco },

  semTelefone: { fontSize: 13, lineHeight: 19, color: t.inkFraco, textAlign: 'center' },

  rodape: { fontSize: 12.5, lineHeight: 18, color: t.inkFraco, textAlign: 'center', paddingHorizontal: 8 },

  vazio: { alignItems: 'center', paddingTop: 40, gap: 10 },
  circulo: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: t.cores.verdeMenta,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  tituloVazio: { fontSize: 17, fontWeight: '800', color: t.cores.ink, textAlign: 'center' },
  textoVazio: {
    fontSize: 13.5,
    lineHeight: 20,
    color: t.inkFraco,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  botaoVer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 13,
    backgroundColor: t.cores.verdeClaro,
  },
  botaoVerPressionado: { backgroundColor: t.cores.verdeMenta },
  textoVer: { fontSize: 14, fontWeight: '700', color: t.cores.verde },
  }),
)
