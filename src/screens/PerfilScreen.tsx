import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { removerAvatar, trocarAvatar, urlDoAvatar } from '../lib/avatar'
import { mascaraCPF, mascaraTelefone } from '../lib/formulario'
import {
  NOME_DO_OBJETIVO,
  carregarObjetivoPeso,
  salvarObjetivoPeso,
  type ObjetivoPeso,
} from '../lib/metas'
import { estilosDe, paleta } from '../lib/tema'

type Conta = {
  nome_completo: string
  username: string
  cpf: string
  telefone: string
  genero: string
  data_nascimento: string
  avatar_path: string | null
}

const GENEROS: Record<string, string> = {
  feminino: 'Feminino',
  masculino: 'Masculino',
  outro: 'Outro',
}

/* '1990-04-27' → '27/04/1990'. O banco guarda em ISO; a tela mostra como se lê
   em português. */
const dataBR = (iso: string) => iso.split('-').reverse().join('/')

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

/* Tela cheia comum, NÃO um Modal.
 *
 * No iOS, abrir a câmera de dentro de um Modal do React Native faz o picker
 * tentar se apresentar por cima de um controlador que já está apresentando: a
 * promise nunca resolve, sem erro nenhum, e a tela fica carregando para sempre.
 * Por isso esta tela é uma View sobreposta lá no App, e a folha de opções
 * abaixo é um overlay — nenhum Modal no caminho da foto. */
export function PerfilScreen({
  sessao,
  onFechar,
  onObjetivoMudou,
}: {
  sessao: Session
  onFechar: () => void
  /* O foco do peso muda o que a tela inicial e a de Peso escrevem, então elas
     precisam reler quando ele muda aqui. */
  onObjetivoMudou: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const [conta, setConta] = useState<Conta | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [opcoesAbertas, setOpcoesAbertas] = useState(false)
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  const [erroFoto, setErroFoto] = useState('')
  /* Qual endereço de foto não carregou — mesmo cuidado do AvatarNutri, e pela
     mesma razão: ter caminho gravado não é ter imagem que responde. Guardando o
     endereço, e não um sim/não, uma foto nova entra tentando de novo. */
  const [fotoFalhou, setFotoFalhou] = useState<string | null>(null)
  const [urlFoto, setUrlFoto] = useState<string | null>(null)
  const [objetivo, setObjetivo] = useState<ObjetivoPeso>(null)
  const [erroObjetivo, setErroObjetivo] = useState('')

  useEffect(() => {
    let ativo = true

    supabase
      .from('app_contas')
      .select('nome_completo, username, cpf, telefone, genero, data_nascimento, avatar_path')
      .eq('id', sessao.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!ativo) return
        setConta(data as Conta | null)
        setCarregando(false)
      })

    return () => {
      ativo = false
    }
  }, [sessao.user.id])

  /* Efeito à parte, e sem mexer no `carregando`: um campo só não pode segurar a
     foto e o cadastro. Lê da mesma linha de app_contas que o efeito acima, numa
     segunda ida — juntá-los faria o foco ser relido a cada troca de avatar. */
  useEffect(() => {
    let ativo = true

    carregarObjetivoPeso(sessao.user.id).then(r => {
      if (ativo && r.tipo === 'ok') setObjetivo(r.objetivo)
    })

    return () => {
      ativo = false
    }
  }, [sessao.user.id])

  /* O voltar do Android fecha a folha de opções, não a tela.
   *
   * A folha é overlay sobreposto e não `Modal`, então não existe
   * `onRequestClose` para o sistema chamar — o evento passava direto para o App,
   * que fechava o Perfil inteiro com a folha aberta por cima. Ver a armadilha 1
   * do AGENTS.md: registrar no filho, e devolver `false` quando não houver
   * camada nenhuma para descascar. */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (opcoesAbertas) {
        setOpcoesAbertas(false)
        return true
      }
      return false
    })

    return () => sub.remove()
  }, [opcoesAbertas])

  /* O endereço da foto agora é assinado, e assinar é ida ao servidor — então ele
     vira estado em vez de ser calculado no meio do render. Refaz sempre que o
     caminho muda, que é o que acontece ao trocar a foto: caminho novo, endereço
     novo, e a imagem entra sem depender de o cache soltar a anterior. */
  useEffect(() => {
    let ativo = true
    const caminho = conta?.avatar_path ?? null

    if (!caminho) {
      setUrlFoto(null)
      return
    }

    urlDoAvatar(caminho).then(url => {
      if (ativo) setUrlFoto(url)
    })

    return () => {
      ativo = false
    }
  }, [conta?.avatar_path])

  /* Sem botão de salvar: o toque É a gravação.
   *
   * Otimista, como a água e o peso — três opções numa fileira não comportam um
   * "salvar" embaixo sem virar formulário. Falhou, a marca volta para onde
   * estava e o erro aparece. */
  async function escolherObjetivo(novo: ObjetivoPeso) {
    const anterior = objetivo

    setErroObjetivo('')
    setObjetivo(novo)

    const falha = await salvarObjetivoPeso(sessao.user.id, novo)

    if (falha) {
      setObjetivo(anterior)
      setErroObjetivo(falha.erro)
      return
    }

    onObjetivoMudou()
  }

  const nome = conta?.nome_completo ?? sessao.user.email?.split('@')[0] ?? ''

  async function escolherFoto(origem: 'galeria' | 'camera') {
    setOpcoesAbertas(false)
    setErroFoto('')
    setEnviandoFoto(true)

    const r = await trocarAvatar(origem, sessao.user.id, conta?.avatar_path ?? null)

    if (r.tipo === 'ok') setConta(c => (c ? { ...c, avatar_path: r.path } : c))
    else if (r.tipo === 'erro') setErroFoto(r.mensagem)

    setEnviandoFoto(false)
  }

  async function apagarFoto() {
    setOpcoesAbertas(false)
    if (!conta?.avatar_path) return
    setErroFoto('')
    setEnviandoFoto(true)

    const r = await removerAvatar(sessao.user.id, conta.avatar_path)
    if (r.tipo === 'ok') setConta(c => (c ? { ...c, avatar_path: null } : c))
    else if (r.tipo === 'erro') setErroFoto(r.mensagem)

    setEnviandoFoto(false)
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
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela}>Meu perfil</Text>
        {/* Espaço da mesma largura do botão para o título ficar centralizado
            sem cálculo. */}
        <View style={styles.botaoVoltar} />
      </View>

      {carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator color={paleta().cores.verde} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.conteudo}
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
        >
          <View style={styles.identidade}>
            <Pressable
              onPress={() => setOpcoesAbertas(true)}
              disabled={enviandoFoto || !conta}
              style={styles.avatarToque}
              accessibilityRole="button"
              accessibilityLabel={urlFoto ? 'Trocar foto de perfil' : 'Adicionar foto de perfil'}
            >
              <View style={styles.avatar}>
                {urlFoto && urlFoto !== fotoFalhou ? (
                  <Image
                    source={{ uri: urlFoto }}
                    style={styles.foto}
                    onError={() => setFotoFalhou(urlFoto)}
                  />
                ) : (
                  <Text style={styles.textoAvatar}>{iniciais(nome)}</Text>
                )}

                {enviandoFoto && (
                  <View style={styles.veuAvatar}>
                    <ActivityIndicator color={paleta().cores.branco} />
                  </View>
                )}
              </View>

              <View style={styles.selinhoCamera}>
                <Ionicons name="camera" size={14} color={paleta().cores.branco} />
              </View>
            </Pressable>

            <Text style={styles.nome}>{nome}</Text>
            {!!conta?.username && <Text style={styles.username}>@{conta.username}</Text>}

            {!!erroFoto && <Text style={styles.erroFoto}>{erroFoto}</Text>}
          </View>

          {conta ? (
            <View style={styles.cartao}>
              <Linha rotulo="E-mail" valor={sessao.user.email ?? '—'} />
              <Linha rotulo="Telefone" valor={mascaraTelefone(conta.telefone)} />
              <Linha rotulo="CPF" valor={mascaraCPF(conta.cpf)} />
              <Linha rotulo="Nascimento" valor={dataBR(conta.data_nascimento)} />
              <Linha rotulo="Gênero" valor={GENEROS[conta.genero] ?? conta.genero} ultima />
            </View>
          ) : (
            /* Conta criada direto no painel do Supabase não tem linha em
               app_contas. Dizer isso é melhor que mostrar campos vazios — e
               sem essa linha não há onde gravar o caminho da foto. */
            <View style={styles.cartao}>
              <View style={styles.semCadastro}>
                <Text style={styles.textoSemCadastro}>
                  Esta conta não tem cadastro completo — ela foi criada fora do app, então não dá
                  para guardar foto de perfil.
                </Text>
              </View>
            </View>
          )}

          {/* Depois do cadastro e antes do sair: é a única coisa editável desta
              tela, e ficaria escondida abaixo de um botão vermelho de saída. */}
          <View style={styles.blocoObjetivo}>
            <Text style={styles.tituloObjetivo}>Foco do peso</Text>
            <Text style={styles.ajudaObjetivo}>
              Para onde você quer que seu peso vá. É o que deixa o app dizer se a sua evolução está
              indo no sentido que você quer — e não só quanto ela mudou.
            </Text>

            <View style={styles.opcoesObjetivo}>
              {(['perda', 'manter', 'ganho'] as const).map(chave => (
                <Pressable
                  key={chave}
                  /* Tocar no que já está marcado desmarca. A dica embaixo diz
                     isso por escrito — sem ela seria um gesto escondido, e quem
                     marcou sem querer ficaria preso à escolha. */
                  onPress={() => escolherObjetivo(objetivo === chave ? null : chave)}
                  style={({ pressed }) => [
                    styles.opcaoObjetivo,
                    objetivo === chave && styles.opcaoObjetivoAtiva,
                    pressed && styles.opcaoObjetivoPressionada,
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: objetivo === chave }}
                  accessibilityLabel={NOME_DO_OBJETIVO[chave]}
                >
                  <Ionicons
                    name={
                      chave === 'perda' ? 'trending-down' : chave === 'ganho' ? 'trending-up' : 'remove'
                    }
                    size={19}
                    color={objetivo === chave ? paleta().cores.branco : paleta().cores.verde}
                  />
                  <Text
                    style={[
                      styles.textoOpcaoObjetivo,
                      objetivo === chave && styles.textoOpcaoObjetivoAtiva,
                    ]}
                  >
                    {chave === 'perda' ? 'Perder' : chave === 'ganho' ? 'Ganhar' : 'Manter'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {erroObjetivo ? (
              <Text style={styles.erroObjetivo}>{erroObjetivo}</Text>
            ) : (
              <Text style={styles.dicaObjetivo}>
                {objetivo
                  ? 'Toque de novo na opção marcada para desmarcar.'
                  : 'Sem foco definido, o app mostra só a variação — sem dizer se ela é a desejada.'}
              </Text>
            )}
          </View>

          <Pressable
            onPress={() => {
              onFechar()
              supabase.auth.signOut()
            }}
            style={({ pressed }) => [styles.botaoSair, pressed && styles.botaoSairPressionado]}
            accessibilityRole="button"
          >
            <Ionicons name="log-out-outline" size={18} color={paleta().cores.erroTexto} />
            <Text style={styles.textoBotaoSair}>Sair da conta</Text>
          </Pressable>
        </ScrollView>
      )}

      {/* Folha de opções: overlay sobreposto, não Modal — ver o comentário do
          componente. Como não há apresentação nativa envolvida, o picker pode
          abrir no mesmo toque, sem espera artificial. */}
      {opcoesAbertas && (
        <View style={StyleSheet.absoluteFill}>
          <Pressable style={styles.fundoFolha} onPress={() => setOpcoesAbertas(false)} />
          <View style={[styles.folha, { paddingBottom: Math.max(bottom, 16) }]}>
            <View style={styles.puxador} />

            <OpcaoFolha
              icone="camera-outline"
              rotulo="Tirar foto"
              onPress={() => escolherFoto('camera')}
            />
            <OpcaoFolha
              icone="images-outline"
              rotulo="Escolher da galeria"
              onPress={() => escolherFoto('galeria')}
            />
            {!!conta?.avatar_path && (
              <OpcaoFolha icone="trash-outline" rotulo="Remover foto" perigo onPress={apagarFoto} />
            )}
          </View>
        </View>
      )}
    </View>
  )
}

function OpcaoFolha({
  icone,
  rotulo,
  perigo,
  onPress,
}: {
  icone: keyof typeof Ionicons.glyphMap
  rotulo: string
  perigo?: boolean
  onPress: () => void
}) {
  const styles = estilos()
  const cor = perigo ? paleta().cores.erroTexto : paleta().cores.ink
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.opcao, pressed && styles.opcaoPressionada]}
      accessibilityRole="button"
    >
      <Ionicons name={icone} size={19} color={cor} />
      <Text style={[styles.rotuloOpcao, { color: cor }]}>{rotulo}</Text>
    </Pressable>
  )
}

function Linha({ rotulo, valor, ultima }: { rotulo: string; valor: string; ultima?: boolean }) {
  const styles = estilos()
  return (
    <View style={[styles.linha, !ultima && styles.linhaComDivisor]}>
      <Text style={styles.rotuloLinha}>{rotulo}</Text>
      <Text style={styles.valorLinha} numberOfLines={1}>
        {valor}
      </Text>
    </View>
  )
}

const TAMANHO_AVATAR = 96

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

  identidade: { alignItems: 'center', gap: 6, marginTop: 12, marginBottom: 22 },
  avatarToque: { marginBottom: 8 },
  avatar: {
    width: TAMANHO_AVATAR,
    height: TAMANHO_AVATAR,
    borderRadius: TAMANHO_AVATAR / 2,
    backgroundColor: t.cores.verdeClaro,
    alignItems: 'center',
    justifyContent: 'center',
    /* Recorta a foto no círculo em vez de confiar no borderRadius da Image,
       que o Android não arredonda direito. */
    overflow: 'hidden',
  },
  foto: { width: '100%', height: '100%' },
  textoAvatar: { fontSize: 32, fontWeight: '800', color: t.cores.verdeEscuro },
  veuAvatar: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.70)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selinhoCamera: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: 14,
    backgroundColor: t.cores.verde,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: t.cores.fundo,
  },
  nome: { fontSize: 20, fontWeight: '800', color: t.cores.ink, textAlign: 'center' },
  username: { fontSize: 13.5, color: t.inkFraco },
  erroFoto: {
    marginTop: 8,
    fontSize: 12.5,
    lineHeight: 18,
    color: t.cores.erroTexto,
    textAlign: 'center',
  },

  cartao: { borderRadius: 20, backgroundColor: t.cores.cartao, paddingHorizontal: 16 },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 14,
  },
  linhaComDivisor: { borderBottomWidth: 1, borderBottomColor: t.cores.borda },
  rotuloLinha: { fontSize: 13.5, color: t.inkSuave },
  valorLinha: { flexShrink: 1, fontSize: 14, fontWeight: '600', color: t.inkMedio },

  blocoObjetivo: {
    marginTop: 14,
    padding: 16,
    borderRadius: 20,
    backgroundColor: t.cores.cartao,
    gap: 10,
  },
  tituloObjetivo: { fontSize: 15, fontWeight: '800', color: t.cores.ink },
  ajudaObjetivo: { fontSize: 12.5, lineHeight: 18, color: t.inkSuave },
  opcoesObjetivo: { flexDirection: 'row', gap: 8 },
  opcaoObjetivo: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: t.cores.superficie,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  /* Preenchido de verde quando marcado, e não só com a borda: numa fileira de
     três a diferença tem de ser visível de relance, e uma borda de um pixel não
     é. */
  opcaoObjetivoAtiva: { backgroundColor: t.cores.verde, borderColor: t.cores.verde },
  opcaoObjetivoPressionada: { backgroundColor: t.cores.verdeClaro, borderColor: t.cores.verdeClaro },
  textoOpcaoObjetivo: { fontSize: 13, fontWeight: '700', color: t.cores.ink },
  textoOpcaoObjetivoAtiva: { color: t.cores.branco },
  dicaObjetivo: { fontSize: 11.5, lineHeight: 16, color: t.inkFraco },
  erroObjetivo: { fontSize: 11.5, lineHeight: 16, color: t.cores.erroTexto },

  semCadastro: { paddingVertical: 18 },
  textoSemCadastro: { fontSize: 13.5, lineHeight: 20, color: t.inkSuave, textAlign: 'center' },

  botaoSair: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.cores.erroBorda,
    backgroundColor: t.cores.erroFundo,
  },
  botaoSairPressionado: { opacity: 0.75 },
  textoBotaoSair: { fontSize: 15, fontWeight: '700', color: t.cores.erroTexto },

  fundoFolha: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.62)' },
  folha: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: t.cores.fundo,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 12,
  },
  puxador: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 4,
    backgroundColor: t.cores.trilho,
    marginBottom: 10,
  },
  opcao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 16,
    borderRadius: 14,
  },
  opcaoPressionada: { backgroundColor: t.cores.cartao },
  rotuloOpcao: { fontSize: 15.5, fontWeight: '600' },
  }),
)
