import { Pressable, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import type { CicloDaPaciente, DocumentoDaPaciente } from '../lib/fichaCompleta'
import { estilosDe, paleta } from '../lib/tema'

/* As duas seções novas da ficha: o ciclo e o que foi prescrito.
 *
 * Moram num componente à parte, e não dentro da tela do dossiê, porque aquele
 * arquivo é dividido com outra sessão -- e porque as duas são desenho puro:
 * recebem o que a lib leu e não sabem o que é rede. */

/* ════════════════════════ CICLO ════════════════════════ */

export function CicloDaFicha({ ciclo, nome }: { ciclo: CicloDaPaciente | null; nome: string }) {
  const styles = estilos()

  if (!ciclo) {
    return (
      <View style={styles.vazio}>
        <Ionicons name="ellipse-outline" size={20} color={paleta().inkFraco} />
        <Text style={styles.textoVazio}>
          Nenhum ciclo registrado para {primeiro(nome)}. O que ela anotar no aplicativo, e o que
          você registrar no sistema, aparece aqui.
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.bloco}>
      <View style={styles.cartaoDoCiclo}>
        <Text style={styles.numeroGrande}>
          {ciclo.diaDoCiclo === null ? '—' : ciclo.diaDoCiclo}
        </Text>
        <View style={styles.textoDoCartao}>
          <Text style={styles.tituloDoCartao}>dia do ciclo</Text>
          <Text style={styles.detalheDoCartao}>
            Última menstruação em {porExtenso(ciclo.ultimaMenstruacao)}
            {ciclo.duracaoDoFluxo !== null ? `, ${ciclo.duracaoDoFluxo} dias de fluxo` : ''}
            {ciclo.intensidade ? `, ${ciclo.intensidade}` : ''}.
          </Text>
        </View>
      </View>

      <Linha
        icone="repeat-outline"
        rotulo="Ciclo médio"
        valor={
          ciclo.mediaDoCiclo !== null
            ? `${ciclo.mediaDoCiclo} dias`
            : ciclo.quantosRegistros < 2
              ? 'Precisa de dois registros'
              : 'Sem intervalo confiável'
        }
        styles={styles}
      />
      <Linha
        icone="calendar-outline"
        rotulo="Registros"
        valor={ciclo.quantosRegistros === 1 ? '1 menstruação' : `${ciclo.quantosRegistros} menstruações`}
        styles={styles}
      />

      {ciclo.ultimosSintomas.length > 0 && (
        <>
          <Text style={styles.subtitulo}>O QUE ELA ANOTOU</Text>
          {ciclo.ultimosSintomas.map(s => (
            <View key={s.data} style={styles.linhaDeSintoma}>
              <Text style={styles.dataDoSintoma}>{porExtenso(s.data)}</Text>
              <Text style={styles.textoDoSintoma}>
                {[s.humor, ...s.sintomas].filter(Boolean).join(' · ')}
              </Text>
            </View>
          ))}
        </>
      )}

      {/* A conta é do registro, e não da previsão. Dizer "próxima em tal dia"
          com três ciclos irregulares seria o app afirmando o que não sabe -- e
          é justamente em ciclo irregular que ela é procurada. */}
      <Text style={styles.nota}>
        O dia do ciclo conta a partir da última menstruação registrada. Previsão de próxima não
        aparece aqui de propósito: com ciclo irregular, ela erraria mais do que ajudaria.
      </Text>
    </View>
  )
}

/* ════════════════════════ DOCUMENTOS E SUPLEMENTAÇÃO ════════════════════════ */

export function DocumentosDaFicha({
  documentos,
  nome,
  onAbrir,
}: {
  documentos: DocumentoDaPaciente[]
  nome: string
  /* Tocar abre o documento inteiro, com o botão de PDF. "Clico e não faz nada"
     era a lista sem esta linha: um cartão que parece tocável e não é. */
  onAbrir: (documento: DocumentoDaPaciente) => void
}) {
  const styles = estilos()

  if (documentos.length === 0) {
    return (
      <View style={styles.vazio}>
        <Ionicons name="document-text-outline" size={20} color={paleta().inkFraco} />
        <Text style={styles.textoVazio}>
          Nada prescrito para {primeiro(nome)} ainda. Receituário, atestado e suplementação
          aparecem aqui assim que você emitir no sistema.
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.bloco}>
      {documentos.map(d => (
        <Pressable
          key={d.tipo + d.id}
          onPress={() => onAbrir(d)}
          style={({ pressed }) => [styles.cartaoDoDocumento, pressed && styles.pressionado]}
          accessibilityRole="button"
          accessibilityLabel={(d.titulo || nomeDoTipo(d.tipo)) + '. Abrir e gerar PDF.'}
        >
          <View style={styles.topoDoDocumento}>
            <Ionicons
              name={d.medicamentos.length > 0 ? 'medkit-outline' : 'document-text-outline'}
              size={17}
              color={paleta().cores.verde}
            />
            <Text style={styles.tituloDoDocumento} numberOfLines={2}>
              {d.titulo || nomeDoTipo(d.tipo)}
            </Text>
            <Text style={styles.dataDoDocumento}>{curta(d.quando)}</Text>
          </View>

          {d.medicamentos.length > 0 && (
            <View style={styles.listaDeItens}>
              {d.medicamentos.map((m, i) => (
                <Text key={m.nome + i} style={styles.item}>
                  • {m.nome}
                  {m.dosagem ? ` — ${m.dosagem}` : ''}
                  {m.frequencia ? `, ${m.frequencia}` : ''}
                </Text>
              ))}
            </View>
          )}

          {/* O texto entra CORTADO: um receituário inteiro numa ficha de
              celular empurra os outros documentos para fora da tela, e o que
              ela procura aqui é "o que eu passei", não o documento completo --
              esse ela abre no computador, com timbrado e assinatura. */}
          {d.medicamentos.length === 0 && d.conteudo && (
            <Text style={styles.trecho} numberOfLines={4}>
              {d.conteudo}
            </Text>
          )}

          <View style={styles.rodapeDoCartao}>
            <Text style={styles.rodapeDoDocumento}>
              {nomeDoTipo(d.tipo)}
              {d.importado ? ' · importado de outro sistema' : ''}
            </Text>
            <Ionicons name="chevron-forward" size={15} color={paleta().inkFraco} />
          </View>
        </Pressable>
      ))}
    </View>
  )
}

function Linha({
  icone,
  rotulo,
  valor,
  styles,
}: {
  icone: keyof typeof Ionicons.glyphMap
  rotulo: string
  valor: string
  styles: ReturnType<typeof estilos>
}) {
  return (
    <View style={styles.linha}>
      <Ionicons name={icone} size={16} color={paleta().inkFraco} />
      <Text style={styles.rotuloDaLinha}>{rotulo}</Text>
      <Text style={styles.valorDaLinha}>{valor}</Text>
    </View>
  )
}

const primeiro = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome

/* O vocabulário do sistema virando o da tela. `Object.hasOwn` e reserva
   explícita: um tipo novo lá não pode aparecer aqui como `undefined`
   (armadilha 10). */
const NOMES: Record<string, string> = {
  receituario: 'Receituário',
  atestado: 'Atestado',
  encaminhamento: 'Encaminhamento',
  solic_exames_lab: 'Solicitação de exames',
  solic_exames_bio: 'Solicitação de exames',
  avaliacao_antro: 'Avaliação antropométrica',
  relatorio_inicial: 'Relatório inicial',
  relatorio_sequencial: 'Relatório de consultas',
  contrarreferencia: 'Contrarreferência',
  plano_qualitativo: 'Plano qualitativo',
  outro: 'Documento',
}

const nomeDoTipo = (tipo: string): string =>
  Object.hasOwn(NOMES, tipo) ? NOMES[tipo] : 'Documento'

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

function porExtenso(iso: string | null): string {
  if (!iso) return 'data não registrada'
  const [ano, mes, dia] = iso.split('-').map(Number)
  if (!ano || !mes || !dia) return 'data não registrada'
  return `${dia} de ${MESES[mes - 1] ?? ''} de ${ano}`
}

function curta(iso: string | null): string {
  if (!iso) return ''
  const [, mes, dia] = iso.split('-')
  return dia && mes ? `${dia}/${mes}` : ''
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    bloco: { gap: 8 },

    vazio: {
      alignItems: 'center',
      gap: 10,
      paddingVertical: 30,
      paddingHorizontal: 18,
      backgroundColor: t.cores.cartao,
      borderRadius: 16,
    },
    textoVazio: { fontSize: 13.5, lineHeight: 19, color: t.inkSuave, textAlign: 'center' },

    cartaoDoCiclo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: t.cores.cartao,
      borderRadius: 16,
      padding: 16,
    },
    numeroGrande: { fontSize: 34, fontWeight: '800', color: t.cores.verde, minWidth: 52, textAlign: 'center' },
    textoDoCartao: { flex: 1, gap: 2 },
    tituloDoCartao: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4, color: t.inkFraco, textTransform: 'uppercase' },
    detalheDoCartao: { fontSize: 13.5, lineHeight: 19, color: t.cores.ink },

    linha: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: t.cores.cartao,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    rotuloDaLinha: { flex: 1, fontSize: 13.5, color: t.inkSuave },
    valorDaLinha: { fontSize: 13.5, fontWeight: '700', color: t.cores.ink },

    subtitulo: {
      marginTop: 8,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.6,
      color: t.inkFraco,
    },
    linhaDeSintoma: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    dataDoSintoma: { width: 96, fontSize: 12.5, color: t.inkFraco },
    textoDoSintoma: { flex: 1, fontSize: 13, lineHeight: 18, color: t.cores.ink },

    nota: { marginTop: 8, fontSize: 12, lineHeight: 17, color: t.inkFraco },

    cartaoDoDocumento: {
      backgroundColor: t.cores.cartao,
      borderRadius: 14,
      padding: 14,
      gap: 8,
    },
    topoDoDocumento: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    tituloDoDocumento: { flex: 1, fontSize: 14.5, fontWeight: '800', color: t.cores.ink },
    dataDoDocumento: { fontSize: 12, color: t.inkFraco },
    listaDeItens: { gap: 3 },
    item: { fontSize: 13.5, lineHeight: 19, color: t.cores.ink },
    trecho: { fontSize: 13, lineHeight: 18, color: t.inkSuave },
    rodapeDoCartao: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    rodapeDoDocumento: { flex: 1, fontSize: 11.5, color: t.inkFraco },
    pressionado: { opacity: 0.75 },
  }),
)
