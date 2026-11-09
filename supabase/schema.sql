-- Danzi: la tabla del progreso para la sincronización entre dispositivos.
-- En Supabase: SQL Editor › New query, pega todo este archivo y dale Run. Se puede ejecutar otra vez sin problema.
--
-- Cada cuenta tiene una sola fila con su progreso (datos) y un número de revisión (rev) que sube en cada cambio.
-- La app solo sube un progreso si la fila sigue en la revisión que leyó: así dos dispositivos no se pisan.
-- Las reglas (row level security) dejan que cada cuenta lea y cambie solo su propia fila.

create table if not exists public.progreso (
  user_id uuid primary key references auth.users (id) on delete cascade,
  datos jsonb not null,
  rev integer not null default 1,
  actualizado timestamptz not null default now(),
  -- Tope por cuenta. El progreso con todas las palabras de los nueve niveles ocupa unos 5 MB.
  constraint progreso_tamano check (pg_column_size(datos) < 20000000)
);

alter table public.progreso enable row level security;

-- Solo las cuentas con sesión iniciada. No hay permiso para borrar: borrar el progreso desde la app sube un progreso
-- vacío, y la fila se borra sola si se borra la cuenta.
revoke all on table public.progreso from anon, authenticated;
grant select, insert, update on table public.progreso to authenticated;

drop policy if exists "Cada cuenta lee su progreso" on public.progreso;
create policy "Cada cuenta lee su progreso" on public.progreso
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Cada cuenta crea su progreso" on public.progreso;
create policy "Cada cuenta crea su progreso" on public.progreso
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Cada cuenta cambia su progreso" on public.progreso;
create policy "Cada cuenta cambia su progreso" on public.progreso
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- La revisión la lleva la base de datos: empieza en 1 y sube de a uno en cada cambio, mande lo que mande la app.
create or replace function public.progreso_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.rev := 1;
  else
    new.rev := old.rev + 1;
  end if;
  new.actualizado := now();
  return new;
end;
$$;

drop trigger if exists progreso_revision on public.progreso;
create trigger progreso_revision
  before insert or update on public.progreso
  for each row execute function public.progreso_revision();
