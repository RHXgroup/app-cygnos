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
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ditado } from './Ditado'
import { estilosDe, paleta } from '../lib/tema'
import type { DiaSemana } from '../lib/plano'
import type { ExercicioNovo } from '../lib/treino'
import { lerFichaDaFoto, pedirRotina, type PedidoDeTreino } from '../lib/treinoIA'
import type { RotinaConvertida } from '../lib/rotinaDaIA'

/* Pedir a rotina de treino falando, e conferir antes de virar rotina.
 *
 * ── Duas fases, e a segunda não é enfeite ──────────────────────────────────
 * Primeiro a pessoa diz o que quer; depois LÊ o que veio, tira o que não vai
 * fazer, e só então confirma. Gravar direto criaria rotina que ninguém olhou —
 * e a IA erra: inclui exercício que a pessoa não consegue, repete grupo
 * muscular, esquece o que ela pediu. Mesma doutrina da foto do prato e do
 * plano alimentar.
 *
 * ── Por que não grava aqui ─────────────────────────────────────────────────
 * Devolve os exercícios por `onUsar`. Quem grava é a tela de treino, pelo
 * mesmo caminho de quem monta na mão — e é ela que sabe se já existe rotina e
 * o que fazer com ela.
 *
 * ── O voltar ──────────────────────────────────────────────────────────────
 * `Modal` com `onRequestClose` já atende o botão do aparelho no Android, e é
 * por isso que aqui não há `BackHandler`: o modal tem prioridade sobre ele
 * enquanto está aberto. Mas o voltar precisa descascar UMA camada — da
 * conferência de volta para o formulário, e só do formulário para fora. Sair
 * direto da conferência jogaria fora uma resposta que custou dinheiro. */

const DIAS_ROTULO: Record<DiaSemana, string> = {
  0: 'Dom', 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb',
}

const ONDE = ['Em casa', 'Na academia', 'Ao ar livre']
const EXPERIENCIA = ['Nunca treinei', 'Já treinei antes', 'Treino há bastante tempo']

/* Só dígito, e teclado sem separador — campo inteiro não aceita "1.000". */
const soDigitos = (t: string) => t.replace(/[^0-9]/g, '')

export function RotinaPorIA({
  visivel,
  perfil,
  onUsar,
  onFechar,
}: {
  visivel: boolean
  /* O que o app já sabe da pessoa. Vai junto para a IA não perguntar de novo
     o que já está no perfil. */
  perfil: { idade: number | null; genero: string | null; pesoKg: number | null }
  onUsar: (exercicios: ExercicioNovo[]) => void
  onFechar: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()

  const [pedido, setPedido] = useState('')
  const [dias, setDias] = useState(3)
  const [minutos, setMinutos] = useState('60')
  const [onde, setOnde] = useState(ONDE[0])
  const [experiencia, setExperiencia] = useState(EXPERIENCIA[0])
  const [limitacoes, setLimitacoes] = useState('')

  const [pedindo, setPedindo] = useState(false)
  const [erro, setErro] = useState('')
  const [rotina, setRotina] = useState<RotinaConvertida | null>(null)
  /* Os que a pessoa tirou na conferência, pelo par dia+ordem — o exercício
     ainda não tem id, porque ainda não existe no banco. */
  const [tirados, setTirados] = useState<Set<string>>(new Set())

  /* Fechar e reabrir tem de dar tela limpa. Sem isto, quem desiste no meio da
     conferência reabre e encontra a rotina antiga já montada. */
  useEffect(() => {
    if (!visivel) {
      setRotina(null)
      setTirados(new Set())
      setErro('')
      setPedindo(false)
    }
  }, [visivel])

  async function montar() {
    const texto = pedido.trim()
    if (texto.length < 5) {
      setErro('Me diga o que você quer treinar. Pode falar, se preferir.')
      return
    }
    setErro('')
    setPedindo(true)
    const p: PedidoDeTreino = {
      pedido: texto,
      dias,
      minutos: minutos ? Number(minutos) : null,
      onde,
      experiencia,
      limitacoes: limitacoes.trim(),
      idade: perfil.idade,
      genero: perfil.genero,
      pesoKg: perfil.pesoKg,
    }
    const r = await pedirRotina(p)
    setPedindo(false)
    if (r.tipo === 'ok') {
      setRotina(r.rotina)
      setTirados(new Set())
      return
    }
    setErro(r.mensagem)
  }

  async function importarFicha(origem: 'galeria' | 'camera') {
    setErro('')
    setPedindo(true)
    const r = await lerFichaDaFoto(origem)
    setPedindo(false)
    if (r.tipo === 'cancelado') return
    if (r.tipo === 'ok') {
      setRotina(r.rotina)
      setTirados(new Set())
      return
    }
    setErro(r.mensagem)
  }

  const chave = (e: ExercicioNovo) => `${e.dia}-${e.ordem}`

  const restantes = (rotina?.exercicios ?? []).filter(e => !tirados.has(chave(e)))

  /* Os dias que sobraram, na ordem da semana começando na segunda — que é como
     as pessoas leem uma rotina de treino, e não no domingo. */
  const ordemDaSemana: DiaSemana[] = [1, 2, 3, 4, 5, 6, 0]
  const diasComExercicio = ordemDaSemana.filter(d => restantes.some(e => e.dia === d))

  function usar() {
    /* A ordem é renumerada depois do que foi tirado: deixar buraco (0, 2, 3)
       não quebra nada hoje, mas a próxima leitura ordena por ela e o buraco
       vira pergunta sem resposta. */
    const porDia = new Map<DiaSemana, number>()
    const finais = restantes.map(e => {
      const n = porDia.get(e.dia) ?? 0
      porDia.set(e.dia, n + 1)
      return { ...e, ordem: n }
    })
    onUsar(finais)
  }

  return (
    <Modal
      visible={visivel}
      animationType="slide"
      transparent={false}
      /* Uma camada por vez: da conferência volta ao formulário; do formulário,
         sai. */
      onRequestClose={() => (rotina ? setRotina(null) : onFechar())}
    >
      <KeyboardAvoidingView
        style={[styles.tela, { paddingTop: top + 8 }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.cabecalho}>
          <Pressable
            onPress={() => (rotina ? setRotina(null) : onFechar())}
            style={styles.botaoVoltar}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
          >
            <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
          </Pressable>
          <Text style={styles.tituloTela}>{rotina ? 'Confira sua rotina' : 'Montar com IA'}</Text>
          <View style={styles.botaoVoltar} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.conteudo, { paddingBottom: bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {rotina === null ? (
            <>
              <Text style={styles.explicacao}>
                Diga o que você quer, do seu jeito. Eu monto e você confere antes de valer.
              </Text>

              {/* Vem antes do formulário de propósito: quem já tem ficha da
                  academia não deve ler seis campos para só então descobrir que
                  bastava fotografar. */}
              <View style={styles.fotoLinha}>
                <Pressable
                  onPress={() => importarFicha('camera')}
                  disabled={pedindo}
                  style={({ pressed }) => [styles.botaoFoto, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                >
                  <Ionicons name="camera-outline" size={18} color={paleta().cores.verde} />
                  <Text style={styles.textoBotaoFoto}>Fotografar ficha</Text>
                </Pressable>
                <Pressable
                  onPress={() => importarFicha('galeria')}
                  disabled={pedindo}
                  style={({ pressed }) => [styles.botaoFoto, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                >
                  <Ionicons name="image-outline" size={18} color={paleta().cores.verde} />
                  <Text style={styles.textoBotaoFoto}>Escolher print</Text>
                </Pressable>
              </View>
              <Text style={styles.ajuda}>
                Já treina com ficha da academia? Fotografe, ou mande o print do aplicativo dela.
              </Text>

              <View style={styles.divisor}>
                <View style={styles.risco} />
                <Text style={styles.textoDivisor}>ou monte comigo</Text>
                <View style={styles.risco} />
              </View>

              <Text style={styles.rotulo}>O que você quer treinar?</Text>
              <TextInput
                style={styles.campoGrande}
                value={pedido}
                onChangeText={t => {
                  setPedido(t)
                  if (erro) setErro('')
                }}
                placeholder="Ex.: quero ganhar massa nos braços e nas costas, tenho halteres em casa"
                placeholderTextColor={paleta().inkFraco}
                multiline
                textAlignVertical="top"
                maxLength={500}
              />
              <View style={styles.linhaDitado}>
                <Ditado
                  onTexto={t => {
                    setPedido(atual => (atual.trim() ? atual.trim() + ' ' + t : t))
                    setErro('')
                  }}
                  onErro={setErro}
                />
              </View>

              <Text style={styles.rotulo}>Quantos dias por semana?</Text>
              <View style={styles.fileira}>
                {[1, 2, 3, 4, 5, 6, 7].map(n => (
                  <Pressable
                    key={n}
                    onPress={() => setDias(n)}
                    style={[styles.ficha, dias === n && styles.fichaAtiva]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: dias === n }}
                  >
                    <Text style={[styles.textoFicha, dias === n && styles.textoFichaAtivo]}>{n}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.rotulo}>Quanto tempo por treino?</Text>
              <View style={styles.linhaMinutos}>
                <TextInput
                  style={styles.campoNumero}
                  value={minutos}
                  onChangeText={t => setMinutos(soDigitos(t).slice(0, 3))}
                  keyboardType="number-pad"
                  maxLength={3}
                  placeholder="60"
                  placeholderTextColor={paleta().inkFraco}
                />
                <Text style={styles.unidade}>minutos</Text>
              </View>

              <Text style={styles.rotulo}>Onde você treina?</Text>
              <View style={styles.fileira}>
                {ONDE.map(o => (
                  <Pressable
                    key={o}
                    onPress={() => setOnde(o)}
                    style={[styles.fichaLarga, onde === o && styles.fichaAtiva]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: onde === o }}
                  >
                    <Text style={[styles.textoFicha, onde === o && styles.textoFichaAtivo]}>{o}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.rotulo}>Sua experiência</Text>
              <View style={styles.fileira}>
                {EXPERIENCIA.map(e => (
                  <Pressable
                    key={e}
                    onPress={() => setExperiencia(e)}
                    style={[styles.fichaLarga, experiencia === e && styles.fichaAtiva]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: experiencia === e }}
                  >
                    <Text style={[styles.textoFicha, experiencia === e && styles.textoFichaAtivo]}>
                      {e}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Este campo não é opcional de verdade: é o único em que errar
                  machuca. Fica por último porque é o mais chato de preencher,
                  e com o texto explicando por que vale a pena. */}
              <Text style={styles.rotulo}>Alguma lesão ou limitação?</Text>
              <TextInput
                style={styles.campo}
                value={limitacoes}
                onChangeText={setLimitacoes}
                placeholder="Ex.: dor no joelho direito, cirurgia no ombro"
                placeholderTextColor={paleta().inkFraco}
                maxLength={200}
              />
              <Text style={styles.ajuda}>
                Se você contar, eu não incluo exercício que carregue essa parte.
              </Text>

              {erro ? <Text style={styles.erro}>{erro}</Text> : null}

              <Pressable
                onPress={montar}
                disabled={pedindo}
                style={[styles.botao, pedindo && styles.botaoOcupado]}
                accessibilityRole="button"
              >
                {pedindo ? (
                  <ActivityIndicator color={paleta().cores.branco} />
                ) : (
                  <Text style={styles.textoBotao}>Montar minha rotina</Text>
                )}
              </Pressable>
              {pedindo ? <Text style={styles.ajuda}>Isso leva alguns segundos.</Text> : null}
            </>
          ) : (
            <>
              {rotina.divisao ? (
                <Text style={styles.divisao}>
                  {rotina.divisao}
                  {rotina.nivel ? ` · ${rotina.nivel}` : ''}
                </Text>
              ) : null}
              {rotina.observacao ? <Text style={styles.observacao}>{rotina.observacao}</Text> : null}

              {diasComExercicio.map(d => (
                <View key={d} style={styles.cartaoDia}>
                  <Text style={styles.tituloDia}>{DIAS_ROTULO[d]}</Text>
                  {restantes
                    .filter(e => e.dia === d)
                    .map(e => (
                      <View key={chave(e)} style={styles.linhaExercicio}>
                        <View style={styles.textoExercicio}>
                          <Text style={styles.nomeExercicio}>{e.nome}</Text>
                          <Text style={styles.detalheExercicio}>
                            {[
                              e.series ? `${e.series} séries` : null,
                              e.repeticoes ? `${e.repeticoes} reps` : null,
                              e.observacao,
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'Sem detalhe'}
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => setTirados(s => new Set(s).add(chave(e)))}
                          hitSlop={10}
                          accessibilityRole="button"
                          accessibilityLabel={`Tirar ${e.nome}`}
                        >
                          <Ionicons name="close" size={18} color={paleta().inkFraco} />
                        </Pressable>
                      </View>
                    ))}
                </View>
              ))}

              {/* O que não deu para ler é dito, e não escondido. Uma rotina com
                  buraco silencioso é pior que uma que avisa. */}
              {rotina.problemas.length > 0 ? (
                <Text style={styles.ajuda}>
                  {rotina.problemas.length === 1
                    ? 'Um item da resposta não deu para aproveitar.'
                    : `${rotina.problemas.length} itens da resposta não deram para aproveitar.`}
                </Text>
              ) : null}

              <Pressable
                onPress={usar}
                disabled={restantes.length === 0}
                style={[styles.botao, restantes.length === 0 && styles.botaoOcupado]}
                accessibilityRole="button"
              >
                <Text style={styles.textoBotao}>
                  {restantes.length === 0
                    ? 'Você tirou todos'
                    : `Usar esta rotina (${restantes.length})`}
                </Text>
              </Pressable>
              <Pressable onPress={() => setRotina(null)} style={styles.botaoTexto}>
                <Text style={styles.textoBotaoTexto}>Pedir outra</Text>
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

    fotoLinha: { flexDirection: 'row', gap: 10 },
    botaoFoto: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingVertical: 13,
      borderRadius: 12,
      backgroundColor: t.cores.verdeMenta,
      borderWidth: 1,
      borderColor: t.cores.verde,
    },
    textoBotaoFoto: { fontSize: 13, fontWeight: '700', color: t.cores.verde },
    divisor: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 6 },
    risco: { flex: 1, height: 1, backgroundColor: t.cores.borda },
    textoDivisor: { fontSize: 12, color: t.inkFraco },
    explicacao: { fontSize: 14, color: t.inkMedio, lineHeight: 20, marginBottom: 4 },
    rotulo: { fontSize: 13, fontWeight: '700', color: t.cores.ink, marginTop: 10 },
    ajuda: { fontSize: 12, color: t.inkFraco, lineHeight: 17 },

    campo: {
      backgroundColor: t.cores.cartao,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.cores.borda,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: t.cores.ink,
    },
    campoGrande: {
      backgroundColor: t.cores.cartao,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.cores.borda,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: t.cores.ink,
      minHeight: 92,
    },
    linhaDitado: { alignItems: 'flex-start' },
    linhaMinutos: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    campoNumero: {
      backgroundColor: t.cores.cartao,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.cores.borda,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 16,
      color: t.cores.ink,
      width: 84,
      textAlign: 'center',
    },
    unidade: { fontSize: 14, color: t.inkMedio },

    fileira: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    ficha: {
      minWidth: 42,
      alignItems: 'center',
      paddingVertical: 9,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: t.cores.superficie,
      borderWidth: 1,
      borderColor: t.cores.borda,
    },
    fichaLarga: {
      paddingVertical: 9,
      paddingHorizontal: 14,
      borderRadius: 10,
      backgroundColor: t.cores.superficie,
      borderWidth: 1,
      borderColor: t.cores.borda,
    },
    fichaAtiva: { backgroundColor: t.cores.verdeClaro, borderColor: t.cores.verde },
    textoFicha: { fontSize: 14, color: t.inkMedio, fontWeight: '600' },
    textoFichaAtivo: { color: t.cores.ink, fontWeight: '800' },

    erro: { fontSize: 13, color: t.cores.erroTexto, lineHeight: 18 },

    botao: {
      backgroundColor: t.cores.verde,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      marginTop: 14,
    },
    botaoOcupado: { opacity: 0.6 },
    textoBotao: { color: t.cores.branco, fontSize: 15, fontWeight: '800' },
    botaoTexto: { alignItems: 'center', paddingVertical: 12 },
    textoBotaoTexto: { color: t.inkMedio, fontSize: 14, fontWeight: '700' },

    divisao: { fontSize: 17, fontWeight: '800', color: t.cores.ink },
    observacao: { fontSize: 13, color: t.inkMedio, lineHeight: 19, marginBottom: 4 },

    cartaoDia: {
      backgroundColor: t.cores.cartao,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.cores.borda,
      padding: 14,
      gap: 10,
    },
    tituloDia: { fontSize: 13, fontWeight: '800', color: t.cores.verde, letterSpacing: 0.5 },
    linhaExercicio: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    textoExercicio: { flex: 1, gap: 2 },
    nomeExercicio: { fontSize: 15, color: t.cores.ink, fontWeight: '600' },
    detalheExercicio: { fontSize: 12, color: t.inkFraco },
  }),
)
