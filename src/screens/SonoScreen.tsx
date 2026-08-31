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
import { BarraDesfazer, useApagarComDesfazer } from '../components/Desfazer'
import {
  COMO_ACORDOU,
  FATORES,
  LIMITES,
  NOME_DO_FATOR,
  apagarNoite,
  carregarNoites,
  duracao,
  eficiencia,
  noitePadrao,
  regularidade,
  minutoDaNoite,
  INICIO_DA_FAIXA,
  FIM_DA_FAIXA,
  resumoDe,
  salvarNoite,
  tempoDormindo,
  tempoNaCama,
  type ComoAcordou,
  type Fator,
  type Noite,
  nomeDoFator,
} from '../lib/sono'
import { METAS_VAZIAS, carregarMetas, type Metas } from '../lib/metas'
import { mascaraHora, validarHora } from '../lib/formulario'
import { DIAS_CURTOS, dataISO } from '../lib/formatar'
import { estilosDe, paleta } from '../lib/tema'

/* O sono, uma noite por vez.
 *
 * A tela é um formulário grande porque a pergunta "como você dormiu?" tem mais
 * de uma resposta útil, e as respostas que mais importam aqui não são as que um
 * relógio dá. Cafeína, álcool e jantar pesado são intervenções NUTRICIONAIS —
 * são a razão de sono existir num app de nutrição, e nenhum sensor as coleta.
 *
 * A noite é indexada pelo dia em que a pessoa acordou. Ver lib/sono.ts. */

/* '2026-08-01' → 'Sáb, 01/08'. Lida como número e não com new Date(texto): a
   string sem hora é interpretada como UTC, e no fuso de Brasília isso devolve o
   dia anterior.
 *
 * ── Por que NÃO é o `rotuloDoDia` de lib/formatar ─────────────────────────
 * Chamava-se assim, e o nome enganava: parecia a armadilha 5, duas
 * implementações do mesmo assunto. Não é — as duas dizem coisas diferentes
 * sobre o mesmo dia, e de propósito.
 *
 * A noite é indexada pelo dia em que a pessoa ACORDOU. A noite com a data de
 * hoje é a madrugada que acabou de passar; chamá-la de "Hoje", como faria a de
 * `formatar`, diria que ela dormiu hoje à noite — que ainda não aconteceu.
 *
 * Assunto diferente, função diferente, e agora nome diferente também. */
function rotuloDaNoite(iso: string, hoje = dataISO(new Date())): string {
  if (iso === hoje) return 'Esta madrugada'

  /* Ontem a partir do `hoje` que entrou, e não de `new Date()`.
     Com dois relógios a função se contradizia quando `hoje` era passado. */
  const [ah, mh, dh] = hoje.split('-').map(Number)
  const ontem = new Date(ah, mh - 1, dh - 1)
  if (iso === dataISO(ontem)) return 'Noite de ontem'

  /* `DIAS_CURTOS[d.getDay()]` com data torta é `undefined`, e o `padStart`
     aceita a string "undefined" sem reclamar: '2026-13-45' saía como
     "Dom, 45/13" e 'lixo' como "undefined, undefined/undefined". Ida e volta
     pelo Date confere de uma vez o formato, o alcance e o 31 de fevereiro. */
  const [ano, mes, dia] = iso.split('-').map(Number)
  const d = new Date(ano, mes - 1, dia)
  if (dataISO(d) !== iso) return 'Data desconhecida'

  return `${DIAS_CURTOS[d.getDay()]}, ${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`
}

const diaAnterior = (iso: string) => {
  const [ano, mes, dia] = iso.split('-').map(Number)
  const d = new Date(ano, mes - 1, dia)
  d.setDate(d.getDate() - 1)
  return dataISO(d)
}

const diaSeguinte = (iso: string) => {
  const [ano, mes, dia] = iso.split('-').map(Number)
  const d = new Date(ano, mes - 1, dia)
  d.setDate(d.getDate() + 1)
  return dataISO(d)
}

const DEITOU_PADRAO = '23:00'
const LEVANTOU_PADRAO = '07:00'

export function SonoScreen({
  contaId,
  onFechar,
  onMudou,
}: {
  contaId: string
  onFechar: () => void
  onMudou: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const [noites, setNoites] = useState<Noite[]>([])
  const [metas, setMetas] = useState<Metas>(METAS_VAZIAS)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [mudou, setMudou] = useState(false)

  /* A noite aberta. Nunca passa da noite padrão: não dá para registrar uma noite
     que ainda não aconteceu. */
  const [dia, setDia] = useState(() => noitePadrao())
  const ultimaRegistravel = noitePadrao()

  /* ── O formulário ── */
  const [deitou, setDeitou] = useState(DEITOU_PADRAO)
  const [levantou, setLevantou] = useState(LEVANTOU_PADRAO)
  const [latencia, setLatencia] = useState<number | null>(null)
  const [despertares, setDespertares] = useState<number | null>(null)
  const [qualidade, setQualidade] = useState<number | null>(null)
  const [acordou, setAcordou] = useState<ComoAcordou | null>(null)
  const [cochilos, setCochilos] = useState<number | null>(null)
  const [fatores, setFatores] = useState<Fator[]>([])
  const [observacao, setObservacao] = useState('')

  useEffect(() => {
    let ativo = true

    Promise.all([carregarNoites(contaId), carregarMetas(contaId)]).then(([rNoites, rMetas]) => {
      if (!ativo) return

      if (rNoites.tipo === 'erro') setErro(rNoites.mensagem)
      else setNoites(rNoites.noites)
      if (rMetas.tipo === 'ok') setMetas(rMetas.metas)

      setCarregando(false)
    })

    return () => {
      ativo = false
    }
  }, [contaId])

  const salva = noites.find(n => n.data === dia) ?? null

  /* O formulário reflete a noite aberta. Trocar de dia carrega o que está
     gravado, ou volta aos padrões quando aquela noite ainda não existe — sem
     isso, os dados de uma noite vazariam para a seguinte. */
  useEffect(() => {
    setDeitou(salva?.deitou ?? DEITOU_PADRAO)
    setLevantou(salva?.levantou ?? LEVANTOU_PADRAO)
    setLatencia(salva?.latenciaMin ?? null)
    setDespertares(salva?.despertares ?? null)
    setQualidade(salva?.qualidade ?? null)
    setAcordou(salva?.acordou ?? null)
    setCochilos(salva?.cochilosMin ?? null)
    setFatores(salva?.fatores ?? [])
    setObservacao(salva?.observacao ?? '')
  }, [salva?.id, dia])

  const horasOk = validarHora(deitou) === null && validarHora(levantou) === null
  const naCama = horasOk ? tempoNaCama(deitou, levantou) : 0
  const dormindo = horasOk ? tempoDormindo({ deitou, levantou, latenciaMin: latencia }) : 0
  const efic = horasOk ? eficiencia({ deitou, levantou, latenciaMin: latencia }) : null

  async function salvar() {
    if (!horasOk) return

    setSalvando(true)
    setErro('')

    const r = await salvarNoite(contaId, {
      data: dia,
      deitou,
      levantou,
      latenciaMin: latencia,
      despertares,
      qualidade,
      acordou,
      cochilosMin: cochilos,
      fatores,
      observacao: observacao || null,
    })

    setSalvando(false)

    if (r.tipo === 'erro') {
      setErro(r.mensagem)
      return
    }

    setMudou(true)
    /* Substitui a noite do dia em vez de acrescentar: o banco fez upsert, e sem
       o filtro a mesma noite apareceria duas vezes no histórico. */
    setNoites(atuais => [r.noite, ...atuais.filter(n => n.data !== r.noite.data)])
  }

  /* Apagar com cinco segundos de volta. Como no peso, a noite apagada por
     engano não se recupera de memória: ninguém lembra a que horas dormiu e
     acordou na quinta da semana passada. */
  const { apagar, desfazer, desfazivel } = useApagarComDesfazer<Noite>({
    remover: n => setNoites(atuais => atuais.filter(x => x.id !== n.id)),
    restaurar: n => setNoites(atuais => [...atuais, n].sort((a, b) => b.data.localeCompare(a.data))),
    apagarDeVerdade: n => apagarNoite(n.id),
    aoFalhar: setErro,
    aoMudar: () => {
      setErro('')
      setMudou(true)
    },
  })

  function fechar() {
    if (mudou) onMudou()
    onFechar()
  }

  const resumo = resumoDe(noites)
  const varia = regularidade(noites)

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
        <Text style={styles.tituloTela}>Sono</Text>
        <View style={styles.botaoVoltar} />
      </View>

      {carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator color={paleta().cores.verde} />
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={styles.conteudo}
            showsVerticalScrollIndicator={false}
            bounces={false}
            overScrollMode="never"
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {/* ── Qual noite ── */}
            <View style={styles.navegacao}>
              <Pressable
                onPress={() => setDia(diaAnterior(dia))}
                style={({ pressed }) => [styles.setaDia, pressed && styles.setaPressionada]}
                accessibilityRole="button"
                accessibilityLabel="Noite anterior"
              >
                <Ionicons name="chevron-back" size={20} color={paleta().cores.verde} />
              </Pressable>

              <View style={styles.centroNavegacao}>
                <Text style={styles.rotuloNoite}>{rotuloDaNoite(dia)}</Text>
                {salva && <Text style={styles.jaRegistrada}>já registrada</Text>}
              </View>

              <Pressable
                onPress={() => setDia(diaSeguinte(dia))}
                disabled={dia >= ultimaRegistravel}
                style={({ pressed }) => [
                  styles.setaDia,
                  dia >= ultimaRegistravel && styles.setaDesligada,
                  pressed && styles.setaPressionada,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Noite seguinte"
              >
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={dia >= ultimaRegistravel ? paleta().inkFraco : paleta().cores.verde}
                />
              </Pressable>
            </View>

            {/* ── O resultado da noite ── */}
            <View style={styles.cartaoNoite}>
              <View style={styles.linhaTituloNoite}>
                <Ionicons name="moon" size={16} color={paleta().cores.branco} />
                <Text style={styles.tituloNoite}>Você dormiu</Text>
              </View>

              <View style={styles.linhaValorNoite}>
                <Text style={styles.valorNoite}>{horasOk ? duracao(dormindo) : '—'}</Text>
                {metas.sonoHoras !== null && (
                  <Text style={styles.metaNoite}>de {metas.sonoHoras}h de meta</Text>
                )}
              </View>

              <Text style={styles.detalheNoite}>
                {horasOk
                  ? `${duracao(naCama)} na cama${latencia ? `, ${latencia}min para pegar no sono` : ''}`
                  : 'Preencha os horários abaixo.'}
              </Text>

              {/* A eficiência é o número que costuma explicar o cansaço de quem
                  jura que dorme o suficiente: oito horas na cama dormindo cinco
                  não aparece em "dormi das 23h às 7h". */}
              {efic !== null && (
                <View style={styles.linhaEficiencia}>
                  <View style={styles.trilhoEficiencia}>
                    <View
                      style={[styles.preenchimentoEficiencia, { width: `${Math.min(efic, 100)}%` }]}
                    />
                  </View>
                  <Text style={styles.textoEficiencia}>
                    {Math.round(efic)}% de eficiência
                    {efic >= 85 ? ' · boa' : ''}
                  </Text>
                </View>
              )}
            </View>

            {!!erro && (
              <View style={styles.blocoErro}>
                <Text style={styles.tituloErro}>Não foi possível salvar</Text>
                <Text style={styles.detalheErro}>{erro}</Text>
              </View>
            )}

            {/* ── Horários ── */}
            <Bloco titulo="Horários" icone="time-outline">
              <View style={styles.linhaHoras}>
                <CampoHora rotulo="Deitou" valor={deitou} onChange={setDeitou} />
                <CampoHora rotulo="Levantou" valor={levantou} onChange={setLevantou} />
              </View>
              {!horasOk && <Text style={styles.ajudaErro}>Use o formato HH:MM, como 23:30.</Text>}
            </Bloco>

            {/* ── Qualidade ── */}
            <Bloco titulo="Como foi a noite" icone="pulse-outline">
              <Passo
                rotulo="Demorou a pegar no sono"
                valor={latencia}
                sufixo="min"
                passo={5}
                max={LIMITES.latenciaMin.max}
                onMudar={setLatencia}
              />
              <Passo
                rotulo="Acordou no meio da noite"
                valor={despertares}
                sufixo={despertares === 1 ? 'vez' : 'vezes'}
                passo={1}
                max={LIMITES.despertares.max}
                onMudar={setDespertares}
              />

              <Text style={styles.rotuloCampo}>Qualidade do sono</Text>
              <View style={styles.notas}>
                {[1, 2, 3, 4, 5].map(n => (
                  <Pressable
                    key={n}
                    onPress={() => setQualidade(qualidade === n ? null : n)}
                    style={({ pressed }) => [
                      styles.nota,
                      qualidade === n && styles.notaAtiva,
                      pressed && styles.chipPressionado,
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: qualidade === n }}
                    accessibilityLabel={`Qualidade ${n} de 5`}
                  >
                    <Text style={[styles.textoNota, qualidade === n && styles.textoNotaAtiva]}>
                      {n}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.ajudaCampo}>1 é péssima, 5 é excelente. Toque de novo para desmarcar.</Text>

              <Text style={styles.rotuloCampo}>Acordou se sentindo</Text>
              <View style={styles.chips}>
                {COMO_ACORDOU.map(c => (
                  <Pressable
                    key={c.chave}
                    onPress={() => setAcordou(acordou === c.chave ? null : c.chave)}
                    style={({ pressed }) => [
                      styles.chip,
                      acordou === c.chave && styles.chipAtivo,
                      pressed && styles.chipPressionado,
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: acordou === c.chave }}
                  >
                    <Text style={[styles.textoChip, acordou === c.chave && styles.textoChipAtivo]}>
                      {c.rotulo}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Passo
                rotulo="Cochilos no dia"
                valor={cochilos}
                sufixo="min"
                passo={15}
                max={LIMITES.cochilosMin.max}
                onMudar={setCochilos}
              />
            </Bloco>

            {/* ── Fatores ── */}
            <Bloco titulo="O que pode ter atrapalhado" icone="alert-circle-outline">
              <View style={styles.chips}>
                {FATORES.map(f => (
                  <Pressable
                    key={f.chave}
                    onPress={() =>
                      setFatores(atuais =>
                        atuais.includes(f.chave)
                          ? atuais.filter(x => x !== f.chave)
                          : [...atuais, f.chave],
                      )
                    }
                    style={({ pressed }) => [
                      styles.chip,
                      fatores.includes(f.chave) && styles.chipAtivo,
                      pressed && styles.chipPressionado,
                    ]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: fatores.includes(f.chave) }}
                  >
                    <Text
                      style={[styles.textoChip, fatores.includes(f.chave) && styles.textoChipAtivo]}
                    >
                      {f.rotulo}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {/* A frase existe porque estes três são o motivo de a seção estar
                  aqui, e não numa lista genérica de hábitos. */}
              <Text style={styles.ajudaCampo}>
                Cafeína, álcool e jantar pesado são os que a sua nutricionista consegue ajustar.
              </Text>

              <TextInput
                value={observacao}
                onChangeText={setObservacao}
                placeholder="Alguma outra coisa? (opcional)"
                placeholderTextColor={paleta().inkFraco}
                keyboardAppearance="dark"
                multiline
                maxLength={300}
                style={styles.campoObservacao}
                accessibilityLabel="Observação sobre a noite"
              />
            </Bloco>

            {/* ── Histórico ── */}
            {resumo && (
              <Bloco titulo="Suas últimas noites" icone="stats-chart-outline">
                <View style={styles.linhaResumo}>
                  <View style={styles.numeroResumo}>
                    <Text style={styles.rotuloNumero}>Média dormindo</Text>
                    <Text style={styles.valorNumero}>{duracao(Math.round(resumo.mediaDormindo))}</Text>
                  </View>
                  <View style={styles.numeroResumo}>
                    <Text style={styles.rotuloNumero}>Eficiência média</Text>
                    <Text style={styles.valorNumero}>{Math.round(resumo.mediaEficiencia)}%</Text>
                  </View>
                  {/* A terceira coluna é a que faltava. Dormir sete horas todo
                      dia entre meia-noite e sete não é a mesma coisa que dormir
                      sete horas indo para a cama às nove numa noite e às três na
                      outra — e as duas colunas ao lado dão o mesmo número para
                      os dois casos. */}
                  <View style={styles.numeroResumo}>
                    <Text style={styles.rotuloNumero}>Varia</Text>
                    <Text style={styles.valorNumero}>
                      {varia === null ? '—' : duracao(varia)}
                    </Text>
                  </View>
                </View>

                <FaixaDasNoites noites={noites} />
                {/* Sobre quantas noites a média foi feita. Uma média de duas
                    noites e uma de trinta não valem o mesmo. */}
                <Text style={styles.ajudaCampo}>
                  Sobre {resumo.quantas} {resumo.quantas === 1 ? 'noite registrada' : 'noites registradas'}.
                </Text>

                {resumo.fatoresFrequentes.length > 0 && (
                  <>
                    <Text style={styles.rotuloCampo}>O que mais se repete</Text>
                    {resumo.fatoresFrequentes.slice(0, 4).map(f => (
                      <View key={f.fator} style={styles.linhaFator}>
                        <Text style={styles.nomeFator}>{nomeDoFator(f.fator)}</Text>
                        <Text style={styles.vezesFator}>
                          {f.vezes} de {resumo.quantas}
                        </Text>
                      </View>
                    ))}
                  </>
                )}

                {noites.slice(0, 7).map(n => (
                  <Pressable
                    key={n.id}
                    onPress={() => setDia(n.data)}
                    style={({ pressed }) => [styles.linhaNoite, pressed && styles.chipPressionado]}
                    accessibilityRole="button"
                    accessibilityLabel={`Abrir a noite de ${rotuloDaNoite(n.data)}`}
                  >
                    <Text style={styles.dataNoite}>{rotuloDaNoite(n.data)}</Text>
                    <Text style={styles.duracaoNoite}>{duracao(tempoDormindo(n))}</Text>
                    {n.qualidade !== null && (
                      <View style={styles.seloQualidade}>
                        <Text style={styles.textoSeloQualidade}>{n.qualidade}/5</Text>
                      </View>
                    )}
                    <Pressable
                      onPress={() => apagar(n)}
                      hitSlop={10}
                      style={({ pressed }) => [styles.apagar, pressed && styles.apagarPressionado]}
                      accessibilityRole="button"
                      accessibilityLabel={`Apagar a noite de ${rotuloDaNoite(n.data)}`}
                    >
                      <Ionicons name="close" size={15} color={paleta().inkFraco} />
                    </Pressable>
                  </Pressable>
                ))}
              </Bloco>
            )}
          </ScrollView>

          <View style={[styles.rodape, { paddingBottom: Math.max(bottom, 16) }]}>
            <Pressable
              onPress={salvar}
              disabled={!horasOk || salvando}
              style={({ pressed }) => [
                styles.botao,
                (!horasOk || salvando) && styles.botaoDesligado,
                pressed && styles.botaoPressionado,
              ]}
              accessibilityRole="button"
            >
              {salvando ? (
                <ActivityIndicator color={paleta().cores.branco} />
              ) : (
                <Text style={styles.textoBotao}>
                  {salva ? 'Atualizar esta noite' : 'Salvar esta noite'}
                </Text>
              )}
            </Pressable>
          </View>
        </>
      )}

      {desfazivel && (
        <BarraDesfazer
          texto={`Noite de ${rotuloDaNoite(desfazivel.data)} apagada`}
          onDesfazer={desfazer}
          bottom={bottom + 16}
        />
      )}
    </KeyboardAvoidingView>
  )
}

/* Quando cada noite aconteceu, e não quanto ela durou.
 *
 * Sete traços no mesmo eixo — das 18h às 12h do dia seguinte. Quem deita e
 * levanta sempre na mesma hora vê sete traços alinhados; quem não, vê uma
 * escada. É a única leitura desta tela que se entende sem ler número nenhum, e
 * é a que o sono realmente pede: regularidade importa tanto quanto duração, e
 * a duração já está em todo o resto da tela.
 *
 * A lista chega do mais novo para o mais velho; aqui ela é invertida, porque um
 * gráfico que anda para trás no tempo mostra a evolução ao contrário. */
function FaixaDasNoites({ noites }: { noites: Noite[] }) {
  const styles = estilos()
  const ultimas = [...noites].sort((a, b) => a.data.localeCompare(b.data)).slice(-7)
  if (ultimas.length === 0) return null

  const largura = FIM_DA_FAIXA - INICIO_DA_FAIXA
  const posicao = (m: number) => Math.min(Math.max((m - INICIO_DA_FAIXA) / largura, 0), 1)

  return (
    <View style={styles.faixa}>
      {ultimas.map(n => {
        const de = posicao(minutoDaNoite(n.deitou))
        const ate = posicao(minutoDaNoite(n.levantou))
        const [ano, mes, dia] = n.data.split('-').map(Number)
        const diaSemana = new Date(ano, mes - 1, dia).getDay()

        return (
          <View key={n.id} style={styles.linhaFaixa}>
            <Text style={styles.diaFaixa}>{DIAS_CURTOS[diaSemana]}</Text>
            <View style={styles.trilhoFaixa}>
              <View
                style={[
                  styles.tracoFaixa,
                  {
                    left: `${de * 100}%`,
                    /* Um mínimo para a noite curtíssima não sumir: um traço
                       invisível seria lido como noite não registrada. */
                    width: `${Math.max(ate - de, 0.02) * 100}%`,
                  },
                ]}
              />
            </View>
          </View>
        )
      })}

      <View style={styles.eixoFaixa}>
        {['18h', '0h', '6h', '12h'].map(h => (
          <Text key={h} style={styles.marcaFaixa}>
            {h}
          </Text>
        ))}
      </View>
    </View>
  )
}

function Bloco({
  titulo,
  icone,
  children,
}: {
  titulo: string
  icone: keyof typeof Ionicons.glyphMap
  children: React.ReactNode
}) {
  const styles = estilos()
  return (
    <View style={styles.bloco}>
      <View style={styles.tituloBloco}>
        <Ionicons name={icone} size={16} color={paleta().cores.verde} />
        <Text style={styles.textoTituloBloco}>{titulo}</Text>
      </View>
      {children}
    </View>
  )
}

function CampoHora({
  rotulo,
  valor,
  onChange,
}: {
  rotulo: string
  valor: string
  onChange: (v: string) => void
}) {
  const styles = estilos()
  const invalido = validarHora(valor) !== null

  return (
    <View style={styles.blocoHora}>
      <Text style={styles.rotuloCampo}>{rotulo}</Text>
      <TextInput
        value={valor}
        onChangeText={v => onChange(mascaraHora(v))}
        keyboardType="number-pad"
        maxLength={5}
        style={[styles.campoHora, invalido && styles.campoComErro]}
        accessibilityLabel={`${rotulo}, hora e minuto`}
      />
    </View>
  )
}

/* Um número que se ajusta em passos, sem teclado.
 *
 * Em passos e não digitado porque nenhuma destas respostas é precisa: ninguém
 * sabe se demorou 23 ou 25 minutos para dormir. Um teclado numérico pediria uma
 * exatidão que a pessoa não tem e ainda cobraria o teclado subindo. */
function Passo({
  rotulo,
  valor,
  sufixo,
  passo,
  max,
  onMudar,
}: {
  rotulo: string
  valor: number | null
  sufixo: string
  passo: number
  max: number
  onMudar: (v: number | null) => void
}) {
  const styles = estilos()
  return (
    <View style={styles.linhaPasso}>
      <View style={styles.textoPasso}>
        <Text style={styles.rotuloPasso}>{rotulo}</Text>
        <Text style={styles.valorPasso}>
          {valor === null ? 'não informado' : `${valor} ${sufixo}`}
        </Text>
      </View>

      <Pressable
        /* De null vai direto para zero: "não informei" e "zero" são coisas
           diferentes, e o primeiro toque no menos declara o zero. */
        onPress={() => onMudar(valor === null ? 0 : Math.max(valor - passo, 0))}
        disabled={valor === 0}
        style={({ pressed }) => [
          styles.botaoPasso,
          valor === 0 && styles.botaoPassoDesligado,
          pressed && styles.botaoPassoPressionado,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Diminuir ${rotulo}`}
      >
        <Ionicons name="remove" size={19} color={valor === 0 ? paleta().inkFraco : paleta().cores.verde} />
      </Pressable>

      <Pressable
        onPress={() => onMudar(Math.min((valor ?? 0) + passo, max))}
        style={({ pressed }) => [styles.botaoPasso, pressed && styles.botaoPassoPressionado]}
        accessibilityRole="button"
        accessibilityLabel={`Aumentar ${rotulo}`}
      >
        <Ionicons name="add" size={19} color={paleta().cores.verde} />
      </Pressable>
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

  conteudo: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, gap: 14 },

  navegacao: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  setaDia: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.cores.verdeMenta,
    borderWidth: 1,
    borderColor: t.cores.verdeClaro,
  },
  setaPressionada: { backgroundColor: t.cores.verdeClaro },
  setaDesligada: { backgroundColor: t.cores.cartao, borderColor: t.cores.borda },
  centroNavegacao: { flex: 1, alignItems: 'center' },
  rotuloNoite: { fontSize: 16, fontWeight: '800', color: t.cores.ink },
  jaRegistrada: { marginTop: 2, fontSize: 11, fontWeight: '700', color: t.cores.verde },

  /* ── Cartão da noite ── */
  cartaoNoite: { borderRadius: 20, backgroundColor: t.cores.verde, padding: 18 },
  linhaTituloNoite: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  tituloNoite: { flex: 1, fontSize: 15, fontWeight: '700', color: t.cores.branco },
  linhaValorNoite: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 8 },
  valorNoite: { fontSize: 38, fontWeight: '800', color: t.cores.branco, letterSpacing: -1.2 },
  metaNoite: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.8)' },
  detalheNoite: { marginTop: 4, fontSize: 12.5, lineHeight: 18, color: 'rgba(255,255,255,0.9)' },
  linhaEficiencia: { marginTop: 12 },
  trilhoEficiencia: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden',
  },
  preenchimentoEficiencia: { height: '100%', borderRadius: 3, backgroundColor: t.cores.superficie },
  textoEficiencia: { marginTop: 6, fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },

  /* ── Blocos ── */
  bloco: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: t.cores.cartao,
    borderWidth: 1,
    borderColor: t.cores.borda,
    gap: 10,
  },
  tituloBloco: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  textoTituloBloco: { fontSize: 15, fontWeight: '800', color: t.cores.ink },
  rotuloCampo: { marginTop: 4, fontSize: 12.5, fontWeight: '700', color: t.inkMedio },
  ajudaCampo: { fontSize: 11, lineHeight: 15, color: t.inkFraco },
  ajudaErro: { fontSize: 11.5, color: t.cores.erroTexto },

  linhaHoras: { flexDirection: 'row', gap: 12 },
  blocoHora: { flex: 1 },
  campoHora: {
    marginTop: 6,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.borda,
    backgroundColor: t.cores.superficie,
    paddingHorizontal: 16,
    /* 16 é o mínimo que o iOS aceita sem dar zoom automático no campo. */
    fontSize: 19,
    fontWeight: '700',
    textAlign: 'center',
    color: t.cores.ink,
  },
  campoComErro: { borderColor: t.cores.erroBorda, backgroundColor: t.cores.erroFundo },

  linhaPasso: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  textoPasso: { flex: 1 },
  rotuloPasso: { fontSize: 13.5, fontWeight: '700', color: t.cores.ink },
  valorPasso: { marginTop: 1, fontSize: 12, color: t.inkSuave },
  botaoPasso: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.cores.verdeMenta,
    borderWidth: 1,
    borderColor: t.cores.verdeClaro,
  },
  botaoPassoPressionado: { backgroundColor: t.cores.verdeClaro },
  botaoPassoDesligado: { backgroundColor: t.cores.superficie, borderColor: t.cores.borda },

  notas: { flexDirection: 'row', gap: 8 },
  nota: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.cores.superficie,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  notaAtiva: { backgroundColor: t.cores.verde, borderColor: t.cores.verde },
  textoNota: { fontSize: 16, fontWeight: '800', color: t.cores.ink },
  textoNotaAtiva: { color: t.cores.branco },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: t.cores.superficie,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  chipAtivo: { backgroundColor: t.cores.verde, borderColor: t.cores.verde },
  chipPressionado: { backgroundColor: t.cores.verdeClaro, borderColor: t.cores.verdeClaro },
  textoChip: { fontSize: 12.5, fontWeight: '700', color: t.cores.ink },
  textoChipAtivo: { color: t.cores.branco },

  campoObservacao: {
    minHeight: 64,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.borda,
    backgroundColor: t.cores.superficie,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 16,
    lineHeight: 21,
    color: t.cores.ink,
    textAlignVertical: 'top',
  },

  /* ── Histórico ── */
  linhaResumo: { flexDirection: 'row', gap: 12 },

  faixa: { marginTop: 14, gap: 5 },
  linhaFaixa: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  diaFaixa: { width: 26, fontSize: 10.5, color: t.inkFraco },
  trilhoFaixa: { flex: 1, height: 10, borderRadius: 5, backgroundColor: t.cores.trilho },
  tracoFaixa: { position: 'absolute', top: 0, height: 10, borderRadius: 5, backgroundColor: t.cores.limao },
  /* Alinhado ao trilho, não ao bloco: as marcas precisam cair sobre o eixo, e o
     rótulo do dia ocupa a largura dele mais o espaço. */
  eixoFaixa: { flexDirection: 'row', justifyContent: 'space-between', marginLeft: 34, marginTop: 2 },
  marcaFaixa: { fontSize: 10, color: t.inkFraco },
  numeroResumo: { flex: 1 },
  rotuloNumero: { fontSize: 11.5, color: t.inkSuave },
  valorNumero: { marginTop: 2, fontSize: 20, fontWeight: '800', color: t.cores.verde },
  linhaFator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nomeFator: { fontSize: 13, color: t.inkMedio },
  vezesFator: { fontSize: 12, fontWeight: '700', color: t.inkFraco },

  linhaNoite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: t.cores.superficie,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  dataNoite: { flex: 1, fontSize: 13, color: t.inkMedio },
  duracaoNoite: { fontSize: 13.5, fontWeight: '800', color: t.cores.ink },
  seloQualidade: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: t.cores.verdeClaro,
  },
  textoSeloQualidade: { fontSize: 10.5, fontWeight: '800', color: t.cores.verdeEscuro },
  apagar: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  apagarPressionado: { backgroundColor: t.cores.trilho },

  blocoErro: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.cores.erroBorda,
    backgroundColor: t.cores.erroFundo,
  },
  tituloErro: { fontSize: 13.5, fontWeight: '700', color: t.cores.erroTexto },
  detalheErro: { marginTop: 5, fontSize: 12.5, lineHeight: 18, color: t.cores.erroTexto },

  rodape: {
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: t.cores.borda,
    backgroundColor: t.cores.fundo,
  },
  botao: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.cores.verde,
  },
  botaoPressionado: { backgroundColor: t.cores.verdeEscuro },
  botaoDesligado: { backgroundColor: t.cores.trilho },
  textoBotao: { fontSize: 15.5, fontWeight: '700', color: t.cores.branco },
  }),
)
