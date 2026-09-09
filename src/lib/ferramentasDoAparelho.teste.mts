/* As ferramentas que este aparelho executa sozinho batem com o registro?
 *
 * ──────────────────── Por que este teste existe ────────────────────
 * A lista mora em DOIS lugares e nada obriga os dois a concordarem: o registro
 * de ferramentas vive no repositório do sistema (`Nutriviet`), e o aplicativo
 * não consegue importar de lá -- são dois projetos, dois `node_modules`, dois
 * `tsconfig`.
 *
 * O sintoma de divergirem é silencioso nos DOIS sentidos, e por isso vale um
 * teste em vez de um comentário:
 *
 *   - nome aqui e não lá  → o app intercepta uma ferramenta que o modelo nunca
 *     vai pedir. Inofensivo, e vira código morto que alguém mantém sem saber.
 *   - nome lá e não aqui  → a ação vai para o SERVIDOR, que responde "esse
 *     aviso é agendado pelo próprio celular". A frase está certa e chega no
 *     lugar errado: ela confirmou, nada foi criado, e a explicação culpa a
 *     versão do app.
 *
 * ──────────────────── Por que ler o arquivo do outro repositório ────────────────────
 * É feio, e é honesto. A alternativa seria repetir a lista e confiar em quem
 * escreve; esta pelo menos falha quando o outro lado muda.
 *
 * Se o repositório não estiver ao lado, o teste PASSA dizendo que não conferiu
 * -- e não falha. Uma máquina que só tem o app clonado não deve ficar com um
 * teste vermelho por causa de um arquivo que ela nunca teria.
 *
 * Rode com: node --experimental-strip-types src/lib/acoesNoAparelho.teste.mts */

import { existsSync, readFileSync } from 'node:fs'
import { FERRAMENTAS_DO_APARELHO, ehDoAparelho } from './ferramentasDoAparelho.ts'

let passou = 0
const falhas: string[] = []
function ok(nome: string, condicao: boolean) {
  if (condicao) passou++
  else falhas.push(nome)
}

// ──── O que dá para conferir sem o outro repositório ────
ok('a lista não está vazia', FERRAMENTAS_DO_APARELHO.length > 0)
ok('criar_aviso está nela', ehDoAparelho('criar_aviso'))
ok('agendar_consulta NÃO está', !ehDoAparelho('agendar_consulta'))
ok('cancelar_consulta NÃO está', !ehDoAparelho('cancelar_consulta'))
ok('nome desconhecido não entra', !ehDoAparelho('inventada'))
ok('vazio não entra', !ehDoAparelho(''))
/* `includes` num array de strings não faz coerção, mas a checagem é barata e
   protege de alguém trocar por uma comparação frouxa depois. */
ok('não casa por prefixo', !ehDoAparelho('criar_aviso_novo'))
ok('não casa por sufixo', !ehDoAparelho('x_criar_aviso'))

// ──── E o cruzamento com o registro, quando ele está ao lado ────
const REGISTRO = new URL(
  '../../../Nutriviet/supabase/functions/_shared/ferramentas.ts',
  import.meta.url,
)

if (!existsSync(REGISTRO)) {
  console.log('  (o repositório do sistema não está ao lado; o cruzamento não foi conferido)')
} else {
  const texto = readFileSync(REGISTRO, 'utf8')

  /* Cada bloco `name: '...'` que tenha `noAparelho: true` antes do próximo
     `name:`. Ler o arquivo como texto é grosseiro; o que salva é a
     autoconferência logo abaixo, que reprova se a regex parar de casar. */
  const nomes = [...texto.matchAll(/name:\s*'([a-z_]+)'/g)].map(m => ({
    nome: m[1] ?? '',
    em: m.index ?? 0,
  }))
  ok('achei as ferramentas do registro (o teste conferindo a si mesmo)', nomes.length >= 10)

  const noRegistro: string[] = []
  for (let i = 0; i < nomes.length; i++) {
    const daqui = nomes[i]?.em ?? 0
    const ate = nomes[i + 1]?.em ?? texto.length
    if (/noAparelho:\s*true/.test(texto.slice(daqui, ate))) noRegistro.push(nomes[i]?.nome ?? '')
  }

  ok('o registro marca ao menos uma como do aparelho', noRegistro.length > 0)
  ok('a lista do app é exatamente a do registro',
    [...noRegistro].sort().join(',') === [...FERRAMENTAS_DO_APARELHO].sort().join(','))

  /* A do aparelho não pode ter `rpc`: se tivesse, o servidor executaria E o app
     executaria, e o aviso nasceria duas vezes -- um deles no lugar errado. */
  for (const n of noRegistro) {
    const i = texto.indexOf(`name: '${n}'`)
    const j = nomes.find(x => x.em > i)?.em ?? texto.length
    ok(`${n} não tem rpc no registro`, !/rpc:\s*\{/.test(texto.slice(i, j)))
    ok(`${n} grava, e por isso para no cartão`, /grava:\s*true/.test(texto.slice(i, j)))
  }
}

console.log(`${passou} passaram, ${falhas.length} falharam`)
if (falhas.length) {
  for (const f of falhas) console.log('  FALHOU: ' + f)
  process.exit(1)
}
