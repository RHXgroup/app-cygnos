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
import { supabase } from '../lib/supabase'
import { falha } from '../lib/erros'
import {
  AJUSTE_MAX,
  AJUSTE_MIN,
  AJUSTE_SUGERIDO,
  ATIVIDADES,
  MACROS_SUGERIDOS,
  alvoDe,
  alvoFoiTravado,
  atividadePor,
  calcularTMB,
  formulaPara,
  idadeDe,
  macrosDe,
  ritmoSemanal,
  salvarAltura,
  salvarCalculo,
  type ChaveAtividade,
  type Sexo,
} from '../lib/energia'
import {
  METAS_VAZIAS,
  NOME_DO_OBJETIVO,
  carregarMetasAtivas,
  salvarMetas,
  type MetasSalvas,
  type ObjetivoPeso,
} from '../lib/metas'
import { carregarPeso } from '../lib/peso'
import { decimal, milhar } from '../lib/formatar'
import { estilosDe, paleta } from '../lib/tema'

/* Cálculo energético para quem não sabe o que é cálculo energético.
 *
 * A tela da nutricionista, no sistema web, tem dezessete fórmulas, fator de
 * lesão e MET adicional. Aqui nada disso aparece: o app escolhe a fórmula pela
 * idade, diz qual escolheu e por quê, e pergunta só o que a pessoa sabe sobre a
 * própria vida.
 *
 * Três etapas porque três perguntas grandes cabem numa tela cada, e um
 * formulário único de onze campos faria alguém desistir na metade sem entender o
 * que estava preenchendo. */
export function CalculoEnergeticoScreen({
  contaId,
  onFechar,
  onSalvo,
}: {
  contaId: string
  onFechar: () => void
  /* Salvar mexe no cálculo ativo e, se a pessoa quiser, nas metas. */
  onSalvo: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const [etapa, setEtapa] = useState(1)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  /* ── Etapa 1 ── */
  const [peso, setPeso] = useState('')
  const [altura, setAltura] = useState('')
  const [idade, setIdade] = useState<number | null>(null)
  const [sexo, setSexo] = useState<Sexo | null>(null)
  /* De onde veio o peso pré-preenchido, para a tela poder dizer. */
  const [pesoDe, setPesoDe] = useState<string | null>(null)

  /* ── Etapa 2 ── */
  const [atividade, setAtividade] = useState<ChaveAtividade | null>(null)

  /* ── Etapa 3 ── */
  /* O conjunto de metas ATIVO, para o botão "usar como minha meta" sobrescrever
     as calorias e os macros dele. null quando não há nenhum — aí o botão cria um
     conjunto novo em vez de editar. */
  const [metas, setMetas] = useState<MetasSalvas | null>(null)
  const [metasLidas, setMetasLidas] = useState(false)
  const [objetivo, setObjetivo] = useState<ObjetivoPeso>(null)
  const [ajuste, setAjuste] = useState(0)
  const [proteinaGkg, setProteinaGkg] = useState(1.6)
  const [carboPct, setCarboPct] = useState(50)
  const [macrosAbertos, setMacrosAbertos] = useState(false)
  const [nome, setNome] = useState('')
  const [usarComoMeta, setUsarComoMeta] = useState(true)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    let ativo = true

    Promise.all([
      supabase
        .from('app_contas')
        /* O foco do peso vem junto: mora na mesma linha desde 20260801000005. */
        .select('data_nascimento, genero, altura_cm, objetivo_peso')
        .eq('id', contaId)
        .maybeSingle(),
      carregarPeso(contaId),
      carregarMetasAtivas(contaId),
    ]).then(([conta, pesoR, metasR]) => {
      if (!ativo) return

      /* Frase nossa: o texto do Postgres não diz nada a quem está calculando as
         próprias calorias. O motivo cru vai para o console. */
      if (conta.error)
        setErro(falha('Não consegui carregar os seus dados agora. Verifique a conexão.', conta.error))

      const c = conta.data as
        | {
            data_nascimento: string
            genero: string
            altura_cm: number | null
            objetivo_peso: ObjetivoPeso
          }
        | null

      if (c) {
        setObjetivo(c.objetivo_peso ?? null)
        setIdade(idadeDe(c.data_nascimento))
        /* 'outro' não vira M nem F por conta do app: as equações só têm duas
           variantes, e escolher uma pela pessoa seria decidir por ela. A etapa 1
           pergunta. */
        if (c.genero === 'masculino') setSexo('M')
        else if (c.genero === 'feminino') setSexo('F')
        if (c.altura_cm) setAltura(String(c.altura_cm))
      }

      if (pesoR.tipo === 'ok' && pesoR.peso.registros.length > 0) {
        /* O mais recente: a lista vem ordenada por data desc. */
        const ultimo = pesoR.peso.registros[0]
        setPeso(decimal(ultimo.kg))
        setPesoDe(ultimo.data)
      }

      /* O ponto de partida do ajuste e dos macros sai do FOCO, que agora vem de
         app_contas — não do conjunto de metas. */
      const foco = c?.objetivo_peso ?? 'manter'
      setAjuste(AJUSTE_SUGERIDO[foco])
      setProteinaGkg(MACROS_SUGERIDOS[foco].proteinaGkg)
      setCarboPct(MACROS_SUGERIDOS[foco].carboPct)

      if (metasR.tipo === 'ok') {
        /* Pode ser null: conta sem conjunto nenhum. Não é impedimento — salvar
           com "usar como minha meta" cria o primeiro. */
        setMetas(metasR.metas)
        setMetasLidas(true)
      } else {
        /* A LEITURA falhou, que é diferente de não haver conjunto. Sem saber o
           que já está gravado, sobrescrever apagaria passos e sono de quem os
           tinha — então a caixa fica indisponível. */
        setUsarComoMeta(false)
      }

      setCarregando(false)
    })

    return () => {
      ativo = false
    }
  }, [contaId])

  const nPeso = Number(peso.replace(',', '.'))
  const nAltura = Number(altura.replace(',', '.'))
  const pesoOk = Number.isFinite(nPeso) && nPeso >= 20 && nPeso <= 400
  const alturaOk = Number.isFinite(nAltura) && nAltura >= 80 && nAltura <= 250
  const dadosOk = pesoOk && alturaOk && idade !== null && sexo !== null

  const sobreAFormula = idade !== null ? formulaPara(idade) : null

  const tmb =
    dadosOk && sobreAFormula ? calcularTMB(sobreAFormula.chave, nPeso, nAltura, idade!, sexo!) : null
  const fator = atividade ? atividadePor(atividade).fator : null
  const get = tmb !== null && fator !== null ? tmb * fator : null

  const alvo = get !== null && tmb !== null ? alvoDe(get, ajuste, tmb) : null
  const travou = get !== null && tmb !== null && alvoFoiTravado(get, ajuste, tmb)
  const macros = alvo !== null ? macrosDe(alvo, nPeso, proteinaGkg, carboPct) : null

  const foco = objetivo

  async function salvar() {
    if (!dadosOk || !atividade || tmb === null || get === null || alvo === null || !sobreAFormula) return

    setSalvando(true)
    setErro('')

    /* A altura vai para o cadastro antes: mesmo que a gravação do cálculo falhe,
       a pessoa não digita a altura de novo na próxima tentativa. */
    await salvarAltura(contaId, nAltura)

    const r = await salvarCalculo(contaId, {
      nome: nome.trim() || nomeAutomatico(),
      peso: nPeso,
      alturaCm: Math.round(nAltura),
      idade: idade!,
      sexo: sexo!,
      formula: sobreAFormula.chave,
      atividade,
      fatorAtividade: atividadePor(atividade).fator,
      tmb,
      get,
      ajustePct: ajuste,
      alvoKcal: alvo,
      proteinaGkg,
      carboPct,
    })

    if (r.tipo === 'erro') {
      setSalvando(false)
      setErro(r.mensagem)
      return
    }

    /* As metas são escritas DEPOIS e só se pedido. O cálculo já está salvo a
       esta altura: se esta segunda escrita falhar, o trabalho não se perde, e a
       pessoa pode digitar os números em Metas.
     *
     * `metas` precisa ter sido CARREGADO, e não só existir: salvarMetas grava a
     * linha inteira, então partir de um objeto vazio apagaria passos, sono e o
     * foco de peso de quem já os tinha. Por isso a caixa fica indisponível
     * quando a leitura falha, em vez de gravar por cima do escuro. */
    if (usarComoMeta && macros && metasLidas) {
      const r = await salvarMetas(contaId, {
        /* Sobrescreve o conjunto ATIVO quando existe; cria o primeiro quando
           não existe. Os demais campos do conjunto — água, passos, sono — vão
           intactos, porque o objeto de partida é o que foi lido. */
        id: metas?.id ?? null,
        nome: metas?.nome ?? 'Metas do cálculo energético',
        metas: {
          ...(metas ?? METAS_VAZIAS),
          calorias: Math.round(alvo),
          proteinas: Math.round(macros.proteinaG),
          carboidratos: Math.round(macros.carboG),
          gorduras: Math.round(macros.gorduraG),
        },
      })

      if (r.tipo === 'erro') {
        setSalvando(false)
        setErro(`O cálculo foi salvo, mas as metas não: ${r.mensagem}`)
        return
      }
    }

    setSalvando(false)
    onSalvo()
    onFechar()
  }

  const podeAvancar = etapa === 1 ? dadosOk : etapa === 2 ? atividade !== null : true

  return (
    <KeyboardAvoidingView
      style={[styles.tela, { paddingTop: top + 8 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.cabecalho}>
        <Pressable
          onPress={() => (etapa > 1 ? setEtapa(e => e - 1) : onFechar())}
          style={styles.botaoVoltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela}>Cálculo energético</Text>
        <View style={styles.botaoVoltar} />
      </View>

      {/* Três pontos, e não "Etapa 1 de 3": a barra diz onde se está e quanto
          falta sem ocupar uma linha de texto. */}
      <View style={styles.passos}>
        {[1, 2, 3].map(n => (
          <View key={n} style={[styles.passo, n <= etapa && styles.passoFeito]} />
        ))}
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
            {etapa === 1 && (
              <EtapaDados
                peso={peso}
                setPeso={setPeso}
                pesoOk={pesoOk}
                pesoDe={pesoDe}
                altura={altura}
                setAltura={setAltura}
                alturaOk={alturaOk}
                idade={idade}
                sexo={sexo}
                setSexo={setSexo}
              />
            )}

            {etapa === 2 && <EtapaAtividade escolhida={atividade} onEscolher={setAtividade} />}

            {etapa === 3 && tmb !== null && get !== null && alvo !== null && macros && sobreAFormula && (
              <EtapaResultado
                tmb={tmb}
                get={get}
                fator={fator!}
                atividade={atividade!}
                sobreAFormula={sobreAFormula}
                foco={foco}
                ajuste={ajuste}
                setAjuste={setAjuste}
                alvo={alvo}
                travou={travou}
                macros={macros}
                proteinaGkg={proteinaGkg}
                setProteinaGkg={setProteinaGkg}
                carboPct={carboPct}
                setCarboPct={setCarboPct}
                macrosAbertos={macrosAbertos}
                setMacrosAbertos={setMacrosAbertos}
                nome={nome}
                setNome={setNome}
                usarComoMeta={usarComoMeta}
                setUsarComoMeta={setUsarComoMeta}
                podeUsarComoMeta={metasLidas}
              />
            )}

            {!!erro && (
              <View style={styles.blocoErro}>
                <Text style={styles.tituloErro}>Não foi possível salvar</Text>
                {/* A mensagem crua junto: sem ela, "sem internet" e "migração
                    não aplicada" viram o mesmo aviso. */}
                <Text style={styles.detalheErro}>{erro}</Text>
              </View>
            )}
          </ScrollView>

          <View style={[styles.rodape, { paddingBottom: Math.max(bottom, 16) }]}>
            <Pressable
              onPress={() => (etapa < 3 ? setEtapa(e => e + 1) : salvar())}
              disabled={!podeAvancar || salvando}
              style={({ pressed }) => [
                styles.botao,
                (!podeAvancar || salvando) && styles.botaoDesligado,
                pressed && styles.botaoPressionado,
              ]}
              accessibilityRole="button"
            >
              {salvando ? (
                <ActivityIndicator color={paleta().cores.branco} />
              ) : (
                <Text style={styles.textoBotao}>
                  {etapa < 3 ? 'Continuar' : usarComoMeta ? 'Salvar e usar como meta' : 'Salvar cálculo'}
                </Text>
              )}
            </Pressable>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  )
}

const nomeAutomatico = () => {
  const d = new Date()
  return `Cálculo de ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

/* ── Etapa 1 ───────────────────────────────────────────────────────────────*/

function EtapaDados({
  peso,
  setPeso,
  pesoOk,
  pesoDe,
  altura,
  setAltura,
  alturaOk,
  idade,
  sexo,
  setSexo,
}: {
  peso: string
  setPeso: (t: string) => void
  pesoOk: boolean
  pesoDe: string | null
  altura: string
  setAltura: (t: string) => void
  alturaOk: boolean
  idade: number | null
  sexo: Sexo | null
  setSexo: (s: Sexo) => void
}) {
  const styles = estilos()
  /* Conta criada direto no painel do Supabase não tem linha em app_contas, então
     não tem data de nascimento — e sem idade nenhuma equação fecha. Dizer isso é
     melhor que deixar o "Continuar" apagado sem explicação, que é o que
     acontecia antes deste bloco. */
  if (idade === null) {
    return (
      <>
        <Text style={styles.tituloEtapa}>Seus dados</Text>
        <View style={styles.aviso}>
          <Ionicons name="alert-circle-outline" size={16} color={paleta().cores.erroTexto} />
          <Text style={styles.textoAvisoForte}>
            Esta conta não tem cadastro completo — ela foi criada fora do app, então não temos sua
            data de nascimento. Sem a idade não é possível calcular o gasto energético.
          </Text>
        </View>
      </>
    )
  }

  return (
    <>
      <Text style={styles.tituloEtapa}>Seus dados</Text>
      <Text style={styles.chamada}>
        O gasto de energia depende de quanto corpo existe para manter aquecido e funcionando. Por
        isso estes quatro números — e nada além deles.
      </Text>

      <View style={styles.bloco}>
        <CampoNumero
          rotulo="Peso"
          unidade="kg"
          valor={peso}
          onChange={setPeso}
          invalido={peso.trim() !== '' && !pesoOk}
          ajuda={
            peso.trim() !== '' && !pesoOk
              ? 'Entre 20 e 400 kg.'
              : pesoDe
                ? `Puxado do seu registro de ${pesoDe.split('-').reverse().join('/')}.`
                : 'Você ainda não registrou peso nenhum no app.'
          }
        />

        <View style={styles.divisor} />

        <CampoNumero
          rotulo="Altura"
          unidade="cm"
          valor={altura}
          onChange={setAltura}
          invalido={altura.trim() !== '' && !alturaOk}
          ajuda={
            altura.trim() !== '' && !alturaOk
              ? 'Entre 80 e 250 cm.'
              : 'Fica guardada no seu perfil — só perguntamos uma vez.'
          }
        />
      </View>

      <View style={styles.bloco}>
        <View style={styles.linhaLida}>
          <Text style={styles.rotuloLido}>Idade</Text>
          <Text style={styles.valorLido}>{idade === null ? '—' : `${idade} anos`}</Text>
        </View>
        <Text style={styles.ajudaBloco}>
          Calculada da data de nascimento do seu cadastro. O gasto cai com a idade, e a conta
          precisa saber disso.
        </Text>
      </View>

      {/* Só aparece para quem marcou 'outro' no cadastro — para os demais o
          cadastro já respondeu, e perguntar de novo seria burocracia. */}
      {sexo === null && (
        <View style={styles.bloco}>
          <Text style={styles.tituloBloco}>Qual equação usar</Text>
          <Text style={styles.ajudaBloco}>
            As equações de gasto energético foram desenvolvidas com dois grupos, e só existem nessas
            duas versões. Escolha qual delas usar como referência para o seu cálculo.
          </Text>

          <View style={styles.opcoesLado}>
            {(['F', 'M'] as const).map(s => (
              <Pressable
                key={s}
                onPress={() => setSexo(s)}
                style={({ pressed }) => [styles.opcaoLado, pressed && styles.opcaoLadoPressionada]}
                accessibilityRole="radio"
                accessibilityState={{ selected: false }}
              >
                <Text style={styles.textoOpcaoLado}>
                  {s === 'F' ? 'Feminina' : 'Masculina'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </>
  )
}

function CampoNumero({
  rotulo,
  unidade,
  valor,
  onChange,
  invalido,
  ajuda,
}: {
  rotulo: string
  unidade: string
  valor: string
  onChange: (t: string) => void
  invalido: boolean
  ajuda: string
}) {
  const styles = estilos()
  return (
    <View>
      <View style={styles.linhaCampo}>
        <Text style={styles.rotuloCampo}>{rotulo}</Text>
        <TextInput
          value={valor}
          /* Vírgula passa porque é o que o teclado brasileiro oferece; a
             conversão trata as duas. */
          onChangeText={t => onChange(t.replace(/[^0-9.,]/g, ''))}
          keyboardType="decimal-pad"
          maxLength={6}
          style={[styles.campo, invalido && styles.campoComErro]}
          accessibilityLabel={`${rotulo} em ${unidade}`}
        />
        <Text style={styles.unidadeCampo}>{unidade}</Text>
      </View>
      <Text style={[styles.ajudaCampo, invalido && styles.ajudaComErro]}>{ajuda}</Text>
    </View>
  )
}

/* ── Etapa 2 ───────────────────────────────────────────────────────────────*/

function EtapaAtividade({
  escolhida,
  onEscolher,
}: {
  escolhida: ChaveAtividade | null
  onEscolher: (c: ChaveAtividade) => void
}) {
  const styles = estilos()
  return (
    <>
      <Text style={styles.tituloEtapa}>Seu nível de atividade</Text>
      <Text style={styles.chamada}>
        Esta é a resposta que mais mexe no resultado — e a que mais se erra, quase sempre para cima.
        Na dúvida entre dois níveis, escolha o de baixo: é mais fácil ajustar depois do que descobrir
        em três meses que a conta partiu inflada.
      </Text>

      <View style={styles.bloco}>
        {ATIVIDADES.map((a, i) => (
          <Pressable
            key={a.chave}
            onPress={() => onEscolher(a.chave)}
            style={({ pressed }) => [
              styles.opcaoAtividade,
              i > 0 && styles.opcaoComDivisor,
              pressed && styles.opcaoPressionada,
            ]}
            accessibilityRole="radio"
            accessibilityState={{ selected: escolhida === a.chave }}
            accessibilityLabel={`${a.rotulo}. ${a.descricao}`}
          >
            <View style={[styles.marca, escolhida === a.chave && styles.marcaAtiva]}>
              {escolhida === a.chave && <Ionicons name="checkmark" size={14} color={paleta().cores.branco} />}
            </View>

            <View style={styles.textoAtividade}>
              <Text style={styles.rotuloAtividade}>{a.rotulo}</Text>
              <Text style={styles.descricaoAtividade}>{a.descricao}</Text>
            </View>

            {/* O fator à mostra, discreto: quem não liga ignora, e quem quiser
                conferir a conta com a nutricionista tem o número. */}
            <Text style={styles.fatorAtividade}>×{decimal(a.fator, a.fator === 1.2 || a.fator === 1.9 ? 1 : 3)}</Text>
          </Pressable>
        ))}
      </View>
    </>
  )
}

/* ── Etapa 3 ───────────────────────────────────────────────────────────────*/

function EtapaResultado({
  tmb,
  get,
  fator,
  atividade,
  sobreAFormula,
  foco,
  ajuste,
  setAjuste,
  alvo,
  travou,
  macros,
  proteinaGkg,
  setProteinaGkg,
  carboPct,
  setCarboPct,
  macrosAbertos,
  setMacrosAbertos,
  nome,
  setNome,
  usarComoMeta,
  setUsarComoMeta,
  podeUsarComoMeta,
}: {
  tmb: number
  get: number
  fator: number
  atividade: ChaveAtividade
  sobreAFormula: ReturnType<typeof formulaPara>
  foco: 'perda' | 'manter' | 'ganho' | null
  ajuste: number
  setAjuste: (n: number) => void
  alvo: number
  travou: boolean
  macros: ReturnType<typeof macrosDe>
  proteinaGkg: number
  setProteinaGkg: (n: number) => void
  carboPct: number
  setCarboPct: (n: number) => void
  macrosAbertos: boolean
  setMacrosAbertos: (b: boolean) => void
  nome: string
  setNome: (t: string) => void
  usarComoMeta: boolean
  setUsarComoMeta: (b: boolean) => void
  podeUsarComoMeta: boolean
}) {
  const styles = estilos()
  const ritmo = ritmoSemanal(get, alvo)
  const sugerido = AJUSTE_SUGERIDO[foco ?? 'manter']

  return (
    <>
      <Text style={styles.tituloEtapa}>Seu resultado</Text>

      {/* Os dois números, um explicando o outro. Sem a frase do meio, "TMB" e
          "GET" são duas siglas que ninguém pediu para aprender. */}
      <View style={styles.cartaoResultado}>
        <Text style={styles.rotuloResultado}>Seu corpo gasta, parado</Text>
        <View style={styles.linhaValorResultado}>
          <Text style={styles.valorResultadoMenor}>{milhar(tmb)}</Text>
          <Text style={styles.unidadeResultado}>kcal por dia</Text>
        </View>
        <Text style={styles.explicaResultado}>
          É o que você gasta só para existir — respirar, bombear sangue, manter a temperatura. Mesmo
          dormindo o dia inteiro.
        </Text>

        <View style={styles.divisorClaro} />

        <Text style={styles.rotuloResultado}>Com o seu dia a dia</Text>
        <View style={styles.linhaValorResultado}>
          <Text style={styles.valorResultado}>{milhar(get)}</Text>
          <Text style={styles.unidadeResultado}>kcal por dia</Text>
        </View>
        <Text style={styles.explicaResultado}>
          {milhar(tmb)} × {decimal(fator, 3)}, o fator de {atividadePor(atividade).rotulo.toLowerCase()}.
          É quanto você gasta num dia comum. Comer isso mantém seu peso.
        </Text>
      </View>

      <Text style={styles.notaFormula}>
        Conta feita pela equação de {sobreAFormula.nome}. {sobreAFormula.porque}
      </Text>

      {!!sobreAFormula.ressalva && (
        <View style={styles.aviso}>
          <Ionicons name="warning-outline" size={16} color={paleta().cores.erroTexto} />
          <Text style={styles.textoAvisoForte}>{sobreAFormula.ressalva}</Text>
        </View>
      )}

      {/* ── Alvo ── */}
      <View style={styles.bloco}>
        <Text style={styles.tituloBloco}>Sua meta de calorias</Text>
        <Text style={styles.ajudaBloco}>
          {foco
            ? `Seu foco no perfil é ${NOME_DO_OBJETIVO[foco].toLowerCase()}, então partimos de ${sugerido > 0 ? '+' : ''}${sugerido}% sobre o gasto.`
            : 'Você não definiu foco de peso no perfil, então partimos da manutenção. Dá para ajustar aqui.'}
        </Text>

        <View style={styles.controleAjuste}>
          <Passo
            icone="remove"
            onPress={() => setAjuste(Math.max(ajuste - 1, AJUSTE_MIN))}
            desligado={ajuste <= AJUSTE_MIN}
            rotulo="Diminuir um por cento"
          />

          <View style={styles.centroAjuste}>
            <Text style={styles.valorAjuste}>
              {ajuste > 0 ? '+' : ''}
              {ajuste}%
            </Text>
            <Text style={styles.rotuloAjuste}>
              {ajuste === 0 ? 'manutenção' : ajuste > 0 ? 'superávit' : 'déficit'}
            </Text>
          </View>

          <Passo
            icone="add"
            onPress={() => setAjuste(Math.min(ajuste + 1, AJUSTE_MAX))}
            desligado={ajuste >= AJUSTE_MAX}
            rotulo="Aumentar um por cento"
          />
        </View>

        {ajuste !== sugerido && (
          <Pressable onPress={() => setAjuste(sugerido)} accessibilityRole="button">
            <Text style={styles.voltarSugerido}>Voltar ao sugerido ({sugerido > 0 ? '+' : ''}{sugerido}%)</Text>
          </Pressable>
        )}

        <View style={styles.cartaoAlvo}>
          <Text style={styles.rotuloAlvo}>Comer por dia</Text>
          <View style={styles.linhaValorResultado}>
            <Text style={styles.valorAlvo}>{milhar(alvo)}</Text>
            <Text style={styles.unidadeAlvo}>kcal</Text>
          </View>
          <Text style={styles.ritmoAlvo}>
            {ajuste === 0
              ? 'Mantendo o peso onde está.'
              : `Cerca de ${decimal(ritmo)} kg por semana — é uma estimativa grosseira, o corpo se adapta com o tempo.`}
          </Text>
        </View>

        {/* A trava. Não é um limite de dieta: é a linha abaixo da qual o número
            deixa de ser o que a conta produziu, e a pessoa precisa saber que o
            app parou de obedecer ao percentual dela. */}
        {travou && (
          <View style={styles.aviso}>
            <Ionicons name="lock-closed-outline" size={16} color={paleta().cores.erroTexto} />
            <Text style={styles.textoAvisoForte}>
              Esse déficit levaria você abaixo das {milhar(tmb)} kcal que seu corpo gasta parado.
              O alvo travou aí. Descer disso é assunto para uma nutricionista, não para um campo de
              aplicativo.
            </Text>
          </View>
        )}
      </View>

      {/* ── Macros ── */}
      <View style={styles.bloco}>
        <Pressable
          onPress={() => setMacrosAbertos(!macrosAbertos)}
          style={styles.linhaTituloBloco}
          accessibilityRole="button"
          accessibilityLabel="Ajustar os macronutrientes"
        >
          <Text style={styles.tituloBloco}>Macronutrientes</Text>
          <Ionicons name={macrosAbertos ? 'chevron-up' : 'chevron-down'} size={18} color={paleta().inkFraco} />
        </Pressable>

        <View style={styles.linhaMacros}>
          <Macro rotulo="Proteínas" gramas={macros.proteinaG} />
          <Macro rotulo="Carboidratos" gramas={macros.carboG} />
          <Macro rotulo="Gorduras" gramas={macros.gorduraG} />
        </View>

        {!macros.possivel && (
          <View style={styles.aviso}>
            <Ionicons name="warning-outline" size={16} color={paleta().cores.erroTexto} />
            <Text style={styles.textoAvisoForte}>
              Com essa proteína e esse carboidrato sobra pouca gordura ({Math.round(macros.gorduraPct)}%
              da energia). Abaixo de 15% a absorção de vitaminas e a produção de hormônios começam a
              sofrer — baixe um dos dois.
            </Text>
          </View>
        )}

        {macrosAbertos ? (
          <>
            <LinhaPasso
              rotulo="Proteína"
              valor={`${decimal(proteinaGkg, 1)} g por kg`}
              onMenos={() => setProteinaGkg(Math.max(Math.round((proteinaGkg - 0.1) * 10) / 10, 0.5))}
              onMais={() => setProteinaGkg(Math.min(Math.round((proteinaGkg + 0.1) * 10) / 10, 4))}
            />
            <LinhaPasso
              rotulo="Carboidrato"
              valor={`${carboPct}% da energia`}
              onMenos={() => setCarboPct(Math.max(carboPct - 5, 5))}
              onMais={() => setCarboPct(Math.min(carboPct + 5, 75))}
            />
            <Text style={styles.ajudaBloco}>
              A gordura não tem controle porque ela é o que sobra: mexer nos três deixaria a soma
              passar ou faltar dos 100%.
            </Text>
          </>
        ) : (
          <Text style={styles.ajudaBloco}>
            Calculados a partir de {decimal(proteinaGkg, 1)} g de proteína por quilo e {carboPct}% de
            carboidrato. Toque para ajustar.
          </Text>
        )}
      </View>

      {/* ── Salvar ── */}
      <View style={styles.bloco}>
        <Text style={styles.tituloBloco}>Nome deste cálculo</Text>
        <TextInput
          value={nome}
          onChangeText={setNome}
          placeholder={nomeAutomatico()}
          placeholderTextColor={paleta().inkFraco}
          keyboardAppearance="dark"
          maxLength={80}
          style={styles.campoNome}
          accessibilityLabel="Nome do cálculo"
        />
        <Text style={styles.ajudaBloco}>
          Você pode ter vários cálculos guardados e alternar entre eles. Este passa a ser o que vale.
        </Text>

        {podeUsarComoMeta ? (
          <Pressable
            onPress={() => setUsarComoMeta(!usarComoMeta)}
            style={styles.linhaCheck}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: usarComoMeta }}
          >
            <View style={[styles.check, usarComoMeta && styles.checkAtivo]}>
              {usarComoMeta && <Ionicons name="checkmark" size={14} color={paleta().cores.branco} />}
            </View>
            <View style={styles.textoCheck}>
              <Text style={styles.rotuloCheck}>Usar como minhas metas</Text>
              <Text style={styles.ajudaCheck}>
                Grava estas calorias e estes macros em Metas, substituindo o que estiver lá. É o que
                faz a tela inicial comparar seu plano com este número.
              </Text>
            </View>
          </Pressable>
        ) : (
          <Text style={styles.ajudaBloco}>
            Não conseguimos ler suas metas agora, então o cálculo será só salvo. Depois você pode
            copiar estes números na tela de Metas.
          </Text>
        )}
      </View>
    </>
  )
}

function Macro({ rotulo, gramas }: { rotulo: string; gramas: number }) {
  const styles = estilos()
  return (
    <View style={styles.macro}>
      <Text style={styles.rotuloMacro}>{rotulo}</Text>
      <Text style={styles.valorMacro}>{Math.round(gramas)} g</Text>
    </View>
  )
}

function Passo({
  icone,
  onPress,
  desligado,
  rotulo,
}: {
  icone: keyof typeof Ionicons.glyphMap
  onPress: () => void
  desligado?: boolean
  rotulo: string
}) {
  const styles = estilos()
  return (
    <Pressable
      onPress={onPress}
      disabled={desligado}
      style={({ pressed }) => [
        styles.passoBotao,
        desligado && styles.passoDesligado,
        pressed && styles.passoPressionado,
      ]}
      accessibilityRole="button"
      accessibilityLabel={rotulo}
    >
      <Ionicons name={icone} size={20} color={desligado ? paleta().inkFraco : paleta().cores.verde} />
    </Pressable>
  )
}

function LinhaPasso({
  rotulo,
  valor,
  onMenos,
  onMais,
}: {
  rotulo: string
  valor: string
  onMenos: () => void
  onMais: () => void
}) {
  const styles = estilos()
  return (
    <View style={styles.linhaPasso}>
      <View style={styles.textoLinhaPasso}>
        <Text style={styles.rotuloLinhaPasso}>{rotulo}</Text>
        <Text style={styles.valorLinhaPasso}>{valor}</Text>
      </View>
      <Passo icone="remove" onPress={onMenos} rotulo={`Diminuir ${rotulo}`} />
      <Passo icone="add" onPress={onMais} rotulo={`Aumentar ${rotulo}`} />
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

  passos: { flexDirection: 'row', gap: 6, paddingHorizontal: 20, paddingBottom: 14 },
  passo: { flex: 1, height: 4, borderRadius: 2, backgroundColor: t.cores.trilho },
  passoFeito: { backgroundColor: t.cores.verde },

  conteudo: { paddingHorizontal: 20, paddingBottom: 24, gap: 14 },
  tituloEtapa: { fontSize: 22, fontWeight: '800', color: t.cores.ink, letterSpacing: -0.5 },
  chamada: { marginTop: -6, fontSize: 13, lineHeight: 19, color: t.inkSuave },

  bloco: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: t.cores.cartao,
    borderWidth: 1,
    borderColor: t.cores.borda,
    gap: 10,
  },
  linhaTituloBloco: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tituloBloco: { flex: 1, fontSize: 15, fontWeight: '800', color: t.cores.ink },
  ajudaBloco: { fontSize: 11.5, lineHeight: 16, color: t.inkFraco },
  divisor: { height: 1, backgroundColor: t.cores.borda },

  linhaCampo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rotuloCampo: { flex: 1, fontSize: 15, fontWeight: '700', color: t.cores.ink },
  campo: {
    width: 96,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.cores.borda,
    backgroundColor: t.cores.superficie,
    paddingHorizontal: 12,
    /* 16 é o mínimo que o iOS aceita sem dar zoom automático no campo. */
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'right',
    color: t.cores.ink,
  },
  campoComErro: { borderColor: t.cores.erroBorda, backgroundColor: t.cores.erroFundo },
  unidadeCampo: { width: 26, fontSize: 12.5, fontWeight: '700', color: t.inkMedio },
  ajudaCampo: { marginTop: 5, fontSize: 11.5, lineHeight: 16, color: t.inkFraco },
  ajudaComErro: { color: t.cores.erroTexto },

  linhaLida: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rotuloLido: { fontSize: 15, fontWeight: '700', color: t.cores.ink },
  valorLido: { fontSize: 15, fontWeight: '800', color: t.cores.verde },

  opcoesLado: { flexDirection: 'row', gap: 10 },
  opcaoLado: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: t.cores.superficie,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  opcaoLadoPressionada: { backgroundColor: t.cores.verdeClaro, borderColor: t.cores.verdeClaro },
  textoOpcaoLado: { fontSize: 14, fontWeight: '700', color: t.cores.ink },

  opcaoAtividade: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  opcaoComDivisor: { borderTopWidth: 1, borderTopColor: t.cores.borda },
  opcaoPressionada: { backgroundColor: t.cores.verdeMenta },
  marca: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: t.cores.trilho,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marcaAtiva: { backgroundColor: t.cores.verde, borderColor: t.cores.verde },
  textoAtividade: { flex: 1 },
  rotuloAtividade: { fontSize: 14.5, fontWeight: '700', color: t.cores.ink },
  descricaoAtividade: { marginTop: 2, fontSize: 12, color: t.inkSuave },
  fatorAtividade: { fontSize: 12, fontWeight: '700', color: t.inkFraco },

  cartaoResultado: { borderRadius: 20, backgroundColor: t.cores.verde, padding: 18 },
  rotuloResultado: { fontSize: 12.5, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  linhaValorResultado: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 },
  valorResultado: { fontSize: 38, fontWeight: '800', color: t.cores.branco, letterSpacing: -1.2 },
  valorResultadoMenor: { fontSize: 28, fontWeight: '800', color: t.cores.branco, letterSpacing: -0.8 },
  unidadeResultado: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  explicaResultado: { marginTop: 6, fontSize: 12.5, lineHeight: 18, color: 'rgba(255,255,255,0.9)' },
  divisorClaro: { height: 1, backgroundColor: 'rgba(255,255,255,0.28)', marginVertical: 14 },

  notaFormula: { marginTop: -4, fontSize: 11.5, lineHeight: 16, color: t.inkFraco },

  aviso: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.erroBorda,
    backgroundColor: t.cores.erroFundo,
  },
  textoAvisoForte: { flex: 1, fontSize: 12, lineHeight: 17, color: t.cores.erroTexto },

  controleAjuste: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  centroAjuste: { flex: 1, alignItems: 'center' },
  valorAjuste: { fontSize: 26, fontWeight: '800', color: t.cores.ink, letterSpacing: -0.6 },
  rotuloAjuste: { fontSize: 11.5, color: t.inkSuave },
  passoBotao: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.cores.verdeMenta,
    borderWidth: 1,
    borderColor: t.cores.verdeClaro,
  },
  passoPressionado: { backgroundColor: t.cores.verdeClaro },
  passoDesligado: { backgroundColor: t.cores.cartao, borderColor: t.cores.borda },
  voltarSugerido: { fontSize: 12, fontWeight: '700', color: t.cores.verde, textAlign: 'center' },

  cartaoAlvo: { padding: 14, borderRadius: 16, backgroundColor: t.cores.verdeMenta },
  rotuloAlvo: { fontSize: 12.5, fontWeight: '700', color: t.cores.verdeEscuro },
  valorAlvo: { fontSize: 32, fontWeight: '800', color: t.cores.verdeEscuro, letterSpacing: -1 },
  unidadeAlvo: { fontSize: 13, fontWeight: '700', color: t.cores.verdeEscuro },
  ritmoAlvo: { marginTop: 4, fontSize: 12, lineHeight: 17, color: t.cores.verdeEscuro },

  linhaMacros: { flexDirection: 'row', gap: 8 },
  macro: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: t.cores.superficie,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  rotuloMacro: { fontSize: 11.5, color: t.inkSuave },
  valorMacro: { marginTop: 3, fontSize: 16, fontWeight: '800', color: t.cores.ink },

  linhaPasso: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  textoLinhaPasso: { flex: 1 },
  rotuloLinhaPasso: { fontSize: 14, fontWeight: '700', color: t.cores.ink },
  valorLinhaPasso: { marginTop: 1, fontSize: 12.5, color: t.inkSuave },

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

  linhaCheck: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 4 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: t.cores.trilho,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkAtivo: { backgroundColor: t.cores.verde, borderColor: t.cores.verde },
  textoCheck: { flex: 1 },
  rotuloCheck: { fontSize: 14, fontWeight: '700', color: t.cores.ink },
  ajudaCheck: { marginTop: 2, fontSize: 11.5, lineHeight: 16, color: t.inkFraco },

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
