import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CampoTexto } from '../components/CampoTexto'
import { SeletorDias } from '../components/SeletorDias'
import { TotaisPlano } from '../components/TotaisPlano'
import { dataNumerica, decimal, milhar } from '../lib/formatar'
import {
  DIAS_PADRAO,
  itensDoPlano,
  salvarPlano,
  totaisDe,
  type DiaSemana,
  type RefeicaoMontada,
} from '../lib/plano'
import { estilosDe, paleta } from '../lib/tema'

const LIMITE_NOME = 80

/* Nome sugerido: a data de hoje. Não é preguiça — é para o campo nunca sair
   vazio de um passo que já tem um botão de salvar esperando. Quem quiser trocar,
   troca; quem não ligar para o nome, não trava aqui. */
const nomeSugerido = () => `Plano de ${dataNumerica(new Date())}`

/* Última etapa: o que o dia montado soma, e o botão que grava.
 *
 * Só de leitura, de propósito. Mudar um alimento é voltar uma tela, e não
 * editar por aqui: a mesma refeição em dois lugares editáveis é a receita para
 * a soma discordar do que está na tela. */
export function ResumoPlanoScreen({
  refeicoes,
  onVoltar,
  onSalvo,
}: {
  refeicoes: RefeicaoMontada[]
  onVoltar: () => void
  onSalvo: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const [nome, setNome] = useState(nomeSugerido)
  const [dias, setDias] = useState<DiaSemana[]>(DIAS_PADRAO)
  const [erroNome, setErroNome] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const totais = totaisDe(itensDoPlano(refeicoes))
  const quantosItens = refeicoes.reduce((soma, r) => soma + r.itens.length, 0)

  async function salvar() {
    const nomeLimpo = nome.trim()
    if (!nomeLimpo) {
      setErroNome('Dê um nome ao plano.')
      return
    }

    if (dias.length === 0) {
      setErro('Marque pelo menos um dia da semana.')
      return
    }

    setErroNome('')
    setErro('')
    setSalvando(true)

    const r = await salvarPlano({
      planoId: null,
      nome: nomeLimpo,
      observacao: '',
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

  return (
    <KeyboardAvoidingView
      style={styles.tela}
      /* No Android o sistema já encolhe a janela; no iOS não, e sem isto o
         teclado do nome cobre o botão de salvar. */
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.cabecalho, { paddingTop: top + 8 }]}>
        <Pressable
          onPress={onVoltar}
          style={styles.botaoVoltar}
          hitSlop={8}
          disabled={salvando}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela}>Resumo do plano</Text>
        <View style={styles.botaoVoltar} />
      </View>

      <ScrollView
        /* `flex: 1` na ROLAGEM, e nao so no container.
               Sem isto ela se dimensiona pelo conteudo e o rodape fixo -- irmao
               dela -- para onde o conteudo achar que acabou: no MEIO da tela.
               `contentContainerStyle` NAO resolve: ele estiliza o conteudo
               dentro da rolagem, e nao a rolagem. */
        style={styles.rolagem}
        contentContainerStyle={styles.conteudo}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={false}
        overScrollMode="never"
      >
        <Text style={styles.apoio}>
          {refeicoes.length} {refeicoes.length === 1 ? 'refeição' : 'refeições'} ·{' '}
          {quantosItens} {quantosItens === 1 ? 'alimento' : 'alimentos'}
        </Text>

        <TotaisPlano totais={totais} />

        <Text style={styles.secao}>Por refeição</Text>

        {refeicoes.map(r => (
          <LinhaRefeicao key={r.chave} refeicao={r} />
        ))}

        <Text style={styles.secao}>Em que dias este plano vale</Text>

        <SeletorDias
          dias={dias}
          desativado={salvando}
          onMudar={novos => {
            setDias(novos)
            if (erro) setErro('')
          }}
        />

        <View style={styles.blocoNome}>
          <CampoTexto
            rotulo="Nome do plano"
            value={nome}
            onChangeText={t => {
              setNome(t)
              if (erroNome) setErroNome('')
            }}
            placeholder="Ex.: Semana de treino"
            maxLength={LIMITE_NOME}
            autoCapitalize="sentences"
            returnKeyType="done"
            erro={erroNome || null}
            editable={!salvando}
          />
        </View>

        {!!erro && (
          <View style={styles.blocoErro}>
            <Text style={styles.tituloErro}>Não foi possível salvar</Text>
            {/* A mensagem crua do banco junto: sem ela, sem internet e migração
                faltando viram o mesmo aviso e não há como saber qual foi. */}
            <Text style={styles.detalheErro}>{erro}</Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.rodape, { paddingBottom: Math.max(bottom, 16) }]}>
        <Pressable
          onPress={salvar}
          disabled={salvando}
          style={({ pressed }) => [
            styles.botao,
            pressed && styles.botaoPressionado,
            salvando && styles.botaoDesativado,
          ]}
          accessibilityRole="button"
        >
          {salvando ? (
            <ActivityIndicator color={paleta().cores.branco} />
          ) : (
            <Text style={styles.textoBotao}>Salvar plano</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

function LinhaRefeicao({ refeicao }: { refeicao: RefeicaoMontada }) {
  const styles = estilos()
  const t = totaisDe(refeicao.itens)

  return (
    <View style={styles.refeicao}>
      <View style={styles.cabecalhoRefeicao}>
        <View style={styles.hora}>
          <Text style={styles.textoHora}>{refeicao.hora}</Text>
        </View>
        <Text style={styles.nomeRefeicao} numberOfLines={1}>
          {refeicao.rotulo}
        </Text>
        <Text style={styles.kcalRefeicao}>
          {t.calorias === null ? '—' : `${milhar(t.calorias)} kcal`}
        </Text>
      </View>

      {refeicao.itens.length === 0 ? (
        <Text style={styles.vazia}>Nenhum alimento nesta refeição</Text>
      ) : (
        <View style={styles.linhaMacrosRefeicao}>
          <Macro rotulo="P" valor={t.proteinas} cor={paleta().coresMacro.proteinas} />
          <Macro rotulo="C" valor={t.carboidratos} cor={paleta().coresMacro.carboidratos} />
          <Macro rotulo="G" valor={t.gorduras} cor={paleta().coresMacro.gorduras} />
        </View>
      )}
    </View>
  )
}

function Macro({ rotulo, valor, cor }: { rotulo: string; valor: number | null; cor: string }) {
  const styles = estilos()
  return (
    <View style={styles.macroRefeicao}>
      <View style={[styles.ponto, { backgroundColor: cor }]} />
      <Text style={styles.textoMacro}>
        {rotulo} {valor === null ? '—' : `${decimal(valor, 0)} g`}
      </Text>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
  tela: { flex: 1, backgroundColor: t.cores.fundo },
  rolagem: { flex: 1 },

  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  botaoVoltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  tituloTela: { flexShrink: 1, fontSize: 17, fontWeight: '800', color: t.cores.ink },

  conteudo: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24, gap: 10 },
  apoio: { fontSize: 13, color: t.inkSuave },

  secao: { marginTop: 8, fontSize: 13, fontWeight: '800', color: t.inkMedio },

  refeicao: {
    gap: 8,
    padding: 14,
    borderRadius: 16,
    backgroundColor: t.cores.cartao,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  cabecalhoRefeicao: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hora: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: t.cores.verdeClaro,
  },
  textoHora: { fontSize: 12.5, fontWeight: '800', color: t.cores.verdeEscuro },
  nomeRefeicao: { flex: 1, fontSize: 15, fontWeight: '800', color: t.cores.ink },
  kcalRefeicao: { fontSize: 13, fontWeight: '800', color: t.cores.verde },

  linhaMacrosRefeicao: { flexDirection: 'row', gap: 14 },
  macroRefeicao: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  ponto: { width: 7, height: 7, borderRadius: 4 },
  textoMacro: { fontSize: 12, fontWeight: '600', color: t.inkSuave },
  vazia: { fontSize: 12, color: t.inkFraco },

  blocoNome: { marginTop: 12 },

  blocoErro: {
    marginTop: 6,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.cores.erroBorda,
    backgroundColor: t.cores.erroFundo,
  },
  tituloErro: { fontSize: 13.5, fontWeight: '700', color: t.cores.erroTexto },
  detalheErro: { marginTop: 5, fontSize: 12.5, lineHeight: 18, color: t.cores.erroTexto },

  rodape: { paddingHorizontal: 20, paddingTop: 10 },
  botao: {
    height: 54,
    borderRadius: 16,
    backgroundColor: t.cores.verde,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoPressionado: { backgroundColor: t.cores.verdeEscuro },
  botaoDesativado: { opacity: 0.6 },
  textoBotao: { fontSize: 15.5, fontWeight: '700', color: t.cores.branco },
  }),
)
