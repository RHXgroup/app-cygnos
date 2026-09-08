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
import { consultasDoDia } from '../lib/agendaDaNutri'
import { dividirODia, hhmm, resumoDaAgenda, type ConsultaDoDia, type Dia } from '../lib/diaDaNutri'
import { carregarPerfilDaNutri, primeiroNome, type PerfilDaNutri } from '../lib/souNutri'
import { saudacaoDaHora } from '../lib/formatar'
import { LerCodigoScreen } from './LerCodigoScreen'
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

export function PainelDaNutriScreen({ onSair }: { onSair: () => void }) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const agora = useAgora()

  const [perfil, setPerfil] = useState<PerfilDaNutri | null>(null)
  const [consultas, setConsultas] = useState<ConsultaDoDia[]>([])
  const [carregando, setCarregando] = useState(true)
  const [puxando, setPuxando] = useState(false)
  const [erro, setErro] = useState('')
  /* O leitor de código abre POR CIMA do painel, e não como aba: ele é um gesto
     de um minuto no supermercado, e não um lugar onde ela fica. Quem cuida do
     botão voltar é a própria `LerCodigoScreen`, que já registra o dela e, sendo
     o componente mais interno, decide primeiro. Armadilha 1. */
  const [lendoCodigo, setLendoCodigo] = useState(false)

  const buscar = useCallback(async () => {
    const r = await consultasDoDia(new Date())
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

  /* Antes do "carregando": a câmera não depende de a agenda ter chegado, e
     esconder o leitor atrás de uma leitura de rede seria fazer ela esperar por
     um dado que a tela do leitor nem usa. */
  if (lendoCodigo) {
    return <LerCodigoScreen paraBaseDaNutri onFechar={() => setLendoCodigo(false)} />
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
        contentContainerStyle={[styles.conteudo, { paddingBottom: bottom + 28 }]}
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
          <View style={styles.agora}>
            <Text style={styles.rotuloAgora}>AGORA</Text>
            <Text style={styles.nomeAgora}>{dia.agora.nome}</Text>
            <Text style={styles.horaAgora}>
              {hhmm(dia.agora.quando)}
              {dia.agora.duracao ? ` · ${dia.agora.duracao} min` : ''}
            </Text>
          </View>
        )}

        {dia.aindaHoje.length > 0 && (
          <View style={styles.bloco}>
            <Text style={styles.rotuloBloco}>{dia.agora ? 'DEPOIS' : 'HOJE'}</Text>
            {dia.aindaHoje.map(c => (
              <Linha key={c.id} consulta={c} />
            ))}
          </View>
        )}

        {dia.jaForam.length > 0 && (
          <View style={styles.bloco}>
            <Text style={styles.rotuloBloco}>JÁ PASSARAM</Text>
            {dia.jaForam.map(c => (
              <Linha key={c.id} consulta={c} apagada />
            ))}
          </View>
        )}

        {/* Dia sem consulta NÃO é dia livre: ela pode ter mil coisas que o app
            não enxerga. A frase diz o que o app sabe, e nada além. */}
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
          onPress={() => setLendoCodigo(true)}
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
          Por enquanto o app traz a sua agenda do dia e o leitor de produtos. O
          resto do acompanhamento continua no sistema, no computador.
        </Text>
      </ScrollView>
    </View>
  )
}

function Linha({ consulta, apagada = false }: { consulta: ConsultaDoDia; apagada?: boolean }) {
  const styles = estilos()
  return (
    <View style={styles.linha}>
      <Text style={[styles.hora, apagada && styles.apagado]}>{hhmm(consulta.quando)}</Text>
      <Text style={[styles.nome, apagada && styles.apagado]} numberOfLines={1}>
        {consulta.nome}
      </Text>
      {/* A marca de realizada é um traço, e não um "✓ concluída": numa lista de
          seis, texto repetido em cada linha vira ruído e o olho para de ler. */}
      {consulta.status === 'realizada' && (
        <Ionicons name="checkmark" size={15} color={paleta().inkFraco} />
      )}
    </View>
  )
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
  }),
)
