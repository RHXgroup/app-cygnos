import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  BackHandler,
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
import {
  modeloCompleto,
  modelosDeAnamnese,
  preencherComAAurora,
  salvarAnamnese,
  type CampoDoModelo,
  type ModeloDeAnamnese,
} from '../lib/anamneseDaPaciente'
import { dataISO } from '../lib/formatar'
import { useDesvioDoTeclado } from '../lib/teclado'
import { estilosDe, paleta } from '../lib/tema'
import { FONTE } from '../lib/fontes'

/* Anamnese: falando, ou na mão.
 *
 * ──────────────────── O pedido ────────────────────
 * "Você não vai fazer uma anamnese aqui porque é muito campo. E se usar a
 * Aurora? A anamnese já tem lá a transcrição -- e se usar a transcrição aqui
 * também, e preencher tudo pra mim? Tem que ter facilidades, não complicações."
 *
 * ──────────────────── Três passos, e o do meio é o que importa ────────────────────
 * FALAR: ela conta a consulta como contaria para uma colega. O ditado é o do
 * próprio celular, o mesmo da Aurora e da conversa.
 *
 * CONFERIR: a Aurora devolve campo a campo, e NADA é gravado antes desta tela.
 * É a mesma regra do cartão de confirmação da agenda, e pelo mesmo motivo:
 * reconhecimento de fala erra, e a defesa não é acertar mais -- é limitar o que
 * acontece quando erra. Numa anamnese, um erro que entra calado vira conduta.
 *
 * SALVAR: vai para o mesmo lugar do sistema, com o mesmo retrato de seções --
 * abre no computador como qualquer anamnese feita lá.
 *
 * ──────────────────── E NA MÃO, que é o caminho de sempre ────────────────────
 * "Não posso fazer manual? Qual o problema?" -- ele abriu a tela e viu só o
 * botão de falar. Não havia problema nenhum: o que havia era uma tela que
 * oferecia um caminho só, e um caminho só parece obrigação.
 *
 * Preencher na mão abre o modelo INTEIRO, seção por seção, campo por campo --
 * os mesmos campos que a conferência da Aurora mostra. É a mesma tela do passo
 * de conferir, com tudo vazio: um formulário a menos para manter, e o que ela
 * aprende num caminho vale no outro.
 *
 * ──────────────────── O que ela NÃO faz ────────────────────
 * Não grava áudio da consulta inteira, com a paciente falando. Isso é gravação
 * de terceiro e pede consentimento registrado -- o sistema tem esse fluxo, com
 * a caixa de consentimento. Aqui quem fala é ELA, contando o que ouviu, que é o
 * caso do "entre uma consulta e outra". */
export function AnamnesePorVozScreen({
  pacienteId,
  nome,
  onFechar,
  onSalvou,
}: {
  pacienteId: number
  nome: string
  onFechar: () => void
  onSalvou: (mensagem: string) => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()

  const [passo, setPasso] = useState<'falar' | 'conferir'>('falar')
  /* Na mão: a conferência mostra o modelo inteiro, e não só o que a Aurora
     achou. Um booleano, e não um terceiro passo, porque a tela é a mesma. */
  const [naMao, setNaMao] = useState(false)
  const [modelo, setModelo] = useState<ModeloDeAnamnese | null>(null)
  const [modelos, setModelos] = useState<{ id: number; nome: string; tipoPaciente: string }[]>([])
  const [carregando, setCarregando] = useState(true)

  const [texto, setTexto] = useState('')
  const [respostas, setRespostas] = useState<Record<string, unknown>>({})
  const [resumo, setResumo] = useState<string | null>(null)
  const [naoAbordados, setNaoAbordados] = useState<string[]>([])
  const [tipoConsulta, setTipoConsulta] = useState<string | null>(null)

  const [pensando, setPensando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const emVoo = useRef(false)
  const [erro, setErro] = useState('')

  /* O que estava escrito quando o ditado começou. O reconhecimento manda a
     frase inteira a cada pedaço, então juntar cada um dobraria o texto -- é o
     mesmo cuidado da Aurora e da conversa. */
  const baseDoDitado = useRef<string | null>(null)

  const [alturaDaTela, setAlturaDaTela] = useState(0)
  const respiro = useDesvioDoTeclado(bottom, alturaDaTela || undefined)

  useEffect(() => {
    let vivo = true
    void (async () => {
      const r = await modelosDeAnamnese()
      if (!vivo) return
      if (r.tipo === 'erro') {
        setErro(r.mensagem)
        setCarregando(false)
        return
      }
      setModelos(r.modelos)
      /* Um modelo só: entra direto. Escolher entre um item é uma tela a mais
         para não decidir nada. */
      if (r.modelos.length === 1) {
        const completo = await modeloCompleto(r.modelos[0].id)
        if (!vivo) return
        if (completo.tipo === 'ok') setModelo(completo.modelo)
        else setErro(completo.mensagem)
      }
      setCarregando(false)
    })()
    return () => {
      vivo = false
    }
  }, [])

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (salvando || pensando) return true
      if (passo === 'conferir') {
        setPasso('falar')
        setNaMao(false)
        return true
      }
      onFechar()
      return true
    })
    return () => sub.remove()
  }, [passo, salvando, pensando, onFechar])

  async function escolherModelo(id: number) {
    setCarregando(true)
    setErro('')
    const r = await modeloCompleto(id)
    setCarregando(false)
    if (r.tipo === 'erro') {
      setErro(r.mensagem)
      return
    }
    setModelo(r.modelo)
  }

  async function pedirParaAurora() {
    if (!modelo || pensando || emVoo.current) return
    emVoo.current = true
    setPensando(true)
    setErro('')

    const r = await preencherComAAurora(texto, modelo.secoes)

    emVoo.current = false
    setPensando(false)

    if (r.tipo === 'erro') {
      setErro(r.mensagem)
      return
    }

    /* As chaves vêm como id de campo. Guardadas em texto, porque é assim que
       elas voltam no `respostas` da tela e no que é gravado. */
    const lidas: Record<string, unknown> = {}
    for (const [chave, valor] of Object.entries(r.preenchimento.respostas)) {
      if (valor !== null && valor !== undefined && valor !== '') lidas[String(chave)] = valor
    }
    setRespostas(lidas)
    setResumo(r.preenchimento.resumo)
    setNaoAbordados(r.preenchimento.naoAbordados)
    setTipoConsulta(r.preenchimento.tipoConsulta)
    setPasso('conferir')
  }

  async function salvar() {
    if (!modelo || salvando || emVoo.current) return
    emVoo.current = true
    setSalvando(true)
    setErro('')

    const r = await salvarAnamnese({
      pacienteId,
      modelo,
      respostas,
      transcricao: texto,
      dataAnamnese: dataISO(new Date()),
      tipoConsulta,
      titulo: null,
    })

    emVoo.current = false
    setSalvando(false)

    if (r.tipo === 'erro') {
      setErro(r.mensagem)
      return
    }
    onSalvou('Anamnese guardada na ficha, e já está no sistema.')
  }

  const quantosPreenchidos = Object.keys(respostas).length

  return (
    <View
      style={[styles.tela, { paddingTop: top + 8 }]}
      onLayout={e => setAlturaDaTela(e.nativeEvent.layout.height)}
    >
      <View style={styles.cabecalho}>
        <Pressable
          onPress={() => {
            if (salvando || pensando) return
            if (passo === 'conferir') {
              setPasso('falar')
              setNaMao(false)
            } else onFechar()
          }}
          style={styles.botaoVoltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela} numberOfLines={1}>
          {passo === 'falar'
            ? `Anamnese de ${nome.split(' ')[0]}`
            : naMao
              ? `Anamnese de ${nome.split(' ')[0]}`
              : 'Confira antes de salvar'}
        </Text>
        <View style={styles.botaoVoltar} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.conteudo, { paddingBottom: respiro + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {carregando && <ActivityIndicator color={paleta().cores.verde} style={styles.girando} />}

        {!carregando && !modelo && modelos.length > 1 && (
          <>
            <Text style={styles.rotulo}>QUAL MODELO</Text>
            {modelos.map(m => (
              <Pressable
                key={m.id}
                onPress={() => void escolherModelo(m.id)}
                style={({ pressed }) => [styles.linhaDeModelo, pressed && styles.pressionado]}
                accessibilityRole="button"
                accessibilityLabel={m.nome}
              >
                <Ionicons name="document-text-outline" size={18} color={paleta().cores.verde} />
                <Text style={styles.nomeDoModelo}>{m.nome}</Text>
                <Ionicons name="chevron-forward" size={16} color={paleta().inkFraco} />
              </Pressable>
            ))}
          </>
        )}

        {!carregando && !modelo && modelos.length === 0 && !erro && (
          <Text style={styles.vazio}>
            Você ainda não tem modelo de anamnese. Crie um no sistema, e ele aparece aqui.
          </Text>
        )}

        {modelo && passo === 'falar' && (
          <>
            <Text style={styles.explicacao}>
              Conte a consulta como você contaria para uma colega. A Aurora separa nos campos do
              seu modelo “{modelo.nome}”, e você confere antes de salvar.
            </Text>

            <TextInput
              value={texto}
              onChangeText={setTexto}
              placeholder="Ela veio para emagrecer, tem 34 anos, trabalha à noite, come fora quase todo dia…"
              placeholderTextColor={paleta().inkFraco}
              multiline
              style={styles.campoGrande}
              accessibilityLabel="O que você quer contar da consulta"
            />

            <View style={styles.barraDoDitado}>
              <Ditado
                assunto="recado"
                onParcial={parcial => {
                  if (baseDoDitado.current === null) baseDoDitado.current = texto
                  const base = baseDoDitado.current
                  setTexto(base ? base.trimEnd() + ' ' + parcial : parcial)
                }}
                onTexto={ouvido => {
                  const base = baseDoDitado.current ?? texto
                  baseDoDitado.current = null
                  const limpo = ouvido.trim()
                  if (!limpo) return
                  setTexto(base ? base.trimEnd() + ' ' + limpo : limpo)
                }}
                onErro={mensagem => {
                  baseDoDitado.current = null
                  setErro(mensagem)
                }}
              />
              <Text style={styles.dicaDoDitado}>
                Toque no microfone e fale. Dá para falar em pedaços: cada fala continua o texto.
              </Text>
            </View>

            {!!erro && <Text style={styles.erro}>{erro}</Text>}

            {/* Os dois caminhos, lado a lado e no mesmo peso visual: o de cima
                é o atalho, o de baixo é o de sempre. Esconder o segundo foi o
                que fez parecer que só havia um. */}
            <Pressable
              onPress={() => void pedirParaAurora()}
              disabled={pensando || texto.trim().length < 40}
              style={({ pressed }) => [
                styles.botao,
                (pensando || texto.trim().length < 40) && styles.botaoApagado,
                pressed && styles.pressionado,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Preencher com a Aurora"
            >
              {pensando ? (
                <ActivityIndicator size="small" color={paleta().cores.branco} />
              ) : (
                <Text style={styles.textoDoBotao}>Preencher com a Aurora</Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => {
                setNaMao(true)
                setRespostas({})
                setResumo(null)
                setNaoAbordados([])
                setErro('')
                setPasso('conferir')
              }}
              disabled={pensando}
              style={({ pressed }) => [styles.botaoVazado, pressed && styles.pressionado]}
              accessibilityRole="button"
              accessibilityLabel="Preencher na mão"
            >
              <Text style={styles.textoDoBotaoVazado}>Preencher na mão</Text>
            </Pressable>
          </>
        )}

        {modelo && passo === 'conferir' && (
          <>
            <View style={styles.placar}>
              <Text style={styles.numeroDoPlacar}>{quantosPreenchidos}</Text>
              <Text style={styles.textoDoPlacar}>
                {quantosPreenchidos === 1 ? 'campo preenchido' : 'campos preenchidos'}
                {naMao
                  ? ' · preencha o que fizer sentido; campo vazio não entra'
                  : naoAbordados.length > 0
                    ? ` · ${naoAbordados.length} sem resposta na sua fala`
                    : ''}
              </Text>
            </View>

            {!!resumo && <Text style={styles.resumo}>{resumo}</Text>}

            {modelo.secoes.map(s => {
              /* Na mão, TODOS os campos; vindo da Aurora, só os que ela achou.
                 Mostrar os cento e poucos campos vazios depois de uma fala seria
                 esconder as vinte respostas que ela precisa conferir. */
              const comValor = naMao
                ? s.campos
                : s.campos.filter(c => respostas[String(c.id)] !== undefined)
              if (comValor.length === 0) return null
              return (
                <View key={s.id} style={styles.secao}>
                  <Text style={styles.tituloDaSecao}>{s.titulo.toUpperCase()}</Text>
                  {comValor.map(c => (
                    <CampoConferido
                      key={c.id}
                      campo={c}
                      valor={respostas[String(c.id)]}
                      onMudar={v =>
                        setRespostas(atual => ({ ...atual, [String(c.id)]: v }))
                      }
                      onTirar={() =>
                        setRespostas(atual => {
                          const novo = { ...atual }
                          delete novo[String(c.id)]
                          return novo
                        })
                      }
                      styles={styles}
                    />
                  ))}
                </View>
              )
            })}

            {quantosPreenchidos === 0 && !naMao && (
              <Text style={styles.vazio}>
                A Aurora não achou nada do modelo na sua fala. Volte e conte com mais detalhe, ou
                preencha na mão.
              </Text>
            )}

            {!!erro && <Text style={styles.erro}>{erro}</Text>}

            <Pressable
              onPress={() => void salvar()}
              disabled={salvando || quantosPreenchidos === 0}
              style={({ pressed }) => [
                styles.botao,
                (salvando || quantosPreenchidos === 0) && styles.botaoApagado,
                pressed && styles.pressionado,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Salvar anamnese"
            >
              {salvando ? (
                <ActivityIndicator size="small" color={paleta().cores.branco} />
              ) : (
                <Text style={styles.textoDoBotao}>Salvar anamnese</Text>
              )}
            </Pressable>

            <Text style={styles.nota}>
              Os campos que a Aurora não achou ficam vazios, e não inventados. A sua fala é
              guardada junto, como origem do registro — igual ao sistema.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  )
}

/* Um campo preenchido, do jeito que se confere: o rótulo, o valor editável, e
   um jeito de dizer "isso aí não". Tirar é tão importante quanto corrigir --
   um campo que a Aurora entendeu errado e que ela não consegue apagar vira
   conduta errada gravada. */
function CampoConferido({
  campo,
  valor,
  onMudar,
  onTirar,
  styles,
}: {
  campo: CampoDoModelo
  valor: unknown
  onMudar: (v: unknown) => void
  onTirar: () => void
  styles: ReturnType<typeof estilos>
}) {
  const escolhas = campo.opcoes.length > 0 && campo.tipo !== 'checkbox_multi'
  const texto = comoTexto(valor)

  return (
    <View style={styles.campoConferido}>
      <View style={styles.topoDoCampo}>
        <Text style={styles.rotuloDoCampo}>{campo.label}</Text>
        <Pressable
          onPress={onTirar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={'Tirar ' + campo.label}
        >
          <Ionicons name="close-circle-outline" size={18} color={paleta().inkFraco} />
        </Pressable>
      </View>

      {escolhas ? (
        <View style={styles.opcoes}>
          {campo.opcoes.map(o => (
            <Pressable
              key={o}
              onPress={() => onMudar(o)}
              style={({ pressed }) => [
                styles.opcao,
                texto === o && styles.opcaoAtiva,
                pressed && styles.pressionado,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: texto === o }}
            >
              <Text style={[styles.textoDaOpcao, texto === o && styles.textoDaOpcaoAtiva]}>{o}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <TextInput
          value={texto}
          onChangeText={onMudar}
          multiline={campo.tipo === 'textarea'}
          keyboardType={campo.tipo === 'numero' ? 'decimal-pad' : 'default'}
          style={[styles.campo, campo.tipo === 'textarea' && styles.campoLongo]}
          accessibilityLabel={campo.label}
        />
      )}
    </View>
  )
}

/* O que a IA devolve pode ser texto, número, booleano ou lista. A tela mostra
   tudo como texto -- e o que é lista vira "a, b", que é como ela leria. */
function comoTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return ''
  if (Array.isArray(valor)) return valor.map(String).join(', ')
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não'
  return String(valor)
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

    conteudo: { paddingHorizontal: 16, gap: 10 },
    girando: { marginTop: 24 },

    rotulo: { marginTop: 6, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: t.inkFraco },
    explicacao: { fontSize: 13.5, lineHeight: 19, color: t.inkSuave },

    linhaDeModelo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: t.cores.cartao,
      borderRadius: 12,
      padding: 14,
    },
    nomeDoModelo: { flex: 1, fontSize: 14.5, fontWeight: '700', color: t.cores.ink },

    campoGrande: {
      minHeight: 160,
      backgroundColor: t.cores.superficie,
      borderRadius: 14,
      padding: 14,
      fontSize: 15.5,
      lineHeight: 22,
      color: t.cores.ink,
      textAlignVertical: 'top',
      fontFamily: FONTE.normal,
    },
    barraDoDitado: { alignItems: 'center', gap: 6, marginTop: 4 },
    dicaDoDitado: { fontSize: 12, color: t.inkFraco, textAlign: 'center' },

    placar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: t.cores.cartao,
      borderRadius: 14,
      padding: 14,
    },
    numeroDoPlacar: { fontSize: 28, fontWeight: '800', color: t.cores.verde },
    textoDoPlacar: { flex: 1, fontSize: 13, lineHeight: 18, color: t.inkSuave },
    resumo: { fontSize: 13.5, lineHeight: 19, color: t.cores.ink },

    secao: { gap: 8, marginTop: 8 },
    tituloDaSecao: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: t.inkFraco },

    campoConferido: { gap: 6 },
    topoDoCampo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rotuloDoCampo: { flex: 1, fontSize: 13, fontWeight: '700', color: t.cores.ink },
    campo: {
      backgroundColor: t.cores.superficie,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 11,
      fontSize: 15,
      color: t.cores.ink,
      fontFamily: FONTE.normal,
    },
    campoLongo: { minHeight: 72, textAlignVertical: 'top' },

    opcoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    opcao: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.cores.borda,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    opcaoAtiva: { backgroundColor: t.cores.verde, borderColor: t.cores.verde },
    textoDaOpcao: { fontSize: 12.5, fontWeight: '700', color: t.inkSuave },
    textoDaOpcaoAtiva: { color: t.cores.branco },

    vazio: { fontSize: 13.5, lineHeight: 19, color: t.inkFraco, textAlign: 'center', marginTop: 16 },
    erro: { fontSize: 13, color: t.cores.erroTexto, marginTop: 6 },

    botao: {
      marginTop: 14,
      backgroundColor: t.cores.verde,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 50,
    },
    botaoApagado: { opacity: 0.45 },
    botaoVazado: {
      marginTop: 8,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.cores.borda,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    textoDoBotaoVazado: { fontSize: 14.5, fontWeight: '700', color: t.cores.ink },
    textoDoBotao: { fontSize: 15, fontWeight: '800', color: t.cores.branco },
    pressionado: { opacity: 0.75 },
    nota: { fontSize: 12, lineHeight: 17, color: t.inkFraco, marginTop: 10 },
  }),
)
