## Sistema de Agendamentos (Backend)

Este repositório contém o **backend** de um sistema de agendamento onde o **WhatsApp é a interface principal do cliente** e o backend é o “cérebro” que orquestra integrações (principalmente Google Calendar) e, futuramente, uma agenda própria.

O produto vai evoluir por **módulos/fases**: começa simples (MVP) e evolui para uma plataforma completa.

### Visão do produto (em módulos)

#### Módulo 1 (Fase 1) — MVP: WhatsApp + Google Calendar

**Objetivo**: validar o produto rápido sem construir uma agenda do zero.

**Como funciona (alto nível)**:

- Cliente (WhatsApp) → Bot → Backend → Google Calendar do profissional

**Fluxo**:

- Cliente envia mensagem: “Quero marcar um horário amanhã”
- Bot interpreta intenção e coleta dados (data, período, serviço, etc.)
- Backend consulta o Google Calendar do profissional
- Backend identifica horários disponíveis e devolve opções
- Cliente escolhe um horário
- Backend cria/atualiza/cancela evento no Google Calendar
- Bot confirma pelo WhatsApp

**Para o profissional**:

- Conecta a conta Google ao sistema
- Continua usando o Google Calendar normalmente no celular

**Permissões do Google Calendar (Módulo 1)**:

- Ler eventos
- Criar eventos
- Atualizar eventos
- Excluir eventos

**Limitações esperadas do Módulo 1 (que o Módulo 2 resolve)**:

- Regras avançadas de horários (expediente, folgas, intervalos)
- Lembretes/reagendamentos com automações robustas
- Relatórios e gestão completa de clientes/agenda no sistema
- Gestão do negócio

#### Módulo 2 (Fase 2) — Agenda própria + Aplicativo

**Objetivo**: evoluir para um sistema de gestão completo, removendo dependência do Google Calendar.

**Como funciona (alto nível)**:

- Cliente (WhatsApp) → Bot → Backend → Agenda do sistema (MySQL)
- (Opcional) Aplicativo para o negócio operar e acompanhar tudo

**Recursos que entram aqui**:

- Horários de funcionamento, exceções e bloqueios manuais
- Cancelamentos e reagendamentos
- Lembretes automáticos (WhatsApp/e-mail)
- Relatórios, controle de clientes e histórico
- Suporte real a múltiplos profissionais

### Papel do WhatsApp

O WhatsApp no produto não é só notificação; ele é:

- Interface de agendamento do cliente
- Canal de confirmação
- Canal de cancelamento/reagendamento
- Canal de lembretes

**Parte técnica (visão geral)**:

- Usuário manda mensagem → Meta chama seu webhook → backend processa → backend responde via API da Meta → mensagem chega no WhatsApp do usuário

> Observação: este repositório é do backend. A integração WhatsApp (webhook + envio) entra como parte do produto, mas pode estar em desenvolvimento dependendo do estágio do projeto.

### Stack do backend (atual)

- **Framework**: NestJS 10
- **ORM**: DrizzleORM
- **Banco de dados**: MySQL 8.0 (Docker)
- **Linguagem**: TypeScript
- **Validação**: class-validator + class-transformer
- **Autenticação**: JWT (@nestjs/jwt)
- **Criptografia**: bcrypt
- **Integração**: Google Calendar (OAuth2)

### Objetivo final (em uma frase)

Um sistema onde o cliente agenda pelo WhatsApp, o backend gerencia a lógica, e o produto evolui de integração com Google Calendar para uma plataforma própria de gestão.
