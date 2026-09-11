import { adesaoDoPaciente, destaqueDaAdesao, fraseDaAdesao } from './adesaoDoPaciente.ts'

let passou = 0
let falhou = 0

function ok(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) {
    passou++
    console.log('  ok   ' + nome)
  } else {
    falhou++
    console.log('  FALHA ' + nome + (detalhe ? '  -> ' + detalhe : ''))
  }
}

const HOJE = '2026-09-11'

/* Os últimos N dias até `ate`, inclusive. */
const seguidos = (n: number, ate = HOJE): string[] => {
  const [a, m, d] = ate.split('-').map(Number)
  return Array.from({ length: n }, (_, i) =>
    new Date(Date.UTC(a, m - 1, d - i)).toISOString().slice(0, 10),
  )
}

// ── 1. Os dois vazios, que NÃO são a mesma coisa ─────────────────────────────
{
  /* Sem app não é falta de adesão: é outro tipo de acompanhamento. */
  const sem = adesaoDoPaciente(null, HOJE)
  ok('sem app vinculado', sem.tipo === 'sem_app')
  ok('e a frase não acusa', fraseDaAdesao(sem) === 'Não usa o aplicativo.')
  ok('e não vira destaque', destaqueDaAdesao(sem) === null)

  const nunca = adesaoDoPaciente([], HOJE)
  ok('tem app e nunca registrou', nunca.tipo === 'sem_registro')
}

// ── 2. A mesma conta da tela do paciente ─────────────────────────────────────
{
  const r = adesaoDoPaciente(seguidos(21), HOJE)
  ok('21 dias seguidos', r.tipo === 'em_dia' && r.dias === 21, JSON.stringify(r))
  ok('a frase na terceira pessoa', fraseDaAdesao(r) === 'Registra há 21 dias seguidos.')
  ok('e o próximo marco é 30', r.tipo === 'em_dia' && r.proximoMarco === 30)

  /* O perdão é o mesmo: pular um dia não quebra. */
  const comFolga = [...seguidos(5), ...seguidos(5, '2026-09-05')]
  const f = adesaoDoPaciente(comFolga, HOJE)
  ok('pular um dia não quebra', f.tipo === 'em_dia', JSON.stringify(f))
}

// ── 3. Hoje ainda sem registro, ontem com: continua viva ─────────────────────
{
  const r = adesaoDoPaciente(seguidos(10, '2026-09-10'), HOJE)
  ok('o dia não acabou', r.tipo === 'em_dia', JSON.stringify(r))
}

// ── 4. Caiu: quanto tempo sem aparecer, pelo calendário ──────────────────────
{
  const r = adesaoDoPaciente(seguidos(30, '2026-09-02'), HOJE)
  ok('parou há 9 dias', r.tipo === 'parou' && r.haDias === 9, JSON.stringify(r))
  ok('e a frase diz isso', fraseDaAdesao(r) === 'Parou de registrar há 9 dias.')
  /* A sequência de 30 que ela TEVE não aparece: o que a nutricionista precisa
     saber hoje é que ela sumiu, e não o recorde de antes. */
}

// ── 5. O destaque, só nos extremos ───────────────────────────────────────────
{
  ok('7 dias seguidos merece elogio', destaqueDaAdesao(adesaoDoPaciente(seguidos(7), HOJE)) === 'bom')
  ok('3 dias seguidos é ruído', destaqueDaAdesao(adesaoDoPaciente(seguidos(3), HOJE)) === null)
  ok('sumida há 9 dias merece pergunta',
     destaqueDaAdesao(adesaoDoPaciente(seguidos(5, '2026-09-02'), HOJE)) === 'atencao')
  ok('parou anteontem é ruído',
     destaqueDaAdesao(adesaoDoPaciente(seguidos(5, '2026-09-08'), HOJE)) === null)
}

// ── 6. Data suja não entra na conta ──────────────────────────────────────────
{
  /* '2026-02-31' passa no formato e não existe; o JavaScript escorregaria
     para março e contaria um dia que nunca houve. Data futura, idem. */
  const r = adesaoDoPaciente(['2026-02-31', '2026-12-25', 'lixo'], HOJE)
  ok('só data impossível ou futura = nunca registrou', r.tipo === 'sem_registro', JSON.stringify(r))
}

console.log('\n' + passou + ' passaram, ' + falhou + ' falharam')
process.exit(falhou > 0 ? 1 : 0)
