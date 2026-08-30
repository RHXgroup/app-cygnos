import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { PALAVRA_CONFIRMACAO, excluirConta } from '../lib/conta'
import { supabase } from '../lib/supabase'
import { estilosDe, paleta } from '../lib/tema'

/* Exclusão da conta, exigida pela Play Store para todo app que deixa criar uma.
 *
 * Duas coisas moldaram esta tela:
 *
 *   1. É irreversível e não tem desfazer. Por isso a lista do que some vem
 *      ANTES do botão, e o botão só acorda depois da palavra digitada — não é
 *      atrito por atrito, é o tempo de ler o que está prestes a acontecer.
 *
 *   2. O que some é só o que o app guarda. O prontuário da nutricionista fica,
 *      por guarda legal, e quem não souber disso pode apagar a conta achando
 *      que apagou o histórico da clínica junto. Está dito na tela, não só na
 *      política.
 *
 * Mesma escolha das outras telas de menu: View sobreposta lá no App, não
 * Modal. */
export function ExcluirContaScreen({ email, onFechar }: { email: string; onFechar: () => void }) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const [palavra, setPalavra] = useState('')
  const [excluindo, setExcluindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const confirmada = palavra.trim().toUpperCase() === PALAVRA_CONFIRMACAO
  const podeExcluir = confirmada && !excluindo

  async function confirmar() {
    if (!podeExcluir) return
    setExcluindo(true)
    setErro(null)

    const r = await excluirConta()

    if (r.tipo === 'erro') {
      setErro(r.mensagem)
      setExcluindo(false)
      return
    }

    /* A conta já não existe do lado do servidor, mas a sessão continua guardada
       no aparelho. Sem este signOut o app seguiria mostrando as telas de quem
       está logado, com um token que nenhuma chamada aceita mais — e o efeito na
       tela seria erro em tudo, não a volta para o login.

       Nada de setExcluindo(false) aqui: o signOut derruba esta tela junto com a
       área logada, e mexer no estado de um componente que está saindo é aviso
       de vazamento à toa. */
    await supabase.auth.signOut()
  }

  return (
    <View style={[styles.tela, { paddingTop: top + 8 }]}>
      <View style={styles.cabecalho}>
        <Pressable
          onPress={onFechar}
          style={styles.botaoVoltar}
          hitSlop={8}
          disabled={excluindo}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela}>Excluir conta</Text>
        <View style={styles.botaoVoltar} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[styles.conteudo, { paddingBottom: 40 + bottom }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.circulo}>
            <Ionicons name="trash-outline" size={26} color={paleta().cores.erroTexto} />
          </View>

          <Text style={styles.chamada}>Isto não tem volta</Text>
          <Text style={styles.explicacao}>
            A conta <Text style={styles.email}>{email}</Text> e tudo que você registrou no app serão
            apagados dos nossos servidores. Não há como recuperar depois.
          </Text>

          <View style={styles.bloco}>
            <Text style={styles.tituloBloco}>O que será apagado</Text>
            {[
              'Seu cadastro: nome, CPF, telefone, e-mail e foto de perfil',
              'Seus registros de água, peso, sono e refeições',
              'Suas metas, planos alimentares e cálculos energéticos',
              'O vínculo com a sua nutricionista',
            ].map(item => (
              <View key={item} style={styles.linhaItem}>
                <Ionicons name="close-circle" size={16} color={paleta().cores.erroTexto} />
                <Text style={styles.textoItem}>{item}</Text>
              </View>
            ))}
          </View>

          <View style={styles.bloco}>
            <Text style={styles.tituloBloco}>O que permanece</Text>
            <View style={styles.linhaItem}>
              <Ionicons name="information-circle" size={16} color={paleta().inkFraco} />
              <Text style={styles.textoItem}>
                Se você já foi atendido por uma nutricionista, o prontuário daquele atendimento
                continua com ela — consultas, medidas, exames e fotos tiradas no consultório. São
                registros de saúde que a profissional é obrigada a guardar por prazo legal, e não
                dependem do app. Para tratar deles, fale diretamente com ela.
              </Text>
            </View>
          </View>

          <Text style={styles.rotuloCampo}>
            Para confirmar, digite <Text style={styles.palavra}>{PALAVRA_CONFIRMACAO}</Text> abaixo
          </Text>
          <TextInput
            value={palavra}
            onChangeText={setPalavra}
            editable={!excluindo}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder={PALAVRA_CONFIRMACAO}
            placeholderTextColor={paleta().inkFraco}
            keyboardAppearance="dark"
            style={[styles.campo, confirmada && styles.campoConfirmado]}
            accessibilityLabel={`Digite ${PALAVRA_CONFIRMACAO} para confirmar`}
          />

          {erro ? <Text style={styles.erro}>{erro}</Text> : null}

          <Pressable
            onPress={confirmar}
            disabled={!podeExcluir}
            style={({ pressed }) => [
              styles.botaoExcluir,
              !podeExcluir && styles.botaoDesligado,
              pressed && podeExcluir && styles.botaoPressionado,
            ]}
            accessibilityRole="button"
            accessibilityState={{ disabled: !podeExcluir }}
            accessibilityLabel="Excluir minha conta definitivamente"
          >
            {excluindo ? (
              <ActivityIndicator color={paleta().cores.branco} />
            ) : (
              <Text style={styles.textoBotaoExcluir}>Excluir minha conta</Text>
            )}
          </Pressable>

          <Pressable
            onPress={onFechar}
            disabled={excluindo}
            style={styles.botaoCancelar}
            accessibilityRole="button"
            accessibilityLabel="Cancelar e voltar"
          >
            <Text style={styles.textoBotaoCancelar}>Cancelar</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
  tela: { flex: 1, backgroundColor: t.cores.fundo },
  flex: { flex: 1 },

  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  botaoVoltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  tituloTela: { fontSize: 17, fontWeight: '800', color: t.cores.ink },

  conteudo: { paddingHorizontal: 20, paddingBottom: 40, alignItems: 'center' },

  circulo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: t.cores.erroFundo,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  chamada: {
    fontSize: 18,
    fontWeight: '800',
    color: t.cores.ink,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  explicacao: {
    marginTop: 8,
    fontSize: 13.5,
    lineHeight: 20,
    color: t.inkSuave,
    textAlign: 'center',
  },
  email: { fontWeight: '700', color: t.inkMedio },

  bloco: {
    alignSelf: 'stretch',
    marginTop: 20,
    padding: 16,
    borderRadius: 18,
    backgroundColor: t.cores.cartao,
    borderWidth: 1,
    borderColor: t.cores.borda,
    gap: 10,
  },
  tituloBloco: { fontSize: 13, fontWeight: '800', color: t.cores.ink },
  /* alignItems no topo, e não centralizado: os itens quebram em duas e três
     linhas, e um ícone centralizado verticalmente flutuaria longe da primeira
     palavra que ele marca. */
  linhaItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  textoItem: { flex: 1, fontSize: 13, lineHeight: 19, color: t.inkMedio },

  rotuloCampo: {
    alignSelf: 'stretch',
    marginTop: 24,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '600',
    color: t.inkMedio,
  },
  palavra: { fontWeight: '800', color: t.cores.erroTexto, letterSpacing: 1 },
  campo: {
    alignSelf: 'stretch',
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.line,
    backgroundColor: t.cores.superficie,
    paddingHorizontal: 16,
    /* 16px é o mínimo que o iOS aceita sem dar zoom automático no campo. */
    fontSize: 16,
    letterSpacing: 2,
    color: t.cores.ink,
  },
  campoConfirmado: { borderColor: t.cores.erroBorda, backgroundColor: t.cores.erroFundo },
  erro: {
    alignSelf: 'stretch',
    marginTop: 10,
    fontSize: 12.5,
    lineHeight: 17,
    color: t.cores.erroTexto,
  },

  botaoExcluir: {
    alignSelf: 'stretch',
    marginTop: 20,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.cores.erroTexto,
  },
  botaoPressionado: { opacity: 0.85 },
  /* Apagado enquanto a palavra não bate: o botão continua visível para a pessoa
     saber onde ele vai estar, mas não parece pronto para ser tocado. */
  botaoDesligado: { backgroundColor: t.cores.trilho },
  textoBotaoExcluir: { fontSize: 15, fontWeight: '700', color: t.cores.branco },

  botaoCancelar: { marginTop: 14, paddingVertical: 10 },
  textoBotaoCancelar: { fontSize: 14.5, fontWeight: '600', color: t.inkMedio },
  }),
)
