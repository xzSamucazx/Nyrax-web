# MK Gaming — autenticação v2

Esta versão usa uma paleta preta com roxo metálico e reorganiza a interface de autenticação em duas telas distintas: **Entrar** e **Criar sua conta**. O login com Discord fica disponível nas duas telas.

## O que foi corrigido
- Login e cadastro usam formulários separados, com campos e botões próprios.
- Cadastro exige senha de pelo menos 12 caracteres e confirmação da senha.
- Erros de login, cadastro e Discord são mostrados junto à ação correspondente.
- O login Discord usa o fluxo OAuth padrão do Supabase JS, que inicia o redirecionamento automaticamente.
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


## Nome de exibição e logotipo
- A navegação usa o logotipo MK fornecido para substituir o monograma textual.
- O cadastro por e-mail solicita um nome de exibição (2–32 caracteres), armazenado nos metadados do Supabase Auth.
- Após entrar, a página mostra o nome de exibição, nunca o endereço de e-mail; o usuário pode alterar o nome na seção Conta.
- No login Discord, o nome inicial vem dos metadados disponibilizados pelo provedor e pode ser alterado na seção Conta.
- O ícone Discord é um SVG inline e não depende de um pacote externo.


## Recursos sociais MK Gaming (Supabase)

Este pacote inclui perfis, busca de jogadores, solicitações de amizade e registro manual de horas jogadas. Antes de usar os recursos sociais:

1. Abra o Supabase Dashboard do projeto MK Gaming.
2. Entre em **SQL Editor → New query**.
3. Abra `supabase/mk-gaming-social.sql`, copie todo o conteúdo e execute.
4. Publique todos os arquivos atualizados da pasta `public` e mantenha `supabase-config.js` com a URL e a chave **Publishable** do projeto.
5. Entre com uma conta e teste salvar perfil, registrar horas, buscar outro perfil e aceitar uma solicitação usando uma segunda conta de teste.

Perfis são públicos na busca por padrão; cada usuário pode desativar a opção de aparecer na busca. Os e-mails não são mostrados nos perfis. Horas jogadas são informadas manualmente e não são verificadas automaticamente por plataformas de jogos. O SQL ativa RLS e limita a edição de perfil/horas ao próprio usuário e as solicitações aos participantes.

**Importante:** o SQL deve ser executado uma vez no Supabase antes de testar os recursos sociais. Não compartilhe chaves `sb_secret`/`service_role`.


## Perfil e contador de sessões

A versão atual abre o perfil em uma janela própria, permite editar nome, biografia, privacidade e foto (PNG/JPG/WebP até 3 MB). O SQL atualizado cria a coluna de avatar, tabela `game_sessions`, políticas RLS e bucket `profile-avatars`.

As horas são contadas automaticamente **durante sessões iniciadas manualmente no site**: o usuário informa o jogo e clica em “Iniciar contagem”, depois clica em “Finalizar sessão”. A aplicação web não consegue detectar se um jogo nativo está realmente aberto no computador/celular; para medir tempo de execução real do Steam ou de jogos locais será necessária uma integração específica com a plataforma/cliente. A página envia heartbeat a cada minuto e fecha sessões antigas usando o último heartbeat para reduzir contagens indevidas.

Se você já executou uma versão anterior do SQL, execute este arquivo atualizado novamente no SQL Editor. As instruções usam `IF NOT EXISTS`/policies substituíveis para adicionar as extensões.
