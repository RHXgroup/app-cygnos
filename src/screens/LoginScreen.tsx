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

/* A do modo profissional é outra frase porque os campos são outros: dizer
   "e-mail ou usuário" para quem digitou MT manda ela procurar erro num campo
   que nem está na tela. E vale a mesma regra -- par inexistente e senha errada
   caem juntos, porque separar devolveria o verificador de contas. */
const CREDENCIAL_INVALIDA_NUTRI = 'Código Cygnos, usuário ou senha incorretos.'

/* Resposta própria, e não "credenciais incorretas": quem está trancado por ter
   errado quatro vezes precisa saber que é para ESPERAR. Sem isto ela ficaria
   tentando a senha certa achando que ela é a errada. */
function frasaDaEspera(segundos: number): string {
  const min = Math.max(1, Math.ceil(segundos / 60))
  return `Muitas tentativas seguidas. Tente de novo em ${min} ${min === 1 ? 'minuto' : 'minutos'}.`
}

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
  /* ──────────────────── DUAS PORTAS NA MESMA TELA ────────────────────
   *
   * O paciente entra com e-mail ou usuário. A profissional entra com CÓDIGO MT
   * + usuário + senha, que é o mesmo trio do site -- e não é preferência: a
   * conta dela nasce com e-mail SINTÉTICO (`nutri_<usuario>@sano.internal`), que
   * não existe como caixa e que ela nunca viu. E-mail é opcional no cadastro
   * dela. MT + usuário é a única credencial que ela tem.
   *
   * E o MT não pode ser campo fixo, porque paciente não tem MT. Por isso o
   * modo, e não um terceiro campo sempre visível. */
  const [modo, setModo] = useState<'paciente' | 'nutri'>('paciente')
  const [mt, setMt] = useState('')
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
  /* O voltar tem de desfazer o MODO antes de sair do app.
   *
   * Registrado aqui e SEM lista de dependências, de propósito: o App tem um
   * tratador central que devolve `false` estando no login -- ou seja, encerra o
   * app. Como o React roda os efeitos do filho antes dos do pai, um efeito com
   * lista faria o pai registrar por último e ganhar. Re-registrar a cada
   * renderização é o que põe este na frente. Armadilha 1 do AGENTS.md. */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (modo === 'nutri') {
        trocarModo('paciente')
        return true
      }
      /* Nada a desfazer: devolve ao central, que sabe encerrar. */
      return false
    })
    return () => sub.remove()
  })

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

  const podeEnviar =
    identificador.trim().length > 0 &&
    senha.length > 0 &&
    (modo === 'paciente' || mt.trim().length > 0) &&
    !carregando

  /* Trocar de porta limpa o que era da outra.
   *
   * Não é zelo: "maria@gmail.com" ficaria no campo Usuário depois da troca, e
   * o erro seguinte seria "usuário ou senha incorretos" apontando para um campo
   * que a pessoa nem preencheu naquele modo. A senha some junto porque as duas
   * contas podem ter senhas diferentes. */
  function trocarModo(novo: 'paciente' | 'nutri') {
    setModo(novo)
    setMt('')
    setIdentificador('')
    setSenha('')
    setErro('')
    if (aviso) onLimparAviso()
  }

  /* MT + usuário + senha, contra `app-login-profissional`.
   *
   * Função separada da do site (`login-profissional`) por duas diferenças que
   * não dá para conciliar numa só:
   *
   *   · O site exige Turnstile, que é widget da web -- exigiria WebView aqui, e
   *     a site key que este projeto nunca teve. A do app troca isso por um freio
   *     de tentativas no banco (migração 20260908200000). Os `mt_code` são
   *     SEQUENCIAIS, então esta porta sem freio nenhum seria a entrada fraca
   *     para as contas que enxergam centenas de fichas.
   *   · O site devolve um token de checkout quando o teste venceu. Link de
   *     pagamento dentro de um app Android infringe a política de faturamento
   *     do Google Play, então aqui a frase manda resolver no sistema. */
  async function entrarComoNutri() {
    const { data, error: erroFn } = await supabase.functions.invoke('app-login-profissional', {
      body: { mt_code: mt.trim(), username: identificador.trim().toLowerCase(), senha },
    })

    /* `invoke` deixa `data` nulo em resposta não-2xx e joga o corpo em
       `error.context` -- e é justamente ali que moram os desfechos que valem
       mensagem própria. O site perdeu três deles por ler só `data`, e quem
       estava inadimplente lia "tente de novo" e ia procurar a senha, que estava
       certa. `context` é uma Response e só pode ser lida UMA vez. */
    let resposta = data as {
      error?: string
      espera_seg?: number
      access_token?: string
      refresh_token?: string
    } | null
    let semResposta = false

    if (erroFn) {
      const ctx = (erroFn as { context?: Response }).context
      if (ctx && typeof ctx.json === 'function') {
        try {
          resposta = await ctx.json()
        } catch {
          semResposta = true
        }
      } else {
        semResposta = true
      }
    }

    if (resposta?.access_token && resposta?.refresh_token) {
      const { error: erroSessao } = await supabase.auth.setSession({
        access_token: resposta.access_token,
        refresh_token: resposta.refresh_token,
      })
      /* Em caso de sucesso não mexemos no estado: o `onAuthStateChange` do App
         troca de tela e este componente é desmontado. */
      if (!erroSessao) return
    }

    /* ──────────────────── "SENHA INCORRETA" SÓ QUANDO O SERVIDOR DISSE ISSO ────────────────────
     *
     * Aqui o ramo final era o `else` de tudo, e isso produziu um engano real: a
     * função ainda não estava publicada, o Supabase respondeu 404 com um corpo
     * que não tem `error` nenhum, e a tela acusou "Código MT, usuário ou senha
     * incorretos" para uma credencial que estava certa. Quem lê isso vai
     * procurar a própria senha, e não o deploy.
     *
     * Agora a acusação exige `credenciais_invalidas` escrito pela função. Tudo
     * o que não for um desfecho conhecido é problema NOSSO, e a frase diz isso.
     *
     * O sigilo não se perde: par inexistente e senha errada continuam chegando
     * com a MESMA resposta, porque quem os junta é a função, e não esta tela. */
    if (resposta?.error === 'credenciais_invalidas') {
      setErro(CREDENCIAL_INVALIDA_NUTRI)
    } else if (resposta?.error === 'muitas_tentativas') {
      setErro(frasaDaEspera(resposta.espera_seg ?? 900))
    } else if (resposta?.error === 'suspenso') {
      setErro('O acesso desta conta está suspenso. Resolva no sistema, no computador.')
    } else if (resposta?.error === 'teste_expirado') {
      setErro('O período de teste terminou. Continue no sistema, no computador.')
    } else if (resposta?.error === 'campos_obrigatorios') {
      setErro('Preencha o código Cygnos, o usuário e a senha.')
    } else if (semResposta) {
      setErro('Não consegui entrar agora. Tente de novo em instantes.')
    } else {
      /* Chega aqui quando a resposta veio e não é nenhum desfecho previsto:
         função não publicada, versão antiga no ar, erro dentro dela. O console
         guarda o corpo; a tela não culpa a senha de ninguém. */
      console.warn('[login] resposta inesperada da app-login-profissional:', resposta)
      setErro('Não consegui entrar agora. Tente de novo em instantes.')
    }
    setCarregando(false)
  }

  async function entrar() {
    if (!podeEnviar) return
    setErro('')
    setCarregando(true)

    if (modo === 'nutri') {
      await entrarComoNutri()
      return
    }

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
            {modo === 'nutri'
              ? 'Use o mesmo código, usuário e senha do sistema.'
              : 'Entre para acompanhar seu plano, suas medidas e suas consultas.'}
          </Text>
        </View>

        <View
          style={styles.formulario}
          onLayout={e => {
            ondeComecaOFormulario.current = e.nativeEvent.layout.y
          }}
        >
          {/* O MT vem PRIMEIRO, e com o prefixo fixo do lado -- idêntico ao
              site. Ela já digita este trio todo dia; mudar a ordem ou pedir o
              "MT" por extenso faria a mesma credencial parecer outra. */}
          {modo === 'nutri' && (
            <View onLayout={medir('mt')}>
              <Text style={styles.rotulo}>Código Cygnos</Text>
              <View style={styles.campoComPrefixo}>
                <Text style={styles.prefixoMT}>CY</Text>
                <TextInput
                  value={mt}
                  /* Só dígitos, e teclado numérico: o "MT" já está escrito ao
                     lado, e um teclado com letras aqui só produziria "MTMT1001".
                     Armadilha 3 -- nunca oferecer teclado que o campo descarta. */
                  onChangeText={v => {
                    setMt(v.replace(/[^0-9]/g, ''))
                    if (erro) setErro('')
                  }}
                  placeholder="1000"
                  placeholderTextColor={paleta().inkFraco}
                  keyboardAppearance="dark"
                  keyboardType="number-pad"
                  maxLength={8}
                  returnKeyType="next"
                  onFocus={() => setEmFoco('mt')}
                  style={[styles.campo, styles.campoDoMT]}
                  accessibilityLabel="Código Cygnos, só os números"
                />
              </View>
            </View>
          )}

          <View onLayout={medir('identificador')}>
            <Text style={styles.rotulo}>
              {modo === 'nutri' ? 'Usuário' : 'E-mail ou usuário'}
            </Text>
            <TextInput
              value={identificador}
              onChangeText={v => {
                setIdentificador(v)
                if (erro) setErro('')
                if (aviso) onLimparAviso()
              }}
              placeholder={modo === 'nutri' ? 'maria.silva' : 'voce@email.com ou maria.silva'}
              placeholderTextColor={paleta().inkFraco}
              keyboardAppearance="dark"
              /* Teclado de e-mail mesmo aceitando usuário: deixa o "@" à mão
                 para a maioria e não atrapalha quem digita o apelido. No modo
                 profissional não há e-mail nenhum a digitar, e o "@" ali só
                 ocuparia tecla. */
              keyboardType={modo === 'nutri' ? 'default' : 'email-address'}
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
              descobre que não lembra dela.

              ──────────────────── E por que a profissional NÃO vê este link ────────────────────
              A recuperação do app manda um código para o e-mail do Auth. O da
              conta dela é sintético (`nutri_<usuario>@sano.internal`), então o
              código iria para um endereço que não existe e ela ficaria
              esperando um e-mail que nunca chega. Melhor dizer onde resolve. */}
          {modo === 'paciente' ? (
            <Pressable
              onPress={onIrParaRecuperar}
              hitSlop={8}
              style={styles.linkEsqueci}
              accessibilityRole="button"
            >
              <Text style={styles.textoEsqueci}>Esqueci minha senha</Text>
            </Pressable>
          ) : (
            <Text style={styles.avisoSenhaNutri}>
              Esqueceu a senha? A troca de senha de profissional é feita no
              sistema, no computador.
            </Text>
          )}

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

          {/* Criar conta é de paciente. A de profissional nasce no sistema, e
              oferecer o cadastro aqui levaria ela para a tela errada. */}
          {modo === 'paciente' && (
            <Pressable
              onPress={onIrParaCadastro}
              style={styles.linkCriarConta}
              accessibilityRole="button"
            >
              <Text style={styles.textoLinkSuave}>
                Ainda não tem conta? <Text style={styles.textoLinkForte}>Criar conta</Text>
              </Text>
            </Pressable>
          )}
        </View>

        <View style={styles.divisor}>
          <View style={styles.linhaDivisor} />
          <Text style={styles.textoDivisor}>ou</Text>
          <View style={styles.linhaDivisor} />
        </View>

        {/* ──────────────────── AS DUAS PORTAS ────────────────────
            Aqui havia um botão "Sou nutricionista" que não levava a lugar
            nenhum: escrevia "ainda não está disponível" e parava ali. Ele foi
            escrito quando a entrada dela era uma ideia, e apontava para o
            desenho certo -- só nunca tinha sido construído.

            ──────────────────── Por que MT, e não e-mail ────────────────────
            Porque em geral ela NÃO TEM e-mail na conta: ele é opcional no
            cadastro, e a conta nasce com um endereço sintético
            (`nutri_<usuario>@sano.internal`) que não existe como caixa e que ela
            nunca viu. MT + usuário + senha não é preferência: é a única
            credencial que ela tem, e é a mesma do site.

            ──────────────────── E por que MODO, e não um campo a mais ────────────────────
            Paciente não tem MT. Um terceiro campo sempre visível faria a
            primeira tela do app pedir um código que a maioria das pessoas não
            tem -- e campo que a pessoa não entende é campo que ela tenta
            preencher. */}
        <Botao
          rotulo={modo === 'nutri' ? 'Sou paciente' : 'Sou nutricionista'}
          tipo="secundario"
          onPress={() => trocarModo(modo === 'nutri' ? 'paciente' : 'nutri')}
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
  /* O prefixo "MT" é desenho, e não texto do campo: ele fica FORA do
     `TextInput` para o valor guardado continuar sendo só os dígitos. Escrever
     "MT" dentro do valor faria o filtro de dígitos comê-lo no primeiro toque
     -- que é a armadilha 3 pelo lado de dentro. */
  campoComPrefixo: { flexDirection: 'row', alignItems: 'stretch' },
  prefixoMT: {
    paddingHorizontal: 14,
    textAlignVertical: 'center',
    fontSize: 14,
    fontWeight: '800',
    color: t.inkMedio,
    backgroundColor: t.cores.superficie,
    borderWidth: 1,
    borderRightWidth: 0,
    borderColor: t.cores.borda,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    overflow: 'hidden',
    lineHeight: 46,
  },
  campoDoMT: { flex: 1, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  avisoSenhaNutri: {
    fontSize: 12,
    color: t.inkFraco,
    lineHeight: 17,
    marginTop: 2,
    paddingHorizontal: 2,
  },
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
