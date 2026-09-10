/* Confere que toda RPC que o app chama existe no banco, com a assinatura exata.
 *
 * ── Por que existe ─────────────────────────────────────────────────────────
 * O app não cria função nenhuma: ele consome o que o sistema web publica, e as
 * duas metades vivem em repositórios diferentes, mexidas por sessões
 * diferentes. Uma função renomeada, ou um argumento que vira `p_conta` em vez
 * de `p_conta_id`, não quebra o `tsc` nem falha nos testes — quebra na mão da
 * pessoa, em tempo de execução, numa tela só.
 *
 * A lista sai do CÓDIGO, com grep no `src/lib`, e não de uma lista escrita à
 * mão: chamada nova entra na conferência sozinha.
 *
 * ── O que "existe" quer dizer aqui ─────────────────────────────────────────
 * A chave é distinguir três respostas do PostgREST:
 *
 *   PGRST202  a função não existe COM ESSES ARGUMENTOS. É a falha que importa,
 *             e é a mesma resposta para "não existe" e para "existe com outra
 *             assinatura" — as duas quebram o app do mesmo jeito.
 *   42501     existe, e o anônimo não pode executar. É o certo.
 *   qualquer   existe e executou (P0001 de um `raise`, 22P02 de um uuid falso,
 *   outra      null, uma lista). Também é sinal de que está lá.
 *
 * Fica FORA do `npm test` de propósito: precisa de rede e do banco de pé, e
 * teste que falha por causa de wi-fi ensina a ignorar teste. Roda com
 * `npm run contrato`, antes de subir e quando o outro lado mexer nas funções.
 *
 * ── Ele CHAMA as funções, inclusive as que escrevem ────────────────────────
 * Não há como perguntar ao PostgREST "esta assinatura existe?" sem executar. As
 * de escrita são chamadas com identificadores impossíveis — um uuid só de zeros
 * —, então elas percorrem o corpo, não encontram nada e levantam a exceção
 * delas: `app_ativar_metas` responde "Metas não encontradas.", que é a prova de
 * que o filtro de dono está no lugar.
 *
 * Isso vale enquanto as funções conferirem o dono. É por isso que a saída
 * separa "barrada para anônimo" de "executa sem sessão": a segunda lista é para
 * ser lida, não ignorada. */
import { readFileSync, readdirSync } from 'node:fs'

const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const chave = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

if (!url || !chave) {
  console.error(
    'Faltam EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY.\n' +
      'Elas estão no .env — rode com `npm run contrato`, que as carrega.',
  )
  process.exit(1)
}

/* Um valor plausível por argumento. O que importa é o TIPO bater: uuid onde o
   banco espera uuid, senão o PostgREST recusa antes de resolver a função e o
   teste acusaria ausência onde há só um argumento mal formado. */
const UUID_FALSO = '00000000-0000-0000-0000-000000000000'
const valorPara = nome =>
  /_id$/.test(nome) && nome !== 'p_id'
    ? UUID_FALSO
    : nome === 'p_id'
      ? 1
      : /^p_(dias|limite|quantos)$/.test(nome)
        ? 7
        : /^p_ligado$/.test(nome)
          ? true
          : /^p_inicio$/.test(nome)
            ? '2026-01-01T10:00:00Z'
            : 'x'

/* Troca comentário por espaço, preservando as quebras de linha para os índices
   não escorregarem. Não trata comentário dentro de string, que não existe no
   `src/lib` e não vale o analisador que custaria. */
const semComentarios = fonte =>
  fonte
    .replace(/\/\*[\s\S]*?\*\//g, trecho => trecho.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/gm, (trecho, antes) => antes + ' '.repeat(trecho.length - antes.length))

/* Os nomes de argumento do objeto que começa depois da vírgula, respeitando
   aninhamento. Só o primeiro nível interessa: são eles que viram parâmetro. */
function argumentosDe(fonte, desde) {
  const abre = fonte.indexOf('{', desde)
  if (abre === -1) return []

  let profundidade = 0
  const nomes = []
  let atual = ''

  for (let i = abre; i < fonte.length; i++) {
    const c = fonte[i]
    if (c === '{' || c === '[') profundidade++
    else if (c === '}' || c === ']') {
      profundidade--
      if (profundidade === 0) break
    }

    if (profundidade === 1) {
      if (c === ',' || c === '{') {
        atual = ''
      } else if (c === ':') {
        const nome = atual.trim()
        if (/^p_[a-z_0-9]+$/.test(nome)) nomes.push(nome)
        atual = ''
      } else atual += c
    }
  }
  return nomes
}

/* As chamadas, tiradas do código. Duas formas: com objeto de argumentos e sem. */
function chamadasDoApp() {
  const achadas = new Map()

  for (const arquivo of readdirSync('src/lib').filter(a => a.endsWith('.ts') && !a.includes('.teste.'))) {
    /* Comentários fora ANTES de qualquer leitura.
     *
     * Sem isto, o comentário que precede um argumento entra junto no nome e o
     * argumento some da conferência — foi o segundo jeito de esta ferramenta
     * acusar `app_salvar_plano` como ausente sendo que ela existe. E um `}`
     * dentro de comentário fecharia o objeto cedo demais.
     *
     * Ferramenta de auditoria que dá alarme falso é pior do que ferramenta
     * nenhuma: ensina a ignorar o alarme. */
    const fonte = semComentarios(readFileSync(`src/lib/${arquivo}`, 'utf8'))

    for (const m of fonte.matchAll(/\.rpc\(\s*'([a-z_0-9]+)'\s*(,)?/g)) {
      const nome = m[1]
      /* O objeto de argumentos tem chaves ANINHADAS — `p_refeicoes` leva uma
         lista de objetos. Um `[^}]*` para na primeira `}` e perde os argumentos
         seguintes, o que faz esta ferramenta acusar como AUSENTE uma função que
         existe. Aconteceu na primeira execução, com `app_salvar_plano`. Por isso
         a leitura conta a profundidade em vez de casar um padrão. */
      const args = m[2] ? argumentosDe(fonte, m.index + m[0].length) : []

      /* Se a mesma função aparece duas vezes, fica a chamada com MAIS
         argumentos: é a que exercita a assinatura inteira. */
      const antes = achadas.get(nome)
      if (!antes || args.length > antes.args.length) achadas.set(nome, { args, arquivo })
    }
  }
  return [...achadas.entries()].sort(([a], [b]) => a.localeCompare(b))
}

/* ── O buraco que o grep não alcança: as RPCs que a Aurora chama do SERVIDOR ──
 *
 * A premissa lá em cima -- "a lista sai do código" -- vale enquanto o app for
 * quem chama. A Aurora da nutricionista quebrou essa premissa: ela pede a
 * ferramenta, a edge function `app-aurora-nutri` (no outro repositório) executa
 * a RPC, e o `src/lib` daqui não tem uma linha com esse nome. Um `grep` neste
 * repositório nunca vai encontrá-las.
 *
 * Só que a consequência de uma assinatura mudada é a MESMA, e pior de achar:
 * não quebra tela nenhuma, não falha teste nenhum -- a nutri toca em Confirmar
 * e lê "Não consegui agendar: could not find function". Por isso elas entram
 * aqui à mão, e a lista escrita à mão é o preço de a chamada morar noutro repo.
 *
 * Ao acrescentar ferramenta nova lá (o registro é
 * `supabase/functions/_shared/ferramentas.ts`, no Nutriviet), acrescente aqui
 * também -- os nomes dos argumentos saem de `rpc.argumentos` daquele arquivo.
 * E acrescente DEPOIS de a migração ter rodado: uma função que ainda não existe
 * no banco aparece aqui como AUSENTE, que é alarme falso, e alarme falso ensina
 * a ignorar o alarme.
 *
 * ── O que ISTO cobre e o que o outro lado cobre ────────────────────────────
 * Existe um segundo teste, no Nutriviet (`oRegistroBateComOBanco.test.ts`), que
 * compara o registro com o SQL das migrações e pega ferramenta nova sozinho, sem
 * lista à mão. Ele NÃO substitui esta lista, e vice-versa:
 *
 *   lá   registro × migração, offline. Passa se a migração foi escrita e nunca
 *        rodou -- e sabe de ferramenta nova sem ninguém lembrar.
 *   aqui a chamada contra o banco DE VERDADE. É a única que sabe o que está NO
 *        AR, e a única que separa "barrada para anônimo" de "executa sem
 *        sessão" (armadilha 14).
 *
 * Uma responde "escrevemos certo?"; a outra, "chegou lá?".
 *
 * Elas são de ESCRITA e são chamadas de verdade, como todas as outras: sem
 * sessão, `get_nutricionista_id()` volta nulo e a RLS de `consultas` recusa o
 * insert. O esperado é 42501, barrada antes disso -- e se um dia aparecer
 * "EXECUTA SEM LOGIN", é a armadilha 14 batendo na porta. */
const DA_AURORA = [
  ['app_agendar_consulta',
    ['p_paciente_id', 'p_data_hora', 'p_duracao', 'p_tipo', 'p_observacoes']],
  ['app_lancar_conta',
    ['p_receber', 'p_descricao', 'p_valor', 'p_data_vencimento', 'p_observacoes',
     'p_paciente_id', 'p_fornecedor_id', 'p_categoria_despesa_id', 'p_parcelas']],
  ['app_cadastrar_paciente',
    ['p_nome', 'p_data_nascimento', 'p_celular', 'p_email', 'p_cpf', 'p_genero']],
  ['app_cadastrar_alimento',
    ['p_nome', 'p_grupo', 'p_calorias', 'p_proteinas', 'p_carboidratos', 'p_gorduras',
     'p_fibras', 'p_porcao_g', 'p_medida_caseira', 'p_medidas']],
  ['app_criar_tag_paciente', ['p_nome', 'p_cor']],
  ['app_vincular_tags_paciente', ['p_paciente_id', 'p_tag_ids']],
  ['app_cadastrar_fornecedor',
    ['p_nome', 'p_cnpj', 'p_telefone', 'p_email', 'p_observacoes']],
  ['app_cadastrar_categoria_despesa', ['p_nome']],
  ['app_cadastrar_forma_pagamento', ['p_nome']],
  ['app_confirmar_consultas', ['p_consulta_ids']],
  ['app_financeiro_no_periodo', ['p_de', 'p_ate']],
  /* Esta tem uma trava a mais DENTRO dela: recusa enquanto a conta não tiver
     aceitado o DPA 1.7. Aqui isso não aparece -- sem sessão ela para antes, no
     42501 -- e é bom lembrar que "existe e está barrada" continua não sendo o
     mesmo que "responde". */
  ['app_dados_do_paciente', ['p_paciente_id']],
]

const chamadas = [
  ...chamadasDoApp(),
  ...DA_AURORA.map(([nome, args]) => [nome, { args, arquivo: 'app-aurora-nutri (servidor)' }]),
].sort(([a], [b]) => a.localeCompare(b))

console.log(
  `\n${chamadas.length} chamadas de RPC` +
  ` (${chamadas.length - DA_AURORA.length} no src/lib, ${DA_AURORA.length} pela Aurora, no servidor)\n`,
)

let ausentes = 0
let executamSemLogin = []

for (const [nome, { args, arquivo }] of chamadas) {
  const corpo = Object.fromEntries(args.map(a => [a, valorPara(a)]))

  let texto
  try {
    const r = await fetch(`${url}/rest/v1/rpc/${nome}`, {
      method: 'POST',
      headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    })
    texto = await r.text()
  } catch (e) {
    console.error(`  REDE     ${nome} — ${e.message}`)
    process.exit(1)
  }

  if (texto.includes('PGRST202')) {
    ausentes++
    console.log(`  AUSENTE  ${nome.padEnd(38)} args(${args.join(', ') || 'nenhum'})  <- ${arquivo}`)
  } else if (texto.includes('42501')) {
    console.log(`  ok       ${nome.padEnd(38)} existe, barrada para anônimo`)
  } else {
    executamSemLogin.push(nome)
    console.log(`  ok       ${nome.padEnd(38)} existe — E EXECUTA SEM LOGIN`)
  }
}

/* Executar sem login não é falha por si: `get_questionario_pre_consulta_publico`
   é pública de propósito, por token. Mas é a pergunta que vale fazer toda vez,
   porque a permissão larga demais entra sem ninguém decidir — o Supabase concede
   EXECUTE a `anon` por padrão, e `revoke ... from public` não tira. */
if (executamSemLogin.length > 0) {
  console.log(`\n${executamSemLogin.length} executam sem sessão — confira se cada uma deve mesmo:`)
  for (const n of executamSemLogin) console.log(`    revoke all on function public.${n} from anon;`)
}

console.log(`\n${chamadas.length - ausentes}/${chamadas.length} presentes\n`)
if (ausentes > 0) process.exit(1)
