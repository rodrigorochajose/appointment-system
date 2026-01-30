# Sistema de Agendamentos API

Sistema genérico de gerenciamento de agendamentos desenvolvido com NestJS, DrizzleORM e MySQL.

## 🚀 Tecnologias

- **Framework:** NestJS 10
- **ORM:** DrizzleORM
- **Banco de Dados:** MySQL 8.0
- **Linguagem:** TypeScript
- **Validação:** class-validator + class-transformer
- **Autenticação:** JWT (@nestjs/jwt)
- **Criptografia:** bcrypt

## 📋 Pré-requisitos

- Node.js 20+
- npm ou yarn
- Docker e Docker Compose

## 🔧 Instalação

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar variáveis de ambiente

Copie o arquivo `.env.example` para `.env` e configure as variáveis:

```bash
cp .env.example .env
```

### 3. Iniciar MySQL com Docker

```bash
docker-compose up -d
```

### 4. Gerar e executar migrations

```bash
# Gerar migrations
npm run db:generate

# Aplicar migrations
npm run db:push
```

## 🏃 Executar a aplicação

### Modo desenvolvimento

```bash
npm run start:dev
```

A API estará disponível em: `http://localhost:3000/api`

### Modo produção

```bash
# Build
npm run build

# Executar
npm run start:prod
```

## 📚 Documentação da API

### Endpoints principais

#### Auth
- `POST /api/auth` - Login de profissional

#### User (Clientes)
- `POST /api/user` - Criar usuário (público)
- `GET /api/user` - Listar usuários (auth)
- `GET /api/user/:id` - Buscar usuário (auth)
- `PATCH /api/user/:id` - Atualizar usuário (auth)
- `DELETE /api/user/:id` - Deletar usuário (auth)

#### Worker (Profissionais)
- `POST /api/worker` - Criar profissional (público)
- `GET /api/worker` - Listar profissionais (auth)
- `GET /api/worker/:id` - Buscar profissional (auth)
- `PATCH /api/worker/:id` - Atualizar profissional (auth)
- `DELETE /api/worker/:id` - Deletar profissional (auth)

#### Offering (Serviços)
- `POST /api/offering` - Criar serviço (auth)
- `GET /api/offering` - Listar serviços (auth)
- `GET /api/offering/:id` - Buscar serviço (auth)
- `PATCH /api/offering/:id` - Atualizar serviço (auth)
- `DELETE /api/offering/:id` - Deletar serviço (auth)

#### Schedule (Agendas)
- `POST /api/schedule` - Criar agenda (auth)
- `GET /api/schedule` - Listar agendas (auth)
- `GET /api/schedule/:id` - Buscar agenda (auth)
- `PATCH /api/schedule/:id` - Atualizar agenda (auth)
- `DELETE /api/schedule/:id` - Deletar agenda (auth)

#### Appointment (Agendamentos)
- `POST /api/appointment` - Criar agendamento (auth)
- `GET /api/appointment` - Listar agendamentos (auth)
- `GET /api/appointment/:id` - Buscar agendamento (auth)
- `PATCH /api/appointment/:id` - Atualizar agendamento (auth)
- `DELETE /api/appointment/:id` - Deletar agendamento (auth)

#### UnavailablePeriod (Períodos Indisponíveis)
- `POST /api/unavailable-period` - Criar período (auth)
- `GET /api/unavailable-period` - Listar períodos (auth)
- `GET /api/unavailable-period/:id` - Buscar período (auth)
- `PATCH /api/unavailable-period/:id` - Atualizar período (auth)
- `DELETE /api/unavailable-period/:id` - Deletar período (auth)

### Exemplos de uso

#### 1. Criar um profissional

```bash
curl -X POST http://localhost:3000/api/worker \
  -H "Content-Type: application/json" \
  -d '{
    "name": "João Silva",
    "email": "joao@worker.com",
    "password": "senha123"
  }'
```

#### 2. Fazer login

```bash
curl -X POST http://localhost:3000/api/auth \
  -H "Content-Type: application/json" \
  -d '{
    "email": "joao@worker.com",
    "password": "senha123"
  }'
```

#### 3. Criar um cliente

```bash
curl -X POST http://localhost:3000/api/user \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Maria Silva",
    "email": "maria@email.com",
    "phone": "+5511999999999"
  }'
```

#### 4. Listar usuários (com autenticação)

```bash
curl -X GET http://localhost:3000/api/user \
  -H "Authorization: Bearer SEU_TOKEN_AQUI"
```

## 🗄️ Estrutura do Banco de Dados

### Tabelas

- **user** - Clientes do sistema
- **worker** - Profissionais/trabalhadores
- **schedule** - Agendas dos profissionais
- **offering** - Serviços oferecidos
- **appointment** - Agendamentos realizados
- **unavailable_period** - Períodos indisponíveis dos profissionais

## 🔐 Segurança

- Senhas são hasheadas com bcrypt (10 salt rounds)
- JWT com expiração de 1 hora
- Validação de inputs com class-validator
- Guards protegem rotas sensíveis

## 🛠️ Scripts disponíveis

```bash
# Desenvolvimento
npm run start:dev

# Build
npm run build

# Produção
npm run start:prod

# Database
npm run db:generate    # Gerar migrations
npm run db:push        # Aplicar migrations
npm run db:studio      # Abrir Drizzle Studio
npm run db:migrate     # Executar migrations manualmente

# Testes
npm run test
npm run test:watch
npm run test:cov
npm run test:e2e

# Lint e formato
npm run lint
npm run format
```

## 📦 Estrutura do Projeto

```
appointment-system-api/
├── src/
│   ├── common/
│   │   ├── helpers/
│   │   │   └── database-error-handler.ts
│   │   └── interface/
│   │       └── api-response.interface.ts
│   ├── database/
│   │   ├── schemas/
│   │   │   ├── user.schema.ts
│   │   │   ├── worker.schema.ts
│   │   │   ├── schedule.schema.ts
│   │   │   ├── offering.schema.ts
│   │   │   ├── appointment.schema.ts
│   │   │   ├── unavailable-period.schema.ts
│   │   │   ├── relations.ts
│   │   │   └── index.ts
│   │   ├── migrations/
│   │   ├── database.module.ts
│   │   └── migrate.ts
│   ├── modules/
│   │   ├── auth/
│   │   ├── user/
│   │   ├── worker/
│   │   ├── offering/
│   │   ├── schedule/
│   │   ├── appointment/
│   │   └── unavailable-period/
│   ├── app.module.ts
│   └── main.ts
├── docker-compose.yml
├── drizzle.config.ts
├── package.json
└── tsconfig.json
```

## 🐛 Solução de Problemas

### Erro de conexão MySQL

Se encontrar erro `ER_NOT_SUPPORTED_AUTH_MODE`:

```bash
docker exec -it mysql-appointment-dev mysql -u root -p
# Digite a senha: root

ALTER USER 'appointment'@'%' IDENTIFIED WITH mysql_native_password BY 'appoint123';
FLUSH PRIVILEGES;
```

### Migrations não aplicando

```bash
# Deletar pasta de migrations
rm -rf src/database/migrations

# Recriar
npm run db:generate
npm run db:push
```

## 📝 Licença

MIT

## 👨‍💻 Autor

Sistema de Agendamentos - 2026
