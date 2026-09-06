import { useEffect, useState } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import { urlDoAvatar } from '../lib/avatar'
import { primeiroNomeDela, type RecadoDaNutri } from '../lib/recadoDaNutri'
import { PADDING_CARTAO, RAIO_CARTAO, estilosDe, paleta } from '../lib/tema'

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

export function CartaoDoRecado({ recado }: { recado: RecadoDaNutri | null }) {
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

  /* ── UMA SAUDACAO, E NAO UMA LINHA DE CAIXA DE ENTRADA ──────────────────
   *
   * Ele era foto pequena, "Recado de Renan", uma seta, e o toque abria a
   * conversa. Isso e uma linha de inbox: competia com a aba Mensagens e nao
   * parecia saudacao nenhuma.
   *
   * Pedido assim: "so quero que apareca um card de saudacao mesmo, como se
   * fosse um aviso... ai se ela quiser falar com a nutri, vai na mensagem".
   *
   * Entao as PALAVRAS DELA vem em primeiro plano, entre aspas, no tamanho de
   * quem fala -- e a assinatura embaixo, pequena. A foto cresce porque numa
   * saudacao o rosto e metade do recado.
   *
   * E ele deixou de ser tocavel. Um cartao que abre a conversa duplica o que a
   * aba Mensagens ja faz, e um toque sem seta seria gesto escondido -- pior que
   * nao ter. Quem quiser responder tem a aba, que esta sempre ali embaixo. */
  return (
    <View style={styles.cartao}>
      <View style={styles.topo}>
        {temFoto ? (
          <Image
            source={{ uri: foto }}
            style={styles.foto}
            onError={() => setFalhou(foto)}
            accessibilityIgnoresInvertColors
          />
        ) : (
          /* Iniciais quando nao ha foto ou ela falhou. Um buraco do tamanho da
             foto se le como app quebrado -- pior do que nunca ter tido foto. */
          <View style={styles.semFoto}>
            <Text style={styles.iniciais}>{nome.slice(0, 1).toUpperCase()}</Text>
          </View>
        )}

        <View style={styles.textos}>
          {/* Sem `numberOfLines`: o recado e curto por limite do outro lado, e
              cortar a frase de uma profissional de saude com reticencias e pior
              do que o cartao crescer tres linhas. */}
          <Text style={styles.fala}>{recado.texto}</Text>
          <Text style={styles.assinatura}>{nome}, sua nutricionista</Text>
        </View>
      </View>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    /* Tingido, e não branco como os outros cartões: é o único conteúdo da tela
       que veio de uma pessoa, e precisa se distinguir de número e gráfico. */
    cartao: {
      gap: 11,
      backgroundColor: t.cores.verdeClaro,
      /* A casca é a mesma dos outros, e o que distingue é a COR.
         Estava com raio 16 e padding 15 no meio de uma pilha de 20 e 16 — o
         canto mais fechado lia-se como descuido, não como intenção. O tingido
         já basta para dizer que este veio de uma pessoa. */
      borderRadius: RAIO_CARTAO,
      padding: PADDING_CARTAO,
    },
    /* Alinhado ao TOPO, e não ao centro: com duas ou três linhas de fala, o
       centro deixaria a foto boiando no meio do parágrafo. */
    topo: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },

    /* 46, e não 38. Numa saudação o rosto é metade do recado — era tamanho de
       item de lista, e este cartão deixou de ser um. */
    foto: { width: 46, height: 46, borderRadius: 23, backgroundColor: t.cores.cartao },
    semFoto: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.cores.verde,
    },
    iniciais: { fontSize: 18, fontWeight: '800', color: t.cores.branco },

    textos: { flex: 1, gap: 4 },
    /* As palavras DELA, no tamanho de quem fala. Era 14,5 embaixo de um rótulo
       "Recado de"; agora é a primeira coisa que se lê no cartão. */
    fala: { fontSize: 15.5, color: t.cores.ink, lineHeight: 22 },
    /* A assinatura fecha a saudação, e por isso vem DEPOIS: quem lê termina
       sabendo de quem é, como numa nota deixada na porta da geladeira. */
    assinatura: { fontSize: 12, fontWeight: '700', color: t.inkSuave },
  }),
)
