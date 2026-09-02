import { useEffect, useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { urlDoAvatar } from '../lib/avatar'
import { primeiroNomeDela, type RecadoDaNutri } from '../lib/recadoDaNutri'
import { estilosDe, paleta } from '../lib/tema'

/* O recado da nutricionista, na tela que abre todo dia.
 *
 * ── Por que ele fica acima de tudo ────────────────────────────────────────
 * O Foodvisor cobra premium para dar chat com "uma nutricionista"; o Noom vende
 * "coach", que na prática é roteiro. Nenhum concorrente tem a profissional que
 * a pessoa JÁ CONSULTA.
 *
 * Este app tem, e ela não aparecia na tela inicial — só como plano, exame e
 * mensagem, todos atrás de um toque. Uma frase dela aqui é a única coisa da
 * tela que veio de uma pessoa, e não de uma conta.
 *
 * ── O que ele NÃO faz ─────────────────────────────────────────────────────
 * Não aparece vazio. Sem recado, o componente não existe — nada de moldura
 * dizendo "sua nutricionista ainda não escreveu", que é cobrança do
 * profissional na cara da paciente, e ela não tem o que fazer com isso.
 *
 * E não tem botão de "marcar como lido": ler já marca, do lado do servidor, e
 * pedir confirmação de leitura de um recado de três linhas seria transformar
 * carinho em tarefa. */

export function CartaoDoRecado({
  recado,
  onAbrirMensagens,
}: {
  recado: RecadoDaNutri | null
  /* O recado anterior vira mensagem na conversa quando ela escreve outro — o
     gatilho é do lado do servidor. Então tocar aqui leva ao lugar onde o
     histórico está, e não a uma tela própria que duplicaria a conversa. */
  onAbrirMensagens: () => void
}) {
  const styles = estilos()
  const [foto, setFoto] = useState<string | null>(null)
  /* QUAL endereço falhou, e não um booleano — item 7 do AGENTS.md: assinatura
     vence de hora em hora, e um booleano faria a foto nunca mais voltar. */
  const [falhou, setFalhou] = useState<string | null>(null)

  const caminho = recado?.foto ?? null

  useEffect(() => {
    let vivo = true
    if (!caminho) {
      setFoto(null)
      return
    }
    /* Assinar é `async`, então o endereço é ESTADO e não valor de render —
       mesma razão da foto de perfil. */
    urlDoAvatar(caminho).then(u => {
      if (vivo) setFoto(u)
    })
    return () => {
      vivo = false
    }
  }, [caminho])

  if (recado === null) return null

  const nome = primeiroNomeDela(recado.nome)
  const temFoto = foto !== null && foto !== falhou

  return (
    <Pressable
      onPress={onAbrirMensagens}
      style={({ pressed }) => [styles.cartao, pressed && styles.pressionado]}
      accessibilityRole="button"
      accessibilityLabel={`Recado de ${nome}: ${recado.texto}. Abrir a conversa.`}
    >
      <View style={styles.topo}>
        {temFoto ? (
          <Image
            source={{ uri: foto }}
            style={styles.foto}
            onError={() => setFalhou(foto)}
            accessibilityIgnoresInvertColors
          />
        ) : (
          /* Iniciais quando não há foto ou ela falhou. Um buraco do tamanho da
             foto se lê como app quebrado — pior do que nunca ter tido foto. */
          <View style={styles.semFoto}>
            <Text style={styles.iniciais}>{nome.slice(0, 1).toUpperCase()}</Text>
          </View>
        )}

        <View style={styles.deQuem}>
          <Text style={styles.rotulo}>Recado de</Text>
          <Text style={styles.nome} numberOfLines={1}>
            {nome}
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={17} color={paleta().inkFraco} />
      </View>

      {/* Sem `numberOfLines`: o recado é curto por limite do outro lado, e
          cortar a frase de uma profissional de saúde com reticências é pior do
          que o cartão crescer três linhas. */}
      <Text style={styles.texto}>{recado.texto}</Text>
    </Pressable>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    /* Tingido, e não branco como os outros cartões: é o único conteúdo da tela
       que veio de uma pessoa, e precisa se distinguir de número e gráfico. */
    cartao: {
      gap: 11,
      backgroundColor: t.cores.verdeClaro,
      borderRadius: 16,
      padding: 15,
    },
    pressionado: { opacity: 0.85 },

    topo: { flexDirection: 'row', alignItems: 'center', gap: 11 },
    foto: { width: 38, height: 38, borderRadius: 20, backgroundColor: t.cores.cartao },
    semFoto: {
      width: 38,
      height: 38,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.cores.verde,
    },
    iniciais: { fontSize: 16, fontWeight: '800', color: t.cores.branco },

    deQuem: { flex: 1 },
    rotulo: { fontSize: 11, fontWeight: '700', color: t.inkFraco, letterSpacing: 0.3 },
    nome: { fontSize: 15, fontWeight: '800', color: t.cores.ink },

    texto: { fontSize: 14.5, color: t.cores.ink, lineHeight: 21 },
  }),
)
