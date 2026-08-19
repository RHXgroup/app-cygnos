import { useState } from 'react'
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { supabase } from '../lib/supabase'
import { cores, inkFraco, inkMedio, inkSuave } from '../theme'

function saudacaoDoDia() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

/* Mesma frase para usuário inexistente e para senha errada. Diferenciar as duas
   transformaria a tela num verificador de quem tem conta no sistema. */
const CREDENCIAL_INVALIDA = 'E-mail, usuário ou senha incorretos.'

/* O supabase-js devolve a mensagem em inglês e crua. Traduzir só os casos que
   o paciente consegue resolver sozinho; o resto cai no genérico, porque expor
   detalhe interno de auth não ajuda quem está na tela e ajuda quem não devia. */
function mensagemDeErro(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('invalid login credentials')) return CREDENCIAL_INVALIDA
  if (m.includes('email not confirmed')) {
    return 'Falta confirmar seu e-mail. Procure a mensagem que enviamos na sua caixa de entrada.'
  }
  if (m.includes('network') || m.includes('fetch')) {
    return 'Não consegui falar com o servidor. Verifique sua conexão e tente de novo.'
  }
  return 'Não foi possível entrar agora. Tente de novo em instantes.'
}

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
  const [identificador, setIdentificador] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  const podeEnviar = identificador.trim().length > 0 && senha.length > 0 && !carregando

  async function entrar() {
    if (!podeEnviar) return
    setErro('')
    setCarregando(true)

    const login = identificador.trim().toLowerCase()
    let email = login

    /* O Auth só entra por e-mail. Quando vem um nome de usuário, o banco
       traduz — o username é único em app_contas. Sem "@" não há o que
       confundir, então dá para decidir aqui e poupar uma ida ao servidor em
       quem entra com e-mail, que é a maioria. */
    if (!login.includes('@')) {
      const { data, error: erroRpc } = await supabase.rpc('app_email_do_login', {
        p_login: login,
      })

      if (erroRpc) {
        setErro('Não consegui falar com o servidor. Verifique sua conexão e tente de novo.')
        setCarregando(false)
        return
      }
      if (!data) {
        /* Usuário não existe. Mesma mensagem de senha errada, de propósito. */
        setErro(CREDENCIAL_INVALIDA)
        setCarregando(false)
        return
      }
      email = data
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    })

    /* Em caso de sucesso não mexemos no estado: o onAuthStateChange lá no App
       troca de tela e este componente é desmontado. Mexer aqui daria um
       "setState em componente desmontado". */
    if (error) {
      setErro(mensagemDeErro(error.message))
      setCarregando(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
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

        <View style={styles.formulario}>
          <View>
            <Text style={styles.rotulo}>E-mail ou usuário</Text>
            <TextInput
              value={identificador}
              onChangeText={v => {
                setIdentificador(v)
                if (erro) setErro('')
                if (aviso) onLimparAviso()
              }}
              placeholder="voce@email.com ou maria.silva"
              placeholderTextColor={inkFraco}
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
              style={styles.campo}
            />
          </View>

          <View>
            <Text style={styles.rotulo}>Senha</Text>
            <View style={styles.campoComBotao}>
              <TextInput
                value={senha}
                onChangeText={setSenha}
                placeholder="••••••••"
                placeholderTextColor={inkFraco}
                keyboardAppearance="dark"
                secureTextEntry={!mostrarSenha}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={entrar}
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

          <Pressable
            onPress={entrar}
            disabled={!podeEnviar}
            style={({ pressed }) => [
              styles.botaoPrimario,
              pressed && styles.botaoPrimarioPressionado,
              !podeEnviar && styles.botaoDesabilitado,
            ]}
          >
            {carregando ? (
              <ActivityIndicator color={cores.branco} />
            ) : (
              <Text style={styles.textoBotaoPrimario}>Entrar</Text>
            )}
          </Pressable>

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
        <Pressable
          onPress={() => setErro('A entrada de nutricionista ainda não está disponível no app.')}
          style={({ pressed }) => [styles.botaoSecundario, pressed && styles.botaoSecundarioPressionado]}
          accessibilityRole="button"
        >
          <Text style={styles.textoBotaoSecundario}>Sou nutricionista</Text>
        </Pressable>

        <Text style={styles.rodape}>Cygnos, sistemas de saúde com clareza</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  cabecalho: { alignItems: 'center', marginBottom: 32 },
  logo: { width: 72, height: 72, borderRadius: 20 },
  saudacao: {
    marginTop: 20,
    fontSize: 13,
    fontWeight: '600',
    color: cores.deep,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  titulo: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: '700',
    color: cores.deep,
    textAlign: 'center',
  },
  subtitulo: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    color: inkSuave,
    textAlign: 'center',
    maxWidth: 300,
  },
  formulario: { gap: 16 },
  rotulo: {
    marginBottom: 6,
    fontSize: 13,
    fontWeight: '600',
    color: inkMedio,
  },
  campo: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: cores.line,
    backgroundColor: cores.superficie,
    paddingHorizontal: 16,
    /* 16px é o mínimo que o iOS aceita sem dar zoom automático no campo. */
    fontSize: 16,
    color: cores.ink,
  },
  campoComBotao: { position: 'relative', justifyContent: 'center' },
  campoSenha: { paddingRight: 92 },
  botaoOlho: { position: 'absolute', right: 14, paddingVertical: 6, paddingHorizontal: 4 },
  textoOlho: { fontSize: 13, fontWeight: '600', color: cores.deep },
  caixaErro: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: cores.erroBorda,
    backgroundColor: cores.erroFundo,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  textoErro: { fontSize: 13, lineHeight: 19, color: cores.erroTexto },
  botaoPrimario: {
    height: 54,
    borderRadius: 14,
    backgroundColor: cores.verde,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  botaoPrimarioPressionado: { backgroundColor: cores.verdeEscuro },
  botaoDesabilitado: { opacity: 0.45 },
  textoBotaoPrimario: { fontSize: 16, fontWeight: '700', color: cores.branco },
  caixaAviso: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: cores.verdeClaro,
    backgroundColor: cores.verdeMenta,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  textoAviso: { fontSize: 13.5, lineHeight: 20, color: cores.ink },

  linkEsqueci: { alignSelf: 'flex-end', marginTop: -6 },
  textoEsqueci: { fontSize: 13.5, fontWeight: '600', color: cores.deep },
  linkCriarConta: { alignItems: 'center', paddingVertical: 6 },
  textoLinkSuave: { fontSize: 14, color: inkSuave },
  textoLinkForte: { fontWeight: '700', color: cores.deep },
  divisor: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 24 },
  linhaDivisor: { flex: 1, height: 1, backgroundColor: cores.line },
  textoDivisor: { fontSize: 12, color: inkFraco },
  botaoSecundario: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: cores.deep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoSecundarioPressionado: { backgroundColor: cores.moss },
  textoBotaoSecundario: { fontSize: 15, fontWeight: '600', color: cores.deep },
  rodape: {
    marginTop: 32,
    textAlign: 'center',
    fontSize: 12,
    color: inkFraco,
  },
})
