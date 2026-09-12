import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import {
  estadoDoResumoDaPaciente,
  pedirResumoDaPaciente,
  type AnamneseDaPaciente,
  type CalculoEnergeticoDaPaciente,
  type ExameDaPaciente,
} from '../lib/dossieDaPaciente'
import {
  ddmmaaaa,
  rotuloDoMarcador,
  type EstadoDoResumo,
  type Marcador,
  type ResumoDaAurora as Resumo,
} from '../lib/leituraDoProntuario'
import type { Medida } from '../lib/pacientesDaNutri'
import { decimal, milhar } from '../lib/formatar'
import { FONTE } from '../lib/fontes'
import { estilosDe, paleta } from '../lib/tema'
import { GraficoDaEvolucao } from './GraficoDaEvolucao'

/* As seções de LEITURA do prontuário, abertas pela ficha dentro da moldura de
 * `DossieDaPacienteScreen`.
 *
 * Num arquivo à parte porque a moldura já tinha 640 linhas com o plano
 * terapêutico e as consultas, e estas cinco dobrariam isso. A moldura continua
 * uma só -- cabeçalho, voltar, puxar para reler, erro --; o miolo mora aqui.
 *
 * O critério de tudo o que está aqui: é o que ela olharia com a paciente na
 * frente. O que é para DIGITAR continua no computador. */

// ════════════════════════════ ANAMNESE ════════════════════════════

export function Anamneses({ anamneses, nome }: { anamneses: AnamneseDaPaciente[]; nome: string }) {
  const styles = estilos()
  /* A mais recente aberta; as outras fechadas, uma linha cada. Duas anamneses
     inteiras empilhadas são uma rolagem de vinte telas -- e quem abre quer a
     de agora. A de antes é para comparar, e ela escolhe qual. */
  const [aberta, setAberta] = useState<number | null>(anamneses[0]?.id ?? null)

  if (anamneses.length === 0) {
    return <Vazio icone="document-text-outline" texto={`${nome} ainda não tem anamnese preenchida.`} />
  }

  return (
    <>
      {anamneses.map(a => {
        const estaAberta = aberta === a.id
        const respondidas = a.secoes.filter(s => s.campos.length > 0)
        return (
          <View key={a.id} style={styles.cartao}>
            <Pressable
              onPress={() => setAberta(estaAberta ? null : a.id)}
              style={styles.topoTocavel}
              accessibilityRole="button"
              accessibilityState={{ expanded: estaAberta }}
              accessibilityLabel={`${a.titulo}, ${ddmmaaaa(a.quando) || 'sem data'}`}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.titulo}>{a.titulo}</Text>
                <Text style={styles.sub}>{ddmmaaaa(a.quando) || 'Sem data'}</Text>
              </View>
              <Ionicons
                name={estaAberta ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={paleta().inkFraco}
              />
            </Pressable>

            {estaAberta && (
              <View style={styles.corpo}>
                {respondidas.length === 0 && (
                  <Text style={styles.fraco}>Nenhuma pergunta respondida nesta anamnese.</Text>
                )}
                {respondidas.map((s, i) => (
                  <View key={i} style={styles.secao}>
                    {/* Documento importado tem uma seção só, chamada "Anamnese",
                        e o título repetiria o do cartão. */}
                    {!a.importado && <Text style={styles.rotuloDeSecao}>{s.titulo.toUpperCase()}</Text>}
                    {s.campos.map((c, j) => (
                      <View key={j} style={styles.campo}>
                        {!a.importado && <Text style={styles.pergunta}>{c.rotulo}</Text>}
                        {c.linhas.map((l, k) => (
                          <Text key={k} style={styles.resposta} selectable>
                            {l}
                          </Text>
                        ))}
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            )}
          </View>
        )
      })}
      <Text style={styles.rodape}>
        Só as perguntas respondidas aparecem. Preencher e editar continua no sistema.
      </Text>
    </>
  )
}

// ════════════════════════════ EXAMES ════════════════════════════

export function Exames({ exames, nome }: { exames: ExameDaPaciente[]; nome: string }) {
  const styles = estilos()
  if (exames.length === 0) {
    return <Vazio icone="flask-outline" texto={`${nome} ainda não tem exame enviado.`} />
  }
  return (
    <>
      {/* O PRIMEIRO aberto, os outros fechados.
          "O exame não dá pra recolher e expandir?" -- cada exame são dezenas de
          marcadores, e quatro exames abertos viram uma rolagem de vinte telas
          para achar o de hoje. O de cima é o mais recente, que é o que ela
          abriu a tela para ver. */}
      {exames.map((e, i) => (
        <Exame key={e.id} exame={e} comecaAberto={i === 0} />
      ))}
      <Text style={styles.rodape}>
        A leitura de cada exame é a que você fez no sistema. Exame sem leitura foi
        enviado e ainda não foi analisado.
      </Text>
    </>
  )
}

function Exame({ exame: e, comecaAberto }: { exame: ExameDaPaciente; comecaAberto: boolean }) {
  const styles = estilos()
  const [aberto, setAberto] = useState(comecaAberto)
  /* Os normais ficam recolhidos: num hemograma são trinta linhas que dizem
     "está tudo bem", e o que ela procura é o que NÃO está. */
  const [verNormais, setVerNormais] = useState(false)
  const l = e.leitura
  const destaque = l?.marcadores.filter(m => m.status !== 'normal') ?? []
  const normais = l?.marcadores.filter(m => m.status === 'normal') ?? []

  return (
    <View style={styles.cartao}>
      <Pressable
        onPress={() => setAberto(a => !a)}
        style={styles.topoTocavel}
        accessibilityRole="button"
        accessibilityState={{ expanded: aberto }}
        accessibilityLabel={e.nome + ', ' + (ddmmaaaa(e.quando) || 'sem data')}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.titulo}>{e.nome}</Text>
          <Text style={styles.sub}>
            {[ddmmaaaa(e.quando) ? 'Coleta ' + ddmmaaaa(e.quando) : null, contagem(l)].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Ionicons
          name={aberto ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={paleta().inkFraco}
        />
      </Pressable>

      {/* FECHADO, o que sobra é o cabeçalho -- e ele já diz o que importa de
          relance: a data e quantos estão fora da referência. */}
      {!aberto && (l?.criticos ?? 0) + (l?.alterados ?? 0) > 0 && (
        <Text style={styles.fraco}>Toque para ver o que está fora da referência.</Text>
      )}

      {aberto && !l && <Text style={styles.fraco}>Ainda sem leitura.</Text>}
      {aberto && !!l?.resumo && (
        <Text style={styles.texto} selectable>
          {l.resumo}
        </Text>
      )}

      {aberto &&
        destaque.map((m, i) => (
          <LinhaDoMarcador key={'d' + i} m={m} />
        ))}

      {aberto &&
        normais.length > 0 &&
        (verNormais ? (
          normais.map((m, i) => <LinhaDoMarcador key={'n' + i} m={m} />)
        ) : (
          <Pressable
            onPress={() => setVerNormais(true)}
            style={styles.verMais}
            accessibilityRole="button"
          >
            <Text style={styles.textoVerMais}>
              {normais.length === 1 ? 'Ver o 1 dentro da referência' : `Ver os ${normais.length} dentro da referência`}
            </Text>
          </Pressable>
        ))}

      {aberto && !!e.observacoes && (
        <Text style={styles.fraco} selectable>
          {e.observacoes}
        </Text>
      )}
    </View>
  )
}

function contagem(l: ExameDaPaciente['leitura']): string | null {
  if (!l || !l.marcadores.length) return null
  const partes: string[] = []
  if (l.criticos) partes.push(l.criticos === 1 ? '1 crítico' : l.criticos + ' críticos')
  if (l.alterados) partes.push(l.alterados === 1 ? '1 alterado' : l.alterados + ' alterados')
  /* "Tudo na referência" só quando é verdade: marcador sem referência no laudo
     não está nem dentro nem fora, e não entra nessa conta. */
  if (!partes.length && l.marcadores.every(m => m.status === 'normal')) partes.push('tudo na referência')
  return partes.length ? partes.join(', ') : null
}

function LinhaDoMarcador({ m }: { m: Marcador }) {
  const styles = estilos()
  const t = paleta()
  const selo =
    m.status === 'critico'
      ? { backgroundColor: t.cores.erroFundo, color: t.cores.erroTexto }
      : m.status === 'alto' || m.status === 'baixo'
        ? { backgroundColor: t.cores.atencaoFundo, color: t.cores.gold }
        : { backgroundColor: t.cores.trilho, color: t.inkSuave }
  return (
    <View style={styles.marcador}>
      <View style={styles.linhaDoMarcador}>
        <Text style={styles.nomeDoMarcador}>{m.nome}</Text>
        <Text style={styles.valorDoMarcador} selectable>
          {m.valor ?? '—'}
          {m.unidade ? ' ' + m.unidade : ''}
        </Text>
      </View>
      <View style={styles.linhaDoMarcador}>
        <Text style={styles.referencia}>{m.referencia ? 'Ref. ' + m.referencia : 'Sem referência no laudo'}</Text>
        <Text style={[styles.selo, { backgroundColor: selo.backgroundColor, color: selo.color }]}>
          {rotuloDoMarcador(m.status)}
        </Text>
      </View>
      {!!m.interpretacao && m.status !== 'normal' && <Text style={styles.fraco}>{m.interpretacao}</Text>}
    </View>
  )
}

// ════════════════════════════ CÁLCULO ENERGÉTICO ════════════════════════════

export function Energetico({ calculos, nome }: { calculos: CalculoEnergeticoDaPaciente[]; nome: string }) {
  const styles = estilos()
  if (calculos.length === 0) {
    return <Vazio icone="flame-outline" texto={`${nome} ainda não tem cálculo energético.`} />
  }
  const [c, ...antes] = calculos
  return (
    <>
      <View style={styles.cartao}>
        <Text style={styles.rotuloDeSecao}>O QUE VALE · {ddmmaaaa(c.quando)}</Text>
        <View style={styles.numeros}>
          <Grande rotulo="Gasto total" valor={c.get !== null ? milhar(c.get) : '—'} unidade="kcal" />
          <Grande rotulo="Basal" valor={c.tmb !== null ? milhar(c.tmb) : '—'} unidade="kcal" />
        </View>
        <Linha rotulo="Fórmula" valor={c.formula} />
        <Linha
          rotulo="Com"
          valor={[
            c.peso !== null ? decimal(c.peso, 1) + ' kg' : null,
            c.altura !== null ? decimal(c.altura, 0) + ' cm' : null,
            c.idade !== null ? Math.round(c.idade) + ' anos' : null,
          ]
            .filter(Boolean)
            .join(' · ') || '—'}
        />
        {c.fatorAtividade !== null && <Linha rotulo="Fator de atividade" valor={'× ' + fator(c.fatorAtividade)} />}
        {/* O fator de injúria só aparece quando muda alguma coisa: 1,0 é "sem
            injúria", e uma linha dizendo isso em toda ficha é ruído. */}
        {c.fatorLesao !== null && c.fatorLesao !== 1 && (
          <Linha rotulo="Fator de injúria" valor={'× ' + fator(c.fatorLesao)} />
        )}
        {!!c.adicionalGestante && <Linha rotulo="Adicional gestacional" valor={'+ ' + milhar(c.adicionalGestante) + ' kcal'} />}
        {c.pesoAlvo !== null && <Linha rotulo="Peso-alvo" valor={decimal(c.pesoAlvo, 1) + ' kg'} />}
        {c.proteinaGkg !== null && <Linha rotulo="Proteína" valor={decimal(c.proteinaGkg, 1) + ' g/kg'} />}
        {c.carboPct !== null && <Linha rotulo="Carboidrato" valor={decimal(c.carboPct, 0) + '%'} />}
        {!!c.observacoes && (
          <Text style={styles.texto} selectable>
            {c.observacoes}
          </Text>
        )}
      </View>

      {antes.length > 0 && (
        <View style={styles.cartao}>
          <Text style={styles.rotuloDeSecao}>ANTES</Text>
          {antes.map(a => (
            <Linha
              key={a.id}
              rotulo={ddmmaaaa(a.quando)}
              valor={(a.get !== null ? milhar(a.get) + ' kcal' : '—') + ' · ' + a.formula}
            />
          ))}
        </View>
      )}
      <Text style={styles.rodape}>Um cálculo novo se faz no sistema; o mais recente é o que vale.</Text>
    </>
  )
}

/* "1,55", "1,375" -- sem casas fixas: fator é o número da tabela, e arredondar
   1,375 para 1,38 mostraria um fator que não existe. */
const fator = (n: number) => String(n).replace('.', ',')

// ════════════════════════════ EVOLUÇÃO ════════════════════════════

/* Quais medidas a evolução sabe desenhar. A ordem é a da conversa: peso
   primeiro, porque é o que a paciente pergunta; composição depois. */
type MedidaDoGrafico = {
  chave: string
  rotulo: string
  unidade: string
  casas: number
  valor: (m: Medida) => number | null
}

const MEDIDAS_DO_GRAFICO: MedidaDoGrafico[] = [
  { chave: 'peso', rotulo: 'Peso', unidade: ' kg', casas: 1, valor: m => m.peso },
  { chave: 'imc', rotulo: 'IMC', unidade: '', casas: 1, valor: m => m.imc },
  { chave: 'gordura', rotulo: 'Gordura', unidade: '%', casas: 1, valor: m => m.gordura },
  { chave: 'cintura', rotulo: 'Cintura', unidade: ' cm', casas: 1, valor: m => m.cintura },
  { chave: 'massaMagra', rotulo: 'Massa magra', unidade: ' kg', casas: 1, valor: m => m.massaMagra },
]

/* Na criança o IMC não se lê pela faixa do adulto, e sim pelo escore z do
   IMC para a idade -- o sistema tem uma tela de curva de crescimento por isso. */
const IMC_DA_CRIANCA: MedidaDoGrafico = {
  chave: 'zImcIdade',
  rotulo: 'IMC/idade (z)',
  unidade: '',
  casas: 2,
  valor: m => m.zImcIdade,
}

export function Evolucao({ medidas, nome }: { medidas: Medida[]; nome: string }) {
  const styles = estilos()
  const [escolhida, setEscolhida] = useState('peso')
  const [detalhes, setDetalhes] = useState(false)
  /* A largura do gráfico vem do layout: o SVG precisa de número, e "100%" daria
     um traçado esticado errado. */
  const [largura, setLargura] = useState(0)

  if (medidas.length === 0) {
    return <Vazio icone="analytics-outline" texto={`${nome} ainda não tem avaliação com medidas.`} />
  }

  const crianca = medidas.some(m => m.zImcIdade !== null)
  const disponiveis = (crianca
    ? MEDIDAS_DO_GRAFICO.map(x => (x.chave === 'imc' ? IMC_DA_CRIANCA : x))
    : MEDIDAS_DO_GRAFICO
  ).filter(x => medidas.some(m => x.valor(m) !== null))

  /* Nenhuma medida com número em nenhuma avaliação: a paciente tem avaliação
     sem nada preenchido, e o gráfico seria uma moldura vazia. */
  if (disponiveis.length === 0) {
    return <Vazio icone="analytics-outline" texto={`As avaliações de ${nome} ainda não têm números.`} />
  }

  const medida = disponiveis.find(x => x.chave === escolhida) ?? disponiveis[0]

  /* Do mais ANTIGO para o mais novo -- a lista vem ao contrário, que é a ordem
     de leitura da ficha, e não a de uma linha do tempo. E só o que tem número:
     ponto inventado no meio afirmaria uma medida que ninguém fez. */
  const serie = [...medidas]
    .reverse()
    .map(m => ({ quando: m.quando, valor: medida.valor(m) }))
    .filter((p): p is { quando: string; valor: number } => p.valor !== null)

  const primeiro = serie[0]
  const ultimo = serie[serie.length - 1]
  const variacao = serie.length > 1 && primeiro && ultimo ? ultimo.valor - primeiro.valor : null

  return (
    <>
      {/* ── O GRÁFICO ── */}
      <View style={styles.cartao} onLayout={e => setLargura(e.nativeEvent.layout.width - 28)}>
        {/* As medidas como abas: ela toca no que quer ver, e o gráfico troca.
            Cinco gráficos empilhados seriam cinco rolagens para comparar duas
            coisas. */}
        <View style={styles.abasDaMedida}>
          {disponiveis.map(x => {
            const atual = x.chave === medida.chave
            return (
              <Pressable
                key={x.chave}
                onPress={() => setEscolhida(x.chave)}
                style={({ pressed }) => [
                  styles.abaDaMedida,
                  atual && styles.abaDaMedidaEscolhida,
                  pressed && { opacity: 0.8 },
                ]}
                accessibilityRole="tab"
                accessibilityState={{ selected: atual }}
              >
                <Text style={[styles.textoDaAbaDaMedida, atual && styles.textoDaAbaEscolhida]}>
                  {x.rotulo}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {serie.length === 0 ? (
          <Text style={styles.fraco}>Sem número de {medida.rotulo.toLowerCase()} nas avaliações.</Text>
        ) : serie.length === 1 ? (
          /* Um ponto não é uma linha. Dizer isso é melhor do que desenhar um
             traço reto que sugere estabilidade que ninguém mediu. */
          <View style={styles.soUmPonto}>
            <Text style={styles.numeroSozinho}>
              {decimal(serie[0].valor, medida.casas)}
              <Text style={styles.unidade}>{medida.unidade}</Text>
            </Text>
            <Text style={styles.fraco}>
              Uma avaliação só. A linha começa a existir na segunda.
            </Text>
          </View>
        ) : (
          <>
            <GraficoDaEvolucao
              pontos={serie}
              unidade={medida.unidade}
              casas={medida.casas}
              largura={largura}
            />

            {/* A frase que ela usa na consulta. Sem cor de bom ou ruim: quem
                está em ganho de massa sobe de propósito, e pintar isso de
                vermelho seria o app dando conduta. */}
            {variacao !== null && (
              <Text style={styles.frase}>
                {Math.abs(variacao) < Math.pow(10, -medida.casas) / 2
                  ? `${medida.rotulo} estável entre as ${serie.length} avaliações.`
                  : `${variacao > 0 ? 'Subiu' : 'Desceu'} ${decimal(Math.abs(variacao), medida.casas)}${medida.unidade} em ${serie.length} avaliações, de ${ddmmaaaa(primeiro.quando)} a ${ddmmaaaa(ultimo.quando)}.`}
              </Text>
            )}
          </>
        )}
      </View>

      {/* ── OS NÚMEROS, quando ela quiser ──
          A tabela responde "quanto era em agosto", que é pergunta de conferência
          e não de conversa. Fechada por padrão: quem abriu a evolução veio ver a
          direção. */}
      <Pressable
        onPress={() => setDetalhes(d => !d)}
        style={({ pressed }) => [styles.verNumeros, pressed && { opacity: 0.8 }]}
        accessibilityRole="button"
        accessibilityState={{ expanded: detalhes }}
      >
        <Ionicons name="list-outline" size={15} color={paleta().cores.verde} />
        <Text style={styles.textoVerNumeros}>
          {detalhes ? 'Esconder os números' : `Ver os números das ${medidas.length} avaliações`}
        </Text>
        <Ionicons
          name={detalhes ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={paleta().cores.verde}
        />
      </Pressable>

      {detalhes &&
        medidas.map((m, i) => (
          <View key={i} style={styles.cartao}>
            <Text style={styles.rotuloDeSecao}>{ddmmaaaa(m.quando) || 'Sem data'}</Text>
            <View style={styles.grade}>
              <Celula rotulo="Peso" valor={m.peso} unidade=" kg" />
              <Celula rotulo="Altura" valor={m.altura} unidade=" cm" casas={0} />
              {crianca ? (
                <Celula rotulo="z IMC/idade" valor={m.zImcIdade} casas={2} />
              ) : (
                <Celula rotulo="IMC" valor={m.imc} />
              )}
              <Celula rotulo="Gordura" valor={m.gordura} unidade="%" />
              <Celula rotulo="Cintura" valor={m.cintura} unidade=" cm" />
              {!crianca && <Celula rotulo="Massa magra" valor={m.massaMagra} unidade=" kg" />}
            </View>
          </View>
        ))}

      <Text style={styles.rodape}>
        As {medidas.length} avaliações mais recentes. Dobras, circunferências e
        curvas de crescimento estão no sistema.
      </Text>
    </>
  )
}

function Variacao({
  rotulo,
  de,
  para,
  unidade,
  casas = 1,
}: {
  rotulo: string
  de: number | null
  para: number | null
  unidade: string
  casas?: number
}) {
  const styles = estilos()
  /* Sem os dois números não há variação. Some a linha, em vez de "—" que se
     lê como "não mudou". */
  if (de === null || para === null) return null
  const d = para - de
  const u = unidade ? (unidade === '%' ? '%' : ' ' + unidade) : ''
  const sinal = Math.abs(d) < Math.pow(10, -casas) / 2 ? '=' : d > 0 ? '+' : '−'
  return (
    <View style={styles.linha}>
      <Text style={styles.rotuloDaLinha}>{rotulo}</Text>
      <Text style={styles.valorDaLinha}>
        {decimal(de, casas)} → {decimal(para, casas)}
        {u}
        {sinal !== '=' ? `  (${sinal}${decimal(Math.abs(d), casas)})` : '  (igual)'}
      </Text>
    </View>
  )
}

function Celula({
  rotulo,
  valor,
  unidade = '',
  casas = 1,
}: {
  rotulo: string
  valor: number | null
  unidade?: string
  casas?: number
}) {
  const styles = estilos()
  return (
    <View style={styles.celula}>
      <Text style={styles.rotuloDaCelula}>{rotulo}</Text>
      <Text style={styles.valorDaCelula}>{valor !== null ? decimal(valor, casas) + unidade : '—'}</Text>
    </View>
  )
}

// ════════════════════════════ O RESUMO DA AURORA ════════════════════════════

/* De quanto em quanto perguntar enquanto a Aurora lê. Seis segundos, como no
   sistema: a leitura leva dezenas de segundos, e perguntar mais rápido é só
   barulho na rede. E um teto, para o celular não ficar perguntando para sempre
   por uma leitura que morreu do outro lado: dez minutos. */
const INTERVALO = 6000
const MAX_VOLTAS = 100

export function ResumoDaAurora({
  pacienteId,
  nome,
  versao,
}: {
  pacienteId: number
  nome: string
  /* Sobe quando ela puxa a tela para reler. */
  versao: number
}) {
  const styles = estilos()
  const [estado, setEstado] = useState<EstadoDoResumo | null>(null)
  const [erro, setErro] = useState('')
  const [pedindo, setPedindo] = useState(false)

  const vivo = useRef(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const voltas = useRef(0)

  const parar = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }

  /* Lê e, se a Aurora ainda estiver lendo, marca a próxima pergunta. Um ciclo
     só, usado na abertura e depois do pedido: é o mesmo desenho do sistema. */
  const ler = useCallback(async () => {
    parar()
    const r = await estadoDoResumoDaPaciente(pacienteId)
    if (!vivo.current) return
    if (r.tipo === 'erro') {
      setErro(r.mensagem)
      return
    }
    setEstado(r.estado)
    if (r.estado.calculando) {
      voltas.current += 1
      if (voltas.current > MAX_VOLTAS) {
        setErro('A leitura passou muito do tempo esperado. Puxe a tela para conferir de novo.')
        return
      }
      setErro('')
      timer.current = setTimeout(() => void ler(), INTERVALO)
      return
    }
    /* Terminou. O erro gravado pela leitura que falhou é o que explica por que
       não apareceu nada -- e só vale se não houver resumo novo por cima. */
    setErro(r.estado.erro && !r.estado.resumo ? 'A última leitura não terminou: ' + r.estado.erro : '')
  }, [pacienteId])

  useEffect(() => {
    vivo.current = true
    voltas.current = 0
    void ler()
    return () => {
      vivo.current = false
      parar()
    }
  }, [ler, versao])

  const pedir = async () => {
    setPedindo(true)
    setErro('')
    const r = await pedirResumoDaPaciente(pacienteId)
    if (!vivo.current) return
    setPedindo(false)
    if (r.tipo === 'recusado') {
      setErro(r.mensagem)
      void ler()
      return
    }
    voltas.current = 0
    /* `calculando` no estado já na hora, sem esperar a primeira volta: sem
       isto, o botão reapareceria por seis segundos e convidaria a um segundo
       toque -- que gastaria a segunda leitura do dia. */
    setEstado(e => (e ? { ...e, calculando: true } : e))
    void ler()
  }

  if (!estado && !erro) {
    return (
      <View style={styles.centroPequeno}>
        <ActivityIndicator color={paleta().cores.verde} />
      </View>
    )
  }

  const calculando = !!estado?.calculando || pedindo
  const r = estado?.resumo ?? null
  const semCota = estado?.restamHoje === 0

  return (
    <>
      {!!erro && <Text style={styles.erro}>{erro}</Text>}

      {calculando && (
        /* CENTRADO, e não um cartão solto no alto.
           Relatado com foto: "desenquadrado". Numa tela que fica vazia enquanto
           a Aurora lê, um cartão colado no cabeçalho parece pedaço de coisa que
           não carregou -- e ainda ficava embaixo do botão redondo do sistema,
           no canto. No meio da tela, com a roda em cima do texto, o vazio em
           volta vira espera, que é o que ele é. */
        <View style={styles.lendo}>
          <ActivityIndicator color={paleta().cores.verde} size="large" />
          <Text style={styles.textoDoLendo}>A Aurora está lendo a ficha de {nome}</Text>
          <Text style={styles.detalheDoLendo}>
            Leva perto de um minuto. Você pode sair desta tela: a leitura continua e fica
            guardada.
          </Text>
        </View>
      )}

      {!r && !calculando && (
        <View style={styles.cartao}>
          <Text style={styles.titulo}>Ainda sem resumo</Text>
          <Text style={styles.texto}>
            A Aurora lê a ficha inteira (anamnese, exames, medidas, plano e o que{' '}
            {nome} registrou no app) e devolve o que merece atenção, o que está indo
            bem e o que falta saber. É o mesmo resumo da aba Aurora no sistema.
          </Text>
        </View>
      )}

      {!calculando && estado && (
        <Pressable
          onPress={semCota ? undefined : () => void pedir()}
          disabled={semCota}
          style={({ pressed }) => [styles.botao, semCota && styles.botaoApagado, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityState={{ disabled: semCota }}
        >
          <Ionicons name="sparkles" size={16} color={semCota ? paleta().inkFraco : paleta().cores.sobreLimao} />
          <Text style={[styles.textoDoBotao, semCota && { color: paleta().inkFraco }]}>
            {semCota
              ? `As ${estado.limiteDiario} leituras de hoje já foram usadas`
              : r
                ? 'Gerar um resumo novo'
                : 'Gerar o resumo'}
          </Text>
        </Pressable>
      )}
      {!calculando && estado && estado.restamHoje !== null && !semCota && (
        <Text style={styles.rodape}>
          {estado.restamHoje === 1
            ? 'Resta 1 leitura hoje para esta paciente, somando celular e sistema.'
            : `Restam ${estado.restamHoje} leituras hoje para esta paciente, somando celular e sistema.`}
        </Text>
      )}

      {r && <LeituraDaAurora resumo={r} geradoEm={estado?.geradoEm ?? null} velha={!!estado?.velha} />}
    </>
  )
}

function LeituraDaAurora({ resumo: r, geradoEm, velha }: { resumo: Resumo; geradoEm: string | null; velha: boolean }) {
  const styles = estilos()
  return (
    <>
      <View style={styles.cartao}>
        <Text style={styles.rotuloDeSecao}>
          RESUMO{geradoEm ? ' · ' + quandoFoi(geradoEm) : ''}
        </Text>
        {/* Aviso, e não gatilho: a ficha mudou depois desta leitura. Pedir outra
            é decisão dela -- gasta uma das duas do dia. */}
        {velha && (
          <Text style={styles.aviso}>A ficha mudou depois desta leitura.</Text>
        )}
        {!!r.resumo && (
          <Text style={styles.texto} selectable>
            {r.resumo}
          </Text>
        )}
      </View>

      {r.deficits.length > 0 && (
        <Bloco titulo="PEDE ATENÇÃO">
          {r.deficits.map((d, i) => (
            <Achado key={i} titulo={d.titulo} detalhe={d.detalhe} evidencia={d.evidencia} marca={d.gravidade} />
          ))}
        </Bloco>
      )}
      {r.pontosFortes.length > 0 && (
        <Bloco titulo="INDO BEM">
          {r.pontosFortes.map((d, i) => (
            <Achado key={i} titulo={d.titulo} detalhe={d.detalhe} evidencia={d.evidencia} />
          ))}
        </Bloco>
      )}
      {r.evolucao.length > 0 && (
        <Bloco titulo="EVOLUÇÃO">
          {r.evolucao.map((d, i) => (
            <Achado key={i} titulo={d.indicador} detalhe={d.detalhe} evidencia={d.evidencia} marca={d.direcao} />
          ))}
        </Bloco>
      )}
      {r.cenarios.length > 0 && (
        <Bloco titulo="SE NADA MUDAR">
          {r.cenarios.map((c, i) => (
            <Achado
              key={i}
              titulo={'Se ' + c.se}
              detalhe={c.entao}
              evidencia={[c.prazo, c.confianca ? 'confiança ' + c.confianca : ''].filter(Boolean).join(' · ')}
            />
          ))}
        </Bloco>
      )}
      {r.prevencoes.length > 0 && (
        <Bloco titulo="PARA PREVENIR">
          {r.prevencoes.map((p, i) => (
            <Achado key={i} titulo={p.acao} detalhe={p.motivo} evidencia="" marca={p.prioridade} />
          ))}
        </Bloco>
      )}
      {r.lacunas.length > 0 && (
        <Bloco titulo="O QUE FALTA SABER">
          {r.lacunas.map((l, i) => (
            <Achado key={i} titulo={l.oQueFalta} detalhe={l.porQueImporta} evidencia="" />
          ))}
        </Bloco>
      )}
      <Text style={styles.rodape}>
        Leitura de apoio, feita pela Aurora a partir da ficha. A conduta é sua.
      </Text>
    </>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  const styles = estilos()
  return (
    <View style={styles.cartao}>
      <Text style={styles.rotuloDeSecao}>{titulo}</Text>
      {children}
    </View>
  )
}

function Achado({
  titulo,
  detalhe,
  evidencia,
  marca,
}: {
  titulo: string
  detalhe: string
  evidencia: string
  marca?: string
}) {
  const styles = estilos()
  return (
    <View style={styles.achado}>
      <View style={styles.linhaDoMarcador}>
        <Text style={styles.nomeDoMarcador}>{titulo}</Text>
        {!!marca && <Text style={[styles.selo, styles.seloNeutro]}>{marca}</Text>}
      </View>
      {!!detalhe && (
        <Text style={styles.texto} selectable>
          {detalhe}
        </Text>
      )}
      {!!evidencia && <Text style={styles.fraco}>{evidencia}</Text>}
    </View>
  )
}

/* "10/09 às 14:32" -- instante, e por isso passa por `Date` (hora local). */
function quandoFoi(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const d = new Date(t)
  const dois = (n: number) => String(n).padStart(2, '0')
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)} às ${dois(d.getHours())}:${dois(d.getMinutes())}`
}

// ════════════════════════════ miúdos ════════════════════════════

function Vazio({ icone, texto }: { icone: React.ComponentProps<typeof Ionicons>['name']; texto: string }) {
  const styles = estilos()
  return (
    <View style={styles.vazio}>
      <Ionicons name={icone} size={22} color={paleta().inkFraco} />
      <Text style={styles.textoVazio}>{texto}</Text>
    </View>
  )
}

function Grande({ rotulo, valor, unidade }: { rotulo: string; valor: string; unidade: string }) {
  const styles = estilos()
  return (
    <View style={{ flex: 1, gap: 1 }}>
      <Text style={styles.rotuloDaCelula}>{rotulo}</Text>
      <Text style={styles.numeroGrande}>
        {valor}
        <Text style={styles.unidade}> {unidade}</Text>
      </Text>
    </View>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  const styles = estilos()
  return (
    <View style={styles.linha}>
      <Text style={styles.rotuloDaLinha}>{rotulo}</Text>
      <Text style={styles.valorDaLinha} selectable>
        {valor}
      </Text>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    cartao: {
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 8,
    },
    topoTocavel: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    corpo: { gap: 12, paddingTop: 4 },
    titulo: { fontFamily: FONTE.meia, fontSize: 15, color: t.cores.ink },
    sub: { fontFamily: FONTE.normal, fontSize: 12.5, color: t.inkFraco, fontVariant: ['tabular-nums'] },
    texto: { fontFamily: FONTE.normal, fontSize: 14, color: t.inkSuave, lineHeight: 20 },
    fraco: { fontFamily: FONTE.normal, fontSize: 12.5, color: t.inkFraco, lineHeight: 18 },
    aviso: {
      fontFamily: FONTE.meia,
      fontSize: 12.5,
      color: t.cores.gold,
      backgroundColor: t.cores.atencaoFundo,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      overflow: 'hidden',
    },
    erro: {
      fontFamily: FONTE.normal,
      fontSize: 13.5,
      color: t.cores.ink,
      backgroundColor: t.cores.verdeMenta,
      padding: 12,
      borderRadius: 10,
      overflow: 'hidden',
    },
    rotuloDeSecao: { fontFamily: FONTE.forte, fontSize: 10.5, color: t.inkFraco, letterSpacing: 0.8 },
    secao: { gap: 8 },
    campo: { gap: 2 },
    pergunta: { fontFamily: FONTE.normal, fontSize: 12.5, color: t.inkFraco },
    resposta: { fontFamily: FONTE.normal, fontSize: 14, color: t.cores.ink, lineHeight: 20 },

    marcador: { gap: 3, paddingTop: 8, borderTopWidth: 1, borderTopColor: t.cores.borda },
    linhaDoMarcador: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    nomeDoMarcador: { flex: 1, fontFamily: FONTE.meia, fontSize: 14, color: t.cores.ink },
    valorDoMarcador: { fontFamily: FONTE.meia, fontSize: 14, color: t.cores.ink, fontVariant: ['tabular-nums'] },
    referencia: { flex: 1, fontFamily: FONTE.normal, fontSize: 12, color: t.inkFraco },
    selo: {
      fontFamily: FONTE.meia,
      fontSize: 11,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
      overflow: 'hidden',
    },
    seloNeutro: { backgroundColor: t.cores.trilho, color: t.inkSuave },
    verMais: { paddingTop: 8, borderTopWidth: 1, borderTopColor: t.cores.borda },
    textoVerMais: { fontFamily: FONTE.meia, fontSize: 13, color: t.cores.verde },

    numeros: { flexDirection: 'row', gap: 12, paddingBottom: 2 },
    numeroGrande: { fontFamily: FONTE.bruta, fontSize: 26, color: t.cores.ink, letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
    unidade: { fontFamily: FONTE.normal, fontSize: 13, color: t.inkFraco, letterSpacing: 0 },
    linha: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
    rotuloDaLinha: { fontFamily: FONTE.normal, fontSize: 13, color: t.inkFraco, minWidth: 110 },
    valorDaLinha: { flex: 1, fontFamily: FONTE.meia, fontSize: 13.5, color: t.cores.ink, textAlign: 'right', fontVariant: ['tabular-nums'] },

    grade: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },

    abasDaMedida: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: 4 },
    abaDaMedida: {
      paddingHorizontal: 11,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: t.cores.trilho,
    },
    abaDaMedidaEscolhida: { backgroundColor: t.cores.verde },
    textoDaAbaDaMedida: { fontFamily: FONTE.meia, fontSize: 12, color: t.inkSuave },
    textoDaAbaEscolhida: { color: t.cores.branco },
    frase: { fontFamily: FONTE.normal, fontSize: 13, color: t.inkSuave, lineHeight: 19, paddingTop: 8 },
    soUmPonto: { alignItems: 'center', gap: 6, paddingVertical: 18 },
    numeroSozinho: {
      fontFamily: FONTE.bruta,
      fontSize: 30,
      color: t.cores.ink,
      letterSpacing: -0.8,
      fontVariant: ['tabular-nums'],
    },
    verNumeros: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
    },
    textoVerNumeros: { fontFamily: FONTE.meia, fontSize: 13, color: t.cores.verde },
    celula: { width: '33.33%', gap: 1 },
    rotuloDaCelula: { fontFamily: FONTE.normal, fontSize: 12, color: t.inkFraco },
    valorDaCelula: { fontFamily: FONTE.meia, fontSize: 15, color: t.cores.ink, fontVariant: ['tabular-nums'] },

    achado: { gap: 3, paddingTop: 8, borderTopWidth: 1, borderTopColor: t.cores.borda },
    lendo: { alignItems: 'center', gap: 10, paddingVertical: 56, paddingHorizontal: 24 },
    textoDoLendo: {
      fontFamily: FONTE.meia,
      fontSize: 15,
      color: t.cores.ink,
      textAlign: 'center',
      marginTop: 4,
    },
    detalheDoLendo: {
      fontFamily: FONTE.normal,
      fontSize: 13,
      color: t.inkFraco,
      textAlign: 'center',
      lineHeight: 19,
      maxWidth: 300,
    },
    botao: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: t.cores.limao,
      borderRadius: 14,
      paddingVertical: 13,
    },
    botaoApagado: { backgroundColor: t.cores.trilho },
    textoDoBotao: { fontFamily: FONTE.forte, fontSize: 14.5, color: t.cores.sobreLimao },

    centroPequeno: { paddingVertical: 40, alignItems: 'center' },
    vazio: {
      alignItems: 'center',
      gap: 8,
      paddingVertical: 40,
      paddingHorizontal: 16,
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderRadius: 16,
    },
    textoVazio: { fontFamily: FONTE.normal, fontSize: 14, color: t.inkSuave, textAlign: 'center' },
    rodape: {
      fontFamily: FONTE.normal,
      fontSize: 12,
      color: t.inkFraco,
      textAlign: 'center',
      lineHeight: 17,
      paddingHorizontal: 12,
    },
  }),
)
