# MK Gaming — integração inicial com Supabase Auth

Site responsivo com identidade preta e dourada, detalhes roxos discretos e autenticação real delegada ao Supabase Auth. A seção Nyrax foi removida da interface atual. Stardew Valley continua identificado apenas como título em avaliação técnica.

## O que esta versão faz

- Apresenta opções distintas de **Entrar** e **Criar conta** no cabeçalho e na área pessoal.
- Alterna entre formulários de login e cadastro dentro do diálogo de autenticação.
- Usa Supabase Auth para criar contas, entrar, manter a sessão, confirmar e-mail (se habilitado no Supabase) e sair.
- Não recebe nem armazena senhas no servidor da MK Gaming; o Supabase processa a autenticação.
- Mantém a chave pública do Supabase no endpoint de configuração, nunca a chave `service_role`.
- Inclui cabeçalhos de segurança via Helmet, Content Security Policy restritiva e limite de solicitações ao endpoint público de configuração. O Supabase aplica os próprios limites de autenticação.

## 1. Criar/configurar o projeto Supabase

1. Entre em https://supabase.com/dashboard e crie um projeto para a MK Gaming (ou abra o projeto existente).
2. Nas configurações do projeto, localize **Project URL** e a chave pública **Publishable key**. Projetos antigos também podem apresentar a chave `anon` pública.
3. Nas configurações de **Authentication / URL Configuration**, defina a URL principal real do site em **Site URL** e inclua as URLs de retorno necessárias em **Redirect URLs**. Não use uma URL de exemplo em produção.
4. Em **Authentication / Providers / Email**, decida se a confirmação de e-mail ficará habilitada. É recomendável mantê-la habilitada para uma plataforma pública; configure o envio de e-mails antes de liberar o cadastro.
5. No ambiente de hospedagem do backend, configure estas variáveis:

   - `SUPABASE_URL`: Project URL, por exemplo `https://seu-projeto.supabase.co`.
   - `SUPABASE_PUBLISHABLE_KEY`: chave pública Publishable (ou `SUPABASE_ANON_KEY` para a chave pública legada).
   - `NODE_ENV=production`.
   - `PORT`, somente se a hospedagem exigir uma porta específica.

A chave Publishable/anon foi projetada para uso no cliente, mas o acesso aos dados depende de políticas corretas. **Nunca** coloque uma chave `service_role` ou segredo privado em variáveis expostas ao frontend, arquivos públicos ou repositórios.

## 2. Executar

```bash
npm install
npm run check
npm start
```

Abra o endereço fornecido pela hospedagem. O endpoint `/api/config` informa ao frontend se a URL e a chave pública foram configuradas. Sem essas variáveis, os botões de conta permanecem desativados e a interface explica o motivo, em vez de simular autenticação.

## 3. Como o cadastro funciona

- **Criar conta:** envia e-mail e senha ao Supabase Auth. A senha exige pelo menos 12 caracteres na interface.
- **Confirmação por e-mail:** se estiver habilitada no projeto, a interface avisa que o usuário precisa confirmar o endereço antes de entrar.
- **Entrar:** autentica usando e-mail e senha.
- **Sair:** encerra a sessão do Supabase.

A interface não oferece ainda recuperação de senha nem edição de perfil. Esses recursos devem ser adicionados em uma etapa própria.

## Segurança e próximos passos

- Ao criar tabelas para perfis, biblioteca ou preferências, habilite RLS e escreva políticas que limitem cada usuário aos próprios registros. Não crie tabelas públicas sem políticas.
- Não confie em dados de perfil enviados pelo navegador para conceder permissões.
- Configure CAPTCHA/limites antiabuso no Supabase antes de abrir o cadastro ao público, conforme a necessidade.
- Configure corretamente HTTPS, Site URL, Redirect URLs e o envio de e-mail no ambiente real.
- Teste cadastro, confirmação de e-mail, login, logout e sessão no domínio publicado antes de considerar o sistema pronto.
- A CSP permite conexão somente com a origem Supabase configurada e carrega o SDK de `esm.sh`. Para ambientes que exigem dependências locais, o SDK poderá ser empacotado localmente numa etapa posterior.
- Não foi possível validar o projeto Supabase nem a hospedagem real sem a URL/chave públicas e acesso às configurações do provedor.

## Estrutura

- `server.js` — servidor Express, cabeçalhos, limitação de solicitações e configuração pública do Supabase.
- `public/index.html` — página inicial, biblioteca e formulários de conta.
- `public/styles.css` — visual responsivo preto/dourado/roxo.
- `public/app.js` — integração do navegador com Supabase Auth.
- `.env.example` — nomes de variáveis ilustrativos, sem segredos reais.
