# 📄 Relatório Técnico: Stack Tecnológica (Átrio V2)

Este documento resume a infraestrutura e as escolhas tecnológicas do projeto **Átrio — Plataforma de Inteligência E-Commerce**.

## 🏗️ Arquitetura de Alto Nível
- **Estrutura:** Monorepo (Frontend & Backend).
- **Linguagem Base:** TypeScript (Strict Mode).
- **Runtime:** Node.js >= 22.0.0.

## 🖥️ Frontend (Client-side)
A interface foi construída com foco em performance e modernidade:
- **Core:** React 19 + Vite.
- **Styling:** Tailwind CSS v4 (Configuração baseada em CSS-first).
- **State & Routing:** Context API e React Router Dom v7.
- **Data Vis:** Recharts e Chart.js para analytics dinâmicos.
- **UI/UX:** Lucide React para iconografia e React-Markdown para renderização de respostas da IA.

## ⚙️ Backend (Server-side)
API REST robusta com camadas de segurança e escalabilidade:
- **Engine:** Express.js.
- **Task Queue:** BullMQ + ioredis (Processamento assíncrono e background jobs).
- **Cache & Rate Limit:** Redis (ioredis) integrado com `express-rate-limit` para proteção de endpoints críticos.
- **Segurança:** Helmet.js, CORS configurável, e compressão Gzip.
- **Validation:** Zod para tipagem estritamente segura de payloads (Runtime validation).

## 🛡️ Autenticação e Segurança
- **Provider:** Supabase Auth (JWT).
- **MFA:** Implementação nativa de TOTP (Time-based One-Time Password) com `speakeasy`.
- **RBAC/Integridade:** Row Level Security (RLS) no banco de dados e controle de permissões granular via JSONB nos perfis.

## 💾 Camada de Dados
- **Database:** PostgreSQL via Supabase.
- **Storage:** Supabase Storage para assets e uploads.
- **Schema Management:** Migrações versionadas em SQL (diretório `/supabase`).

## 🤖 Inteligência Artificial
- **Engine:** Google Generative AI (`@google/genai`).
- **Model:** Gemini-pro / Gemini-flash.

---
*Gerado automaticamente para revisão técnica.*
