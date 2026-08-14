/* Máscaras e validações do cadastro. Ficam fora da tela porque a tela já é
   grande e porque validação é a parte que merece teste isolado depois. */

export const soDigitos = (v: string) => v.replace(/\D/g, '')

/* ── Máscaras ─────────────────────────────────────────────────────────────
   Todas trabalham em cima dos dígitos e remontam a formatação do zero a cada
   tecla. Assim apagar no meio do texto não deixa pontuação órfã. */

export function mascaraCPF(v: string): string {
  const d = soDigitos(v).slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

export function mascaraTelefone(v: string): string {
  const d = soDigitos(v).slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  /* Fixo tem 8 dígitos depois do DDD, celular tem 9. O corte muda de lugar. */
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function mascaraData(v: string): string {
  const d = soDigitos(v).slice(0, 8)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

/* Quantidade com vírgula: "1,5 xícara". Uma vírgula só, e no máximo uma casa —
   meia colher existe, um terço de colher não é como ninguém mede na cozinha. */
export function mascaraQuantidade(v: string): string {
  const limpo = v.replace(/[^0-9,]/g, '')
  const [inteiro, ...resto] = limpo.split(',')
  const cortado = inteiro.slice(0, 4)
  if (resto.length === 0) return cortado
  return `${cortado},${resto.join('').slice(0, 1)}`
}

/* "1,5" → 1.5. Devolve 0 para o que não for número, que é como as telas tratam
   campo vazio. */
export const numeroDigitado = (v: string) => Number(v.replace(',', '.')) || 0

export function mascaraHora(v: string): string {
  const d = soDigitos(v).slice(0, 4)
  if (d.length <= 2) return d
  return `${d.slice(0, 2)}:${d.slice(2)}`
}

/* ── Validações ───────────────────────────────────────────────────────────
   Cada uma devolve a mensagem de erro, ou null quando está tudo certo. */

export function validarNome(v: string): string | null {
  const limpo = v.trim().replace(/\s+/g, ' ')
  if (limpo.length < 3) return 'Escreva seu nome.'
  /* Nome completo mesmo: exige pelo menos duas palavras, porque o cadastro é
     usado em documento (plano, atestado) e "Maria" sozinho não serve. */
  if (!limpo.includes(' ')) return 'Escreva o nome completo, com sobrenome.'
  return null
}

export function validarEmail(v: string): string | null {
  const limpo = v.trim()
  if (!limpo) return 'Informe seu e-mail.'
  /* Proposital não usar regex elaborada: o que decide se o e-mail existe é a
     confirmação que chega na caixa, não o formato. Aqui só pega erro de digitação. */
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(limpo)) return 'E-mail inválido.'
  return null
}

export function validarUsername(v: string): string | null {
  const limpo = v.trim().toLowerCase()
  if (limpo.length < 3) return 'O usuário precisa de pelo menos 3 caracteres.'
  if (limpo.length > 20) return 'O usuário pode ter no máximo 20 caracteres.'
  /* Mesma regra do constraint no banco: se divergirem, o cadastro passa aqui e
     estoura lá com uma mensagem que ninguém entende. */
  if (!/^[a-z0-9._]+$/.test(limpo)) return 'Use apenas letras, números, ponto e underline.'
  return null
}

/* Lista explícita em vez de "qualquer coisa que não seja letra ou número":
   assim "senhá" não conta o acento como caractere especial. */
const ESPECIAIS = /[!@#$%^&*()\-_=+[\]{};:'",.<>/?\\|`~]/

export type RequisitoSenha = { chave: string; rotulo: string; ok: boolean }

export function requisitosSenha(v: string): RequisitoSenha[] {
  return [
    { chave: 'tamanho', rotulo: 'Pelo menos 8 caracteres', ok: v.length >= 8 },
    { chave: 'maiuscula', rotulo: 'Uma letra maiúscula', ok: /[A-ZÀ-Ý]/.test(v) },
    { chave: 'numero', rotulo: 'Um número', ok: /[0-9]/.test(v) },
    { chave: 'especial', rotulo: 'Um caractere especial (!, @, #…)', ok: ESPECIAIS.test(v) },
  ]
}

export function validarSenha(v: string): string | null {
  const faltando = requisitosSenha(v).find(r => !r.ok)
  if (!faltando) return null
  /* Devolve o primeiro requisito não atendido em vez de uma mensagem genérica:
     a lista abaixo do campo mostra todos, mas quem usa leitor de tela recebe
     só o erro do campo. */
  return `A senha ainda precisa de: ${faltando.rotulo.toLowerCase()}.`
}

export type NivelSenha = 'fraca' | 'media' | 'forte'

/* Os quatro requisitos são obrigatórios, então cumpri-los é o piso, não o
   topo. O que separa "média" de "forte" é o comprimento — que na prática é o
   que mais custa a quebrar. */
export function forcaSenha(v: string): { nivel: NivelSenha; pontos: number } {
  if (!v) return { nivel: 'fraca', pontos: 0 }

  const atendidos = requisitosSenha(v).filter(r => r.ok).length
  const pontos = atendidos + (v.length >= 12 ? 1 : 0)

  if (pontos >= 5) return { nivel: 'forte', pontos }
  if (pontos >= 3) return { nivel: 'media', pontos }
  return { nivel: 'fraca', pontos }
}

/* Horário do dia em HH:MM. Devolve a mensagem de erro, ou null. */
export function validarHora(v: string): string | null {
  const d = soDigitos(v)
  if (d.length !== 4) return 'Horário incompleto.'
  if (Number(d.slice(0, 2)) > 23) return 'Hora inválida.'
  if (Number(d.slice(2)) > 59) return 'Minuto inválido.'
  return null
}

export function validarTelefone(v: string): string | null {
  const d = soDigitos(v)
  if (d.length < 10) return 'Telefone incompleto. Inclua o DDD.'
  if (d.length > 11) return 'Telefone inválido.'
  /* DDD brasileiro vai de 11 a 99 — nenhum começa com 0. */
  if (d[0] === '0') return 'DDD inválido.'
  return null
}

/* CPF pelos dígitos verificadores. Vale a pena validar no aparelho: erro de
   digitação é comum e descobrir só depois de enviar o cadastro é frustrante. */
export function validarCPF(v: string): string | null {
  const d = soDigitos(v)
  if (d.length !== 11) return 'CPF incompleto.'
  /* 111.111.111-11 e afins passam na conta dos dígitos, mas não existem. */
  if (/^(\d)\1{10}$/.test(d)) return 'CPF inválido.'

  const digito = (ateIndice: number): number => {
    let soma = 0
    let peso = ateIndice + 1
    for (let i = 0; i < ateIndice; i++) soma += Number(d[i]) * peso--
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }

  if (digito(9) !== Number(d[9]) || digito(10) !== Number(d[10])) return 'CPF inválido.'
  return null
}

/* Devolve a data no formato do banco (AAAA-MM-DD) ou uma mensagem de erro. */
export function validarNascimento(v: string): { erro: string } | { iso: string } {
  const d = soDigitos(v)
  if (d.length !== 8) return { erro: 'Data incompleta. Use dia/mês/ano.' }

  const dia = Number(d.slice(0, 2))
  const mes = Number(d.slice(2, 4))
  const ano = Number(d.slice(4))

  if (mes < 1 || mes > 12) return { erro: 'Mês inválido.' }
  if (ano < 1900) return { erro: 'Ano inválido.' }

  /* Construir a data e conferir se ela "voltou igual" pega 31/02 e afins, que
     o Date corrige em silêncio para 03/03. */
  const data = new Date(ano, mes - 1, dia)
  if (data.getDate() !== dia || data.getMonth() !== mes - 1 || data.getFullYear() !== ano) {
    return { erro: 'Essa data não existe. Confira o dia.' }
  }

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  if (data >= hoje) return { erro: 'A data de nascimento precisa ser no passado.' }

  const iso = `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  return { iso }
}
