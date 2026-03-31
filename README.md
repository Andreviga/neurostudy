# NeuroStudy — Tutor IA Adaptativo

Aplicativo de aprendizagem adaptativa com IA para estudantes universitários.
Upload de materiais → extração de tópicos → resumos, quizzes e flashcards gerados por IA → trilha de revisão espaçada.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | Next.js 14 · TypeScript · Tailwind · Framer Motion |
| Backend | Node.js · Express · TypeScript · Prisma |
| Banco | PostgreSQL |
| IA | OpenAI API · Anthropic API · Gemini API |
| Arquivos | Local (padrão) ou AWS S3 |
| Auth | JWT |

---

## Pré-requisitos

- Node.js ≥ 20
- PostgreSQL ≥ 14
- npm ≥ 9 (workspaces)
- Pelo menos **uma** chave de API de IA (OpenAI, Anthropic ou Gemini)

---

## Troubleshooting de Deploy (Render)

Se a tela **Choose Commit to Deploy** no Render só mostrar commits antigos (ex.: `6a1fab2`), isso significa que o Render está lendo apenas o que já foi **enviado ao GitHub remoto**.

Checklist rápido:
- Faça `git push` da branch que contém os commits novos.
- No Render, confirme que o serviço está apontando para a mesma branch.
- Clique em **Manual Deploy > Deploy latest commit** depois do push.
- Se usar Blueprint (`render.yaml`), faça **Sync Blueprint** para aplicar mudanças de serviço/env.

> Sem push para o remoto, o Render não consegue listar commits locais.

## Configuração rápida

### 1. Clone e instale dependências

```bash
git clone <url>
cd neurostudy
npm install
```

### 2. Configure o backend

```bash
cd apps/api
cp .env.example .env
```

Edite `apps/api/.env`:

```env
DATABASE_URL="postgresql://seu_user:sua_senha@localhost:5432/neurostudy"
JWT_SECRET="alguma-string-longa-e-aleatoria"

# Preencha ao menos uma:
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY="sk-ant-..."
GEMINI_API_KEY="AIza..."

DEFAULT_AI_PROVIDER="openai"   # openai | anthropic | gemini
```

### 3. Configure o frontend

```bash
cd apps/web
cp .env.local.example .env.local
```

`apps/web/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### 4. Banco de dados

```bash
# Na raiz do projeto:
npm run db:migrate       # cria as tabelas
npm run db:seed          # popula com dados de demo
```

Ou, dentro de `apps/api`:
```bash
npx prisma migrate dev --name init
ts-node src/seed.ts
```

### 5. Rodar em desenvolvimento

```bash
# Na raiz — inicia api (porta 3001) e web (porta 3000) juntos:
npm run dev
```

Ou separadamente:
```bash
# Terminal 1
cd apps/api && npm run dev

# Terminal 2
cd apps/web && npm run dev
```

Acesse: **http://localhost:3000**

Login de demo: `demo@neurostudy.app` / `demo1234`

---

## Estrutura de pastas

```
neurostudy/
├── apps/
│   ├── api/                      # Backend Express
│   │   ├── prisma/
│   │   │   └── schema.prisma     # Schema do banco
│   │   └── src/
│   │       ├── index.ts          # Entrypoint
│   │       ├── lib/              # Prisma client, logger
│   │       ├── middleware/       # JWT auth
│   │       ├── routes/           # auth, subjects, materials, topics, sessions, reviews, profile
│   │       └── services/
│   │           ├── ai/           # Orquestrador + adaptadores OpenAI/Anthropic/Gemini
│   │           ├── pdf.ts        # Extração de texto
│   │           ├── storage.ts    # Local ou S3
│   │           └── learning-profile.ts  # Motor de personalização local
│   │
│   └── web/                      # Frontend Next.js
│       └── src/
│           ├── app/
│           │   ├── page.tsx               # Landing page
│           │   ├── (auth)/                # Login, Signup
│           │   └── (dashboard)/           # App autenticado
│           │       ├── dashboard/         # Página inicial
│           │       ├── subjects/          # Lista e detalhe de disciplinas
│           │       ├── upload/            # Upload de materiais
│           │       ├── study/[topicId]/   # Sessão de estudo (quiz, flashcard, resumo)
│           │       ├── reviews/           # Revisões agendadas
│           │       └── progress/          # Painel de progresso
│           ├── lib/               # api.ts, auth.ts, utils.ts
│           └── types/             # Tipos TypeScript compartilhados
└── package.json                   # Monorepo root (npm workspaces)
```

---

## API Endpoints

### Auth
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/auth/signup` | Criar conta |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Dados do usuário logado |

### Subjects
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/subjects` | Listar disciplinas |
| POST | `/api/subjects` | Criar disciplina |
| GET | `/api/subjects/:id` | Detalhe + materiais + tópicos |
| PATCH | `/api/subjects/:id` | Atualizar |
| DELETE | `/api/subjects/:id` | Remover |

### Materials
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/materials/upload` | Upload de arquivo (multipart) |
| POST | `/api/materials/text` | Enviar texto colado |
| GET | `/api/materials/:id` | Detalhe com tópicos |

### Topics
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/topics?subjectId=...` | Listar tópicos |
| GET | `/api/topics/:id` | Detalhe com quiz/flashcards |
| POST | `/api/topics/:id/generate` | Gerar conteúdo (resumo, quiz, etc.) |

### Sessions
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/sessions` | Registrar sessão de estudo |
| GET | `/api/sessions` | Histórico |
| GET | `/api/sessions/stats` | Estatísticas agregadas |

### Reviews
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/reviews/due` | Revisões pendentes para hoje |
| GET | `/api/reviews` | Todas as revisões |

### Profile
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/profile` | Perfil de aprendizagem |
| GET | `/api/profile/today` | Plano do dia |

---

## Roteamento de IA

O sistema escolhe o provedor automaticamente por tipo de tarefa:

| Tarefa | Provedor padrão | Motivo |
|--------|-----------------|--------|
| Resumo curto/médio | OpenAI | Velocidade e custo |
| Resumo detalhado / Mapa mental | Anthropic (Claude) | Contexto longo, organização |
| Quiz / Flashcard / Passo a passo | OpenAI | Geração estruturada |
| Multimodal (futuro) | Gemini | Visão + áudio + vídeo |

Se um provedor falhar, há fallback automático para o próximo disponível.

---

## Algoritmo de revisão espaçada

Implementação simplificada do SM-2:

- **Score ≥ 0.6**: intervalo aumenta com fator de ease (padrão 2.5)
- **Score < 0.6**: resetar para 1 dia
- Após cada sessão: `ease_factor` é ajustado com base na performance
- `next_review_date` calculado como `hoje + interval dias`

---

## Perfil de aprendizagem local

Após cada sessão, o sistema:
1. Atualiza a média móvel de retenção por formato de estudo
2. Re-ranqueia `preferred_formats` do mais ao menos eficaz
3. Detecta tópicos fracos (score médio < 50% nas últimas 3 sessões)
4. Atualiza sequência de dias estudados

O formato recomendado vem diretamente do `preferred_formats[0]` do perfil.

---

## Próximos passos (roadmap)

### Fase 2 — Adaptatividade avançada
- [ ] Diagnóstico inicial com mini-teste por disciplina
- [ ] Detecção automática de lacunas de pré-requisito
- [ ] Recomendação de revisão de base quando score < 40%

### Fase 3 — Multimodal
- [ ] Suporte a imagem (OCR + Gemini Vision)
- [ ] Transcrição de áudio (Whisper)
- [ ] Processamento de vídeo (extração de frames-chave)
- [ ] Embeddings locais com Chroma/FAISS para RAG

### Fase 4 — Engajamento
- [ ] Gamificação (XP, badges, ranking)
- [ ] Previsão de desistência com alerta proativo
- [ ] Modo "não desistir hoje" (sessão mínima de 5 min)
- [ ] App mobile (React Native / Expo)

---

## Variáveis de ambiente completas

### `apps/api/.env`
```env
DATABASE_URL=
JWT_SECRET=
JWT_EXPIRES_IN=7d
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
DEFAULT_AI_PROVIDER=openai
STORAGE_PROVIDER=local       # local | s3
LOCAL_UPLOAD_DIR=./uploads
AWS_BUCKET_NAME=
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
PORT=3001
WEB_URL=http://localhost:3000
```

### `apps/web/.env.local`
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```
