import { useEffect, useRef } from 'react'
import { BackHandler } from 'react-native'

/* O voltar do Android, registrado DEPOIS de todo mundo do mesmo instante.
 *
 * ──────────────────── O defeito que isto existe para matar ────────────────────
 * Relatado: "vou no calendário, clico no dia trinta para tentar agendar uma
 * consulta ali, quando clico no voltar ele vai na página inicial -- ele deveria
 * voltar pra tela inicial do calendário."
 *
 * O tratador da agenda estava certo, e o da área também. O que estava errado era
 * a ORDEM em que os dois entraram na fila.
 *
 * O React Native chama os tratadores na ordem INVERSA do registro: quem registra
 * por último decide primeiro. É isso que faz o voltar descascar camadas, e é a
 * armadilha 1 do AGENTS.
 *
 * Agora o instante que ninguém tinha olhado: tocar na aba da agenda MUDA `aba`
 * na área e MONTA a tela da agenda na mesma renderização. Numa renderização só,
 * o React roda os efeitos do filho antes dos do pai -- então a agenda registra
 * primeiro e a área depois, e a área ganha. O voltar, em vez de desfazer a
 * entrada no dia, caía no degrau "de qualquer aba, volta para a inicial".
 *
 * Isso não se resolve com lista de dependências, e é por isso que o arquivo
 * existe. As duas saídas que o AGENTS descreve falham aqui, cada uma de um lado:
 *
 *   - COM lista, a agenda se re-registra ao abrir a marcação -- e passa na frente
 *     da PRÓPRIA filha, então o voltar dentro da busca de paciente fechava a
 *     marcação inteira em vez de voltar ao formulário. Já aconteceu.
 *   - SEM lista (registro único), ela perde para o pai no instante da montagem,
 *     que é o defeito de cima.
 *
 * O que resolve é sair do instante: registrar numa microtarefa. Ela roda depois
 * de o React terminar de rodar TODOS os efeitos daquela renderização -- os do pai
 * inclusive --, então quem usa isto entra na fila por último sem precisar se
 * re-registrar nunca. E uma tela de dentro que também use isto entra depois
 * ainda, porque a montagem dela é uma renderização posterior.
 *
 * ──────────────────── Como usar ────────────────────
 * O tratador recebe o estado por `ref`, e não por fechamento: registrado uma vez,
 * um tratador leria para sempre os valores da primeira renderização.
 *
 *   const estado = useRef({ vista, fichaAberta })
 *   estado.current = { vista, fichaAberta }
 *
 *   useVoltarDoAparelho(() => {
 *     const agora = estado.current
 *     if (agora.fichaAberta) { setFichaAberta(null); return true }
 *     if (agora.vista !== 'mes') { setVista('mes'); return true }
 *     return false        // devolve ao nível de cima, que sabe fechar a tela
 *   })
 *
 * `return false` quando não houver o que fechar não é detalhe: segurar o evento
 * em todos os casos prende a pessoa dentro da tela. */
export function useVoltarDoAparelho(tratador: () => boolean): void {
  /* O tratador muda a cada renderização (é uma função nova toda vez). Guardado
     em `ref`, o que está registrado no sistema continua sendo o mesmo objeto, e
     mesmo assim chama sempre a versão de agora. */
  const atual = useRef(tratador)
  atual.current = tratador

  useEffect(() => {
    let sub: { remove: () => void } | null = null
    /* Desmontar antes de a microtarefa rodar é possível -- uma tela que abre e
       fecha no mesmo quadro --, e sem esta bandeira ela registraria um tratador
       que ninguém remove. */
    let vivo = true

    queueMicrotask(() => {
      if (!vivo) return
      sub = BackHandler.addEventListener('hardwareBackPress', () => atual.current())
    })

    return () => {
      vivo = false
      sub?.remove()
    }
  }, [])
}
