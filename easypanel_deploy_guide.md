# 🚀 Guia Prático: Deploy no Easypanel (atrio.agregarnegocios.com.br)

Fiz uma análise completa da infraestrutura do repositório (`Dockerfiles`, `nginx.conf`, `vite.config.ts`, `server.ts`) e o projeto já foi construído focado no deploy em containers! **Não é necessário alterar nenhuma linha de código para publicar no Easypanel.**

Siga este passo a passo para colocar o sistema no ar com o seu domínio.

---

## 🏗️ 1. Deploy da API (Backend)

No Easypanel, crie um novo **App (App Service)** para o Backend.

*   **Source:** Selecione o seu repositório Github (`DeckDev-RC/atriocompleto`).
*   **Build Method:** `Dockerfile`
*   **Root Directory:** `/backend`
*   **Port:** `3001` (O Easypanel vai mapear essa porta interna automaticamente para a web).

### 🔑 Variáveis de Ambiente (Environment) da API
Cole o bloco abaixo na aba "Environment" do projeto Backend no Easypanel.
*(Substitua os valores entre chaves `{}` pelas as suas chaves reais)*

```env
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://atrio.agregarnegocios.com.br
APP_BASE_URL=https://atrio.agregarnegocios.com.br

# Supabase
SUPABASE_URL={SUA_URL_DO_SUPABASE}
SUPABASE_SERVICE_ROLE_KEY={SUA_SERVICE_ROLE_KEY_DO_SUPABASE}

# Gemini
GEMINI_API_KEY={SUA_CHAVE_GEMINI}

# Redis (Se estiver usando um Redis hospedado no próprio Easypanel, use a URL interna dele)
REDIS_URL={SUA_URL_DO_REDIS}
REDIS_PASSWORD={SENHA_DO_REDIS_SE_HOUVER}

# Segurança (Gere uma hash aleatória forte para essa chave)
AUTH_SECURITY_SECRET={HASH_SECRETA_ALEATORIA_DE_32_CARACTERES}

# SMTP (Configuração de Envio de E-mails)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER={SEU_EMAIL_DE_DISPARO}
SMTP_PASS={SUA_SENHA_DE_APP_DO_GMAIL}
SMTP_FROM={SEU_EMAIL_DE_DISPARO}
ACCESS_REQUEST_NOTIFY_EMAIL={EMAIL_QUE_RECEBE_AVISOS_DE_NOVOS_USUARIOS}
```

---

## 🖥️ 2. Deploy do Frontend (Painel)

Crie um SEGUNDO **App (App Service)** no Easypanel para o Frontend.

*   **Source:** O mesmo repositório Github (`DeckDev-RC/atriocompleto`).
*   **Build Method:** `Dockerfile`
*   **Root Directory:** `/frontend`
*   **Port:** `80` *(O Dockerfile do frontend usa Nginx na porta 80 internamente)*

### 🌐 Domains (Domínio)
Na aba **Domains**, adicione o domínio principal do projeto:
*   `atrio.agregarnegocios.com.br`
*(Certifique-se de apontar o DNS tipo A (ou CNAME) desse subdomínio no seu painel de domínios para o IP do seu servidor Easypanel).*

### 🔑 Variáveis de Ambiente (Environment) do Frontend
Configure a URL pública para onde o frontend deve apontar os requests da API.

```env
# Aqui você usa a URL pública que o Easypanel gerou para o aplicativo de Backend criado no Passo 1.
# Ex: https://api.atrio.agregarnegocios.com.br
VITE_AGENT_API_URL=https://{URL_DO_SEU_BACKEND_NO_EASYPANEL} 
```

**⚠️ Atenção à Build ARG no Frontend:**
O `Dockerfile` do Frontend pede o `VITE_AGENT_API_URL` no momento do *Build*. 
No Easypanel, certifique-se de que a variável acima está na aba **Variáveis de Ambiente Fixas (Build Args / Environment)** antes de mandar o comando "Deploy", pois o React precisa injetar essa URL no Javascript final.

---

## ⚙️ 3. Verificações Finais

*   **Supabase:** Lembre-se de ir no painel do Supabase, em **Authentication -> URL Configuration** e adicionar `https://atrio.agregarnegocios.com.br` tanto em *Site URL* quanto em *Redirect URLs*.
*   **Cache:** Quando o backend subir, observe os Logs no Easypanel. Se ele disser `[Redis] Connected successfully`, o limite de taxa e o cache de autenticação estão ativados com sucesso!

Seu projeto já foi inteiramente pensado para esta arquitetura. O Nginx do Frontend (configurado no `nginx.conf`) lida nativamente com o roteamento React Router, e o backend usa o Tini no Node.js (`/sbin/tini`) para controlar o ciclo de vida da aplicação de maneira segura. Pode dar o deploy sem medo!
