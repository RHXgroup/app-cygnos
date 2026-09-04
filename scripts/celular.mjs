/* Sobe o Metro para o celular, descobrindo o IP desta máquina sozinho.
 *
 * ── Por que existe ────────────────────────────────────────────────────────
 * O endereço do PC na rede MUDA. Quem entrega é o roteador, por DHCP, e a
 * troca acontece sem aviso — num único dia de trabalho aqui ele foi
 * 192.168.15.51, depois 192.168.1.18, depois 10.226.17.128 (num ponto de
 * acesso do celular) e depois 192.168.1.8.
 *
 * A cada troca, o servidor continuava mandando o celular buscar no endereço
 * ANTIGO. E o Expo Go falha calado nesse caso: ele não diz "não alcancei o
 * servidor", ele abre com o pacote velho que já tinha guardado. Do lado de
 * quem usa, isso aparece como "o app não mudou nada" ou "caiu de novo" — dois
 * sintomas que não se parecem nem um pouco com a causa.
 *
 * Custou uma tarde inteira de tentativa, e sempre pelo mesmo motivo com número
 * diferente. Um comando que descobre o IP na hora acaba com a classe toda.
 *
 * ── E por que não `--lan` sozinho ────────────────────────────────────────
 * `--lan` deveria fazer isto, e não faz de forma confiável nesta máquina: o
 * Expo procura a placa pelo gateway IPv4, e quando o roteador entrega gateway
 * só em IPv6 a busca falha e ele cai para `localhost` — que no aparelho é o
 * próprio aparelho. Está descrito no AGENTS.md, item "Como rodar".
 *
 * Aqui a escolha é explícita: pega a placa que está ligada e tem endereço de
 * rede local de verdade. */
import { networkInterfaces } from 'node:os'
import { spawn } from 'node:child_process'

/* Endereços que NÃO servem para o celular alcançar:
   - 127.x  é o próprio aparelho
   - 169.254.x é "não consegui endereço", o auto-atribuído do Windows
   - as interfaces virtuais (Docker, WSL, VirtualBox) existem só dentro do PC */
const VIRTUAIS = /(docker|vethernet|wsl|virtualbox|vmware|hyper-v|loopback|bluetooth)/i

function enderecoDaRede() {
  const candidatos = []

  for (const [nome, enderecos] of Object.entries(networkInterfaces())) {
    if (VIRTUAIS.test(nome)) continue
    for (const e of enderecos ?? []) {
      if (e.family !== 'IPv4' || e.internal) continue
      if (e.address.startsWith('169.254.')) continue
      /* Wi-Fi antes de Ethernet: quem está com o celular na mão está na mesma
         rede sem fio, e uma máquina ligada nas duas anunciaria a cabeada — que
         às vezes é outra sub-rede e o celular não alcança. */
      const peso = /wi-?fi|wireless|wlan/i.test(nome) ? 0 : 1
      candidatos.push({ ip: e.address, nome, peso })
    }
  }

  candidatos.sort((a, b) => a.peso - b.peso)
  return candidatos[0] ?? null
}

const achado = enderecoDaRede()

if (!achado) {
  console.error('\n  Não achei nenhum endereço de rede nesta máquina.')
  console.error('  O Wi-Fi está ligado? Se estiver, confira com: ipconfig\n')
  process.exit(1)
}

console.log('')
console.log('  ┌────────────────────────────────────────────────┐')
console.log(`  │  Endereço desta máquina: ${achado.ip.padEnd(21)}│`)
console.log(`  │  Placa: ${achado.nome.slice(0, 37).padEnd(38)}│`)
console.log('  ├────────────────────────────────────────────────┤')
console.log('  │  No Expo Go, se o QR não pegar:                │')
console.log(`  │  exp://${(achado.ip + ':8081').padEnd(40)}│`)
console.log('  └────────────────────────────────────────────────┘')
console.log('')

/* `--lan` continua junto: ele é quem faz o Metro escutar em TODAS as placas.
   Sem ele o servidor sobe só em `::1` (IPv6 local), e aí o celular não alcança
   nem sabendo o endereço certo — outra tarde perdida, também registrada. */
/* `shell: true`, e nao `npx.cmd`.
 *
 * A partir do Node 20, chamar um `.cmd` direto pelo `spawn` no Windows falha
 * com `EINVAL` -- foi uma correcao de seguranca (CVE-2024-27980) que passou a
 * recusar executaveis de shell sem shell. Medido aqui no Node 24.
 *
 * Com `shell: true` quem resolve o `npx` e o proprio interpretador de comandos,
 * que e como a linha seria digitada a mao. */
const filho = spawn('npx expo start --lan ' + process.argv.slice(2).join(' '), {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, REACT_NATIVE_PACKAGER_HOSTNAME: achado.ip },
})

filho.on('exit', codigo => process.exit(codigo ?? 0))
