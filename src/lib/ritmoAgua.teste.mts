import {
  ACORDA_PADRAO,
  DORME_PADRAO,
  daquiA,
  janelaAcordada,
  relogio,
  ritmoDaAgua,
  type Janela,
} from './ritmoAgua.ts'

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

const h = (hora: number, min = 0) => hora * 60 + min
const noite = (data: string, deitou: string, levantou: string) => ({ data, deitou, levantou })

// ── 1. A janela sai da mediana das noites ────────────────────────────────────
{
  console.log('\n1. janela a partir do sono')

  const j = janelaAcordada([
    noite('2026-08-28', '23:00', '07:00'),
    noite('2026-08-27', '23:30', '06:30'),
    noite('2026-08-26', '22:30', '07:30'),
  ])
  ok('acorda na mediana dos levantares', j.acordaEm === h(7), relogio(j.acordaEm))
  ok('dorme na mediana dos deitares', j.dormeEm === h(23), relogio(j.dormeEm))
  ok('não é suposta', j.suposta === false)
}

// ── 2. Deitar depois da meia-noite não bagunça a mediana ─────────────────────
{
  console.log('\n2. deitar cruzando a meia-noite')

  /* 23:00, 00:30 e 01:00. A mediana crua daria 60 (uma da manhã tratada como
     "cedo"), e o certo é 00:30. */
  const j = janelaAcordada([
    noite('2026-08-28', '00:30', '08:00'),
    noite('2026-08-27', '23:00', '08:00'),
    noite('2026-08-26', '01:00', '08:00'),
  ])
  ok('mediana entende a madrugada', j.dormeEm === h(0, 30), relogio(j.dormeEm))

  /* Todas de madrugada. */
  const k = janelaAcordada([
    noite('2026-08-28', '00:30', '08:00'),
    noite('2026-08-27', '01:00', '08:30'),
    noite('2026-08-26', '00:00', '07:30'),
  ])
  ok('todas de madrugada continuam certas', k.dormeEm === h(0, 30), relogio(k.dormeEm))
}

// ── 3. Sem noite registrada, cai no padrão e ADMITE ──────────────────────────
{
  console.log('\n3. sem sono registrado')

  const j = janelaAcordada([])
  ok('acorda no padrão', j.acordaEm === ACORDA_PADRAO)
  ok('dorme no padrão', j.dormeEm === DORME_PADRAO)
  ok('marcada como suposta', j.suposta === true)

  const k = janelaAcordada([noite('2026-08-28', 'ontem', 'de manhã')])
  ok('horário ilegível também cai no padrão', k.suposta === true)
}

// ── 4. O esperado ao longo do dia ────────────────────────────────────────────
{
  console.log('\n4. quanto era para ter bebido')

  const janela: Janela = { acordaEm: h(7), dormeEm: h(23), suposta: false }
  const base = { metaMl: 2000, copoMl: 250, janela }

  const em = (hora: number, bebido = 0) =>
    ritmoDaAgua({ ...base, bebidoMl: bebido, agoraEmMinutos: h(hora) })

  ok('às 7h ainda não se cobra nada', em(7).esperadoMl === 0, String(em(7).esperadoMl))
  ok('às 15h espera metade', em(15).esperadoMl === 1000, String(em(15).esperadoMl))
  ok('às 23h espera a meta', em(23).esperadoMl === 2000, String(em(23).esperadoMl))
  ok('nunca passa da meta', em(22).esperadoMl <= 2000, String(em(22).esperadoMl))
  ok('sempre múltiplo do copo', [7, 9, 11, 13, 15, 17, 19, 21].every(x => em(x).esperadoMl % 250 === 0))
}

// ── 5. Adiantado, em dia, atrasado ───────────────────────────────────────────
{
  console.log('\n5. como se lê a diferença')

  const janela: Janela = { acordaEm: h(7), dormeEm: h(23), suposta: false }
  const em = (hora: number, bebido: number) =>
    ritmoDaAgua({ metaMl: 2000, copoMl: 250, bebidoMl: bebido, janela, agoraEmMinutos: h(hora) })

  ok('meio-dia com 625 ml é em dia', em(12, 625).situacao === 'em_dia', em(12, 625).situacao)
  ok('meio-dia com 250 ml é atrasado', em(12, 250).situacao === 'atrasado', em(12, 250).situacao)
  ok('meio-dia com 1500 ml é adiantado', em(12, 1500).situacao === 'adiantado', em(12, 1500).situacao)
  ok('diferença tem sinal certo no atraso', em(12, 250).diferencaMl < 0)
  ok('bateu a meta é concluído', em(12, 2000).situacao === 'concluido', em(12, 2000).situacao)
  ok('passou da meta continua concluído', em(12, 3000).situacao === 'concluido')

  /* Meio copo de tolerância para cada lado: 125 ml não vira aviso. */
  const esperadoAoMeioDia = em(12, 0).esperadoMl
  ok('tolerância de meio copo abaixo', em(12, esperadoAoMeioDia - 120).situacao === 'em_dia')
  ok('tolerância de meio copo acima', em(12, esperadoAoMeioDia + 120).situacao === 'em_dia')
}

// ── 6. O caso do Helton: sete copos às 22h ───────────────────────────────────
{
  console.log('\n6. tudo de uma vez, tarde da noite')

  const janela: Janela = { acordaEm: h(7), dormeEm: h(23), suposta: false }

  const antes = ritmoDaAgua({
    metaMl: 2000, copoMl: 250, bebidoMl: 0, janela, agoraEmMinutos: h(22),
  })
  ok('às 22h sem beber nada: atrasado', antes.situacao === 'atrasado', antes.situacao)
  ok('e o atraso é grande', antes.diferencaMl <= -1500, String(antes.diferencaMl))

  /* Sete copos de uma vez às 22h22 NÃO deixam em dia, e é esse o recado inteiro
     da funcionalidade: às 22h22 o esperado já é a meta cheia, então 1.750 de
     2.000 continua um copo atrás. O total do dia dizia "87%" e o ritmo diz o
     que aconteceu de verdade. */
  const depois = ritmoDaAgua({
    metaMl: 2000, copoMl: 250, bebidoMl: 1750, janela, agoraEmMinutos: h(22, 22),
  })
  ok('sete copos de uma vez ainda deixam atrasado', depois.situacao === 'atrasado', depois.situacao)
  ok('e falta exatamente um copo', depois.diferencaMl === -250, String(depois.diferencaMl))
}

// ── 7. Fora da janela ────────────────────────────────────────────────────────
{
  console.log('\n7. antes de acordar e depois de dormir')

  const janela: Janela = { acordaEm: h(7), dormeEm: h(23), suposta: false }

  const madrugada = ritmoDaAgua({
    metaMl: 2000, copoMl: 250, bebidoMl: 0, janela, agoraEmMinutos: h(3),
  })
  ok('às 3h não cobra nada', madrugada.esperadoMl === 0, String(madrugada.esperadoMl))
  ok('e não chama de atrasado', madrugada.situacao === 'em_dia', madrugada.situacao)

  const tarde = ritmoDaAgua({
    metaMl: 2000, copoMl: 250, bebidoMl: 500, janela, agoraEmMinutos: h(23, 30),
  })
  ok('depois de dormir vira fora_da_janela', tarde.situacao === 'fora_da_janela', tarde.situacao)
  ok('e não sugere próximo copo', tarde.emMinutos === null)
}

// ── 8. Quem trabalha à noite ─────────────────────────────────────────────────
{
  console.log('\n8. janela que cruza a meia-noite')

  /* Acorda às 22h, dorme às 6h. */
  const janela: Janela = { acordaEm: h(22), dormeEm: h(6), suposta: false }
  const em = (hora: number, min = 0) =>
    ritmoDaAgua({ metaMl: 2000, copoMl: 250, bebidoMl: 0, janela, agoraEmMinutos: h(hora, min) })

  ok('às 22h começa do zero', em(22).esperadoMl === 0, String(em(22).esperadoMl))
  ok('às 2h da manhã espera metade', em(2).esperadoMl === 1000, String(em(2).esperadoMl))
  ok('às 6h espera a meta', em(6).esperadoMl === 2000, String(em(6).esperadoMl))
  ok('às 12h (dormindo) é fora da janela', em(12).situacao === 'fora_da_janela', em(12).situacao)
}

// ── 9. O próximo copo ────────────────────────────────────────────────────────
{
  console.log('\n9. quando cai o próximo copo')

  const janela: Janela = { acordaEm: h(7), dormeEm: h(23), suposta: false }
  const r = ritmoDaAgua({
    metaMl: 2000, copoMl: 250, bebidoMl: 0, janela, agoraEmMinutos: h(7),
  })
  /* 8 copos em 16 horas = um a cada 2 horas. */
  ok('primeiro copo em 2h', r.emMinutos === 120, String(r.emMinutos))

  const meio = ritmoDaAgua({
    metaMl: 2000, copoMl: 250, bebidoMl: 1000, janela, agoraEmMinutos: h(15),
  })
  ok('com metade bebida às 15h, próximo em 2h', meio.emMinutos === 120, String(meio.emMinutos))

  const fim = ritmoDaAgua({
    metaMl: 2000, copoMl: 250, bebidoMl: 1750, janela, agoraEmMinutos: h(22, 50),
  })
  ok('o último copo não é agendado depois da hora de dormir', fim.emMinutos === null, String(fim.emMinutos))
}

// ── 10. Apresentação ─────────────────────────────────────────────────────────
{
  console.log('\n10. como os números viram texto')

  ok('40 minutos', daquiA(40) === 'em 40 min', daquiA(40))
  ok('uma hora cheia', daquiA(60) === 'em 1h', daquiA(60))
  ok('uma hora e vinte', daquiA(80) === 'em 1h20', daquiA(80))
  ok('duas horas e cinco', daquiA(125) === 'em 2h05', daquiA(125))
  ok('relógio de 7h', relogio(h(7)) === '07:00', relogio(h(7)))
  ok('relógio de 23h30', relogio(h(23, 30)) === '23:30', relogio(h(23, 30)))
  ok('relógio dá a volta', relogio(h(25)) === '01:00', relogio(h(25)))
}

console.log('\n' + passou + ' passaram, ' + falhou + ' falharam')
process.exit(falhou > 0 ? 1 : 0)
