import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AvatarNutri } from '../components/AvatarNutri'
import {
  carregarCatalogo,
  linkDoWhatsapp,
  telefoneFormatado,
  type Catalogo,
  type Nutricionista,
} from '../lib/nutricionista'
import {
  carregarConteudo,
  descricaoDeContagem,
  descricaoDoEnergetico,
  descricaoDoPlano,
  type ConteudoNutri,
} from '../lib/conteudoNutri'
import {
  carregarMinhasConsultas,
  consultaEmDestaque,
  consultaLegivel,
  estadoDaConsulta,
  type MinhaConsulta,
} from '../lib/agenda'
import { ConteudoNutriScreen, type ChaveConteudo } from './ConteudoNutriScreen'
import { AgendarConsultaScreen } from './AgendarConsultaScreen'
import { cores, inkFraco, inkMedio, inkSuave } from '../theme'

/* O catálogo de nutricionistas Cygnos, em tela cheia.
 *
 * Duas telas no mesmo arquivo porque são o mesmo assunto em dois estados, e o
 * que muda entre elas é pequeno: sem vínculo, a lista de todas; com vínculo, a
 * ficha de uma só. Quem decide qual dos dois é o banco — ver lib/nutricionista.ts.
 *
 * Mesma escolha das outras telas do menu: View sobreposta no App, não Modal. */
export function NutricionistasScreen({ onFechar }: { onFechar: () => void }) {
  const { top } = useSafeAreaInsets()
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null)
  const [conteudo, setConteudo] = useState<ConteudoNutri | null>(null)
  const [erroConteudo, setErroConteudo] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  /* Separado de `carregando`: a primeira carga troca a tela por um indicador, e
     a atualização mantém a ficha na tela enquanto relê. */
  const [atualizando, setAtualizando] = useState(false)
  /* Qual conteúdo está aberto. Estado DAQUI e não do App: o conteúdo só existe
     dentro desta tela, e o App não tem por que saber que ele existe. Mesma
     escolha do RegistrarScreen. */
  const [aberto, setAberto] = useState<ChaveConteudo | null>(null)
  const [agendando, setAgendando] = useState(false)
  const [consultas, setConsultas] = useState<MinhaConsulta[]>([])

  /* Recarrega ao voltar da tela de agendamento: quem acabou de pedir horário
     precisa ver o pedido aparecer aqui, e não uma ficha igual à de antes. */
  const [versao, setVersao] = useState(0)

  /* O voltar do Android, descascando uma camada por vez.
   *
   * Esta tela abre outras duas POR CIMA de si — o conteúdo do acompanhamento e o
   * agendamento —, e nenhuma das duas existia para o App: lá em cima só há
   * `nutricionistasAbertas`. Sem isto, quem estivesse escolhendo horário e
   * apertasse voltar era jogado direto em "Mais", com as três telas fechadas de
   * uma vez.
   *
   * Registrado aqui, e não no App, porque o React Native chama os tratadores na
   * ordem inversa do registro: o mais interno decide primeiro, e é isso que faz
   * o voltar descascar em vez de fechar tudo. E `false` no fim devolve o evento
   * para o App, que sabe fechar esta tela. Ver a armadilha 1 do AGENTS.md. */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (aberto) {
        setAberto(null)
        return true
      }
      if (agendando) {
        /* Mesmo caminho do botão de voltar da tela de agendamento, versão por
           versão: quem pediu horário e saiu pelo botão do aparelho precisa ver o
           pedido na ficha igual a quem saiu pela seta. */
        setAgendando(false)
        setVersao(v => v + 1)
        return true
      }
      return false
    })

    return () => sub.remove()
  }, [aberto, agendando])

  /* E recarrega também ao voltar do segundo plano.
   *
   * Quem vincula é a nutricionista, do lado dela, e nada avisa o aparelho. O
   * caso comum é o paciente ditar o código com o app aberto na mão, ela vincular
   * ali na frente dele, e ele voltar para cá — que é exatamente o instante em
   * que esta tela ainda diz que ele não tem nutricionista. Sem isto, a resposta
   * certa só chega depois de fechar e abrir o app, e ninguém fecha app.
   *
   * Vale para a consulta pelo mesmo motivo: aceitar o pedido também é ação dela,
   * e o app só descobre relendo. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', estado => {
      if (estado === 'active') setVersao(v => v + 1)
    })
    return () => sub.remove()
  }, [])

  useEffect(() => {
    let vivo = true

    /* As três juntas: a ficha, o que a nutricionista tem para a pessoa e a
       próxima consulta apareceriam em momentos diferentes se fossem em
       sequência, e a tela piscaria conteúdo novo depois de já parecer pronta. */
    Promise.all([
      carregarCatalogo(),
      carregarConteudo(),
      /* Falha aqui é silenciosa e vira "não há consulta": o cartão é um extra
         desta tela, e derrubar a ficha inteira por causa dele seria trocar o
         telefone de quem acompanha a pessoa por uma mensagem de erro. */
      carregarMinhasConsultas().catch(() => []),
    ]).then(([cat, cont, minhas]) => {
      if (!vivo) return

      /* O erro é limpo no sucesso, e não só escrito na falha: agora que a tela
         relê sozinha, um erro que não sai da tela quando a próxima leitura dá
         certo faria a ficha ficar escondida atrás de uma mensagem vencida. */
      if (cat.tipo === 'erro') {
        /* Frase nossa. O que vinha do banco era "Network request failed" ou
           coisa parecida: texto de programador, em inglês, ocupando a tela
           inteira no lugar da ficha de quem acompanha a pessoa. O motivo cru
           fica no console, para quem for depurar. */
        console.warn('[nutricionistas] falha ao carregar o catálogo:', cat.mensagem)
        setErro('Não consegui carregar agora. Puxe para baixo para tentar de novo.')
      } else {
        setErro(null)
        setCatalogo(cat.catalogo)
      }

      setConsultas(minhas)

      /* Falha aqui NÃO derruba a tela: sem o resumo, a ficha da nutricionista
         continua inteira e útil, e trocá-la por uma mensagem de erro tiraria da
         pessoa o telefone de quem a acompanha.
         Mas também não some calada. A primeira versão engolia o erro, e quando a
         RPC quebrou de fato — cast de data inválido — a lista simplesmente não
         apareceu, sem nada na tela dizendo por quê. Falha que não se anuncia
         custa uma sessão de depuração para ser encontrada. */
      if (cont.tipo === 'ok') {
        setErroConteudo(null)
        setConteudo(cont.conteudo)
      } else setErroConteudo(cont.mensagem)

      setCarregando(false)
      setAtualizando(false)
    })

    return () => {
      vivo = false
    }
  }, [versao])

  const vinculada = catalogo?.vinculada ?? null

  /* O mesmo controle nas duas ramificações da tela — a da ficha e a do erro.
     Puxar sobe a versão, e é o efeito de cima que relê: um caminho só para
     recarregar, seja quem for que pediu. */
  const puxarParaAtualizar = (
    <RefreshControl
      refreshing={atualizando}
      onRefresh={() => {
        setAtualizando(true)
        setVersao(v => v + 1)
      }}
      tintColor={cores.limao}
    />
  )

  /* Substitui a tela em vez de sobrepor: o "voltar" do conteúdo devolve à ficha,
     e não fecha as duas de uma vez. */
  if (aberto) return <ConteudoNutriScreen chave={aberto} onFechar={() => setAberto(null)} />
  if (agendando) {
    return (
      <AgendarConsultaScreen
        onFechar={() => {
          setAgendando(false)
          setVersao(v => v + 1)
        }}
      />
    )
  }

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
          <Ionicons name="chevron-back" size={22} color={cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela}>
          {vinculada ? 'Meu nutricionista' : 'Nutricionistas Cygnos'}
        </Text>
        <View style={styles.botaoVoltar} />
      </View>

      {carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator color={cores.verde} />
        </View>
      ) : erro ? (
        /* Rola, e não é uma View parada: é aqui que puxar para tentar de novo é
           o gesto óbvio, e a tela vinha prometendo isso por escrito sem ter o
           controle que atende ao gesto. */
        <ScrollView
          contentContainerStyle={styles.conteudo}
          showsVerticalScrollIndicator={false}
          refreshControl={puxarParaAtualizar}
        >
          <View style={styles.erro}>
            <Text style={styles.textoErro}>{erro}</Text>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.conteudo}
          showsVerticalScrollIndicator={false}
          refreshControl={puxarParaAtualizar}
        >
          {vinculada ? (
            <Ficha
              nutri={vinculada}
              conteudo={conteudo}
              erroConteudo={erroConteudo}
              consultas={consultas}
              onAbrir={setAberto}
              onAgendar={() => setAgendando(true)}
            />
          ) : (
            <Lista nutris={catalogo?.lista ?? []} />
          )}
        </ScrollView>
      )}
    </View>
  )
}

/* ── Com vínculo ───────────────────────────────────────────────────────────*/

function Ficha({
  nutri,
  conteudo,
  erroConteudo,
  consultas,
  onAbrir,
  onAgendar,
}: {
  nutri: Nutricionista
  conteudo: ConteudoNutri | null
  erroConteudo: string | null
  consultas: MinhaConsulta[]
  onAbrir: (chave: ChaveConteudo) => void
  onAgendar: () => void
}) {
  /* Uma consulta em destaque e a contagem do resto. A ficha não é a agenda: ela
     responde "e agora?" numa linha, e quem quiser a lista inteira toca e abre a
     tela de agendamento — onde todas aparecem. */
  const destaque = consultaEmDestaque(consultas)
  const outras = consultas.length - (destaque ? 1 : 0)
  return (
    <>
      <View style={styles.blocoFicha}>
        <AvatarNutri nutri={nutri} tamanho={92} />
        <Text style={styles.nomeFicha}>{nutri.nome}</Text>
        {!!nutri.crn && <Text style={styles.crnFicha}>CRN {nutri.crn}</Text>}
        {!!lugarDe(nutri) && <Text style={styles.lugarFicha}>{lugarDe(nutri)}</Text>}

        <View style={styles.selo}>
          <Ionicons name="checkmark-circle" size={14} color={cores.verde} />
          <Text style={styles.textoSelo}>Acompanha você</Text>
        </View>
      </View>

      {/* A consulta que já existe vem antes do botão. Esta é a tela em que a
          pessoa entra para saber da nutricionista dela, e "quando eu vejo você
          de novo" é a primeira pergunta — antes de qualquer coisa que ela possa
          querer marcar. Toca e abre a tela de agendamento, onde o estado
          aparece por extenso. */}
      {!!destaque && (
        <Pressable
          onPress={onAgendar}
          style={({ pressed }) => [styles.cartaoProxima, pressed && styles.cartaoProximaPressionado]}
          accessibilityRole="button"
          accessibilityLabel={`${estadoDaConsulta(destaque.status).titulo}: ${consultaLegivel(destaque.dataHora)}${
            outras > 0 ? `. Mais ${outras} marcada${outras > 1 ? 's' : ''}.` : ''
          }`}
        >
          <View style={styles.iconeProxima}>
            <Ionicons name={estadoDaConsulta(destaque.status).icone} size={17} color={cores.verde} />
          </View>
          <View style={styles.textoProxima}>
            <Text style={styles.rotuloProxima}>{estadoDaConsulta(destaque.status).titulo}</Text>
            <Text style={styles.dataProxima}>{consultaLegivel(destaque.dataHora)}</Text>
            {/* A contagem do resto, para a ficha não dar a entender que esta é a
                única. Quem tem duas no mesmo dia precisa saber disso aqui, não
                só depois de abrir outra tela. */}
            {outras > 0 && (
              <Text style={styles.outrasProxima}>
                + {outras} outra{outras > 1 ? 's' : ''} marcada{outras > 1 ? 's' : ''}
              </Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={16} color={inkFraco} />
        </Pressable>
      )}

      {/* Antes do acompanhamento, e como botão cheio: marcar a próxima consulta
          é a coisa mais frequente que alguém quer fazer nesta tela, e ela não
          pode disputar atenção com uma lista de cinco linhas. */}
      <Pressable
        onPress={onAgendar}
        style={({ pressed }) => [styles.botaoAgendar, pressed && styles.botaoAgendarPressionado]}
        accessibilityRole="button"
        accessibilityLabel={destaque ? 'Marcar outro horário' : 'Agendar consulta'}
      >
        <Ionicons name="calendar-outline" size={17} color={cores.branco} />
        <Text style={styles.textoAgendar}>
          {destaque ? 'Marcar outro horário' : 'Agendar consulta'}
        </Text>
      </Pressable>

      <Acompanhamento conteudo={conteudo} erro={erroConteudo} onAbrir={onAbrir} />

      {nutri.especialidades.length > 0 && (
        <View style={styles.cartao}>
          <Text style={styles.tituloCartao}>Especialidades</Text>
          <Chips itens={nutri.especialidades} />
        </View>
      )}

      {!!nutri.telefone && <Contato telefone={nutri.telefone} />}
    </>
  )
}

/* O que a nutricionista tem para esta pessoa.
 *
 * A ordem é a do atendimento, não a alfabética: anamnese primeiro (é o começo
 * de tudo), medidas depois, e o que sai delas — plano e calorias — no fim.
 *
 * Item vazio NÃO some da lista. Uma lista que encolhe conforme o que existe
 * esconde da pessoa que aquilo existe como possibilidade: quem nunca teve
 * antropometria não descobriria que antropometria é algo que a nutricionista
 * faz. "Nenhuma avaliação ainda" é informação; a ausência da linha não é.
 *
 * `chave` continua opcional de propósito: é o que permite um item existir na
 * lista antes de a tela de dentro dele existir — sem seta, sem toque, sem
 * afundar ao pressionar. Nenhum item está nesse estado hoje. */
function Acompanhamento({
  conteudo,
  erro,
  onAbrir,
}: {
  conteudo: ConteudoNutri | null
  erro: string | null
  onAbrir: (chave: ChaveConteudo) => void
}) {
  /* Três estados, e nenhum deles é a lista sumir sem explicação:
     - deu erro ao buscar;
     - o vínculo existe mas ainda não aponta para uma ficha (é possível: o selo
       "Acompanha você" só exige linha em app_vinculos, enquanto a lista precisa
       do paciente_id preenchido);
     - tudo certo, e aí a lista. */
  if (!conteudo) {
    return (
      <View style={styles.cartao}>
        <Text style={styles.tituloCartao}>Meu acompanhamento</Text>
        <Text style={styles.apoioItem}>
          {erro
            ? 'Não foi possível carregar agora. Puxe para atualizar mais tarde.'
            : 'Assim que a sua nutricionista abrir a sua ficha, o que ela registrar aparece aqui.'}
        </Text>
      </View>
    )
  }

  const itens: {
    icone: keyof typeof Ionicons.glyphMap
    rotulo: string
    apoio: string
    chave?: ChaveConteudo
  }[] = [
    {
      icone: 'document-text-outline',
      rotulo: 'Anamnese',
      apoio: descricaoDeContagem(conteudo.anamnese, 'anamnese', 'anamneses', 'Ainda não preenchida'),
      chave: 'anamnese',
    },
    {
      icone: 'body-outline',
      rotulo: 'Antropometria',
      apoio: descricaoDeContagem(conteudo.antropometria, 'avaliação', 'avaliações', 'Nenhuma avaliação ainda'),
      chave: 'antropometria',
    },
    {
      icone: 'camera-outline',
      rotulo: 'Evolução fotográfica',
      apoio: descricaoDeContagem(conteudo.fotos, 'foto', 'fotos', 'Nenhuma foto ainda'),
      chave: 'fotos',
    },
    {
      icone: 'restaurant-outline',
      rotulo: 'Planejamento alimentar',
      apoio: descricaoDoPlano(conteudo.plano),
      chave: 'plano',
    },
    {
      icone: 'flame-outline',
      rotulo: 'Cálculo energético',
      apoio: descricaoDoEnergetico(conteudo.energetico),
      chave: 'energetico',
    },
  ]

  return (
    <View style={styles.cartao}>
      <Text style={styles.tituloCartao}>Meu acompanhamento</Text>

      <View style={styles.listaItens}>
        {itens.map(item => {
          const miolo = (
            <>
              <View style={styles.iconeItem}>
                <Ionicons name={item.icone} size={17} color={cores.verde} />
              </View>
              <View style={styles.textoItem}>
                <Text style={styles.rotuloItem}>{item.rotulo}</Text>
                <Text style={styles.apoioItem}>{item.apoio}</Text>
              </View>
              {!!item.chave && (
                <Ionicons name="chevron-forward" size={16} color={inkFraco} />
              )}
            </>
          )

          /* Item vazio continua abrindo: a tela de dentro explica o vazio com
             palavras ("a sua nutricionista ainda não preencheu uma anamnese"),
             e um botão que não responde ao toque não explica nada. */
          return item.chave ? (
            <Pressable
              key={item.rotulo}
              onPress={() => onAbrir(item.chave!)}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressionado]}
              accessibilityRole="button"
              accessibilityLabel={`${item.rotulo}. ${item.apoio}`}
            >
              {miolo}
            </Pressable>
          ) : (
            <View key={item.rotulo} style={styles.item}>
              {miolo}
            </View>
          )
        })}
      </View>
    </View>
  )
}

/* ── Sem vínculo ───────────────────────────────────────────────────────────*/

function Lista({ nutris }: { nutris: Nutricionista[] }) {
  if (nutris.length === 0) {
    return (
      <View style={styles.vazio}>
        <View style={styles.circuloVazio}>
          <Ionicons name="people-outline" size={26} color={cores.verde} />
        </View>
        <Text style={styles.tituloVazio}>Nenhuma nutricionista por aqui ainda</Text>
        <Text style={styles.textoVazio}>
          Assim que houver profissionais disponíveis, elas aparecem nesta lista.
        </Text>
      </View>
    )
  }

  return (
    <>
      <Text style={styles.chamadaLista}>
        {nutris.length} {nutris.length === 1 ? 'profissional' : 'profissionais'} no Cygnos
      </Text>
      <Text style={styles.explicacaoLista}>
        Escolheu uma? Informe a ela o seu código de vínculo — é com ele que ela puxa a sua conta
        para o consultório dela.
      </Text>

      <View style={styles.listaCartoes}>
        {nutris.map(n => (
          <CartaoDaLista key={n.id} nutri={n} />
        ))}
      </View>
    </>
  )
}

function CartaoDaLista({ nutri }: { nutri: Nutricionista }) {
  return (
    <View style={styles.cartao}>
      <View style={styles.linhaCartao}>
        <AvatarNutri nutri={nutri} tamanho={54} />
        <View style={styles.textoCartao}>
          <Text style={styles.nomeCartao} numberOfLines={2}>
            {nutri.nome}
          </Text>
          {!!nutri.crn && <Text style={styles.crnCartao}>CRN {nutri.crn}</Text>}
          {!!lugarDe(nutri) && <Text style={styles.lugarCartao}>{lugarDe(nutri)}</Text>}
        </View>
      </View>

      {nutri.especialidades.length > 0 && <Chips itens={nutri.especialidades} limite={4} />}

      {!!nutri.telefone && <Contato telefone={nutri.telefone} compacto />}
    </View>
  )
}

/* ── Peças ─────────────────────────────────────────────────────────────────*/

const lugarDe = (n: Nutricionista) =>
  n.cidade && n.uf ? `${n.cidade} · ${n.uf}` : n.cidade ?? n.uf ?? ''

function Chips({ itens, limite }: { itens: string[]; limite?: number }) {
  const mostrar = limite ? itens.slice(0, limite) : itens
  const sobra = itens.length - mostrar.length

  return (
    <View style={styles.chips}>
      {mostrar.map(e => (
        <View key={e} style={styles.chip}>
          <Text style={styles.textoChip}>{e}</Text>
        </View>
      ))}
      {sobra > 0 && (
        <View style={styles.chip}>
          <Text style={styles.textoChip}>+{sobra}</Text>
        </View>
      )}
    </View>
  )
}

/* O telefone é um botão, e o toque é da PESSOA: o app não manda mensagem
   nenhuma — abre a conversa e sai da frente. */
function Contato({ telefone, compacto = false }: { telefone: string; compacto?: boolean }) {
  const whatsapp = linkDoWhatsapp(telefone)

  return (
    <View style={[styles.contato, compacto && styles.contatoCompacto]}>
      <Pressable
        onPress={() => Linking.openURL(`tel:${telefone.replace(/\D/g, '')}`)}
        style={({ pressed }) => [styles.botaoContato, pressed && styles.botaoContatoPressionado]}
        accessibilityRole="button"
        accessibilityLabel={`Ligar para ${telefoneFormatado(telefone)}`}
      >
        <Ionicons name="call-outline" size={15} color={cores.ink} />
        <Text style={styles.textoContato}>{telefoneFormatado(telefone)}</Text>
      </Pressable>

      {!!whatsapp && (
        <Pressable
          onPress={() => Linking.openURL(whatsapp)}
          style={({ pressed }) => [styles.botaoZap, pressed && styles.botaoZapPressionado]}
          accessibilityRole="button"
          accessibilityLabel="Abrir conversa no WhatsApp"
        >
          <Ionicons name="logo-whatsapp" size={16} color={cores.branco} />
          <Text style={styles.textoZap}>WhatsApp</Text>
        </Pressable>
      )}
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
  tituloTela: { fontSize: 17, fontWeight: '800', color: cores.ink },

  conteudo: { paddingHorizontal: 20, paddingBottom: 32 },

  /* ── Ficha ── */
  blocoFicha: { alignItems: 'center', paddingVertical: 18 },
  nomeFicha: {
    marginTop: 14,
    fontSize: 21,
    fontWeight: '800',
    color: cores.ink,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  crnFicha: { marginTop: 4, fontSize: 13, color: inkSuave },
  lugarFicha: { marginTop: 2, fontSize: 12.5, color: inkFraco },
  selo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: cores.verdeMenta,
  },
  textoSelo: { fontSize: 12.5, fontWeight: '700', color: cores.verde },

  cartaoProxima: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginTop: 4,
    marginBottom: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: cores.verdeClaro,
    backgroundColor: cores.verdeMenta,
  },
  cartaoProximaPressionado: { backgroundColor: cores.verdeClaro },
  iconeProxima: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: cores.superficie,
  },
  textoProxima: { flex: 1 },
  rotuloProxima: { fontSize: 12, fontWeight: '700', color: cores.verde },
  dataProxima: { marginTop: 2, fontSize: 13.5, fontWeight: '700', color: cores.ink },
  outrasProxima: { marginTop: 3, fontSize: 11.5, color: inkSuave },

  botaoAgendar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    marginTop: 4,
    borderRadius: 15,
    backgroundColor: cores.verde,
  },
  botaoAgendarPressionado: { backgroundColor: cores.verdeEscuro },
  textoAgendar: { fontSize: 14.5, fontWeight: '800', color: cores.branco },

  /* ── Acompanhamento ── */
  listaItens: { gap: 2 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 9,
    paddingHorizontal: 6,
    marginHorizontal: -6,
    borderRadius: 12,
  },
  itemPressionado: { backgroundColor: cores.superficie },
  iconeItem: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: cores.verdeMenta,
  },
  textoItem: { flex: 1 },
  rotuloItem: { fontSize: 14.5, fontWeight: '700', color: cores.ink },
  apoioItem: { marginTop: 2, fontSize: 12.5, lineHeight: 17, color: inkSuave },

  /* ── Lista ── */
  chamadaLista: { marginTop: 6, fontSize: 18, fontWeight: '800', color: cores.ink },
  explicacaoLista: { marginTop: 6, fontSize: 13.5, lineHeight: 20, color: inkSuave },
  listaCartoes: { marginTop: 16, gap: 12 },

  cartao: { borderRadius: 20, backgroundColor: cores.cartao, padding: 16, marginTop: 12 },
  tituloCartao: { fontSize: 15, fontWeight: '800', color: cores.ink, marginBottom: 10 },
  linhaCartao: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  textoCartao: { flex: 1 },
  nomeCartao: { fontSize: 15.5, fontWeight: '700', color: cores.ink, lineHeight: 21 },
  crnCartao: { marginTop: 2, fontSize: 12, color: inkSuave },
  lugarCartao: { marginTop: 1, fontSize: 11.5, color: inkFraco },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: cores.superficie,
  },
  textoChip: { fontSize: 11.5, color: inkMedio },

  contato: { flexDirection: 'row', gap: 8, marginTop: 14 },
  contatoCompacto: { marginTop: 12 },
  botaoContato: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 42,
    borderRadius: 13,
    backgroundColor: cores.superficie,
  },
  botaoContatoPressionado: { backgroundColor: cores.trilho },
  textoContato: { fontSize: 13, fontWeight: '600', color: cores.ink },
  botaoZap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 42,
    borderRadius: 13,
    backgroundColor: cores.verde,
  },
  botaoZapPressionado: { backgroundColor: cores.verdeEscuro },
  textoZap: { fontSize: 13, fontWeight: '700', color: cores.branco },

  /* ── Vazios ── */
  vazio: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 12, gap: 8 },
  circuloVazio: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: cores.verdeMenta,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  tituloVazio: { fontSize: 17, fontWeight: '700', color: cores.ink, textAlign: 'center' },
  textoVazio: { fontSize: 13.5, lineHeight: 20, color: inkSuave, textAlign: 'center' },

  erro: {
    marginTop: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: cores.erroBorda,
    backgroundColor: cores.erroFundo,
    padding: 14,
  },
  textoErro: { fontSize: 13, color: cores.erroTexto },
})
