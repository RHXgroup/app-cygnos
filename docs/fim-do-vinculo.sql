-- O vínculo passa a TERMINAR em vez de sumir.
--
-- ── O problema que eu usei como desculpa, e a saída ────────────────────────
-- Hoje desvincular faz `delete`, e com a linha somem as datas do
-- acompanhamento. Sem elas o plano nunca consegue congelar como "prescrito por
-- Fulana, de 12/03 a 28/08 — encerrado".
--
-- Eu não tinha escrito a correção porque marcar um fim obriga TUDO que lê
-- `app_vinculos` a passar a filtrar `fim is null` — e há leitores no sistema web
-- que eu não enxergo do lado do app. Esquecer um faz o paciente encerrado
-- continuar aparecendo na carteira dela.
--
-- A saída é não depender de encontrar todos: a tabela é renomeada e no lugar
-- dela fica uma VIEW que já filtra. Todo leitor existente continua escrevendo
-- `app_vinculos` e passa a ver só os ativos, sem uma linha de mudança. Quem
-- quiser o histórico pede `app_vinculos_todos` por nome.
--
-- Rode tudo de uma vez. Se qualquer passo falhar, nada é aplicado.

begin;

-- 1. A tabela vira o histórico, e ganha o fim.
alter table public.app_vinculos rename to app_vinculos_todos;
alter table public.app_vinculos_todos add column if not exists fim timestamptz;

-- 2. No lugar do nome antigo, a view dos ativos.
--
-- `security_invoker = true` NÃO é detalhe: sem ele a view roda com os
-- privilégios de quem a criou e as políticas de RLS da tabela deixam de valer —
-- o que abriria o vínculo de todo mundo para todo mundo. Com ele, a RLS da
-- tabela continua sendo aplicada como se a consulta fosse direta.
-- Exige Postgres 15+. O Supabase está acima disso.
create view public.app_vinculos with (security_invoker = true) as
  select * from public.app_vinculos_todos where fim is null;

grant select, insert, update on public.app_vinculos to authenticated;

-- DELETE fica de fora de propósito: encerrar agora é marcar o fim, e um delete
-- pela view apagaria a linha do histórico — que é exatamente o que esta
-- migração existe para impedir.

-- 3. Desvincular passa a MARCAR, dos dois lados.
create or replace function public.app_desvincular_minha_nutricionista()
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_conta uuid := auth.uid();
begin
  if v_conta is null then raise exception 'Você precisa estar logada.'; end if;

  update app_vinculos_todos set fim = now()
   where conta_id = v_conta and fim is null;

  if not found then
    raise exception 'Você não está vinculada a nenhuma nutricionista.';
  end if;

  -- A autorização do ciclo era para AQUELA nutricionista. Saindo, ela não pode
  -- continuar de pé esperando a próxima.
  update app_contas set compartilha_ciclo = false where id = v_conta;
end $$;

revoke all on function public.app_desvincular_minha_nutricionista() from anon;
grant execute on function public.app_desvincular_minha_nutricionista() to authenticated;

commit;


-- ── O QUE FALTA, E SÓ QUEM TEM O REPO DO SISTEMA CONSEGUE ──────────────────
--
-- 1. `app_desvincular(p_paciente_id)` — a do lado DELA — ainda faz `delete`.
--    Precisa virar o mesmo `update ... set fim = now()`. Eu não escrevi aqui
--    porque não vi o corpo dela: ela resolve a carteira por `get_nutricionista_id()`
--    e eu não sei se filtra por `paciente_id` ou por `conta_id`. Trocar às cegas
--    um delete por um update com a cláusula errada não apaga nada e não encerra
--    nada — falha em silêncio, que é pior.
--
-- 2. Conferir se alguma consulta do sistema web usa `app_vinculos` esperando
--    DELETE ou esperando ver linhas encerradas. A view cobre leitura; escrita
--    não.
--
-- 3. Quando existir tela de histórico, ela lê `app_vinculos_todos`.
--
--
-- ── COMO VOLTAR ATRÁS ──────────────────────────────────────────────────────
--
--   begin;
--   drop view public.app_vinculos;
--   alter table public.app_vinculos_todos drop column fim;
--   alter table public.app_vinculos_todos rename to app_vinculos;
--   commit;
--
-- Os vínculos encerrados voltam a aparecer como ativos, porque a informação de
-- que terminaram morre com a coluna. Vale saber antes de reverter.
