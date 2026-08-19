import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
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
import { CampoTexto } from '../components/CampoTexto'
import { SeletorDias } from '../components/SeletorDias'
import { TotaisPlano } from '../components/TotaisPlano'
import { BuscarAlimentoScreen, type MotivoBusca } from './BuscarAlimentoScreen'
import { milhar } from '../lib/formatar'
import { mascaraHora, validarHora } from '../lib/formulario'
import {
  detalheDoItem,
  itensDoPlano,
  novaChave,
  paraEdicao,
  salvarPlano,
  totaisDe,
  type AlimentoEscolhido,
  type DiaSemana,
  type ItemAlimento,
  type PlanoCompleto,
  type RefeicaoMontada,
} from '../lib/plano'
import { cores, inkFraco, inkMedio, inkSuave } from '../theme'

const LIMITE_NOME = 80

/* Onde a busca de alimento foi aberta e para quê. O item só existe quando o
   motivo o exige — substituir e criar variação são atos SOBRE um item. */
type Busca = {
  refeicao: string
  item?: string
  motivo: MotivoBusca
  titulo: string
}

/* O retrato do plano, para saber se algo mudou de verdade.
 *
 * Sem as chaves de tela de propósito: elas são novas a cada linha adicionada, e
 * remover um alimento e pôr o mesmo de volta deixaria o botão de salvar aceso
 * anunciando uma mudança que não existe. O que conta é o conteúdo. */
function retrato(nome: string, dias: DiaSemana[], refeicoes: RefeicaoMontada[]): string {
  const alimento = (a: AlimentoEscolhido) => [a.alimentoId, a.nome, a.descricao, a.gramasTotais]

  return JSON.stringify({
    nome: nome.trim(),
    dias: [...dias].sort((a, b) => a - b),
    refeicoes: refeicoes.map(r => [
      r.rotulo.trim(),
      r.hora,
      r.itens.map(i => [alimento(i), i.variacoes.map(alimento)]),
    ]),
  })
}

/* O plano inteiro, editável.
 *
 * Tudo acontece em memória e só vai ao banco no "Salvar" — inclusive apagar uma
 * refeição. Gravar a cada toque pareceria mais moderno, mas transformaria um
 * toque errado num estrago imediato, e sem uma tela de desfazer para consertar. */
export function EditarPlanoScreen({
  plano,
  onFechar,
  onSalvo,
}: {
  plano: PlanoCompleto
  onFechar: () => void
  onSalvo: () => void
}) {
  const { top, bottom } = useSafeAreaInsets()
  const [nome, setNome] = useState(plano.nome)
  const [dias, setDias] = useState<DiaSemana[]>(plano.diasSemana)
  const [refeicoes, setRefeicoes] = useState<RefeicaoMontada[]>(() => paraEdicao(plano))
  const [busca, setBusca] = useState<Busca | null>(null)
  /* Qual item está com o menu de ações aberto. */
  const [acoesDe, setAcoesDe] = useState<{ refeicao: string; item: ItemAlimento } | null>(null)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  /* O estado de partida, congelado no primeiro render. Inicializador preguiçoso
     e não useRef(retrato(…)): o argumento do useRef é avaliado a cada render, e
     isso reconstruiria o plano inteiro só para jogar fora. */
  const [original] = useState(() => retrato(plano.nome, plano.diasSemana, paraEdicao(plano)))
  const mudou = retrato(nome, dias, refeicoes) !== original

  function mexerNaRefeicao(chave: string, mudanca: Partial<RefeicaoMontada>) {
    setRefeicoes(lista => lista.map(r => (r.chave === chave ? { ...r, ...mudanca } : r)))
    setErro('')
  }

  function mexerNosItens(chave: string, f: (itens: ItemAlimento[]) => ItemAlimento[]) {
    setRefeicoes(lista => lista.map(r => (r.chave === chave ? { ...r, itens: f(r.itens) } : r)))
    setErro('')
  }

  function sair() {
    if (!mudou) {
      onFechar()
      return
    }

    /* Sair com alteração pendente é a única forma de perder trabalho aqui, e
       ela acontece com um toque no canto da tela. Vale a pergunta. */
    Alert.alert('Descartar alterações?', 'O que você mudou neste plano será perdido.', [
      { text: 'Continuar editando', style: 'cancel' },
      { text: 'Descartar', style: 'destructive', onPress: onFechar },
    ])
  }

  async function salvar() {
    const nomeLimpo = nome.trim()
    if (!nomeLimpo) {
      setErro('Dê um nome ao plano.')
      return
    }
    if (dias.length === 0) {
      setErro('Marque pelo menos um dia da semana.')
      return
    }
    if (refeicoes.length === 0) {
      setErro('O plano precisa de pelo menos uma refeição.')
      return
    }
    if (refeicoes.some(r => !r.rotulo.trim() || validarHora(r.hora) !== null)) {
      setErro('Confira o nome e o horário das refeições.')
      return
    }

    setErro('')
    setSalvando(true)

    const r = await salvarPlano({
      /* Com id: regrava este plano em vez de criar mais um na lista. */
      planoId: plano.id,
      nome: nomeLimpo,
      observacao: plano.observacao ?? '',
      diasSemana: dias,
      refeicoes,
    })

    if (r.tipo === 'erro') {
      setErro(r.mensagem)
      setSalvando(false)
      return
    }

    onSalvo()
  }

  if (busca) {
    return (
      <BuscarAlimentoScreen
        refeicao={busca.titulo}
        motivo={busca.motivo}
        onFechar={() => setBusca(null)}
        onAdicionar={alimento => {
          mexerNosItens(busca.refeicao, itens => {
            if (busca.motivo === 'adicionar') return [...itens, { ...alimento, variacoes: [] }]

            return itens.map(i => {
              if (i.chave !== busca.item) return i
              /* Substituir troca o alimento e MANTÉM as variações: elas foram
                 escolhidas como alternativas daquele lugar no prato, não
                 daquele alimento. */
              if (busca.motivo === 'substituir') return { ...alimento, variacoes: i.variacoes }
              return { ...i, variacoes: [...i.variacoes, alimento] }
            })
          })
        }}
      />
    )
  }

  const totais = totaisDe(itensDoPlano(refeicoes))

  return (
    <KeyboardAvoidingView
      style={styles.tela}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.cabecalho, { paddingTop: top + 8 }]}>
        <Pressable
          onPress={sair}
          style={styles.botaoVoltar}
          hitSlop={8}
          disabled={salvando}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela}>Editar plano</Text>
        <View style={styles.botaoVoltar} />
      </View>

      <ScrollView
        contentContainerStyle={styles.conteudo}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={false}
        overScrollMode="never"
      >
        <CampoTexto
          rotulo="Nome do plano"
          value={nome}
          onChangeText={t => {
            setNome(t)
            setErro('')
          }}
          maxLength={LIMITE_NOME}
          autoCapitalize="sentences"
          editable={!salvando}
        />

        <Text style={styles.secao}>Em que dias este plano vale</Text>
        <SeletorDias
          dias={dias}
          desativado={salvando}
          onMudar={novos => {
            setDias(novos)
            setErro('')
          }}
        />

        <Text style={styles.secao}>Refeições</Text>

        {refeicoes.map(r => (
          <BlocoRefeicao
            key={r.chave}
            refeicao={r}
            desativado={salvando}
            onRotulo={t => mexerNaRefeicao(r.chave, { rotulo: t })}
            onHora={h => mexerNaRefeicao(r.chave, { hora: mascaraHora(h) })}
            onRemover={() => {
              setRefeicoes(lista => lista.filter(x => x.chave !== r.chave))
              setErro('')
            }}
            onAdicionar={() =>
              setBusca({ refeicao: r.chave, motivo: 'adicionar', titulo: r.rotulo || 'Refeição' })
            }
            onAcoes={item => setAcoesDe({ refeicao: r.chave, item })}
            onRemoverVariacao={(item, variacao) =>
              mexerNosItens(r.chave, itens =>
                itens.map(i =>
                  i.chave === item
                    ? { ...i, variacoes: i.variacoes.filter(v => v.chave !== variacao) }
                    : i,
                ),
              )
            }
          />
        ))}

        <Pressable
          onPress={() => {
            setRefeicoes(lista => [
              ...lista,
              { chave: novaChave(), rotulo: '', hora: '', itens: [] },
            ])
            setErro('')
          }}
          disabled={salvando}
          style={({ pressed }) => [styles.botaoTracejado, pressed && styles.tracejadoPressionado]}
          accessibilityRole="button"
        >
          <Ionicons name="add" size={18} color={cores.verde} />
          <Text style={styles.textoTracejado}>Adicionar refeição</Text>
        </Pressable>

        <View style={styles.totais}>
          <TotaisPlano totais={totais} />
        </View>

        {!!erro && <Text style={styles.erro}>{erro}</Text>}
      </ScrollView>

      <View style={[styles.rodape, { paddingBottom: Math.max(bottom, 16) }]}>
        <Pressable
          onPress={salvar}
          /* Desligado até algo mudar de verdade: um botão de salvar sempre
             aceso convida a gravar por engano o que já estava gravado. */
          disabled={!mudou || salvando}
          style={({ pressed }) => [
            styles.botao,
            pressed && styles.botaoPressionado,
            (!mudou || salvando) && styles.botaoDesativado,
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !mudou || salvando }}
        >
          {salvando ? (
            <ActivityIndicator color={cores.branco} />
          ) : (
            <Text style={styles.textoBotao}>{mudou ? 'Salvar' : 'Nada para salvar'}</Text>
          )}
        </Pressable>
      </View>

      {/* Menu do item. View sobreposta, e não Modal, pelo mesmo motivo do resto
          do app — Modal empilhado no iOS dá problema com o teclado. */}
      {acoesDe && (
        <View style={StyleSheet.absoluteFill}>
          <Pressable style={styles.fundoMenu} onPress={() => setAcoesDe(null)} />
          <View style={[styles.menu, { paddingBottom: Math.max(bottom, 16) }]}>
            <View style={styles.puxador} />
            <Text style={styles.nomeMenu} numberOfLines={2}>
              {acoesDe.item.nome}
            </Text>
            <Text style={styles.detalheMenu}>{detalheDoItem(acoesDe.item)}</Text>

            <AcaoMenu
              icone="swap-horizontal-outline"
              rotulo="Substituir alimento"
              descricao="Troca este alimento por outro, mantendo as variações."
              onPress={() => {
                const alvo = acoesDe
                setAcoesDe(null)
                setBusca({
                  refeicao: alvo.refeicao,
                  item: alvo.item.chave,
                  motivo: 'substituir',
                  titulo: `Substituir ${alvo.item.nome}`,
                })
              }}
            />
            <AcaoMenu
              icone="git-branch-outline"
              rotulo="Adicionar variação"
              descricao="Uma alternativa a este alimento — você escolhe uma das duas na hora."
              onPress={() => {
                const alvo = acoesDe
                setAcoesDe(null)
                setBusca({
                  refeicao: alvo.refeicao,
                  item: alvo.item.chave,
                  motivo: 'variacao',
                  titulo: `Variação de ${alvo.item.nome}`,
                })
              }}
            />
            <AcaoMenu
              icone="trash-outline"
              rotulo="Remover do plano"
              perigo
              onPress={() => {
                const alvo = acoesDe
                setAcoesDe(null)
                mexerNosItens(alvo.refeicao, itens =>
                  itens.filter(i => i.chave !== alvo.item.chave),
                )
              }}
            />
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  )
}

function BlocoRefeicao({
  refeicao,
  desativado,
  onRotulo,
  onHora,
  onRemover,
  onAdicionar,
  onAcoes,
  onRemoverVariacao,
}: {
  refeicao: RefeicaoMontada
  desativado: boolean
  onRotulo: (t: string) => void
  onHora: (h: string) => void
  onRemover: () => void
  onAdicionar: () => void
  onAcoes: (item: ItemAlimento) => void
  onRemoverVariacao: (item: string, variacao: string) => void
}) {
  const t = totaisDe(refeicao.itens)

  return (
    <View style={styles.bloco}>
      <View style={styles.cabecalhoRefeicao}>
        <TextInput
          value={refeicao.rotulo}
          onChangeText={onRotulo}
          placeholder="Nome da refeição"
          placeholderTextColor={inkFraco}
          keyboardAppearance="dark"
          maxLength={40}
          editable={!desativado}
          style={styles.campoRotulo}
          accessibilityLabel="Nome da refeição"
        />
        <TextInput
          value={refeicao.hora}
          onChangeText={onHora}
          placeholder="00:00"
          placeholderTextColor={inkFraco}
          keyboardAppearance="dark"
          keyboardType="number-pad"
          maxLength={5}
          editable={!desativado}
          style={styles.campoHora}
          accessibilityLabel={`Horário de ${refeicao.rotulo || 'refeição'}`}
        />
        <Pressable
          onPress={onRemover}
          disabled={desativado}
          hitSlop={6}
          style={styles.botaoRemoverRefeicao}
          accessibilityRole="button"
          accessibilityLabel={`Remover ${refeicao.rotulo || 'refeição'}`}
        >
          <Ionicons name="trash-outline" size={17} color={inkFraco} />
        </Pressable>
      </View>

      {t.calorias !== null && (
        <Text style={styles.kcalRefeicao}>{milhar(t.calorias)} kcal</Text>
      )}

      {refeicao.itens.map(item => (
        <View key={item.chave} style={styles.item}>
          <Pressable
            onPress={() => onAcoes(item)}
            disabled={desativado}
            style={styles.linhaItem}
            accessibilityRole="button"
            accessibilityLabel={`Opções de ${item.nome}`}
          >
            <View style={styles.textoItem}>
              <Text style={styles.nomeItem} numberOfLines={2}>
                {item.nome}
              </Text>
              <Text style={styles.detalheItem}>{detalheDoItem(item)}</Text>
            </View>
            <Ionicons name="ellipsis-vertical" size={16} color={inkFraco} />
          </Pressable>

          {/* As variações ficam presas ao alimento, recuadas: são o "ou" dele,
              não mais um item da refeição. */}
          {item.variacoes.map(v => (
            <View key={v.chave} style={styles.variacao}>
              <Text style={styles.ou}>ou</Text>
              <View style={styles.textoItem}>
                <Text style={styles.nomeVariacao} numberOfLines={2}>
                  {v.nome}
                </Text>
                <Text style={styles.detalheItem}>{detalheDoItem(v)}</Text>
              </View>
              <Pressable
                onPress={() => onRemoverVariacao(item.chave, v.chave)}
                disabled={desativado}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Remover variação ${v.nome}`}
              >
                <Ionicons name="close" size={15} color={inkFraco} />
              </Pressable>
            </View>
          ))}
        </View>
      ))}

      <Pressable
        onPress={onAdicionar}
        disabled={desativado}
        style={({ pressed }) => [styles.botaoTracejado, pressed && styles.tracejadoPressionado]}
        accessibilityRole="button"
      >
        <Ionicons name="add" size={17} color={cores.verde} />
        <Text style={styles.textoTracejado}>Adicionar alimentos</Text>
      </Pressable>
    </View>
  )
}

function AcaoMenu({
  icone,
  rotulo,
  descricao,
  perigo = false,
  onPress,
}: {
  icone: keyof typeof Ionicons.glyphMap
  rotulo: string
  descricao?: string
  perigo?: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.acao, pressed && styles.acaoPressionada]}
      accessibilityRole="button"
    >
      <View style={[styles.iconeAcao, perigo && styles.iconeAcaoPerigo]}>
        <Ionicons name={icone} size={19} color={perigo ? cores.erroTexto : cores.verde} />
      </View>
      <View style={styles.textoAcao}>
        <Text style={[styles.rotuloAcao, perigo && styles.rotuloAcaoPerigo]}>{rotulo}</Text>
        {!!descricao && <Text style={styles.descricaoAcao}>{descricao}</Text>}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },

  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  botaoVoltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  tituloTela: { flexShrink: 1, fontSize: 17, fontWeight: '800', color: cores.ink },

  conteudo: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24, gap: 12 },
  secao: { marginTop: 6, fontSize: 13, fontWeight: '800', color: inkMedio },

  bloco: {
    gap: 8,
    padding: 14,
    borderRadius: 18,
    backgroundColor: cores.cartao,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  cabecalhoRefeicao: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  campoRotulo: {
    flex: 1,
    height: 44,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
    /* 16px é o mínimo que o iOS aceita sem dar zoom automático no campo. */
    fontSize: 16,
    fontWeight: '700',
    color: cores.ink,
  },
  campoHora: {
    width: 72,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: cores.ink,
  },
  botaoRemoverRefeicao: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  kcalRefeicao: { fontSize: 12, fontWeight: '700', color: inkMedio },

  item: { gap: 6 },
  linhaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  textoItem: { flex: 1 },
  nomeItem: { fontSize: 14, fontWeight: '600', color: cores.ink, lineHeight: 19 },
  detalheItem: { marginTop: 2, fontSize: 11.5, color: inkSuave },

  variacao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 16,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: cores.verdeMenta,
  },
  ou: { fontSize: 11, fontWeight: '800', color: cores.verdeEscuro },
  nomeVariacao: { fontSize: 13, fontWeight: '600', color: cores.ink, lineHeight: 18 },

  botaoTracejado: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: cores.verdeClaro,
  },
  tracejadoPressionado: { backgroundColor: cores.verdeMenta },
  textoTracejado: { fontSize: 14, fontWeight: '700', color: cores.verde },

  totais: { marginTop: 6 },
  erro: { fontSize: 13, color: cores.erroTexto, textAlign: 'center' },

  rodape: { paddingHorizontal: 20, paddingTop: 10 },
  botao: {
    height: 54,
    borderRadius: 16,
    backgroundColor: cores.verde,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoPressionado: { backgroundColor: cores.verdeEscuro },
  botaoDesativado: { opacity: 0.45 },
  textoBotao: { fontSize: 15.5, fontWeight: '700', color: cores.branco },

  fundoMenu: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.62)' },
  menu: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    paddingHorizontal: 20,
    backgroundColor: cores.fundo,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  puxador: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: cores.trilho,
    marginBottom: 14,
  },
  nomeMenu: { fontSize: 17, fontWeight: '800', color: cores.ink, lineHeight: 23 },
  detalheMenu: { marginTop: 2, marginBottom: 10, fontSize: 12.5, color: inkSuave },

  acao: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  acaoPressionada: { opacity: 0.6 },
  iconeAcao: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: cores.verdeClaro,
  },
  iconeAcaoPerigo: { backgroundColor: cores.erroFundo },
  textoAcao: { flex: 1 },
  rotuloAcao: { fontSize: 15, fontWeight: '700', color: cores.ink },
  rotuloAcaoPerigo: { color: cores.erroTexto },
  descricaoAcao: { marginTop: 2, fontSize: 12, lineHeight: 17, color: inkSuave },
})
