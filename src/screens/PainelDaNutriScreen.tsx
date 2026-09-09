import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FichaDoPacienteScreen } from './PacientesDaNutriScreen'
import { consultasDoDia, consultasNoPeriodo, pedidosDeConsulta } from '../lib/agendaDaNutri'
import { quemPedeAtencao } from '../lib/atencaoDaNutri'
import { dinheiroDoDia, reais, type DinheiroDoDia } from '../lib/financeiroDoDia'
import {
  motivoDe,
  porUrgencia,
  resumoDaAtencao,
  type Sinalizado,
} from '../lib/sinaisDaCarteira'
import { dividirODia, hhmm, resumoDaAgenda, type ConsultaDoDia, type Dia } from '../lib/diaDaNutri'
import { carregarPerfilDaNutri, primeiroNome, type PerfilDaNutri } from '../lib/souNutri'
import { saudacaoDaHora } from '../lib/formatar'
import { RAIO_CARTAO, estilosDe, paleta } from '../lib/tema'

/* O painel do dia da nutricionista — a primeira tela dela no app.
 *
 * ── Por que esta tela, e não o painel do sistema inteiro ──────────────────
 * O painel do site já calcula agenda de hoje, recebido, vencendo,
 * aniversariantes, pendências. Tudo isso é "como está o meu dia", que é a
 * pergunta de quem está com o celular na mão entre uma consulta e outra.
 *
 * Aqui entra só a agenda, e de propósito: é a parte que ela consulta várias
 * vezes por dia e a única que não depende de nada que ainda não exista. O
 * resto entra quando entrar, e cada pedaço vale sozinho.
 *
 * ── A ordem é a do dia dela, e não a do menu ──────────────────────────────
 * Quem está comigo agora, quem vem depois, o que já passou. Uma lista de
 * horários responderia as três de uma vez e nenhuma de imediato — e a primeira
 * é a única que se responde de relance, que é como esta tela vai ser olhada.
 *
 * ── E não há nada aqui que grave ──────────────────────────────────────────
 * Só a agenda é leitura pura. O único gesto que grava é o leitor de
 * código de barras, e ele grava na base DELA, com confirmação. Agendar, remarcar e a Aurora vêm depois, e
 * vêm com confirmação — o comando de voz do treino já concluiu um treino
 * sozinho duas vezes, e o custo de um engano numa agenda é uma paciente
 * aparecendo no dia errado. */

/* Um minuto. É o suficiente para "agora" virar "já passou" sem ninguém tocar em
   nada, e barato o bastante para rodar numa tela aberta em cima da mesa — a
   conta é local, sem ida à rede. */
const PULSO_MS = 60_000

function useAgora(): number {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), PULSO_MS)
    return () => clearInterval(id)
  }, [])
  return agora
}

export function PainelDaNutriScreen({
  onSair,
  onVerAgenda,
  onLerCodigo,
}: {
  onSair: () => void
  /* Quem abre a agenda e o leitor é a área que hospeda as abas, e não esta
     tela. Sem isso, o painel teria o próprio estado de "leitor aberto" e a
     barra de abas continuaria embaixo dele -- duas saídas para a mesma coisa,
     e um `BackHandler` disputando com o de cima. */
  onVerAgenda: () => void
  onLerCodigo: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const agora = useAgora()

  const [perfil, setPerfil] = useState<PerfilDaNutri | null>(null)
  const [consultas, setConsultas] = useState<ConsultaDoDia[]>([])
  /* Os pedidos esperando resposta, e a agenda de amanhã. As duas coisas que o
     painel não respondia: quem está aguardando ela, e como está o dia seguinte
     -- que é a pergunta de quem olha o telefone à noite. */
  const [pedidos, setPedidos] = useState<ConsultaDoDia[]>([])
  const [amanha, setAmanha] = useState<ConsultaDoDia[]>([])
  const [carregando, setCarregando] = useState(true)
  const [puxando, setPuxando] = useState(false)
  const [erro, setErro] = useState('')
  const [dinheiro, setDinheiro] = useState<DinheiroDoDia | null>(null)
  const [atencao, setAtencao] = useState<Sinalizado[]>([])
  /* Fechado por padrão: a linha é o aviso, e os nomes são o passo seguinte.
     Abrir sozinho faria uma lista de oito empurrar a agenda para fora da tela
     -- e a agenda é o que ela veio ver. */
  const [nomesAbertos, setNomesAbertos] = useState(false)
  /* A ficha abre POR CIMA do painel. Ela lê "14:00 Marina Alves" e quer saber
     quem é a Marina -- é o clique que este painel existe para poupar. */
  const [fichaAberta, setFichaAberta] = useState<number | null>(null)

  const buscar = useCallback(async () => {
    /* As três juntas: são consultas independentes, e esperar uma para começar a
       outra triplicaria a espera de uma tela que ela abre várias vezes por dia.

       E só a AGENDA vira erro na tela. As outras duas são complemento: um
       consultório sem permissão de financeiro não pode ver a agenda escondida
       atrás de um recado sobre dinheiro que ela nem deveria ver. */
    const depoisDeAmanha = new Date()
    depoisDeAmanha.setDate(depoisDeAmanha.getDate() + 1)

    const [r, caixa, sinais, aguardando, oDiaSeguinte] = await Promise.all([
      consultasDoDia(new Date()),
      dinheiroDoDia(),
      quemPedeAtencao(),
      pedidosDeConsulta(),
      consultasNoPeriodo(depoisDeAmanha, depoisDeAmanha),
    ])

    setDinheiro(caixa)
    setAtencao(sinais.tipo === 'ok' ? sinais.pessoas : [])
    setPedidos(aguardando.tipo === 'ok' ? aguardando.consultas : [])
    /* Só o que CONTA como compromisso: pedido de amanhã já aparece no cartão de
       pedidos, e contá-lo aqui também faria o mesmo pedido virar dois avisos. */
    setAmanha(
      oDiaSeguinte.tipo === 'ok'
        ? oDiaSeguinte.consultas.filter(c => c.status !== 'cancelada' && c.status !== 'solicitada')
        : [],
    )
    /* O erro é limpo no sucesso, e não só escrito na falha: esta tela relê
       sozinha ao voltar do segundo plano, e um erro que fica esconderia a
       agenda atrás de uma mensagem vencida. Armadilha 9. */
    if (r.tipo === 'ok') {
      setErro('')
      setConsultas(r.consultas)
    } else {
      setErro(r.mensagem)
    }
  }, [])

  useEffect(() => {
    let vivo = true
    void carregarPerfilDaNutri().then(p => {
      if (vivo) setPerfil(p)
    })
    void buscar().finally(() => {
      if (vivo) setCarregando(false)
    })
    return () => {
      vivo = false
    }
  }, [buscar])

  /* O que muda do lado do sistema nunca chega sozinho — item 8 do AGENTS.md.
     Ela marca uma consulta no computador e volta ao celular; sem isto, a agenda
     continuaria a de antes até fechar o app. E ninguém fecha app. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', e => {
      if (e === 'active') void buscar()
    })
    return () => sub.remove()
  }, [buscar])

  const dia: Dia = dividirODia(consultas, agora)

  if (fichaAberta !== null) {
    return <FichaDoPacienteScreen id={fichaAberta} onFechar={() => setFichaAberta(null)} />
  }

  if (carregando) {
    return (
      <View style={[styles.tela, styles.centro]}>
        <ActivityIndicator color={paleta().cores.verde} />
      </View>
    )
  }

  return (
    <View style={[styles.tela, { paddingTop: top + 8 }]}>
      <ScrollView
        /* A barra de abas já ocupa o rodapé da área; aqui basta o respiro. */
        contentContainerStyle={[styles.conteudo, { paddingBottom: 20 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={puxando}
            onRefresh={() => {
              setPuxando(true)
              void buscar().finally(() => setPuxando(false))
            }}
            tintColor={paleta().cores.verde}
            colors={[paleta().cores.verde]}
            progressBackgroundColor={paleta().cores.cartao}
          />
        }
      >
        <View style={styles.topo}>
          <View style={styles.textosTopo}>
            <Text style={styles.saudacao}>
              {saudacaoDaHora(new Date(agora).getHours())}
              {perfil ? `, ${primeiroNome(perfil.nome)}` : ''}
            </Text>
            <Text style={styles.resumo}>{resumoDaAgenda(dia)}</Text>
          </View>
          <Pressable
            onPress={onSair}
            style={styles.botaoSair}
            accessibilityRole="button"
            accessibilityLabel="Sair da conta"
          >
            <Ionicons name="log-out-outline" size={20} color={paleta().inkFraco} />
          </Pressable>
        </View>

        {/* O erro fica ACIMA do conteúdo, e não no fim: quem não vê a agenda
            que esperava precisa saber por quê antes de rolar atrás dela. */}
        {!!erro && <Text style={styles.erro}>{erro}</Text>}

        {/* ── QUEM ESTÁ COM ELA AGORA ──────────────────────────────────
            O único cartão grande da tela. Se tudo tivesse o mesmo peso, a
            resposta que ela procura de relance estaria no meio de uma lista. */}
        {dia.agora && (
          <Pressable
            onPress={() => dia.agora?.pacienteId && setFichaAberta(dia.agora.pacienteId)}
            /* Sem ficha não é botão: o encaixe avulso não tem para onde levar, e
               tocar num nome e nada acontecer é pior do que ele não parecer
               tocável. */
            disabled={!dia.agora.pacienteId}
            style={({ pressed }) => [styles.agora, pressed && styles.pressionada]}
            accessibilityRole={dia.agora.pacienteId ? 'button' : 'text'}
            accessibilityLabel={
              'Agora: ' + dia.agora.nome + ', ' + hhmm(dia.agora.quando) +
              (dia.agora.pacienteId ? '. Toque para abrir a ficha.' : '')
            }
          >
            <Text style={styles.rotuloAgora}>AGORA</Text>
            <Text style={styles.nomeAgora}>{dia.agora.nome}</Text>
            <Text style={styles.horaAgora}>
              {hhmm(dia.agora.quando)}
              {dia.agora.duracao ? ` · ${dia.agora.duracao} min` : ''}
            </Text>
          </Pressable>
        )}

        {/* ──────────────────── QUEM ESTÁ ESPERANDO RESPOSTA ────────────────────
            A única coisa deste painel com uma PESSOA do outro lado aguardando --
            e a que não aparecia em lugar nenhum do aplicativo. `solicitada` é
            excluída da agenda de propósito (pedido não é compromisso), e
            excluída dali ela sumia inteira.

            Vem depois do AGORA e antes do resto: quem está na sala ganha da
            fila, mas a fila ganha do que já está resolvido. */}
        {pedidos.length > 0 && (
          <View style={styles.pedidos}>
            <View style={styles.topoDosPedidos}>
              <Ionicons name="hand-left-outline" size={16} color={paleta().cores.gold} />
              <Text style={styles.rotuloPedidos}>
                {pedidos.length === 1
                  ? '1 PEDIDO ESPERANDO RESPOSTA'
                  : pedidos.length + ' PEDIDOS ESPERANDO RESPOSTA'}
              </Text>
            </View>

            {pedidos.slice(0, 4).map(c => (
              <Linha key={c.id} consulta={c} comDia onAbrir={setFichaAberta} />
            ))}
            {pedidos.length > 4 && (
              <Text style={styles.maisPedidos}>e mais {pedidos.length - 4}</Text>
            )}

            {/* Dito porque a tela MOSTRA e não deixa responder: uma lista de
                gente esperando, sem saída, é pior do que não mostrar. */}
            <Text style={styles.ondeResponder}>
              Aceitar ou recusar ainda é no sistema, no computador.
            </Text>
          </View>
        )}

        {dia.aindaHoje.length > 0 && (
          <View style={styles.bloco}>
            <Text style={styles.rotuloBloco}>{dia.agora ? 'DEPOIS' : 'HOJE'}</Text>
            {dia.aindaHoje.map(c => (
              <Linha key={c.id} consulta={c} onAbrir={setFichaAberta} />
            ))}
          </View>
        )}

        {dia.jaForam.length > 0 && (
          <View style={styles.bloco}>
            <Text style={styles.rotuloBloco}>JÁ PASSARAM</Text>
            {dia.jaForam.map(c => (
              <Linha key={c.id} consulta={c} apagada onAbrir={setFichaAberta} />
            ))}
          </View>
        )}

        {/* ──────────────────── AMANHÃ, NUMA LINHA ────────────────────
            Ela olha o painel à noite, quando o dia já acabou -- e até agora a
            tela respondia só a pergunta da manhã. Uma linha, e não um bloco: a
            agenda de amanhã inteira está a um toque na aba Agenda, e repetir
            aqui faria a tela do DIA falar de outro dia. */}
        {amanha.length > 0 && (
          <Text style={styles.amanha}>
            Amanhã: {amanha.length === 1 ? '1 consulta' : amanha.length + ' consultas'}
            {amanha[0] ? ', a primeira às ' + hhmm(amanha[0].quando) : ''}
          </Text>
        )}

        {/* Dia sem consulta NÃO é dia livre: ela pode ter mil coisas que o app
            não enxerga. A frase diz o que o app sabe, e nada além. */}
        {/* ──────────────────── O DINHEIRO DO DIA ────────────────────
            Só aparece quando HÁ movimento, e isso é decisão e não esquecimento.
            A política de `contas_receber_baixas` exige a permissão de baixar:
            quem não a tem recebe ZERO LINHA, sem erro nenhum -- idêntico a "não
            entrou nada hoje". Escrever "R$ 0" nos dois casos seria o app
            afirmando um número que ele não sabe, para quem decide dinheiro com
            ele. Item 6: zero é mentira. */}
        {/* ──────────────────── E O A PAGAR, QUE ERA LIDO E JOGADO FORA ────────────────────
            `dinheiroDoDia` já buscava `aPagar` e `quantasAPagar`, com um
            comentário explicando por que aquilo importa -- "é a pergunta que ela
            faz de manhã, e não saber custa juro". Só que nenhuma tela lia os dois
            campos: a consulta ia ao banco todo dia e a resposta era descartada.

            É o mesmo formato dos três achados que fizeram nascer o `npm run
            orfaos`: o objeto existe, e o caminho não passa por ele. Nada falha,
            nada avisa, e ninguém descobre olhando a tela -- só olhando os dois
            lados juntos. */}
        {!!dinheiro &&
          (dinheiro.quantasBaixas > 0 || dinheiro.quantasVencendo > 0 || dinheiro.quantasAPagar > 0) && (
          <View style={styles.caixaDoDia}>
            {dinheiro.quantasBaixas > 0 && (
              <View style={styles.verba}>
                <Text style={styles.rotuloVerba}>RECEBIDO HOJE</Text>
                <Text style={styles.valorVerba}>{reais(dinheiro.recebido)}</Text>
              </View>
            )}
            {dinheiro.quantasVencendo > 0 && (
              <View style={styles.verba}>
                <Text style={styles.rotuloVerba}>VENCE HOJE</Text>
                <Text style={[styles.valorVerba, styles.valorVencendo]}>
                  {reais(dinheiro.vencendo)}
                </Text>
              </View>
            )}
            {dinheiro.quantasAPagar > 0 && (
              <View style={styles.verba}>
                {/* "A PAGAR HOJE", e não "DESPESAS": ela lê a caixa inteira de
                    relance, e as três colunas precisam responder à mesma
                    pergunta -- o que entrou, o que falta entrar, o que sai. */}
                <Text style={styles.rotuloVerba}>A PAGAR HOJE</Text>
                <Text style={[styles.valorVerba, styles.valorAPagar]}>
                  {reais(dinheiro.aPagar)}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ──────────────────── QUEM PEDE ATENÇÃO ────────────────────
            Uma LINHA, e não o painel da Carteira. O site tem a leitura inteira,
            com cinco colunas e análise por IA; repetir aquilo aqui daria uma
            tela bonita e ignorada. Uma frase que aparece SÓ quando há alguém é
            lida todo dia. */}
        {atencao.length > 0 && (
          <View style={styles.blocoAtencao}>
            <Pressable
              onPress={() => setNomesAbertos(v => !v)}
              style={({ pressed }) => [styles.linhaAtencao, pressed && styles.pressionada]}
              accessibilityRole="button"
              accessibilityState={{ expanded: nomesAbertos }}
              accessibilityLabel={`${resumoDaAtencao(atencao).frase}. Toque para ver os nomes.`}
            >
              <View style={styles.textosAtencao}>
                <Text style={styles.fraseAtencao}>{resumoDaAtencao(atencao).frase}</Text>
                <Text style={styles.quebraAtencao}>{resumoDaAtencao(atencao).porSinal}</Text>
              </View>
              <Ionicons
                name={nomesAbertos ? 'chevron-up' : 'chevron-down'}
                size={17}
                color={paleta().inkFraco}
              />
            </Pressable>

            {nomesAbertos &&
              porUrgencia(atencao).map(pessoa => (
                <View key={pessoa.id} style={styles.pessoaAtencao}>
                  <Text style={styles.nomeAtencao} numberOfLines={1}>
                    {pessoa.nome}
                  </Text>
                  <Text style={styles.motivoAtencao} numberOfLines={1}>
                    {motivoDe(pessoa)}
                  </Text>
                </View>
              ))}
          </View>
        )}

        {dia.total === 0 && !erro && (
          <View style={styles.vazio}>
            <Ionicons name="calendar-outline" size={22} color={paleta().inkFraco} />
            <Text style={styles.textoVazio}>Nada marcado para hoje na sua agenda.</Text>
          </View>
        )}

        {/* ──────────────────── O QUE ELA FAZ COM O CELULAR NA MÃO ────────────────────
            Separado da agenda de propósito: a agenda é o dia dela, isto é
            ferramenta. Juntar os dois faria a lista de horários terminar num
            botão que não tem nada a ver com horário nenhum. */}
        <Pressable
          onPress={onVerAgenda}
          style={({ pressed }) => [styles.ferramenta, pressed && styles.pressionada]}
          accessibilityRole="button"
          accessibilityLabel="Ver a agenda da semana e do mês"
        >
          <Ionicons name="calendar-outline" size={22} color={paleta().cores.verde} />
          <View style={styles.textosFerramenta}>
            <Text style={styles.tituloFerramenta}>Ver a agenda inteira</Text>
            <Text style={styles.textoFerramenta}>Semana, mês, e qualquer dia</Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={paleta().inkFraco} />
        </Pressable>

        <Pressable
          onPress={onLerCodigo}
          style={({ pressed }) => [styles.ferramenta, pressed && styles.pressionada]}
          accessibilityRole="button"
          accessibilityLabel="Ler código de barras de um produto"
        >
          <Ionicons name="barcode-outline" size={22} color={paleta().cores.verde} />
          <View style={styles.textosFerramenta}>
            <Text style={styles.tituloFerramenta}>Ler código de barras</Text>
            <Text style={styles.textoFerramenta}>
              Guardar um produto na sua base de alimentos
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={paleta().inkFraco} />
        </Pressable>

        {/* Dito por escrito porque a ausência do resto é uma DECISÃO, e não uma
            tela pela metade. Sem isto, a primeira impressão é de app inacabado. */}
        <Text style={styles.rodape}>
          Isto é o seu dia. A agenda inteira, os pacientes e o financeiro estão
          nas abas · e o que não tem tela, a Aurora faz.
        </Text>
      </ScrollView>

    </View>
  )
}

function Linha({
  consulta,
  apagada = false,
  comDia = false,
  onAbrir,
}: {
  consulta: ConsultaDoDia
  apagada?: boolean
  /* O pedido pode ser para outro dia, e "14:00" sozinho faria ela achar que é
     hoje. Na agenda do dia o dia é o título, e repeti-lo em cada linha seria
     ruído. */
  comDia?: boolean
  onAbrir?: (id: number) => void
}) {
  const styles = estilos()
  return (
    <Pressable
      onPress={() => consulta.pacienteId && onAbrir?.(consulta.pacienteId)}
      disabled={!consulta.pacienteId || !onAbrir}
      style={({ pressed }) => [styles.linha, pressed && styles.pressionada]}
      accessibilityRole={consulta.pacienteId && onAbrir ? 'button' : 'text'}
      accessibilityLabel={
        hhmm(consulta.quando) + ', ' + consulta.nome +
        (consulta.pacienteId && onAbrir ? '. Toque para abrir a ficha.' : '')
      }
    >
      <Text style={[styles.hora, apagada && styles.apagado, comDia && styles.horaLarga]}>
        {comDia ? diaCurto(consulta.quando) + ' ' + hhmm(consulta.quando) : hhmm(consulta.quando)}
      </Text>
      <Text style={[styles.nome, apagada && styles.apagado]} numberOfLines={1}>
        {consulta.nome}
      </Text>
      {/* A marca de realizada é um traço, e não um "✓ concluída": numa lista de
          seis, texto repetido em cada linha vira ruído e o olho para de ler. */}
      {consulta.status === 'realizada' && (
        <Ionicons name="checkmark" size={15} color={paleta().inkFraco} />
      )}
      {!!consulta.pacienteId && (
        <Ionicons name="chevron-forward" size={14} color={paleta().inkFraco} />
      )}
    </Pressable>
  )
}

/* "10/09". Sem o ano: um pedido é sempre para os próximos dias, e o ano ali só
   ocuparia a largura que o nome precisa. */
function diaCurto(iso: string): string {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return ''
  return String(dt.getDate()).padStart(2, '0') + '/' + String(dt.getMonth() + 1).padStart(2, '0')
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.cores.fundo },
    centro: { alignItems: 'center', justifyContent: 'center' },
    conteudo: { paddingHorizontal: 16, gap: 12 },

    topo: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingBottom: 4 },
    textosTopo: { flex: 1 },
    saudacao: { fontSize: 22, fontWeight: '800', color: t.cores.ink, letterSpacing: -0.3 },
    resumo: { fontSize: 14, color: t.inkSuave, marginTop: 2 },
    botaoSair: { padding: 8, marginTop: -4, marginRight: -8 },

    erro: { fontSize: 13.5, color: t.cores.ink, backgroundColor: t.cores.verdeMenta, padding: 12, borderRadius: 10 },

    /* O cartão de "agora" é o único com preenchimento cheio da cor de acento.
       Ele responde a pergunta que se faz de relance; o resto se lê depois. */
    agora: {
      backgroundColor: t.cores.verde,
      borderRadius: RAIO_CARTAO,
      padding: 18,
      gap: 2,
    },
    rotuloAgora: {
      fontSize: 10.5,
      fontWeight: '800',
      letterSpacing: 1.2,
      color: 'rgba(255,255,255,0.75)',
    },
    nomeAgora: { fontSize: 24, fontWeight: '800', color: t.cores.branco, letterSpacing: -0.4 },
    horaAgora: { fontSize: 14, color: 'rgba(255,255,255,0.85)' },

    bloco: {
      backgroundColor: t.cores.cartao,
      borderRadius: RAIO_CARTAO,
      paddingVertical: 6,
      paddingHorizontal: 14,
    },
    rotuloBloco: {
      fontSize: 10.5,
      fontWeight: '800',
      letterSpacing: 1.1,
      color: t.inkFraco,
      paddingTop: 10,
      paddingBottom: 2,
    },

    linha: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
    /* Largura fixa e dígitos tabulares: sem isso "09:00" e "11:30" desalinham o
       nome ao lado, e uma coluna torta se lê como tela desleixada. */
    hora: {
      fontSize: 14,
      fontWeight: '700',
      color: t.cores.verde,
      width: 46,
      fontVariant: ['tabular-nums'],
    },
    nome: { flex: 1, fontSize: 15, color: t.cores.ink },
    apagado: { color: t.inkFraco, fontWeight: '400' },

    vazio: {
      alignItems: 'center',
      gap: 8,
      paddingVertical: 34,
      backgroundColor: t.cores.cartao,
      borderRadius: RAIO_CARTAO,
    },
    textoVazio: { fontSize: 14, color: t.inkSuave },

    /* Os dois lado a lado, e sem cartão em volta de cada um: são dois números
       de relance, e uma moldura por número faria a tela parecer um relatório. */
    caixaDoDia: {
      flexDirection: 'row',
      gap: 10,
      backgroundColor: t.cores.cartao,
      borderRadius: RAIO_CARTAO,
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    verba: { flex: 1, gap: 3 },
    /* O que SAI não pode ter a cor do que entra, e também não é erro: dívida do
       dia é informação, e vermelho de erro neste app quer dizer "alguma coisa
       quebrou". Fica no tom de aviso, o mesmo do cartão de conferir. */
    rotuloVerba: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: t.inkFraco },
    valorVerba: {
      fontSize: 20,
      fontWeight: '800',
      color: t.cores.ink,
      letterSpacing: -0.4,
      fontVariant: ['tabular-nums'],
    },
    /* O que vence ainda não entrou. Cor de atenção, e não de erro: não há nada
       errado em uma conta vencer hoje. */
    valorVencendo: { color: t.cores.gold },
    valorAPagar: { color: t.inkSuave },

    /* Contorno em vez de preenchimento: o cartão cheio é o do AGORA, e dois
       cheios na mesma tela brigam pelo olho. O contorno diz "olhe aqui" sem
       disputar com "quem está com você". */
    pedidos: {
      backgroundColor: t.cores.cartao,
      borderWidth: 1.5,
      borderColor: t.cores.gold,
      borderRadius: RAIO_CARTAO,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    topoDosPedidos: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingBottom: 4 },
    rotuloPedidos: {
      fontSize: 10.5,
      fontWeight: '800',
      letterSpacing: 1,
      color: t.cores.gold,
    },
    maisPedidos: { fontSize: 12.5, color: t.inkFraco, paddingVertical: 6 },
    ondeResponder: { fontSize: 11.5, color: t.inkFraco, lineHeight: 17, paddingTop: 6 },

    amanha: { fontSize: 13, color: t.inkSuave, paddingHorizontal: 4, paddingTop: 2 },
    horaLarga: { width: 82 },

    blocoAtencao: {
      backgroundColor: t.cores.cartao,
      borderRadius: RAIO_CARTAO,
      paddingHorizontal: 16,
      overflow: 'hidden',
    },
    linhaAtencao: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
    textosAtencao: { flex: 1 },
    fraseAtencao: { fontSize: 15, fontWeight: '700', color: t.cores.ink },
    quebraAtencao: { fontSize: 12.5, color: t.inkSuave, marginTop: 2 },
    pessoaAtencao: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.cores.borda,
      paddingVertical: 11,
    },
    nomeAtencao: { fontSize: 14.5, color: t.cores.ink },
    motivoAtencao: { fontSize: 12.5, color: t.inkSuave, marginTop: 1 },

    ferramenta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: t.cores.cartao,
      borderRadius: RAIO_CARTAO,
      paddingVertical: 14,
      paddingHorizontal: 14,
      marginTop: 2,
    },
    textosFerramenta: { flex: 1 },
    tituloFerramenta: { fontSize: 15, fontWeight: '700', color: t.cores.ink },
    textoFerramenta: { fontSize: 12.5, color: t.inkSuave, marginTop: 1 },
    pressionada: { opacity: 0.75 },

    rodape: { fontSize: 12.5, color: t.inkFraco, lineHeight: 18, paddingTop: 6, paddingHorizontal: 4 },

    rodapeDaAurora: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 16,
      paddingTop: 8,
      backgroundColor: t.cores.fundo,
    },
    barraAurora: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderRadius: 22,
      paddingVertical: 13,
      paddingHorizontal: 16,
    },
    textoBarraAurora: { flex: 1, fontSize: 14, color: t.inkSuave },
  }),
)
