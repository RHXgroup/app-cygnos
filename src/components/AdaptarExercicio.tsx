import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { carregarLimitacoes, salvarLimitacoes } from '../lib/limitacoes'
import { adaptarExercicio, type Alternativa } from '../lib/treinoIA'
import { estilosDe, paleta } from '../lib/tema'

/* Trocar um exercício por outro que a limitação da pessoa permite.
 *
 * ── Quem decide é ela ──────────────────────────────────────────────────────
 * A função devolve TRÊS alternativas com o porquê de cada uma, e não uma. Uma
 * alternativa única é uma ordem; três são uma escolha. E quem sabe o que dói é
 * ela — o modelo não sente o ombro dela.
 *
 * ── A limitação é pedida AQUI quando falta ─────────────────────────────────
 * Sem ela a função recusa, e com razão: é a regra de segurança da chamada. Mas
 * mandar a pessoa até Mais para preencher e voltar seria perder o gesto. Se
 * faltar, esta tela pede na hora, salva no perfil, e segue — e a partir daí
 * vale para tudo, sem ela digitar de novo.
 *
 * ── O que esta tela NÃO faz ────────────────────────────────────────────────
 * Diagnosticar, prometer que não vai doer, ou recomendar tratamento. O prompt
 * do servidor proíbe as três, e quando a descrição sugere lesão aguda ele
 * devolve um aviso para procurar profissional em vez de alternativas. Um app de
 * nutrição opinando sobre lesão está fora do lugar dele, e o dano possível é
 * físico. */

export function AdaptarExercicio({
  visivel,
  contaId,
  exercicio,
  observacao,
  onde,
  onTrocar,
  onFechar,
}: {
  visivel: boolean
  contaId: string
  /* O nome do exercício que ela quer trocar. */
  exercicio: string
  observacao: string | null
  /* "Em casa", "Na academia" — muda o que dá para sugerir. */
  onde: string
  /* O escolhido. A tela de treino grava, guardando o nome ORIGINAL em
     `adaptado_de`: "Leg press (no lugar de Agachamento livre)" é o que faz a
     rotina continuar legível, e é o que a nutricionista precisa ver. */
  onTrocar: (nome: string) => void
  onFechar: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()

  const [limitacoes, setLimitacoes] = useState('')
  const [precisaDaLimitacao, setPrecisaDaLimitacao] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [pedindo, setPedindo] = useState(false)
  const [erro, setErro] = useState('')
  const [alternativas, setAlternativas] = useState<Alternativa[] | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    if (!visivel) {
      setAlternativas(null)
      setAviso(null)
      setErro('')
      setPedindo(false)
      return
    }
    let vivo = true
    setCarregando(true)
    carregarLimitacoes(contaId).then(r => {
      if (!vivo) return
      const texto = r.tipo === 'ok' ? r.limitacoes : ''
      setLimitacoes(texto)
      setPrecisaDaLimitacao(texto.trim().length < 3)
      setCarregando(false)
      /* Já tem limitação: pede as alternativas direto. O gesto foi "adaptar
         este", e uma tela intermediária dizendo o que ela já contou seria
         atrito por nada. */
      if (texto.trim().length >= 3) void pedir()
    })
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visivel, contaId])

  async function pedir() {
    setErro('')
    setPedindo(true)
    const r = await adaptarExercicio(exercicio, observacao, onde)
    setPedindo(false)

    if (r.tipo === 'ok') {
      setAlternativas(r.alternativas)
      setAviso(r.aviso)
      return
    }
    if (r.tipo === 'sem_limitacao') {
      setPrecisaDaLimitacao(true)
      return
    }
    setErro(r.mensagem)
  }

  async function guardarLimitacaoESeguir() {
    const texto = limitacoes.trim()
    if (texto.length < 3) {
      setErro('Escreva o que te limita, com as suas palavras.')
      return
    }
    setErro('')
    setPedindo(true)
    const falhou = await salvarLimitacoes(contaId, texto)
    if (falhou) {
      setPedindo(false)
      setErro(falhou.erro)
      return
    }
    setPrecisaDaLimitacao(false)
    setPedindo(false)
    void pedir()
  }

  return (
    <Modal visible={visivel} animationType="slide" transparent={false} onRequestClose={onFechar}>
      <KeyboardAvoidingView
        style={[styles.tela, { paddingTop: top + 8 }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.cabecalho}>
          <Pressable
            onPress={onFechar}
            style={styles.botaoVoltar}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
          >
            <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
          </Pressable>
          <Text style={styles.tituloTela}>Adaptar</Text>
          <View style={styles.botaoVoltar} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.conteudo, { paddingBottom: bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.oQue}>{exercicio}</Text>

          {carregando ? (
            <ActivityIndicator color={paleta().cores.verde} style={{ marginTop: 24 }} />
          ) : precisaDaLimitacao ? (
            <>
              <Text style={styles.explicacao}>
                Me conte o que te limita, com as suas palavras. Eu guardo e uso em todo treino, sem
                você precisar repetir.
              </Text>
              <TextInput
                style={styles.campoGrande}
                value={limitacoes}
                onChangeText={t => {
                  setLimitacoes(t)
                  if (erro) setErro('')
                }}
                placeholder="Ex.: dor no ombro direito quando levanto o braço acima da cabeça"
                placeholderTextColor={paleta().inkFraco}
                multiline
                textAlignVertical="top"
                maxLength={500}
                autoFocus
              />
              <Text style={styles.ajuda}>
                Quanto mais específico, melhor a troca. "Ombro" faz eu tirar exercício que talvez
                você conseguisse fazer.
              </Text>

              {erro ? <Text style={styles.erro}>{erro}</Text> : null}

              <Pressable
                onPress={guardarLimitacaoESeguir}
                disabled={pedindo}
                style={[styles.botao, pedindo && styles.botaoOcupado]}
                accessibilityRole="button"
              >
                {pedindo ? (
                  <ActivityIndicator color={paleta().cores.branco} />
                ) : (
                  <Text style={styles.textoBotao}>Guardar e ver alternativas</Text>
                )}
              </Pressable>
            </>
          ) : pedindo ? (
            <View style={styles.pensando}>
              <ActivityIndicator color={paleta().cores.verde} />
              <Text style={styles.textoPensando}>Procurando alternativas…</Text>
            </View>
          ) : (
            <>
              {/* O aviso vem ANTES das opções, e sozinho quando o caso pede
                  profissional. Enterrá-lo embaixo de três alternativas seria
                  oferecer a saída errada primeiro. */}
              {aviso ? (
                <View style={styles.cartaoAviso}>
                  <Ionicons name="alert-circle-outline" size={19} color={paleta().cores.erroTexto} />
                  <Text style={styles.textoAviso}>{aviso}</Text>
                </View>
              ) : null}

              {(alternativas ?? []).map((a, i) => (
                <Pressable
                  key={i}
                  onPress={() => onTrocar(a.nome)}
                  style={({ pressed }) => [styles.opcao, pressed && styles.pressionada]}
                  accessibilityRole="button"
                  accessibilityLabel={`Trocar por ${a.nome}`}
                >
                  <View style={styles.textoOpcao}>
                    <Text style={styles.nomeOpcao}>{a.nome}</Text>
                    {!!a.porque && <Text style={styles.porque}>{a.porque}</Text>}
                  </View>
                  <Ionicons name="chevron-forward" size={17} color={paleta().inkFraco} />
                </Pressable>
              ))}

              {erro ? <Text style={styles.erro}>{erro}</Text> : null}

              {alternativas !== null && alternativas.length === 0 && aviso === null ? (
                <Text style={styles.ajuda}>Não achei alternativa para esse.</Text>
              ) : null}

              <Pressable
                onPress={() => setPrecisaDaLimitacao(true)}
                style={styles.botaoTexto}
                accessibilityRole="button"
              >
                <Text style={styles.textoBotaoTexto}>Mudar o que eu sei da sua limitação</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.cores.fundo },
    cabecalho: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingBottom: 8,
    },
    botaoVoltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    tituloTela: { flexShrink: 1, fontSize: 17, fontWeight: '800', color: t.cores.ink },
    conteudo: { paddingHorizontal: 20, gap: 10 },

    oQue: { fontSize: 20, fontWeight: '800', color: t.cores.ink, letterSpacing: -0.4 },
    explicacao: { fontSize: 14, color: t.inkMedio, lineHeight: 20, marginTop: 6 },
    ajuda: { fontSize: 12, color: t.inkFraco, lineHeight: 17 },

    campoGrande: {
      backgroundColor: t.cores.cartao,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.cores.borda,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: t.cores.ink,
      minHeight: 110,
      lineHeight: 22,
    },

    pensando: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 20 },
    textoPensando: { fontSize: 14, color: t.inkMedio },

    cartaoAviso: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      backgroundColor: t.cores.erroFundo,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.cores.erroBorda,
      padding: 14,
    },
    textoAviso: { flex: 1, fontSize: 13, color: t.cores.erroTexto, lineHeight: 19 },

    opcao: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: t.cores.cartao,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.cores.borda,
      padding: 14,
    },
    pressionada: { backgroundColor: t.cores.superficie },
    textoOpcao: { flex: 1, gap: 3 },
    nomeOpcao: { fontSize: 15, fontWeight: '700', color: t.cores.ink },
    porque: { fontSize: 12.5, color: t.inkMedio, lineHeight: 18 },

    erro: { fontSize: 13, color: t.cores.erroTexto, lineHeight: 18 },
    botao: {
      backgroundColor: t.cores.verde,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      marginTop: 10,
    },
    botaoOcupado: { opacity: 0.6 },
    textoBotao: { color: t.cores.branco, fontSize: 15, fontWeight: '800' },
    botaoTexto: { alignItems: 'center', paddingVertical: 14 },
    textoBotaoTexto: { color: t.inkMedio, fontSize: 13, fontWeight: '700' },
  }),
)
