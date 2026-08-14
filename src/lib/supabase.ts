import 'react-native-url-polyfill/auto'
import { AppState } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

/* Falha aqui, alto e claro, em vez de deixar o createClient montar um cliente
   quebrado e a primeira chamada de rede morrer com um erro sem pista. */
if (!url || !anonKey) {
  throw new Error(
    'Faltam EXPO_PUBLIC_SUPABASE_URL e/ou EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copie o .env.example para .env e reinicie o servidor do Expo — variáveis ' +
      'de ambiente entram no bundle na hora do start, não em tempo de execução.',
  )
}

export const supabase = createClient(url, anonKey, {
  auth: {
    /* No navegador o supabase-js usa localStorage; no aparelho não existe um,
       então a sessão precisa de um storage explícito para sobreviver a fechar
       o app. */
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    /* Não há URL de retorno para parsear fora do fluxo OAuth. */
    detectSessionInUrl: false,
  },
})

/* O timer de refresh do supabase-js foi desenhado para uma aba de navegador,
   que só existe enquanto está aberta. No celular o app fica suspenso em
   segundo plano e o timer dispara em cima de um processo congelado. Ligamos e
   desligamos o refresh junto com o ciclo de vida do app. */
AppState.addEventListener('change', state => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh()
  } else {
    supabase.auth.stopAutoRefresh()
  }
})
