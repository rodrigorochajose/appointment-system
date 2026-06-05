# Deploy (grátis) — TiDB Cloud + Render

Stack: **NestJS + DrizzleORM + MySQL**. Esta configuração usa banco
**TiDB Cloud Serverless** (MySQL-compatível, não dorme) e backend no **Render**
(Docker, plano free).

> ⚠️ O plano free do Render **hiberna após ~15 min** sem tráfego. A primeira
> mensagem do WhatsApp depois de hibernar pode demorar ~30–50s (cold start). O
> WhatsApp reenviar webhooks, então nada se perde — mas para produção real
> considere um plano pago barato ou um ping periódico para manter acordado.

---

## 1. Criar o banco (TiDB Cloud Serverless)

1. Crie conta em https://tidbcloud.com (login com Google, sem cartão).
2. **Create Cluster → Serverless** → escolha uma região (ex.: `us-east-1`).
3. Em **Connect**:
   - Crie/anote o usuário e senha.
   - Copie os dados de conexão. Monte a `DATABASE_URL`:
     ```
     mysql://<USUARIO>:<SENHA>@<HOST>:4000/<DATABASE>
     ```
     Ex.: `mysql://xxxx.root:minhasenha@gateway01.us-east-1.prod.aws.tidbcloud.com:4000/appointmentdb`
4. Crie o database `appointmentdb` no SQL Editor do painel:
   ```sql
   CREATE DATABASE appointmentdb;
   ```
   > As **tabelas** são criadas automaticamente pelas migrations no deploy.

---

## 2. Subir o backend (Render)

1. Faça push do projeto para um repositório no GitHub.
2. Em https://render.com → **New → Blueprint** e aponte para o repositório
   (o Render lê o `render.yaml` automaticamente). Ou **New → Web Service** e
   selecione runtime **Docker**.
3. Configure as variáveis de ambiente (Environment):

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | a connection string do TiDB (passo 1) |
   | `DB_SSL` | `true` |
   | `SECRET_KEY` | uma chave forte e aleatória para o JWT |
   | `GOOGLE_CLIENT_ID` | do Google Cloud Console |
   | `GOOGLE_CLIENT_SECRET` | do Google Cloud Console |
   | `GOOGLE_REDIRECT_URI` | `https://SEU-APP.onrender.com/api/...` |
   | `WPP_VERIFY_TOKEN` | token que você define no webhook do Meta |
   | `WPP_TOKEN` | token de acesso da API do WhatsApp |

   > `PORT` e `NODE_ENV` já são tratados (Render define `PORT` sozinho).

4. Deploy. No primeiro start o container roda as migrations e sobe a API em:
   ```
   https://SEU-APP.onrender.com/api
   ```

---

## 3. Apontar o webhook do WhatsApp

No painel do Meta (WhatsApp Cloud API), configure o webhook:

- **Callback URL:** `https://SEU-APP.onrender.com/api/<rota-do-webhook>`
- **Verify token:** o mesmo valor de `WPP_VERIFY_TOKEN`

---

## Como funciona localmente vs. produção

- **Local:** use o `docker-compose.yml` (MySQL) + variáveis `DB_HOST/DB_PORT/...`
  do `.env`. Rode migrations com `npm run db:migrate`.
- **Produção:** defina `DATABASE_URL` + `DB_SSL=true`. Quando `DATABASE_URL`
  existe, ela tem prioridade sobre as variáveis discretas
  (ver `src/database/db-credentials.ts`).

## Rodar a imagem Docker localmente (opcional)

```bash
docker build -t appointment-api .
docker run -p 3000:3000 --env-file .env appointment-api
```
