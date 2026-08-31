import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  carregarAnamneses,
  carregarAvaliacoes,
  carregarEnergetico,
  carregarPlano,
  dataLegivel,
  diaDeHojeNoPlano,
  DIAS_DO_PLANO,
  DIAS_DO_PLANO_CURTOS,
  type Anamnese,
  type Avaliacao,
  type CampoAnamnese,
  type Energetico,
  type PlanoDaNutri,
} from '../lib/conteudoNutri'
import { carregarSessoes, type SessaoDeFotos } from '../lib/fotos'
import { carregarExames, ehImagem, tamanhoLegivel, type Exame } from '../lib/exames'
import {
  carregarReceitasDaNutri,
  porcoesLegivel,
  tempoLegivel,
  type ReceitaDaNutri,
} from '../lib/receitasDaNutri'
import { ComparativoFotos } from '../components/ComparativoFotos'
import { decimal, milhar } from '../lib/formatar'
import { abrirLink } from '../lib/links'
import { estilosDe, paleta } from '../lib/tema'

/* O conteúdo de um item do painel "Meu nutricionista".
 *
 * Quatro assuntos numa tela só porque o que muda entre eles é o miolo: o
 * cabeçalho, o carregamento, o erro e o vazio são idênticos, e quatro arquivos
 * repetiriam essas quatro coisas quatro vezes. Cada leitura é uma função lá
 * embaixo, sem estado próprio.
 *
 * A evolução fotográfica é a única que não sai de RPC: o bucket é privado e cada
 * foto precisa de URL assinada, então ela vem da edge function `app-fotos`. O
 * resto da tela não sabe disso — é uma leitura como as outras.
 *
 * Tudo é SÓ LEITURA. Nada nesta tela escreve no sistema da nutricionista — o
 * app mostra o que ela registrou, e quem edita isso é ela, de lá. */

export type ChaveConteudo =
  | 'anamnese'
  | 'antropometria'
  | 'fotos'
  | 'plano'
  | 'energetico'
  | 'exames'
  | 'receitas'

const TITULOS: Record<ChaveConteudo, string> = {
  anamnese: 'Anamnese',
  antropometria: 'Antropometria',
  fotos: 'Evolução fotográfica',
  plano: 'Planejamento alimentar',
  energetico: 'Cálculo energético',
  exames: 'Exames',
  receitas: 'Receitas',
}

type Dados =
  | { chave: 'anamnese'; anamneses: Anamnese[] }
  | { chave: 'antropometria'; avaliacoes: Avaliacao[] }
  | { chave: 'fotos'; sessoes: SessaoDeFotos[] }
  | { chave: 'plano'; plano: PlanoDaNutri | null }
  | { chave: 'energetico'; energetico: Energetico | null }
  | { chave: 'exames'; exames: Exame[] }
  | { chave: 'receitas'; receitas: ReceitaDaNutri[] }

export function ConteudoNutriScreen({
  chave,
  onFechar,
}: {
  chave: ChaveConteudo
  onFechar: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [atualizando, setAtualizando] = useState(false)
  /* Sobe para forçar uma releitura do MESMO conteúdo. */
  const [versao, setVersao] = useState(0)

  /* Trocar de conteúdo limpa a tela; reler o mesmo conteúdo não.
     Se a limpeza morasse junto do efeito de baixo, cada volta do segundo plano
     apagaria o que está à vista para redesenhar quase sempre a mesma coisa — e a
     tela piscaria um indicador por uma leitura que raramente muda algo. */
  useEffect(() => {
    setDados(null)
    setErro(null)
  }, [chave])

  useEffect(() => {
    let vivo = true

    carregar(chave)
      .then(d => {
        if (!vivo) return
        /* Limpa o erro no sucesso: agora que a tela relê sozinha, uma mensagem
           que não sai quando a leitura seguinte dá certo esconderia o conteúdo
           atrás de um aviso vencido. */
        setErro(null)
        setDados(d)
      })
      .catch((e: Error) => {
        if (vivo) setErro(e.message)
      })
      .finally(() => {
        if (vivo) setAtualizando(false)
      })

    return () => {
      vivo = false
    }
  }, [chave, versao])

  /* As fotos são o motivo de isto existir aqui.
   *
   * Elas chegam com URL assinada que vale UMA HORA — ver lib/fotos.ts. E a tela
   * carregava uma vez e nunca mais: quem abrisse as fotos, deixasse o app de
   * lado e voltasse depois do almoço encontrava tudo quebrado, com uma única
   * saída — fechar e reabrir a tela, que é justamente o que ninguém deduz. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', estado => {
      if (estado === 'active') setVersao(v => v + 1)
    })
    return () => sub.remove()
  }, [])

  function puxarParaAtualizar() {
    setAtualizando(true)
    setVersao(v => v + 1)
  }

  /* O mesmo controle nas duas ramificações. A de erro é a que mais precisa:
     ela diz "tente de novo daqui a pouco" e, até aqui, não oferecia nenhum
     jeito de tentar. */
  const controleDeAtualizar = (
    <RefreshControl
      refreshing={atualizando}
      onRefresh={puxarParaAtualizar}
      tintColor={paleta().cores.limao}
    />
  )

  return (
    <View style={[styles.tela, { paddingTop: top + 8 }]}>
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
        <Text style={styles.tituloTela}>{TITULOS[chave]}</Text>
        <View style={styles.botaoVoltar} />
      </View>

      {erro ? (
        <ScrollView
          contentContainerStyle={[styles.conteudo, { paddingBottom: 32 + bottom }]}
          showsVerticalScrollIndicator={false}
          refreshControl={controleDeAtualizar}
        >
          <Aviso texto="Não foi possível carregar agora. Puxe para baixo para tentar de novo." />
        </ScrollView>
      ) : !dados ? (
        <View style={styles.centro}>
          <ActivityIndicator color={paleta().cores.verde} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.conteudo, { paddingBottom: 32 + bottom }]}
          showsVerticalScrollIndicator={false}
          refreshControl={controleDeAtualizar}
        >
          <Miolo dados={dados} />
        </ScrollView>
      )}
    </View>
  )
}

async function carregar(chave: ChaveConteudo): Promise<Dados> {
  if (chave === 'anamnese') return { chave, anamneses: await carregarAnamneses() }
  if (chave === 'antropometria') return { chave, avaliacoes: await carregarAvaliacoes() }
  if (chave === 'fotos') return { chave, sessoes: await carregarSessoes() }
  if (chave === 'plano') return { chave, plano: await carregarPlano() }
  if (chave === 'receitas') {
    const r = await carregarReceitasDaNutri()
    if (r.tipo === 'erro') throw new Error(r.mensagem)
    return { chave, receitas: r.receitas }
  }
  if (chave === 'exames') {
    const r = await carregarExames()
    /* As outras funções deste arquivo estouram no erro e a tela trata; esta
       devolve resultado, então a conversão acontece aqui para o comportamento
       ser o mesmo dos vizinhos. */
    if (r.tipo === 'erro') throw new Error(r.mensagem)
    return { chave, exames: r.exames }
  }
  return { chave, energetico: await carregarEnergetico() }
}

/* Um exame.
 *
 * O toque abre o arquivo FORA do app, no visualizador do aparelho. Não é
 * preguiça: exame é PDF de laboratório, com tabela, cabeçalho e coluna de
 * referência — desenhar isso dentro de uma tela de celular daria uma versão
 * pior da que o sistema já sabe abrir, e o paciente costuma querer justamente
 * salvar ou encaminhar o arquivo.
 *
 * A análise da nutricionista aparece como selo e não como texto: o conteúdo dela
 * é jsonb de formato desconhecido daqui, e dizer que existe é informação —
 * fingir que se sabe o que é seria invenção. Ver lib/exames.ts. */
function CartaoExame({ exame }: { exame: Exame }) {
  const styles = estilos()
  const quando = exame.dataExame
    ? dataLegivel(exame.dataExame)
    : dataLegivel(exame.criadoEm.slice(0, 10))

  const apoio = [quando, tamanhoLegivel(exame.tamanho)].filter(Boolean).join(' · ')

  return (
    <Pressable
      onPress={() => abrirLink(exame.arquivoUrl)}
      style={({ pressed }) => [styles.cartao, pressed && styles.cartaoPressionado]}
      accessibilityRole="button"
      accessibilityLabel={`Abrir o exame ${exame.nome}, de ${quando}`}
    >
      <View style={styles.linhaExame}>
        <View style={styles.iconeExame}>
          <Ionicons
            name={ehImagem(exame.tipoArquivo) ? 'image-outline' : 'document-text-outline'}
            size={20}
            color={paleta().cores.verde}
          />
        </View>

        <View style={styles.textoExame}>
          <Text style={styles.nomeExame} numberOfLines={2}>
            {exame.nome}
          </Text>
          {!!apoio && <Text style={styles.apoioExame}>{apoio}</Text>}
        </View>

        <Ionicons name="open-outline" size={16} color={paleta().inkFraco} />
      </View>

      {!!exame.observacoes && <Text style={styles.observacaoExame}>{exame.observacoes}</Text>}

      {exame.temAnalise && (
        <View style={styles.seloAnalise}>
          <Ionicons name="sparkles-outline" size={13} color={paleta().cores.verde} />
          <Text style={styles.textoSeloAnalise}>Analisado pela sua nutricionista</Text>
        </View>
      )}
    </Pressable>
  )
}

/* Uma receita.
 *
 * O modo de preparo vem inteiro, e não cortado com reticências: quem abriu esta
 * tela está de pé na cozinha, e "ver mais" com a mão suja é o pior toque que se
 * pode pedir.
 *
 * Os macros só aparecem quando existem. Receita sem cálculo é comum — ela pode
 * ter escrito uma sugestão sem passar pelo somatório —, e mostrar "0 kcal" seria
 * afirmar que a comida não tem caloria. Null é resposta, zero é mentira. */
function CartaoReceita({ receita }: { receita: ReceitaDaNutri }) {
  const styles = estilos()
  const [fotoFalhou, setFotoFalhou] = useState(false)

  const apoio = [tempoLegivel(receita.tempoPreparoMin), porcoesLegivel(receita.porcoes)]
    .filter(Boolean)
    .join(' · ')

  return (
    <View style={styles.cartao}>
      {!!receita.fotoUrl && !fotoFalhou && (
        <Image
          source={{ uri: receita.fotoUrl }}
          style={styles.fotoReceita}
          resizeMode="cover"
          onError={() => setFotoFalhou(true)}
        />
      )}

      <View style={styles.linhaTituloReceita}>
        <Text style={styles.nomeReceita}>{receita.nome}</Text>
        {!!receita.categoria && (
          <View style={styles.etiquetaReceita}>
            <Text style={styles.textoEtiquetaReceita}>{receita.categoria}</Text>
          </View>
        )}
      </View>

      {!!apoio && <Text style={styles.apoioReceita}>{apoio}</Text>}
      {!!receita.descricao && <Text style={styles.descricaoReceita}>{receita.descricao}</Text>}

      {receita.kcal !== null && (
        <View style={styles.macrosReceita}>
          <Macro rotulo="kcal" valor={milhar(receita.kcal)} />
          {receita.proteinas !== null && <Macro rotulo="P" valor={`${decimal(receita.proteinas)} g`} />}
          {receita.carboidratos !== null && <Macro rotulo="C" valor={`${decimal(receita.carboidratos)} g`} />}
          {receita.gorduras !== null && <Macro rotulo="G" valor={`${decimal(receita.gorduras)} g`} />}
        </View>
      )}

      {!!receita.modoPreparo && (
        <>
          <Text style={styles.rotuloPreparo}>Como fazer</Text>
          <Text style={styles.preparoReceita}>{receita.modoPreparo}</Text>
        </>
      )}
    </View>
  )
}

function Macro({ rotulo, valor }: { rotulo: string; valor: string }) {
  const styles = estilos()
  return (
    <View style={styles.macroReceita}>
      <Text style={styles.valorMacroReceita}>{valor}</Text>
      <Text style={styles.rotuloMacroReceita}>{rotulo}</Text>
    </View>
  )
}

function Miolo({ dados }: { dados: Dados }) {
  if (dados.chave === 'receitas') {
    if (dados.receitas.length === 0) {
      return <Aviso texto="A sua nutricionista ainda não publicou nenhuma receita." />
    }
    return (
      <>
        {dados.receitas.map(r => (
          <CartaoReceita key={r.id} receita={r} />
        ))}
      </>
    )
  }
  if (dados.chave === 'exames') {
    if (dados.exames.length === 0) {
      return <Aviso texto="A sua nutricionista ainda não importou nenhum exame." />
    }
    return (
      <>
        {dados.exames.map(e => (
          <CartaoExame key={e.id} exame={e} />
        ))}
      </>
    )
  }

  if (dados.chave === 'anamnese') {
    if (dados.anamneses.length === 0) {
      return <Aviso texto="A sua nutricionista ainda não preencheu uma anamnese." />
    }
    return (
      <>
        {dados.anamneses.map(a => (
          <CartaoAnamnese key={a.id} anamnese={a} />
        ))}
      </>
    )
  }

  if (dados.chave === 'antropometria') {
    if (dados.avaliacoes.length === 0) {
      return <Aviso texto="Nenhuma avaliação registrada até agora." />
    }
    return (
      <>
        {dados.avaliacoes.map(av => (
          <CartaoAvaliacao key={av.id} avaliacao={av} />
        ))}
      </>
    )
  }

  if (dados.chave === 'fotos') {
    if (dados.sessoes.length === 0) {
      return <Aviso texto="A sua nutricionista ainda não registrou fotos de evolução." />
    }
    return <ComparativoFotos sessoes={dados.sessoes} />
  }

  if (dados.chave === 'plano') {
    if (!dados.plano) {
      return <Aviso texto="Você não tem um plano ativo no momento." />
    }
    return <CorpoPlano plano={dados.plano} />
  }

  if (!dados.energetico) {
    return <Aviso texto="A sua nutricionista ainda não fez esse cálculo." />
  }
  return <CartaoEnergetico energetico={dados.energetico} />
}

/* ── Anamnese ──────────────────────────────────────────────────────────────*/

function CartaoAnamnese({ anamnese }: { anamnese: Anamnese }) {
  const styles = estilos()
  const quando = dataLegivel(anamnese.data)

  return (
    <View style={styles.cartao}>
      <Text style={styles.tituloCartao}>
        {anamnese.titulo?.trim() || anamnese.templateNome?.trim() || 'Anamnese'}
      </Text>
      {!!quando && <Text style={styles.subtituloCartao}>{quando}</Text>}

      {anamnese.secoes.length === 0 ? (
        <Text style={styles.vazioInterno}>Sem respostas registradas.</Text>
      ) : (
        anamnese.secoes.map((secao, i) => (
          <View key={`${secao.titulo}-${i}`} style={styles.secao}>
            {!!secao.titulo && <Text style={styles.tituloSecao}>{secao.titulo}</Text>}
            {secao.campos.map((campo, j) => (
              <CampoLido key={`${campo.label}-${j}`} campo={campo} />
            ))}
          </View>
        ))
      )}
    </View>
  )
}

function CampoLido({ campo }: { campo: CampoAnamnese }) {
  const styles = estilos()
  /* O valor vem de jsonb preenchido por outro sistema: pode ser texto, booleano
     ou uma lista de linhas (o "grupo repetível" do web, como a tabela de
     exercícios praticados). Qualquer outra coisa vira texto — melhor mostrar o
     bruto do que esconder que existe resposta ali. */
  if (Array.isArray(campo.valor)) {
    return (
      <View style={styles.campo}>
        <Text style={styles.rotuloCampo}>{campo.label}</Text>
        {campo.valor.length === 0 ? (
          <Text style={styles.valorCampo}>—</Text>
        ) : (
          campo.valor.map((linha, i) => (
            <View key={i} style={styles.linhaGrupo}>
              {Object.entries(linha ?? {}).map(([chave, valor]) => (
                <Text key={chave} style={styles.valorCampo}>
                  {chave}: {textoDe(valor)}
                </Text>
              ))}
            </View>
          ))
        )}
      </View>
    )
  }

  return (
    <View style={styles.campo}>
      <Text style={styles.rotuloCampo}>{campo.label}</Text>
      <Text style={styles.valorCampo}>{textoDe(campo.valor)}</Text>
    </View>
  )
}

const textoDe = (v: unknown): string => {
  if (v === true) return 'Sim'
  if (v === false) return 'Não'
  if (v == null || v === '') return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/* ── Antropometria ─────────────────────────────────────────────────────────*/

function CartaoAvaliacao({ avaliacao: a }: { avaliacao: Avaliacao }) {
  const styles = estilos()
  /* Só o que foi medido. Uma grade com doze "—" faria a avaliação parecer
     malfeita, quando na verdade ninguém mede tudo em toda consulta. */
  const medidas: { rotulo: string; valor: string }[] = []
  const juntar = (rotulo: string, valor: number | null, unidade: string, casas = 1) => {
    if (valor != null) medidas.push({ rotulo, valor: `${decimal(valor, casas)}${unidade}` })
  }

  juntar('Peso', a.peso, ' kg')
  juntar('Altura', a.altura != null && a.altura > 3 ? a.altura / 100 : a.altura, ' m', 2)
  juntar('IMC', a.imc, '')
  juntar('Gordura', a.gorduraPct, '%')
  juntar('Massa magra', a.massaMagra, ' kg')
  juntar('Massa gorda', a.massaGorda, ' kg')
  juntar('Cintura', a.cintura, ' cm')
  juntar('Quadril', a.quadril, ' cm')
  juntar('RCQ', a.rcq, '', 2)
  juntar('Braço', a.braco, ' cm')
  juntar('Coxa', a.coxa, ' cm')
  juntar('Panturrilha', a.panturrilha, ' cm')

  return (
    <View style={styles.cartao}>
      <Text style={styles.tituloCartao}>{dataLegivel(a.data) ?? 'Avaliação'}</Text>

      {medidas.length === 0 ? (
        <Text style={styles.vazioInterno}>Sem medidas registradas nesta avaliação.</Text>
      ) : (
        <View style={styles.grade}>
          {medidas.map(m => (
            <View key={m.rotulo} style={styles.celula}>
              <Text style={styles.rotuloCelula}>{m.rotulo}</Text>
              <Text style={styles.valorCelula}>{m.valor}</Text>
            </View>
          ))}
        </View>
      )}

      {!!a.observacoes?.trim() && <Text style={styles.observacao}>{a.observacoes}</Text>}
    </View>
  )
}

/* ── Plano alimentar ───────────────────────────────────────────────────────*/

/* O plano é um cardápio POR DIA, e a tela mostra um dia de cada vez.
 *
 * A primeira versão despejava todas as refeições numa lista só. Num plano de
 * rotina — o formato que o web cria por padrão — isso são as mesmas quatro ou
 * cinco refeições repetidas em seis dias, trinta cartões em sequência, sem nada
 * dizendo onde um dia acaba e o outro começa. Ninguém acha o próprio almoço ali.
 *
 * Mesma leitura que o portal e o painel do web fazem do mesmo dado: fita de dias
 * em cima, cardápio do dia escolhido embaixo. E, quando o plano tem um dia só,
 * fita nenhuma — um seletor com um botão não seleciona coisa alguma. */
function CorpoPlano({ plano }: { plano: PlanoDaNutri }) {
  const styles = estilos()
  /* Abre no dia de hoje, que é a pergunta que traz a pessoa aqui ("o que eu como
     hoje?"). Se o plano não cobre hoje — rotina de segunda a sábado aberta num
     domingo —, abre no primeiro dia que existe, em vez de numa tela vazia. */
  const [diaAberto, setDiaAberto] = useState(() => {
    const hoje = diaDeHojeNoPlano()
    return plano.dias.some(d => d.dia === hoje) ? hoje : plano.dias[0]?.dia ?? null
  })

  const umDiaSo = plano.dias.length <= 1
  const dia = umDiaSo ? plano.dias[0] : plano.dias.find(d => d.dia === diaAberto)

  return (
    <>
      <Text style={styles.chamada}>{plano.titulo?.trim() || 'Plano alimentar'}</Text>
      {!!plano.descricao && <Text style={styles.explicacao}>{plano.descricao}</Text>}

      {plano.dias.length === 0 ? (
        <Aviso texto="Este plano ainda não tem refeições montadas." />
      ) : (
        <>
          {!umDiaSo && (
            <>
              <View style={styles.fitas}>
                {plano.dias.map(d => {
                  const aberto = d.dia === diaAberto
                  return (
                    <Pressable
                      key={String(d.dia)}
                      onPress={() => setDiaAberto(d.dia)}
                      style={[styles.fita, aberto && styles.fitaAberta]}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: aberto }}
                      accessibilityLabel={nomeDoDia(d.dia)}
                    >
                      <Text style={[styles.textoFita, aberto && styles.textoFitaAberto]}>
                        {nomeCurtoDoDia(d.dia)}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
              <Text style={styles.tituloDia}>{nomeDoDia(dia?.dia ?? null)}</Text>
            </>
          )}

          {!dia || dia.refeicoes.length === 0 ? (
            <Aviso texto="Nenhuma refeição montada neste dia." />
          ) : (
            dia.refeicoes.map(r => (
              <View key={r.id} style={styles.cartao}>
                <View style={styles.linhaRefeicao}>
                  <Text style={styles.tituloCartao}>{r.nome}</Text>
                  {!!r.horario && <Text style={styles.horario}>{r.horario}</Text>}
                </View>

                {r.itens.length === 0 ? (
                  <Text style={styles.vazioInterno}>Sem itens nesta refeição.</Text>
                ) : (
                  r.itens.map(i => (
                    <View key={i.id} style={styles.item}>
                      <Text style={styles.rotuloItem}>{i.rotulo}</Text>
                      <Text style={styles.apoioItem}>{apoioDoItem(i.quantidadeG, i.medidaCaseira, i.energiaKcal)}</Text>
                    </View>
                  ))
                )}
              </View>
            ))
          )}
        </>
      )}
    </>
  )
}

/* Refeição sem dia não deveria existir, mas a coluna aceita nulo — e um dia
   chamado "undefined" na fita seria pior do que um rótulo honesto. */
const nomeDoDia = (dia: number | null) =>
  dia == null ? 'Sem dia definido' : DIAS_DO_PLANO[dia] ?? `Dia ${dia}`

const nomeCurtoDoDia = (dia: number | null) =>
  dia == null ? '—' : DIAS_DO_PLANO_CURTOS[dia] ?? String(dia)

/* "120 g · 3 unidades pequenas · 78 kcal", pulando o que não existe. Um item de
   texto livre ("Ovo mexido") não tem nada disso e fica só com o nome. */
function apoioDoItem(
  quantidadeG: number | null,
  medida: string | null,
  kcal: number | null,
): string {
  const partes: string[] = []
  if (quantidadeG != null) partes.push(`${decimal(quantidadeG, 0)} g`)
  if (medida?.trim()) partes.push(medida.trim())
  if (kcal != null) partes.push(`${milhar(kcal)} kcal`)
  return partes.join(' · ')
}

/* ── Cálculo energético ────────────────────────────────────────────────────*/

function CartaoEnergetico({ energetico: e }: { energetico: Energetico }) {
  const styles = estilos()
  const linhas: { rotulo: string; valor: string }[] = []
  if (e.tmb != null) linhas.push({ rotulo: 'Metabolismo basal', valor: `${milhar(e.tmb)} kcal` })
  if (e.fatorAtividade != null) linhas.push({ rotulo: 'Fator de atividade', valor: decimal(e.fatorAtividade, 2) })
  if (e.formula?.trim()) linhas.push({ rotulo: 'Fórmula', valor: e.formula })
  if (e.peso != null) linhas.push({ rotulo: 'Peso usado', valor: `${decimal(e.peso)} kg` })
  if (e.altura != null) linhas.push({ rotulo: 'Altura usada', valor: `${decimal(e.altura, 0)} cm` })
  if (e.idade != null) linhas.push({ rotulo: 'Idade', valor: `${e.idade} anos` })
  if (e.proteinaGkg != null) linhas.push({ rotulo: 'Proteína', valor: `${decimal(e.proteinaGkg, 1)} g por kg` })
  if (e.carboPct != null) linhas.push({ rotulo: 'Carboidrato', valor: `${decimal(e.carboPct, 0)}% do total` })

  return (
    <>
      <View style={styles.cartaoDestaque}>
        <Text style={styles.rotuloDestaque}>Gasto energético total</Text>
        <Text style={styles.numeroDestaque}>
          {e.getTotal != null ? milhar(e.getTotal) : '—'}
          <Text style={styles.unidadeDestaque}> kcal/dia</Text>
        </Text>
        {!!dataLegivel(e.data) && (
          <Text style={styles.dataDestaque}>Calculado em {dataLegivel(e.data)}</Text>
        )}
      </View>

      {linhas.length > 0 && (
        <View style={styles.cartao}>
          <Text style={styles.tituloCartao}>Como foi calculado</Text>
          {linhas.map(l => (
            <View key={l.rotulo} style={styles.campo}>
              <Text style={styles.rotuloCampo}>{l.rotulo}</Text>
              <Text style={styles.valorCampo}>{l.valor}</Text>
            </View>
          ))}
        </View>
      )}

      {!!e.observacoes?.trim() && (
        <View style={styles.cartao}>
          <Text style={styles.tituloCartao}>Observações</Text>
          <Text style={styles.observacao}>{e.observacoes}</Text>
        </View>
      )}
    </>
  )
}

/* ── Peças ─────────────────────────────────────────────────────────────────*/

function Aviso({ texto }: { texto: string }) {
  const styles = estilos()
  return (
    <View style={styles.aviso}>
      <Text style={styles.textoAviso}>{texto}</Text>
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
  tituloTela: { fontSize: 17, fontWeight: '800', color: t.cores.ink },

  conteudo: { paddingHorizontal: 20, paddingBottom: 32 },

  chamada: { marginTop: 6, fontSize: 18, fontWeight: '800', color: t.cores.ink },
  explicacao: { marginTop: 6, fontSize: 13.5, lineHeight: 20, color: t.inkSuave },

cartaoPressionado: { backgroundColor: t.cores.superficie },
  linhaExame: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconeExame: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: t.cores.verdeMenta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoExame: { flex: 1, gap: 2 },
  nomeExame: { fontSize: 14.5, fontWeight: '700', color: t.cores.ink },
  apoioExame: { fontSize: 12, color: t.inkFraco },
  observacaoExame: { marginTop: 10, fontSize: 13, lineHeight: 19, color: t.inkSuave },
  seloAnalise: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    marginTop: 10,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: t.cores.verdeClaro,
  },
  textoSeloAnalise: { fontSize: 11.5, fontWeight: '700', color: t.cores.verde },
    cartao: { borderRadius: 20, backgroundColor: t.cores.cartao, padding: 16, marginTop: 12 },
  tituloCartao: { fontSize: 15, fontWeight: '800', color: t.cores.ink },
  subtituloCartao: { marginTop: 2, fontSize: 12.5, color: t.inkSuave },
  vazioInterno: { marginTop: 10, fontSize: 13, color: t.inkFraco },

  secao: { marginTop: 16 },
  tituloSecao: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: t.cores.verde,
    marginBottom: 6,
  },

  campo: { marginTop: 8 },
  rotuloCampo: { fontSize: 12, color: t.inkSuave },
  valorCampo: { marginTop: 1, fontSize: 14, lineHeight: 20, color: t.cores.ink },
  linhaGrupo: {
    marginTop: 6,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: t.cores.trilho,
  },

  grade: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 },
  celula: { width: '33.33%', paddingVertical: 7, paddingRight: 8 },
  rotuloCelula: { fontSize: 11.5, color: t.inkSuave },
  valorCelula: { marginTop: 2, fontSize: 15, fontWeight: '700', color: t.cores.ink },

  observacao: { marginTop: 12, fontSize: 13.5, lineHeight: 20, color: t.inkSuave },

  /* Sete fitas numa linha só, com wrap: em tela estreita a última desce em vez
     de espremer as sete até o texto sumir. Mesma medida do SeletorDias, que é a
     fita que a pessoa já conhece dos planos dela. */
  fitas: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 16 },
  fita: {
    flexGrow: 1,
    minWidth: 42,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.cores.borda,
    backgroundColor: t.cores.cartao,
  },
  fitaAberta: { backgroundColor: t.cores.verdeMenta, borderColor: t.cores.verdeClaro },
  textoFita: { fontSize: 12.5, fontWeight: '600', color: t.inkSuave },
  textoFitaAberto: { fontWeight: '800', color: t.cores.verdeEscuro },
  /* O nome por extenso embaixo da fita: "Seg" sozinho é abreviação de fita, e
     quem abre o plano quer ler o dia inteiro em algum lugar. */
  tituloDia: { marginTop: 16, fontSize: 15, fontWeight: '800', color: t.cores.ink },

  linhaRefeicao: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  horario: { fontSize: 13, fontWeight: '700', color: t.cores.verde },
  item: { marginTop: 10 },
  rotuloItem: { fontSize: 14.5, color: t.cores.ink },
  apoioItem: { marginTop: 1, fontSize: 12.5, color: t.inkSuave },

  cartaoDestaque: {
    borderRadius: 20,
    backgroundColor: t.cores.verdeMenta,
    padding: 20,
    marginTop: 12,
    alignItems: 'center',
  },
  rotuloDestaque: { fontSize: 12.5, fontWeight: '700', color: t.cores.verde },
  numeroDestaque: { marginTop: 6, fontSize: 34, fontWeight: '800', color: t.cores.ink },
  unidadeDestaque: { fontSize: 15, fontWeight: '600', color: t.inkSuave },
  dataDestaque: { marginTop: 4, fontSize: 12, color: t.inkSuave },

  aviso: { marginTop: 16, borderRadius: 16, backgroundColor: t.cores.cartao, padding: 18 },
fotoReceita: { width: '100%', height: 150, borderRadius: 12, marginBottom: 12 },
  linhaTituloReceita: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  nomeReceita: { flexShrink: 1, fontSize: 16, fontWeight: '800', color: t.cores.ink },
  etiquetaReceita: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: t.cores.verdeClaro,
  },
  textoEtiquetaReceita: { fontSize: 10.5, fontWeight: '800', color: t.cores.limao },
  apoioReceita: { marginTop: 3, fontSize: 12.5, color: t.inkFraco },
  descricaoReceita: { marginTop: 8, fontSize: 13.5, lineHeight: 20, color: t.inkSuave },
  /* Os macros ficam numa fileira separada por linhas, e não em chips: são
     quatro números curtos que se leem de uma vez, e chip vira ruído aqui. */
  macrosReceita: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: t.cores.borda,
  },
  macroReceita: { flex: 1, alignItems: 'center', gap: 1 },
  valorMacroReceita: { fontSize: 14, fontWeight: '800', color: t.cores.ink },
  rotuloMacroReceita: { fontSize: 10.5, color: t.inkFraco },
  rotuloPreparo: {
    marginTop: 14,
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: t.cores.limao,
  },
  preparoReceita: { marginTop: 5, fontSize: 13.5, lineHeight: 21, color: t.inkMedio },
  textoAviso: { fontSize: 13.5, lineHeight: 20, color: t.inkSuave, textAlign: 'center' },
  }),
)
