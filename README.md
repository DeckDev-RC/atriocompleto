# Átrio — Plataforma de Inteligência E-Commerce

Monorepo com frontend React + backend Express (Agente IA Ambro integrado).

## Estrutura

```
atrio-integrado/
├── frontend/                   # React + Vite + Tailwind 4
│   ├── src/
│   │   ├── App.tsx             # Rotas: / (Dashboard), /agente (Ambro)
│   │   ├── index.css           # Tailwind 4 + tokens de tema + estilos do agente
│   │   ├── main.tsx
│   │   ├── components/
│   │   │   ├── Agent/          # Componentes do Agente IA Ambro
│   │   │   ├── Banner/         # Banner do dashboard
│   │   │   ├── Charts/         # Gráficos Recharts do dashboard
│   │   │   ├── Header/         # Header do dashboard
│   │   │   ├── Sidebar/        # Sidebar principal
│   │   │   ├── Skeleton/       # Loading skeletons
│   │   │   └── DashboardLayout.tsx
│   │   ├── contexts/
│   │   │   └── AppContext.tsx   # Theme (light/dark), sidebar state
│   │   ├── data/
│   │   │   └── mockData.ts     # Dados mock do dashboard
│   │   ├── pages/
│   │   │   ├── AgentPage.tsx   # Página do Agente IA
│   │   │   └── DashboardPage.tsx
│   │   └── services/
│   │       └── agentApi.ts     # Client HTTP para o backend
│   ├── index.html
│   ├── vite.config.ts
│   ├── package.json
│   └── .env.example
├── backend/                    # Express + TypeScript
│   ├── src/
│   │   ├── server.ts           # Entry point
│   │   ├── config/             # Env validation (Zod)
│   │   ├── middleware/         # Error handler
│   │   ├── routes/             # Chat, Health
│   │   ├── services/           # Agent, Conversation, Query Functions
│   │   ├── types/              # TypeScript types
│   │   └── utils/              # SQL sanitizer
│   ├── package.json
│   └── .env.example
├── supabase/                   # Migrations
├── .agent/                     # Agent workflows
└── package.json                # Scripts de orquestração
```

## Configuração

### 1. Instalar dependências

```bash
npm run install:all
```

### 2. Variáveis de ambiente

**Frontend** — crie `frontend/.env`:

```env
VITE_AGENT_API_URL=http://localhost:3001
```

**Backend** — crie `backend/.env` (veja `backend/.env.example`):

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:5173
```

### 3. Rodar em desenvolvimento

```bash
# Ambos ao mesmo tempo
npm run dev

# Ou separadamente
npm run dev:frontend   # http://localhost:5173
npm run dev:backend    # http://localhost:3001
```

## Funcionalidades do Agente

- Chat com Gemini API (Function Calling + Text-to-SQL)
- Histórico de conversas (sidebar com busca)
- Voice input (Web Speech API) com visualização de áudio
- Gráficos Chart.js inline nas respostas
- Markdown completo (tabelas, code blocks, headers)
- Sugestões de perguntas contextuais
- Health check do negócio
- Token usage tracking
- Tema light/dark
- Responsivo (mobile, tablet, desktop)

## Paleta de cores

| Token       | Hex       | Uso                    |
|-------------|-----------|------------------------|
| accent      | `#38b6ff` | Primário, CTAs, links  |
| accent-deep | `#3a81aa` | Gradientes, hover      |
| accent-muted| `#3e5d6f` | Backgrounds sutis      |
| body (dark) | `#0a0b0f` | Fundo principal dark   |
| card (dark) | `#111318` | Cards dark             |
| primary     | `#181818` | Texto principal light  |
| secondary   | `#363636` | Texto secundário       |
| muted       | `#a6a6a6` | Texto terciário        |
| border      | `#e2e2e2` | Bordas light           |
