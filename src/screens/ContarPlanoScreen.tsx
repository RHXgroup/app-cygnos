import { useEffect, useState } from 'react'
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
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ditado } from '../components/Ditado'
import { carregarPlanoAtivo } from '../lib/plano'
import { carregarIntencoes, lerIntencao, salvarIntencoes, apagarIntencao,
  type IntencaoSalva } from '../lib/intencao'
import type { Convertida, Intencao, TipoIntencao } from '../lib/intencaoDaIA'
import { estilosDe, paleta } from '../lib/tema'

/* Contar um plano: o que vai acontecer, e não o que aconteceu.
 *
 * ── Por que esta tela existe ───────────────────────────────────────────────
 * O ditado registra o passado. Isto lê o futuro: "amanhã eu almoço fora", "hoje
 * à noite eu treino", "semana que vem eu viajo". Todo aplicativo de dieta usa
 * voz para o primeiro; nenhum usa para o segundo.
 *
 * ── O que ela faz com isso ─────────────────────────────────────────────────
 * O app PARA DE COBRAR o que já foi avisado. Quem diz "amanhã eu almoço fora" e
 * mesmo assim recebe "você não anotou o almoço" aprende que falar com o app não
 * serve para nada.
 *
 * Nunca o contrário: uma intenção não cria cobrança nova. Ela só silencia.
 *
 * ── Duas camadas, e o voltar respeita as duas ──────────────────────────────
 * Contar → conferir. Sair da conferência jogaria fora uma leitura que custou
 * uma chamada paga, então o voltar volta para o texto, e só de lá sai. */

const ROTULO: Record<TipoIntencao, { icone: keyof typeof Ionicons.glyphMap; nome: string }> = {
  refeicao_fora: { icone: 'restaurant-outline', nome: 'Refeição fora' },
  refeicao_pulada: { icone: 'remove-circle-outline', nome: 'Refeição pulada' },
  treino: { icone: 'barbell-outline', nome: 'Treino' },
  viagem: { icone: 'airplane-outline', nome: 'Viagem' },
  evento: { icone: 'sparkles-outline', nome: 'Evento' },
  proposito: { icone: 'flag-outline', nome: 'Propósito' },
}

/* "2026-09-01" vira "1 de set". Sem ano: intenção vive noventa dias, e o ano
   só ocuparia espaço dizendo o óbvio. */
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function quandoEmTexto(quando: string | null, ate: string | null, hoje: string): string {
  if (quando === null) return 'daqui em diante'
  const dizer = (iso: string) => {
    const [, m, d] = iso.split('-')
    return `${Number(d)} de ${MESES[Number(m) - 1] ?? ''}`
  }
  /* "Hoje" e "amanhã" valem mais que a data: é assim que a pessoa pensa, e é o
     que ela acabou de dizer em voz alta. */
  const amanha = new Date(hoje + 'T12:00:00Z')
  amanha.setUTCDate(amanha.getUTCDate() + 1)
  const amanhaISO = amanha.toISOString().slice(0, 10)

  const inicio = quando === hoje ? 'hoje' : quando === amanhaISO ? 'amanhã' : dizer(quando)
  return ate === null ? inicio : `${inicio} até ${dizer(ate)}`
}

export function ContarPlanoScreen({
  contaId,
  onFechar,
  onSalvou,
}: {
  contaId: string
  onFechar: () => void
  onSalvou: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()

  const [fala, setFala] = useState('')
  const [pedindo, setPedindo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const [lida, setLida] = useState<Convertida | null>(null)
  const [aceitas, setAceitas] = useState<Intencao[]>([])

  const [jaTem, setJaTem] = useState<IntencaoSalva[]>([])
  /* Os rótulos do plano da pessoa, buscados AQUI e não recebidos de cima.
     São para a IA casar "almoço fora" com a refeição que ELA batizou — sem
     eles, "Refeição 2" nunca casa. Puxar isso pelo App só para repassar
     arrastaria estado por três componentes que não usam. */
  const [nomesDasRefeicoes, setNomesDasRefeicoes] = useState<string[]>([])

  const hoje = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    let vivo = true
    /* Falha em qualquer das duas não vira mensagem: são CONTEXTO. Sem o plano a
       IA usa os nomes comuns de refeição; sem a lista, a tela só não mostra o
       que já foi contado. O erro que importa é o de ler a fala. */
    void Promise.all([carregarIntencoes(contaId), carregarPlanoAtivo(contaId)]).then(
      ([rI, rP]) => {
        if (!vivo) return
        if (rI.tipo === 'ok') setJaTem(rI.intencoes)
        /* `plano` é nulo quando ela não tem nenhum — e aí os nomes ficam
           vazios, que é o certo: a IA usa "Almoço", "Jantar". */
        if (rP.tipo === 'ok' && rP.plano)
          setNomesDasRefeicoes(rP.plano.refeicoes.map(r => r.rotulo))
      },
    )
    return () => {
      vivo = false
    }
  }, [contaId])

  async function ler() {
    const texto = fala.trim()
    if (texto.length < 4) {
      setErro('Me diga o que você está planejando. Pode falar, se preferir.')
      return
    }
    setErro('')
    setPedindo(true)
    const r = await lerIntencao(texto, nomesDasRefeicoes)
    setPedindo(false)

    if (r.tipo === 'ok') {
      if (r.convertida.intencoes.length === 0) {
        /* A observação da IA diz POR QUE não entendeu — "isso já aconteceu",
           "faltou dizer quando" —, e ela vale mais que uma frase genérica
           minha. Só cai na genérica quando ela não mandou nada. */
        setErro(
          r.convertida.observacao ??
            'Não entendi nenhum plano nessa frase. Tente dizer quando é: "amanhã", "sábado".',
        )
        return
      }
      setLida(r.convertida)
      setAceitas(r.convertida.intencoes)
      return
    }
    setErro(r.mensagem)
  }

  async function salvar() {
    setSalvando(true)
    const r = await salvarIntencoes(contaId, aceitas)
    setSalvando(false)
    if (r.tipo === 'erro') {
      setErro(r.mensagem)
      return
    }
    onSalvou()
    onFechar()
  }

  async function esquecer(i: IntencaoSalva) {
    /* Some da tela na hora e volta se falhar. Esperar a rede para apagar uma
       linha faz o toque parecer que não funcionou. */
    setJaTem(atuais => atuais.filter(x => x.id !== i.id))
    const falha = await apagarIntencao(i.id)
    if (falha) {
      setJaTem(atuais => [...atuais, i].sort((a, b) => (a.quando ?? '').localeCompare(b.quando ?? '')))
      setErro(falha.erro)
    }
  }

  const voltar = () => (lida ? setLida(null) : onFechar())

  return (
    <KeyboardAvoidingView
      style={[styles.tela, { paddingTop: top + 8 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.cabecalho}>
        <Pressable
          onPress={voltar}
          style={styles.botaoVoltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela}>{lida ? 'Confira o que entendi' : 'Contar um plano'}</Text>
        <View style={styles.botaoVoltar} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.conteudo, { paddingBottom: bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {lida === null ? (
          <>
            <Text style={styles.explicacao}>
              Diga o que vai acontecer, e eu paro de cobrar o que você já avisou.
            </Text>

            <TextInput
              style={styles.campoGrande}
              value={fala}
              onChangeText={t => {
                setFala(t)
                if (erro) setErro('')
              }}
              placeholder="Ex.: amanhã eu almoço fora, e sábado tem aniversário"
              placeholderTextColor={paleta().inkFraco}
              multiline
              textAlignVertical="top"
              maxLength={500}
            />
            <View style={styles.linhaDitado}>
              <Ditado
                onTexto={t => {
                  setFala(atual => (atual.trim() ? atual.trim() + ' ' + t : t))
                  setErro('')
                }}
                onErro={setErro}
              />
            </View>

            {erro ? <Text style={styles.erro}>{erro}</Text> : null}

            <Pressable
              onPress={ler}
              disabled={pedindo}
              style={[styles.botao, pedindo && styles.botaoOcupado]}
              accessibilityRole="button"
            >
              {pedindo ? (
                <ActivityIndicator color={paleta().cores.branco} />
              ) : (
                <Text style={styles.textoBotao}>Entendi, e agora?</Text>
              )}
            </Pressable>

            {/* O que já foi contado, para a pessoa não repetir e para poder
                desfazer. Sem isto ela contaria a mesma viagem três vezes, e o
                app calaria três vezes sobre o mesmo dia. */}
            {jaTem.length > 0 ? (
              <>
                <Text style={styles.tituloSecao}>Você já me contou</Text>
                {jaTem.map(i => (
                  <View key={i.id} style={styles.linhaSalva}>
                    <Ionicons
                      name={ROTULO[i.tipo]?.icone ?? 'ellipse-outline'}
                      size={17}
                      color={paleta().cores.verde}
                    />
                    <View style={styles.textoLinha}>
                      <Text style={styles.textoIntencao}>{i.texto}</Text>
                      <Text style={styles.quando}>{quandoEmTexto(i.quando, i.ate, hoje)}</Text>
                    </View>
                    <Pressable
                      onPress={() => esquecer(i)}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={`Esquecer ${i.texto}`}
                    >
                      <Ionicons name="close" size={17} color={paleta().inkFraco} />
                    </Pressable>
                  </View>
                ))}
              </>
            ) : null}
          </>
        ) : (
          <>
            {lida.observacao ? <Text style={styles.observacao}>{lida.observacao}</Text> : null}

            {aceitas.map((i, n) => (
              <View key={n} style={styles.cartaoIntencao}>
                <Ionicons
                  name={ROTULO[i.tipo]?.icone ?? 'ellipse-outline'}
                  size={19}
                  color={paleta().cores.verde}
                />
                <View style={styles.textoLinha}>
                  <Text style={styles.textoIntencao}>{i.texto}</Text>
                  <Text style={styles.quando}>
                    {ROTULO[i.tipo]?.nome ?? ''} · {quandoEmTexto(i.quando, i.ate, hoje)}
                    {i.refeicao ? ` · ${i.refeicao}` : ''}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setAceitas(a => a.filter((_, x) => x !== n))}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Tirar ${i.texto}`}
                >
                  <Ionicons name="close" size={18} color={paleta().inkFraco} />
                </Pressable>
              </View>
            ))}

            {/* O que não deu para ler é dito, e não escondido. */}
            {lida.problemas.length > 0 ? (
              <Text style={styles.ajuda}>
                {lida.problemas.length === 1
                  ? 'Uma coisa que você disse eu não consegui encaixar.'
                  : `${lida.problemas.length} coisas que você disse eu não consegui encaixar.`}
              </Text>
            ) : null}

            {erro ? <Text style={styles.erro}>{erro}</Text> : null}

            <Pressable
              onPress={salvar}
              disabled={aceitas.length === 0 || salvando}
              style={[styles.botao, (aceitas.length === 0 || salvando) && styles.botaoOcupado]}
              accessibilityRole="button"
            >
              {salvando ? (
                <ActivityIndicator color={paleta().cores.branco} />
              ) : (
                <Text style={styles.textoBotao}>
                  {aceitas.length === 0 ? 'Você tirou tudo' : 'Está certo, guarda'}
                </Text>
              )}
            </Pressable>
            <Pressable onPress={() => setLida(null)} style={styles.botaoTexto}>
              <Text style={styles.textoBotaoTexto}>Contar de outro jeito</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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

    explicacao: { fontSize: 14, color: t.inkMedio, lineHeight: 20, marginBottom: 4 },
    ajuda: { fontSize: 12, color: t.inkFraco, lineHeight: 17 },
    tituloSecao: {
      fontSize: 12,
      fontWeight: '800',
      color: t.inkFraco,
      letterSpacing: 0.5,
      marginTop: 20,
      marginBottom: 2,
    },
    observacao: { fontSize: 13, color: t.inkMedio, lineHeight: 19, marginBottom: 4 },

    campoGrande: {
      backgroundColor: t.cores.cartao,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.cores.borda,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: t.cores.ink,
      minHeight: 130,
      lineHeight: 22,
    },
    linhaDitado: { alignItems: 'flex-start' },

    cartaoIntencao: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: t.cores.cartao,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.cores.borda,
      padding: 14,
    },
    linhaSalva: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 11,
      borderBottomWidth: 1,
      borderBottomColor: t.cores.borda,
    },
    textoLinha: { flex: 1, gap: 2 },
    textoIntencao: { fontSize: 15, color: t.cores.ink, fontWeight: '600' },
    quando: { fontSize: 12, color: t.inkFraco },

    erro: { fontSize: 13, color: t.cores.erroTexto, lineHeight: 18 },
    botao: {
      backgroundColor: t.cores.verde,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      marginTop: 12,
    },
    botaoOcupado: { opacity: 0.6 },
    textoBotao: { color: t.cores.branco, fontSize: 15, fontWeight: '800' },
    botaoTexto: { alignItems: 'center', paddingVertical: 12 },
    textoBotaoTexto: { color: t.inkMedio, fontSize: 14, fontWeight: '700' },
  }),
)
