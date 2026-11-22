-- Database for the reunion site (reunie25/). Run once in the Supabase SQL editor.
-- Safe to run again: it only creates what is missing and replaces functions/policies.
--
-- Security model:
--   * Every visitor uses the public (publishable/anon) key; what they can do is decided
--     here by row level security, not by the website.
--   * A participant can read, change and delete only their own row.
--   * Visitors see other participants only through publieke_deelnemers(), which returns
--     null for every field the person chose to hide. E-mail addresses never leave the database.
--   * Comité members (table beheerders) get extra rights via is_beheerder().
--   * A beheerder with rol 'hoofdbeheerder' can also add and remove ordinary beheerders
--     on the site. Hoofdbeheerders themselves are only set here, in the SQL editor.
-- This folder starts with "_", so GitHub Pages does not publish it.

-- ---------------------------------------------------------------- tables

create table if not exists public.deelnemers (
  id              uuid primary key references auth.users (id) on delete cascade,
  email           text not null,
  voornaam        text not null check (char_length(voornaam) between 1 and 60),
  achternaam      text not null default '' check (char_length(achternaam) <= 80),
  bijnaam         text not null default '' check (char_length(bijnaam) <= 40),
  geboortejaar    int  not null check (geboortejaar between 1930 and 2030),
  -- [{ "speltak": "Welpen", "rol": "lid" | "leiding", "van": 2003, "tot": 2006 | null, "naam": "Kabouters" }]
  -- naam (optional) = what the speltak was called then, chosen under "Heette toen"; max 30.
  takken          jsonb not null default '[]' check (jsonb_typeof(takken) = 'array' and jsonb_array_length(takken) <= 30),
  toon_voornaam   boolean not null default true,
  toon_achternaam boolean not null default false,
  toon_bijnaam    boolean not null default true,
  toon_leeftijd   boolean not null default true,
  toon_takken     boolean not null default true,
  sinds           date not null default current_date,
  aangemaakt      timestamptz not null default now(),
  bijgewerkt      timestamptz not null default now()
);

-- Columns added after the first version (no-ops on a fresh install).
alter table public.deelnemers add column if not exists bijnaam text not null default '' check (char_length(bijnaam) <= 40);
alter table public.deelnemers add column if not exists toon_bijnaam boolean not null default true;
-- Date the comité saw the payment; null = not paid yet. Only comité members can change it.
alter table public.deelnemers add column if not exists betaald_op date;
-- The optional old name per speltak ("Heette toen") is at most 30 characters.
create or replace function public.takken_namen_ok(t jsonb)
returns boolean
language sql immutable set search_path = public
as $$ select not exists (select 1 from jsonb_array_elements(t) e
                         where jsonb_typeof(e) = 'object' and char_length(coalesce(e ->> 'naam', '')) > 30); $$;
alter table public.deelnemers drop constraint if exists takken_namen_kort;
alter table public.deelnemers add constraint takken_namen_kort check (public.takken_namen_ok(takken));

-- Coming to the reunion? ja / misschien / nee. Only the participant and the comité see it;
-- visitors only get the totals (aantal_erbij). erbij_sinds = date of the last change.
alter table public.deelnemers add column if not exists erbij text not null default 'ja'
  check (erbij in ('ja', 'misschien', 'nee'));
alter table public.deelnemers add column if not exists erbij_sinds date;
update public.deelnemers set erbij_sinds = sinds where erbij_sinds is null;
alter table public.deelnemers alter column erbij_sinds set default current_date;

-- E-mail addresses of comité members. No policies: not readable through the API at all.
create table if not exists public.beheerders (
  email text primary key
);
alter table public.beheerders add column if not exists rol text not null default 'beheerder'
  check (rol in ('beheerder', 'hoofdbeheerder'));
alter table public.beheerders add column if not exists toegevoegd_door text;  -- null = via the SQL editor
alter table public.beheerders add column if not exists toegevoegd_op date not null default current_date;

-- Addresses the comité removed and blocked: they cannot register again. No policies.
create table if not exists public.geblokkeerd (
  email text primary key,          -- lower case
  reden text,                      -- only for the comité
  door  text,                      -- who blocked it
  op    date not null default current_date
);

-- Stories (Herinneringen). Visible to participants once the comité placed them.
-- status: nieuw (waiting), geplaatst, afgewezen (with toelichting), gemeld (hidden after a report).
create table if not exists public.verhalen (
  id          uuid primary key default gen_random_uuid(),
  auteur      uuid not null references auth.users (id) on delete cascade,
  titel       text not null check (char_length(titel) between 1 and 80),
  tekst       text not null check (char_length(tekst) between 1 and 3000),
  speltak     text check (char_length(speltak) <= 40),
  jaar        int check (jaar between 1990 and 2030),
  toon_naam   boolean not null default true,
  status      text not null default 'nieuw' check (status in ('nieuw', 'geplaatst', 'afgewezen', 'gemeld')),
  toelichting text check (char_length(toelichting) <= 500),   -- comité to author, on afwijzen
  melding     text check (char_length(melding) <= 500),       -- reason given by whoever reported it
  gemeld_door text,
  gemeld_op   date,
  aangemaakt  timestamptz not null default now(),
  bijgewerkt  timestamptz not null default now()
);

alter table public.deelnemers enable row level security;
alter table public.beheerders enable row level security;
alter table public.geblokkeerd enable row level security;
alter table public.verhalen enable row level security;

-- ---------------------------------------------------------------- helpers

create or replace function public.is_beheerder()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from beheerders where lower(email) = lower(auth.jwt() ->> 'email'));
$$;

-- Role of the logged-in user: 'beheerder', 'hoofdbeheerder' or null.
create or replace function public.mijn_rol()
returns text
language sql stable security definer set search_path = public
as $$
  select rol from beheerders where lower(email) = lower(auth.jwt() ->> 'email') limit 1;
$$;

create or replace function public.is_hoofdbeheerder()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.mijn_rol() = 'hoofdbeheerder', false); $$;

-- Keep email in sync with the login and stamp updates; the client cannot change them.
create or replace function public.deelnemers_stempel()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  betaald date := new.betaald_op;
  keuze   text := new.erbij;
begin
  -- No login: SQL editor or table editor in the Supabase dashboard. Trusted, leave as is.
  if auth.uid() is null then return new; end if;
  -- Someone else's row: only zet_betaald() and zet_erbij() (comité) get here.
  -- Change nothing but betaald_op and erbij.
  if tg_op = 'UPDATE' and old.id <> auth.uid() then
    new := old;
    new.betaald_op := betaald;
    new.erbij := keuze;
    if keuze is distinct from old.erbij then new.erbij_sinds := current_date; end if;
    new.bijgewerkt := now();
    return new;
  end if;
  new.email := auth.jwt() ->> 'email';
  new.bijgewerkt := now();
  if tg_op = 'UPDATE' then
    new.id := old.id; new.sinds := old.sinds; new.aangemaakt := old.aangemaakt;
    if not public.is_beheerder() then new.betaald_op := old.betaald_op; end if;
    new.erbij_sinds := case when new.erbij is distinct from old.erbij then current_date else old.erbij_sinds end;
  else
    if exists (select 1 from geblokkeerd where email = lower(new.email)) then
      raise exception 'geblokkeerd' using errcode = '42501';
    end if;
    new.sinds := current_date; new.aangemaakt := now();
    new.betaald_op := null;
    new.erbij_sinds := current_date;
  end if;
  return new;
end;
$$;

drop trigger if exists deelnemers_stempel on public.deelnemers;
create trigger deelnemers_stempel before insert or update on public.deelnemers
  for each row execute function public.deelnemers_stempel();

-- Stories: the author can only write content; status and comité fields are set here.
-- Comité functions set reunie.comite = '1' for their own changes.
create or replace function public.verhalen_stempel()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.bijgewerkt := now();
  if auth.uid() is null or current_setting('reunie.comite', true) = '1' then return new; end if;
  if tg_op = 'INSERT' then
    new.auteur := auth.uid(); new.aangemaakt := now();
  else
    new.id := old.id; new.auteur := old.auteur; new.aangemaakt := old.aangemaakt;
  end if;
  -- Every new or changed story waits for the comité again.
  new.status := 'nieuw'; new.toelichting := null;
  new.melding := null; new.gemeld_door := null; new.gemeld_op := null;
  return new;
end;
$$;

drop trigger if exists verhalen_stempel on public.verhalen;
create trigger verhalen_stempel before insert or update on public.verhalen
  for each row execute function public.verhalen_stempel();

-- Display name of the logged-in user for comité notes: voornaam, else e-mail.
create or replace function public.mijn_naam()
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce((select nullif(trim(voornaam), '') from deelnemers where id = auth.uid()), auth.jwt() ->> 'email');
$$;

-- Registered for the reunion, or on the comité: may read and share stories.
create or replace function public.mag_verhalen()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from deelnemers where id = auth.uid()) or public.is_beheerder(); $$;

-- ---------------------------------------------------------------- row level security

drop policy if exists "eigen rij of comite lezen" on public.deelnemers;
create policy "eigen rij of comite lezen" on public.deelnemers
  for select to authenticated using (id = auth.uid() or public.is_beheerder());

drop policy if exists "eigen rij maken" on public.deelnemers;
create policy "eigen rij maken" on public.deelnemers
  for insert to authenticated with check (id = auth.uid());

drop policy if exists "eigen rij wijzigen" on public.deelnemers;
create policy "eigen rij wijzigen" on public.deelnemers
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "eigen rij of comite verwijderen" on public.deelnemers;
create policy "eigen rij of comite verwijderen" on public.deelnemers
  for delete to authenticated using (id = auth.uid() or public.is_beheerder());

drop policy if exists "eigen verhalen lezen" on public.verhalen;
create policy "eigen verhalen lezen" on public.verhalen
  for select to authenticated using (auteur = auth.uid());

drop policy if exists "verhaal delen" on public.verhalen;
create policy "verhaal delen" on public.verhalen
  for insert to authenticated with check (auteur = auth.uid() and public.mag_verhalen());

drop policy if exists "eigen verhaal wijzigen" on public.verhalen;
create policy "eigen verhaal wijzigen" on public.verhalen
  for update to authenticated using (auteur = auth.uid()) with check (auteur = auth.uid());

drop policy if exists "eigen verhaal verwijderen" on public.verhalen;
create policy "eigen verhaal verwijderen" on public.verhalen
  for delete to authenticated using (auteur = auth.uid());

-- ---------------------------------------------------------------- public functions

-- Everyone who shows at least something, with hidden fields as null. Oldest first.
-- Dropped first because the returned columns changed (bijnaam); grants are set again below.
drop function if exists public.publieke_deelnemers();
create function public.publieke_deelnemers()
returns table (voornaam text, achternaam text, bijnaam text, geboortejaar int, takken jsonb)
language sql stable security definer set search_path = public
as $$
  select case when toon_voornaam then voornaam end,
         case when toon_achternaam and achternaam <> '' then achternaam end,
         case when toon_bijnaam and bijnaam <> '' then bijnaam end,
         case when toon_leeftijd then geboortejaar end,
         case when toon_takken and jsonb_array_length(takken) > 0 then takken end
  from deelnemers
  where toon_voornaam or (toon_achternaam and achternaam <> '') or (toon_bijnaam and bijnaam <> '') or toon_leeftijd
     or (toon_takken and jsonb_array_length(takken) > 0)
  order by aangemaakt;
$$;

create or replace function public.aantal_deelnemers()
returns int
language sql stable security definer set search_path = public
as $$ select count(*)::int from deelnemers; $$;

-- How many said ja, misschien and nee, e.g. {"ja": 42, "misschien": 11, "nee": 6}.
-- Totals only: who chose what is for the participant and the comité.
create or replace function public.aantal_erbij()
returns jsonb
language sql stable security definer set search_path = public
as $$ select coalesce(jsonb_object_agg(erbij, n), '{}') from (select erbij, count(*)::int n from deelnemers group by erbij) t; $$;

-- Unsubscribe: removes the login itself; the deelnemers row goes with it (on delete cascade).
create or replace function public.verwijder_mij()
returns void
language sql security definer set search_path = public
as $$ delete from auth.users where id = auth.uid(); $$;

-- Comité: mark a registration as paid (today) or not paid. Returns the new date or null.
create or replace function public.zet_betaald(deelnemer uuid, betaald boolean)
returns date
language plpgsql security definer set search_path = public
as $$
declare
  datum date;
begin
  if not is_beheerder() then raise exception 'alleen voor het comité' using errcode = '42501'; end if;
  update deelnemers set betaald_op = case when betaald then coalesce(betaald_op, current_date) end
    where id = deelnemer returning betaald_op into datum;
  return datum;
end;
$$;

-- Comité: change whether someone comes (ja / misschien / nee). Returns the date of the change.
create or replace function public.zet_erbij(deelnemer uuid, keuze text)
returns date
language plpgsql security definer set search_path = public
as $$
declare
  datum date;
begin
  if not is_beheerder() then raise exception 'alleen voor het comité' using errcode = '42501'; end if;
  update deelnemers set erbij = keuze where id = deelnemer returning erbij_sinds into datum;
  return datum;
end;
$$;

-- Comité: list of comité members, with the name if they registered for the reunion.
create or replace function public.comite()
returns table (email text, rol text, toegevoegd_door text, toegevoegd_op date, naam text)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if not is_beheerder() then raise exception 'alleen voor het comité' using errcode = '42501'; end if;
  return query
    select b.email, b.rol, b.toegevoegd_door, b.toegevoegd_op,
           (select nullif(trim(d.voornaam || ' ' || d.achternaam), '') from deelnemers d
             where lower(d.email) = lower(b.email) limit 1)
    from beheerders b
    order by b.rol desc, b.toegevoegd_op, b.email;
end;
$$;

-- Hoofdbeheerder: add an ordinary beheerder. Does nothing if the address is already in the list.
create or replace function public.comite_toevoegen(adres text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  a text := lower(trim(adres));
begin
  if not is_hoofdbeheerder() then raise exception 'alleen voor hoofdbeheerders' using errcode = '42501'; end if;
  if a !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'ongeldig e-mailadres' using errcode = '22023'; end if;
  if exists (select 1 from beheerders where lower(email) = a) then return; end if;
  insert into beheerders (email, rol, toegevoegd_door)
    values (a, 'beheerder', coalesce((select nullif(trim(voornaam), '') from deelnemers where id = auth.uid()),
                                     auth.jwt() ->> 'email'));
end;
$$;

-- Hoofdbeheerder: remove an ordinary beheerder. Hoofdbeheerders can only be removed in the SQL editor.
create or replace function public.comite_weghalen(adres text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_hoofdbeheerder() then raise exception 'alleen voor hoofdbeheerders' using errcode = '42501'; end if;
  delete from beheerders where lower(email) = lower(trim(adres)) and rol = 'beheerder';
end;
$$;

-- Comité: remove a registration and its login, optionally blocking the address.
-- Not for yourself (that is uitschrijven) and comité addresses cannot be blocked.
create or replace function public.verwijder_deelnemer(deelnemer uuid, blokkeer boolean default false, waarom text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  adres text;
begin
  if not is_beheerder() then raise exception 'alleen voor het comité' using errcode = '42501'; end if;
  if deelnemer = auth.uid() then raise exception 'zelf' using errcode = '22023'; end if;
  select lower(email) into adres from deelnemers where id = deelnemer;
  if adres is null then return; end if;
  if blokkeer then
    if exists (select 1 from beheerders where lower(email) = adres) then raise exception 'comitelid' using errcode = '22023'; end if;
    insert into geblokkeerd (email, reden, door)
      values (adres, nullif(trim(waarom), ''),
              coalesce((select nullif(trim(voornaam), '') from deelnemers where id = auth.uid()), auth.jwt() ->> 'email'))
      on conflict (email) do update set reden = excluded.reden, door = excluded.door, op = current_date;
  end if;
  delete from auth.users where id = deelnemer;
end;
$$;

-- Comité: blocked addresses, newest first.
create or replace function public.geblokkeerde()
returns table (email text, reden text, door text, op date)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if not is_beheerder() then raise exception 'alleen voor het comité' using errcode = '42501'; end if;
  return query select g.email, g.reden, g.door, g.op from geblokkeerd g order by g.op desc, g.email;
end;
$$;

-- Comité: unblock an address.
create or replace function public.deblokkeer(adres text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_beheerder() then raise exception 'alleen voor het comité' using errcode = '42501'; end if;
  delete from geblokkeerd where email = lower(trim(adres));
end;
$$;

-- Registration form: a blocked address gets no code. Tells only whether an address is blocked.
create or replace function public.is_geblokkeerd_adres(adres text)
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from geblokkeerd where email = lower(trim(adres))); $$;

-- Number of placed stories, for the teaser visitors see.
create or replace function public.aantal_verhalen()
returns int
language sql stable security definer set search_path = public
as $$ select count(*)::int from verhalen where status = 'geplaatst'; $$;

-- Stories for participants: all placed ones plus your own (any status). The author's name
-- follows what they show on "Wie komen er?", and is left out when toon_naam is off.
create or replace function public.verhalen_lijst()
returns table (id uuid, titel text, tekst text, speltak text, jaar int, eigen boolean, status text,
               toelichting text, toon_naam boolean, voornaam text, bijnaam text, achternaam text, aangemaakt timestamptz)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if not mag_verhalen() then raise exception 'alleen voor deelnemers' using errcode = '42501'; end if;
  return query
    select v.id, v.titel, v.tekst, v.speltak, v.jaar, v.auteur = auth.uid(), v.status,
           case when v.auteur = auth.uid() then v.toelichting end, v.toon_naam,
           case when v.toon_naam and d.toon_voornaam then d.voornaam end,
           case when v.toon_naam and d.toon_bijnaam and d.bijnaam <> '' then d.bijnaam end,
           case when v.toon_naam and d.toon_achternaam and d.achternaam <> '' then d.achternaam end,
           v.aangemaakt
    from verhalen v left join deelnemers d on d.id = v.auteur
    where v.status = 'geplaatst' or v.auteur = auth.uid()
    order by v.aangemaakt desc;
end;
$$;

-- Participant: report a placed story. It is hidden at once and goes to the comité.
create or replace function public.meld_verhaal(verhaal uuid, reden text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not mag_verhalen() then raise exception 'alleen voor deelnemers' using errcode = '42501'; end if;
  perform set_config('reunie.comite', '1', true);
  update verhalen set status = 'gemeld', melding = left(nullif(trim(reden), ''), 500),
                      gemeld_door = mijn_naam(), gemeld_op = current_date
    where id = verhaal and status = 'geplaatst';
end;
$$;

-- Comité: stories waiting (nieuw) or reported (gemeld), oldest first, with the full author name.
create or replace function public.te_beoordelen()
returns table (id uuid, titel text, tekst text, speltak text, jaar int, toon_naam boolean, status text,
               melding text, gemeld_door text, gemeld_op date, auteur_naam text, aangemaakt timestamptz)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if not is_beheerder() then raise exception 'alleen voor het comite' using errcode = '42501'; end if;
  return query
    select v.id, v.titel, v.tekst, v.speltak, v.jaar, v.toon_naam, v.status, v.melding, v.gemeld_door, v.gemeld_op,
           coalesce(nullif(trim(d.voornaam || ' ' || d.achternaam), ''), u.email::text), v.aangemaakt
    from verhalen v left join deelnemers d on d.id = v.auteur left join auth.users u on u.id = v.auteur
    where v.status in ('nieuw', 'gemeld')
    order by v.aangemaakt;
end;
$$;

-- Comité: actie = 'plaatsen', 'afwijzen' (with notitie for the author), 'aanpassen' (nieuwe_titel,
-- nieuwe_tekst) or 'verwijderen'. Parameter names differ from the columns on purpose.
create or replace function public.beoordeel_verhaal(verhaal uuid, actie text, notitie text default null,
                                                    nieuwe_titel text default null, nieuwe_tekst text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_beheerder() then raise exception 'alleen voor het comite' using errcode = '42501'; end if;
  perform set_config('reunie.comite', '1', true);
  if actie = 'plaatsen' then
    update verhalen v set status = 'geplaatst', toelichting = null, melding = null, gemeld_door = null, gemeld_op = null
      where v.id = verhaal;
  elsif actie = 'afwijzen' then
    update verhalen v set status = 'afgewezen', toelichting = left(nullif(trim(notitie), ''), 500)
      where v.id = verhaal;
  elsif actie = 'aanpassen' then
    update verhalen v set titel = nieuwe_titel, tekst = nieuwe_tekst where v.id = verhaal;
  elsif actie = 'verwijderen' then
    delete from verhalen v where v.id = verhaal;
  else
    raise exception 'onbekende actie' using errcode = '22023';
  end if;
end;
$$;

-- Login page: comité members may log in without a registration, so their login is created
-- on first use. Tells only whether an address is on the comité list.
create or replace function public.is_comite_adres(adres text)
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from beheerders where lower(email) = lower(trim(adres))); $$;

-- Supabase grants new functions to anon and authenticated by default: take that away
-- first, then grant only what each role needs.
revoke all on function public.publieke_deelnemers() from public, anon, authenticated;
revoke all on function public.aantal_deelnemers() from public, anon, authenticated;
revoke all on function public.verwijder_mij() from public, anon, authenticated;
revoke all on function public.is_beheerder() from public, anon, authenticated;
revoke all on function public.deelnemers_stempel() from public, anon, authenticated;
revoke all on function public.zet_betaald(uuid, boolean) from public, anon, authenticated;
revoke all on function public.zet_erbij(uuid, text) from public, anon, authenticated;
revoke all on function public.aantal_erbij() from public, anon, authenticated;
revoke all on function public.mijn_rol() from public, anon, authenticated;
revoke all on function public.is_hoofdbeheerder() from public, anon, authenticated;
revoke all on function public.comite() from public, anon, authenticated;
revoke all on function public.comite_toevoegen(text) from public, anon, authenticated;
revoke all on function public.comite_weghalen(text) from public, anon, authenticated;
revoke all on function public.is_comite_adres(text) from public, anon, authenticated;
revoke all on function public.verwijder_deelnemer(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.geblokkeerde() from public, anon, authenticated;
revoke all on function public.deblokkeer(text) from public, anon, authenticated;
revoke all on function public.is_geblokkeerd_adres(text) from public, anon, authenticated;
revoke all on function public.verhalen_stempel() from public, anon, authenticated;
revoke all on function public.mijn_naam() from public, anon, authenticated;
revoke all on function public.mag_verhalen() from public, anon, authenticated;
revoke all on function public.aantal_verhalen() from public, anon, authenticated;
revoke all on function public.verhalen_lijst() from public, anon, authenticated;
revoke all on function public.meld_verhaal(uuid, text) from public, anon, authenticated;
revoke all on function public.te_beoordelen() from public, anon, authenticated;
revoke all on function public.beoordeel_verhaal(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.publieke_deelnemers() to anon, authenticated;
grant execute on function public.aantal_deelnemers() to anon, authenticated;
grant execute on function public.verwijder_mij() to authenticated;
grant execute on function public.is_beheerder() to authenticated;
grant execute on function public.zet_betaald(uuid, boolean) to authenticated;
grant execute on function public.zet_erbij(uuid, text) to authenticated;
grant execute on function public.aantal_erbij() to anon, authenticated;
grant execute on function public.mijn_rol() to authenticated;
grant execute on function public.is_hoofdbeheerder() to authenticated;
grant execute on function public.comite() to authenticated;
grant execute on function public.comite_toevoegen(text) to authenticated;
grant execute on function public.comite_weghalen(text) to authenticated;
grant execute on function public.is_comite_adres(text) to anon, authenticated;
grant execute on function public.verwijder_deelnemer(uuid, boolean, text) to authenticated;
grant execute on function public.geblokkeerde() to authenticated;
grant execute on function public.deblokkeer(text) to authenticated;
grant execute on function public.is_geblokkeerd_adres(text) to anon, authenticated;
grant execute on function public.mag_verhalen() to authenticated;
grant execute on function public.aantal_verhalen() to anon, authenticated;
grant execute on function public.verhalen_lijst() to authenticated;
grant execute on function public.meld_verhaal(uuid, text) to authenticated;
grant execute on function public.te_beoordelen() to authenticated;
grant execute on function public.beoordeel_verhaal(uuid, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------- photos (Herinneringen > Foto's)
-- Files live in the private Storage bucket "fotos": <auteur>/<id>.jpg (max 1600 px) and
-- <auteur>/<id>-klein.jpg (400 px), both made in the browser. A row in public.fotos says who
-- shared it and whether it is placed. Same flow as the stories; max 30 photos per person.
-- Files are removed by the site through the Storage API (SQL cannot delete them).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('fotos', 'fotos', false, 1048576, array['image/jpeg'])
  on conflict (id) do update set public = false, file_size_limit = 1048576, allowed_mime_types = array['image/jpeg'];

create table if not exists public.fotos (
  id          uuid primary key default gen_random_uuid(),
  auteur      uuid not null references auth.users (id) on delete cascade,
  pad         text not null unique,       -- '<auteur>/<id>' without extension
  groep       uuid,                       -- photos sent in one go
  titel       text not null default '' check (char_length(titel) <= 80),
  speltak     text check (char_length(speltak) <= 40),
  jaar        int check (jaar between 1990 and 2030),
  toon_naam   boolean not null default true,
  breedte     int, hoogte int,
  status      text not null default 'nieuw' check (status in ('nieuw', 'geplaatst', 'gemeld')),
  melding     text check (char_length(melding) <= 500),
  gemeld_door text,
  gemeld_op   date,
  aangemaakt  timestamptz not null default now()
);
alter table public.fotos enable row level security;

-- When a photo last needed the comité (upload or report), for the "new since you looked" badges.
alter table public.fotos add column if not exists bijgewerkt timestamptz;
update public.fotos set bijgewerkt = coalesce(gemeld_op::timestamptz, aangemaakt) where bijgewerkt is null;
alter table public.fotos alter column bijgewerkt set default now();

create or replace function public.fotos_stempel()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or current_setting('reunie.comite', true) = '1' then return new; end if;
  if (select count(*) from fotos where auteur = auth.uid()) >= 30 then
    raise exception 'max' using errcode = '22023';
  end if;
  new.auteur := auth.uid(); new.status := 'nieuw'; new.aangemaakt := now(); new.bijgewerkt := now();
  new.melding := null; new.gemeld_door := null; new.gemeld_op := null;
  if new.pad not like auth.uid()::text || '/%' then raise exception 'pad' using errcode = '22023'; end if;
  return new;
end;
$$;

drop trigger if exists fotos_stempel on public.fotos;
create trigger fotos_stempel before insert on public.fotos
  for each row execute function public.fotos_stempel();

drop policy if exists "eigen fotos lezen" on public.fotos;
create policy "eigen fotos lezen" on public.fotos
  for select to authenticated using (auteur = auth.uid());
drop policy if exists "foto delen" on public.fotos;
create policy "foto delen" on public.fotos
  for insert to authenticated with check (auteur = auth.uid() and public.mag_verhalen());
drop policy if exists "eigen foto verwijderen" on public.fotos;
create policy "eigen foto verwijderen" on public.fotos
  for delete to authenticated using (auteur = auth.uid());

-- May the logged-in user see this file? Your own, placed ones (participants) and all (comité).
create or replace function public.foto_zichtbaar(naam text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from fotos f
    where naam in (f.pad || '.jpg', f.pad || '-klein.jpg')
      and (f.auteur = auth.uid() or public.is_beheerder() or (f.status = 'geplaatst' and public.mag_verhalen())));
$$;

drop policy if exists "fotos uploaden" on storage.objects;
create policy "fotos uploaden" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text and public.mag_verhalen());
-- Storage only deletes files you may also select. The site deletes the row first, so your own
-- folder (and everything, for the comité) stays selectable without a row; otherwise files of
-- removed photos would stay behind.
drop policy if exists "fotos bekijken" on storage.objects;
create policy "fotos bekijken" on storage.objects
  for select to authenticated
  using (bucket_id = 'fotos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_beheerder()
                                  or public.foto_zichtbaar(name)));
drop policy if exists "fotos verwijderen" on storage.objects;
create policy "fotos verwijderen" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fotos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_beheerder()));

create or replace function public.aantal_fotos()
returns int
language sql stable security definer set search_path = public
as $$ select count(*)::int from fotos where status = 'geplaatst'; $$;

-- Placed photos plus your own, newest first; the name follows "Wie komen er?" like the stories.
create or replace function public.fotos_lijst()
returns table (id uuid, pad text, titel text, speltak text, jaar int, eigen boolean, status text,
               voornaam text, bijnaam text, achternaam text, breedte int, hoogte int, aangemaakt timestamptz)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if not mag_verhalen() then raise exception 'alleen voor deelnemers' using errcode = '42501'; end if;
  return query
    select f.id, f.pad, f.titel, f.speltak, f.jaar, f.auteur = auth.uid(), f.status,
           case when f.toon_naam and d.toon_voornaam then d.voornaam end,
           case when f.toon_naam and d.toon_bijnaam and d.bijnaam <> '' then d.bijnaam end,
           case when f.toon_naam and d.toon_achternaam and d.achternaam <> '' then d.achternaam end,
           f.breedte, f.hoogte, f.aangemaakt
    from fotos f left join deelnemers d on d.id = f.auteur
    where f.status = 'geplaatst' or f.auteur = auth.uid()
    order by f.aangemaakt desc, f.id;
end;
$$;

create or replace function public.meld_foto(foto uuid, reden text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not mag_verhalen() then raise exception 'alleen voor deelnemers' using errcode = '42501'; end if;
  perform set_config('reunie.comite', '1', true);
  update fotos set status = 'gemeld', melding = left(nullif(trim(reden), ''), 500),
                   gemeld_door = mijn_naam(), gemeld_op = current_date, bijgewerkt = now()
    where id = foto and status = 'geplaatst';
end;
$$;

-- Comité: new and reported photos, grouped by upload, oldest first.
create or replace function public.fotos_te_beoordelen()
returns table (id uuid, pad text, groep uuid, titel text, speltak text, jaar int, toon_naam boolean, status text,
               melding text, gemeld_door text, gemeld_op date, auteur_naam text, aangemaakt timestamptz)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if not is_beheerder() then raise exception 'alleen voor het comite' using errcode = '42501'; end if;
  return query
    select f.id, f.pad, f.groep, f.titel, f.speltak, f.jaar, f.toon_naam, f.status, f.melding, f.gemeld_door, f.gemeld_op,
           coalesce(nullif(trim(d.voornaam || ' ' || d.achternaam), ''), u.email::text), f.aangemaakt
    from fotos f left join deelnemers d on d.id = f.auteur left join auth.users u on u.id = f.auteur
    where f.status in ('nieuw', 'gemeld')
    order by f.aangemaakt, f.id;
end;
$$;

-- Comité: actie 'plaatsen' or 'verwijderen'. Returns the pad of a removed photo, so the site
-- can delete its files.
create or replace function public.beoordeel_foto(foto uuid, actie text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  weg text;
begin
  if not is_beheerder() then raise exception 'alleen voor het comite' using errcode = '42501'; end if;
  perform set_config('reunie.comite', '1', true);
  if actie = 'plaatsen' then
    update fotos set status = 'geplaatst', melding = null, gemeld_door = null, gemeld_op = null where id = foto;
  elsif actie = 'verwijderen' then
    delete from fotos where id = foto returning pad into weg;
  else
    raise exception 'onbekende actie' using errcode = '22023';
  end if;
  return weg;
end;
$$;

-- Comité: placed photos and the space all photo files take, in bytes.
create or replace function public.foto_opslag()
returns table (geplaatst int, bytes bigint)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not is_beheerder() then raise exception 'alleen voor het comite' using errcode = '42501'; end if;
  return query select (select count(*)::int from fotos where status = 'geplaatst'),
                      (select coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint from storage.objects o where o.bucket_id = 'fotos');
end;
$$;

-- Comité: photo paths of a participant, to delete the files before removing the registration.
create or replace function public.fotos_van(deelnemer uuid)
returns setof text
language plpgsql stable security definer set search_path = public
as $$
begin
  if not is_beheerder() then raise exception 'alleen voor het comite' using errcode = '42501'; end if;
  return query select pad from fotos where auteur = deelnemer;
end;
$$;

-- Uploader or comité: change the title, speltak and year of a photo. The photo itself stays
-- the same, so it keeps its status (no new review).
create or replace function public.bewerk_foto(foto uuid, titel text, speltak text, jaar int)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from fotos f where f.id = foto and (f.auteur = auth.uid() or is_beheerder())) then
    raise exception 'geen toegang' using errcode = '42501';
  end if;
  update fotos f set titel = left(coalesce(trim(bewerk_foto.titel), ''), 80),
                     speltak = nullif(trim(bewerk_foto.speltak), ''),
                     jaar = bewerk_foto.jaar
    where f.id = foto;
end;
$$;

revoke all on function public.fotos_stempel() from public, anon, authenticated;
revoke all on function public.foto_zichtbaar(text) from public, anon, authenticated;
revoke all on function public.aantal_fotos() from public, anon, authenticated;
revoke all on function public.fotos_lijst() from public, anon, authenticated;
revoke all on function public.meld_foto(uuid, text) from public, anon, authenticated;
revoke all on function public.fotos_te_beoordelen() from public, anon, authenticated;
revoke all on function public.beoordeel_foto(uuid, text) from public, anon, authenticated;
revoke all on function public.foto_opslag() from public, anon, authenticated;
revoke all on function public.fotos_van(uuid) from public, anon, authenticated;
revoke all on function public.bewerk_foto(uuid, text, text, int) from public, anon, authenticated;
grant execute on function public.foto_zichtbaar(text) to authenticated;
grant execute on function public.aantal_fotos() to anon, authenticated;
grant execute on function public.fotos_lijst() to authenticated;
grant execute on function public.meld_foto(uuid, text) to authenticated;
grant execute on function public.fotos_te_beoordelen() to authenticated;
grant execute on function public.beoordeel_foto(uuid, text) to authenticated;
grant execute on function public.foto_opslag() to authenticated;
grant execute on function public.fotos_van(uuid) to authenticated;
grant execute on function public.bewerk_foto(uuid, text, text, int) to authenticated;

-- ---------------------------------------------------------------- comité: to review, and overleg

-- Comité: number of stories and photos waiting for a decision (new or reported); 0 for others.
create or replace function public.aantal_te_beoordelen()
returns int
language sql stable security definer set search_path = public
as $$
  select case when not is_beheerder() then 0 else
    (select count(*)::int from verhalen where status in ('nieuw', 'gemeld'))
    + (select count(*)::int from fotos where status in ('nieuw', 'gemeld')) end;
$$;

-- Overleg: conversations of the comité, optionally about a participant, story, photo or page.
-- Only comité members can see or write them. Whoever started a conversation can delete it
-- (a hoofdbeheerder any); you can delete your own messages. Wiped with everything else (see the privacy statement).
create table if not exists public.gesprekken (
  id          uuid primary key default gen_random_uuid(),
  titel       text not null check (char_length(titel) between 1 and 80),
  soort       text not null default 'vrij' check (soort in ('vrij', 'deelnemer', 'verhaal', 'foto', 'pagina')),
  ref         text check (char_length(ref) <= 100),        -- id of the participant/story/photo, or a page file
  ref_naam    text check (char_length(ref_naam) <= 120),   -- its name when the conversation started
  status      text not null default 'open' check (status in ('open', 'hot', 'done')),
  auteur      uuid references auth.users (id) on delete set null,
  auteur_naam text,
  aangemaakt  timestamptz not null default now(),
  bijgewerkt  timestamptz not null default now()
);
alter table public.gesprekken enable row level security;

create table if not exists public.berichten (
  id          uuid primary key default gen_random_uuid(),
  gesprek     uuid not null references public.gesprekken (id) on delete cascade,
  auteur      uuid references auth.users (id) on delete set null,
  auteur_naam text,
  tekst       text not null check (char_length(tekst) between 1 and 1000),
  systeem     boolean not null default false,              -- "Bas zette de status op hot"
  aangemaakt  timestamptz not null default now()
);
alter table public.berichten enable row level security;
create index if not exists berichten_gesprek on public.berichten (gesprek, aangemaakt);

-- Author, name and times are set here, not by the site. After the start only the status can
-- change; a change adds a line to the conversation.
create or replace function public.gesprekken_stempel()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.auteur := auth.uid(); new.auteur_naam := mijn_naam();
    new.aangemaakt := now(); new.bijgewerkt := now();
    return new;
  end if;
  new.id := old.id; new.titel := old.titel; new.soort := old.soort; new.ref := old.ref; new.ref_naam := old.ref_naam;
  new.auteur := old.auteur; new.auteur_naam := old.auteur_naam; new.aangemaakt := old.aangemaakt;
  if new.status is distinct from old.status then
    new.bijgewerkt := now();
    perform set_config('reunie.systeem', '1', true);
    insert into berichten (gesprek, tekst) values (old.id, 'zette de status op ' || new.status);
    perform set_config('reunie.systeem', '', true);
  end if;
  return new;
end;
$$;

drop trigger if exists gesprekken_stempel on public.gesprekken;
create trigger gesprekken_stempel before insert or update on public.gesprekken
  for each row execute function public.gesprekken_stempel();

create or replace function public.berichten_stempel()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.auteur := auth.uid(); new.auteur_naam := mijn_naam(); new.aangemaakt := now();
  new.systeem := coalesce(current_setting('reunie.systeem', true), '') = '1';
  return new;
end;
$$;

drop trigger if exists berichten_stempel on public.berichten;
create trigger berichten_stempel before insert on public.berichten
  for each row execute function public.berichten_stempel();

-- A new message moves the conversation up the list.
create or replace function public.berichten_na()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not new.systeem then update gesprekken set bijgewerkt = now() where id = new.gesprek; end if;
  return null;
end;
$$;

drop trigger if exists berichten_na on public.berichten;
create trigger berichten_na after insert on public.berichten
  for each row execute function public.berichten_na();

drop policy if exists "comite leest gesprekken" on public.gesprekken;
create policy "comite leest gesprekken" on public.gesprekken
  for select to authenticated using (public.is_beheerder());
drop policy if exists "comite start gesprek" on public.gesprekken;
create policy "comite start gesprek" on public.gesprekken
  for insert to authenticated with check (public.is_beheerder());
drop policy if exists "comite zet status" on public.gesprekken;
create policy "comite zet status" on public.gesprekken
  for update to authenticated using (public.is_beheerder()) with check (public.is_beheerder());

drop policy if exists "eigen gesprek verwijderen" on public.gesprekken;
create policy "eigen gesprek verwijderen" on public.gesprekken
  for delete to authenticated using ((auteur = auth.uid() and public.is_beheerder()) or public.is_hoofdbeheerder());

drop policy if exists "comite leest berichten" on public.berichten;
create policy "comite leest berichten" on public.berichten
  for select to authenticated using (public.is_beheerder());
drop policy if exists "comite schrijft bericht" on public.berichten;
create policy "comite schrijft bericht" on public.berichten
  for insert to authenticated with check (public.is_beheerder());
drop policy if exists "eigen bericht verwijderen" on public.berichten;
create policy "eigen bericht verwijderen" on public.berichten
  for delete to authenticated using (auteur = auth.uid() and not systeem and public.is_beheerder());

-- Start a conversation with its first message in one go. Returns the new id.
create or replace function public.start_gesprek(titel text, soort text default 'vrij', ref text default null,
                                                ref_naam text default null, status text default 'open', tekst text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  nieuw uuid;
begin
  if not is_beheerder() then raise exception 'alleen voor het comite' using errcode = '42501'; end if;
  insert into gesprekken (titel, soort, ref, ref_naam, status)
    values (left(trim(start_gesprek.titel), 80), coalesce(start_gesprek.soort, 'vrij'), start_gesprek.ref,
            left(start_gesprek.ref_naam, 120), coalesce(start_gesprek.status, 'open'))
    returning id into nieuw;
  if nullif(trim(start_gesprek.tekst), '') is not null then
    insert into berichten (gesprek, tekst) values (nieuw, left(trim(start_gesprek.tekst), 1000));
  end if;
  return nieuw;
end;
$$;

revoke all on function public.aantal_te_beoordelen() from public, anon, authenticated;
revoke all on function public.gesprekken_stempel() from public, anon, authenticated;
revoke all on function public.berichten_stempel() from public, anon, authenticated;
revoke all on function public.berichten_na() from public, anon, authenticated;
revoke all on function public.start_gesprek(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.aantal_te_beoordelen() to authenticated;
grant execute on function public.start_gesprek(text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------- seen (comité badges)

-- What each comité member has seen, so a yellow badge means "new since you last looked",
-- on every device. soort 'gesprek' + ref = conversation id, tijd = time of the last message
-- seen; soort 'beoordelen' + ref '' = when the tab Te beoordelen was last opened.
-- No direct access: mijn_gezien(), zet_gezien() and nieuw_voor_mij(). Goes with the login.
-- Wiped with everything else. Without a row, the last 7 days count as new.
create table if not exists public.gezien (
  wie   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  soort text not null check (soort in ('gesprek', 'beoordelen')),
  ref   text not null default '' check (char_length(ref) <= 100),
  tijd  timestamptz not null,
  primary key (wie, soort, ref)
);
alter table public.gezien enable row level security;
revoke all on table public.gezien from anon, authenticated;

create or replace function public.mijn_gezien()
returns table (soort text, ref text, tijd timestamptz)
language sql stable security definer set search_path = public
as $$ select soort, ref, tijd from gezien where wie = auth.uid() and is_beheerder(); $$;

-- items: [{ "soort": "gesprek", "ref": "<id>", "tijd": "..." }, ...]. Only moves forward, never past now.
create or replace function public.zet_gezien(items jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_beheerder() then raise exception 'alleen voor het comite' using errcode = '42501'; end if;
  insert into gezien (wie, soort, ref, tijd)
    select auth.uid(), x.soort, coalesce(x.ref, ''), least(coalesce(x.tijd, now()), now())
    from jsonb_to_recordset(items) as x(soort text, ref text, tijd timestamptz)
    where x.soort in ('gesprek', 'beoordelen')
  on conflict (wie, soort, ref) do update set tijd = greatest(gezien.tijd, excluded.tijd);
end;
$$;

-- Badges for the menu and the tabs on Beheer:
--   overleg: conversations with something new by someone else (a new conversation or a message,
--            status lines not counted) since you last opened it;
--   beoordelen_nieuw: stories and photos waiting that arrived (or were reported) since you
--            last opened Te beoordelen; beoordelen: all that wait.
create or replace function public.nieuw_voor_mij()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  ik    uuid := auth.uid();
  grens timestamptz := now() - interval '7 days';
  b     timestamptz;
begin
  if not is_beheerder() then return '{}'::jsonb; end if;
  b := coalesce((select tijd from gezien where wie = ik and soort = 'beoordelen' and ref = ''), grens);
  return jsonb_build_object(
    'overleg', (select count(*)::int from gesprekken g
                left join gezien z on z.wie = ik and z.soort = 'gesprek' and z.ref = g.id::text
                where (g.auteur is distinct from ik and g.aangemaakt > coalesce(z.tijd, grens))
                   or exists (select 1 from berichten m where m.gesprek = g.id and not m.systeem
                              and m.auteur is distinct from ik and m.aangemaakt > coalesce(z.tijd, grens))),
    'beoordelen_nieuw', (select count(*)::int from verhalen where status in ('nieuw', 'gemeld') and bijgewerkt > b)
                      + (select count(*)::int from fotos where status in ('nieuw', 'gemeld') and bijgewerkt > b),
    'beoordelen', aantal_te_beoordelen());
end;
$$;

revoke all on function public.mijn_gezien() from public, anon, authenticated;
revoke all on function public.zet_gezien(jsonb) from public, anon, authenticated;
revoke all on function public.nieuw_voor_mij() from public, anon, authenticated;
grant execute on function public.mijn_gezien() to authenticated;
grant execute on function public.zet_gezien(jsonb) to authenticated;
grant execute on function public.nieuw_voor_mij() to authenticated;

-- ---------------------------------------------------------------- hartjes

-- Hearts on placed stories and photos: one per participant per item, not on your own.
-- Nobody reads the table directly: hartjes() gives counts only, never who gave them.
-- Goes with the story or photo, and with the login. Wiped with everything else.
create table if not exists public.hartjes (
  verhaal     uuid references public.verhalen (id) on delete cascade,
  foto        uuid references public.fotos (id) on delete cascade,
  auteur      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  aangemaakt  timestamptz not null default now(),
  check (num_nonnulls(verhaal, foto) = 1)
);
create unique index if not exists hartjes_verhaal on public.hartjes (verhaal, auteur) where verhaal is not null;
create unique index if not exists hartjes_foto on public.hartjes (foto, auteur) where foto is not null;
alter table public.hartjes enable row level security;
revoke all on table public.hartjes from anon, authenticated;

-- Per item with hearts: the count, whether one is yours, and whether the item is yours.
create or replace function public.hartjes()
returns table (soort text, ref uuid, aantal int, van_mij boolean, eigen boolean)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not mag_verhalen() then raise exception 'alleen voor deelnemers' using errcode = '42501'; end if;
  return query
    select 'verhaal'::text, h.verhaal, count(*)::int, bool_or(h.auteur = auth.uid()), bool_or(v.auteur = auth.uid())
      from hartjes h join verhalen v on v.id = h.verhaal where v.status = 'geplaatst' group by h.verhaal
    union all
    select 'foto'::text, h.foto, count(*)::int, bool_or(h.auteur = auth.uid()), bool_or(f.auteur = auth.uid())
      from hartjes h join fotos f on f.id = h.foto where f.status = 'geplaatst' group by h.foto;
end;
$$;

-- Give (aan) or take back a heart on a placed story or photo of someone else. Returns the new count.
create or replace function public.zet_hartje(soort text, ref uuid, aan boolean)
returns int
language plpgsql security definer set search_path = public
as $$
declare n int;
begin
  if not mag_verhalen() then raise exception 'alleen voor deelnemers' using errcode = '42501'; end if;
  if soort = 'verhaal' then
    if not exists (select 1 from verhalen v where v.id = ref and v.status = 'geplaatst' and v.auteur <> auth.uid()) then
      raise exception 'niet mogelijk' using errcode = '42501';
    end if;
    if aan then insert into hartjes (verhaal) values (ref) on conflict (verhaal, auteur) where verhaal is not null do nothing;
    else delete from hartjes h where h.verhaal = ref and h.auteur = auth.uid(); end if;
    select count(*)::int into n from hartjes h where h.verhaal = ref;
  elsif soort = 'foto' then
    if not exists (select 1 from fotos f where f.id = ref and f.status = 'geplaatst' and f.auteur <> auth.uid()) then
      raise exception 'niet mogelijk' using errcode = '42501';
    end if;
    if aan then insert into hartjes (foto) values (ref) on conflict (foto, auteur) where foto is not null do nothing;
    else delete from hartjes h where h.foto = ref and h.auteur = auth.uid(); end if;
    select count(*)::int into n from hartjes h where h.foto = ref;
  else
    raise exception 'onbekende soort' using errcode = '22023';
  end if;
  return n;
end;
$$;

revoke all on function public.hartjes() from public, anon, authenticated;
revoke all on function public.zet_hartje(text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.hartjes() to authenticated;
grant execute on function public.zet_hartje(text, uuid, boolean) to authenticated;

-- Comité members: hoofdbeheerders add ordinary beheerders on the site (Beheer > Comité).
-- Hoofdbeheerders are set here only:
-- insert into public.beheerders (email, rol) values ('naam@example.com', 'hoofdbeheerder')
--   on conflict (email) do update set rol = 'hoofdbeheerder';
-- Removing one: delete from public.beheerders where email = 'naam@example.com';
