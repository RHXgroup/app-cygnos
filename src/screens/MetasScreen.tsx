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
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  LIMITES,
  METAS_VAZIAS,
  carregarMetasAtivas,
  diferencaDeCalorias,
  salvarMetas,
  type CampoMeta,
  type Metas,
  type MetasSalvas,
} from '../lib/metas'
import { milhar } from '../lib/formatar'
import { cores, inkFraco, inkMedio, inkSuave } from '../theme'

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

/* Vazio é null — "não acompanho isso" —, e não zero. */
const numeroDe = (texto: string): number | null => {
  const limpo = texto.trim().replace(',', '.')
  if (limpo === '') return null
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}

/* Fora dos limites do banco? Vazio nunca é inválido: é a ausência da meta —
   exceto água e copo, que precisam de valor para a tela de Água desenhar. */
function invalido(chave: CampoMeta, texto: string): boolean {
  const n = numeroDe(texto)
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
  const { top, bottom } = useSafeAreaInsets()
  const [textos, setTextos] = useState<Textos>(() =>
    textosDe(typeof alvo === 'string' ? METAS_VAZIAS : alvo),
  )
  const [nome, setNome] = useState(typeof alvo === 'string' ? '' : alvo.nome)
  /* O id do conjunto sendo editado. null grava um conjunto novo. */
  const [id, setId] = useState<string | null>(typeof alvo === 'string' ? null : alvo.id)
  /* Só o caminho 'ativa' precisa buscar; os outros dois já nascem prontos. */
  const [carregando, setCarregando] = useState(alvo === 'ativa')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (alvo !== 'ativa') return
    let ativo = true

    carregarMetasAtivas(contaId).then(r => {
      if (!ativo) return

      if (r.tipo === 'erro') setErro(r.mensagem)
      else if (r.metas) {
        /* Existe conjunto ativo: é ele que se está editando. Sem isto, salvar
           criaria um segundo conjunto idêntico a cada visita ao "+". */
        setTextos(textosDe(r.metas))
        setNome(r.metas.nome)
        setId(r.metas.id)
      }
      setCarregando(false)
    })

    return () => {
      ativo = false
    }
  }, [contaId, alvo])

  const escrever = (chave: CampoMeta) => (t: string) =>
    /* Vírgula passa porque o teclado brasileiro oferece vírgula, e sono é o
       único campo decimal — digitar "7.5" num teclado que mostra vírgula é
       pedir para a pessoa traduzir. A conversão trata as duas. */
    setTextos(prev => ({ ...prev, [chave]: t.replace(/[^0-9.,]/g, '') }))

  const metas: Metas = {
    calorias: numeroDe(textos.calorias),
    proteinas: numeroDe(textos.proteinas),
    carboidratos: numeroDe(textos.carboidratos),
    gorduras: numeroDe(textos.gorduras),
    fibras: numeroDe(textos.fibras),
    aguaMl: numeroDe(textos.aguaMl) ?? METAS_VAZIAS.aguaMl,
    copoMl: numeroDe(textos.copoMl) ?? METAS_VAZIAS.copoMl,
    passos: numeroDe(textos.passos),
    treinosSemana: numeroDe(textos.treinosSemana),
    sonoHoras: numeroDe(textos.sonoHoras),
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
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.cabecalho}>
        <Pressable
          onPress={onFechar}
          style={styles.botaoVoltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela}>{id ? 'Editar metas' : 'Novas metas'}</Text>
        <View style={styles.botaoVoltar} />
      </View>

      {carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator color={cores.verde} />
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
            <Text style={styles.chamada}>
              Preencha só o que você quer acompanhar. O que ficar em branco não aparece em lugar
              nenhum do app.
            </Text>

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
                placeholderTextColor={inkFraco}
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

            <Secao titulo="Alimentação" icone="restaurant-outline">
              {ALIMENTACAO.map(c => (
                <LinhaCampo
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
                  <Ionicons name="information-circle-outline" size={16} color={cores.verde} />
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
                <ActivityIndicator color={cores.branco} />
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
  return (
    <View style={styles.secao}>
      <View style={styles.tituloSecao}>
        <Ionicons name={icone} size={16} color={cores.verde} />
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
  onChange,
}: {
  campo: Campo
  valor: string
  invalido: boolean
  onChange: (t: string) => void
}) {
  const { min, max } = LIMITES[campo.chave]

  return (
    <View style={styles.linha}>
      <View style={styles.iconeLinha}>
        <Ionicons name={campo.icone} size={17} color={cores.verde} />
      </View>

      <View style={styles.textoLinha}>
        <Text style={styles.rotuloLinha}>{campo.rotulo}</Text>
        <Text style={styles.periodoLinha}>
          {invalido ? `de ${milhar(min)} a ${milhar(max)} ${campo.unidade}` : campo.periodo}
        </Text>
      </View>

      <View style={styles.blocoCampo}>
        <TextInput
          value={valor}
          onChangeText={onChange}
          /* decimal-pad e não number-pad por causa do sono: sete horas e meia é
             uma meta que existe, e number-pad não oferece o separador. */
          keyboardType="decimal-pad"
          placeholder={campo.exemplo}
          placeholderTextColor={inkFraco}
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

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  botaoVoltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  tituloTela: { flexShrink: 1, fontSize: 17, fontWeight: '800', color: cores.ink },

  conteudo: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, gap: 14 },
  chamada: { fontSize: 13, lineHeight: 19, color: inkSuave },

  blocoErro: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: cores.erroBorda,
    backgroundColor: cores.erroFundo,
  },
  tituloErro: { fontSize: 13.5, fontWeight: '700', color: cores.erroTexto },
  detalheErro: { marginTop: 5, fontSize: 12.5, lineHeight: 18, color: cores.erroTexto },

  secao: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: cores.cartao,
    borderWidth: 1,
    borderColor: cores.borda,
    gap: 10,
  },
  tituloSecao: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  textoTituloSecao: { fontSize: 15, fontWeight: '800', color: cores.ink },
  notaSecao: { fontSize: 11.5, lineHeight: 16, color: inkFraco },

  campoNome: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.branco,
    paddingHorizontal: 14,
    fontSize: 16,
    color: cores.ink,
  },

  linha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconeLinha: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: cores.verdeClaro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoLinha: { flex: 1 },
  rotuloLinha: { fontSize: 14, fontWeight: '700', color: cores.ink },
  /* O mesmo lugar diz o período e, quando o número não serve, o intervalo
     aceito: são a mesma informação — "o que cabe aqui" — e duas linhas de apoio
     por campo em onze campos viraria uma parede de texto miúdo. */
  periodoLinha: { marginTop: 1, fontSize: 11.5, color: inkSuave },

  blocoCampo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  campo: {
    width: 82,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.branco,
    paddingHorizontal: 10,
    /* 16 é o mínimo que o iOS aceita sem dar zoom automático no campo. */
    fontSize: 16,
    textAlign: 'right',
    color: cores.ink,
  },
  campoComErro: { borderColor: cores.erroBorda, backgroundColor: cores.erroFundo },
  unidadeLinha: { width: 38, fontSize: 11.5, fontWeight: '600', color: inkMedio },

  aviso: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    padding: 11,
    borderRadius: 14,
    backgroundColor: cores.verdeMenta,
  },
  textoAviso: { flex: 1, fontSize: 12.5, lineHeight: 17, color: cores.verdeEscuro },

  rodape: {
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
    backgroundColor: cores.fundo,
  },
  avisoRodape: { fontSize: 12, color: cores.erroTexto, textAlign: 'center' },
  botao: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: cores.verde,
  },
  botaoPressionado: { backgroundColor: cores.verdeEscuro },
  botaoDesligado: { backgroundColor: cores.trilho },
  textoBotao: { fontSize: 15.5, fontWeight: '700', color: cores.branco },
})
