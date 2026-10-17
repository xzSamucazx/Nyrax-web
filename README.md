# MK Gaming — autenticação v2

Esta versão reorganiza a interface de autenticação em duas telas distintas: **Entrar** e **Criar sua conta**. O login com Discord fica disponível nas duas telas.

## O que foi corrigido
- Login e cadastro usam formulários separados, com campos e botões próprios.
- Cadastro exige senha de pelo menos 12 caracteres e confirmação da senha.
- Erros de login, cadastro e Discord são mostrados junto à ação correspondente.
- O login Discord usa o fluxo OAuth do Supabase e faz navegação explícita para a URL retornada.
- Os arquivos HTML e JavaScript de autenticação usam cabeçalhos `no-cache`, para evitar que o navegador continue carregando o código anterior.
- O endpoint `/api/config` continua disponível quando o projeto é executado com Node.js/Express.

## Configuração do Supabase
A URL do projeto e a chave **Publishable** estão no arquivo `public/supabase-config.js`. A chave publishable/anon é pública por definição; não coloque nesse arquivo `sb_secret` ou `service_role`.

O provedor Discord e as URLs de retorno devem continuar configurados no Supabase:
- Provider: Discord habilitado, Client ID e Client Secret cadastrados no painel do Supabase.
- Discord Developer Portal → OAuth2 → Redirects: cadastrar exatamente a Callback URL que o Supabase mostra para o provedor Discord.
- Supabase → Authentication → URL Configuration: Site URL igual ao domínio público do site e Redirect URLs autorizando o domínio do site, por exemplo `https://nyrax.squareweb.app/**`.
- O endereço usado pelo site para retorno é a origem atual com `/` no final. Para testar localmente em `http://localhost:3000`, adicione também `http://localhost:3000/**` em Redirect URLs; remova essa autorização quando não precisar mais dela.

## Executar localmente
1. Instale Node.js LTS.
2. Copie `.env.example` para `.env` se estiver executando o servidor Node.js.
3. Preencha `SUPABASE_PUBLISHABLE_KEY` no `.env` se quiser que o servidor forneça a configuração. O arquivo `public/supabase-config.js` também tem a chave publicável para hospedagem estática.
4. Execute `npm install`, depois `npm run check` e `npm start`.
5. Abra `http://localhost:3000`.

## Publicação
Publique **todo o conteúdo atualizado da pasta `Nyrax-web-main`**, incluindo `public/index.html`, `public/app.js`, `public/styles.css`, `public/supabase-config.js` e `server.js` se a hospedagem executar Node.js. Não envie apenas o `index.html`. Se o serviço executar somente arquivos estáticos, publique os quatro arquivos de `public` e confirme que o host permite requisições HTTPS ao projeto Supabase.

Depois de publicar, faça uma atualização forçada ou abra uma janela anônima. No Android/Chrome, também pode limpar os dados/cache do site. Os arquivos `index.html`, `app.js` e `supabase-config.js` têm parâmetros de versão e cabeçalhos para evitar código antigo em cache.

## Limitações e teste
Esta versão foi validada quanto à sintaxe e integridade dos arquivos. Não foi possível autenticar de fato contra o projeto Supabase nem validar o OAuth publicado a partir deste ambiente. Depois da publicação, teste:
1. Abrir Entrar e confirmar que há apenas os campos de login e o botão Entrar.
2. Abrir Criar conta e confirmar que aparecem os campos Criar senha e Confirmar senha e o botão Criar conta.
3. Criar uma conta de teste e confirmar o e-mail.
4. Entrar com essa conta.
5. Testar Continuar com Discord. Se falhar, a mensagem mostrada abaixo do botão indicará o tipo de configuração a verificar.

Nunca publique o Client Secret do Discord, senhas do banco ou chaves `sb_secret`/`service_role`.
