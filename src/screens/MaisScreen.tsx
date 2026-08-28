import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
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
import { LINKS, abrirLink } from '../lib/links'
import { carregarCatalogo, type Catalogo } from '../lib/nutricionista'
import { supabase } from '../lib/supabase'
import { cores, inkFraco, inkMedio, inkSuave } from '../theme'

const MARGEM = 20
const PADDING_CARTAO = 16

/* A aba "Mais".
 *
 * Substitui o EmBreveScreen que ficava aqui. O botão de sair veio junto de
 * propósito: era a única coisa que aquela tela realmente fazia, e perdê-la na
 * troca deixaria a pessoa sem caminho para sair da conta. */
export function MaisScreen({
  email,
  onAbrirNutricionistas,
  onAbrirCodigo,
  onAbrirExcluirConta,
}: {
  email: string
  onAbrirNutricionistas: () => void
  onAbrirCodigo: () => void
  onAbrirExcluirConta: () => void
}) {
  const { top } = useSafeAreaInsets()
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)

  const buscar = useCallback(async () => {
    const r = await carregarCatalogo()
    if (r.tipo === 'erro') setErro(r.mensagem)
    else {
      setErro(null)
      setCatalogo(r.catalogo)
    }
  }, [])

  useEffect(() => {
    let vivo = true
    buscar().finally(() => {
      if (vivo) setCarregando(false)
    })
    return () => {
      vivo = false
    }
  }, [buscar])

  /* O mesmo motivo do puxar-para-atualizar, sem exigir o gesto.
   *
   * Voltar do segundo plano é o instante exato em que a resposta mudou: o
   * caminho comum é o paciente ditar o código, sair do app para falar com ela, e
   * voltar. Esperar que ele descubra sozinho que precisa arrastar o dedo para
   * baixo é esperar demais — o cartão continuaria dizendo que ele não tem
   * nutricionista com o vínculo já feito. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', estado => {
      if (estado === 'active') buscar()
    })
    return () => sub.remove()
  }, [buscar])

  /* Quem vincula é a nutricionista, do lado dela, enquanto o app já está aberto
     na mão do paciente. Não há evento nenhum avisando o aparelho disso — então
     o puxar-para-atualizar é o caminho, e por isso ele existe numa tela que de
     resto quase não muda. */
  async function puxarParaAtualizar() {
    setAtualizando(true)
    await buscar()
    setAtualizando(false)
  }

  return (
    <ScrollView
      style={styles.tela}
      contentContainerStyle={[styles.conteudo, { paddingTop: top + 8 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={atualizando}
          onRefresh={puxarParaAtualizar}
          tintColor={cores.limao}
        />
      }
    >
      <Text style={styles.titulo}>Mais</Text>

      <CartaoNutricionista
        catalogo={catalogo}
        carregando={carregando}
        erro={erro}
        onAbrir={onAbrirNutricionistas}
        onAbrirCodigo={onAbrirCodigo}
      />

      <View style={styles.cartao}>
        <Text style={styles.tituloCartao}>Conta</Text>
        <Text style={styles.email}>{email}</Text>

        <Pressable
          onPress={() => supabase.auth.signOut()}
          style={({ pressed }) => [styles.botaoSair, pressed && styles.botaoSairPressionado]}
          accessibilityRole="button"
          accessibilityLabel="Sair da conta"
        >
          <Ionicons name="log-out-outline" size={17} color={cores.verde} />
          <Text style={styles.textoBotaoSair}>Sair da conta</Text>
        </Pressable>

        {/* Fora do botão de sair e sem a moldura dele, de propósito: são ações
            de peso muito diferente, e dois botões iguais lado a lado convidam ao
            toque errado justamente naquele que não tem desfazer. */}
        <Pressable
          onPress={onAbrirExcluirConta}
          style={styles.linkExcluir}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Excluir conta"
        >
          <Text style={styles.textoLinkExcluir}>Excluir conta</Text>
        </Pressable>
      </View>

      <View style={styles.cartao}>
        <Text style={styles.tituloCartao}>Privacidade</Text>
        <Text style={styles.textoPrivacidade}>
          O que o Cygnos guarda sobre você, para que serve e quem enxerga.
        </Text>

        <LinhaLink
          icone="shield-checkmark-outline"
          rotulo="Política de Privacidade"
          onPress={() => abrirLink(LINKS.privacidade)}
        />
        <LinhaLink
          icone="document-text-outline"
          rotulo="Termos de Uso"
          onPress={() => abrirLink(LINKS.termos)}
        />
      </View>
    </ScrollView>
  )
}

/* Linha de link para uma página do site. O chevron à direita é o que diz que o
   toque sai do app — sem ele a linha parece uma tela interna. */
function LinhaLink({
  icone,
  rotulo,
  onPress,
}: {
  icone: keyof typeof Ionicons.glyphMap
  rotulo: string
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.linhaLink, pressed && styles.linhaLinkPressionada]}
      accessibilityRole="link"
      accessibilityLabel={rotulo}
    >
      <Ionicons name={icone} size={18} color={cores.verde} />
      <Text style={styles.textoLink}>{rotulo}</Text>
      <Ionicons name="open-outline" size={15} color={inkFraco} />
    </Pressable>
  )
}

/* O card do pedido. Dois estados bem diferentes no mesmo lugar:
 *
 *   vinculado    → quem é, com o que importa saber sobre ela
 *   sem vínculo  → o convite para conhecer o catálogo
 *
 * O card inteiro é o botão nos dois casos. Um "ver mais" pequeno no canto seria
 * um alvo de toque menor pelo mesmo destino. */
function CartaoNutricionista({
  catalogo,
  carregando,
  erro,
  onAbrir,
  onAbrirCodigo,
}: {
  catalogo: Catalogo | null
  carregando: boolean
  erro: string | null
  onAbrir: () => void
  onAbrirCodigo: () => void
}) {
  if (carregando) {
    return (
      <View style={[styles.cartao, styles.cartaoCarregando]}>
        <ActivityIndicator color={cores.verde} />
      </View>
    )
  }

  if (erro) {
    return (
      <View style={styles.cartao}>
        <Text style={styles.tituloCartao}>Meu nutricionista</Text>
        <Text style={styles.textoErro}>Não consegui carregar agora. Puxe para baixo para tentar de novo.</Text>
      </View>
    )
  }

  const vinculada = catalogo?.vinculada ?? null
  const lista = catalogo?.lista ?? []

  if (vinculada) {
    return (
      <Pressable
        onPress={onAbrir}
        style={({ pressed }) => [styles.cartao, pressed && styles.cartaoPressionado]}
        accessibilityRole="button"
        accessibilityLabel={`Meu nutricionista: ${vinculada.nome}`}
      >
        <View style={styles.cabecalhoCartao}>
          <Text style={styles.tituloCartao}>Meu nutricionista</Text>
          <Ionicons name="chevron-forward" size={18} color={inkFraco} />
        </View>

        <View style={styles.linhaNutri}>
          <AvatarNutri nutri={vinculada} tamanho={54} />
          <View style={styles.textoNutri}>
            <Text style={styles.nomeNutri} numberOfLines={2}>
              {vinculada.nome}
            </Text>
            {!!vinculada.crn && <Text style={styles.crnNutri}>CRN {vinculada.crn}</Text>}
            {vinculada.especialidades.length > 0 && (
              <Text style={styles.especialidades} numberOfLines={1}>
                {vinculada.especialidades.join(' · ')}
              </Text>
            )}
          </View>
        </View>
      </Pressable>
    )
  }

  return (
    <View style={styles.cartao}>
      <View style={styles.cabecalhoCartao}>
        <Text style={styles.tituloCartao}>Meu nutricionista</Text>
      </View>

      <Text style={styles.semVinculo}>
        Você ainda não está vinculada a uma nutricionista. Conheça quem está no Cygnos e informe o
        seu código a ela.
      </Text>

      <Pressable
        onPress={onAbrir}
        style={({ pressed }) => [styles.convite, pressed && styles.convitePressionado]}
        accessibilityRole="button"
        accessibilityLabel="Ver as nutricionistas do Cygnos"
      >
        {lista.length > 0 && (
          /* As três primeiras em pilha, sobrepostas: mostra que há gente do
             outro lado antes de a pessoa decidir abrir a lista. */
          <View style={styles.pilha}>
            {lista.slice(0, 3).map((n, i) => (
              <View key={n.id} style={i > 0 && styles.empilhado}>
                <AvatarNutri nutri={n} tamanho={34} />
              </View>
            ))}
          </View>
        )}

        <Text style={styles.textoConvite}>
          {lista.length > 0
            ? `Ver ${lista.length} ${lista.length === 1 ? 'nutricionista' : 'nutricionistas'}`
            : 'Ver nutricionistas'}
        </Text>
        <Ionicons name="chevron-forward" size={17} color={cores.verde} />
      </Pressable>

      <Pressable onPress={onAbrirCodigo} style={styles.linhaCodigo} accessibilityRole="button">
        <Ionicons name="link-outline" size={14} color={inkMedio} />
        <Text style={styles.textoCodigo}>Ver o meu código de vínculo</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { paddingHorizontal: MARGEM, paddingBottom: 28, gap: 14 },

  titulo: { fontSize: 27, fontWeight: '800', color: cores.ink, letterSpacing: -0.6 },

  cartao: { borderRadius: 20, backgroundColor: cores.cartao, padding: PADDING_CARTAO },
  cartaoPressionado: { backgroundColor: cores.trilho },
  cartaoCarregando: { alignItems: 'center', paddingVertical: 34 },
  cabecalhoCartao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tituloCartao: { fontSize: 17, fontWeight: '800', color: cores.ink },

  linhaNutri: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  textoNutri: { flex: 1 },
  nomeNutri: { fontSize: 15.5, fontWeight: '700', color: cores.ink, lineHeight: 21 },
  crnNutri: { marginTop: 2, fontSize: 12, color: inkSuave },
  especialidades: { marginTop: 3, fontSize: 11.5, color: inkFraco },

  semVinculo: { marginTop: 8, fontSize: 13.5, lineHeight: 20, color: inkSuave },

  convite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: cores.superficie,
  },
  convitePressionado: { backgroundColor: cores.verdeMenta },
  pilha: { flexDirection: 'row' },
  /* Sobreposição para a esquerda: a pilha ocupa menos e diz "são várias" sem
     precisar de um número antes de o olho chegar nele. */
  empilhado: { marginLeft: -12 },
  textoConvite: { flex: 1, fontSize: 14, fontWeight: '700', color: cores.verde },

  linhaCodigo: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 14 },
  textoCodigo: { fontSize: 12.5, fontWeight: '600', color: inkMedio },

  email: { marginTop: 6, fontSize: 13, color: inkSuave },
  botaoSair: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: cores.verde,
  },
  botaoSairPressionado: { backgroundColor: cores.verdeMenta },
  textoBotaoSair: { fontSize: 15, fontWeight: '600', color: cores.verde },

  /* Centralizado e sem moldura: a exclusão precisa estar sempre alcançável — é
     exigência da loja —, mas não competindo pelo olhar com o que se usa todo
     dia. */
  linkExcluir: { alignSelf: 'center', marginTop: 12, paddingVertical: 6 },
  textoLinkExcluir: { fontSize: 13.5, fontWeight: '600', color: cores.erroTexto },

  textoPrivacidade: { marginTop: 6, fontSize: 13, lineHeight: 19, color: inkSuave },
  linhaLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: cores.superficie,
  },
  linhaLinkPressionada: { backgroundColor: cores.verdeMenta },
  textoLink: { flex: 1, fontSize: 14, fontWeight: '600', color: cores.ink },

  textoErro: { marginTop: 8, fontSize: 13, lineHeight: 19, color: inkSuave },
})
