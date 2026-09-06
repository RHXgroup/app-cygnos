import {
  cabeAgora,
  comandoDoTexto,
  naoEntendi,
  RESPOSTA,
  semChamado,
  temChamado,
  type Comando,
} from './comandoDeVoz.ts'

let passou = 0
let falhou = 0
function ok(nome: string, cond: boolean, extra = '') {
  if (cond) {
    passou++
    console.log('  ok    ' + nome)
  } else {
    falhou++
    console.log('  FALHA ' + nome + (extra ? '  ' + extra : ''))
  }
}

// ── 1. O que a pessoa diz de verdade, no meio do treino ─────────────────────
//
// As frases vieram de como se fala com o telefone na academia: curtas, sem
// pontuação, e quase sempre com uma palavra a mais na frente.
{
  console.log('\n1. as frases')
  const casos: [string, Comando | null][] = [
    ['terminei', 'fiz'],
    ['Terminei!', 'fiz'],
    ['ok terminei essa aí', 'fiz'],
    ['acabei', 'fiz'],
    ['pronto', 'fiz'],
    ['fiz', 'fiz'],
    ['pausa', 'pausar'],
    ['pausa aí', 'pausar'],
    ['espera aí', 'pausar'],
    ['continua', 'continuar'],
    ['bora', 'continuar'],
    ['mais tempo', 'mais_descanso'],
    ['me dá mais um pouco', 'mais_descanso'],
    ['menos tempo', 'menos_descanso'],
    ['pula o descanso', 'pular_descanso'],
    ['já tô pronto', 'pular_descanso'],
    ['pode encerrar', 'terminar'],
    ['chega por hoje', 'terminar'],
  ]
  for (const [frase, esperado] of casos) {
    const r = comandoDoTexto(frase)
    ok(`"${frase}" → ${esperado}`, r === esperado, `veio ${r}`)
  }
}

// ── 2. A NEGAÇÃO cancela ────────────────────────────────────────────────────
//
// Este é o caso que custa caro: "ainda não terminei" carrega a palavra do
// comando e quer o contrário. Contar uma série que não aconteceu entra no
// histórico do treino, e ninguém confere depois.
{
  console.log('\n2. negação')
  for (const frase of [
    'ainda não terminei',
    'não terminei',
    'não pausa',
    'nem terminei',
    'não, deixa pra lá',
    'esquece',
  ]) {
    ok(`"${frase}" não faz nada`, comandoDoTexto(frase) === null, String(comandoDoTexto(frase)))
  }
}

// ── 3. Acento, caixa e pontuação não podem decidir ──────────────────────────
{
  console.log('\n3. escrita')
  for (const frase of ['JÁ TÔ PRONTO', 'ja to pronto', 'Já tô pronto!!!', '  já tô pronto  ']) {
    ok(`"${frase}" → pular_descanso`, comandoDoTexto(frase) === 'pular_descanso')
  }
}

// ── 4. Silêncio e ruído não viram comando ───────────────────────────────────
{
  console.log('\n4. nada')
  for (const frase of ['', '   ', '...', 'hmmm', 'aham', 'quanto é meia entrada']) {
    ok(`"${frase}" → nada`, comandoDoTexto(frase) === null, String(comandoDoTexto(frase)))
  }
}

// ── 5. Toda ação tem resposta escrita ───────────────────────────────────────
//
// Ação de voz sem confirmação na tela deixa a pessoa sem saber se a série foi
// contada. Se um comando novo entrar sem resposta, este caso quebra.
{
  console.log('\n5. resposta')
  const comandos: Comando[] = [
    'fiz',
    'pausar',
    'continuar',
    'mais_descanso',
    'menos_descanso',
    'pular_descanso',
    'terminar',
  ]
  for (const c of comandos) {
    ok(`${c} tem resposta`, typeof RESPOSTA[c] === 'string' && RESPOSTA[c].length > 0)
  }
  ok('não entendi repete o que ouviu', naoEntendi('banana').includes('banana'))
  ok('sem áudio tem frase própria', naoEntendi('  ') === 'Não ouvi nada.')
}

// ── 6. A PALAVRA-CHAVE ──────────────────────────────────────────────────────
//
// Ela nao economiza chamada -- para saber que foi dita e preciso transcrever
// antes. O que ela evita e AGIR por engano: num modo maos-livres dentro de uma
// academia o microfone ouve a conversa alheia inteira, e "terminei" dito por
// outra pessoa contaria uma serie que nao aconteceu.
{
  console.log('\n6. chamado')
  const ditos = [
    'Cygnos, terminei',
    'cygnos terminei',
    // o Whisper vai errar o nome, e errar assim:
    'signos terminei',
    'Cisnes, terminei',
    'cignus, terminei',
    'sygnos terminei',
  ]
  for (const d of ditos) {
    ok(`"${d}" tem chamado`, temChamado(d), 'nao reconheceu')
    ok(`"${d}" -> fiz`, comandoDoTexto(semChamado(d)) === 'fiz', String(comandoDoTexto(semChamado(d))))
  }

  // conversa alheia nao tem chamado, e por isso nao age
  for (const d of ['terminei', 'ja acabei essa serie', 'pausa ai mano']) {
    ok(`"${d}" sem chamado`, !temChamado(d))
  }

  // o chamado sozinho nao e comando
  ok('so o nome nao faz nada', comandoDoTexto(semChamado('cygnos')) === null)
}

{
  // ── COMECAR O TREINO ────────────────────────────────────────────────────
  // O comando que faltava. "Cygnos, iniciar treino" era o exemplo pedido, e
  // voltava nulo: sete comandos na lista e nenhum abria o treino. A tela dizia
  // "nao entendi", e de fora isso e indistinguivel de microfone quebrado.
  const abrem = [
    'Cygnos, iniciar treino',
    'cygnos inicia o treino',
    'Cygnos, comecar o treino',
    'signos comeca o treino',
    'Cygnos, vamos treinar',
    'cisnes bora treinar',
    'Cygnos, vamos comecar',
    'Cygnos, iniciar',
    'Cygnos, comecar',
  ]
  for (const d of abrem) {
    ok(`"${d}" tem chamado`, temChamado(d))
    ok(
      `"${d}" -> comecar`,
      comandoDoTexto(semChamado(d)) === 'comecar',
      String(comandoDoTexto(semChamado(d))),
    )
  }

  // As curtas continuam sendo `continuar`: a tela decide, pelo `inicio`, se
  // isso quer dizer retomar ou abrir. So as frases LONGAS foram tomadas.
  for (const d of ['vamos', 'bora', 'continua', 'volta']) {
    ok(`"${d}" continua sendo continuar`, comandoDoTexto(d) === 'continuar', String(comandoDoTexto(d)))
  }

  // E o comando novo nao pode ter roubado nenhum dos sete que ja existiam.
  const naoMudaram: [string, string][] = [
    ['terminei', 'fiz'],
    ['ja fiz', 'fiz'],
    ['pausa', 'pausar'],
    ['espera ai', 'pausar'],
    ['pula o descanso', 'pular_descanso'],
    ['mais tempo', 'mais_descanso'],
    ['menos tempo', 'menos_descanso'],
    ['terminar o treino', 'terminar'],
    ['chega por hoje', 'terminar'],
  ]
  for (const [d, esperado] of naoMudaram) {
    ok(`"${d}" continua ${esperado}`, comandoDoTexto(d) === esperado, String(comandoDoTexto(d)))
  }

  // A negacao cancela tambem o comando novo.
  ok('"nao vamos comecar ainda" nao abre', comandoDoTexto('nao vamos comecar ainda') === null)

  // Toda resposta existe, inclusive a do comando novo: `RESPOSTA[c]` e lido
  // direto na tela, e um buraco ali imprime "undefined" e fala "undefined".
  for (const c of [
    'comecar',
    'fiz',
    'pausar',
    'continuar',
    'mais_descanso',
    'menos_descanso',
    'pular_descanso',
    'terminar',
  ] as const) {
    ok(`RESPOSTA tem ${c}`, typeof RESPOSTA[c] === 'string' && RESPOSTA[c].length > 0)
  }
}

/* == INICIAR SERIE, e o zeramento que ele causava ======================== */
{
  // Pedido palavra por palavra. Casava com o `iniciar` solto de `comecar`, e
  // `comecar()` faz setInicio(Date.now()) -- zerava a hora do treino no meio
  // dele, sem erro nenhum, e a duracao so aparecia errada no fim.
  ok('cygnos iniciar serie NAO comeca o treino', comandoDoTexto('cygnos iniciar serie') === 'continuar')
  ok('inicia a serie', comandoDoTexto('inicia a serie') === 'continuar')
  ok('comecar a serie', comandoDoTexto('comecar a serie') === 'continuar')
  ok('bora pra serie', comandoDoTexto('bora pra serie') === 'continuar')

  // E o treino inteiro continua indo para comecar -- a linha nova nao pode ter
  // roubado as frases que ja funcionavam.
  ok('iniciar treino continua comecando', comandoDoTexto('cygnos iniciar treino') === 'comecar')
  ok('iniciar sozinho continua comecando', comandoDoTexto('cygnos iniciar') === 'comecar')

  // "proxima serie" carrega a palavra `serie` e NAO e este caso: quem diz isso
  // no descanso quer pular o descanso, que e o que ele sempre fez.
  ok('proxima serie continua pulando o descanso', comandoDoTexto('proxima serie') === 'pular_descanso')

  // A negacao continua ganhando de tudo.
  ok('nao inicia a serie nao faz nada', comandoDoTexto('nao inicia a serie') === null)
}

/* == O CHAMADO, e a lista que cresceu ================================== */
{
  // "Cygnos" nao existe no dicionario, e a transcricao devolve o que SOA.
  // Exigir a grafia certa faz o chamado falhar mais do que a conversa alheia
  // acertar -- e o sintoma disso e "o comando de voz nao funciona", sem nada na
  // tela dizendo por que.
  for (const g of ['cygnos', 'signos', 'cignos', 'seguinos', 'zignus', 'cygno']) {
    ok('reconhece "' + g + '"', temChamado(g + ' terminei'))
  }

  /* E o que NAO pode ser chamado, que e a metade que faltava.
   *
   * Eu tinha posto `seguindo`, `seguem nos`, `six nos` e companhia na lista,
   * argumentando que "custa pouco errar para mais". Custa: relatado da
   * academia, "ele fica toda hora falando nao entendi e eu nao to falando
   * nada". Sao palavras comuns, e cada vez que alguem perto dizia uma delas o
   * app se achava chamado.
   *
   * Estes casos existem para a lista nao voltar a crescer por conveniencia. */
  for (const comum of ['seguindo o plano', 'seis nos exercicios', 'segue nos treinos']) {
    ok('NAO e chamado: "' + comum + '"', !temChamado(comum))
  }

  // Com acento e maiuscula, que e como o Whisper costuma devolver.
  ok('reconhece "Cygnos," com pontuacao', temChamado('Cygnos, terminei!'))
  ok('reconhece no meio da frase', temChamado('ok cygnos pula o descanso'))

  // E o chamado sozinho NAO faz nada: ele so libera a frase para o
  // comandoDoTexto, que exige um comando conhecido. E por isso que errar para
  // mais na lista custa pouco.
  ok('chamado sem comando nao vira comando', comandoDoTexto(semChamado('cygnos')) === null)
  ok('palavra qualquer nao e chamado', !temChamado('bora la galera'))

  // O chamado sai do texto antes de procurar o comando -- senao "cygnos
  // iniciar" nao casaria com "iniciar".
  ok('semChamado limpa', semChamado('cygnos iniciar serie').trim() === 'iniciar serie')
}

/* == AS RAIZES, e a colisao que elas quase criaram ===================== */
{
  // Veio de um teste no aparelho: a pessoa disse "Cygnos, iniciar", o audio
  // chegou, foi transcrito, o chamado foi reconhecido -- e o app respondeu "nao
  // entendi". So o verbo nao casou. Whisper devolve o que SOA, e "inicia" por
  // "iniciar" e uma letra de diferenca.
  ok('inicia (sem o r)', comandoDoTexto('cygnos inicia') === 'comecar')
  ok('iniciando', comandoDoTexto('cygnos iniciando') === 'comecar')
  ok('comeca', comandoDoTexto('cygnos comeca') === 'comecar')
  ok('comecei', comandoDoTexto('cygnos comecei') === 'comecar')
  ok('terminou', comandoDoTexto('cygnos terminou') === 'fiz')
  ok('terminado', comandoDoTexto('cygnos terminado') === 'fiz')

  // E a colisao que a raiz quase criou: `a serie` foi tentado na lista de
  // continuar e roubou "proxim(a serie)", que e pular o descanso. Fragmento
  // curto demais rouba a frase do vizinho.
  ok('proxima serie continua pulando descanso', comandoDoTexto('proxima serie') === 'pular_descanso')
  ok('iniciar serie continua sendo a serie', comandoDoTexto('cygnos iniciar serie') === 'continuar')

  // A negacao continua ganhando das raizes.
  ok('nao comeca ainda', comandoDoTexto('cygnos nao comeca ainda') === null)
  ok('ainda nao terminei', comandoDoTexto('cygnos ainda nao terminei') === null)
}

/* == AS TRANSCRICOES REAIS DO APARELHO ================================= */
{
  // Copiadas do log, como sairam. Nenhuma delas escreve "Cygnos" -- o Whisper
  // devolve o que SOA, e prefere palavra de dicionario ao nome que nao conhece.
  const doLog: [string, string | null][] = [
    ['Signos terminais. Signos terminais.', 'fiz'],
    /* `seguindo` saiu da lista de chamados de proposito -- palavra comum demais
       para uma academia. Este caso deixou de ser "vira comando" e passou a ser
       "NAO vira", que e a correcao. */
    ['Signos, iniciar', 'comecar'],
    ['cygnos terminei', 'fiz'],
  ]
  for (const [ouvido, esperado] of doLog) {
    const c = temChamado(ouvido) ? comandoDoTexto(semChamado(ouvido)) : null
    ok('"' + ouvido.slice(0, 34) + '" -> ' + esperado, c === esperado, String(c))
  }

  // E o que NAO pode virar comando: alucinacao do Whisper em cima de ruido.
  // Tambem do log, palavra por palavra.
  const ruido = [
    'Comi picanha, costela, linguica, coxinha, pao de queijo e pao de queijo.',
    'Serie 1 de 4. Descanse 30 segundos. Prepare-se.',
  ]
  for (const r of ruido) {
    const c = temChamado(r) ? comandoDoTexto(semChamado(r)) : null
    ok('ruido nao vira comando: "' + r.slice(0, 30) + '"', c === null, String(c))
  }
}

/* == O QUE CABE EM CADA MOMENTO ======================================== */
{
  const fechado = { aberto: false, descansando: false, naSerie: false }
  const naSerie = { aberto: true, descansando: false, naSerie: true }
  const descanso = { aberto: true, descansando: true, naSerie: false }
  const entre = { aberto: true, descansando: false, naSerie: false }

  // -- Treino fechado: so abrir --------------------------------------------
  ok('fechado aceita comecar', cabeAgora('comecar', fechado))
  ok('fechado aceita continuar', cabeAgora('continuar', fechado))
  for (const c of ['fiz', 'pausar', 'terminar', 'pular_descanso', 'mais_descanso'] as const) {
    ok('fechado recusa ' + c, !cabeAgora(c, fechado))
  }

  // -- Na serie: SO terminei -----------------------------------------------
  //
  // A regra mais importante da lista, e a que impedia o defeito relatado: "eu
  // nao sei o que eu falei, ele concluiu meu treino". Quem esta com o peso na
  // mao nao esta pedindo para acabar a sessao.
  ok('na serie aceita fiz', cabeAgora('fiz', naSerie))
  for (const c of ['terminar', 'pausar', 'comecar', 'continuar', 'pular_descanso',
                   'mais_descanso', 'menos_descanso'] as const) {
    ok('na serie recusa ' + c, !cabeAgora(c, naSerie))
  }

  // -- Descansando ---------------------------------------------------------
  ok('descanso aceita comecar', cabeAgora('comecar', descanso))
  ok('descanso aceita continuar', cabeAgora('continuar', descanso))
  ok('descanso aceita terminar', cabeAgora('terminar', descanso))
  ok('descanso aceita mais tempo', cabeAgora('mais_descanso', descanso))
  ok('descanso aceita menos tempo', cabeAgora('menos_descanso', descanso))
  // "pula" e palavra curta e faz o mesmo que "iniciar" aqui: duas portas para a
  // mesma sala, e uma delas fragil.
  ok('descanso recusa pular', !cabeAgora('pular_descanso', descanso))
  ok('descanso recusa fiz', !cabeAgora('fiz', descanso))

  // -- Entre exercicios ----------------------------------------------------
  ok('entre aceita comecar', cabeAgora('comecar', entre))
  ok('entre aceita terminar', cabeAgora('terminar', entre))
  ok('entre recusa fiz', !cabeAgora('fiz', entre))
  ok('entre recusa pular', !cabeAgora('pular_descanso', entre))

  // -- ENCERRAR o treino so em dois momentos, e nunca no meio da serie ------
  ok(
    'encerrar so cabe fora da serie e com o treino aberto',
    !cabeAgora('terminar', fechado) &&
      !cabeAgora('terminar', naSerie) &&
      cabeAgora('terminar', descanso) &&
      cabeAgora('terminar', entre),
  )
}

console.log(`\n${passou} passaram, ${falhou} falharam`)
if (falhou > 0) process.exit(1)
