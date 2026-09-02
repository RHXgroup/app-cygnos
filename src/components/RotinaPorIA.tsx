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
import { Ditado } from './Ditado'
import { estilosDe, paleta } from '../lib/tema'
import type { DiaSemana } from '../lib/plano'
import type { ExercicioNovo } from '../lib/treino'
import { lerFichaDaFoto, pedirRotina, type PedidoDeTreino } from '../lib/treinoIA'
import { carregarLimitacoes, salvarLimitacoes } from '../lib/limitacoes'
import {
  moverDia,
  renumerar,
  tirarDaRotina,
  type ExercicioComAlerta,
  type RotinaConvertida,
} from '../lib/rotinaDaIA'

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
  contaId,
  perfil,
  onUsar,
  onFechar,
}: {
  visivel: boolean
  contaId: string
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
  /* A limitação. Nasce do PERFIL, e volta para ele.
   *
   * Antes ela era digitada aqui, usada uma vez e esquecida quando a tela
   * fechava — e no mês seguinte tudo de novo. Pior: a ficha importada por foto
   * lê a limitação do BANCO, então o que ela escrevia neste campo não chegava
   * lá. Quem contasse do ombro e depois importasse a ficha da academia não
   * recebia aviso nenhum. */
  const [limitacoes, setLimitacoes] = useState('')

  const [pedindo, setPedindo] = useState(false)
  const [erro, setErro] = useState('')
  const [rotina, setRotina] = useState<RotinaConvertida | null>(null)
  /* A lista EDITÁVEL da conferência.
   *
   * Antes a tela só deixava TIRAR exercício, e isso não bastava por dois
   * motivos que apareceram no primeiro teste de verdade:
   *
   * O DIA vinha sempre errado na foto. Ficha de academia usa "Treino A, B, C",
   * e o prompt manda converter o primeiro bloco em segunda — então quem
   * fotografa uma ficha de um bloco só recebe tudo na segunda, toda vez. Não dá
   * para a IA adivinhar em que dia a pessoa treina; dá para a pessoa dizer, se
   * a tela deixar.
   *
   * O NOME vem errado às vezes, porque ficha é foto de letra pequena. Tirar o
   * exercício e digitar de novo na outra tela é justamente o trabalho que a
   * importação existia para poupar. */
  const [exercicios, setExercicios] = useState<ExercicioComAlerta[]>([])
  /* Qual está aberto para editar. O índice na lista, e não o objeto: o objeto
     muda a cada tecla digitada. */
  const [editando, setEditando] = useState<number | null>(null)

  /* Fechar e reabrir tem de dar tela limpa. Sem isto, quem desiste no meio da
     conferência reabre e encontra a rotina antiga já montada. */
  useEffect(() => {
    if (!visivel) {
      setRotina(null)
      setExercicios([])
      setEditando(null)
      setErro('')
      setPedindo(false)
      return
    }
    /* A limitação é a exceção do que se limpa: ela é da PESSOA, não deste
       pedido, e vem do perfil toda vez que a folha abre. */
    let vivo = true
    void carregarLimitacoes(contaId).then(r => {
      if (vivo && r.tipo === 'ok' && r.limitacoes) setLimitacoes(r.limitacoes)
    })
    return () => {
      vivo = false
    }
  }, [visivel, contaId])

  /* Guarda antes de chamar a IA, e não depois.
   *
   * A leitura da ficha por foto lê a limitação do BANCO — é lá que ela é regra,
   * e não no corpo da requisição, para o chamador não escolher a própria regra
   * de segurança. Então o que ela acabou de digitar precisa estar gravado ANTES
   * da chamada, ou a foto sai sem aviso nenhum.
   *
   * A falha é engolida de propósito: não gravar o perfil não é motivo para
   * recusar montar o treino, e a rotina gerada leva a limitação no pedido de
   * qualquer jeito. */
  async function guardarLimitacao() {
    await salvarLimitacoes(contaId, limitacoes)
  }

  async function montar() {
    const texto = pedido.trim()
    if (texto.length < 5) {
      setErro('Me diga o que você quer treinar. Pode falar, se preferir.')
      return
    }
    setErro('')
    setPedindo(true)
    await guardarLimitacao()
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
      setExercicios(r.rotina.exercicios)
      return
    }
    setErro(r.mensagem)
  }

  async function importarFicha(origem: 'galeria' | 'camera') {
    setErro('')
    /* Antes de abrir a câmera: a função da foto lê a limitação do banco, e
       gravá-la depois seria gravar tarde demais. */
    await guardarLimitacao()
    setPedindo(true)
    const r = await lerFichaDaFoto(origem)
    setPedindo(false)
    if (r.tipo === 'cancelado') return
    if (r.tipo === 'ok') {
      setRotina(r.rotina)
      setExercicios(r.rotina.exercicios)
      return
    }
    setErro(r.mensagem)
  }

  /* Os dias na ordem da semana começando na SEGUNDA, que é como se lê uma
     rotina de treino — e não no domingo, que é como o `Date` numera. */
  const ordemDaSemana: DiaSemana[] = [1, 2, 3, 4, 5, 6, 0]
  const diasComExercicio = ordemDaSemana.filter(d => exercicios.some(e => e.dia === d))

  /* Estas três vêm de `rotinaDaIA`, e não são escritas aqui.
   *
   * Elas decidem em que dia cada exercício cai e em que ordem ele aparece — os
   * dois lugares onde erro passa calado, porque uma rotina no dia errado parece
   * uma rotina. Lá elas são exercitadas com 15 casos, incluindo a ficha "Treino
   * A / Treino B" que caiu toda na segunda. Aqui dentro não daria. */
  const tirar = (i: number) => {
    setExercicios(atuais => tirarDaRotina(atuais, i))
    setEditando(null)
  }

  const mudar = (i: number, campos: Partial<ExercicioNovo>) =>
    setExercicios(atuais => atuais.map((e, n) => (n === i ? { ...e, ...campos } : e)))

  const usar = () => onUsar(renumerar(exercicios))

  return (
    <Modal
      visible={visivel}
      animationType="slide"
      transparent={false}
      /* Uma camada por vez: da conferência volta ao formulário; do formulário,
         sai. */
      /* TRÊS camadas, e não duas. A conferência ganhou um editor de exercício
         depois, e o voltar continuou pulando ele: quem abria o editor e apertava
         voltar perdia a rotina inteira, que tinha custado uma chamada paga.
         Regra 1 do projeto — descascar UMA por vez. */
      onRequestClose={() => {
        if (editando !== null) setEditando(null)
        else if (rotina) setRotina(null)
        else onFechar()
      }}
    >
      <KeyboardAvoidingView
        style={[styles.tela, { paddingTop: top + 8 }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.cabecalho}>
          <Pressable
            onPress={() => {
              if (editando !== null) setEditando(null)
              else if (rotina) setRotina(null)
              else onFechar()
            }}
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

              {/* ── O ATALHO de quem já tem ficha, e por que ele encolheu ──
               *
               * Isto eram DOIS BOTÕES GRANDES, no topo, antes do formulário. O
               * argumento era bom no papel: quem já treina com ficha da
               * academia não deveria ler seis campos para só então descobrir
               * que bastava fotografar.
               *
               * No aparelho deu o contrário. Os dois botões ocupavam a primeira
               * tela inteira, o formulário ficava abaixo da dobra, e a tela
               * passava a mensagem de que a IA só sabe LER FICHA — que é
               * justamente o oposto do que ela faz. Quem queria pedir "CrossFit,
               * quatro dias, em casa, tenho lesão no ombro" concluía que não
               * dava, e saía.
               *
               * Continua no topo, porque é onde quem tem ficha procura. Mas
               * como UMA linha discreta: atalho tem tamanho de atalho, e o
               * caminho principal é o que tem de ocupar a tela. */}
              <View style={styles.atalhoFicha}>
                <Text style={styles.textoAtalho}>Já tem ficha da academia?</Text>
                <Pressable
                  onPress={() => importarFicha('camera')}
                  disabled={pedindo}
                  hitSlop={8}
                  style={({ pressed }) => pressed && { opacity: 0.6 }}
                  accessibilityRole="button"
                  accessibilityLabel="Fotografar a ficha da academia"
                >
                  <Text style={styles.linkAtalho}>Fotografar</Text>
                </Pressable>
                <Text style={styles.textoAtalho}>·</Text>
                <Pressable
                  onPress={() => importarFicha('galeria')}
                  disabled={pedindo}
                  hitSlop={8}
                  style={({ pressed }) => pressed && { opacity: 0.6 }}
                  accessibilityRole="button"
                  accessibilityLabel="Escolher um print da ficha na galeria"
                >
                  <Text style={styles.linkAtalho}>Usar um print</Text>
                </Pressable>
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
                maxLength={500}
              />
              <Text style={styles.ajuda}>
                Eu guardo isso no seu perfil e uso em todo treino — inclusive para avisar quando a
                ficha que você importar tiver exercício que carregue essa parte.
              </Text>

              {pedindo ? (
                /* Ler a ficha leva de cinco a quinze segundos, e sem isto a tela
                   fica parada depois que a câmera fecha — a pessoa acha que
                   não funcionou e toca de novo, gastando outra chamada. */
                <View style={styles.lendo}>
                  <ActivityIndicator color={paleta().cores.verde} />
                  <Text style={styles.textoLendo}>Lendo a ficha…</Text>
                </View>
              ) : null}

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

              <Text style={styles.ajuda}>
                Toque num exercício para corrigir o nome ou as séries. Toque no dia para mudar a
                semana inteira do bloco.
              </Text>

              {diasComExercicio.map(d => (
                <View key={d} style={styles.cartaoDia}>
                  {/* O DIA é editável, e é a correção mais importante desta
                      tela. Ficha de academia se chama "Treino A", não "segunda"
                      — a IA converte o primeiro bloco em segunda porque precisa
                      escolher algum, e quem sabe em que dia treina é a pessoa. */}
                  <View style={styles.fileiraDias}>
                    {ordemDaSemana.map(alvo => (
                      <Pressable
                        key={alvo}
                        onPress={() => setExercicios(atuais => moverDia(atuais, d, alvo))}
                        style={[styles.diaChip, alvo === d && styles.diaChipAtivo]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: alvo === d }}
                        accessibilityLabel={`Mover para ${DIAS_ROTULO[alvo]}`}
                      >
                        <Text style={[styles.textoDiaChip, alvo === d && styles.textoDiaChipAtivo]}>
                          {DIAS_ROTULO[alvo]}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {exercicios.map((e, i) =>
                    e.dia !== d ? null : editando === i ? (
                      <View key={i} style={styles.editor}>
                        <TextInput
                          style={styles.campoEditor}
                          value={e.nome}
                          onChangeText={nome => mudar(i, { nome })}
                          placeholder="Nome do exercício"
                          placeholderTextColor={paleta().inkFraco}
                          maxLength={60}
                          autoFocus
                        />
                        <View style={styles.linhaEditor}>
                          <TextInput
                            style={styles.campoPequeno}
                            value={e.series === null ? '' : String(e.series)}
                            onChangeText={s => {
                              const n = Number(soDigitos(s).slice(0, 2))
                              mudar(i, { series: n > 0 ? n : null })
                            }}
                            keyboardType="number-pad"
                            placeholder="Séries"
                            placeholderTextColor={paleta().inkFraco}
                          />
                          <TextInput
                            style={styles.campoMedio}
                            value={e.repeticoes ?? ''}
                            onChangeText={repeticoes => mudar(i, { repeticoes: repeticoes || null })}
                            placeholder="Reps (8-12)"
                            placeholderTextColor={paleta().inkFraco}
                            maxLength={20}
                          />
                        </View>
                        <View style={styles.linhaEditor}>
                          <Pressable
                            onPress={() => tirar(i)}
                            style={styles.botaoTirar}
                            accessibilityRole="button"
                          >
                            <Ionicons name="trash-outline" size={15} color={paleta().cores.erroTexto} />
                            <Text style={styles.textoTirar}>Tirar</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => setEditando(null)}
                            style={styles.botaoPronto}
                            accessibilityRole="button"
                          >
                            <Text style={styles.textoPronto}>Pronto</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <Pressable
                        key={i}
                        onPress={() => setEditando(i)}
                        style={({ pressed }) => [styles.linhaExercicio, pressed && { opacity: 0.6 }]}
                        accessibilityRole="button"
                        accessibilityLabel={`Editar ${e.nome}`}
                      >
                        <View style={styles.textoExercicio}>
                          <Text style={styles.nomeExercicio}>{e.nome}</Text>
                          <Text style={styles.detalheExercicio}>
                            {[
                              e.series ? `${e.series} séries` : null,
                              e.repeticoes ? `${e.repeticoes} reps` : null,
                              e.observacao,
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'Toque para completar'}
                          </Text>
                          {/* O aviso da limitação. Ele APONTA e não muda nada:
                              a ficha foi montada por alguém, e a pessoa decidiu
                              usá-la — reescrever a prescrição de outro
                              profissional em silêncio seria o app se achar dono
                              de um treino que não é dele. Ela lê, e decide se
                              troca, pula, ou fala com quem montou. */}
                          {e.alerta && (
                            <View style={styles.linhaAlerta}>
                              <Ionicons
                                name="alert-circle-outline"
                                size={13}
                                color={paleta().cores.erroTexto}
                              />
                              <Text style={styles.textoAlerta}>{e.alerta}</Text>
                            </View>
                          )}
                        </View>
                        <Ionicons name="create-outline" size={17} color={paleta().inkFraco} />
                      </Pressable>
                    ),
                  )}
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
                disabled={exercicios.length === 0}
                style={[styles.botao, exercicios.length === 0 && styles.botaoOcupado]}
                accessibilityRole="button"
              >
                <Text style={styles.textoBotao}>
                  {exercicios.length === 0
                    ? 'Você tirou todos'
                    : `Usar esta rotina (${exercicios.length})`}
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

    atalhoFicha: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  textoAtalho: { fontSize: 12.5, color: t.inkMedio },
  linkAtalho: { fontSize: 12.5, fontWeight: '700', color: t.cores.verde },

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
      fontSize: 16,
      color: t.cores.ink,
      minHeight: 48,
    },
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
    lendo: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
    textoLendo: { fontSize: 14, color: t.inkMedio },

    fileiraDias: { flexDirection: 'row', gap: 4, marginBottom: 4 },
    diaChip: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 7,
      borderRadius: 8,
      backgroundColor: t.cores.superficie,
    },
    diaChipAtivo: { backgroundColor: t.cores.verde },
    textoDiaChip: { fontSize: 11, fontWeight: '700', color: t.inkFraco },
    textoDiaChipAtivo: { color: t.cores.branco },

    editor: {
      gap: 8,
      backgroundColor: t.cores.superficie,
      borderRadius: 10,
      padding: 10,
    },
    campoEditor: {
      backgroundColor: t.cores.cartao,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: t.cores.borda,
      paddingHorizontal: 12,
      minHeight: 46,
      fontSize: 15,
      color: t.cores.ink,
    },
    linhaEditor: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    campoPequeno: {
      width: 84,
      backgroundColor: t.cores.cartao,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: t.cores.borda,
      paddingHorizontal: 12,
      minHeight: 44,
      fontSize: 15,
      color: t.cores.ink,
      textAlign: 'center',
    },
    campoMedio: {
      flex: 1,
      backgroundColor: t.cores.cartao,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: t.cores.borda,
      paddingHorizontal: 12,
      minHeight: 44,
      fontSize: 15,
      color: t.cores.ink,
    },
    botaoTirar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
    textoTirar: { fontSize: 13, fontWeight: '700', color: t.cores.erroTexto },
    botaoPronto: {
      marginLeft: 'auto',
      paddingHorizontal: 18,
      paddingVertical: 9,
      borderRadius: 9,
      backgroundColor: t.cores.verde,
    },
    textoPronto: { fontSize: 13, fontWeight: '800', color: t.cores.branco },
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
    linhaAlerta: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 4 },
    textoAlerta: { flex: 1, fontSize: 11.5, color: t.cores.erroTexto, lineHeight: 16 },
  }),
)
