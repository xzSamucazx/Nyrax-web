# MK Gaming — primeira estrutura visual

Projeto independente da Nyxara. Interface inicial responsiva para Railway ou hospedagem estática compatível.

## Conteúdo
- `public/`: página inicial, estilos e interações do modal.
- `package.json`: servidor estático Node para testar localmente ou publicar em um host Node.
- Login/cadastro são apenas a interface: ficam desabilitados até integrar autenticação real.
- Nyrax é apenas apresentação; nenhum saldo é inventado ou armazenado no navegador.

## Executar em ambiente Node
`npm install` e `npm start`

Para Squareweb, confirmar se o plano permite Node/backend. Se aceitar somente arquivos estáticos, esta interface pode ser publicada, mas autenticação real e carteira Nyrax exigirão um backend externo compatível.

Antes de produção: configurar autenticação, banco de dados, sessão segura, permissões administrativas e registros de movimentação Nyrax no servidor.
