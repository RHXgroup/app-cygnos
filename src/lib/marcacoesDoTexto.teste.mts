import { comMarcacoes, semMarcacoes } from './marcacoesDoTexto.ts'

let falhas = 0
const ok = (cond: boolean, nome: string) => {
  console.log(cond ? '  ok    ' + nome : '  FALHOU ' + nome)
  if (!cond) falhas++
}

console.log('\nmarcacoes do texto do documento\n')

/* ── o que vira tag ── */
ok(comMarcacoes('**CLÁUSULA 1ª**') === '<strong>CLÁUSULA 1ª</strong>', 'negrito')
ok(comMarcacoes('_assim_') === '<em>assim</em>', 'italico')
ok(comMarcacoes('__assim__') === '<u>assim</u>', 'sublinhado, e nao dois italicos')
ok(comMarcacoes('==isto==') === '<mark>isto</mark>', 'marca-texto')
ok(comMarcacoes('++maior++').includes('grande'), 'grande')
ok(comMarcacoes('~~menor~~').includes('pequeno'), 'pequeno')

/* ── dois destaques na mesma linha ── */
{
  const r = comMarcacoes('**um** no meio **dois**')
  ok(r === '<strong>um</strong> no meio <strong>dois</strong>', 'dois negritos nao viram um so')
  ok(r.includes('no meio'), 'e o que esta entre eles nao e engolido')
}

/* ── A LINHA DE ASSINATURA, que foi o defeito ── */
{
  const contrato =
    '_______________________________________\nCONTRATADA — Renan — CRN 12345\n' +
    '_______________________________________\nCONTRATANTE — Maria Alves — CPF 123'
  const r = comMarcacoes(contrato)
  ok(r.includes('CONTRATADA — Renan — CRN 12345'), 'o nome de quem assina primeiro continua la')
  ok(r.includes('CONTRATANTE — Maria Alves — CPF 123'), 'e o de quem assina depois TAMBEM')
  ok(!r.includes('<u>'), 'o tracejado nao virou sublinhado')
  ok((r.match(/class="assinar"/g) ?? []).length === 2, 'os dois tracejados viraram linha de assinar')
}
{
  const testemunha = '1. Nome: ______________________ CPF: ____________'
  const r = comMarcacoes(testemunha)
  ok(r.includes('CPF:'), 'a linha da testemunha mantem o rotulo do CPF')
  ok(!r.includes('<u>'), 'e nao sublinha o que esta entre os dois tracejados')
}
ok(!//.test(comMarcacoes('____ x ____')), 'o marcador de posicao NAO sobra no texto')
ok(
  comMarcacoes('Paguei 300 e 500').includes('300') &&
    !comMarcacoes('Paguei 300 e 500').includes('assinar'),
  'numero solto no texto nao vira linha de assinatura',
)

/* ── o que NAO pode virar tag ── */
ok(comMarcacoes('a &lt; b') === 'a &lt; b', 'texto ja escapado passa intacto')
ok(comMarcacoes('') === '', 'vazio')
ok(comMarcacoes('sem marcacao nenhuma') === 'sem marcacao nenhuma', 'texto simples nao muda')
ok(comMarcacoes('2 ** 3 = 8').includes('**'), 'asterisco solto, sem par, fica como esta')

/* ── a versao da tela ── */
ok(semMarcacoes('**CLÁUSULA 1ª**') === 'CLÁUSULA 1ª', 'na tela o negrito some e o texto fica')
ok(semMarcacoes('~~1. Nome: ____~~') === '1. Nome: ____', 'o pequeno some e o tracejado fica')
ok(semMarcacoes('==destaque== e _italico_') === 'destaque e italico', 'os dois de uma vez')
ok(semMarcacoes('nada aqui') === 'nada aqui', 'texto simples nao muda')

/* ── texto grande nao pode ficar lento nem estourar ── */
{
  const grande = ('**CLÁUSULA**\n_______________________\nCONTRATADA — Renan\n').repeat(3000)
  const t0 = Date.now()
  const r = comMarcacoes(grande)
  ok(Date.now() - t0 < 2000, 'um contrato gigante converte em menos de dois segundos')
  ok((r.match(/CONTRATADA/g) ?? []).length === 3000, 'e nenhuma linha se perde no caminho')
}

console.log('\n' + (falhas === 0 ? 'todos passaram' : falhas + ' falharam') + '\n')
process.exit(falhas === 0 ? 0 : 1)
