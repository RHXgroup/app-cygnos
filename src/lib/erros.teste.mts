import { mensagemDoBanco } from './erros.ts'

let passou = 0
let falhou = 0
function ok(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) { passou++; console.log('  ok    ' + nome) }
  else { falhou++; console.log('  FALHA ' + nome + (detalhe ? '  -> ' + detalhe : '')) }
}

const ALT = 'Não consegui fazer isso agora. Verifique a conexão.'
const erro = (message: unknown) => ({ message })

console.log('\n1. o que o BANCO escreveu para alguém ler, passa')

{
  /* As frases reais que as funções do banco levantam hoje. */
  for (const frase of [
    'Esse horário não está mais disponível.',
    'Você ainda não tem uma nutricionista para conversar.',
    'Você já tem um pedido em aberto com essa nutricionista.',
    'Esse código não existe ou já foi usado.',
    'Não é possível cancelar uma consulta que já aconteceu.',
  ]) {
    ok(`passa: "${frase.slice(0, 34)}…"`, mensagemDoBanco(erro(frase), ALT) === frase)
  }
}

console.log('\n2. o que o POSTGRES escreveu, não passa')

{
  /* Todos estes chegam pela MESMA chamada que traz o RAISE. Era isso que ia
     para a tela em inglês, e é o furo que este guarda fecha. */
  for (const cru of [
    'Network request failed',
    'permission denied for function app_enviar_mensagem',
    'JWT expired',
    'duplicate key value violates unique constraint "app_ciclo_dia_unico"',
    'null value in column "nome" of relation "app_metas" violates not-null constraint',
    'invalid input syntax for type uuid: "abc"',
    'relation "app_xpto" does not exist',
    'new row for relation "app_agua_registros" violates check constraint "ml_plausivel"',
    'function public.app_nao_existe(text) does not exist',
    'FetchError: request to https://x.supabase.co failed',
  ]) {
    ok(`barra: "${cru.slice(0, 34)}…"`, mensagemDoBanco(erro(cru), ALT) === ALT, mensagemDoBanco(erro(cru), ALT))
  }
}

console.log('\n3. o caso perigoso: jargão EM PORTUGUÊS')

{
  /* Uma mensagem que tem acento E jargão. O jargão tem de vencer, senão
     "violação de restrição única na relação alimentos" iria para a tela. */
  ok('acento não salva jargão',
    mensagemDoBanco(erro('duplicate key: o alimento "maçã" já existe'), ALT) === ALT,
    mensagemDoBanco(erro('duplicate key: o alimento "maçã" já existe'), ALT))
  ok('permission denied com acento também barra',
    mensagemDoBanco(erro('permission denied: você não pode fazer isso'), ALT) === ALT)
}

console.log('\n4. o lado seguro de errar')

{
  /* Português sem acento nenhum não é reconhecido, e o preço é mostrar a NOSSA
     frase no lugar da dela. É o lado certo de errar: a pessoa lê uma frase de
     gente de qualquer forma. */
  const semAcento = 'Esse codigo nao existe ou ja foi usado'
  ok('português sem acento cai na nossa frase (documentado)',
    mensagemDoBanco(erro(semAcento), ALT) === ALT, mensagemDoBanco(erro(semAcento), ALT))
}

console.log('\n5. entrada torta não derruba')

{
  ok('sem message', mensagemDoBanco({}, ALT) === ALT)
  ok('message nula', mensagemDoBanco(erro(null), ALT) === ALT)
  ok('message número', mensagemDoBanco(erro(42), ALT) === ALT)
  ok('message objeto', mensagemDoBanco(erro({ a: 1 }), ALT) === ALT)
  ok('erro null', mensagemDoBanco(null, ALT) === ALT)
  ok('erro undefined', mensagemDoBanco(undefined, ALT) === ALT)
  ok('erro string solta', mensagemDoBanco('só um texto', ALT) === ALT)
  ok('vazio', mensagemDoBanco(erro(''), ALT) === ALT)
  ok('só espaço', mensagemDoBanco(erro('     '), ALT) === ALT)
}

{
  /* Curto demais não é frase. "Erro." tem acento e nenhum jargão, e passaria. */
  ok('texto de 9 caracteres não passa', mensagemDoBanco(erro('Erro é.'), ALT) === ALT,
    mensagemDoBanco(erro('Erro é.'), ALT))
  ok('texto de 10 já passa', mensagemDoBanco(erro('Não deu não'), ALT) === 'Não deu não')
}

{
  /* Longo demais é despejo de stack, não frase para ler. */
  const enorme = 'Não consegui. ' + 'ç'.repeat(400)
  ok('texto de 400+ não passa', mensagemDoBanco(erro(enorme), ALT) === ALT)
}

{
  const comEspaco = '   Esse horário não está mais disponível.   '
  ok('espaço em volta é aparado',
    mensagemDoBanco(erro(comEspaco), ALT) === 'Esse horário não está mais disponível.')
}

console.log('\n' + passou + ' passaram, ' + falhou + ' falharam')
if (falhou > 0) process.exit(1)
