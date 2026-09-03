import { registerRootComponent } from 'expo'

import App from './App'

/* ── TODA PROMESSA REJEITADA VAI PARA O TERMINAL ──────────────────────────
 *
 * O LogBox mostra "undefined is not a function" com a pilha do encanamento do
 * React Native, e não do app — quem lê no aparelho não consegue dizer de onde
 * veio, e quem lê o código não consegue adivinhar.
 *
 * Isto imprime a mensagem E a pilha no console do Metro, com o prefixo
 * [cygnos], onde dá para ler sem tocar no telefone. Depois de a causa estar
 * achada, pode sair — mas enquanto houver rejeição sem dono, ele fica. */
const aoRejeitar = (motivo: unknown) => {
  const e = motivo as { message?: string; stack?: string }
  console.log(
    '[cygnos] PROMESSA REJEITADA:',
    e?.message ?? String(motivo),
    '\n[cygnos] pilha:',
    (e?.stack ?? '(sem pilha)').split('\n').slice(0, 12).join('\n'),
  )
}

/* Dois caminhos, porque o React Native usa um e o Hermes usa o outro conforme
   a versão — registrar nos dois custa nada e evita descobrir tarde que o
   escolhido não era o que valia. */
const g = globalThis as unknown as {
  addEventListener?: (t: string, f: (e: { reason?: unknown }) => void) => void
  HermesInternal?: unknown
  process?: { on?: (t: string, f: (r: unknown) => void) => void }
}
try {
  g.addEventListener?.('unhandledrejection', e => aoRejeitar(e?.reason))
} catch {
  /* Sem o evento, sobra o de baixo. */
}
try {
  g.process?.on?.('unhandledRejection', aoRejeitar)
} catch {
  /* Idem. */
}

registerRootComponent(App)
