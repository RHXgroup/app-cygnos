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
import { carregarPlanoAtivo, type PlanoCompleto } from '../lib/plano'
import {
  desligarLembretes,
  desligarLembretesDeAgua,
  lembretesDeAguaLigados,
  lembretesLigados,
  reagendarSeLigados,
  ligarLembretes,
  ligarLembretesDeAgua,
} from '../lib/lembretes'
import { estilosDe, paleta, tema, trocarTema, type Tema } from '../lib/tema'

const OPCOES_DE_TEMA: { chave: Tema; rotulo: string; icone: 'moon-outline' | 'sunny-outline' }[] = [
  { chave: 'escuro', rotulo: 'Escuro', icone: 'moon-outline' },
  { chave: 'claro', rotulo: 'Claro', icone: 'sunny-outline' },
]

const MARGEM = 20
const PADDING_CARTAO = 16

/* A aba "Mais".
 *
 * Substitui o EmBreveScreen que ficava aqui. O botão de sair veio junto de
 * propósito: era a única coisa que aquela tela realmente fazia, e perdê-la na
 * troca deixaria a pessoa sem caminho para sair da conta. */
export function MaisScreen({
  contaId,
  email,
  versaoVinculo,
  onAbrirNutricionistas,
  onAbrirCodigo,
  onAbrirExcluirConta,
}: {
  contaId: string
  email: string
  /* Muda quando o vínculo com a nutricionista aparece — hoje, quando a tela do
     código percebe que ela vinculou. O segundo plano e o puxar-para-atualizar
     já cobriam o caso de a pessoa sair do app; este cobre o de ela ficar. */
  versaoVinculo: number
  onAbrirNutricionistas: () => void
  onAbrirCodigo: () => void
  onAbrirExcluirConta: () => void
}) {
  const styles = estilos()
  const { top } = useSafeAreaInsets()
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null)
  /* Os lembretes saem dos horários do plano, então ele precisa estar em mãos na
     hora de ligar — não há o que lembrar sem plano. */
  const [plano, setPlano] = useState<PlanoCompleto | null>(null)
  const [lembretes, setLembretes] = useState(false)
  const [mexendoLembretes, setMexendoLembretes] = useState(false)
  const [avisoLembretes, setAvisoLembretes] = useState('')
  /* Estado próprio, e não um só para os dois: os interruptores são
     independentes — o da refeição depende de existir plano, o da água não
     depende de nada. */
  const [agua, setAgua] = useState(false)
  const [mexendoAgua, setMexendoAgua] = useState(false)
  const [avisoAgua, setAvisoAgua] = useState('')
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

    lembretesLigados().then(l => vivo && setLembretes(l))
    lembretesDeAguaLigados().then(l => vivo && setAgua(l))
    carregarPlanoAtivo(contaId).then(r => {
      if (!vivo || r.tipo !== 'ok') return
      setPlano(r.plano)

      /* Reagenda quando o plano mudou desde a última vez. Quem muda o almoço
         das 12:30 para as 13h continuaria sendo avisado no horário velho, sem
         ter como saber por quê — e esta é a tela onde os lembretes moram, então
         é aqui que a correção acontece sem custar nada a quem não os usa. */
      reagendarSeLigados(r.plano)
    })
    buscar().finally(() => {
      if (vivo) setCarregando(false)
    })
    return () => {
      vivo = false
    }
  }, [buscar, versaoVinculo])

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

  /* Ligar e desligar. O estado só muda depois de o sistema responder: mostrar
     "ligado" antes de a permissão ser concedida seria prometer um aviso que não
     vai tocar. */
  async function alternarLembretes() {
    setAvisoLembretes('')
    setMexendoLembretes(true)

    if (lembretes) {
      await desligarLembretes()
      setLembretes(false)
      setMexendoLembretes(false)
      return
    }

    const r = await ligarLembretes(plano)
    setMexendoLembretes(false)

    if (r.tipo === 'negado') {
      setAvisoLembretes(
        'O Android não autorizou as notificações. Você pode liberar em Configurações → Aplicativos → Cygnos → Notificações.',
      )
      return
    }
    if (r.tipo === 'erro') {
      setAvisoLembretes(r.mensagem)
      return
    }
    if (r.quantos === 0) {
      setAvisoLembretes('Seu plano não tem refeições com horário, então não há o que lembrar.')
      return
    }

    setLembretes(true)
    setAvisoLembretes(
      `${r.quantos} ${r.quantos === 1 ? 'lembrete agendado' : 'lembretes agendados'}, todo dia.`,
    )
  }

  /* Quem vincula é a nutricionista, do lado dela, enquanto o app já está aberto
     na mão do paciente. Não há evento nenhum avisando o aparelho disso — então
     o puxar-para-atualizar é o caminho, e por isso ele existe numa tela que de
     resto quase não muda. */
  async function alternarAgua() {
    setAvisoAgua('')
    setMexendoAgua(true)

    if (agua) {
      await desligarLembretesDeAgua()
      setAgua(false)
      setMexendoAgua(false)
      return
    }

    const r = await ligarLembretesDeAgua()
    setMexendoAgua(false)

    if (r.tipo === 'negado') {
      setAvisoAgua(
        'O Android não autorizou as notificações. Você pode liberar em Configurações → Aplicativos → Cygnos → Notificações.',
      )
      return
    }
    if (r.tipo === 'erro') {
      setAvisoAgua(r.mensagem)
      return
    }

    setAgua(true)
    setAvisoAgua(`${r.quantos} avisos por dia, das 9h às 21h.`)
  }

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
          tintColor={paleta().cores.limao}
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
        <Text style={styles.tituloCartao}>Lembretes</Text>
        <Text style={styles.rotuloLembrete}>Refeição</Text>
        <Text style={styles.explicacaoLembrete}>
          {plano
            ? `Um aviso no horário de cada refeição do plano "${plano.nome}".`
            : 'Os lembretes saem dos horários do seu plano alimentar. Cadastre um plano para ligá-los.'}
        </Text>

        <Pressable
          onPress={alternarLembretes}
          disabled={!plano || mexendoLembretes}
          style={({ pressed }) => [
            styles.botaoLembrete,
            lembretes && styles.botaoLembreteAtivo,
            (!plano || mexendoLembretes) && styles.botaoLembreteDesligado,
            pressed && styles.botaoSairPressionado,
          ]}
          accessibilityRole="switch"
          accessibilityState={{ checked: lembretes, disabled: !plano }}
          accessibilityLabel="Lembretes de refeição"
        >
          <Ionicons
            name={lembretes ? 'notifications' : 'notifications-off-outline'}
            size={17}
            color={lembretes ? paleta().cores.sobreLimao : paleta().cores.verde}
          />
          <Text style={[styles.textoBotaoSair, lembretes && styles.textoBotaoLembreteAtivo]}>
            {mexendoLembretes ? 'Um instante…' : lembretes ? 'Lembretes ligados' : 'Ligar lembretes'}
          </Text>
        </Pressable>

        {!!avisoLembretes && <Text style={styles.avisoLembrete}>{avisoLembretes}</Text>}

        <View style={styles.divisor} />

        <Text style={styles.rotuloLembrete}>Água</Text>
        <Text style={styles.explicacaoLembrete}>
          Um aviso de três em três horas, das 9h às 21h. Não depende de plano.
        </Text>

        <Pressable
          onPress={alternarAgua}
          disabled={mexendoAgua}
          style={({ pressed }) => [
            styles.botaoLembrete,
            agua && styles.botaoLembreteAtivo,
            mexendoAgua && styles.botaoLembreteDesligado,
            pressed && styles.botaoSairPressionado,
          ]}
          accessibilityRole="switch"
          accessibilityState={{ checked: agua }}
          accessibilityLabel="Lembretes de beber água"
        >
          <Ionicons
            name={agua ? 'water' : 'water-outline'}
            size={17}
            color={agua ? paleta().cores.sobreLimao : paleta().cores.verde}
          />
          <Text style={[styles.textoBotaoSair, agua && styles.textoBotaoLembreteAtivo]}>
            {mexendoAgua ? 'Um instante…' : agua ? 'Lembretes ligados' : 'Ligar lembretes'}
          </Text>
        </Pressable>

        {!!avisoAgua && <Text style={styles.avisoLembrete}>{avisoAgua}</Text>}
      </View>

      <View style={styles.cartao}>
        <Text style={styles.tituloCartao}>Conta</Text>
        <Text style={styles.email}>{email}</Text>

        <Pressable
          onPress={() => supabase.auth.signOut()}
          style={({ pressed }) => [styles.botaoSair, pressed && styles.botaoSairPressionado]}
          accessibilityRole="button"
          accessibilityLabel="Sair da conta"
        >
          <Ionicons name="log-out-outline" size={17} color={paleta().cores.verde} />
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
        <Text style={styles.tituloCartao}>Aparência</Text>
        <Text style={styles.explicacaoLembrete}>
          O claro segue as cores da marca; o escuro é o padrão do app.
        </Text>

        {/* Duas opções, e não um interruptor de "modo escuro".
            Interruptor obriga a pessoa a saber qual é o estado atual para
            entender o que o toque faz. Dois botões mostram os dois estados e
            marcam onde ela está. */}
        <View style={styles.linhaTema}>
          {OPCOES_DE_TEMA.map(o => {
            const escolhido = tema() === o.chave
            return (
              <Pressable
                key={o.chave}
                onPress={() => trocarTema(o.chave)}
                style={({ pressed }) => [
                  styles.botaoTema,
                  escolhido && styles.botaoTemaEscolhido,
                  pressed && styles.botaoSairPressionado,
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: escolhido }}
                accessibilityLabel={`Tema ${o.rotulo}`}
              >
                <Ionicons
                  name={o.icone}
                  size={17}
                  color={escolhido ? paleta().cores.sobreLimao : paleta().cores.verde}
                />
                <Text style={[styles.textoBotaoSair, escolhido && styles.textoBotaoTemaEscolhido]}>
                  {o.rotulo}
                </Text>
              </Pressable>
            )
          })}
        </View>
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
  const styles = estilos()
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.linhaLink, pressed && styles.linhaLinkPressionada]}
      accessibilityRole="link"
      accessibilityLabel={rotulo}
    >
      <Ionicons name={icone} size={18} color={paleta().cores.verde} />
      <Text style={styles.textoLink}>{rotulo}</Text>
      <Ionicons name="open-outline" size={15} color={paleta().inkFraco} />
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
  const styles = estilos()
  if (carregando) {
    return (
      <View style={[styles.cartao, styles.cartaoCarregando]}>
        <ActivityIndicator color={paleta().cores.verde} />
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
          <Ionicons name="chevron-forward" size={18} color={paleta().inkFraco} />
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
        <Ionicons name="chevron-forward" size={17} color={paleta().cores.verde} />
      </Pressable>

      <Pressable onPress={onAbrirCodigo} style={styles.linhaCodigo} accessibilityRole="button">
        <Ionicons name="link-outline" size={14} color={paleta().inkMedio} />
        <Text style={styles.textoCodigo}>Ver o meu código de vínculo</Text>
      </Pressable>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
  tela: { flex: 1, backgroundColor: t.cores.fundo },
  conteudo: { paddingHorizontal: MARGEM, paddingBottom: 28, gap: 14 },

  titulo: { fontSize: 27, fontWeight: '800', color: t.cores.ink, letterSpacing: -0.6 },

  cartao: { borderRadius: 20, backgroundColor: t.cores.cartao, padding: PADDING_CARTAO },
  cartaoPressionado: { backgroundColor: t.cores.trilho },
  cartaoCarregando: { alignItems: 'center', paddingVertical: 34 },
  cabecalhoCartao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tituloCartao: { fontSize: 17, fontWeight: '800', color: t.cores.ink },

  linhaNutri: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  textoNutri: { flex: 1 },
  nomeNutri: { fontSize: 15.5, fontWeight: '700', color: t.cores.ink, lineHeight: 21 },
  crnNutri: { marginTop: 2, fontSize: 12, color: t.inkSuave },
  especialidades: { marginTop: 3, fontSize: 11.5, color: t.inkFraco },

  semVinculo: { marginTop: 8, fontSize: 13.5, lineHeight: 20, color: t.inkSuave },

  convite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: t.cores.superficie,
  },
  convitePressionado: { backgroundColor: t.cores.verdeMenta },
  pilha: { flexDirection: 'row' },
  /* Sobreposição para a esquerda: a pilha ocupa menos e diz "são várias" sem
     precisar de um número antes de o olho chegar nele. */
  empilhado: { marginLeft: -12 },
  textoConvite: { flex: 1, fontSize: 14, fontWeight: '700', color: t.cores.verde },

  linhaCodigo: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 14 },
  textoCodigo: { fontSize: 12.5, fontWeight: '600', color: t.inkMedio },

  email: { marginTop: 6, fontSize: 13, color: t.inkSuave },
  botaoSair: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.verde,
  },
  explicacaoLembrete: { fontSize: 13, color: t.inkSuave, lineHeight: 19, marginBottom: 12 },
  botaoLembrete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: t.cores.borda,
    backgroundColor: t.cores.superficie,
  },
  rotuloLembrete: {
    marginTop: 2,
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: t.cores.verde,
  },
  /* Separa os dois interruptores sem virar um segundo cartão: são o mesmo
     assunto, e dois cartões iguais lado a lado dariam a entender que um
     substitui o outro. */
  divisor: { height: 1, backgroundColor: t.cores.borda, marginVertical: 16 },
linhaTema: { flexDirection: 'row', gap: 10, marginTop: 12 },
  botaoTema: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  botaoTemaEscolhido: { backgroundColor: t.cores.limao, borderColor: t.cores.limao },
  textoBotaoTemaEscolhido: { color: t.cores.sobreLimao },
  botaoLembreteAtivo: { backgroundColor: t.cores.limao, borderColor: t.cores.limao },
  botaoLembreteDesligado: { opacity: 0.45 },
  textoBotaoLembreteAtivo: { color: t.cores.sobreLimao },
  avisoLembrete: { fontSize: 12.5, color: t.inkSuave, lineHeight: 18, marginTop: 10 },
  botaoSairPressionado: { backgroundColor: t.cores.verdeMenta },
  textoBotaoSair: { fontSize: 15, fontWeight: '600', color: t.cores.verde },

  /* Centralizado e sem moldura: a exclusão precisa estar sempre alcançável — é
     exigência da loja —, mas não competindo pelo olhar com o que se usa todo
     dia. */
  linkExcluir: { alignSelf: 'center', marginTop: 12, paddingVertical: 6 },
  textoLinkExcluir: { fontSize: 13.5, fontWeight: '600', color: t.cores.erroTexto },

  textoPrivacidade: { marginTop: 6, fontSize: 13, lineHeight: 19, color: t.inkSuave },
  linhaLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: t.cores.superficie,
  },
  linhaLinkPressionada: { backgroundColor: t.cores.verdeMenta },
  textoLink: { flex: 1, fontSize: 14, fontWeight: '600', color: t.cores.ink },

  textoErro: { marginTop: 8, fontSize: 13, lineHeight: 19, color: t.inkSuave },
  }),
)
