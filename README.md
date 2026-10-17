# MK Gaming — primeira evolução

Interface responsiva da MK Gaming com identidade preta, dourada e roxa discreta. A seção Nyrax foi retirada da interface atual, conforme o Documento Mestre.

## O que foi preparado

- Login, cadastro, verificação de sessão e logout por endpoints no servidor.
- Senhas armazenadas com hash bcrypt (custo 12), nunca em texto puro.
- Sessões em cookies `HttpOnly`, `SameSite=Lax` e `Secure` em produção.
- Sessões persistidas no PostgreSQL, limite de tentativas de autenticação e token CSRF para operações que alteram dados.
- Cabeçalhos de segurança via Helmet, Content Security Policy, limite do corpo das requisições e mensagens de erro genéricas.
- Detalhes dourados discretos, foco visível para teclado, respeito à preferência por movimento reduzido e fontes locais do sistema.

## Requisitos para ativar a autenticação

A autenticação permanece indisponível até configurar as variáveis de ambiente no provedor:

- `DATABASE_URL`: conexão PostgreSQL com permissão para criar as tabelas `users` e `user_sessions`.
- `SESSION_SECRET`: segredo aleatório com pelo menos 32 caracteres. Não coloque o segredo no frontend nem no repositório.
- `NODE_ENV=production` em produção, para ativar cookies seguros e o comportamento de proxy configurado.

Depois de configurar as variáveis, execute `npm install` e `npm start`. O servidor cria a tabela de usuários ao iniciar; o armazenamento de sessões cria sua tabela quando necessário. Faça backup do banco e restrinja o acesso às credenciais.

Se a hospedagem Squareweb não aceitar Node.js persistente e PostgreSQL, hospede o backend e banco em um serviço compatível e mantenha o domínio/HTTPS configurado. Não publique a interface esperando que o login funcione sem essas dependências.

## Limitações que ainda precisam ser resolvidas antes de um lançamento público

- Não há confirmação de e-mail, recuperação de senha, verificação contra endereços descartáveis ou processo de suporte a contas.
- Não há MFA nem ferramenta administrativa de gerenciamento de contas.
- Não foi possível validar a compatibilidade do plano de hospedagem com Node.js/PostgreSQL a partir deste pacote.
- Não há testes de penetração nem auditoria externa. A implementação precisa ser testada no ambiente de implantação antes de ser considerada pronta para produção.
- A biblioteca continua sendo uma apresentação inicial. Stardew Valley está apenas em avaliação técnica; não é oferecido para jogar.

## Desenvolvimento local

1. Instale uma versão LTS atual do Node.js.
2. Crie um banco PostgreSQL e configure `DATABASE_URL` e `SESSION_SECRET` no ambiente.
3. Execute `npm install`, depois `npm run check` e `npm start`.
4. Abra `http://localhost:3000`.

Não envie `.env`, senhas, tokens ou dumps do banco para o repositório. O arquivo `.env.example` contém apenas valores ilustrativos.
