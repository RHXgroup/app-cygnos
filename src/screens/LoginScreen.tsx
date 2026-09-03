import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { estilosDe, paleta } from '../lib/tema'
import { useDesvioDoTeclado } from '../lib/teclado'
import { Botao } from '../components/Botao'

function saudacaoDoDia() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

/* Mesma frase para usuário inexistente e para senha errada. Diferenciar as duas
   transformaria a tela num verificador de quem tem conta no sistema. */
const CREDENCIAL_INVALIDA =
  'E-mail, usuário ou senha incorretos. Se você acabou de criar a conta, confirme seu e-mail antes de entrar.'

/* A tradutora de mensagem do supabase-js saiu daqui junto com o
   `signInWithPassword`: quem responde agora é a `app-login`, e ela responde
   IGUAL para usuário inexistente, senha errada e e-mail não confirmado —
   separar os três devolveria o verificador de contas que a mudança fechou.
   O caso que valia a pena dizer, "confirme seu e-mail", virou parte da
   mensagem única: serve para quem precisa e não afirma nada sobre a conta de
   ninguém. */

export function LoginScreen({
  aviso,
  onLimparAviso,
  onIrParaCadastro,
  onIrParaRecuperar,
}: {
  /* Recado vindo do portão do App, tipicamente "esta conta não é de paciente".
     Chega já com a tela montada, depois de um logout forçado. */
  aviso: string
  onLimparAviso: () => void
  onIrParaCadastro: () => void
  onIrParaRecuperar: () => void
}) {
  const styles = estilos()
  const [identificador, setIdentificador] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  /* ── O TECLADO COBRIA A SENHA E O BOTÃO ENTRAR ──────────────────────────
   *
   * Aqui havia um `KeyboardAvoidingView` com `behavior="height"` no Android —
   * exatamente o que a armadilha 2 manda não usar. Medido no emulador Android
   * 15, tela de 640: com o teclado aberto, o campo de senha e o botão "Entrar"
   * ficam INTEIRAMENTE atrás do teclado, e nem rolando dá para alcançar — o
   * conteúdo cabe na janela (que não encolhe), então não há o que rolar, e
   * `overScrollMode="never"` tira até o arrasto.
   *
   * Numa tela alta ninguém percebe. Numa curta, é a PRIMEIRA tela do app com a
   * senha inalcançável — e quem esbarra nisso não tem como contornar.
   *
   * O desvio medido, como em `MensagensScreen` e `BuscarAlimentoScreen`: o
   * teclado mais a área segura, que SOMAM. A altura vem do `onLayout` e não de
   * `useWindowDimensions`, para o hook saber distinguir a janela que encolhe
   * (num build de verdade) da que não encolhe (Expo Go) e não somar duas vezes. */
  const { bottom } = useSafeAreaInsets()
  const [alturaDaTela, setAlturaDaTela] = useState(0)
  const respiro = useDesvioDoTeclado(bottom, alturaDaTela || undefined)

  /* O respiro sozinho não bastou, e a foto mostrou: ele deixa a rolagem
     POSSÍVEL, e nada rola. O conteúdo continua onde estava, com a senha atrás
     do teclado, e a pessoa teria de descobrir sozinha que precisa arrastar.

     ── E rolar até o FIM foi a tentativa seguinte, também fotografada ──────
     Passou do ponto: o fim do conteúdo é o rodapé, então os dois campos saíam
     pela borda de cima. Ficava tudo alcançável e nada visível — pior de ler do
     que o problema original, porque parece que a tela pulou sozinha.

     Rola até o CAMPO TOCADO. Cada um guarda onde está no `onLayout`, e o alvo
     é a distância que falta para a base dele caber logo acima do teclado. Zero
     ou menos quer dizer que já cabe, e aí não mexe: rolar quando não precisa é
     o mesmo susto, em menor escala. */
  const rolagem = useRef<ScrollView>(null)
  const ondeEstaOCampo = useRef<Record<string, number>>({})
  const [emFoco, setEmFoco] = useState<string | null>(null)

  useEffect(() => {
    if (respiro <= 0 || !emFoco || !alturaDaTela) return
    const dentroDoFormulario = ondeEstaOCampo.current[emFoco]
    if (dentroDoFormulario === undefined) return
    const base = ondeComecaOFormulario.current + dentroDoFormulario
    /* 16 de folga para a borda do campo não encostar no teclado. */
    const alvo = base + 16 - (alturaDaTela - respiro)
    if (alvo <= 0) return
    const id = setTimeout(() => rolagem.current?.scrollTo({ y: alvo, animated: true }), 60)
    return () => clearTimeout(id)
  }, [respiro, emFoco, alturaDaTela])

  /* A base do campo dentro do conteúdo rolável: o `onLayout` do bloco devolve
     `y` relativo ao pai, e os dois blocos são irmãos diretos do formulário. */
  const ondeComecaOFormulario = useRef(0)
  const medir = (nome: string) => (e: { nativeEvent: { layout: { y: number; height: number } } }) => {
    ondeEstaOCampo.current[nome] = e.nativeEvent.layout.y + e.nativeEvent.layout.height
  }

  const podeEnviar = identificador.trim().length > 0 && senha.length > 0 && !carregando

  async function entrar() {
    if (!podeEnviar) return
    setErro('')
    setCarregando(true)

    const login = identificador.trim().toLowerCase()

    /* Identificador e senha na MESMA chamada, e é esse o ponto.
       Antes o app perguntava primeiro "qual o e-mail do fulano?" — uma RPC que
       respondia sem cobrar senha nenhuma. A chave anônima vai dentro do APK e
       sai de lá em minutos, então qualquer pessoa mandava uma lista de nomes
       prováveis e recebia e-mails de verdade; nome inexistente voltava vazio e
       entregava, de quebra, quem tem conta. Numa base de app de nutrição, isso
       é insumo de phishing dirigido e dado pessoal servido de graça.
       A `app-login` resolve o e-mail do lado do servidor e devolve só os tokens
       da sessão: quem não souber a senha não leva nada. E-mail continua
       aceito no lugar do usuário — ela decide lá. */
    const { data, error: erroFn } = await supabase.functions.invoke('app-login', {
      body: { login, senha },
    })

    if (erroFn && !data?.error) {
      /* Sem afirmar que é a internet da pessoa: o pedido pode ter falhado do
         nosso lado, e aí a mensagem antiga a mandava procurar defeito no
         aparelho dela. */
      setErro('Não consegui entrar agora. Tente de novo em instantes.')
      setCarregando(false)
      return
    }

    if (data?.access_token && data?.refresh_token) {
      /* Em caso de sucesso não mexemos no estado: o onAuthStateChange lá no App
         troca de tela e este componente é desmontado. Mexer aqui daria um
         "setState em componente desmontado". */
      const { error: erroSessao } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      })
      if (!erroSessao) return
    }

    /* Usuário inexistente e senha errada caem na MESMA mensagem, de propósito —
       e agora é a função que responde igual para os dois, então a tela não teria
       como ser mais específica nem se quisesse. */
    setErro(CREDENCIAL_INVALIDA)
    setCarregando(false)
  }

  return (
    <View style={styles.flex} onLayout={e => setAlturaDaTela(e.nativeEvent.layout.height)}>
      <ScrollView
        ref={rolagem}
        contentContainerStyle={[styles.scroll, { paddingBottom: 40 + respiro }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        /* Sem isto o iOS deixa arrastar a tela para cima e para baixo mesmo com
           o conteúdo cabendo inteiro — a rolagem elástica não depende de haver
           o que rolar. Continua rolando de verdade quando o teclado sobe e o
           formulário não cabe mais. */
        alwaysBounceVertical={false}
        overScrollMode="never"
      >
        <View style={styles.cabecalho}>
          <Image
            source={require('../../assets/cygnos-icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.saudacao}>{saudacaoDoDia()}!</Text>
          <Text style={styles.titulo}>Bem-vindo ao Cygnos</Text>
          <Text style={styles.subtitulo}>
            Entre para acompanhar seu plano, suas medidas e suas consultas.
          </Text>
        </View>

        <View
          style={styles.formulario}
          onLayout={e => {
            ondeComecaOFormulario.current = e.nativeEvent.layout.y
          }}
        >
          <View onLayout={medir('identificador')}>
            <Text style={styles.rotulo}>E-mail ou usuário</Text>
            <TextInput
              value={identificador}
              onChangeText={v => {
                setIdentificador(v)
                if (erro) setErro('')
                if (aviso) onLimparAviso()
              }}
              placeholder="voce@email.com ou maria.silva"
              placeholderTextColor={paleta().inkFraco}
              keyboardAppearance="dark"
              /* Teclado de e-mail mesmo aceitando usuário: deixa o "@" à mão
                 para a maioria e não atrapalha quem digita o apelido. */
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              /* "username" e não "email": o preenchimento automático do iOS
                 guarda os dois no mesmo campo, e assim quem salvou o apelido no
                 chaveiro também é oferecido. */
              autoComplete="username"
              textContentType="username"
              returnKeyType="next"
              onFocus={() => setEmFoco('identificador')}
              style={styles.campo}
            />
          </View>

          <View onLayout={medir('senha')}>
            <Text style={styles.rotulo}>Senha</Text>
            <View style={styles.campoComBotao}>
              <TextInput
                value={senha}
                onChangeText={setSenha}
                placeholder="••••••••"
                placeholderTextColor={paleta().inkFraco}
                keyboardAppearance="dark"
                secureTextEntry={!mostrarSenha}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={entrar}
                onFocus={() => setEmFoco('senha')}
                style={[styles.campo, styles.campoSenha]}
              />
              <Pressable
                onPress={() => setMostrarSenha(v => !v)}
                hitSlop={8}
                style={styles.botaoOlho}
                accessibilityRole="button"
                accessibilityLabel={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
              >
                <Text style={styles.textoOlho}>{mostrarSenha ? 'Ocultar' : 'Mostrar'}</Text>
              </Pressable>
            </View>
          </View>

          {/* Logo abaixo da senha, que é onde a pessoa está olhando quando
              descobre que não lembra dela. */}
          <Pressable
            onPress={onIrParaRecuperar}
            hitSlop={8}
            style={styles.linkEsqueci}
            accessibilityRole="button"
          >
            <Text style={styles.textoEsqueci}>Esqueci minha senha</Text>
          </Pressable>

          {/* O aviso do portão tem caixa própria, em tom de recado e não de
              erro: quem foi barrado não digitou nada errado. */}
          {aviso.length > 0 && erro.length === 0 && (
            <View style={styles.caixaAviso}>
              <Text style={styles.textoAviso}>{aviso}</Text>
            </View>
          )}

          {erro.length > 0 && (
            <View style={styles.caixaErro}>
              <Text style={styles.textoErro}>{erro}</Text>
            </View>
          )}

          <Botao
            rotulo="Entrar"
            ocupado={carregando}
            desligado={!podeEnviar}
            onPress={entrar}
          />

          <Pressable
            onPress={onIrParaCadastro}
            style={styles.linkCriarConta}
            accessibilityRole="button"
          >
            <Text style={styles.textoLinkSuave}>
              Ainda não tem conta? <Text style={styles.textoLinkForte}>Criar conta</Text>
            </Text>
          </Pressable>
        </View>

        <View style={styles.divisor}>
          <View style={styles.linhaDivisor} />
          <Text style={styles.textoDivisor}>ou</Text>
          <View style={styles.linhaDivisor} />
        </View>

        {/* Placeholder combinado: a entrada da nutricionista usa outro fluxo
            (Código MT + usuário + senha) e fica para uma etapa seguinte. */}
        <Botao
          rotulo="Sou nutricionista"
          tipo="secundario"
          onPress={() => setErro('A entrada de nutricionista ainda não está disponível no app.')}
        />

        <Text style={styles.rodape}>Cygnos, sistemas de saúde com clareza</Text>
      </ScrollView>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 40,
    /* `paddingBottom` vem de fora, somado ao desvio do teclado. */
  },
  cabecalho: { alignItems: 'center', marginBottom: 32 },
  logo: { width: 72, height: 72, borderRadius: 20 },
  saudacao: {
    marginTop: 20,
    fontSize: 13,
    fontWeight: '600',
    color: t.cores.deep,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  titulo: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: '700',
    color: t.cores.deep,
    textAlign: 'center',
  },
  subtitulo: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    color: t.inkSuave,
    textAlign: 'center',
    maxWidth: 300,
  },
  formulario: { gap: 16 },
  rotulo: {
    marginBottom: 6,
    fontSize: 13,
    fontWeight: '600',
    color: t.inkMedio,
  },
  campo: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.line,
    backgroundColor: t.cores.superficie,
    paddingHorizontal: 16,
    /* 16px é o mínimo que o iOS aceita sem dar zoom automático no campo. */
    fontSize: 16,
    color: t.cores.ink,
  },
  campoComBotao: { position: 'relative', justifyContent: 'center' },
  campoSenha: { paddingRight: 92 },
  botaoOlho: { position: 'absolute', right: 14, paddingVertical: 6, paddingHorizontal: 4 },
  textoOlho: { fontSize: 13, fontWeight: '600', color: t.cores.deep },
  caixaErro: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.erroBorda,
    backgroundColor: t.cores.erroFundo,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  textoErro: { fontSize: 13, lineHeight: 19, color: t.cores.erroTexto },
  caixaAviso: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.cores.verdeClaro,
    backgroundColor: t.cores.verdeMenta,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  textoAviso: { fontSize: 13.5, lineHeight: 20, color: t.cores.ink },

  linkEsqueci: { alignSelf: 'flex-end', marginTop: -6 },
  textoEsqueci: { fontSize: 13.5, fontWeight: '600', color: t.cores.deep },
  linkCriarConta: { alignItems: 'center', paddingVertical: 6 },
  textoLinkSuave: { fontSize: 14, color: t.inkSuave },
  textoLinkForte: { fontWeight: '700', color: t.cores.deep },
  divisor: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 24 },
  linhaDivisor: { flex: 1, height: 1, backgroundColor: t.cores.line },
  textoDivisor: { fontSize: 12, color: t.inkFraco },
  rodape: {
    marginTop: 32,
    textAlign: 'center',
    fontSize: 12,
    color: t.inkFraco,
  },
  }),
)
