# PoPlist

MVP de leaderboard e votacao pronto para hospedar no GitHub Pages, usando apenas HTML, CSS, JavaScript puro e Supabase como backend.

## Estrutura do projeto

```text
index.html
admin.html
style.css
app.js
admin.js
supabase-config.js
README.md
```

## O que este projeto faz

- Pagina publica com Top 10 e lista completa de pessoas ativas.
- Votacao limitada a 1 voto por dia por navegador, usando `localStorage` + tabela `votes`.
- Atualizacao da interface sem recarregar a pagina.
- Painel admin privado com login por e-mail e senha via Supabase Auth.
- CRUD completo de pessoas no painel admin.
- Contagem de votos consistente via RPC no banco, evitando condicao de corrida.

## 1. Criar o projeto no Supabase

1. Acesse o Supabase e crie um novo projeto.
2. No painel do projeto, abra `SQL Editor`.
3. Execute o SQL completo abaixo.
4. Em `Authentication > Users`, crie o usuario admin com seu e-mail real.
5. Em `Project Settings > API`, copie:
   - `Project URL`
   - `anon public key`
6. Edite [supabase-config.js](/home/kris/Documentos/Web/PoPlist/supabase-config.js) e troque:
   - `https://SEU-PROJETO.supabase.co`
   - `SUA_SUPABASE_ANON_KEY`
   - `seu-email-admin@exemplo.com`

## 2. SQL completo do schema

```sql
create extension if not exists pgcrypto;

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  photo_url text,
  votes_count integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  voter_token text not null,
  vote_date date not null,
  created_at timestamptz not null default now(),
  constraint votes_voter_token_vote_date_key unique (voter_token, vote_date)
);

create or replace function public.submit_vote(
  p_person_id uuid,
  p_voter_token text,
  p_vote_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.people
    where id = p_person_id
      and active = true
  ) then
    raise exception 'Person not found or inactive';
  end if;

  insert into public.votes (person_id, voter_token, vote_date)
  values (p_person_id, p_voter_token, p_vote_date);

  update public.people
  set votes_count = votes_count + 1
  where id = p_person_id;

exception
  when unique_violation then
    raise exception 'User has already voted today';
end;
$$;

revoke all on function public.submit_vote(uuid, text, date) from public;
grant execute on function public.submit_vote(uuid, text, date) to anon, authenticated;
```

## 3. RLS e politicas

Execute este bloco depois do schema:

```sql
  alter table public.people enable row level security;
  alter table public.votes enable row level security;

  drop policy if exists "public_can_read_active_people" on public.people;
  create policy "public_can_read_active_people"
  on public.people
  for select
  to anon, authenticated
  using (active = true);

  drop policy if exists "admin_can_insert_people" on public.people;
  create policy "admin_can_insert_people"
  on public.people
  for insert
  to authenticated
  with check ((auth.jwt() ->> 'email') = 'seu-email-admin@exemplo.com');

  drop policy if exists "admin_can_update_people" on public.people;
  create policy "admin_can_update_people"
  on public.people
  for update
  to authenticated
  using ((auth.jwt() ->> 'email') = 'seu-email-admin@exemplo.com')
  with check ((auth.jwt() ->> 'email') = 'seu-email-admin@exemplo.com');

  drop policy if exists "admin_can_delete_people" on public.people;
  create policy "admin_can_delete_people"
  on public.people
  for delete
  to authenticated
  using ((auth.jwt() ->> 'email') = 'seu-email-admin@exemplo.com');

  drop policy if exists "public_can_read_votes_for_daily_check" on public.votes;
  create policy "public_can_read_votes_for_daily_check"
  on public.votes
  for select
  to anon, authenticated
  using (true);

  drop policy if exists "public_can_insert_votes" on public.votes;
  create policy "public_can_insert_votes"
  on public.votes
  for insert
  to anon, authenticated
  with check (true);
```

Importante:

- Troque `seu-email-admin@exemplo.com` pelo mesmo e-mail configurado em [supabase-config.js](/home/kris/Documentos/Web/PoPlist/supabase-config.js).
- O projeto usa a policy de leitura em `votes` para a funcao `checkIfAlreadyVotedToday()` da interface publica.
- Se voce quiser endurecer a seguranca depois, pode remover o `select` publico de `votes` e confiar apenas na RPC + `localStorage`, mas este MVP prioriza simplicidade.

## 4. Como funciona a limitacao de 1 voto por dia

O frontend cria um identificador local chamado `voter_token` usando `localStorage`.

Fluxo:

1. O navegador gera ou reaproveita `voter_token`.
2. Ao abrir a pagina, o site verifica na tabela `votes` se ja existe voto com:
   - `voter_token`
   - `vote_date` no formato `YYYY-MM-DD`
3. Se ja existir, os botoes de voto ficam desabilitados.
4. Se nao existir, o usuario pode votar.
5. O clique chama a RPC `submit_vote`, que:
   - grava a linha em `votes`
   - incrementa `votes_count` em `people`
   - falha em duplicidade por causa da constraint unica

Limitacao importante:

- Este metodo evita votos duplicados basicos no mesmo navegador.
- Nao impede abuso avancado, como limpar `localStorage`, trocar de navegador, usar modo anonimo ou automatizar requisicoes.
- Para um projeto simples em GitHub Pages, ele atende bem como MVP sem backend proprio.

## 5. Criar o usuario admin

1. No Supabase, abra `Authentication > Users`.
2. Clique em `Add user`.
3. Cadastre seu e-mail e senha.
4. Confirme que o e-mail e exatamente o mesmo usado:
   - nas policies SQL
   - em [supabase-config.js](/home/kris/Documentos/Web/PoPlist/supabase-config.js)

## 6. Deploy no GitHub Pages

1. Envie estes arquivos para um repositorio GitHub.
2. No repositorio, abra `Settings > Pages`.
3. Em `Build and deployment`, escolha:
   - `Source: Deploy from a branch`
   - branch principal
   - pasta `/root`
4. Salve.
5. Aguarde o GitHub Pages publicar.

Arquivos publicos:

- `index.html` sera a pagina principal.
- `admin.html` sera o painel privado.

Exemplo:

- `https://seu-usuario.github.io/seu-repo/`
- `https://seu-usuario.github.io/seu-repo/admin.html`

## 7. Manutencao

- Para adicionar ou editar pessoas, acesse `admin.html`.
- Pessoas com `active = false` somem da pagina publica, mas continuam no banco.
- Ao excluir uma pessoa, os votos dela sao removidos automaticamente por `on delete cascade`.
- Se voce trocar o e-mail admin, atualize:
  - as policies SQL
  - [supabase-config.js](/home/kris/Documentos/Web/PoPlist/supabase-config.js)

## 8. Observacoes finais

- [app.js](/home/kris/Documentos/Web/PoPlist/app.js) concentra a pagina publica.
- [admin.js](/home/kris/Documentos/Web/PoPlist/admin.js) cuida de login, logout e CRUD.
- [style.css](/home/kris/Documentos/Web/PoPlist/style.css) tem um visual simples, responsivo e facil de editar.
- O projeto nao usa build, framework, Node.js nem backend proprio.
