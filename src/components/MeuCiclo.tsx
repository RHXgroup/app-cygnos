import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import type { CicloInformado } from '../lib/cicloDaPessoa'
import { estilosDe, paleta } from '../lib/tema'

/* As duas perguntas que o app não fazia.
 *
 * ── Por que isto existe ───────────────────────────────────────────────────
 * O app tinha duas versões, e as duas estavam erradas.
 *
 * A primeira se recusava a prever com menos de dois ciclos registrados, para
 * não apoiar previsão em média de população. Quem marcava o primeiro dia abria
 * o calendário e via um quadradinho solto: sem faixa, sem janela fértil, sem
 * próxima data. Dois meses de fé antes de o app devolver qualquer coisa.
 *
 * A segunda assumia 28 dias e escrevia "estimativa" ao lado. É o que o mercado
 * faz, e mesmo assim é chutar: quem tem ciclo de 34 recebe a janela fértil uma
 * semana fora do lugar — justamente ela, que é quem mais precisa da conta
 * certa.
 *
 * O que faltava era óbvio: PERGUNTAR. A mulher sabe quanto dura o ciclo dela; é
 * a primeira coisa que qualquer médico pergunta. O app perguntava isso para a
 * NUTRICIONISTA, no questionário, e não perguntava para a dona do ciclo.
 *
 * ── E some sozinho ────────────────────────────────────────────────────────
 * A resposta dela vale desde o primeiro dia e é substituída assim que houver
 * dois começos registrados para MEDIR: medir vence lembrar, porque a
 * estimativa de cabeça costuma ser o número redondo que a pessoa ouviu falar.
 * A escada inteira está em `cicloDaPessoa`.
 *
 * ── "Agora não" é uma resposta ────────────────────────────────────────────
 * Nem toda mulher sabe, e quem não sabe não pode ficar presa numa pergunta para
 * usar o resto da tela. Sem resposta, o app volta para os 28 e diz que voltou —
 * pior do que a resposta dela, melhor do que uma tela travada. */

/* O que aparece nos campos quando ela abre. Não é chute disfarçado de resposta:
   é o ponto de partida que ela corrige, e enquanto ela não salvar, nada disto
   é gravado. Números redondos porque é assim que a pergunta é respondida. */
const SUGESTAO_DURACAO = '28'
const SUGESTAO_FLUXO = '5'

/* As mesmas faixas do `check` no banco e da validação em `situacaoDoCiclo`.
   Repetidas aqui para a recusa acontecer ANTES da ida à rede — é o único
   momento em que dá para explicar o que está errado. */
const DURACAO_MIN = 15
const DURACAO_MAX = 45
const FLUXO_MIN = 1
const FLUXO_MAX = 15

/* Campo inteiro: filtra tudo que não é dígito, e o teclado não tem separador.
   Item 3 do AGENTS.md — `Number("10.000")` é 10, e um ciclo de 10 dias entraria
   em toda conta da tela sem erro nenhum. */
const soDigitos = (t: string) => t.replace(/[^0-9]/g, '').slice(0, 2)

export function MeuCiclo({
  informado,
  salvando,
  onSalvar,
  onAgoraNao,
}: {
  informado: CicloInformado
  salvando: boolean
  onSalvar: (i: CicloInformado) => void
  /* Fecha sem responder. Quem não sabe não fica presa. */
  onAgoraNao: () => void
}) {
  const styles = estilos()
  const [duracao, setDuracao] = useState(() =>
    informado.duracao === null ? SUGESTAO_DURACAO : String(informado.duracao),
  )
  const [fluxo, setFluxo] = useState(() =>
    informado.diasDeFluxo === null ? SUGESTAO_FLUXO : String(informado.diasDeFluxo),
  )

  /* Reabrir com o que está gravado, e não com o que ficou digitado da última
     vez. Sem isto, "alterar" mostraria um valor que ela abandonou. */
  useEffect(() => {
    setDuracao(informado.duracao === null ? SUGESTAO_DURACAO : String(informado.duracao))
    setFluxo(informado.diasDeFluxo === null ? SUGESTAO_FLUXO : String(informado.diasDeFluxo))
  }, [informado.duracao, informado.diasDeFluxo])

  const nDuracao = duracao === '' ? null : Number(duracao)
  const nFluxo = fluxo === '' ? null : Number(fluxo)

  const duracaoRuim = nDuracao !== null && (nDuracao < DURACAO_MIN || nDuracao > DURACAO_MAX)
  const fluxoRuim = nFluxo !== null && (nFluxo < FLUXO_MIN || nFluxo > FLUXO_MAX)
  /* Sem nenhum dos dois não há o que guardar; com um só, guarda esse. Os dois
     campos são independentes de propósito: dá para saber a duração do ciclo e
     não lembrar quantos dias de fluxo. */
  const podeSalvar =
    !salvando && !duracaoRuim && !fluxoRuim && (nDuracao !== null || nFluxo !== null)

  return (
    <View style={styles.cartao}>
      <View style={styles.titulo}>
        <Ionicons name="sparkles" size={17} color={paleta().cores.cicloForte} />
        <Text style={styles.textoTitulo}>Para eu acertar as suas datas</Text>
      </View>
      <Text style={styles.explicacao}>
        Duas perguntas, uma vez só. Com elas eu já mostro a janela fértil e a próxima menstruação
        desde o seu primeiro registro — e vou acertando sozinha conforme você marca os meses.
      </Text>

      <View style={styles.campos}>
        <Campo
          rotulo="Duração do ciclo"
          ajuda="do 1º dia de uma menstruação ao 1º dia da seguinte"
          valor={duracao}
          onChange={t => setDuracao(soDigitos(t))}
          ruim={duracaoRuim}
          styles={styles}
        />
        <Campo
          rotulo="Dias de menstruação"
          ajuda="quantos dias costuma durar o sangramento"
          valor={fluxo}
          onChange={t => setFluxo(soDigitos(t))}
          ruim={fluxoRuim}
          styles={styles}
        />
      </View>

      {/* A recusa explica o limite em vez de só pintar de vermelho: "de 15 a 45"
          diz o que fazer, e "inválido" manda adivinhar. */}
      {duracaoRuim && (
        <Text style={styles.recusa}>
          A duração do ciclo fica entre {DURACAO_MIN} e {DURACAO_MAX} dias.
        </Text>
      )}
      {fluxoRuim && (
        <Text style={styles.recusa}>
          Os dias de menstruação ficam entre {FLUXO_MIN} e {FLUXO_MAX}.
        </Text>
      )}

      <View style={styles.botoes}>
        <Pressable
          onPress={onAgoraNao}
          style={styles.depois}
          accessibilityRole="button"
          accessibilityLabel="Agora não"
        >
          <Text style={styles.textoDepois}>Não sei / agora não</Text>
        </Pressable>
        <Pressable
          onPress={() => podeSalvar && onSalvar({ duracao: nDuracao, diasDeFluxo: nFluxo })}
          disabled={!podeSalvar}
          style={[styles.salvar, !podeSalvar && styles.salvarApagado]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !podeSalvar }}
          accessibilityLabel="Guardar"
        >
          {salvando ? (
            <ActivityIndicator size="small" color={paleta().cores.branco} />
          ) : (
            <Text style={styles.textoSalvar}>Guardar</Text>
          )}
        </Pressable>
      </View>
    </View>
  )
}

function Campo({
  rotulo,
  ajuda,
  valor,
  onChange,
  ruim,
  styles,
}: {
  rotulo: string
  ajuda: string
  valor: string
  onChange: (t: string) => void
  ruim: boolean
  styles: ReturnType<typeof estilos>
}) {
  return (
    <View style={styles.campo}>
      <Text style={styles.rotulo}>{rotulo}</Text>
      <View style={styles.caixaLinha}>
        <TextInput
          value={valor}
          onChangeText={onChange}
          keyboardType="number-pad"
          keyboardAppearance="dark"
          maxLength={2}
          selectTextOnFocus
          style={[styles.caixa, ruim && styles.caixaRuim]}
          accessibilityLabel={rotulo}
        />
        <Text style={styles.dias}>dias</Text>
      </View>
      <Text style={styles.ajuda}>{ajuda}</Text>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    cartao: {
      gap: 12,
      backgroundColor: t.cores.cicloFundo,
      borderRadius: 16,
      padding: 17,
    },
    titulo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    textoTitulo: { flex: 1, fontSize: 15.5, fontWeight: '800', color: t.cores.ink },
    explicacao: { fontSize: 13, color: t.inkMedio, lineHeight: 19 },

    campos: { flexDirection: 'row', gap: 12 },
    campo: { flex: 1, gap: 5 },
    rotulo: { fontSize: 12, fontWeight: '700', color: t.cores.ink },
    caixaLinha: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    caixa: {
      width: 62,
      backgroundColor: t.cores.cartao,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.cores.borda,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 19,
      fontWeight: '800',
      color: t.cores.ink,
      textAlign: 'center',
    },
    caixaRuim: { borderColor: t.cores.cicloForte },
    dias: { fontSize: 13, color: t.inkMedio },
    ajuda: { fontSize: 10.5, color: t.inkFraco, lineHeight: 14 },

    recusa: { fontSize: 12, color: t.cores.cicloForte, lineHeight: 17 },

    botoes: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    depois: { flex: 1, paddingVertical: 12 },
    textoDepois: { fontSize: 13, color: t.inkMedio, fontWeight: '600' },
    salvar: {
      backgroundColor: t.cores.verde,
      borderRadius: 12,
      paddingHorizontal: 26,
      paddingVertical: 12,
      minWidth: 108,
      alignItems: 'center',
    },
    salvarApagado: { opacity: 0.45 },
    textoSalvar: { fontSize: 14.5, fontWeight: '800', color: t.cores.branco },
  }),
)
