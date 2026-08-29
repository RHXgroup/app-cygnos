import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { CampoTexto } from '../components/CampoTexto'
import { ForcaSenha } from '../components/ForcaSenha'
import { LINKS, abrirLink } from '../lib/links'
import { supabase } from '../lib/supabase'
import {
  mascaraCPF,
  mascaraData,
  mascaraTelefone,
  soDigitos,
  validarCPF,
  validarEmail,
  validarNascimento,
  validarNome,
  validarSenha,
  validarTelefone,
  validarUsername,
} from '../lib/formulario'
import { estilosDe, paleta } from '../lib/tema'

type Campo = 'nome' | 'email' | 'username' | 'cpf' | 'telefone' | 'nascimento' | 'senha' | 'genero'
type Erros = Partial<Record<Campo, string>>

const GENEROS = [
  { valor: 'feminino', rotulo: 'Feminino' },
  { valor: 'masculino', rotulo: 'Masculino' },
  { valor: 'outro', rotulo: 'Outro' },
] as const

export function CadastroScreen({ onVoltar }: { onVoltar: () => void }) {
  const styles = estilos()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [cpf, setCpf] = useState('')
  const [telefone, setTelefone] = useState('')
  const [nascimento, setNascimento] = useState('')
  const [genero, setGenero] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)

  const [erros, setErros] = useState<Erros>({})
  const [erroGeral, setErroGeral] = useState('')
  const [carregando, setCarregando] = useState(false)
  /* Quando a confirmação de e-mail está ligada no projeto, o signUp devolve
     usuário mas nenhuma sessão. Sem este estado a tela ficaria parada, sem
     dizer que o cadastro deu certo. */
  const [aguardandoConfirmacao, setAguardandoConfirmacao] = useState(false)

  function limparErro(campo: Campo) {
    setErros(e => (e[campo] ? { ...e, [campo]: undefined } : e))
    if (erroGeral) setErroGeral('')
  }

  async function cadastrar() {
    if (carregando) return
    setErroGeral('')

    /* 1. Tudo que dá para checar sem rede, primeiro. */
    const nascimentoResultado = validarNascimento(nascimento)
    const locais: Erros = {
      nome: validarNome(nome) ?? undefined,
      email: validarEmail(email) ?? undefined,
      username: validarUsername(username) ?? undefined,
      cpf: validarCPF(cpf) ?? undefined,
      telefone: validarTelefone(telefone) ?? undefined,
      senha: validarSenha(senha) ?? undefined,
      nascimento: 'erro' in nascimentoResultado ? nascimentoResultado.erro : undefined,
      genero: genero ? undefined : 'Escolha uma opção.',
    }

    if (Object.values(locais).some(Boolean)) {
      setErros(locais)
      return
    }
    if (!('iso' in nascimentoResultado)) return // impossível aqui; o TS não sabe

    setErros({})
    setCarregando(true)

    /* 2. Checagem prévia só para poder dizer QUAL campo repetiu. Quem garante a
       unicidade são os constraints do banco — o erro que volta de lá não diz o
       campo, então a mensagem boa tem que vir daqui.

       CPF e telefone saíram desta checagem, e é de propósito. A função é
       chamável por qualquer um com a chave pública do app, sem login e sem
       limite: perguntar "esse CPF já está em uso?" respondia, de graça, se uma
       pessoa determinada é paciente de um serviço de nutrição. E-mail e usuário
       ficam porque a pessoa está ESCOLHENDO os dois e precisa saber se estão
       livres — ninguém escolhe o próprio CPF.
       Repetição de CPF ou telefone continua barrada pelo índice único do banco
       e aparece ao enviar, no bloco de erro mais abaixo. */
    const { data: disp, error: erroDisp } = await supabase.rpc('app_cadastro_disponibilidade', {
      p_email: email.trim().toLowerCase(),
      p_username: username.trim().toLowerCase(),
      p_cpf: soDigitos(cpf),
      p_telefone: soDigitos(telefone),
    })

    if (erroDisp) {
      setErroGeral('Não consegui falar com o servidor. Verifique sua conexão e tente de novo.')
      setCarregando(false)
      return
    }

    const emUso: Erros = {
      email: disp?.email_em_uso ? 'Já existe uma conta com esse e-mail.' : undefined,
      username: disp?.username_em_uso ? 'Esse nome de usuário já está em uso.' : undefined,
    }
    if (Object.values(emUso).some(Boolean)) {
      setErros(emUso)
      setCarregando(false)
      return
    }

    /* 3. O cadastro viaja no metadata do signUp; um gatilho no banco cria a
       linha em app_contas dentro da mesma transação. Se algo repetir na hora
       do insert, o usuário do Auth nem chega a existir — sem conta órfã. */
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password: senha,
      options: {
        data: {
          app_nome_completo: nome.trim().replace(/\s+/g, ' '),
          app_username: username.trim().toLowerCase(),
          app_cpf: soDigitos(cpf),
          app_telefone: soDigitos(telefone),
          app_genero: genero,
          app_data_nascimento: nascimentoResultado.iso,
        },
      },
    })

    if (error) {
      const m = error.message.toLowerCase()
      if (m.includes('already registered') || m.includes('already been registered')) {
        setErros({ email: 'Já existe uma conta com esse e-mail.' })
      } else if (m.includes('database error')) {
        /* CPF ou telefone repetido — o caminho NORMAL desde que a checagem
           prévia parou de perguntar por eles. Cobre também a corrida de alguém
           ter cadastrado o mesmo usuário entre a checagem e o envio. */
        setErroGeral('Já existe uma conta com esse CPF ou telefone. Se a conta é sua, entre em vez de criar outra.')
      } else {
        setErroGeral('Não foi possível criar sua conta agora. Tente de novo em instantes.')
      }
      setCarregando(false)
      return
    }

    /* Com sessão, o onAuthStateChange no App troca de tela e este componente é
       desmontado — não mexer em estado depois daqui. */
    if (!data.session) {
      setAguardandoConfirmacao(true)
      setCarregando(false)
    }
  }

  if (aguardandoConfirmacao) {
    return (
      <View style={styles.centro}>
        <Text style={styles.tituloConfirmacao}>Falta só confirmar</Text>
        <Text style={styles.textoConfirmacao}>
          Enviamos um e-mail para {email.trim().toLowerCase()}. Abra a mensagem e toque no link
          para ativar sua conta.
        </Text>
        <Pressable onPress={onVoltar} style={styles.botaoPrimario}>
          <Text style={styles.textoBotaoPrimario}>Voltar para o login</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.titulo}>Criar conta</Text>
        <Text style={styles.subtitulo}>
          Seus dados ficam com você e com a nutricionista que te acompanha.
        </Text>

        <View style={styles.formulario}>
          <CampoTexto
            rotulo="Nome completo"
            value={nome}
            onChangeText={v => {
              setNome(v)
              limparErro('nome')
            }}
            erro={erros.nome}
            placeholder="Maria Silva"
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
          />

          <CampoTexto
            rotulo="E-mail"
            value={email}
            onChangeText={v => {
              setEmail(v)
              limparErro('email')
            }}
            erro={erros.email}
            placeholder="voce@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
          />

          <CampoTexto
            rotulo="Nome de usuário"
            value={username}
            onChangeText={v => {
              /* Filtra na digitação em vez de reclamar depois: o teclado do
                 celular não tem como o usuário adivinhar a regra. */
              setUsername(v.toLowerCase().replace(/[^a-z0-9._]/g, ''))
              limparErro('username')
            }}
            erro={erros.username}
            ajuda="Letras, números, ponto e underline."
            placeholder="maria.silva"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={20}
          />

          <CampoTexto
            rotulo="CPF"
            value={cpf}
            onChangeText={v => {
              setCpf(mascaraCPF(v))
              limparErro('cpf')
            }}
            erro={erros.cpf}
            placeholder="000.000.000-00"
            keyboardType="number-pad"
          />

          <CampoTexto
            rotulo="Telefone"
            value={telefone}
            onChangeText={v => {
              setTelefone(mascaraTelefone(v))
              limparErro('telefone')
            }}
            erro={erros.telefone}
            placeholder="(11) 90000-0000"
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
          />

          <CampoTexto
            rotulo="Data de nascimento"
            value={nascimento}
            onChangeText={v => {
              setNascimento(mascaraData(v))
              limparErro('nascimento')
            }}
            erro={erros.nascimento}
            placeholder="dd/mm/aaaa"
            keyboardType="number-pad"
            maxLength={10}
          />

          <View>
            <Text style={styles.rotulo}>Gênero</Text>
            <View style={styles.linhaGenero}>
              {GENEROS.map(g => {
                const ativo = genero === g.valor
                return (
                  <Pressable
                    key={g.valor}
                    onPress={() => {
                      setGenero(g.valor)
                      limparErro('genero')
                    }}
                    style={[styles.opcaoGenero, ativo && styles.opcaoGeneroAtiva]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: ativo }}
                  >
                    <Text style={[styles.textoGenero, ativo && styles.textoGeneroAtivo]}>
                      {g.rotulo}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
            {erros.genero ? <Text style={styles.erroGenero}>{erros.genero}</Text> : null}
          </View>

          <View>
            <View style={styles.campoSenhaEnvolucro}>
              <CampoTexto
                rotulo="Senha"
                value={senha}
                onChangeText={v => {
                  setSenha(v)
                  limparErro('senha')
                }}
                erro={erros.senha}
                placeholder="••••••••"
                secureTextEntry={!mostrarSenha}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                style={styles.campoSenha}
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
            <ForcaSenha senha={senha} />
          </View>

          {erroGeral.length > 0 && (
            <View style={styles.caixaErro}>
              <Text style={styles.textoErro}>{erroGeral}</Text>
            </View>
          )}

          <Pressable
            onPress={cadastrar}
            disabled={carregando}
            style={({ pressed }) => [
              styles.botaoPrimario,
              pressed && styles.botaoPrimarioPressionado,
              carregando && styles.botaoDesabilitado,
            ]}
          >
            {carregando ? (
              <ActivityIndicator color={paleta().cores.branco} />
            ) : (
              <Text style={styles.textoBotaoPrimario}>Criar conta</Text>
            )}
          </Pressable>

          {/* Abaixo do botão e não acima: o aceite é pelo ato de criar a conta,
              então o texto tem de estar ao lado do gesto que o dá. Sem caixa de
              marcar de propósito — mais um campo obrigatório num formulário de
              oito só adiciona um erro de validação a mais, e o vínculo com os
              termos é o mesmo. */}
          <Text style={styles.aceite}>
            Ao criar a conta você concorda com os{' '}
            <Text style={styles.linkAceite} onPress={() => abrirLink(LINKS.termos)}>
              Termos de Uso
            </Text>{' '}
            e com a{' '}
            <Text style={styles.linkAceite} onPress={() => abrirLink(LINKS.privacidade)}>
              Política de Privacidade
            </Text>
            , incluindo o tratamento dos seus dados de saúde para o acompanhamento nutricional.
          </Text>

          <Pressable onPress={onVoltar} style={styles.linkVoltar} accessibilityRole="button">
            <Text style={styles.textoLinkSuave}>
              Já tem conta? <Text style={styles.textoLinkForte}>Entrar</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 48 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  titulo: { fontSize: 26, fontWeight: '700', color: t.cores.deep },
  subtitulo: { marginTop: 8, marginBottom: 24, fontSize: 14.5, lineHeight: 21, color: t.inkSuave },
  formulario: { gap: 16 },
  rotulo: { marginBottom: 6, fontSize: 13, fontWeight: '600', color: t.inkMedio },

  linhaGenero: { flexDirection: 'row', gap: 8 },
  opcaoGenero: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.line,
    backgroundColor: t.cores.superficie,
    alignItems: 'center',
    justifyContent: 'center',
  },
  opcaoGeneroAtiva: { borderColor: t.cores.deep, backgroundColor: t.cores.moss },
  textoGenero: { fontSize: 14, color: t.inkMedio },
  textoGeneroAtivo: { fontWeight: '700', color: t.cores.deep },
  erroGenero: { marginTop: 5, fontSize: 12.5, color: t.cores.erroTexto },

  campoSenhaEnvolucro: { position: 'relative' },
  campoSenha: { paddingRight: 92 },
  /* 28 = altura do rótulo + respiro; alinha o botão com o campo, não com o bloco. */
  botaoOlho: { position: 'absolute', right: 14, top: 40, paddingVertical: 6, paddingHorizontal: 4 },
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

  botaoPrimario: {
    height: 54,
    borderRadius: 14,
    backgroundColor: t.cores.verde,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    paddingHorizontal: 24,
  },
  botaoPrimarioPressionado: { backgroundColor: t.cores.verdeEscuro },
  botaoDesabilitado: { opacity: 0.6 },
  textoBotaoPrimario: { fontSize: 16, fontWeight: '700', color: t.cores.branco },
  aceite: { fontSize: 12, lineHeight: 18, color: t.inkSuave, textAlign: 'center' },
  linkAceite: { fontWeight: '700', color: t.cores.deep, textDecorationLine: 'underline' },
  linkVoltar: { alignItems: 'center', paddingVertical: 8 },
  textoLinkSuave: { fontSize: 14, color: t.inkSuave },
  textoLinkForte: { fontWeight: '700', color: t.cores.deep },

  tituloConfirmacao: { fontSize: 22, fontWeight: '700', color: t.cores.deep, textAlign: 'center' },
  textoConfirmacao: {
    fontSize: 15,
    lineHeight: 22,
    color: t.inkSuave,
    textAlign: 'center',
    marginBottom: 8,
  },
  }),
)
