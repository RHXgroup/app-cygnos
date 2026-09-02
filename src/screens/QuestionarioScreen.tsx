import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { RASCUNHO, apagarRascunho, guardarRascunho, lerRascunho } from '../lib/rascunho'
import { carregarQuestionario, responderQuestionario, type Questionario } from '../lib/questionario'
import {
  ALERGENOS,
  ehCustom,
  ehOutroDoObjetivo,
  idCustom,
  nomeDoAlergeno,
  quantasPerguntas,
  quantasRespondidas,
  secoesVisiveis,
  vazioDoModelo,
  type Campo,
  type Respostas,
  type Secao,
} from '../lib/questionarioDaNutri'
import { estilosDe, paleta } from '../lib/tema'

/* Responder o questionário que a nutricionista mandou, sem sair do app.
 *
 * ── O que existia antes ───────────────────────────────────────────────────
 * Um link por WhatsApp. Que se perde na conversa, some quando o telefone troca,
 * e a nutricionista acaba perguntando tudo de novo na consulta — que é
 * exatamente o tempo que o questionário existia para poupar.
 *
 * ── Nada é obrigatório ────────────────────────────────────────────────────
 * Do lado dela também não é, e a razão é a mesma: o objetivo é a pessoa
 * TERMINAR. Um campo obrigatório no meio de trinta perguntas é onde alguém fecha
 * o app e não volta — e meia anamnese respondida vale muito mais do que nenhuma.
 *
 * ── Uma seção por vez ─────────────────────────────────────────────────────
 * Trinta perguntas numa rolagem só é uma parede. Por seção, cada tela tem quatro
 * ou cinco, e a barra em cima diz quanto falta — que é a informação que decide
 * entre continuar e desistir. */

/* Quanto tempo o que ela respondeu continua valendo para retomar.
 *
 * Uma semana. Ao contrário do treino, aqui parar no meio e voltar dias depois é
 * o uso NORMAL: são trinta perguntas, e ninguém responde tudo na fila do
 * mercado. O que se perde ao guardar demais é quase nada; o que se perde ao
 * guardar de menos é a anamnese inteira, e quem perde não responde de novo. */
const DIAS_DE_RASCUNHO = 7

export function QuestionarioScreen({
  onFechar,
  onRespondido,
}: {
  onFechar: () => void
  /* Avisa quem abriu, para a linha de "responder o questionário" sumir. */
  onRespondido: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()

  const [q, setQ] = useState<Questionario | null>(null)
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'nenhum' | 'antigo' | 'erro'>(
    'carregando',
  )
  const [erro, setErro] = useState('')
  const [passo, setPasso] = useState(0)
  const [r, setR] = useState<Respostas>({})
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  useEffect(() => {
    let vivo = true
    void carregarQuestionario().then(async res => {
      if (!vivo) return
      if (res.tipo === 'ok') {
        setQ(res.questionario)
        /* Três camadas, da menos para a mais recente: o vazio do modelo, o que
           o servidor já tem gravado, e por cima o rascunho deste aparelho.

           Os vazios saem do modelo que ESTE questionário usa, e não de uma lista
           fixa: campo novo já nasce com o vazio certo, e campo que ela tirou não
           fica sobrando na resposta.

           O rascunho vem por último porque é o mais novo: se ela respondeu
           quinze perguntas e o app morreu, é isso que ela espera encontrar. */
        const base = { ...vazioDoModelo(res.questionario.modelo), ...res.questionario.respostas }
        const rascunho = await lerRascunho<Respostas>(RASCUNHO.questionario, DIAS_DE_RASCUNHO * 24)
        if (!vivo) return
        setR(rascunho ? { ...base, ...rascunho } : base)
        setEstado('pronto')
        return
      }
      if (res.tipo === 'erro') {
        setErro(res.mensagem)
        setEstado('erro')
        return
      }
      setEstado(res.tipo === 'nenhum' ? 'nenhum' : 'antigo')
    })
    return () => {
      vivo = false
    }
  }, [])

  const secoes = useMemo(
    () => (q ? secoesVisiveis(q.modelo, q.paciente.feminino) : []),
    [q],
  )
  const total = quantasPerguntas(secoes)
  const feitas = quantasRespondidas(secoes, r)
  const ultima = passo >= secoes.length - 1

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      /* Volta uma SEÇÃO por vez antes de fechar. Sem isto, o voltar do aparelho
         no meio do questionário jogaria fora as respostas de trinta perguntas —
         e no meio de um formulário longo o voltar é o gesto de "quero rever o
         que respondi", não o de "quero sair". */
      if (estado === 'pronto' && !enviado && passo > 0) {
        setPasso(p => p - 1)
        return true
      }
      sair()
      return true
    })
    return () => sub.remove()
  })

  function sair() {
    Keyboard.dismiss()
    onFechar()
  }

  function responder(chave: string, valor: unknown) {
    setR(atual => {
      const novo = { ...atual, [chave]: valor }
      /* A cada resposta, e não ao trocar de seção: o app pode morrer no meio de
         uma seção tanto quanto entre duas. */
      void guardarRascunho(RASCUNHO.questionario, novo)
      return novo
    })
  }

  async function enviar() {
    if (!q) return
    Keyboard.dismiss()
    setEnviando(true)
    const f = await responderQuestionario(q.token, r)
    setEnviando(false)
    if (f) {
      setErro(f.erro)
      return
    }
    setErro('')
    /* Só depois de o servidor confirmar. Apagar antes deixaria a pessoa sem o
       rascunho E sem o envio se a rede caísse no meio. */
    void apagarRascunho(RASCUNHO.questionario)
    setEnviado(true)
    onRespondido()
  }

  /* ── As telas que não são o formulário ───────────────────────────────────*/

  const moldura = (conteudo: React.ReactNode) => (
    <View style={[styles.tela, { paddingTop: top + 8 }]}>
      <View style={styles.cabecalho}>
        <Pressable
          onPress={sair}
          style={styles.botaoVoltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela}>Antes da consulta</Text>
        <View style={styles.botaoVoltar} />
      </View>
      {conteudo}
    </View>
  )

  if (estado === 'carregando')
    return moldura(<ActivityIndicator color={paleta().cores.verde} style={{ marginTop: 40 }} />)

  if (estado === 'erro')
    return moldura(
      <View style={styles.centro}>
        <Text style={styles.textoErro}>{erro}</Text>
        <Pressable onPress={sair} style={styles.botao} accessibilityRole="button">
          <Text style={styles.textoBotao}>Voltar</Text>
        </Pressable>
      </View>,
    )

  if (estado === 'nenhum')
    return moldura(
      <View style={styles.centro}>
        <Text style={styles.titulo}>Nada para responder agora</Text>
        <Text style={styles.explicacao}>
          Quando a sua nutricionista mandar um questionário, ele aparece aqui.
        </Text>
      </View>,
    )

  if (estado === 'antigo')
    return moldura(
      <View style={styles.centro}>
        <Text style={styles.titulo}>Esse questionário é de um formato antigo</Text>
        {/* Honesto e específico. "Deu erro" mandaria a pessoa tentar de novo para
            sempre; isto diz o que fazer, e o link dela continua funcionando. */}
        <Text style={styles.explicacao}>
          Ele foi enviado antes de o app conseguir abrir questionário. Responda pelo link que a
          sua nutricionista te mandou, que continua valendo.
        </Text>
      </View>,
    )

  if (enviado)
    return moldura(
      <View style={styles.centro}>
        <Ionicons name="checkmark-circle" size={44} color={paleta().cores.verde} />
        <Text style={styles.titulo}>Respostas enviadas</Text>
        <Text style={styles.explicacao}>
          {q?.nutri?.nome
            ? `${q.nutri.nome} já consegue ver antes da sua consulta.`
            : 'A sua nutricionista já consegue ver antes da consulta.'}
        </Text>
        <Pressable onPress={sair} style={styles.botao} accessibilityRole="button">
          <Text style={styles.textoBotao}>Pronto</Text>
        </Pressable>
      </View>,
    )

  const secao: Secao | undefined = secoes[passo]
  if (!secao) return moldura(<View style={styles.centro} />)

  return (
    <KeyboardAvoidingView
      style={[styles.tela, { paddingTop: top + 8 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.cabecalho}>
        <Pressable
          onPress={() => (passo > 0 ? setPasso(p => p - 1) : sair())}
          style={styles.botaoVoltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={passo > 0 ? 'Voltar uma etapa' : 'Voltar'}
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela}>
          {passo + 1} de {secoes.length}
        </Text>
        <View style={styles.botaoVoltar} />
      </View>

      {/* Quanto falta, e não quanto foi feito: é a informação que decide entre
          continuar e fechar o app. */}
      <View style={styles.trilho}>
        <View
          style={[
            styles.progresso,
            { width: `${total === 0 ? 0 : Math.round((feitas / total) * 100)}%` },
          ]}
        />
      </View>

      <ScrollView
        contentContainerStyle={[styles.conteudo, { paddingBottom: bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.tituloSecao}>{secao.titulo}</Text>
        {secao.subtitulo ? <Text style={styles.explicacao}>{secao.subtitulo}</Text> : null}

        {secao.campos.map(c =>
          ehOutroDoObjetivo(c, secao) ? null : (
            <CampoDoModelo
              key={c.chave}
              campo={c}
              secao={secao}
              valor={r[c.chave]}
              respostas={r}
              objetivos={q?.objetivos ?? []}
              onResponder={responder}
              styles={styles}
            />
          ),
        )}

        {erro ? <Text style={styles.textoErro}>{erro}</Text> : null}

        <Pressable
          onPress={() => (ultima ? void enviar() : setPasso(p => p + 1))}
          disabled={enviando}
          style={({ pressed }) => [styles.botao, enviando && styles.desligado, pressed && styles.pressionado]}
          accessibilityRole="button"
        >
          {enviando ? (
            <ActivityIndicator color={paleta().cores.branco} />
          ) : (
            <Text style={styles.textoBotao}>{ultima ? 'Enviar respostas' : 'Continuar'}</Text>
          )}
        </Pressable>

        {/* Dito em toda etapa, e não só na primeira: quem chega na sexta seção
            já esqueceu, e é ali que a pergunta chata aparece. */}
        <Text style={styles.ajuda}>
          Pode pular o que não souber ou não quiser responder — nada aqui é obrigatório.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

/* ── Um campo ──────────────────────────────────────────────────────────────*/

function CampoDoModelo({
  campo,
  secao,
  valor,
  respostas,
  objetivos,
  onResponder,
  styles,
}: {
  campo: Campo
  secao: Secao
  valor: unknown
  respostas: Respostas
  objetivos: { id: number; nome: string }[]
  onResponder: (chave: string, valor: unknown) => void
  styles: ReturnType<typeof estilos>
}) {
  const [novaAlergia, setNovaAlergia] = useState('')
  const set = (v: unknown) => onResponder(campo.chave, v)

  const rotulo = (
    <View style={styles.rotuloBloco}>
      <Text style={styles.pergunta}>{campo.label}</Text>
      {campo.ajuda ? <Text style={styles.ajuda}>{campo.ajuda}</Text> : null}
    </View>
  )

  const marcados = Array.isArray(valor) ? (valor as string[]) : []
  const alternar = (id: string) =>
    set(marcados.includes(id) ? marcados.filter(x => x !== id) : [...marcados, id])

  switch (campo.tipo) {
    case 'objetivo': {
      /* O "outro" é desenhado AQUI dentro, e por isso o campo de texto dele é
         pulado lá em cima: as duas caixas separadas mostrariam a mesma pergunta
         duas vezes, uma sem contexto nenhum. */
      const temOutro = secao.campos.some(c => c.chave === 'objetivo_outro')
      const outro = String(respostas.objetivo_outro ?? '')
      const outroAtivo = temOutro && valor === null && outro !== ''
      return (
        <View style={styles.campoBloco}>
          {rotulo}
          <View style={styles.chips}>
            {objetivos.map(o => (
              <Chip
                key={o.id}
                ativo={valor === o.id}
                onPress={() => {
                  set(o.id)
                  onResponder('objetivo_outro', '')
                }}
                styles={styles}
              >
                {o.nome}
              </Chip>
            ))}
            {temOutro && (
              <Chip
                ativo={outroAtivo}
                onPress={() => {
                  set(null)
                  onResponder('objetivo_outro', outroAtivo ? '' : ' ')
                }}
                styles={styles}
              >
                Outro
              </Chip>
            )}
          </View>
          {outroAtivo && (
            <TextInput
              value={outro.trim()}
              onChangeText={t => onResponder('objetivo_outro', t)}
              placeholder="Qual é o seu objetivo?"
              placeholderTextColor={paleta().inkFraco}
              keyboardAppearance="dark"
              maxLength={200}
              style={styles.campo}
              accessibilityLabel="Outro objetivo"
            />
          )}
        </View>
      )
    }

    case 'texto':
      return (
        <View style={styles.campoBloco}>
          {rotulo}
          <TextInput
            value={String(valor ?? '')}
            onChangeText={set}
            placeholderTextColor={paleta().inkFraco}
            keyboardAppearance="dark"
            maxLength={300}
            style={styles.campo}
            accessibilityLabel={campo.label}
          />
        </View>
      )

    case 'textarea':
      return (
        <View style={styles.campoBloco}>
          {rotulo}
          <TextInput
            value={String(valor ?? '')}
            onChangeText={set}
            placeholderTextColor={paleta().inkFraco}
            keyboardAppearance="dark"
            multiline
            textAlignVertical="top"
            maxLength={1000}
            style={[styles.campo, styles.campoGrande]}
            accessibilityLabel={campo.label}
          />
        </View>
      )

    case 'numero':
      return (
        <View style={styles.campoBloco}>
          {rotulo}
          <TextInput
            value={valor === null || valor === undefined ? '' : String(valor)}
            /* Inteiro: filtra tudo que não é dígito e usa teclado sem
               separador. "10.000" viraria 10 na conversão — item 3 do
               AGENTS.md. */
            onChangeText={t => {
              const so = t.replace(/[^0-9]/g, '')
              set(so === '' ? null : Number(so))
            }}
            keyboardType="number-pad"
            keyboardAppearance="dark"
            maxLength={6}
            style={styles.campo}
            accessibilityLabel={campo.label}
          />
        </View>
      )

    case 'data':
      return (
        <View style={styles.campoBloco}>
          {rotulo}
          <TextInput
            value={String(valor ?? '')}
            onChangeText={t => set(t.replace(/[^0-9/]/g, '') || null)}
            placeholder="dd/mm/aaaa"
            placeholderTextColor={paleta().inkFraco}
            keyboardType="number-pad"
            keyboardAppearance="dark"
            maxLength={10}
            style={styles.campo}
            accessibilityLabel={campo.label}
          />
        </View>
      )

    case 'booleano':
      return (
        <View style={styles.campoBloco}>
          <View style={styles.linhaSwitch}>
            <View style={styles.rotuloEsticado}>{rotulo}</View>
            <Switch
              value={valor === true}
              onValueChange={set}
              trackColor={{ false: paleta().cores.trilho, true: paleta().cores.verde }}
              accessibilityLabel={campo.label}
            />
          </View>
        </View>
      )

    case 'radio':
      return (
        <View style={styles.campoBloco}>
          {rotulo}
          <View style={styles.chips}>
            {campo.opcoes.map(o => (
              <Chip
                key={o}
                ativo={valor === o}
                /* Tocar no que já está marcado DESMARCA. É a única forma de
                   voltar atrás num campo opcional sem recarregar a tela — e
                   "respondi sem querer" acontece. */
                onPress={() => set(valor === o ? null : o)}
                styles={styles}
              >
                {o}
              </Chip>
            ))}
          </View>
        </View>
      )

    case 'checkbox_multi':
      return (
        <View style={styles.campoBloco}>
          {rotulo}
          <View style={styles.chips}>
            {campo.opcoes.map(o => (
              <Chip key={o} ativo={marcados.includes(o)} onPress={() => alternar(o)} styles={styles}>
                {o}
              </Chip>
            ))}
          </View>
        </View>
      )

    case 'escala_1a10': {
      const n = typeof valor === 'number' ? valor : null
      return (
        <View style={styles.campoBloco}>
          {rotulo}
          <View style={styles.escala}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map(x => (
              <Pressable
                key={x}
                onPress={() => set(n === x ? null : x)}
                style={[styles.degrau, n !== null && x <= n && styles.degrauAceso]}
                accessibilityRole="button"
                accessibilityLabel={`${x} de 10`}
              >
                <Text style={[styles.numeroDegrau, n !== null && x <= n && styles.numeroAceso]}>
                  {x}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )
    }

    case 'alergias': {
      const custom = marcados.filter(ehCustom)
      return (
        <View style={styles.campoBloco}>
          {rotulo}
          <View style={styles.chips}>
            {ALERGENOS.map(a => (
              <Chip
                key={a.id}
                ativo={marcados.includes(a.id)}
                onPress={() => alternar(a.id)}
                styles={styles}
              >
                {a.nome}
              </Chip>
            ))}
            {custom.map(id => (
              <Chip key={id} ativo onPress={() => alternar(id)} styles={styles}>
                {nomeDoAlergeno(id)}
              </Chip>
            ))}
          </View>
          <TextInput
            value={novaAlergia}
            onChangeText={setNovaAlergia}
            placeholder="Outra? escreva e toque em juntar"
            placeholderTextColor={paleta().inkFraco}
            keyboardAppearance="dark"
            maxLength={60}
            /* Botão, e não só "Enter": no teclado do celular a tecla de enviar
               costuma ser a de nova linha, e quem digitasse e tocasse em
               continuar perderia o que escreveu sem nada avisando. */
            onSubmitEditing={() => {
              const t = novaAlergia.trim()
              if (!t) return
              const id = idCustom(t)
              if (!marcados.includes(id)) set([...marcados, id])
              setNovaAlergia('')
            }}
            style={styles.campo}
            accessibilityLabel="Outra alergia ou intolerância"
          />
          {novaAlergia.trim() !== '' && (
            <Pressable
              onPress={() => {
                const id = idCustom(novaAlergia.trim())
                if (!marcados.includes(id)) set([...marcados, id])
                setNovaAlergia('')
              }}
              style={styles.botaoJuntar}
              accessibilityRole="button"
            >
              <Text style={styles.textoJuntar}>Juntar "{novaAlergia.trim()}"</Text>
            </Pressable>
          )}
        </View>
      )
    }
  }
}

function Chip({
  ativo,
  onPress,
  children,
  styles,
}: {
  ativo: boolean
  onPress: () => void
  children: React.ReactNode
  styles: ReturnType<typeof estilos>
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, ativo && styles.chipAtivo]}
      accessibilityRole="button"
      accessibilityState={{ selected: ativo }}
    >
      <Text style={[styles.textoChip, ativo && styles.textoChipAtivo]}>{children}</Text>
    </Pressable>
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
    tituloTela: { fontSize: 15, fontWeight: '800', color: t.inkMedio },

    trilho: {
      height: 4,
      marginHorizontal: 20,
      borderRadius: 4,
      backgroundColor: t.cores.trilho,
      overflow: 'hidden',
    },
    progresso: { height: 4, borderRadius: 4, backgroundColor: t.cores.verde },

    conteudo: { paddingHorizontal: 20, paddingTop: 16, gap: 16 },
    centro: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 10 },

    titulo: { fontSize: 20, fontWeight: '800', color: t.cores.ink, textAlign: 'center' },
    tituloSecao: { fontSize: 21, fontWeight: '800', color: t.cores.ink, letterSpacing: -0.4 },
    explicacao: { fontSize: 13.5, color: t.inkMedio, lineHeight: 20, textAlign: 'center' },

    campoBloco: { gap: 8 },
    rotuloBloco: { gap: 3 },
    rotuloEsticado: { flex: 1 },
    pergunta: { fontSize: 15, fontWeight: '700', color: t.cores.ink, lineHeight: 21 },
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
    campoGrande: { minHeight: 110, lineHeight: 22 },

    linhaSwitch: { flexDirection: 'row', alignItems: 'center', gap: 12 },

    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.cores.borda,
      backgroundColor: t.cores.cartao,
    },
    chipAtivo: { borderColor: t.cores.verde, backgroundColor: t.cores.verdeMenta },
    textoChip: { fontSize: 13.5, color: t.inkMedio, fontWeight: '600' },
    textoChipAtivo: { color: t.cores.verde, fontWeight: '800' },

    escala: { flexDirection: 'row', gap: 4 },
    degrau: {
      flex: 1,
      height: 42,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.cores.borda,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.cores.cartao,
    },
    degrauAceso: { backgroundColor: t.cores.verde, borderColor: t.cores.verde },
    numeroDegrau: { fontSize: 12.5, fontWeight: '700', color: t.inkFraco },
    numeroAceso: { color: t.cores.branco },

    botao: {
      backgroundColor: t.cores.verde,
      borderRadius: 14,
      height: 50,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
      alignSelf: 'stretch',
    },
    desligado: { opacity: 0.6 },
    pressionado: { opacity: 0.8 },
    textoBotao: { color: t.cores.branco, fontSize: 15, fontWeight: '800' },

    botaoJuntar: { alignSelf: 'flex-start', paddingVertical: 8 },
    textoJuntar: { fontSize: 13, fontWeight: '700', color: t.cores.verde },

    textoErro: { fontSize: 13, color: t.cores.erroTexto, lineHeight: 19, textAlign: 'center' },
  }),
)
