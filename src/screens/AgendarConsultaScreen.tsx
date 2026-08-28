import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  cancelarSolicitacao,
  carregarMinhasConsultas,
  carregarVagas,
  consultaCompacta,
  consultaEmDestaque,
  consultaLegivel,
  diaPorExtenso,
  estadoDaConsulta,
  solicitarConsulta,
  type DiaComVagas,
  type MinhaConsulta,
  type Vaga,
} from '../lib/agenda'
import { cores, inkFraco, inkSuave } from '../theme'

/* Pedir consulta.
 *
 * A tela tem dois estados, e nunca os dois ao mesmo tempo:
 *   1. Existe um pedido em aberto → mostra o pedido e o botão de desistir.
 *      Escolher outro horário enquanto o primeiro não foi respondido é a
 *      receita para a nutricionista abrir a agenda com três pedidos da mesma
 *      pessoa; o banco recusa isso, e a tela nem oferece.
 *   2. Não existe → a escolha: fita de dias em cima, horários do dia embaixo.
 *
 * O verbo é PEDIR, e a tela repete isso em todo lugar — "pedir horário",
 * "aguardando resposta". Nada aqui marca consulta: quem marca é a
 * nutricionista, aceitando. Escrever "agendado" numa tela que só cria pedido
 * seria a mentira mais cara possível, porque a pessoa apareceria no consultório. */
export function AgendarConsultaScreen({ onFechar }: { onFechar: () => void }) {
  const { top } = useSafeAreaInsets()

  const [dias, setDias] = useState<DiaComVagas[] | null>(null)
  const [consultas, setConsultas] = useState<MinhaConsulta[]>([])
  const [erro, setErro] = useState<string | null>(null)

  const [enviando, setEnviando] = useState<string | null>(null)
  const [cancelando, setCancelando] = useState(false)
  const [atualizando, setAtualizando] = useState(false)

  /* `limparErro` existe por causa de um caso só, e é o que mais importa nesta
     tela: quando o pedido é recusado, quem recarrega em seguida é o próprio
     tratamento da recusa — e limpar o erro ali apagaria a explicação antes de
     ela ser lida. Ver `pedir`. */
  async function carregar(limparErro = true) {
    if (limparErro) setErro(null)
    try {
      /* As duas juntas: em sequência, a tela decidiria o que mostrar antes de
         saber a resposta da segunda, e piscaria a escolha de horário antes de
         trocá-la pelo cartão da consulta. */
      const [minhas, vagas] = await Promise.all([carregarMinhasConsultas(), carregarVagas()])
      setConsultas(minhas)
      setDias(vagas)
    } catch (e) {
      /* Frase nossa, e não a do banco.
       *
       * Aqui a distinção é de quem escreveu o texto. As recusas de PEDIDO vêm
       * como frase pronta para ler ("Esse horário não está mais disponível.") e
       * são repassadas inteiras logo abaixo, em `pedir` — quem sabe por que
       * recusou é quem recusou.
       *
       * Falha de CARGA não tem nada disso. O que chega é "Network request
       * failed" ou "permission denied for function app_horarios_livres": texto
       * de programador, em inglês, numa caixa vermelha, para alguém que só
       * queria marcar uma consulta. E não há o que ela faça a respeito além de
       * tentar de novo — que é o que a frase manda fazer.
       *
       * O motivo cru fica no console: a tela não pode assustar o paciente, mas
       * quem for depurar não pode ficar sem a pista. */
      console.warn('[agenda] falha ao carregar a agenda:', e)
      setErro('Não consegui carregar a agenda agora. Puxe para baixo para tentar de novo.')
      setDias([])
    }
  }

  useEffect(() => { carregar() }, [])

  /* Esta é a tela que mais envelhece parada.
   *
   * Duas coisas mudam aqui sem o paciente encostar no aparelho: a nutricionista
   * responde ao pedido dele, e as vagas saem da lista porque OUTRO paciente
   * pediu antes. A segunda é a que dói — ele toca num horário que já não existe
   * e leva um erro no lugar de uma consulta.
   *
   * Voltar do segundo plano relê, e o gesto de puxar existe para quem ficou
   * olhando a lista sem sair do app. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', estado => {
      if (estado === 'active') carregar()
    })
    return () => sub.remove()
  }, [])

  async function puxarParaAtualizar() {
    setAtualizando(true)
    await carregar()
    setAtualizando(false)
  }

  /* O mesmo controle nas duas ramificações da tela — a do pedido em aberto e a
     da escolha de horário. */
  const controleDeAtualizar = (
    <RefreshControl
      refreshing={atualizando}
      onRefresh={puxarParaAtualizar}
      tintColor={cores.limao}
    />
  )

  /* O destaque é o pedido em aberto, se houver; senão, a próxima do calendário.
     As demais viram linhas compactas embaixo — nenhuma some, que era o defeito:
     quem tinha 16:00 e 17:00 no mesmo dia via só a primeira. */
  const destaque = consultaEmDestaque(consultas)
  const demais = consultas.filter(c => c.id !== destaque?.id)

  /* Só 'solicitada' trava a escolha de horário: o banco recusa um segundo
     pedido enquanto este não for respondido. Consulta já marcada não impede
     marcar outra mais para a frente. */
  const aguardando = destaque?.status === 'solicitada'

  async function pedir(inicio: string) {
    setEnviando(inicio)
    setErro(null)
    try {
      await solicitarConsulta(inicio)
      /* Recarrega em vez de montar o pedido aqui na mão: o que vale é o que o
         banco gravou, e a vaga que acabou de sair da lista tem de sumir da lista
         também. */
      await carregar()
    } catch (e) {
      /* A recarga NÃO limpa este erro.
       *
       * O banco recusa horário que já saiu da lista e segundo pedido em aberto,
       * e devolve os dois como frase pronta para ler ("Esse horário não está
       * mais disponível."). Essa frase é a única coisa que explica ao paciente
       * por que o toque dele não virou consulta.
       *
       * Antes, o `carregar()` logo abaixo começava zerando o erro — então a
       * mensagem era apagada no mesmo instante em que aparecia. Quem tocasse num
       * horário já tomado via a linha sumir da lista e mais nada, e a leitura
       * natural disso é "o app não fez nada". */
      setErro((e as Error).message)
      await carregar(false)
    } finally {
      setEnviando(null)
    }
  }

  async function desistir() {
    if (!destaque) return
    setCancelando(true)
    setErro(null)
    try {
      await cancelarSolicitacao(destaque.id)
      await carregar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCancelando(false)
    }
  }

  /* O cabeçalho da lista. Mora aqui e não dentro do JSX da SectionList porque
     ela remonta o ListHeaderComponent a cada render quando ele é uma função
     anônima — e remontar o bloco de texto a cada toque num horário pisca a tela
     toda. */
  const cabecalhoDaLista = (
    <>
      {!!erro && (
        <View style={styles.erro}>
          <Text style={styles.textoErro}>{erro}</Text>
        </View>
      )}
      {/* As consultas que já existem vêm antes da escolha, e não depois: quem
          abre esta tela com consulta marcada quase sempre veio conferir quando
          ela é, não marcar outra. */}
      {!!destaque && (
        <>
          <CartaoDaConsulta consulta={destaque} cancelando={false} />
          <ListaDeConsultas consultas={demais} />
        </>
      )}
      <Text style={styles.chamada}>
        {destaque ? 'Marcar outro horário' : 'Escolha um horário'}
      </Text>
      <Text style={styles.explicacao}>
        O horário fica reservado como pedido até a sua nutricionista responder.
      </Text>
    </>
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
          <Ionicons name="chevron-back" size={22} color={cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela}>Agendar consulta</Text>
        <View style={styles.botaoVoltar} />
      </View>

      {!dias ? (
        <View style={styles.centro}>
          <ActivityIndicator color={cores.verde} />
        </View>
      ) : /* Pedido em aberto ocupa a tela inteira sozinho: o banco recusa um
             segundo pedido enquanto este não for respondido, e mostrar a lista
             de horários embaixo seria oferecer o que não dá para aceitar.
             Consulta já marcada é diferente — ela informa, mas não impede
             remarcar nada mais para a frente, então a lista continua. */
      aguardando || dias.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.conteudo}
          showsVerticalScrollIndicator={false}
          refreshControl={controleDeAtualizar}
        >
          {!!erro && (
            <View style={styles.erro}>
              <Text style={styles.textoErro}>{erro}</Text>
            </View>
          )}

          {destaque && (
            <>
              <CartaoDaConsulta
                consulta={destaque}
                cancelando={cancelando}
                onDesistir={aguardando ? desistir : undefined}
              />
              <ListaDeConsultas consultas={demais} />
            </>
          )}

          {/* Manda para a aba Mensagens, e não "para o WhatsApp" solto: lá existe
              um botão que abre a conversa com ela. Dizer o meio sem dizer o
              caminho deixa a pessoa procurando o número sozinha. */}
          {!aguardando && (
            <Aviso texto="Não há horários livres na agenda da sua nutricionista nas próximas semanas. Você pode falar com ela pela aba Mensagens." />
          )}
        </ScrollView>
      ) : (
        /* Uma lista só, de cima a baixo: cada dia é um cabeçalho e os horários
           dele vêm logo embaixo, um por linha. Sem aba e sem seleção — rolar é
           a única coisa que a pessoa precisa saber fazer.

           SectionList e não ScrollView porque a lista é grande de verdade: 30
           dias de agenda vazia dão mais de trezentas linhas, e montar tudo de
           uma vez trava a abertura da tela. Aqui só o que está à vista existe. */
        <SectionList
          sections={dias.map(d => ({ dia: d.dia, data: d.vagas }))}
          keyExtractor={v => v.inicio}
          contentContainerStyle={styles.conteudo}
          showsVerticalScrollIndicator={false}
          refreshControl={controleDeAtualizar}
          ListHeaderComponent={cabecalhoDaLista}
          /* Grudado no topo: rolando a lista de um dia cheio, o nome do dia sai
             da tela e os horários viram números sem contexto. */
          stickySectionHeadersEnabled
          renderSectionHeader={({ section }) => (
            <View style={styles.cabecalhoDia}>
              <Text style={styles.tituloDia}>{diaPorExtenso(section.dia)}</Text>
              <Text style={styles.contaDia}>{contagem(section.data.length)}</Text>
            </View>
          )}
          renderItem={({ item, section }) => (
            <LinhaHorario
              vaga={item}
              dia={section.dia}
              enviando={enviando}
              onPedir={pedir}
            />
          )}
        />
      )}
    </View>
  )
}

/* O estado da consulta que já existe.
 *
 * Um cartão só para os três estados, com o texto vindo de ESTADO_DA_CONSULTA:
 * três cartões diferentes divergiriam no primeiro ajuste de espaçamento, e o
 * que muda entre eles é palavra, não forma.
 *
 * `onDesistir` só é passado quando o estado é 'solicitada'. Desmarcar consulta
 * confirmada não é assunto de um toque no app — é conversa com a nutricionista,
 * que reservou o horário dela para aquilo. */
/* As outras consultas marcadas, uma linha cada.
 *
 * Compactas de propósito: quem tem cinco retornos agendados não precisa de cinco
 * cartões grandes explicando cada um. A data, a hora e a etiqueta do estado
 * bastam — o cartão de cima já disse por extenso o que cada estado significa. */
function ListaDeConsultas({ consultas }: { consultas: MinhaConsulta[] }) {
  if (consultas.length === 0) return null

  return (
    <View style={styles.blocoDemais}>
      <Text style={styles.rotuloDemais}>Você também tem</Text>
      {consultas.map(c => (
        <View key={c.id} style={styles.linhaConsulta}>
          <Text style={styles.dataConsulta}>{consultaCompacta(c.dataHora)}</Text>
          <View style={styles.etiqueta}>
            <Text style={styles.textoEtiqueta}>{estadoDaConsulta(c.status).curto}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}

function CartaoDaConsulta({
  consulta,
  cancelando,
  onDesistir,
}: {
  consulta: MinhaConsulta
  cancelando: boolean
  onDesistir?: () => void
}) {
  const estado = estadoDaConsulta(consulta.status)
  const marcada = consulta.status !== 'solicitada'

  return (
    <>
      <View style={[styles.cartaoDestaque, marcada && styles.cartaoMarcada]}>
        <View style={styles.circulo}>
          <Ionicons name={estado.icone} size={22} color={cores.verde} />
        </View>
        <Text style={styles.rotuloDestaque}>{estado.titulo}</Text>
        <Text style={styles.horarioPedido}>{consultaLegivel(consulta.dataHora)}</Text>
      </View>

      <Text style={styles.explicacao}>{estado.explicacao}</Text>

      {!!onDesistir && (
        <Pressable
          onPress={onDesistir}
          disabled={cancelando}
          style={({ pressed }) => [styles.botaoDesistir, pressed && styles.botaoDesistirPressionado]}
          accessibilityRole="button"
          accessibilityLabel="Desistir deste pedido"
        >
          {cancelando ? (
            <ActivityIndicator size="small" color={cores.erroTexto} />
          ) : (
            <>
              <Ionicons name="close-circle-outline" size={16} color={cores.erroTexto} />
              <Text style={styles.textoDesistir}>Desistir deste pedido</Text>
            </>
          )}
        </Pressable>
      )}
    </>
  )
}

const contagem = (n: number) => `${n} ${n === 1 ? 'horário' : 'horários'}`

/* Uma linha por horário: a hora à esquerda, o verbo à direita.
 *
 * "Pedir" escrito por extenso, e não só uma seta. É o único lugar do app em que
 * um toque cria compromisso com outra pessoa, e a palavra é o que separa
 * "estou olhando os horários" de "acabei de chamar minha nutricionista". */
function LinhaHorario({
  vaga,
  dia,
  enviando,
  onPedir,
}: {
  vaga: Vaga
  dia: string
  enviando: string | null
  onPedir: (inicio: string) => void
}) {
  const indo = enviando === vaga.inicio

  return (
    <Pressable
      onPress={() => onPedir(vaga.inicio)}
      disabled={!!enviando}
      style={({ pressed }) => [
        styles.linha,
        pressed && styles.linhaPressionada,
        /* Enquanto um pedido está indo, os outros apagam em vez de sumir: uma
           lista que encolhe no meio do toque faz a pessoa achar que errou. */
        !!enviando && !indo && styles.linhaApagada,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Pedir ${diaPorExtenso(dia)} às ${vaga.hora}`}
    >
      <Text style={styles.hora}>{vaga.hora}</Text>
      {indo ? (
        <ActivityIndicator size="small" color={cores.verdeEscuro} />
      ) : (
        <View style={styles.pedir}>
          <Text style={styles.textoPedir}>Pedir</Text>
          <Ionicons name="chevron-forward" size={15} color={cores.verde} />
        </View>
      )}
    </Pressable>
  )
}

function Aviso({ texto }: { texto: string }) {
  return (
    <View style={styles.aviso}>
      <Text style={styles.textoAviso}>{texto}</Text>
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

  chamada: { marginTop: 6, fontSize: 18, fontWeight: '800', color: cores.ink },
  explicacao: { marginTop: 8, fontSize: 13.5, lineHeight: 20, color: inkSuave },

  /* Fundo opaco e não transparente: o cabeçalho fica grudado no topo enquanto a
     lista rola por baixo dele, e sem fundo as horas passariam por trás do nome
     do dia. */
  cabecalhoDia: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    backgroundColor: cores.fundo,
    paddingTop: 20,
    paddingBottom: 8,
  },
  tituloDia: { fontSize: 15, fontWeight: '800', color: cores.ink },
  contaDia: { fontSize: 12, color: inkFraco },

  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 54,
    paddingHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: cores.cartao,
  },
  linhaPressionada: { backgroundColor: cores.verdeMenta },
  linhaApagada: { opacity: 0.4 },
  hora: { fontSize: 16, fontWeight: '700', color: cores.ink },
  pedir: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  textoPedir: { fontSize: 13, fontWeight: '700', color: cores.verde },

  cartaoDestaque: {
    borderRadius: 20,
    backgroundColor: cores.verdeMenta,
    padding: 20,
    marginTop: 16,
    alignItems: 'center',
  },
  circulo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: cores.superficie,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  /* Verde cheio quando a consulta está de pé, menta quando ainda é pedido: a
     diferença entre "pedi" e "está marcado" precisa aparecer antes de a pessoa
     ler qualquer palavra. */
  cartaoMarcada: { backgroundColor: cores.verdeClaro },
  rotuloDestaque: { fontSize: 12.5, fontWeight: '700', color: cores.verde },
  horarioPedido: {
    marginTop: 6,
    fontSize: 17,
    fontWeight: '800',
    color: cores.ink,
    textAlign: 'center',
  },

  blocoDemais: { marginTop: 18 },
  rotuloDemais: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: cores.verde,
    marginBottom: 8,
  },
  linhaConsulta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 46,
    paddingHorizontal: 14,
    marginBottom: 6,
    borderRadius: 13,
    backgroundColor: cores.cartao,
  },
  dataConsulta: { fontSize: 13.5, fontWeight: '600', color: cores.ink },
  etiqueta: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: cores.verdeMenta,
  },
  textoEtiqueta: { fontSize: 11, fontWeight: '700', color: cores.verdeEscuro },

  botaoDesistir: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 46,
    marginTop: 20,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: cores.erroBorda,
    backgroundColor: cores.erroFundo,
  },
  botaoDesistirPressionado: { backgroundColor: cores.erroBorda },
  textoDesistir: { fontSize: 13.5, fontWeight: '700', color: cores.erroTexto },

  aviso: { marginTop: 16, borderRadius: 16, backgroundColor: cores.cartao, padding: 18 },
  textoAviso: { fontSize: 13.5, lineHeight: 20, color: inkSuave, textAlign: 'center' },

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
