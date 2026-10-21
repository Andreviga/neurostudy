# NeuroStudy — Guia para o Claude Code

Tutor IA adaptativo pessoal do Andre: importa os PDFs da faculdade (FIAP), extrai tópicos com IA, correlaciona pré-requisitos, e ensina com aulas guiadas, quizzes, flashcards, chat tutor e revisão espaçada.

**Stack**: Next.js 14 (apps/web, porta 3000) · Express + Prisma (apps/api, porta 3001) · PostgreSQL 16 no Docker (porta 5433) · Gemini (gratuito, tarefas rotineiras) + Claude (`ANTHROPIC_MODEL`, tutoria e resumos profundos).

## Setup numa máquina nova (roteiro completo)

Pré-requisitos: Node ≥ 20, Docker Desktop, e o OneDrive sincronizado (pastas `D:\OneDrive\FIAP\MATERIAL` e `D:\OneDrive\FIAP\NeuroStudy-Sync`). Ajuste os caminhos se o OneDrive estiver em outro lugar.

1. **Instalar dependências** (na raiz do repositório): `npm install`

2. **Banco de dados** (container dedicado na porta 5433 para não conflitar com um Postgres nativo):
   ```
   docker run -d --name neurostudy-db --restart unless-stopped -e POSTGRES_PASSWORD=neurostudy -e POSTGRES_DB=neurostudy -p 5433:5432 -v neurostudy_pgdata:/var/lib/postgresql/data postgres:16
   ```

3. **Restaurar os dados do OneDrive** (tópicos, correlações, aulas prontas, progresso):
   ```
   powershell -File scripts/restore-db.ps1
   ```
   Sem o dump (começar do zero): `npx prisma migrate deploy` em apps/api, depois os scripts do ciclo de atualização abaixo.

4. **Arquivos .env** (nunca commitados — **peça as chaves ao Andre no chat**):
   - `apps/api/.env`: copie de `apps/api/.env.example` e preencha:
     - `DATABASE_URL="postgresql://postgres:neurostudy@localhost:5433/neurostudy"`
     - `JWT_SECRET` — gere uma string aleatória longa
     - `GEMINI_API_KEY` (pedir ao Andre) · `GEMINI_MODEL="gemini-3.5-flash-lite"`
     - `ANTHROPIC_API_KEY` (pedir ao Andre) · `ANTHROPIC_MODEL="claude-fable-5"`
     - `DEFAULT_AI_PROVIDER="gemini"`
   - `apps/web/.env.local`: `NEXT_PUBLIC_API_URL=http://localhost:3001`

5. **Rodar**:
   - API: `cd apps/api` e rode com a env `PORT=3001` explícita (`$env:PORT="3001"; npm run dev`). **Armadilha**: o launcher de preview do Claude injeta `PORT=3000` e o dotenv NÃO sobrescreve env já definida — a API roubaria a porta do frontend. Nunca suba a API pelo `npm run dev` da raiz dentro do preview.
   - Web: config `neurostudy-web` do `.claude/launch.json` (só o frontend, porta 3000).
   - Login: `andrevigarani@gmail.com` (o Andre sabe a senha).

## Sincronização entre máquinas (use UMA máquina por vez)

O banco é local; o OneDrive carrega o dump entre as máquinas:
- **Antes de trocar de máquina**: `powershell -File scripts/backup-db.ps1` (dump → OneDrive)
- **Na outra máquina**: `powershell -File scripts/restore-db.ps1` (OneDrive → banco local, substitui tudo)

## Ciclo de atualização ("atualiza o NeuroStudy")

Quando houver PDFs novos em `D:\OneDrive\FIAP\MATERIAL`, rode em `apps/api` (todos são retomáveis e pulam o que já existe):
```
npx ts-node-dev --transpile-only --quiet src/scripts/bulk-import.ts
npx ts-node-dev --transpile-only --quiet src/scripts/build-correlations.ts
npx ts-node-dev --transpile-only --quiet src/scripts/prepare-lessons.ts 15
```
1. importa PDFs novos (disciplina por prefixo do nome do arquivo) · 2. mapeia pré-requisitos com IA · 3. pré-gera as próximas 15 aulas da trilha no cache. Tudo roda no Gemini gratuito (os créditos do Claude ficam para a tutoria ao vivo).

## Particularidades que custaram caro a descobrir

- **Cotas gratuitas do Gemini são POR MODELO** (`gemini-3.6-flash` = só 20 req/dia). O serviço (`apps/api/src/services/ai/gemini.ts`) e os scripts rotacionam entre vários modelos `flash-lite` automaticamente. Erros 503 "high demand" são transitórios.
- **Claude**: tutoria (chat), resumos médios/detalhados e mapas mentais vão para o Claude quando `ANTHROPIC_API_KEY` existe; se os créditos acabarem, tudo degrada sozinho para o Gemini. O plano Max do Andre renova US$200/mês de API, sem recarga automática.
- **Cache de conteúdo** é gravado como StudySession com `cachedContent` preenchido — toda consulta de progresso/trilha/estatística deve filtrar `cachedContent: null`.
- **Texto de PDF pode ter bytes nulos (0x00)** — `truncateExtractedText` já sanitiza; não remova.
- Upload via HTTP tem rate limit de 10/hora — importação em massa é sempre pelo script, nunca pela API.
- O seed (`src/seed.ts`) cria dados de demonstração falsos — **não rodar** no banco real do Andre.
