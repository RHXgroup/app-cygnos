import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { removerAvatar, trocarAvatar, urlDoAvatar } from '../lib/avatar'
import {
  mascaraCPF,
  mascaraData,
  mascaraTelefone,
  soDigitos,
  validarNascimento,
  validarNome,
  validarTelefone,
} from '../lib/formulario'
import {
  NOME_DO_OBJETIVO,
  carregarObjetivoPeso,
  avisarObjetivoMudou,
  salvarObjetivoPeso,
  type ObjetivoPeso,
} from '../lib/metas'
import { estilosDe, paleta } from '../lib/tema'
import { OBJETIVOS, objetivoDe } from '../lib/objetivos'
import { falha } from '../lib/erros'
import { useDesvioDoTeclado } from '../lib/teclado'
import { ASuaNutri, a, suaNutri } from '../lib/tratamentoDaNutri'

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

  /* ── A EDIÇÃO DO CADASTRO ────────────────────────────────────────────────
   *
   * A tela tinha cara de perfil editável e não era: nome, telefone, CPF,
   * nascimento e gênero eram TEXTO. Relatado assim — "tem a opção de editar o
   * perfil, não consigo mudar" —, e quem lê a tela chega à mesma conclusão.
   *
   * Editáveis: nome e telefone. Os dois mudam na vida real (casamento, erro de
   * digitação, troca de número) e nenhum entra em conta nenhuma.
   *
   * NÃO editáveis, de propósito:
   *   · CPF e usuário são identidade — mudar aqui é outro assunto, com outra
   *     conferência;
   *   · nascimento e gênero entram no CÁLCULO ENERGÉTICO. Trocá-los em silêncio
   *     mudaria o gasto basal e as metas que a nutricionista prescreveu, sem
   *     ninguém do outro lado saber. Quem corrige isso é ela;
   *   · altura já é editada no Cálculo Energético. Um segundo lugar para o mesmo
   *     campo é a armadilha 5 do AGENTS.md esperando acontecer.
   *
   * O `desvio` existe porque no Expo Go a janela NÃO encolhe com o teclado
   * aberto, e o telefone é o último campo — ver a armadilha 2. */
  const [editando, setEditando] = useState(false)
  const [nomeEditado, setNomeEditado] = useState('')
  const [telefoneEditado, setTelefoneEditado] = useState('')
  /* ── NASCIMENTO E GENERO DESTRAVARAM ────────────────────────────────────
   *
   * Eu os tinha travado, com o motivo escrito na tela: "entram no calculo das
   * suas metas; quem corrige esses e a sua nutricionista". Ele discordou, e tem
   * razao: "acho errado nao deixar trocar o sexo".
   *
   * O motivo era bom e a conclusao era errada. Entrar num calculo pede AVISO,
   * nao cadeado -- e nascimento e genero sao dados da PESSOA, nao da
   * nutricionista. Quem digitou errado no cadastro ficava preso a um erro
   * proprio, com o app dizendo que a culpa era de outra pessoa.
   *
   * O que continua travado, e agora e a lista inteira: CPF e e-mail. CPF e
   * identidade; e-mail e CREDENCIAL DE ENTRADA -- troca-lo exige confirmacao
   * nos dois enderecos, senao quem pegar o telefone destravado toma a conta.
   * Fluxo proprio, alteracao a parte. */
  const [nascimentoEditado, setNascimentoEditado] = useState('')
  const [generoEditado, setGeneroEditado] = useState('')
  /* O objetivo agora entra no FORMULÁRIO, e não mais no toque.
   *
   * Ele gravava a cada toque, e junto com o salvamento ia uma mensagem para a
   * nutricionista. Quem descia a lista dos onze experimentando mandava onze
   * mensagens para uma profissional de saúde. Relatado assim: "toda hora que
   * clico em um objetivo diferente ele manda mensagem pra minha nutri".
   *
   * O que estava errado não era avisar — ela precisa mesmo saber, senão
   * prescreve déficit para quem passou a cuidar do colesterol. Era avisar
   * por um gesto de ESCOLHA em vez de um gesto de DECISÃO.
   *
   * `undefined` quer dizer "não mexi": é o que separa "escolhi o mesmo de
   * novo" de "nem toquei", e é por isso que não dá para usar `null`, que
   * aqui já significa "sem objetivo". */
  const [objetivoEditado, setObjetivoEditado] = useState<ObjetivoPeso | undefined>(undefined)
  const [salvando, setSalvando] = useState(false)
  const [erroEdicao, setErroEdicao] = useState('')
  const desvio = useDesvioDoTeclado(bottom)

  function comecarAEditar() {
    if (!conta) return
    setNomeEditado(conta.nome_completo)
    setTelefoneEditado(mascaraTelefone(conta.telefone))
    /* ISO no banco, dd/mm/aaaa na tela. */
    setNascimentoEditado(dataBR(conta.data_nascimento))
    setGeneroEditado(conta.genero)
    setObjetivoEditado(objetivo)
    setErroEdicao('')
    setEditando(true)
  }

  async function salvarCadastro() {
    if (salvando) return

    /* Valida antes de ir ao servidor: o banco aceitaria nome vazio, e um perfil
       sem nome quebra as iniciais do avatar e a saudação da tela inicial. */
    const nome = nomeEditado.trim()
    const erroNome = validarNome(nome)
    if (erroNome) return setErroEdicao(erroNome)

    const telefone = soDigitos(telefoneEditado)
    const erroTelefone = validarTelefone(telefone)
    if (erroTelefone) return setErroEdicao(erroTelefone)

    /* `validarNascimento` devolve o ISO ou o erro -- ela pega 31/02 e afins,
       que o `Date` corrige em silencio para 03/03. */
    const nasc = validarNascimento(nascimentoEditado)
    if ('erro' in nasc) return setErroEdicao(nasc.erro)
    if (!GENEROS[generoEditado]) return setErroEdicao('Escolha o gênero.')

    setSalvando(true)
    setErroEdicao('')
    const { error } = await supabase
      .from('app_contas')
      .update({
        nome_completo: nome,
        telefone,
        data_nascimento: nasc.iso,
        genero: generoEditado,
      })
      .eq('id', sessao.user.id)
    setSalvando(false)

    if (error) {
      setErroEdicao(
        falha('Não consegui salvar as suas alterações agora. Verifique a conexão.', error),
      )
      return
    }

    /* Escreve no estado local em vez de reler: a linha é a mesma que acabou de
       ser gravada, e uma segunda ida ao servidor só adicionaria uma espera e
       uma chance de falhar depois do sucesso. */
    setConta(c =>
      c
        ? { ...c, nome_completo: nome, telefone, data_nascimento: nasc.iso, genero: generoEditado }
        : c,
    )
/* ── O OBJETIVO, uma vez só, e só se mudou ──────────────
     *
     * Depois do cadastro ter ido, e não junto: são duas gravações
     * diferentes, e falhar a segunda não pode desfazer a primeira.
     *
     * `!== objetivo` é o que impede a mensagem de sair quando ela abriu a
     * edição, mexeu no telefone e nem tocou na lista — e também
     * quando experimentou três e voltou para o que já estava. Neste caso o
     * app não tem o que contar: nada mudou. */
    if (objetivoEditado !== undefined && objetivoEditado !== objetivo) {
      const falhouObjetivo = await salvarObjetivoPeso(sessao.user.id, objetivoEditado)
      if (falhouObjetivo) {
        setErroObjetivo(falhouObjetivo.erro)
      } else {
        setObjetivo(objetivoEditado)
        /* Sem `await`: a nutricionista saber é importante, e mesmo assim não
           é motivo para segurar a tela. A função nunca rejeita. */
        void avisarObjetivoMudou(objetivoEditado)
      }
    }

    /* As metas partem da idade, do genero e do objetivo. Sem avisar, a tela
       inicial ficaria com o gasto basal antigo ate alguem fechar o app. */
    onObjetivoMudou()
    setObjetivoEditado(undefined)
    setEditando(false)
  }

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
      /* A edição é um degrau, e o voltar descasca ele antes de fechar a tela.
         Sem isto, quem estivesse editando perdia o que digitou e ainda saía do
         perfil de uma vez — dois passos num toque só. */
      if (editando) {
        sairDaEdicao()
        return true
      }
      return false
    })

    return () => sub.remove()
  }, [opcoesAbertas, editando])

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

/* Enquanto edita, o toque só RISCA no rascunho.
   *
   * O comentário antigo aqui dizia "sem botão de salvar: o toque É a
   * gravação", e defendia isso comparando com a água e o peso. A
   * comparação não valia: copo de água não avisa ninguém, e este
   * toque mandava mensagem para uma profissional de saúde.
   *
   * Fora do modo de edição a lista é só leitura — ver o `disabled`
   * lá embaixo. */
/* Sair da edição joga o rascunho fora, o do objetivo junto.
   *
   * Sem isto, quem experimentasse um objetivo, desistisse pelo Cancelar, e
   * mais tarde abrisse a edição de novo para trocar o telefone salvaria
   * junto a escolha abandonada — e mandaria a mensagem dela. */
  function sairDaEdicao() {
    setObjetivoEditado(undefined)
    setErroObjetivo('')
    setErroEdicao('')
    setEditando(false)
  }

  function riscarObjetivo(novo: ObjetivoPeso) {
    setErroObjetivo('')
    setObjetivoEditado(novo)
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
          /* O respiro do teclado vai no CONTEÚDO, e não como deslocamento da
             tela inteira: aqui a caixa de escrever não é fixa embaixo, é a
             última linha de uma lista que rola. Sobrando altura equivalente ao
             teclado, a rolagem alcança o campo — que é o que resolve.

             `teclado + área segura`, e as duas SOMAM: `endCoordinates.height`
             não inclui a barra de navegação que fica por baixo. Ver a armadilha
             2 do AGENTS.md, que custou seis tentativas noutra tela. */
          contentContainerStyle={[styles.conteudo, desvio > 0 && { paddingBottom: desvio + 24 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
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
              {/* O cabeçalho do cartão existe para o botão ter onde morar. Sem
                  ele, "Editar" viraria mais uma linha da lista e se leria como
                  um dado, e não como uma ação. */}
              <View style={styles.cabecalhoCartao}>
                <Text style={styles.tituloCartao}>Meus dados</Text>
                {!editando && (
                  <Pressable
                    onPress={comecarAEditar}
                    style={({ pressed }) => [styles.botaoEditar, pressed && styles.botaoEditarPress]}
                    accessibilityRole="button"
                    accessibilityLabel="Editar os meus dados"
                  >
                    <Ionicons name="pencil" size={13} color={paleta().cores.verde} />
                    <Text style={styles.textoEditar}>Editar</Text>
                  </Pressable>
                )}
              </View>

              {editando ? (
                <>
                  <Campo
                    rotulo="Nome completo"
                    valor={nomeEditado}
                    aoMudar={setNomeEditado}
                    styles={styles}
                    autoCapitalize="words"
                  />
                  <Campo
                    rotulo="Telefone"
                    valor={telefoneEditado}
                    /* A máscara na digitação, e `soDigitos` na hora de salvar:
                       o banco guarda só número, e a pessoa lê com parênteses. */
                    aoMudar={t => setTelefoneEditado(mascaraTelefone(soDigitos(t)))}
                    styles={styles}
                    teclado="phone-pad"
                  />
                  <Campo
                    rotulo="Nascimento"
                    valor={nascimentoEditado}
                    /* Máscara na digitação e teclado sem separador: campo de
                       data com vírgula à mão convida a digitar o que ele
                       descarta (armadilha 3). */
                    aoMudar={t => setNascimentoEditado(mascaraData(t))}
                    styles={styles}
                    teclado="phone-pad"
                  />

                  {/* Três opções cabem numa fileira. Lista vertical para três
                      gastaria meia tela dentro de um cartão de seis linhas. */}
                  <View style={[styles.linha, styles.linhaComDivisor]}>
                    <Text style={styles.rotuloLinha}>Gênero</Text>
                    <View style={styles.opcoesGenero}>
                      {Object.entries(GENEROS).map(([chave, rotulo]) => (
                        <Pressable
                          key={chave}
                          onPress={() => setGeneroEditado(chave)}
                          style={({ pressed }) => [
                            styles.opcaoGenero,
                            generoEditado === chave && styles.opcaoGeneroAtiva,
                            pressed && { opacity: 0.7 },
                          ]}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: generoEditado === chave }}
                          accessibilityLabel={rotulo}
                        >
                          <Text
                            style={[
                              styles.textoOpcaoGenero,
                              generoEditado === chave && styles.textoOpcaoGeneroAtiva,
                            ]}
                          >
                            {rotulo}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </>
              ) : (
                <>
                  <Linha rotulo="Nome" valor={conta.nome_completo} />
                  <Linha rotulo="Telefone" valor={mascaraTelefone(conta.telefone)} />
                  <Linha rotulo="Nascimento" valor={dataBR(conta.data_nascimento)} />
                  <Linha rotulo="Gênero" valor={GENEROS[conta.genero] ?? conta.genero} />
                </>
              )}

              {/* Os dois que NÃO mudam por esta tela, e agora são só dois.
                  CPF é identidade; e-mail é credencial de entrada — trocá-lo
                  exige confirmação nos dois endereços, senão quem pegar o
                  telefone destravado toma a conta. */}
              <Linha rotulo="E-mail" valor={sessao.user.email ?? '—'} travada={editando} />
              <Linha rotulo="CPF" valor={mascaraCPF(conta.cpf)} travada={editando} ultima />

              {editando && (
                <View style={styles.acoesEdicao}>
                  {/* Diz POR QUE os outros não mudam, em vez de deixar a pessoa
                      procurar o campo que não existe. Sem esta linha, "não
                      consigo mudar o CPF" vira o próximo relato. */}
                  {/* Diz o que ACONTECE ao salvar, e não o que é proibido.
                      A versão anterior travava nascimento e gênero dizendo que
                      quem os corrige é a nutricionista — motivo bom, conclusão
                      errada: são dados da pessoa, e entrar num cálculo pede
                      aviso, não cadeado. */}
                  <Text style={styles.avisoEdicao}>
                    Nascimento e gênero entram no cálculo das suas metas: mudar aqui muda o seu gasto
                    calórico. CPF e e-mail não mudam por esta tela.
                  </Text>

                  {!!erroEdicao && <Text style={styles.erroEdicao}>{erroEdicao}</Text>}

                  <View style={styles.botoesEdicao}>
                    <Pressable
                      onPress={sairDaEdicao}
                      disabled={salvando}
                      style={({ pressed }) => [styles.botaoCancelar, pressed && { opacity: 0.7 }]}
                      accessibilityRole="button"
                    >
                      <Text style={styles.textoCancelar}>Cancelar</Text>
                    </Pressable>
                    <Pressable
                      onPress={salvarCadastro}
                      disabled={salvando}
                      style={({ pressed }) => [
                        styles.botaoSalvar,
                        (pressed || salvando) && { opacity: 0.7 },
                      ]}
                      accessibilityRole="button"
                    >
                      {salvando ? (
                        <ActivityIndicator color={paleta().cores.branco} size="small" />
                      ) : (
                        <Text style={styles.textoSalvar}>Salvar</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              )}
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
            {/* ── DE TRÊS PARA SETE, e por que a lista virou vertical ──────
             *
             * Eram três fichas lado a lado — "Perder", "Manter", "Ganhar" —, e
             * o pedido foi bater com o que o sistema oferece. O sistema tem 23,
             * dos quais 16 são PRESCRIÇÃO (gestação, doença renal, bariátrica);
             * o motivo de só sete chegarem aqui está no cabeçalho de
             * `objetivos.ts`.
             *
             * Sete não cabem numa fileira: em tela de celular cada ficha teria
             * cinquenta pontos de largura e o nome sairia cortado. Vertical, e
             * cada um com uma linha explicando — "Trocar gordura por músculo"
             * não se entende só pelo nome, e escolher errado aqui muda o ajuste
             * calórico que a tela de metas vai sugerir. */}
            <Text style={styles.tituloObjetivo}>Seu objetivo</Text>
            <Text style={styles.ajudaObjetivo}>
              O que você quer alcançar. É daqui que sai o ponto de partida das suas metas — e é o que
              deixa o app dizer se a sua evolução está indo no sentido que você quer.
            </Text>

            {/* Uma lista que não responde ao toque e não explica por quê
                se lê como app quebrado. Esta linha é o que separa
                "desligado" de "travado", e ela só existe fora da edição
                — dentro dela a lista funciona e a frase seria ruído. */}
            {!editando && (
              <Text style={styles.ajudaObjetivo}>
                Para trocar, toque em <Text style={styles.negrito}>Editar</Text> lá em cima.
                {' '}{ASuaNutri()} é avisad{a()} quando você salvar.
              </Text>
            )}

            <View style={styles.listaObjetivos}>
              {OBJETIVOS.map(o => {
                /* O rascunho manda enquanto ele existe: é o que a pessoa
                   acabou de tocar, e ainda não foi salvo. */
                const escolhido = objetivoEditado !== undefined ? objetivoEditado : objetivo
                const marcado = objetivoDe(escolhido)?.chave === o.chave
                return (
                  <Pressable
                    key={o.chave}
                    /* Tocar no que já está marcado desmarca. A dica embaixo diz
                       isso por escrito — sem ela seria um gesto escondido, e
                       quem marcou sem querer ficaria preso à escolha. */
                    onPress={() => riscarObjetivo(marcado ? null : o.chave)}
                    /* Só mexe dentro da edição. Fora dela a lista continua
                       visível — ela diz o que está valendo — mas não
                       responde ao toque, que é o que impedia uma escolha de
                       virar mensagem sem ninguém confirmar nada. */
                    disabled={!editando}
                    style={({ pressed }) => [
                      styles.linhaObjetivo,
                      marcado && styles.linhaObjetivoAtiva,
                      pressed && styles.linhaObjetivoPressionada,
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: marcado }}
                    accessibilityLabel={`${o.nome}. ${o.resumo}`}
                  >
                    <View style={[styles.iconeObjetivo, marcado && styles.iconeObjetivoAtivo]}>
                      <Ionicons
                        name={o.icone as keyof typeof Ionicons.glyphMap}
                        size={17}
                        color={marcado ? paleta().cores.branco : paleta().cores.verde}
                      />
                    </View>

                    <View style={styles.textosObjetivo}>
                      <Text style={styles.nomeObjetivo}>{o.nome}</Text>
                      <Text style={styles.resumoObjetivo}>{o.resumo}</Text>
                    </View>

                    {/* A marca à direita, e não só o fundo tingido: numa lista
                        de sete, "qual está escolhido" precisa de um sinal que
                        se ache sem comparar as sete. */}
                    <Ionicons
                      name={marcado ? 'checkmark-circle' : 'ellipse-outline'}
                      size={20}
                      color={marcado ? paleta().cores.verde : paleta().cores.borda}
                    />
                  </Pressable>
                )
              })}
            </View>

            {/* ── QUANDO O FOCO É UMA CONDIÇÃO DE SAÚDE ────────────────────
             *
             * Quatro dos onze são coisas que a pessoa JÁ TEM: glicemia,
             * coração, menopausa, intestino. Elas entraram na lista porque
             * marcar não é se diagnosticar — é dizer o que já foi dito por um
             * médico. Mas o app passa a ajustar as calorias por causa disso, e
             * quem acompanha essas condições é gente, não uma lista.
             *
             * Só aparece com uma das quatro marcada. Fixa embaixo da lista, ela
             * viraria paisagem — e a frase que se lê sempre é a frase que não se
             * lê nunca.
             *
             * O tom é de aviso e não de alarme: quem tem diabetes não precisa
             * de susto ao dizer que tem diabetes. */}
            {objetivoDe(objetivoEditado !== undefined ? objetivoEditado : objetivo)?.pedeAcompanhamento && (
              <View style={styles.avisoAcompanhamento}>
                <Ionicons
                  name="information-circle-outline"
                  size={15}
                  color={paleta().cores.verde}
                />
                <Text style={styles.textoAcompanhamento}>
                  O app ajusta as suas metas por causa desse foco. Vale contar à {suaNutri()} —
                  quem acompanha isso de perto é ela.
                </Text>
              </View>
            )}

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

/* Uma linha so de leitura.
 *
 * O CADEADO: em modo de edicao, nome e telefone viram campos e os outros quatro
 * continuam texto -- com exatamente a mesma cara de antes. Relatado duas vezes:
 * "nao mostra os campos que pode editar ou nao", "fica estranho, parece que nao
 * esta funcionando".
 *
 * E parece mesmo: a pessoa toca em Editar, ve seis linhas iguais, toca no CPF,
 * nada acontece, e conclui que o BOTAO nao funcionou -- em vez de concluir que
 * aquele campo e fechado. A diferenca entre "travado" e "quebrado" tem de estar
 * na tela, e nao na cabeca de quem escreveu.
 *
 * So aparece EM EDICAO. Fora dela nada e editavel, e um cadeado em toda linha
 * nao distinguiria nada -- so sujaria a leitura. */
function Linha({
  rotulo,
  valor,
  ultima,
  travada,
}: {
  rotulo: string
  valor: string
  ultima?: boolean
  travada?: boolean
}) {
  const styles = estilos()
  return (
    <View style={[styles.linha, !ultima && styles.linhaComDivisor]}>
      <Text style={[styles.rotuloLinha, travada && styles.rotuloTravado]}>{rotulo}</Text>
      <Text style={[styles.valorLinha, travada && styles.valorTravado]} numberOfLines={1}>
        {valor}
      </Text>
      {travada && <Ionicons name="lock-closed" size={13} color={paleta().inkFraco} />}
    </View>
  )
}

/* O irmão editável do `Linha`, e com a MESMA moldura de propósito.
 *
 * Entrar em edição não pode reorganizar o cartão: se o campo tivesse altura ou
 * recuo diferentes, a lista saltaria ao trocar de modo e a pessoa perderia de
 * vista a linha que estava olhando. O que muda é a borda e o cursor. */
function Campo({
  rotulo,
  valor,
  aoMudar,
  styles,
  teclado,
  autoCapitalize,
}: {
  rotulo: string
  valor: string
  aoMudar: (v: string) => void
  styles: ReturnType<typeof estilos>
  teclado?: 'phone-pad'
  autoCapitalize?: 'words'
}) {
  return (
    <View style={[styles.linha, styles.linhaComDivisor]}>
      <Text style={styles.rotuloLinha}>{rotulo}</Text>
      <TextInput
        value={valor}
        onChangeText={aoMudar}
        style={styles.campoLinha}
        keyboardType={teclado}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
      />
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
  /* ── A EDIÇÃO ────────────────────────────────────────────────────────────
     O campo herda a tipografia do `valorLinha` para o cartão não saltar ao
     entrar em edição -- ver o comentário do componente `Campo`. */
  /* Apagado E com cadeado. Apagar sozinho se leria como "carregando"; o
     cadeado sozinho se perde. Os dois juntos dizem a mesma coisa duas vezes,
     que e o certo quando a conclusao errada custa uma reclamacao. */
  opcoesGenero: { flexDirection: 'row', gap: 6, flexShrink: 1 },
  opcaoGenero: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: t.cores.superficie,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  opcaoGeneroAtiva: { backgroundColor: t.cores.verde, borderColor: t.cores.verde },
  textoOpcaoGenero: { fontSize: 12.5, fontWeight: '700', color: t.inkMedio },
  textoOpcaoGeneroAtiva: { color: t.cores.branco },

  rotuloTravado: { opacity: 0.55 },
  valorTravado: { opacity: 0.55 },
  campoLinha: {
    flexShrink: 1,
    minWidth: 150,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '600',
    color: t.inkMedio,
    paddingVertical: 0,
  },
  cabecalhoCartao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 14,
    paddingBottom: 8,
  },
  tituloCartao: { fontSize: 15, fontWeight: '800', color: t.cores.ink },
  botaoEditar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: t.cores.verdeClaro,
  },
  botaoEditarPress: { opacity: 0.7 },
  textoEditar: { fontSize: 12.5, fontWeight: '700', color: t.cores.verde },
  acoesEdicao: { paddingTop: 12, paddingBottom: 14, gap: 10 },
  avisoEdicao: { fontSize: 12, lineHeight: 16, color: t.inkSuave },
  erroEdicao: {
    fontSize: 12.5,
    lineHeight: 17,
    color: t.cores.erroTexto,
    backgroundColor: t.cores.erroFundo,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  botoesEdicao: { flexDirection: 'row', gap: 10 },
  botaoCancelar: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.borda,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoCancelar: { fontSize: 14, fontWeight: '700', color: t.inkMedio },
  botaoSalvar: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: t.cores.verde,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoSalvar: { fontSize: 14, fontWeight: '800', color: t.cores.branco },
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
  negrito: { fontWeight: '800', color: t.cores.ink },
  /* ── OS SETE OBJETIVOS ────────────────────────────────────────────────
     Uma forma repetida: quadrado tingido com ícone · nome · resumo · marca.
     Muda o texto, nunca o formato — que é o que faz uma lista de sete ser
     percorrida de relance em vez de lida item por item. */
  listaObjetivos: { gap: 6 },
  linhaObjetivo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: t.cores.superficie,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  /* Tingido de leve, e não preenchido de verde como as três fichas antigas:
     preenchido, o resumo em cinza sumiria — e é ele que explica a diferença
     entre "ganhar peso" e "ganhar músculo". */
  linhaObjetivoAtiva: { backgroundColor: t.cores.verdeClaro, borderColor: t.cores.verde },
  linhaObjetivoPressionada: { opacity: 0.7 },
  iconeObjetivo: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.cores.verdeMenta,
  },
  iconeObjetivoAtivo: { backgroundColor: t.cores.verde },
  textosObjetivo: { flex: 1, gap: 1 },
  nomeObjetivo: { fontSize: 14, fontWeight: '700', color: t.cores.ink },
  resumoObjetivo: { fontSize: 11.5, lineHeight: 15, color: t.inkSuave },

  /* Tingido de verde, e não de amarelo: é informação, não alerta. Quem tem
     diabetes não precisa de susto ao dizer que tem diabetes. */
  avisoAcompanhamento: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    padding: 10,
    borderRadius: 12,
    backgroundColor: t.cores.verdeMenta,
  },
  textoAcompanhamento: { flex: 1, fontSize: 11.5, lineHeight: 16, color: t.inkMedio },

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
