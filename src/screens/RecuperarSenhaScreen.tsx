import { useEffect, useState } from 'react'
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
import { CampoTexto } from '../components/CampoTexto'
import { ForcaSenha } from '../components/ForcaSenha'
import { AVISO_NAO_E_PACIENTE, ehContaDePaciente } from '../lib/conta'
import { validarSenha } from '../lib/formulario'
import { supabase } from '../lib/supabase'
import { cores, inkFraco, inkMedio, inkSuave } from '../theme'

/* Recuperação de senha em três etapas, por código de seis dígitos.
 *
 * Por que código e não link: o app não tem `scheme` registrado, então um link
 * de e-mail não tem como devolver a pessoa para dentro dele. Mesmo com scheme,
 * o link abre o navegador interno do aplicativo de e-mail, que nem sempre
 * entrega de volta para o app, e a pessoa fica presa numa aba. O código
 * digitado de volta aqui não depende de nada disso.
 *
 * O template do e-mail no Supabase precisa incluir `{{ .Token }}`. Sem isso o
 * e-mail sai só com o link e a pessoa não tem código para digitar. */

type Etapa = 'pedir' | 'codigo' | 'senha'

/* Seis dígitos são um milhão de combinações, o que só protege se ninguém puder
   chutar à vontade. O Supabase já corta do lado dele; este limite é para a
   pessoa não ficar tentando o código velho vinte vezes achando que digitou
   errado, quando na verdade ele expirou. */
const MAXIMO_DE_TENTATIVAS = 5

/* Espera antes de poder pedir outro código. Segura o dedo ansioso que gera
   cinco e-mails e depois digita o código do primeiro, que já foi invalidado. */
const SEGUNDOS_PARA_REENVIAR = 60

/* Mesma frase para código errado, código expirado e conta que não existe.
   Distinguir os três transformaria a tela num verificador de quem tem conta,
   que é exatamente o que o login evita. */
const CODIGO_INVALIDO = 'Código inválido ou expirado. Confira os seis dígitos ou peça um novo.'

/* Mostra o e-mail sem entregá-lo por inteiro. Só aparece quando a pessoa
   digitou o próprio e-mail, ou seja, quando ela já o conhece. */
function mascarar(email: string): string {
  const [usuario, dominio] = email.split('@')
  if (!dominio) return email
  const visivel = usuario.slice(0, 2)
  return `${visivel}${'•'.repeat(Math.max(usuario.length - 2, 2))}@${dominio}`
}

export function RecuperarSenhaScreen({
  onVoltar,
  onConcluido,
}: {
  onVoltar: () => void
  /* Chamado com a senha já trocada. Nesse ponto existe sessão válida, e quem
     leva para dentro do app é o App, não esta tela. */
  onConcluido: () => void
}) {
  const [etapa, setEtapa] = useState<Etapa>('pedir')
  const [identificador, setIdentificador] = useState('')
  /* O e-mail que recebeu o código. Fica null quando o login informado não
     existe: a tela segue para a etapa do código do mesmo jeito, e é ali que a
     tentativa falha, sem nunca ter dito que a conta não existe. */
  const [emailDestino, setEmailDestino] = useState<string | null>(null)
  /* Se a pessoa digitou o e-mail, ela já o conhece e dá para mostrá-lo
     mascarado. Vindo de nome de usuário, não: seria contar a quem só tinha o
     apelido qual é o e-mail por trás dele. */
  const [digitouEmail, setDigitouEmail] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [tentativas, setTentativas] = useState(0)
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [esperaReenvio, setEsperaReenvio] = useState(0)

  useEffect(() => {
    if (esperaReenvio <= 0) return
    const t = setTimeout(() => setEsperaReenvio(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [esperaReenvio])

  async function pedirCodigo() {
    const login = identificador.trim().toLowerCase()
    if (login.length === 0 || carregando) return

    setErro('')
    setCarregando(true)

    /* Quem resolve o e-mail e dispara o envio é a `app-recuperar-senha`, do lado
       do servidor. Antes era esta tela: ela pedia o e-mail a uma RPC que
       respondia sem cobrar nada, e a chave anônima que a autorizava vai dentro
       do APK. O e-mail não volta mais para cá — e não precisa: a tela só o
       exibe (mascarado) quando foi a própria pessoa que o digitou, e nesse caso
       ela já o tem em mãos. */
    const { error: erroFn } = await supabase.functions.invoke('app-recuperar-senha', {
      body: { login },
    })
    if (erroFn) {
      setErro('Não consegui falar com o servidor. Verifique sua conexão e tente de novo.')
      setCarregando(false)
      return
    }

    /* A tela avança exista conta ou não, com a mesma mensagem — como já fazia.
       `emailDestino` agora guarda o LOGIN, que é o que as chamadas seguintes
       precisam; o texto de apoio só o mascara quando é um e-mail de verdade. */
    setEmailDestino(login)
    setDigitouEmail(login.includes('@'))
    setCodigo('')
    setTentativas(0)
    setEsperaReenvio(SEGUNDOS_PARA_REENVIAR)
    setEtapa('codigo')
    setCarregando(false)
  }

  async function reenviar() {
    if (esperaReenvio > 0 || carregando) return
    setErro('')
    setCodigo('')
    if (emailDestino) {
      await supabase.functions.invoke('app-recuperar-senha', { body: { login: emailDestino } })
    }
    setEsperaReenvio(SEGUNDOS_PARA_REENVIAR)
  }

  async function conferirCodigo() {
    if (codigo.length !== 6 || carregando) return

    setErro('')
    setCarregando(true)

    /* Sem e-mail de destino não há o que verificar, mas a resposta é a mesma de
       um código errado. */
    if (!emailDestino) {
      registrarTentativaFalha()
      setCarregando(false)
      return
    }

    /* `verifyOtp` exige e-mail junto do código, e era só por isso que esta tela
       precisava do endereço. A `app-conferir-codigo` resolve do lado de lá e
       devolve os tokens apenas quando o código confere. */
    const { data: conferido } = await supabase.functions.invoke('app-conferir-codigo', {
      body: { login: emailDestino, codigo },
    })

    if (!conferido?.access_token || !conferido?.refresh_token) {
      registrarTentativaFalha()
      setCarregando(false)
      return
    }

    const { error } = await supabase.auth.setSession({
      access_token: conferido.access_token,
      refresh_token: conferido.refresh_token,
    })

    if (error) {
      registrarTentativaFalha()
      setCarregando(false)
      return
    }

    /* Deu certo: existe sessão a partir daqui. Quem impede o App de já jogar a
       pessoa para dentro é o próprio App, que enquanto esta tela estiver aberta
       ignora a sessão.
       A sessão também é o que torna possível a checagem abaixo: só autenticado
       dá para perguntar ao banco se esta conta é de paciente, e é assim que a
       pergunta não vira um verificador de contas para quem está de fora. */
    const paciente = await ehContaDePaciente()
    if (paciente === false) {
      await supabase.auth.signOut()
      setEtapa('pedir')
      setCodigo('')
      setEmailDestino(null)
      setErro(AVISO_NAO_E_PACIENTE)
      setCarregando(false)
      return
    }

    setEtapa('senha')
    setCarregando(false)
  }

  function registrarTentativaFalha() {
    const agora = tentativas + 1
    setTentativas(agora)

    if (agora >= MAXIMO_DE_TENTATIVAS) {
      setEtapa('pedir')
      setCodigo('')
      setEmailDestino(null)
      setErro('Muitas tentativas. Peça um código novo para continuar.')
      return
    }

    setErro(CODIGO_INVALIDO)
  }

  async function salvarSenha() {
    if (carregando) return

    const problema = validarSenha(senha)
    if (problema) {
      setErro(problema)
      return
    }
    if (senha !== confirmacao) {
      setErro('As duas senhas não são iguais.')
      return
    }

    setErro('')
    setCarregando(true)

    const { error } = await supabase.auth.updateUser({ password: senha })
    if (error) {
      /* No terminal do Metro, para diagnóstico. A tela mostra a versão
         traduzida; aqui fica o que o servidor realmente disse. */
      console.warn('[recuperar] updateUser falhou:', error.message)
      setErro(mensagemAoSalvar(error.message))
      setCarregando(false)
      return
    }

    /* Derruba as outras sessões: se alguém tinha entrado nesta conta, perde o
       acesso agora. Quem está trocando a senha continua conectado, é a sessão
       desta tela que sobrevive. Falhar aqui não desfaz a troca, então o erro é
       engolido de propósito. */
    await supabase.auth.signOut({ scope: 'others' }).catch(() => {})

    onConcluido()
  }

  /* Sair no meio, depois de o código já ter sido aceito, deixaria a pessoa
     logada com a senha antiga sem nunca ter passado pela tela de senha. */
  async function cancelar() {
    if (etapa === 'senha') await supabase.auth.signOut()
    onVoltar()
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
        alwaysBounceVertical={false}
        overScrollMode="never"
      >
        <View style={styles.cabecalho}>
          <Image
            source={require('../../assets/cygnos-icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.titulo}>
            {etapa === 'senha' ? 'Crie uma senha nova' : 'Recuperar acesso'}
          </Text>
          <Text style={styles.subtitulo}>{textoDeApoio(etapa, emailDestino, digitouEmail)}</Text>
        </View>

        <View style={styles.formulario}>
          {etapa === 'pedir' && (
            <CampoTexto
              rotulo="E-mail ou usuário"
              value={identificador}
              onChangeText={v => {
                setIdentificador(v)
                if (erro) setErro('')
              }}
              placeholder="voce@email.com ou maria.silva"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              returnKeyType="send"
              onSubmitEditing={pedirCodigo}
            />
          )}

          {etapa === 'codigo' && (
            <>
              <CampoTexto
                rotulo="Código de 6 dígitos"
                value={codigo}
                onChangeText={v => {
                  setCodigo(v.replace(/\D/g, '').slice(0, 6))
                  if (erro) setErro('')
                }}
                placeholder="000000"
                keyboardType="number-pad"
                maxLength={6}
                /* Faz o iOS oferecer o código direto da notificação do e-mail,
                   sem a pessoa precisar sair do app para copiar. */
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                returnKeyType="go"
                onSubmitEditing={conferirCodigo}
                style={styles.campoCodigo}
              />

              <Pressable
                onPress={reenviar}
                disabled={esperaReenvio > 0}
                hitSlop={8}
                style={styles.linkReenviar}
                accessibilityRole="button"
              >
                <Text style={[styles.textoReenviar, esperaReenvio > 0 && styles.textoReenviarInativo]}>
                  {esperaReenvio > 0
                    ? `Reenviar código em ${esperaReenvio}s`
                    : 'Não chegou? Reenviar código'}
                </Text>
              </Pressable>
            </>
          )}

          {etapa === 'senha' && (
            <>
              <View>
                <Text style={styles.rotulo}>Senha nova</Text>
                <View style={styles.campoComBotao}>
                  <TextInput
                    value={senha}
                    onChangeText={v => {
                      setSenha(v)
                      if (erro) setErro('')
                    }}
                    placeholder="••••••••"
                    placeholderTextColor={inkFraco}
                    keyboardAppearance="dark"
                    secureTextEntry={!mostrarSenha}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="new-password"
                    textContentType="newPassword"
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

              <ForcaSenha senha={senha} />

              <CampoTexto
                rotulo="Repita a senha nova"
                value={confirmacao}
                onChangeText={v => {
                  setConfirmacao(v)
                  if (erro) setErro('')
                }}
                placeholder="••••••••"
                secureTextEntry={!mostrarSenha}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="go"
                onSubmitEditing={salvarSenha}
              />
            </>
          )}

          {erro.length > 0 && (
            <View style={styles.caixaErro}>
              <Text style={styles.textoErro}>{erro}</Text>
            </View>
          )}

          <Pressable
            onPress={etapa === 'pedir' ? pedirCodigo : etapa === 'codigo' ? conferirCodigo : salvarSenha}
            disabled={!podeAvancar(etapa, identificador, codigo, senha, confirmacao, carregando)}
            style={({ pressed }) => [
              styles.botaoPrimario,
              pressed && styles.botaoPrimarioPressionado,
              !podeAvancar(etapa, identificador, codigo, senha, confirmacao, carregando) &&
                styles.botaoDesabilitado,
            ]}
            accessibilityRole="button"
          >
            {carregando ? (
              <ActivityIndicator color={cores.branco} />
            ) : (
              <Text style={styles.textoBotaoPrimario}>
                {etapa === 'pedir' ? 'Enviar código' : etapa === 'codigo' ? 'Continuar' : 'Salvar e entrar'}
              </Text>
            )}
          </Pressable>

          <Pressable onPress={cancelar} style={styles.linkVoltar} accessibilityRole="button">
            <Text style={styles.textoLinkSuave}>
              {etapa === 'pedir' ? 'Lembrei minha senha. ' : ''}
              <Text style={styles.textoLinkForte}>Voltar para o login</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

/* O supabase-js devolve o motivo em inglês e cru. Traduzir os casos que a
   pessoa consegue resolver sozinha na tela; o resto cai no genérico, porque
   detalhe interno de auth não ajuda quem está tentando entrar. */
function mensagemAoSalvar(msg: string): string {
  const m = msg.toLowerCase()

  if (m.includes('different from the old password') || m.includes('should be different')) {
    return 'A senha nova precisa ser diferente da atual.'
  }
  if (m.includes('weak') || m.includes('password should contain') || m.includes('at least')) {
    return 'Essa senha não atende às regras do servidor. Tente uma com letras, números e símbolos.'
  }
  if (m.includes('reauthentication') || m.includes('nonce')) {
    return 'Por segurança, o servidor pediu uma confirmação a mais. Peça um código novo e tente outra vez.'
  }
  if (m.includes('session') || m.includes('jwt') || m.includes('not authenticated')) {
    return 'Sua sessão de recuperação expirou. Volte e peça um código novo.'
  }
  if (m.includes('rate') || m.includes('too many')) {
    return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.'
  }
  if (m.includes('network') || m.includes('fetch')) {
    return 'Não consegui falar com o servidor. Verifique sua conexão e tente de novo.'
  }
  return 'Não consegui salvar a senha nova. Tente de novo em instantes.'
}

function textoDeApoio(etapa: Etapa, email: string | null, digitouEmail: boolean): string {
  if (etapa === 'pedir') {
    return 'Informe seu e-mail ou usuário e enviamos um código de 6 dígitos para o e-mail da conta.'
  }
  if (etapa === 'codigo') {
    const destino = email && digitouEmail ? mascarar(email) : 'o e-mail cadastrado nessa conta'
    return `Se existir uma conta, o código foi enviado para ${destino}. Ele vale por 15 minutos.`
  }
  return 'Escolha uma senha que você não use em outro lugar. As outras sessões desta conta serão desconectadas.'
}

function podeAvancar(
  etapa: Etapa,
  identificador: string,
  codigo: string,
  senha: string,
  confirmacao: string,
  carregando: boolean,
): boolean {
  if (carregando) return false
  if (etapa === 'pedir') return identificador.trim().length > 0
  if (etapa === 'codigo') return codigo.length === 6
  return senha.length > 0 && confirmacao.length > 0
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 },

  cabecalho: { alignItems: 'center', marginBottom: 28 },
  logo: { width: 88, height: 88, marginBottom: 8 },
  titulo: { fontSize: 26, fontWeight: '700', color: cores.deep, textAlign: 'center' },
  subtitulo: {
    marginTop: 8,
    fontSize: 14.5,
    lineHeight: 21,
    color: inkSuave,
    textAlign: 'center',
  },

  formulario: { gap: 16 },
  rotulo: { marginBottom: 6, fontSize: 13, fontWeight: '600', color: inkMedio },
  campo: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: cores.line,
    backgroundColor: cores.superficie,
    paddingHorizontal: 16,
    fontSize: 16,
    color: cores.ink,
  },
  /* Dígito grande e espaçado: seis caracteres num campo de texto comum são
     difíceis de conferir contra o que está na tela do e-mail. */
  campoCodigo: { fontSize: 24, fontWeight: '700', letterSpacing: 8, textAlign: 'center' },
  campoComBotao: { justifyContent: 'center' },
  campoSenha: { paddingRight: 86 },
  botaoOlho: { position: 'absolute', right: 14, paddingVertical: 6, paddingHorizontal: 4 },
  textoOlho: { fontSize: 13, fontWeight: '600', color: cores.deep },

  linkReenviar: { alignSelf: 'center', paddingVertical: 4 },
  textoReenviar: { fontSize: 13.5, fontWeight: '700', color: cores.deep },
  textoReenviarInativo: { color: inkFraco, fontWeight: '600' },

  caixaErro: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: cores.erroBorda,
    backgroundColor: cores.erroFundo,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  textoErro: { fontSize: 13.5, lineHeight: 19, color: cores.erroTexto },

  botaoPrimario: {
    height: 54,
    borderRadius: 16,
    backgroundColor: cores.verde,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoPrimarioPressionado: { backgroundColor: cores.verdeEscuro },
  botaoDesabilitado: { opacity: 0.5 },
  textoBotaoPrimario: { fontSize: 16, fontWeight: '700', color: cores.branco },

  linkVoltar: { alignSelf: 'center', paddingVertical: 6 },
  textoLinkSuave: { fontSize: 14, color: inkSuave },
  textoLinkForte: { fontWeight: '700', color: cores.deep },
})
