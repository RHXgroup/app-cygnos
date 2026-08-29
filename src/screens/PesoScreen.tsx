import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BarraDesfazer, useApagarComDesfazer } from '../components/Desfazer'
import { MiniGrafico } from '../components/MiniGrafico'
import {
  KG_MAX,
  KG_MIN,
  apagarRegistroPeso,
  carregarPeso,
  evolucaoDe,
  kg,
  registrarPeso,
  ritmoSemanal,
  serieDe,
  variacaoEmKg,
  type Evolucao,
  type RegistroPeso,
} from '../lib/peso'
import {
  NOME_DO_OBJETIVO,
  carregarObjetivoPeso,
  seguindoOFoco,
  type ObjetivoPeso,
} from '../lib/metas'
import { dataISO, dataNumerica } from '../lib/formatar'
import { estilosDe, paleta } from '../lib/tema'

const MARGEM = 20
const PADDING_CARTAO = 16

/* Peso: um número por dia, e a comparação sempre contra o primeiro.
 *
 * A tela não tem meta de peso e não diz se subir é bom ou ruim. Quem ganha massa
 * e quem emagrece usam esta mesma tela, e pintar a perda de verde transformaria
 * o objetivo de metade das pessoas em fracasso visual. O que ela faz é dizer o
 * fato — subiu, desceu, ficou — e mostrar a curva. */
export function PesoScreen({
  contaId,
  onFechar,
  onMudou,
}: {
  contaId: string
  onFechar: () => void
  /* A tela inicial mostra a mesma evolução; avisado ao fechar, e não a cada
     registro, para não refazer a busca da Home a cada tecla. */
  onMudou: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const { width: larguraTela } = useWindowDimensions()
  const [registros, setRegistros] = useState<RegistroPeso[] | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [mudou, setMudou] = useState(false)
  const [texto, setTexto] = useState('')
  const [objetivo, setObjetivo] = useState<ObjetivoPeso>(null)

  /* O foco vem de app_contas, definido na tela de Perfil. Efeito separado e sem
     mexer no `carregando`: um campo só não pode segurar a tela inteira. */
  useEffect(() => {
    let ativo = true

    carregarObjetivoPeso(contaId).then(r => {
      if (ativo && r.tipo === 'ok') setObjetivo(r.objetivo)
    })

    return () => {
      ativo = false
    }
  }, [contaId])

  useEffect(() => {
    let ativo = true

    carregarPeso(contaId).then(r => {
      if (!ativo) return

      if (r.tipo === 'erro') setErro(r.mensagem)
      else {
        setErro('')
        setRegistros(r.peso.registros)
      }
      setCarregando(false)
    })

    return () => {
      ativo = false
    }
  }, [contaId])

  const hoje = dataISO(new Date())
  const deHoje = registros?.find(r => r.data === hoje) ?? null

  /* O campo nasce com o peso de hoje quando ele já existe: a tela abre mostrando
     o que está gravado, e quem só quer conferir não precisa digitar nada. */
  useEffect(() => {
    if (deHoje) setTexto(kg(deHoje.kg))
  }, [deHoje?.id, deHoje?.kg])

  const numero = Number(texto.trim().replace(',', '.'))
  const valido = texto.trim() !== '' && Number.isFinite(numero) && numero >= KG_MIN && numero <= KG_MAX

  function fechar() {
    if (mudou) onMudou()
    onFechar()
  }

  async function registrar() {
    if (!valido) return

    setSalvando(true)
    setErro('')
    Keyboard.dismiss()

    const r = await registrarPeso(contaId, numero)
    setSalvando(false)

    if (r.tipo === 'erro') {
      setErro(r.mensagem)
      return
    }

    setMudou(true)
    /* A linha do dia é substituída, não acrescentada: é o mesmo dia, e o banco
       fez upsert. Sem o filtro, pesar duas vezes hoje deixaria duas linhas de
       hoje na tela até a próxima abertura. */
    setRegistros(atuais => [r.registro, ...(atuais ?? []).filter(x => x.data !== r.registro.data)])
  }

  /* Apagar com cinco segundos de volta.
   *
   * Aqui o prazo importa mais do que no diário de comida: um peso apagado por
   * engano não se recupera de memória. Ninguém lembra o que a balança marcou na
   * terça de três semanas atrás, e a linha do gráfico fica com um buraco que
   * não tem como preencher. */
  const { apagar, desfazer, desfazivel } = useApagarComDesfazer<RegistroPeso>({
    remover: registro => {
      setRegistros(atuais => (atuais ?? []).filter(x => x.id !== registro.id))
      /* Apagou o de hoje: o campo volta a ficar em branco, senão ele continuaria
         mostrando um número que já não existe em lugar nenhum. */
      if (registro.data === hoje) setTexto('')
    },
    restaurar: registro => {
      setRegistros(atuais =>
        [...(atuais ?? []), registro].sort((a, b) => b.data.localeCompare(a.data)),
      )
      /* Voltou o de hoje: o campo volta a mostrá-lo, senão ficaria vazio ao
         lado de um registro que existe. */
      if (registro.data === hoje) setTexto(String(registro.kg).replace('.', ','))
    },
    apagarDeVerdade: registro => apagarRegistroPeso(registro.id),
    aoFalhar: setErro,
    aoMudar: () => {
      setErro('')
      setMudou(true)
    },
  })

  const evolucao = registros ? evolucaoDe(registros) : null
  const ritmo = registros ? ritmoSemanal(registros) : null

  const larguraGrafico = larguraTela - MARGEM * 2 - PADDING_CARTAO * 2

  return (
    <KeyboardAvoidingView
      style={[styles.tela, { paddingTop: top + 8 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.cabecalho}>
        <Pressable
          onPress={fechar}
          style={styles.botaoVoltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela}>Peso</Text>
        <View style={styles.botaoVoltar} />
      </View>

      {carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator color={paleta().cores.verde} />
        </View>
      ) : !registros ? (
        <View style={styles.conteudoErro}>
          <View style={styles.blocoErro}>
            <Text style={styles.tituloErro}>Não foi possível carregar</Text>
            <Text style={styles.detalheErro}>{erro}</Text>
          </View>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.conteudo, { paddingBottom: Math.max(bottom, 16) + 16 }]}
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <CartaoEvolucao evolucao={evolucao} objetivo={objetivo} />

          {/* Registrar vem logo abaixo do resumo e acima do histórico: é o que a
              pessoa veio fazer, e enterrá-lo depois da lista o poria fora da
              tela para quem já tem trinta pesagens. */}
          <View style={styles.bloco}>
            <Text style={styles.tituloBloco}>
              {deHoje ? 'Seu peso de hoje' : 'Quanto a balança marcou hoje?'}
            </Text>

            <View style={styles.linhaCampo}>
              <TextInput
                value={texto}
                /* Vírgula passa porque o teclado brasileiro oferece vírgula, e
                   peso é decimal por natureza. A conversão trata as duas. */
                onChangeText={t => setTexto(t.replace(/[^0-9.,]/g, ''))}
                keyboardType="decimal-pad"
                placeholder="72,4"
                placeholderTextColor={paleta().inkFraco}
                keyboardAppearance="dark"
                maxLength={6}
                style={[styles.campo, texto.trim() !== '' && !valido && styles.campoComErro]}
                accessibilityLabel="Peso em quilos"
              />
              <Text style={styles.unidadeCampo}>kg</Text>

              <Pressable
                onPress={registrar}
                disabled={!valido || salvando}
                style={({ pressed }) => [
                  styles.botaoRegistrar,
                  (!valido || salvando) && styles.botaoDesligado,
                  pressed && styles.botaoRegistrarPressionado,
                ]}
                accessibilityRole="button"
                accessibilityLabel={deHoje ? 'Atualizar o peso de hoje' : 'Registrar o peso de hoje'}
              >
                {salvando ? (
                  <ActivityIndicator color={paleta().cores.branco} size="small" />
                ) : (
                  <Ionicons name={deHoje ? 'refresh' : 'add'} size={20} color={paleta().cores.branco} />
                )}
              </Pressable>
            </View>

            <Text style={styles.ajuda}>
              {texto.trim() !== '' && !valido
                ? `O peso precisa estar entre ${KG_MIN} e ${KG_MAX} kg.`
                : deHoje
                  ? 'Pesar de novo hoje corrige o registro do dia — não cria outro.'
                  : 'Um peso por dia. Pese sempre no mesmo horário, para os números serem comparáveis.'}
            </Text>
          </View>

          {!!erro && (
            <View style={styles.blocoErro}>
              <Text style={styles.tituloErro}>Não foi possível salvar</Text>
              {/* A mensagem crua junto: sem ela, "sem internet" e "migração não
                  aplicada" viram o mesmo aviso. */}
              <Text style={styles.detalheErro}>{erro}</Text>
            </View>
          )}

          {registros.length >= 2 && (
            <View style={styles.bloco}>
              <Text style={styles.tituloBloco}>Sua curva</Text>
              <MiniGrafico serie={serieDe(registros)} largura={larguraGrafico} altura={90} />
              <Text style={styles.ajuda}>
                Os últimos {Math.min(registros.length, 30)} registros, do mais antigo para o mais
                recente.
              </Text>

              {/* O ritmo é o que faz a variação querer dizer alguma coisa:
                  "perdeu 2,3 kg" é uma frase diferente em três semanas e em oito
                  meses, e o cartão de cima diz a mesma para as duas.

                  Sem julgamento junto. Se o ritmo é saudável, rápido ou lento é
                  conversa com a nutricionista — o app mede. */}
              {ritmo !== null && (
                <View style={styles.linhaRitmo}>
                  <Ionicons
                    name={
                      Math.abs(ritmo) < 0.05
                        ? 'remove-outline'
                        : ritmo > 0
                          ? 'trending-up-outline'
                          : 'trending-down-outline'
                    }
                    size={15}
                    color={paleta().cores.limao}
                  />
                  <Text style={styles.textoRitmo}>
                    {Math.abs(ritmo) < 0.05
                      ? 'Estável no período'
                      : `${variacaoEmKg(ritmo)} kg por semana, em média`}
                  </Text>
                </View>
              )}
            </View>
          )}

          <Historico registros={registros} onApagar={apagar} />
        </ScrollView>
      )}

      {desfazivel && (
        <BarraDesfazer
          texto={`Registro de ${kg(desfazivel.kg)} kg apagado`}
          onDesfazer={desfazer}
          bottom={bottom + 16}
        />
      )}
    </KeyboardAvoidingView>
  )
}

/* O resumo: peso de hoje e a distância até o primeiro.
 *
 * A variação vem escrita por extenso — "você perdeu 2,3 kg" — e não como "−2,3".
 * O sinal de menos é o caractere mais fácil de ler errado numa tela de celular,
 * e a diferença entre perder e ganhar dois quilos não pode depender de um traço
 * de três pixels. */
function CartaoEvolucao({
  evolucao,
  objetivo,
}: {
  evolucao: Evolucao | null
  objetivo: ObjetivoPeso
}) {
  const styles = estilos()
  if (!evolucao) {
    return (
      <View style={styles.cartaoVazio}>
        <View style={styles.iconeVazio}>
          <Ionicons name="speedometer-outline" size={24} color={paleta().cores.verde} />
        </View>
        <Text style={styles.chamadaVazio}>Seu primeiro peso</Text>
        <Text style={styles.textoVazio}>
          O peso que você registrar agora vira o ponto de partida. Daqui em diante, o app compara
          todos os outros com ele.
        </Text>
      </View>
    )
  }

  const [ano, mes, dia] = evolucao.dataInicial.split('-').map(Number)
  const desde = dataNumerica(new Date(ano, mes - 1, dia))

  return (
    <View style={styles.cartaoDia}>
      <View style={styles.linhaTituloDia}>
        <Ionicons name="speedometer-outline" size={16} color={paleta().cores.branco} />
        <Text style={styles.tituloDia}>Peso atual</Text>
      </View>

      <View style={styles.linhaValorDia}>
        <Text style={styles.valorDia}>{kg(evolucao.atual)}</Text>
        <Text style={styles.unidadeDia}>kg</Text>
      </View>

      {evolucao.quantos === 1 ? (
        <Text style={styles.rodapeDia}>
          Este é o seu ponto de partida. No próximo registro, a evolução aparece aqui.
        </Text>
      ) : (
        <>
          <View style={styles.selo}>
            <Ionicons
              name={
                evolucao.sentido === 'manteve'
                  ? 'remove'
                  : evolucao.sentido === 'ganho'
                    ? 'arrow-up'
                    : 'arrow-down'
              }
              size={14}
              color={paleta().cores.branco}
            />
            <Text style={styles.textoSelo}>
              {evolucao.sentido === 'manteve'
                ? 'Sem mudança'
                : `${evolucao.sentido === 'ganho' ? 'Ganhou' : 'Perdeu'} ${variacaoEmKg(evolucao.variacao)} kg`}
            </Text>
          </View>

          <Text style={styles.rodapeDia}>
            Desde {desde}, quando você começou com {kg(evolucao.inicial)} kg.
            {/* O foco só entra na frase quando foi declarado. Sem ele o cartão
                diz o fato e cala — que é o que ele fazia antes de a coluna
                existir, e continua sendo o certo para quem não quis dizer. */}
            {objetivo !== null && ` Seu foco é ${NOME_DO_OBJETIVO[objetivo].toLowerCase()}.`}
          </Text>

          {/* A leitura de direção, e não de mérito: "no sentido do seu foco" ou
              "no sentido contrário". Nada de parabéns nem de bronca — o app não
              sabe o que aconteceu na vida de quem está lendo. */}
          {seguindoOFoco(objetivo, evolucao.sentido) !== null && (
            <View style={styles.linhaFoco}>
              <Ionicons
                name={
                  seguindoOFoco(objetivo, evolucao.sentido) ? 'checkmark-circle' : 'information-circle'
                }
                size={15}
                color={paleta().cores.branco}
              />
              <Text style={styles.textoFoco}>
                {seguindoOFoco(objetivo, evolucao.sentido)
                  ? 'Indo no sentido do seu foco.'
                  : 'Indo no sentido contrário ao seu foco.'}
              </Text>
            </View>
          )}
        </>
      )}
    </View>
  )
}

function Historico({
  registros,
  onApagar,
}: {
  registros: RegistroPeso[]
  onApagar: (r: RegistroPeso) => void
}) {
  const styles = estilos()
  if (registros.length === 0) return null

  /* Qual linha é a régua. Calculado aqui e não presumido como a última da lista:
     a lista vem ordenada por data, mas depender dessa ordem faria esta marca
     mentir no dia em que alguém mudasse a consulta. */
  const idInicial = registros.reduce((a, b) => (a.data <= b.data ? a : b)).id

  return (
    <View style={styles.bloco}>
      <View style={styles.linhaTituloBloco}>
        <Text style={styles.tituloBloco}>Histórico</Text>
        <Text style={styles.contagemBloco}>
          {registros.length} {registros.length === 1 ? 'registro' : 'registros'}
        </Text>
      </View>

      {registros.map(r => {
        const [ano, mes, dia] = r.data.split('-').map(Number)
        const inicial = r.id === idInicial

        return (
          <View key={r.id} style={styles.linhaRegistro}>
            <Text style={styles.dataRegistro}>{dataNumerica(new Date(ano, mes - 1, dia))}</Text>

            {/* O selo torna visível de onde sai a conta da tela inicial. Sem ele,
                a régua seria uma regra invisível — e apagar essa linha mudaria
                todos os números da Home sem explicação nenhuma. */}
            {inicial && (
              <View style={styles.seloInicial}>
                <Text style={styles.textoSeloInicial}>Início</Text>
              </View>
            )}

            <Text style={styles.kgRegistro}>{kg(r.kg)} kg</Text>

            <Pressable
              onPress={() => onApagar(r)}
              hitSlop={10}
              style={({ pressed }) => [styles.apagar, pressed && styles.apagarPressionado]}
              accessibilityRole="button"
              accessibilityLabel={`Apagar o registro de ${kg(r.kg)} quilos`}
            >
              <Ionicons name="close" size={16} color={paleta().inkFraco} />
            </Pressable>
          </View>
        )
      })}

      {registros.length >= 2 && (
        <Text style={styles.ajuda}>
          Apagar o registro marcado como "Início" faz o seguinte mais antigo virar o ponto de
          partida — e a sua evolução é recalculada a partir dele.
        </Text>
      )}
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
  tela: { flex: 1, backgroundColor: t.cores.fundo },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  botaoVoltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  tituloTela: { flexShrink: 1, fontSize: 17, fontWeight: '800', color: t.cores.ink },

  conteudo: { paddingHorizontal: MARGEM, paddingTop: 8, gap: 14 },
  conteudoErro: { paddingHorizontal: MARGEM, paddingTop: 8 },

  blocoErro: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.cores.erroBorda,
    backgroundColor: t.cores.erroFundo,
  },
  tituloErro: { fontSize: 13.5, fontWeight: '700', color: t.cores.erroTexto },
  detalheErro: { marginTop: 5, fontSize: 12.5, lineHeight: 18, color: t.cores.erroTexto },

  /* ── Resumo ── */
  cartaoDia: { borderRadius: 20, backgroundColor: t.cores.verde, padding: 18 },
  linhaTituloDia: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  tituloDia: { flex: 1, fontSize: 15, fontWeight: '700', color: t.cores.branco },
  linhaValorDia: { flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 8 },
  valorDia: { fontSize: 40, fontWeight: '800', color: t.cores.branco, letterSpacing: -1.4 },
  unidadeDia: { fontSize: 15, fontWeight: '700', color: t.cores.branco },
  /* Branco translúcido, e não uma cor de "bom" ou "ruim": ganhar peso é o
     objetivo de parte de quem usa isto, e verde para perda e vermelho para ganho
     transformaria a meta de metade das pessoas em alarme. */
  selo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  textoSelo: { fontSize: 13, fontWeight: '800', color: t.cores.branco },
  rodapeDia: { marginTop: 10, fontSize: 12.5, lineHeight: 18, color: 'rgba(255,255,255,0.9)' },
  linhaFoco: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  textoFoco: { flex: 1, fontSize: 12.5, fontWeight: '700', color: t.cores.branco },

  cartaoVazio: {
    borderRadius: 20,
    backgroundColor: t.cores.cartao,
    borderWidth: 1,
    borderColor: t.cores.borda,
    padding: 18,
  },
  iconeVazio: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: t.cores.verdeClaro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chamadaVazio: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: '800',
    color: t.cores.ink,
    letterSpacing: -0.3,
  },
  textoVazio: { marginTop: 5, fontSize: 13, lineHeight: 19, color: t.inkSuave },

  /* ── Blocos ── */
  bloco: {
    padding: PADDING_CARTAO,
    borderRadius: 20,
    backgroundColor: t.cores.cartao,
    borderWidth: 1,
    borderColor: t.cores.borda,
    gap: 10,
  },
  linhaTituloBloco: { flexDirection: 'row', alignItems: 'center', gap: 8 },
linhaRitmo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: t.cores.borda,
  },
  textoRitmo: { fontSize: 13, fontWeight: '600', color: t.cores.ink },
    tituloBloco: { flex: 1, fontSize: 15, fontWeight: '800', color: t.cores.ink },
  contagemBloco: { fontSize: 11.5, fontWeight: '600', color: t.inkSuave },
  ajuda: { fontSize: 11.5, lineHeight: 16, color: t.inkFraco },

  linhaCampo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  campo: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.borda,
    backgroundColor: t.cores.superficie,
    paddingHorizontal: 16,
    /* 16 é o mínimo que o iOS aceita sem dar zoom automático no campo. */
    fontSize: 19,
    fontWeight: '700',
    color: t.cores.ink,
  },
  campoComErro: { borderColor: t.cores.erroBorda, backgroundColor: t.cores.erroFundo },
  unidadeCampo: { fontSize: 13, fontWeight: '700', color: t.inkMedio },
  botaoRegistrar: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.cores.verde,
  },
  botaoRegistrarPressionado: { backgroundColor: t.cores.verdeEscuro },
  botaoDesligado: { backgroundColor: t.cores.trilho },

  linhaRegistro: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dataRegistro: { fontSize: 13.5, color: t.inkMedio },
  seloInicial: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: t.cores.verdeClaro,
  },
  textoSeloInicial: { fontSize: 10.5, fontWeight: '800', color: t.cores.verdeEscuro },
  kgRegistro: { flex: 1, textAlign: 'right', fontSize: 14.5, fontWeight: '800', color: t.cores.ink },
  apagar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  apagarPressionado: { backgroundColor: t.cores.trilho },
  }),
)
