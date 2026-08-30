import { useState } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import { iniciais, type Nutricionista } from '../lib/nutricionista'
import { estilosDe, paleta } from '../lib/tema'

/* O rosto do cartão de nutricionista.
 *
 * Três desenhos, e a diferença entre eles não é decoração:
 *
 *   foto de perfil → círculo, recortada para preencher (`cover`)
 *   logo           → quadrado arredondado, INTEIRA dentro dele (`contain`)
 *   nada           → as iniciais
 *
 * Recortar uma logo num círculo come o nome da clínica pelas beiradas. Quem diz
 * qual é o caso é a flag de Parâmetros, resolvida lá no banco — ver a migração
 * 20260801000008.
 *
 * ── Imagem que não carrega cai nas iniciais ────────────────────────────────
 * Ter URL não é ter imagem. Quando o endereço não responde, a `Image` do React
 * Native não desenha nada — e o cartão fica com um buraco do tamanho do avatar,
 * que é pior do que nunca ter tido foto: a ficha inteira parece quebrada.
 *
 * Isso não é hipótese, e a causa já mudou uma vez. Era o sistema montando URL
 * pública para um bucket privado — resolvido, hoje o endereço é assinado em
 * lib/arquivos.ts. Restou a outra: das quatro que apontam para uma logo, o
 * ARQUIVO não está no bucket, e o servidor responde `Object not found`. Isso se
 * conserta do lado de lá, subindo a logo ou desligando `usar_logo_documentos`
 * no perfil — mas a tela não pode depender disso para ficar de pé.
 *
 * E endereço assinado VENCE, uma hora depois. Tela que fica aberta a tarde
 * inteira perde a foto sem nada ter quebrado; guardar QUAL falhou é o que faz o
 * endereço novo, da releitura seguinte, entrar tentando de novo. */
export function AvatarNutri({
  nutri,
  tamanho = 52,
}: {
  nutri: Pick<Nutricionista, 'nome' | 'imagemUrl' | 'imagemELogo'>
  tamanho?: number
}) {
  const styles = estilos()
  /* Guarda QUAL endereço falhou, e não um sim/não: assim uma imagem nova entra
     tentando de novo, em vez de herdar a desistência da anterior. */
  const [falhou, setFalhou] = useState<string | null>(null)

  const raio = nutri.imagemELogo ? tamanho * 0.22 : tamanho / 2
  const base = { width: tamanho, height: tamanho, borderRadius: raio }

  if (nutri.imagemUrl && nutri.imagemUrl !== falhou) {
    return (
      <Image
        source={{ uri: nutri.imagemUrl }}
        style={[styles.imagem, base]}
        resizeMode={nutri.imagemELogo ? 'contain' : 'cover'}
        onError={() => setFalhou(nutri.imagemUrl)}
        accessibilityIgnoresInvertColors
      />
    )
  }

  return (
    <View style={[styles.vazio, base]}>
      <Text style={[styles.iniciais, { fontSize: tamanho * 0.34 }]}>{iniciais(nutri.nome)}</Text>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
  /* Fundo branco atrás da logo, e este é o único lugar do app escuro em que o
     branco continua: as logos são PNG com transparência, desenhadas em traço
     escuro para papel. Sobre o fundo do app elas sumiriam por completo. */
  imagem: { backgroundColor: t.cores.branco },
  vazio: { backgroundColor: t.cores.verdeClaro, alignItems: 'center', justifyContent: 'center' },
  iniciais: { fontWeight: '800', color: t.cores.verde },
  }),
)
