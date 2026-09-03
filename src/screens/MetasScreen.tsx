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
import {
  LIMITES,
  METAS_VAZIAS,
  carregarCorpoDaConta,
  carregarGastoMedido,
  carregarMetasAtivas,
  diferencaDeCalorias,
  salvarMetas,
  type CampoMeta,
  type Metas,
  type MetasSalvas,
} from '../lib/metas'
import {
  camposPrescritos,
  carregarMetasPrescritas,
  type CamposPrescritos,
  type MetasPrescritas,
} from '../lib/metasPrescritas'
import { milhar } from '../lib/formatar'
import { comoFoiCalculado, metasSugeridas, type Sugestao } from '../lib/metasSugeridas'
import { estilosDe, paleta } from '../lib/tema'

/* Onde a pessoa escreve o que ela está perseguindo.
 *
 * Todo campo é opcional, e é isso que dá o formato da tela: não existe "salvar
 * as metas" como um bloco fechado que se preenche de uma vez. Existe uma lista
 * de coisas que dá para acompanhar, e a pessoa liga as que interessam a ela.
 * Quem só quer contar passos deixa o resto em branco e a tela não reclama.
 *
 * Vários conjuntos por conta, com um ativo — um de déficit e um de manutenção,
 * por exemplo. O foco do peso NÃO está aqui: é um por pessoa, mora em app_contas
 * e é editado no Perfil. */

/* O que a tela deve abrir. Três casos e não dois: 'ativa' é o caminho do "+" e
   do menu, onde a pessoa quer mexer no que está valendo sem escolher nada. */
export type AlvoMetas = MetasSalvas | 'nova' | 'ativa'

type Campo = {
  chave: CampoMeta
  rotulo: string
  /* O que a unidade É. Vai na mensagem de limite e na leitura de tela, onde a
     palavra inteira ajuda: "de 500 a 100.000 passos". */
  unidade: string
  /* O que APARECE à direita do campo, e que nem sempre é a unidade.
   *
   * Em "Passos · por dia · [8000] passos" a palavra da ponta só repete o rótulo
   * — e ainda quebra em duas linhas na coluna estreita. Fica vazia: quem lê
   * "Passos" já sabe que 8000 são passos. */
  sufixo: string
  /* "por dia" na maioria, "por semana" no treino. Escrito por extenso porque a
     unidade sozinha não diz o período, e o período é metade da meta. */
  periodo: string
  icone: keyof typeof Ionicons.glyphMap
  exemplo: string
}

const ALIMENTACAO: Campo[] = [
  { chave: 'calorias', rotulo: 'Calorias', unidade: 'kcal', sufixo: 'kcal', periodo: 'por dia', icone: 'flame-outline', exemplo: '2000' },
  { chave: 'proteinas', rotulo: 'Proteínas', unidade: 'g', sufixo: 'g', periodo: 'por dia', icone: 'nutrition-outline', exemplo: '150' },
  { chave: 'carboidratos', rotulo: 'Carboidratos', unidade: 'g', sufixo: 'g', periodo: 'por dia', icone: 'pizza-outline', exemplo: '250' },
  { chave: 'gorduras', rotulo: 'Gorduras', unidade: 'g', sufixo: 'g', periodo: 'por dia', icone: 'egg-outline', exemplo: '70' },
  { chave: 'fibras', rotulo: 'Fibras', unidade: 'g', sufixo: 'g', periodo: 'por dia', icone: 'leaf-outline', exemplo: '25' },
]

/* Metas que o app guarda e ainda NÃO tem como medir.
 *
 * Passos precisa do histórico do aparelho (Health Connect no Android), que não
 * existe no Expo Go — o sensor de lá só conta com o app aberto na frente, e um
 * "passos de hoje" assim contaria só o que a pessoa andou olhando para a tela.
 *
 * A meta continua existindo de propósito: ela é da PESSOA, e apagá-la agora
 * apagaria o número de quem já definiu. O que faltava era a tela dizer isso.
 * Definir uma meta que nada mede, e não descobrir nunca por quê, é pior do que
 * não poder definir. */
const SEM_MEDICAO = new Set<CampoMeta>(['passos'])

const MOVIMENTO: Campo[] = [
  { chave: 'passos', rotulo: 'Passos', unidade: 'passos', sufixo: '', periodo: 'por dia', icone: 'walk-outline', exemplo: '8000' },
  { chave: 'treinosSemana', rotulo: 'Treinos', unidade: 'treinos', sufixo: '', periodo: 'por semana', icone: 'barbell-outline', exemplo: '4' },
]

const DESCANSO: Campo[] = [
  { chave: 'sonoHoras', rotulo: 'Sono', unidade: 'h', sufixo: 'h', periodo: 'por noite', icone: 'moon-outline', exemplo: '8' },
]

/* Texto do formulário, um por campo. Guardado como string e não como número
   porque campo em branco, "0" e "07" são três coisas diferentes enquanto se
   digita, e todas viram o mesmo número cedo demais se a conversão for na tecla. */
type Textos = Record<CampoMeta, string>

const textoDe = (v: number | null) => (v === null ? '' : String(v))

const textosDe = (m: Metas): Textos => ({
  calorias: textoDe(m.calorias),
  proteinas: textoDe(m.proteinas),
  carboidratos: textoDe(m.carboidratos),
  gorduras: textoDe(m.gorduras),
  fibras: textoDe(m.fibras),
  aguaMl: String(m.aguaMl),
  copoMl: String(m.copoMl),
  passos: textoDe(m.passos),
  treinosSemana: textoDe(m.treinosSemana),
  sonoHoras: textoDe(m.sonoHoras),
})

/* O sono é o único campo com casa decimal — sete horas e meia é uma meta que
   existe. Todo o resto é contagem inteira: mililitro, passo, grama, caloria. */
const ehDecimal = (chave: CampoMeta) => chave === 'sonoHoras'

/* Vazio é null — "não acompanho isso" —, e não zero.
 *
 * Nos campos inteiros, ponto e vírgula são DESCARTADOS em vez de interpretados.
 * Quem digita "10.000" passos quer dez mil, e `Number("10.000")` é 10 — que cai
 * abaixo do mínimo de 500 e trava o salvar sem explicar por quê. A ironia é que
 * a própria mensagem de erro escreve a faixa com ponto ("de 500 a 100.000"),
 * ensinando o formato que o campo recusava. Mesma regra da tela de Água, que já
 * filtrava só dígitos.
 *
 * No sono, ponto e vírgula valem como separador decimal: o teclado brasileiro
 * oferece vírgula, e obrigar a traduzir para ponto seria pedir demais. */
const numeroDe = (texto: string, chave: CampoMeta): number | null => {
  const limpo = ehDecimal(chave)
    ? texto.trim().replace(',', '.')
    : texto.replace(/[^0-9]/g, '')

  if (limpo === '') return null
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}

/* Fora dos limites do banco? Vazio nunca é inválido: é a ausência da meta —
   exceto água e copo, que precisam de valor para a tela de Água desenhar. */
function invalido(chave: CampoMeta, texto: string): boolean {
  const n = numeroDe(texto, chave)
  if (n === null) return chave === 'aguaMl' || chave === 'copoMl'
  const { min, max } = LIMITES[chave]
  return n < min || n > max
}

const nomeAutomatico = () => {
  const d = new Date()
  return `Metas de ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function MetasScreen({
  contaId,
  alvo,
  onFechar,
  onSalvo,
}: {
  contaId: string
  alvo: AlvoMetas
  onFechar: () => void
  /* A tela inicial, a de Água e a lista de cadastros leem estas metas; salvar
     precisa empurrar uma busca nova nelas. */
  onSalvo: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const [textos, setTextos] = useState<Textos>(() =>
    textosDe(typeof alvo === 'string' ? METAS_VAZIAS : alvo),
  )
  const [nome, setNome] = useState(typeof alvo === 'string' ? '' : alvo.nome)
  /* O id do conjunto sendo editado. null grava um conjunto novo. */
  const [id, setId] = useState<string | null>(typeof alvo === 'string' ? null : alvo.id)
  /* 'ativa' e 'nova' buscam o conjunto que está valendo; só o caminho que abre
     um conjunto escolhido da lista já nasce pronto. */
  const [carregando, setCarregando] = useState(alvo === 'ativa' || alvo === 'nova')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  /* O que a nutricionista prescreveu, se houver. Não muda nada do que se grava
     aqui — o que se edita nesta tela continua sendo do paciente. Serve para a
     tela DIZER quais campos estão cobertos por ela, porque senão a pessoa edita
     um número, salva, e vê a tela inicial mostrando outro. */
  const [prescricao, setPrescricao] = useState<MetasPrescritas | null>(null)
  const prescritos = camposPrescritos(prescricao)

  /* A SUGESTÃO CALCULADA.
   *
   * Esta tela pedia onze números, e quem baixa um aplicativo de nutrição não
   * sabe quantos gramas de gordura deve comer por dia — é por isso que ela
   * baixou o aplicativo. O app já sabia calcular (Mifflin-St Jeor, fator de
   * atividade, ajuste), já usava isso na sugestão de plano e no treino, e não
   * usava aqui.
   *
   * Nula quando falta dado. A tela não mostra o botão nesse caso, em vez de
   * mostrar um botão que não faz nada. */
  const [sugestao, setSugestao] = useState<Sugestao | null>(null)
  const [usouSugestao, setUsouSugestao] = useState(false)

  useEffect(() => {
    let ativo = true
    /* As duas em paralelo: o gasto medido le oito semanas de diario e o peso
       inteiro, e segurar o corpo esperando por ele atrasaria o botao sem
       necessidade -- ele so aparece depois que as duas voltam de qualquer
       jeito. */
    Promise.all([carregarCorpoDaConta(contaId), carregarGastoMedido(contaId)]).then(
      ([corpo, medido]) => {
        /* A escada: o MEDIDO vence o calculo dela, que vence a formula.
           Formula estatica erra de 15 a 25% por pessoa, e o medido sai do que
           ela realmente comeu contra o que o peso fez. */
        /* Só o número aqui: esta tela sugere metas, e a explicação de onde o
           gasto saiu mora na tela de Peso, junto da linha de tendência que o
           produziu. */
        if (ativo) setSugestao(metasSugeridas(corpo, corpo.alvoKcalDoCalculo, medido?.kcal ?? null))
      },
    )
    return () => {
      ativo = false
    }
  }, [contaId])

  /* Preenche os campos e NÃO salva. A pessoa vê os números, edita o que quiser
     e salva — uma conta que se impõe sem ser vista é a mesma coisa que pedir o
     número, só que pior, porque ela não sabe de onde veio.

     A água entra junto porque ela nunca é nula: a tela de Água precisa de um
     número para desenhar qualquer coisa. */
  function aplicarSugestao(sg: Sugestao) {
    setTextos(t => ({
      ...t,
      calorias: String(sg.calorias),
      proteinas: String(sg.proteinas),
      carboidratos: String(sg.carboidratos),
      gorduras: String(sg.gorduras),
      fibras: String(sg.fibras),
      aguaMl: String(sg.aguaMl),
    }))
    setUsouSugestao(true)
  }

  /* Independente da carga das metas, e sem segurar a tela: quem não tem
     nutricionista — a maior parte de quem usa — não pode esperar por uma
     consulta que vai voltar vazia. `carregarMetasPrescritas` nunca rejeita. */
  useEffect(() => {
    let ativo = true
    carregarMetasPrescritas().then(p => {
      if (ativo) setPrescricao(p)
    })
    return () => {
      ativo = false
    }
  }, [contaId])

  useEffect(() => {
    if (alvo !== 'ativa' && alvo !== 'nova') return
    let ativo = true

    carregarMetasAtivas(contaId).then(r => {
      if (!ativo) return

      if (r.tipo === 'erro') setErro(r.mensagem)
      else if (r.metas) {
        /* Os dois caminhos partem do que já vale, e diferem no que fazem com
           ele: 'ativa' edita a mesma linha; 'nova' cria outra a partir dela.
         *
         * Nascer em branco era o comportamento anterior, e ele perdia meta sem
         * avisar: o conjunto novo vira o ativo por gatilho da tabela, então
         * quem entrava aqui para anotar só a meta de treino saía com calorias,
         * macros e água zerados na tela inicial. Mesmo cuidado que a tela de
         * Cálculo Energético já toma ao gravar metas — lá o comentário diz que
         * "partir de um objeto vazio apagaria passos, sono e o foco de peso de
         * quem já os tinha".
         *
         * O nome fica de fora na cópia: repetir "Metas de 20/08" em dois
         * conjuntos deixaria a lista impossível de ler. Vazio, o salvar gera um
         * nome com a data de hoje. */
        setTextos(textosDe(r.metas))
        if (alvo === 'ativa') {
          setNome(r.metas.nome)
          setId(r.metas.id)
        }
      }
      setCarregando(false)
    })

    return () => {
      ativo = false
    }
  }, [contaId, alvo])

  /* O campo só aceita separador onde ele significa alguma coisa: no sono. Nos
     inteiros o ponto nem chega a ser digitado, então a pessoa vê "10000" na
     hora e não descobre o problema só na hora de salvar. */
  const escrever = (chave: CampoMeta) => (t: string) =>
    setTextos(prev => ({
      ...prev,
      [chave]: ehDecimal(chave) ? t.replace(/[^0-9.,]/g, '') : t.replace(/[^0-9]/g, ''),
    }))

  const metas: Metas = {
    calorias: numeroDe(textos.calorias, 'calorias'),
    proteinas: numeroDe(textos.proteinas, 'proteinas'),
    carboidratos: numeroDe(textos.carboidratos, 'carboidratos'),
    gorduras: numeroDe(textos.gorduras, 'gorduras'),
    fibras: numeroDe(textos.fibras, 'fibras'),
    aguaMl: numeroDe(textos.aguaMl, 'aguaMl') ?? METAS_VAZIAS.aguaMl,
    copoMl: numeroDe(textos.copoMl, 'copoMl') ?? METAS_VAZIAS.copoMl,
    passos: numeroDe(textos.passos, 'passos'),
    treinosSemana: numeroDe(textos.treinosSemana, 'treinosSemana'),
    sonoHoras: numeroDe(textos.sonoHoras, 'sonoHoras'),
  }

  const camposInvalidos = (Object.keys(LIMITES) as CampoMeta[]).filter(c => invalido(c, textos[c]))
  const podeSalvar = camposInvalidos.length === 0 && !salvando
  const desencontro = diferencaDeCalorias(metas)
  const quantasDefinidas = [
    metas.calorias,
    metas.proteinas,
    metas.carboidratos,
    metas.gorduras,
    metas.fibras,
    metas.passos,
    metas.treinosSemana,
    metas.sonoHoras,
  ].filter(v => v !== null).length

  async function salvar() {
    setSalvando(true)
    setErro('')

    const r = await salvarMetas(contaId, { id, nome: nome.trim() || nomeAutomatico(), metas })
    setSalvando(false)

    if (r.tipo === 'erro') {
      setErro(r.mensagem)
      return
    }

    onSalvo()
    onFechar()
  }

  return (
    <KeyboardAvoidingView
      style={[styles.tela, { paddingTop: top + 8 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
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
        <Text style={styles.tituloTela}>{id ? 'Editar metas' : 'Novas metas'}</Text>
        <View style={styles.botaoVoltar} />
      </View>

      {carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator color={paleta().cores.verde} />
        </View>
      ) : (
        <>
          <ScrollView
            /* `flex: 1` na ROLAGEM, e nao so no container.
               Sem isto ela se dimensiona pelo conteudo e o rodape fixo -- irmao
               dela -- para onde o conteudo achar que acabou: no MEIO da tela.
               `contentContainerStyle` NAO resolve: ele estiliza o conteudo
               dentro da rolagem, e nao a rolagem. */
            style={styles.rolagem}
            contentContainerStyle={styles.conteudo}
            showsVerticalScrollIndicator={false}
            bounces={false}
            overScrollMode="never"
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <Text style={styles.chamada}>
              Preencha só o que você quer acompanhar. O que ficar em branco não aparece em lugar
              nenhum do app.
            </Text>

            {/* O app tem duas frentes, e é aqui que elas se encontram. Quem não
                tem nutricionista não vê nada disto e a tela é a de sempre.

                Quem tem precisa entender uma coisa que, sem este aviso, se lê
                como defeito: o que ela prescreveu vence, então editar um campo
                marcado não muda o que a tela inicial mostra. O aviso diz isso
                antes de a pessoa digitar, e não depois de salvar. */}
            {prescricao && (
              <View style={styles.blocoDela}>
                <View style={styles.linhaTituloDela}>
                  <Ionicons name="ribbon-outline" size={15} color={paleta().cores.verde} />
                  <Text style={styles.tituloDela} numberOfLines={2}>
                    {prescricao.nome}
                  </Text>
                </View>

                <Text style={styles.textoDela}>
                  {prescritos.size > 0
                    ? 'Sua nutricionista prescreveu este plano, e os campos marcados abaixo seguem o que ela definiu. As suas metas continuam guardadas aqui, e valem para tudo que ela não definiu.'
                    : prescricao.tipo === 'detalhado'
                      ? 'Sua nutricionista montou este plano em tarefas por dia, e não em números — então ele não muda as metas daqui. Veja com ela como acompanhar.'
                      : `Sua nutricionista montou este plano por ${prescricao.periodo === 'mensal' ? 'mês' : 'semana'}, e as metas daqui são por dia. O app não tem como repartir os números dela sem inventar uma divisão que ela não escreveu — então continua valendo o que está abaixo.`}
                </Text>

                {!!prescricao.objetivo && (
                  <Text style={styles.objetivoDela} numberOfLines={3}>
                    {prescricao.objetivo}
                  </Text>
                )}
              </View>
            )}

            {!!erro && (
              <View style={styles.blocoErro}>
                <Text style={styles.tituloErro}>Não foi possível salvar</Text>
                {/* A mensagem crua junto: sem ela, "sem internet" e "migração
                    não aplicada" viram o mesmo aviso. */}
                <Text style={styles.detalheErro}>{erro}</Text>
              </View>
            )}

            <Secao titulo="Nome deste conjunto" icone="bookmark-outline">
              <TextInput
                value={nome}
                onChangeText={setNome}
                placeholder={nomeAutomatico()}
                placeholderTextColor={paleta().inkFraco}
                keyboardAppearance="dark"
                maxLength={80}
                style={styles.campoNome}
                accessibilityLabel="Nome do conjunto de metas"
              />
              <Text style={styles.notaSecao}>
                {id
                  ? 'Você está editando um conjunto que já existe.'
                  : 'Você pode ter vários conjuntos guardados — um de déficit e um de manutenção, por exemplo — e alternar entre eles. Este passa a ser o que vale.'}
              </Text>
            </Secao>

            {/* O ATALHO, antes dos campos.
                Depois deles seria decoração: quem já digitou onze números não
                precisa mais de ajuda. */}
            {sugestao !== null && (
              <View style={styles.blocoSugestao}>
                <View style={styles.tituloSugestao}>
                  <Ionicons name="sparkles" size={17} color={paleta().cores.verde} />
                  <Text style={styles.textoTituloSugestao}>
                    {usouSugestao ? 'Preenchi para você' : 'Não sabe quais números usar?'}
                  </Text>
                </View>

                <Text style={styles.explicacaoSugestao}>
                  {usouSugestao
                    ? `${comoFoiCalculado(sugestao)} Edite o que quiser antes de salvar.`
                    : 'Eu calculo a partir do que você já tem cadastrado — peso, altura, idade — e você ajusta o que quiser antes de salvar.'}
                </Text>

                {!usouSugestao && (
                  <Pressable
                    onPress={() => aplicarSugestao(sugestao)}
                    style={({ pressed }) => [styles.botaoSugestao, pressed && styles.botaoSugestaoPressionado]}
                    accessibilityRole="button"
                    accessibilityLabel="Calcular minhas metas"
                  >
                    <Text style={styles.textoBotaoSugestao}>
                      Calcular para mim ({milhar(sugestao.calorias)} kcal)
                    </Text>
                  </Pressable>
                )}
              </View>
            )}

            <Secao titulo="Alimentação" icone="restaurant-outline">
              {ALIMENTACAO.map(c => (
                <LinhaCampo
                  prescritos={prescritos}
                  key={c.chave}
                  campo={c}
                  valor={textos[c.chave]}
                  invalido={invalido(c.chave, textos[c.chave])}
                  onChange={escrever(c.chave)}
                />
              ))}

              {/* O aviso de coerência. Não corrige nada e não impede o salvamento:
                  quem mira nos macros e usa a caloria como referência frouxa não
                  cometeu erro nenhum. Só que ninguém consegue fazer 4/4/9 de
                  cabeça, e sem isto o desencontro passaria despercebido. */}
              {desencontro && (
                <View style={styles.aviso}>
                  <Ionicons name="information-circle-outline" size={16} color={paleta().cores.verde} />
                  <Text style={styles.textoAviso}>
                    Seus macros somam {milhar(desencontro.kcalMacros)} kcal
                    {desencontro.diferenca > 0 ? ', acima' : ', abaixo'} da meta de{' '}
                    {milhar(metas.calorias ?? 0)} kcal.
                  </Text>
                </View>
              )}
            </Secao>

            <Secao titulo="Água" icone="water-outline">
              <LinhaCampo
                prescritos={prescritos}
                campo={{
                  chave: 'aguaMl',
                  rotulo: 'Água',
                  unidade: 'ml',
                  sufixo: 'ml',
                  periodo: 'por dia',
                  icone: 'water-outline',
                  exemplo: '2000',
                }}
                valor={textos.aguaMl}
                invalido={invalido('aguaMl', textos.aguaMl)}
                onChange={escrever('aguaMl')}
              />
              <LinhaCampo
                prescritos={prescritos}
                campo={{
                  chave: 'copoMl',
                  rotulo: 'Seu copo',
                  unidade: 'ml',
                  sufixo: 'ml',
                  periodo: 'tamanho',
                  icone: 'cafe-outline',
                  exemplo: '250',
                }}
                valor={textos.copoMl}
                invalido={invalido('copoMl', textos.copoMl)}
                onChange={escrever('copoMl')}
              />
              {/* A água é a única meta que já vem preenchida, porque a tela dela
                  precisa de um número para desenhar. Vale avisar que o mesmo par
                  de campos também mora lá — senão parecem duas metas. */}
              <Text style={styles.notaSecao}>
                Estes dois também podem ser ajustados direto na tela de Água, que sempre mexe no
                conjunto ativo.
              </Text>
            </Secao>

            <Secao titulo="Movimento" icone="walk-outline">
              {MOVIMENTO.map(c => (
                <LinhaCampo
                  prescritos={prescritos}
                  key={c.chave}
                  campo={c}
                  valor={textos[c.chave]}
                  invalido={invalido(c.chave, textos[c.chave])}
                  onChange={escrever(c.chave)}
                />
              ))}
              <Text style={styles.notaSecao}>
                Passos e treinos ainda não são registrados pelo app — a meta fica guardada esperando
                a tela de cada um.
              </Text>
            </Secao>

            <Secao titulo="Descanso" icone="moon-outline">
              {DESCANSO.map(c => (
                <LinhaCampo
                  prescritos={prescritos}
                  key={c.chave}
                  campo={c}
                  valor={textos[c.chave]}
                  invalido={invalido(c.chave, textos[c.chave])}
                  onChange={escrever(c.chave)}
                />
              ))}
            </Secao>
          </ScrollView>

          {/* Rodapé fixo: a lista tem onze campos e rola bastante, e um botão de
              salvar lá no fim sumiria assim que o teclado subisse. */}
          <View style={[styles.rodape, { paddingBottom: Math.max(bottom, 16) }]}>
            {camposInvalidos.length > 0 && (
              <Text style={styles.avisoRodape}>
                {camposInvalidos.length === 1
                  ? 'Um campo está fora dos limites.'
                  : `${camposInvalidos.length} campos estão fora dos limites.`}
              </Text>
            )}

            <Pressable
              onPress={salvar}
              disabled={!podeSalvar}
              style={({ pressed }) => [
                styles.botao,
                !podeSalvar && styles.botaoDesligado,
                pressed && styles.botaoPressionado,
              ]}
              accessibilityRole="button"
            >
              {salvando ? (
                <ActivityIndicator color={paleta().cores.branco} />
              ) : (
                <Text style={styles.textoBotao}>
                  {quantasDefinidas === 0
                    ? 'Salvar metas'
                    : `Salvar ${quantasDefinidas} ${quantasDefinidas === 1 ? 'meta' : 'metas'}`}
                </Text>
              )}
            </Pressable>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  )
}

function Secao({
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
    <View style={styles.secao}>
      <View style={styles.tituloSecao}>
        <Ionicons name={icone} size={16} color={paleta().cores.verde} />
        <Text style={styles.textoTituloSecao}>{titulo}</Text>
      </View>
      {children}
    </View>
  )
}

/* Rótulo à esquerda, campo à direita. Em linha, e não empilhado: são onze
   campos, e um bloco por campo faria a tela ter três telas de altura — com
   metade delas em branco, porque a maioria dos campos fica vazia. */
function LinhaCampo({
  campo,
  valor,
  invalido,
  prescritos,
  onChange,
}: {
  campo: Campo
  valor: string
  invalido: boolean
  /* Os campos que a nutricionista está cobrindo. Vazio para quem não tem uma —
     e aí a linha se desenha exatamente como antes. */
  prescritos: CamposPrescritos
  onChange: (t: string) => void
}) {
  const styles = estilos()
  const { min, max } = LIMITES[campo.chave]
  const dela = prescritos.has(campo.chave)
  const semMedicao = SEM_MEDICAO.has(campo.chave)

  return (
    <View style={styles.linha}>
      <View style={styles.iconeLinha}>
        <Ionicons name={campo.icone} size={17} color={paleta().cores.verde} />
      </View>

      <View style={styles.textoLinha}>
        <Text style={styles.rotuloLinha}>{campo.rotulo}</Text>
        {/* Três coisas disputam esta linha e a ordem é essa: o erro primeiro,
            porque impede de salvar; a prescrição depois, porque explica por que
            o número digitado aqui não vai aparecer; e o período por último, que
            é o texto de sempre. */}
        <Text
          style={[
            styles.periodoLinha,
            dela && !invalido && styles.periodoDela,
            semMedicao && !invalido && !dela && styles.periodoSemMedicao,
          ]}
        >
          {invalido
            ? `de ${milhar(min)} a ${milhar(max)} ${campo.unidade}`
            : dela
              ? 'sua nutricionista definiu este'
              : semMedicao
                ? 'o app ainda não conta isso'
                : campo.periodo}
        </Text>
      </View>

      <View style={styles.blocoCampo}>
        <TextInput
          value={valor}
          onChangeText={onChange}
          /* decimal-pad só no sono, que é o único campo com casa decimal — sete
             horas e meia é uma meta que existe. Nos inteiros, number-pad: um
             teclado que mostra separador para um campo que o descarta é um
             convite a digitar "10.000" e não entender por que sumiu. */
          keyboardType={ehDecimal(campo.chave) ? 'decimal-pad' : 'number-pad'}
          placeholder={campo.exemplo}
          placeholderTextColor={paleta().inkFraco}
          keyboardAppearance="dark"
          maxLength={6}
          style={[styles.campo, invalido && styles.campoComErro]}
          accessibilityLabel={`${campo.rotulo} ${campo.periodo}, em ${campo.unidade}`}
        />
        {/* numberOfLines para o próximo sufixo comprido não repetir a quebra
            que "passos" e "treinos" davam nesta coluna. */}
        <Text style={styles.unidadeLinha} numberOfLines={1}>
          {campo.sufixo}
        </Text>
      </View>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
  tela: { flex: 1, backgroundColor: t.cores.fundo },
  rolagem: { flex: 1 },
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
  chamada: { fontSize: 13, lineHeight: 19, color: t.inkSuave },

  blocoErro: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.cores.erroBorda,
    backgroundColor: t.cores.erroFundo,
  },
  tituloErro: { fontSize: 13.5, fontWeight: '700', color: t.cores.erroTexto },
  detalheErro: { marginTop: 5, fontSize: 12.5, lineHeight: 18, color: t.cores.erroTexto },

  secao: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: t.cores.cartao,
    borderWidth: 1,
    borderColor: t.cores.borda,
    gap: 10,
  },
  tituloSecao: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  textoTituloSecao: { fontSize: 15, fontWeight: '800', color: t.cores.ink },
  notaSecao: { fontSize: 11.5, lineHeight: 16, color: t.inkFraco },

  /* O atalho que calcula as metas. Tingido, e nao mais um cartao branco: ele
     precisa se distinguir dos onze campos que vem logo abaixo, porque a
     alternativa a ele sao justamente esses onze campos. */
  blocoSugestao: {
    gap: 10,
    backgroundColor: t.cores.verdeClaro,
    borderRadius: 16,
    padding: 15,
  },
  tituloSugestao: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  textoTituloSugestao: { flex: 1, fontSize: 15, fontWeight: '800', color: t.cores.ink },
  explicacaoSugestao: { fontSize: 12.5, color: t.inkMedio, lineHeight: 18 },
  botaoSugestao: {
    backgroundColor: t.cores.verde,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  botaoSugestaoPressionado: { backgroundColor: t.cores.verdeEscuro },
  textoBotaoSugestao: { fontSize: 14.5, fontWeight: '800', color: t.cores.branco },

  campoNome: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.cores.borda,
    backgroundColor: t.cores.superficie,
    paddingHorizontal: 14,
    fontSize: 16,
    color: t.cores.ink,
  },

  linha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconeLinha: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: t.cores.verdeClaro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoLinha: { flex: 1 },
  rotuloLinha: { fontSize: 14, fontWeight: '700', color: t.cores.ink },
  /* O mesmo lugar diz o período e, quando o número não serve, o intervalo
     aceito: são a mesma informação — "o que cabe aqui" — e duas linhas de apoio
     por campo em onze campos viraria uma parede de texto miúdo. */
  periodoLinha: { marginTop: 1, fontSize: 11.5, color: t.inkSuave },
  periodoDela: { color: t.cores.verde, fontWeight: '700' },
  periodoSemMedicao: { color: t.cores.gold },

  blocoDela: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.cores.verde,
    backgroundColor: t.cores.verdeMenta,
    gap: 7,
  },
  linhaTituloDela: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  tituloDela: { flex: 1, fontSize: 14, fontWeight: '800', color: t.cores.ink },
  textoDela: { fontSize: 12.5, lineHeight: 18, color: t.inkMedio },
  objetivoDela: { fontSize: 12.5, lineHeight: 18, color: t.inkSuave, fontStyle: 'italic' },

  blocoCampo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  campo: {
    width: 82,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.cores.borda,
    backgroundColor: t.cores.superficie,
    paddingHorizontal: 10,
    /* 16 é o mínimo que o iOS aceita sem dar zoom automático no campo. */
    fontSize: 16,
    textAlign: 'right',
    color: t.cores.ink,
  },
  campoComErro: { borderColor: t.cores.erroBorda, backgroundColor: t.cores.erroFundo },
  unidadeLinha: { width: 38, fontSize: 11.5, fontWeight: '600', color: t.inkMedio },

  aviso: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    padding: 11,
    borderRadius: 14,
    backgroundColor: t.cores.verdeMenta,
  },
  textoAviso: { flex: 1, fontSize: 12.5, lineHeight: 17, color: t.cores.verdeEscuro },

  rodape: {
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: t.cores.borda,
    backgroundColor: t.cores.fundo,
  },
  avisoRodape: { fontSize: 12, color: t.cores.erroTexto, textAlign: 'center' },
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
