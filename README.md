# PoPlist

MVP de leaderboard e votacao pronto para hospedar no GitHub Pages, usando apenas HTML, CSS, JavaScript puro e Supabase como backend.

## Estrutura do projeto

```text
index.html
suggest.html
admin.html
style.css
app.js
suggest.js
admin.js
supabase-config.js
supabase-upgrade.sql
README.md
```

## O que este projeto faz

- Pagina publica com Top 10 e lista completa de pessoas ativas.
- Votacao limitada a 1 acao por dia por navegador na pagina principal, com upvote e downvote.
- Pagina separada de "vote para adicionar" com rodada global de 2 dias.
- Formulario publico para sugerir nomes com upload de imagem para Supabase Storage.
- Promocao automatica do nome mais votado da rodada para a leaderboard principal quando a rodada seguinte comeca.
- Atualizacao da interface sem recarregar a pagina.
- Painel admin privado com login por e-mail e senha via Supabase Auth.
- CRUD completo de pessoas no painel admin.
- Contagem de votos consistente via RPC no banco, evitando condicao de corrida.

## Upgrade rapido para as novas funcoes

1. Execute o arquivo [supabase-upgrade.sql](/home/kris/Documentos/Web/PoPlist/supabase-upgrade.sql) no `SQL Editor` do Supabase.
2. Crie um bucket publico chamado `suggestion-images` em `Storage`.
3. Adicione uma policy no bucket para permitir `insert` e `select` para `anon` e `authenticated`.
4. Publique os novos arquivos `suggest.html` e `suggest.js` junto com o restante do site.

Sem esse upgrade, os novos botoes e a nova pagina vao abrir, mas as acoes dependentes do banco nao vao funcionar.
