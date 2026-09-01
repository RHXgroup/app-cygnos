import {
  DEGRAUS,
  comArtigo,
  OFERTAS_PARA_SABER,
  apoioDoRegistro,
  convitePraCrianca,
  degrauDe,
  fraseDoRegistro,
  porMes,
  proximoDegrau,
  REACOES,
  reacaoDoBanco,
  resumoDoAlimento,
  type Registro,
} from './escadaDaAceitacao.ts'

/* A escada de aceitação.
 *
 * O que se testa aqui não é aritmética — é uma promessa: NADA devolve derrota.
 * Exposição com emoção negativa reforça a rejeição, então uma frase errada aqui
 * não é feiúra de texto, é efeito clínico ao contrário.
 *
 * Por isso há um bloco inteiro só para o degrau 1. */

let passou = 0
let falhou = 0

function ok(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) {
    passou++
    console.log('  ok    ' + nome)
  } else {
    falhou++
    console.log('  FALHA ' + nome + (detalhe ? '  -> ' + detalhe : ''))
  }
}

const reg = (data: string, aceitacao: string | null, reacao: string | null = null): Registro => ({
  data,
  aceitacao,
  reacao,
})

console.log('\nescadaDaAceitacao\n')

/* ── A escada em si ────────────────────────────────────────────────────────*/
{
  ok('sete degraus', DEGRAUS.length === 7)
  ok('alturas de 1 a 7, em ordem', DEGRAUS.every((d, i) => d.nivel === i + 1))
  ok('recusar é o primeiro', DEGRAUS[0].chave === 'recusou' && DEGRAUS[0].nivel === 1)
  ok('comer é o último', DEGRAUS[6].chave === 'comer')

  const sentidos = new Set(DEGRAUS.map(d => d.sentido))
  ok('cada degrau tem o seu sentido', sentidos.size === 7)

  /* Os três vocabulários existem em todos, senão uma tela cai em branco. */
  ok(
    'todo degrau fala com a mãe e com a criança',
    DEGRAUS.every(d => d.paraMae && d.cena && d.paraFilho),
  )
}

/* ── Os valores EXATOS que o banco espera ─────────────────────────────────
 *
 * Este bloco existe por causa de um quase-erro. Numa revisão, a sessão do
 * sistema apontou que o app usaria `'recusa'` onde a coluna `aceitacao` guarda
 * `'recusou'`. Era falso alarme — a `chave` sempre esteve certa, e o que ela
 * viu era o campo de desenho —, mas o alerta estava bem colocado: divergência
 * de grafia entre app e banco **passa no teste de unidade e falha no insert**,
 * em produção, no aparelho de alguém.
 *
 * Então os nomes ficam escritos aqui, à mão, um por um. Não derivados de
 * DEGRAUS: derivar do próprio código sob teste não prova nada — provaria que a
 * lista é igual a si mesma. Estes são os nomes das categorias da Escalada
 * Alimentar do sistema, e se alguém renomear um degrau, isto quebra. */
{
  const NO_BANCO = ['recusou', 'tolerar', 'interagir', 'cheirar', 'tocar', 'provar', 'comer']
  ok('as chaves são exatamente as do banco', DEGRAUS.map(d => d.chave).join(',') === NO_BANCO.join(','),
     DEGRAUS.map(d => d.chave).join(','))

  const NA_REACAO = ['positiva', 'neutra', 'negativa']
  ok('e as reações também', REACOES.map(r => r.noBanco).join(',') === NA_REACAO.join(','),
     REACOES.map(r => r.noBanco).join(','))

  /* O campo de desenho não pode parecer valor de banco — foi o que confundiu o
     revisor. Nenhum `sentido` pode coincidir com uma chave. */
  const chaves = new Set(DEGRAUS.map(d => String(d.chave)))
  const colisao = DEGRAUS.filter(d => chaves.has(String(d.sentido))).map(d => d.sentido)
  ok('nenhum sentido se confunde com uma chave', colisao.length === 0, colisao.join(','))
}

/* ── Valor do banco não indexa direto ──────────────────────────────────────
 *
 * `registros_exposicao.aceitacao` tem valores legados gravados, e o histórico
 * de um paciente antigo passa por aqui. Armadilha 10 do AGENTS.md. */
{
  ok('valor atual resolve', degrauDe('cheirar')?.nivel === 4)
  ok('legado "aceitou" vira comer', degrauDe('aceitou')?.chave === 'comer')
  ok('legado "tolerou" vira tolerar', degrauDe('tolerou')?.chave === 'tolerar')
  ok('legado "provou" vira provar', degrauDe('provou')?.chave === 'provar')
  ok('legado "interacao_parcial" vira interagir', degrauDe('interacao_parcial')?.chave === 'interagir')

  ok('valor desconhecido devolve null, e não estoura', degrauDe('coisa_nova') === null)
  ok('null devolve null', degrauDe(null) === null)
  ok('vazio devolve null', degrauDe('') === null)
  ok('undefined devolve null', degrauDe(undefined) === null)
}

/* ── A reação, e o que não pode se perder na tradução ──────────────────────*/
{
  ok('positiva vira tranquilo', reacaoDoBanco('positiva') === 'tranquilo')
  ok('neutra vira indiferente', reacaoDoBanco('neutra') === 'indiferente')
  ok('negativa vira difícil', reacaoDoBanco('negativa') === 'dificil')

  /* A tela não OFERECE "agitada", mas a nutricionista registra — e é ela que
     alimenta o alerta das duas em três. Perder isso apagaria o alerta. */
  ok('agitada também é difícil', reacaoDoBanco('agitada') === 'dificil')
  ok('valor novo não estoura', reacaoDoBanco('eufórica') === null)
}

/* ── O resumo ──────────────────────────────────────────────────────────────*/
{
  const vazio = resumoDoAlimento([])
  ok('sem registro: nada afirmado', vazio.ofertas === 0 && vazio.atual === null && vazio.recorde === null)
  ok('sem registro não há passo', vazio.passo === null)
  ok('sem registro não pede atenção', vazio.pedeAtencao === false)
}

{
  const r = resumoDoAlimento([
    reg('2026-03-02', 'recusou'),
    reg('2026-03-09', 'tolerar'),
    reg('2026-03-16', 'cheirar'),
  ])
  ok('conta as ofertas', r.ofertas === 3)
  ok('o atual é o último', r.atual?.chave === 'cheirar')
  ok('o recorde é o mais alto', r.recorde?.chave === 'cheirar')
  ok('subiu', r.passo === 'subiu')
}

{
  /* A escada DESCE, e descer faz parte. O atual e o recorde separam-se, e é
     exatamente por isso que os dois existem. */
  const r = resumoDoAlimento([
    reg('2026-03-02', 'provar'),
    reg('2026-03-09', 'tolerar'),
  ])
  ok('desceu', r.passo === 'desceu')
  ok('o atual acompanha a descida', r.atual?.chave === 'tolerar')
  ok('mas o recorde guarda até onde chegou', r.recorde?.chave === 'provar')
}

{
  const r = resumoDoAlimento([reg('2026-03-02', 'tocar'), reg('2026-03-09', 'tocar')])
  ok('igual é igual', r.passo === 'igual')
}

{
  /* Fora de ordem: o banco não promete ordenação, e a mãe pode registrar uma
     oferta esquecida de ontem. */
  const r = resumoDoAlimento([
    reg('2026-03-16', 'comer'),
    reg('2026-03-02', 'recusou'),
    reg('2026-03-09', 'cheirar'),
  ])
  ok('ordena antes de concluir', r.atual?.chave === 'comer' && r.passo === 'subiu')
}

{
  /* Registro sem aceitação não some da contagem de ofertas — a oferta
     aconteceu —, mas não vira degrau. */
  const r = resumoDoAlimento([reg('2026-03-02', 'tolerar'), reg('2026-03-09', null)])
  ok('oferta sem degrau ainda conta como oferta', r.ofertas === 2)
  ok('e não inventa degrau', r.atual?.chave === 'tolerar')
}

{
  const lixo = resumoDoAlimento([reg('nao é data', 'comer'), reg('2026-03-02', 'tolerar')])
  ok('data inválida é descartada, sem derrubar', lixo.ofertas === 1 && lixo.atual?.chave === 'tolerar')
}

/* ── O limite das cinco ofertas ────────────────────────────────────────────*/
{
  const quatro = resumoDoAlimento(
    ['2026-03-02', '2026-03-09', '2026-03-16', '2026-03-23'].map(d => reg(d, 'cheirar')),
  )
  ok('com quatro, ainda não', quatro.jaDaParaSaber === false)

  const cinco = resumoDoAlimento(
    ['2026-03-02', '2026-03-09', '2026-03-16', '2026-03-23', '2026-03-30'].map(d => reg(d, 'cheirar')),
  )
  ok('com cinco, já dá para saber', cinco.jaDaParaSaber === true)
  ok('e o limite é cinco', OFERTAS_PARA_SABER === 5)
}

/* ── O alerta de reação, que é o alerta DELA ───────────────────────────────*/
{
  const duasEmTres = resumoDoAlimento([
    reg('2026-03-02', 'tolerar', 'positiva'),
    reg('2026-03-09', 'recusou', 'negativa'),
    reg('2026-03-16', 'recusou', 'agitada'),
  ])
  ok('duas difíceis nas últimas três pede atenção', duasEmTres.pedeAtencao === true)

  const umaEmTres = resumoDoAlimento([
    reg('2026-03-02', 'tolerar', 'negativa'),
    reg('2026-03-09', 'cheirar', 'positiva'),
    reg('2026-03-16', 'tocar', 'neutra'),
  ])
  ok('uma difícil não basta', umaEmTres.pedeAtencao === false)

  /* Antigas não contam: a janela é das últimas três, e uma fase ruim superada
     não pode assombrar o alimento para sempre. */
  const antigas = resumoDoAlimento([
    reg('2026-03-02', 'recusou', 'negativa'),
    reg('2026-03-09', 'recusou', 'negativa'),
    reg('2026-03-16', 'cheirar', 'positiva'),
    reg('2026-03-23', 'tocar', 'positiva'),
    reg('2026-03-30', 'provar', 'positiva'),
  ])
  ok('fase ruim superada não assombra', antigas.pedeAtencao === false)

  const duas = resumoDoAlimento([
    reg('2026-03-02', 'recusou', 'negativa'),
    reg('2026-03-09', 'recusou', 'negativa'),
  ])
  ok('com menos de três não conclui', duas.pedeAtencao === false)
}

/* ── NADA devolve derrota ──────────────────────────────────────────────────
 *
 * O bloco mais importante do arquivo. */
{
  const recusa = DEGRAUS[0]
  const r = resumoDoAlimento([reg('2026-03-02', 'recusou')])

  const frase = fraseDoRegistro(recusa, r)
  const apoio = apoioDoRegistro(recusa, r)

  ok('a recusa tem frase própria', frase === 'Tudo bem. Encontrar já conta.')
  ok('e o apoio diz que recusar é degrau', apoio.includes('primeiro degrau'))

  const PROIBIDAS = /fracass|falh|infeliz|que pena|não conseguiu|perdeu|errou|tente mais|insist/i
  const tudo = DEGRAUS.flatMap(d => {
    const res = resumoDoAlimento([reg('2026-03-02', d.chave)])
    return [fraseDoRegistro(d, res), apoioDoRegistro(d, res), convitePraCrianca(d)]
  }).join(' | ')

  ok('nenhuma frase da escada culpa alguém', !PROIBIDAS.test(tudo), tudo)
  ok('e nenhuma sai vazia', DEGRAUS.every(d => fraseDoRegistro(d, resumoDoAlimento([])).length > 0))
}

{
  /* Ninguém é parabenizado por um degrau baixo — soa falso e corrói a
     confiança no resto da tela. */
  const meio = DEGRAUS[3]
  const r = resumoDoAlimento([reg('2026-03-02', 'tolerar'), reg('2026-03-09', 'cheirar')])
  ok('subir não vira festa', fraseDoRegistro(meio, r) === 'Ele chegou mais perto que da última vez.')
  ok('comer tem a frase mais forte, e é sóbria', fraseDoRegistro(DEGRAUS[6], r) === 'Ele comeu.')
}

{
  /* O apoio muda quando o alerta acende, e ele manda PARAR — nunca insistir. */
  const dificil = resumoDoAlimento([
    reg('2026-03-02', 'recusou', 'negativa'),
    reg('2026-03-09', 'recusou', 'agitada'),
    reg('2026-03-16', 'tolerar', 'neutra'),
  ])
  const texto = apoioDoRegistro(DEGRAUS[1], dificil)
  /* O que importa nao e a palavra, e a DIRECAO: aliviar, nunca insistir. O
     alerta do sistema dela diz "considere recuar um degrau e reduzir a
     exigencia", e o app tem de apontar para o mesmo lado. */
  ok('quando pede atenção, manda ALIVIAR', /recuar|baixar a exigência|reduzir/.test(texto), texto)
  ok('e nunca manda insistir', !/tente de novo|insist|amanhã de novo/i.test(texto), texto)
  ok('e manda falar com a nutricionista', /nutricionista/.test(texto), texto)
}

/* ── A tela que a mãe vira para o filho ────────────────────────────────────*/
{
  ok('sem registro, o convite é para conhecer', convitePraCrianca(null) === 'Vamos conhecer esse aqui?')
  ok('no topo não há próximo', proximoDegrau(DEGRAUS[6]) === null)
  ok('e o convite vira chegada', convitePraCrianca(DEGRAUS[6]) === 'Você já come esse!')

  ok('do meio há próximo', proximoDegrau(DEGRAUS[2])?.chave === 'cheirar')
  const convite = convitePraCrianca(DEGRAUS[2])
  ok('o convite é em primeira pessoa', /cheirei/i.test(convite), convite)

  /* Nenhum número na fala com a criança: ela reconhece o que fez, não a
     posição numa escala. */
  ok(
    'nada de número na fala com a criança',
    DEGRAUS.every(d => !/\d/.test(convitePraCrianca(d)) && !/\d/.test(d.paraFilho)),
  )
}

/* ── Mês a mês ─────────────────────────────────────────────────────────────*/
{
  const meses = porMes([
    reg('2026-03-02', 'recusou'),
    reg('2026-03-20', 'tolerar'),
    reg('2026-04-05', 'cheirar'),
    reg('2026-06-11', 'comer'),
  ])
  ok('um por mês', meses.length === 3)
  ok('em ordem', meses.map(m => m.mes).join(',') === '2026-03,2026-04,2026-06')
  ok('o mês guarda o MAIS ALTO, não o último', meses[0].degrau.chave === 'tolerar')
  ok('e o mês vazio não vira zero', !meses.some(m => m.mes === '2026-05'))
}

{
  const semDegrau = porMes([reg('2026-03-02', null), reg('2026-03-09', 'tocar')])
  ok('registro sem degrau não cria mês', semDegrau.length === 1 && semDegrau[0].degrau.chave === 'tocar')
  ok('e nenhum mês vem sem degrau', porMes([reg('2026-03-02', null)]).length === 0)
}

/* ── O artigo do alimento ──────────────────────────────────────────────────
 *
 * "Como foi com O cenoura?" desfaz num instante o cuidado de toda a tela. */
{
  ok('feminino pela primeira palavra', comArtigo('cenoura') === 'a cenoura')
  ok('e o núcleo vem primeiro', comArtigo('Cenoura cozida em cubos') === 'a cenoura cozida em cubos')
  ok('masculino no resto', comArtigo('brócolis') === 'o brócolis')
  ok('composto masculino', comArtigo('Brócolis no vapor') === 'o brócolis no vapor')
  ok('abobrinha é feminina', comArtigo('abobrinha refogada') === 'a abobrinha refogada')

  ok('nome vazio não vira artigo solto', comArtigo('') === 'o alimento')
  ok('só espaços idem', comArtigo('   ') === 'o alimento')
  ok('espaço a mais some', comArtigo('  arroz   integral  ') === 'o arroz integral')

  /* Nunca sai com "undefined", nem com espaço duplo — é texto que entra numa
     pergunta feita a uma pessoa. */
  const amostras = ['Maçã', 'PÃO', 'ovo', 'Batata-doce', 'iogurte natural', '  peixe ']
  const saidas = amostras.map(comArtigo)
  ok('sempre começa com o ou a', saidas.every(x => /^[oa] /.test(x)), saidas.join(' | '))
  ok('nunca sai undefined nem espaço duplo', !saidas.some(x => /undefined|  /.test(x)), saidas.join(' | '))
}

console.log(`\n${passou} ok, ${falhou} falha(s)\n`)
if (falhou > 0) process.exit(1)
