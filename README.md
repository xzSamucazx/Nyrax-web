# MK Gaming — autenticação Supabase

Projeto com interface de login/cadastro por e-mail e login social Discord.

## Configuração rápida

1. Confira `public/supabase-config.js`. Ele contém apenas a URL do projeto e a **Publishable key** pública do Supabase. Nunca coloque uma chave `sb_secret_` ou `service_role` nesse arquivo.
2. No Supabase, mantenha o provedor Email habilitado e confirme se a confirmação de e-mail está configurada como deseja.
3. No Supabase, em Authentication → Sign In / Providers → Discord, habilite o provedor e configure o Client ID e Client Secret da aplicação Discord.
4. No Discord Developer Portal, em OAuth2 → Redirects, cadastre exatamente a Callback URL exibida pelo Supabase.
5. Em Authentication → URL Configuration, use `https://nyrax.squareweb.app` como Site URL e inclua o domínio em Redirect URLs. Em produção, prefira URLs específicas quando possível.
6. Para executar com Node.js: `npm install` e `npm start`. O servidor usa `PORT` do ambiente.

## Importante sobre hospedagem

O frontend agora tenta primeiro `GET /api/config` e usa `public/supabase-config.js` como fallback se a hospedagem servir somente arquivos estáticos. O fallback contém uma chave publicável, que é feita para uso no cliente. As regras de segurança dos dados devem ser garantidas no Supabase, não pela ocultação dessa chave.

O SDK é carregado do `esm.sh`, portanto a hospedagem precisa permitir scripts e conexões HTTPS com esse domínio e com o projeto Supabase. O servidor Express inclui a origem Supabase atual na política CSP.

## Fluxos

- Criar conta por e-mail: Supabase Auth `signUp`, com mensagem de confirmação de e-mail.
- Entrar por e-mail: Supabase Auth `signInWithPassword`.
- Discord: OAuth com navegação explícita para a URL de autorização retornada pelo Supabase.
- Sair: `signOut`.
- A alternância entre entrar e criar conta muda título, texto, validação e ação do formulário.

## Verificação

Execute `npm install`, `npm run check` e `npm start`. Depois teste no navegador:
1. Abrir Entrar e alternar para Criar conta.
2. Cadastrar um endereço de e-mail de teste.
3. Confirmar o e-mail, caso a confirmação esteja ativada.
4. Entrar e sair.
5. Clicar em Continuar com Discord, autorizar e verificar se retorna ao site.

A integração foi verificada por sintaxe neste pacote, mas não é possível garantir autenticação real sem executar os testes contra o projeto Supabase e a hospedagem de produção.

## Segurança

Nunca exponha o Client Secret do Discord, `sb_secret_` ou `service_role`. A Publishable key no frontend não é um segredo. Não crie tabelas com dados privados sem Row Level Security (RLS) e políticas apropriadas.
