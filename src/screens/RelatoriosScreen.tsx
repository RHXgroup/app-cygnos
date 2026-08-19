import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnelProgresso } from '../components/AnelProgresso'
import { BarrasPeriodo } from '../components/BarrasPeriodo'
import { MiniGrafico } from '../components/MiniGrafico'
import { volume } from '../lib/agua'
import { decimal, milhar } from '../lib/formatar'
import { kg as formatarKg, variacaoEmKg } from '../lib/peso'
import { duracao, tempoDormindo } from '../lib/sono'
import {
  carregarRelatorio,
  colunasDe,
  intervaloPorExtenso,
  NOME_DO_PERIODO,
  PERIODOS,
  type Padrao,
  type Periodo,
  type Relatorio,
} from '../lib/relatorio'
import { cores, coresMacro, inkFraco, inkMedio, inkSuave } from '../theme'

const MARGEM = 20
const PADDING_CARTAO = 16

/* Abaixo disso não há retrospectiva a fazer. Dois dias de registro produzem
   médias que são só os próprios dois dias, e um relatório que apresenta isso
   como tendência ensina a pessoa a não confiar nele. */
const MINIMO_DE_DIAS = 3

/* A aba de Relatórios: o que aconteceu, lido do que já foi registrado.
 *
 * Duas metades. Em cima, a retrospectiva — um cartão por assunto, todos medidos
 * contra a meta ativa. Embaixo, os padrões: os cruzamentos que só existem porque
 * o app guarda a HORA de cada lançamento, e que são o que a pessoa leva para a
 * consulta.
 *
 * O período termina ontem, sempre. A explicação está no topo de lib/relatorio.ts;
 * na tela isso aparece como o intervalo por extenso ao lado do título, para
 * ninguém procurar o dia de hoje aqui e achar que sumiu. */
export function RelatoriosScreen({
  contaId,
  versao,
  onAbrirMetas,
}: {
  contaId: string
  /* Sobe quando qualquer coisa é registrada em qualquer tela. A aba fica montada
     dentro do carrossel e nunca remonta sozinha — sem isto, quem registra o
     jantar e desliza para cá vê o relatório de antes do jantar. */
  versao: number
  onAbrirMetas: () => void
}) {
  const { top } = useSafeAreaInsets()
  const [periodo, setPeriodo] = useState<Periodo>(7)
  const [relatorio, setRelatorio] = useState<Relatorio | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)

  const buscar = useCallback(async () => {
    const r = await carregarRelatorio(contaId, periodo)
    if (r.tipo === 'erro') {
      setErro(r.mensagem)
      setRelatorio(null)
    } else {
      setErro(null)
      setRelatorio(r.relatorio)
    }
  }, [contaId, periodo])

  useEffect(() => {
    let vivo = true
    /* Mantém o relatório anterior na tela enquanto o novo período carrega: sem
       isto, trocar de 7 para 30 dias pisca a tela inteira em branco por meio
       segundo, e o toque parece ter quebrado alguma coisa. */
    setCarregando(relatorio === null)
    buscar().finally(() => {
      if (vivo) setCarregando(false)
    })
    return () => {
      vivo = false
    }
    /* relatorio de fora das dependências de propósito: ele é ESCRITO aqui
       dentro, e incluí-lo faria a busca se disparar em resposta a si mesma. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscar, versao])

  async function puxarParaAtualizar() {
    setAtualizando(true)
    await buscar()
    setAtualizando(false)
  }

  return (
    <ScrollView
      style={styles.tela}
      contentContainerStyle={[styles.conteudo, { paddingTop: top + 8 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={atualizando} onRefresh={puxarParaAtualizar} tintColor={cores.limao} />
      }
    >
      <View>
        <Text style={styles.titulo}>Relatórios</Text>
        <Text style={styles.subtitulo}>
          {relatorio ? intervaloPorExtenso(relatorio.intervalo) : 'Carregando…'}
        </Text>
      </View>

      <SeletorDePeriodo atual={periodo} onTrocar={setPeriodo} />

      {carregando && (
        <View style={styles.centro}>
          <ActivityIndicator color={cores.verde} />
        </View>
      )}

      {!!erro && !carregando && (
        <View style={styles.erro}>
          <Text style={styles.textoErro}>{erro}</Text>
        </View>
      )}

      {relatorio && !carregando && (
        <Conteudo relatorio={relatorio} onAbrirMetas={onAbrirMetas} />
      )}
    </ScrollView>
  )
}

function Conteudo({
  relatorio,
  onAbrirMetas,
}: {
  relatorio: Relatorio
  onAbrirMetas: () => void
}) {
  if (relatorio.diasComRegistro < MINIMO_DE_DIAS) {
    return <AindaSemDados dias={relatorio.diasComRegistro} />
  }

  return (
    <>
      <CartaoAnel relatorio={relatorio} />
      <CartaoCalorias relatorio={relatorio} onAbrirMetas={onAbrirMetas} />
      <CartaoAgua relatorio={relatorio} />
      <CartaoPeso relatorio={relatorio} />
      <CartaoSono relatorio={relatorio} />
      <CartaoPlano relatorio={relatorio} />
      <Padroes padroes={relatorio.padroes} />

      <Text style={styles.rodape}>
        O período vai até ontem — o dia de hoje ainda está acontecendo e aparece na tela inicial.
        As metas usadas são as que estão ativas agora.
      </Text>
    </>
  )
}

function SeletorDePeriodo({
  atual,
  onTrocar,
}: {
  atual: Periodo
  onTrocar: (p: Periodo) => void
}) {
  return (
    <View style={styles.seletor}>
      {PERIODOS.map(p => {
        const escolhido = p === atual
        return (
          <Pressable
            key={p}
            onPress={() => onTrocar(p)}
            style={[styles.opcaoPeriodo, escolhido && styles.opcaoEscolhida]}
            accessibilityRole="button"
            accessibilityState={{ selected: escolhido }}
          >
            <Text style={[styles.textoPeriodo, escolhido && styles.textoPeriodoEscolhido]}>
              {NOME_DO_PERIODO[p]}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/* ── Cartões ───────────────────────────────────────────────────────────────*/

function CartaoAnel({ relatorio }: { relatorio: Relatorio }) {
  const { percentualMedio, pilares, diasComRegistro, periodo } = relatorio

  return (
    <View style={styles.cartao}>
      <View style={styles.linhaAnel}>
        <AnelProgresso percentual={percentualMedio} />
        <View style={styles.textoAnel}>
          <Text style={styles.tituloCartao}>Média do período</Text>
          <Text style={styles.legenda}>
            {diasComRegistro} de {periodo} {diasComRegistro === 1 ? 'dia registrado' : 'dias registrados'}
          </Text>
        </View>
      </View>

      {pilares.length > 0 && (
        <View style={styles.listaPilares}>
          {pilares.map(p => (
            <View key={p.chave} style={styles.pilar}>
              <Text style={styles.rotuloPilar} numberOfLines={1}>
                {p.rotulo}
              </Text>
              <View style={styles.trilhoPilar}>
                <View style={[styles.preenchimentoPilar, { width: `${Math.round(p.fracao * 100)}%` }]} />
              </View>
              <Text style={styles.valorPilar}>{Math.round(p.fracao * 100)}%</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

function CartaoCalorias({
  relatorio,
  onAbrirMetas,
}: {
  relatorio: Relatorio
  onAbrirMetas: () => void
}) {
  const { calorias, metas, dias, macros } = relatorio

  if (!calorias) {
    return (
      <View style={styles.cartao}>
        <Text style={styles.tituloCartao}>Alimentação</Text>
        <Text style={styles.vazioCartao}>
          Nenhuma refeição registrada no período. O contador de calorias alimenta este cartão.
        </Text>
      </View>
    )
  }

  const colunas = colunasDe(dias, d => d.calorias)
  const semMeta = metas.calorias === null

  return (
    <View style={styles.cartao}>
      <View style={styles.cabecalhoCartao}>
        <Text style={styles.tituloCartao}>Alimentação</Text>
        <Text style={styles.legenda}>
          {calorias.dias} {calorias.dias === 1 ? 'dia' : 'dias'}
        </Text>
      </View>

      <View style={styles.linhaValorGrande}>
        <Text style={styles.valorGrande}>{milhar(calorias.media)}</Text>
        <Text style={styles.unidadeGrande}>kcal/dia em média</Text>
      </View>

      {calorias.naMeta !== null ? (
        <Text style={styles.legenda}>
          {calorias.naMeta} {calorias.naMeta === 1 ? 'dia alcançou' : 'dias alcançaram'} a meta de{' '}
          {milhar(metas.calorias ?? 0)} kcal
        </Text>
      ) : (
        <Pressable onPress={onAbrirMetas} style={styles.linhaSemMeta}>
          <Ionicons name="flag-outline" size={13} color={cores.verde} />
          <Text style={styles.textoSemMeta}>Defina uma meta de calorias para comparar</Text>
        </Pressable>
      )}

      <BarrasPeriodo
        colunas={colunas}
        meta={metas.calorias}
        cor={cores.verdeClaro}
        corNaMeta={cores.verde}
        rotuloMeta={semMeta ? undefined : 'meta'}
      />

      {macros && <BarraDeMacros macros={macros} />}
    </View>
  )
}

/* A barra empilhada dos macros médios. Em gramas convertidas para a proporção
   de calorias que cada um representa — quatro por grama de proteína e de
   carboidrato, nove por grama de gordura. Empilhar as gramas cruas faria a
   gordura parecer um terço do que ela pesa na energia do dia. */
function BarraDeMacros({
  macros,
}: {
  macros: { proteinas: number | null; carboidratos: number | null; gorduras: number | null; fibras: number | null }
}) {
  const kcal = {
    proteinas: (macros.proteinas ?? 0) * 4,
    carboidratos: (macros.carboidratos ?? 0) * 4,
    gorduras: (macros.gorduras ?? 0) * 9,
  }
  const total = kcal.proteinas + kcal.carboidratos + kcal.gorduras
  if (total === 0) return null

  const partes = [
    { chave: 'proteinas' as const, rotulo: 'Proteínas', gramas: macros.proteinas },
    { chave: 'carboidratos' as const, rotulo: 'Carboidratos', gramas: macros.carboidratos },
    { chave: 'gorduras' as const, rotulo: 'Gorduras', gramas: macros.gorduras },
  ]

  return (
    <View style={styles.blocoMacros}>
      <Text style={styles.subtituloBloco}>Média por dia</Text>

      <View style={styles.barraEmpilhada}>
        {partes.map(p => (
          <View
            key={p.chave}
            style={{
              flex: kcal[p.chave],
              backgroundColor: coresMacro[p.chave],
            }}
          />
        ))}
      </View>

      <View style={styles.legendaMacros}>
        {partes.map(p => (
          <View key={p.chave} style={styles.itemLegenda}>
            <View style={[styles.pontoLegenda, { backgroundColor: coresMacro[p.chave] }]} />
            <Text style={styles.textoLegenda}>
              {p.rotulo} {p.gramas === null ? '—' : `${Math.round(p.gramas)} g`}
            </Text>
          </View>
        ))}
        {macros.fibras !== null && (
          <View style={styles.itemLegenda}>
            <View style={[styles.pontoLegenda, { backgroundColor: cores.trilho }]} />
            <Text style={styles.textoLegenda}>Fibras {Math.round(macros.fibras)} g</Text>
          </View>
        )}
      </View>
    </View>
  )
}

function CartaoAgua({ relatorio }: { relatorio: Relatorio }) {
  const { agua, metas, dias } = relatorio

  if (!agua) {
    return (
      <View style={styles.cartao}>
        <Text style={styles.tituloCartao}>Água</Text>
        <Text style={styles.vazioCartao}>Nenhum copo registrado no período.</Text>
      </View>
    )
  }

  return (
    <View style={styles.cartao}>
      <View style={styles.cabecalhoCartao}>
        <Text style={styles.tituloCartao}>Água</Text>
        <Text style={styles.legenda}>
          {agua.naMeta} de {agua.dias} {agua.dias === 1 ? 'dia na meta' : 'dias na meta'}
        </Text>
      </View>

      <View style={styles.linhaValorGrande}>
        <Text style={styles.valorGrande}>{volume(agua.media)}</Text>
        <Text style={styles.unidadeGrande}>por dia em média</Text>
      </View>
      <Text style={styles.legenda}>Meta de {volume(metas.aguaMl)}</Text>

      <BarrasPeriodo
        colunas={colunasDe(dias, d => d.aguaMl)}
        meta={metas.aguaMl}
        cor={cores.verdeClaro}
        corNaMeta={cores.verde}
        rotuloMeta="meta"
      />
    </View>
  )
}

function CartaoPeso({ relatorio }: { relatorio: Relatorio }) {
  const { peso } = relatorio
  if (!peso) return null

  /* Uma pesagem só não é uma evolução — é um número. O cartão mostra o peso e
     cala sobre a variação, em vez de anunciar "0,0 kg" como se nada tivesse
     mudado num período que a pessoa nem chegou a medir. */
  const soUma = peso.pesagens < 2
  const parado = Math.abs(peso.variacao) < 0.2
  const subiu = peso.variacao > 0

  return (
    <View style={styles.cartao}>
      <View style={styles.cabecalhoCartao}>
        <Text style={styles.tituloCartao}>Peso</Text>
        <Text style={styles.legenda}>
          {peso.pesagens} {peso.pesagens === 1 ? 'pesagem' : 'pesagens'}
        </Text>
      </View>

      <View style={styles.linhaPeso}>
        <View style={styles.colunaPeso}>
          <View style={styles.linhaValorGrande}>
            <Text style={styles.valorGrande}>{formatarKg(peso.atual)}</Text>
            <Text style={styles.unidadeGrande}>kg</Text>
          </View>

          {soUma ? (
            <Text style={styles.legenda}>Primeira pesagem do período</Text>
          ) : parado ? (
            <Text style={styles.legenda}>Estável desde {formatarKg(peso.inicial)} kg</Text>
          ) : (
            <>
              <Text style={styles.legenda}>
                {subiu ? 'Ganhou' : 'Perdeu'} {variacaoEmKg(peso.variacao)} kg no período
              </Text>
              <Text style={styles.legendaFraca}>
                Ritmo de {decimal(Math.abs(peso.kgPorSemana), 2)} kg por semana
              </Text>
            </>
          )}
        </View>

        {peso.serie.length >= 2 && <MiniGrafico serie={peso.serie} largura={130} altura={58} />}
      </View>
    </View>
  )
}

function CartaoSono({ relatorio }: { relatorio: Relatorio }) {
  const { sono, metas, dias } = relatorio

  if (!sono) {
    return (
      <View style={styles.cartao}>
        <Text style={styles.tituloCartao}>Sono</Text>
        <Text style={styles.vazioCartao}>Nenhuma noite registrada no período.</Text>
      </View>
    )
  }

  return (
    <View style={styles.cartao}>
      <View style={styles.cabecalhoCartao}>
        <Text style={styles.tituloCartao}>Sono</Text>
        <Text style={styles.legenda}>
          {sono.noites} {sono.noites === 1 ? 'noite' : 'noites'}
        </Text>
      </View>

      <View style={styles.linhaValorGrande}>
        <Text style={styles.valorGrande}>{duracao(Math.round(sono.mediaDormindoMin))}</Text>
        <Text style={styles.unidadeGrande}>por noite em média</Text>
      </View>

      <View style={styles.linhaMetricas}>
        <Metrica
          rotulo="Eficiência"
          valor={`${Math.round(sono.mediaEficiencia)}%`}
          /* Acima de 85% é o que se considera bom — ver lib/sono.ts. */
          bom={sono.mediaEficiencia >= 85}
        />
        {sono.naMeta !== null && (
          <Metrica
            rotulo="Na meta"
            valor={`${sono.naMeta}/${sono.noites}`}
            bom={sono.naMeta / sono.noites >= 0.7}
          />
        )}
        {sono.irregularidadeMin !== null && (
          <Metrica
            rotulo="Varia"
            valor={`±${Math.round(sono.irregularidadeMin)}min`}
            /* Meia hora de variação no horário de deitar é uma rotina; uma hora
               e meia é outro fuso a cada dois dias. */
            bom={sono.irregularidadeMin <= 45}
          />
        )}
      </View>

      <BarrasPeriodo
        colunas={colunasDe(dias, d => (d.noite ? tempoDormindo(d.noite) : null))}
        meta={metas.sonoHoras !== null ? metas.sonoHoras * 60 : null}
        cor={cores.verdeClaro}
        corNaMeta={cores.verde}
        rotuloMeta={metas.sonoHoras !== null ? 'meta' : undefined}
      />

      {sono.fatores.length > 0 && (
        <View style={styles.blocoFatores}>
          <Text style={styles.subtituloBloco}>O que você mais marcou</Text>
          <View style={styles.chips}>
            {sono.fatores.slice(0, 4).map(f => (
              <View key={f.fator} style={styles.chip}>
                <Text style={styles.textoChip}>
                  {f.rotulo} · {f.vezes}×
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  )
}

function Metrica({ rotulo, valor, bom }: { rotulo: string; valor: string; bom: boolean }) {
  return (
    <View style={styles.metrica}>
      <Text style={[styles.valorMetrica, bom && styles.valorMetricaBom]}>{valor}</Text>
      <Text style={styles.rotuloMetrica}>{rotulo}</Text>
    </View>
  )
}

function CartaoPlano({ relatorio }: { relatorio: Relatorio }) {
  const { aderencia, plano } = relatorio
  if (!aderencia || !plano) return null

  const fracao = aderencia.feitas / aderencia.previstas

  return (
    <View style={styles.cartao}>
      <View style={styles.cabecalhoCartao}>
        <Text style={styles.tituloCartao}>Seu plano</Text>
        <Text style={styles.legenda} numberOfLines={1}>
          {plano.nome}
        </Text>
      </View>

      <View style={styles.linhaValorGrande}>
        <Text style={styles.valorGrande}>{Math.round(fracao * 100)}%</Text>
        <Text style={styles.unidadeGrande}>das refeições registradas</Text>
      </View>

      <Text style={styles.legenda}>
        {aderencia.feitas} de {aderencia.previstas} refeições nos dias em que o plano valia
      </Text>

      <View style={[styles.trilhoPilar, styles.trilhoPlano]}>
        <View style={[styles.preenchimentoPilar, { width: `${Math.round(fracao * 100)}%` }]} />
      </View>

      <Text style={styles.legendaFraca}>
        Conta pelo nome da refeição: um lanche registrado com outro rótulo não é reconhecido como
        o do plano.
      </Text>
    </View>
  )
}

/* ── Padrões ───────────────────────────────────────────────────────────────*/

function Padroes({ padroes }: { padroes: Padrao[] }) {
  if (padroes.length === 0) {
    return (
      <View style={styles.cartao}>
        <Text style={styles.tituloCartao}>Padrões</Text>
        <Text style={styles.vazioCartao}>
          Ainda não há registros suficientes para cruzar seus dados. Estes achados aparecem depois de
          algumas semanas de sono e refeições anotados.
        </Text>
      </View>
    )
  }

  return (
    <View>
      <Text style={styles.tituloSecao}>Padrões</Text>
      <Text style={styles.subtituloSecao}>
        O que aparece quando o seu sono, a sua comida e a sua água são lidos juntos.
      </Text>

      <View style={styles.listaPadroes}>
        {padroes.map(p => (
          <View
            key={p.chave}
            style={[
              styles.padrao,
              p.tom === 'atencao' && styles.padraoAtencao,
              p.tom === 'bom' && styles.padraoBom,
            ]}
          >
            <View
              style={[
                styles.iconePadrao,
                p.tom === 'atencao' && styles.iconePadraoAtencao,
              ]}
            >
              <Ionicons
                name={p.icone}
                size={16}
                color={p.tom === 'atencao' ? cores.gold : cores.verde}
              />
            </View>
            <View style={styles.textoPadrao}>
              <Text style={styles.tituloPadrao}>{p.titulo}</Text>
              <Text style={styles.corpoPadrao}>{p.texto}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

function AindaSemDados({ dias }: { dias: number }) {
  return (
    <View style={styles.vazio}>
      <View style={styles.circuloVazio}>
        <Ionicons name="stats-chart-outline" size={26} color={cores.verde} />
      </View>
      <Text style={styles.tituloVazio}>Ainda não dá para comparar</Text>
      <Text style={styles.textoVazio}>
        {dias === 0
          ? 'Nada foi registrado neste período. Anote sua água, suas refeições e suas noites por alguns dias e os relatórios aparecem aqui.'
          : `Só ${dias} ${dias === 1 ? 'dia tem' : 'dias têm'} registro neste período. Com ${MINIMO_DE_DIAS} dias já dá para ver alguma coisa.`}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { paddingHorizontal: MARGEM, paddingBottom: 28, gap: 14 },
  centro: { paddingVertical: 60, alignItems: 'center' },

  titulo: { fontSize: 27, fontWeight: '800', color: cores.ink, letterSpacing: -0.6 },
  subtitulo: { marginTop: 4, fontSize: 13.5, color: inkSuave },

  seletor: {
    flexDirection: 'row',
    backgroundColor: cores.cartao,
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  opcaoPeriodo: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 11 },
  opcaoEscolhida: { backgroundColor: cores.superficie },
  textoPeriodo: { fontSize: 13, fontWeight: '600', color: inkSuave },
  textoPeriodoEscolhido: { color: cores.verde, fontWeight: '800' },

  cartao: { borderRadius: 20, backgroundColor: cores.cartao, padding: PADDING_CARTAO },
  cabecalhoCartao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 6,
  },
  tituloCartao: { fontSize: 17, fontWeight: '800', color: cores.ink },
  legenda: { fontSize: 12.5, color: inkSuave },
  legendaFraca: { marginTop: 8, fontSize: 11.5, lineHeight: 16, color: inkFraco },
  vazioCartao: { marginTop: 6, fontSize: 13, lineHeight: 19, color: inkSuave },

  linhaValorGrande: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  valorGrande: { fontSize: 30, fontWeight: '800', color: cores.verde, letterSpacing: -0.8 },
  unidadeGrande: { fontSize: 12.5, fontWeight: '600', color: inkMedio },

  /* ── Anel ── */
  linhaAnel: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  textoAnel: { flex: 1 },
  listaPilares: { marginTop: 14, gap: 9 },
  pilar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rotuloPilar: { width: 84, fontSize: 12.5, color: inkMedio },
  trilhoPilar: {
    flex: 1,
    height: 7,
    borderRadius: 4,
    backgroundColor: cores.trilho,
    overflow: 'hidden',
  },
  /* A mesma barra, mas sozinha numa linha do cartão do plano — daí o respiro
     acima, que na lista de pilares seria espaço a mais entre as linhas. */
  trilhoPlano: { marginTop: 12 },
  preenchimentoPilar: { height: '100%', borderRadius: 4, backgroundColor: cores.verde },
  valorPilar: { width: 36, textAlign: 'right', fontSize: 12, fontWeight: '700', color: cores.ink },

  linhaSemMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  textoSemMeta: { fontSize: 12.5, fontWeight: '600', color: cores.verde },

  /* ── Macros ── */
  blocoMacros: { marginTop: 16 },
  subtituloBloco: { fontSize: 12, fontWeight: '700', color: inkMedio, marginBottom: 7 },
  barraEmpilhada: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden' },
  legendaMacros: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 9 },
  itemLegenda: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pontoLegenda: { width: 8, height: 8, borderRadius: 4 },
  textoLegenda: { fontSize: 11.5, color: inkSuave },

  /* ── Peso ── */
  linhaPeso: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  colunaPeso: { flex: 1 },

  /* ── Sono ── */
  linhaMetricas: { flexDirection: 'row', gap: 8, marginTop: 12 },
  metrica: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: cores.superficie,
  },
  valorMetrica: { fontSize: 15, fontWeight: '800', color: cores.ink },
  valorMetricaBom: { color: cores.verde },
  rotuloMetrica: { marginTop: 2, fontSize: 10.5, color: inkFraco },
  blocoFatores: { marginTop: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: cores.superficie,
  },
  textoChip: { fontSize: 11.5, color: inkMedio },

  /* ── Padrões ── */
  tituloSecao: { marginTop: 8, fontSize: 19, fontWeight: '800', color: cores.ink },
  subtituloSecao: { marginTop: 4, fontSize: 13, lineHeight: 19, color: inkSuave },
  listaPadroes: { marginTop: 12, gap: 10 },
  padrao: {
    flexDirection: 'row',
    gap: 11,
    padding: PADDING_CARTAO,
    borderRadius: 18,
    backgroundColor: cores.cartao,
  },
  padraoAtencao: { backgroundColor: cores.atencaoFundo },
  padraoBom: { backgroundColor: cores.verdeMenta },
  iconePadrao: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: cores.verdeClaro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconePadraoAtencao: { backgroundColor: cores.superficie },
  textoPadrao: { flex: 1 },
  tituloPadrao: { fontSize: 14, fontWeight: '700', color: cores.ink, lineHeight: 19 },
  corpoPadrao: { marginTop: 4, fontSize: 13, lineHeight: 19, color: inkMedio },

  /* ── Vazios ── */
  vazio: { alignItems: 'center', paddingVertical: 44, paddingHorizontal: 12, gap: 8 },
  circuloVazio: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: cores.verdeMenta,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  tituloVazio: { fontSize: 17, fontWeight: '700', color: cores.ink },
  textoVazio: { fontSize: 13.5, lineHeight: 20, color: inkSuave, textAlign: 'center' },

  erro: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: cores.erroBorda,
    backgroundColor: cores.erroFundo,
    padding: 14,
  },
  textoErro: { fontSize: 13, color: cores.erroTexto },

  rodape: { marginTop: 4, fontSize: 11.5, lineHeight: 17, color: inkFraco },
})
