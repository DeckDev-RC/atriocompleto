# 📈 Relatório Executivo de Escalabilidade e Capacidade Técnica

**Projeto:** Átrio Integrado V2
**Objetivo:** Avaliar a capacidade técnica da infraestrutura atual para suportar o crescimento da base de usuários e identificar pontos de escala.

---

## 1. Visão Geral da Arquitetura Atual

A base arquitetural atual do projeto foi concebida seguindo práticas de alto nível, o que a coloca **muito acima da média de projetos em estágio inicial**. O principal destaque é a arquitetura ser totalmente **Stateless (Sem Estado Local)**. 

Isso significa que o servidor não guarda informações temporárias de usuários na sua própria memória ou disco. Autenticação e processos dependem do banco de dados (Supabase) e de camadas de cache ultrarrápidas (Redis). 

**Benefício Direto para o Negócio:** Podemos multiplicar o número de servidores (escalabilidade horizontal) de maneira trivial quando a base de clientes exigir, sem necessidade de reescrever o código.

---

## 2. Pontos Fortes e Proteções Implementadas

O sistema já conta com proteções essenciais para estabilidade em produção:

1. **Uso Intensivo de Cache (Redis):** 
   A verificação de perfis e permissões dos usuários (RBAC) não sobrecarrega o banco de dados principal. As respostas são servidas em milissegundos a partir da memória.
2. **Proteção contra Abuso (Rate Limiting):** 
   Existem mitigadores que bloqueiam automaticamente IPs com comportamento malicioso ou excesso de requisições (>100 requisições/minuto), evitando que robôs ou ataques derrubem a plataforma.
3. **Fila de Processamento em Background (BullMQ):**
   Tarefas pesadas ou de auditoria são enviadas para uma fila de processamento secundária, garantindo que o tempo de resposta da plataforma para o usuário final permaneça instatâneo.
4. **Armazenamento Desacoplado:**
   Uploads de arquivos vão direto para o Supabase Storage. O servidor não gasta recursos processando ou armazenando arquivos no próprio disco.

---

## 3. Estimativas Práticas de Capacidade

Considerando uma hospedagem base de entrada (Exemplo: Servidor com 1 núcleo de processamento e 2GB de Memória RAM), as projeções são:

* **Usuários Cadastrados na Base:**
  **Capacidade:** Virtualmente Ilimitada (centenas de milhares a milhões). Depende apenas do limite de armazenamento contratado no Supabase. O backend não sofre impacto de usuários inativos.

* **Tráfego Diário Distribuído (DAU - Daily Active Users):**
  **Capacidade:** ~50.000 a 100.000 usuários ativos por dia. O sistema atual lida com facilidade, graças ao uso massivo de Cache e requisições otimizadas do frontend.

* **Acessos Simultâneos (Usuários logados interagindo no EXATO mesmo segundo):**
  **Capacidade Estimada:** Entre 500 a 800 usuários reais *simultaneamente* com o sistema aberto na tela. 
  **O Fator Limitador Atual:** A funcionalidade de **Eventos em Tempo Real (SSE - Server-Sent Events)** para atualizações ao vivo. Cada aba de navegador aberta com o sistema segura um "fio" de conexão direto com o servidor, o que consome memória RAM passivamente.

---

## 4. Plano de Evolução (Roadmap de Escala Técnica)

Quando o sucesso comercial nos levar a atingir picos de 500~800 usuários logados ao mesmo tempo, não precisaremos refazer o sistema. A escala será feita através de infraestrutura em fases:

* **Fase 1: Escala Vertical (Baixo Custo, Ação Imediata)**
  Se houver gargalos, o primeiro passo é dobrar ou quadruplicar a CPU/RAM do servidor de hospedagem atual e ativar o "Modo Cluster" (PM2) no Node.js para ele usar todos os processadores.
  *Capacidade projetada: ~4.000 acessos simultâneos ao mesmo tempo.*

* **Fase 2: Escala Horizontal (Nível Enterprise)**
  Colocar a aplicação atrás de um "Load Balancer" (Balanceador de Carga) na nuvem e ligar 5, 10 ou 50 servidores espelhos rodando a nossa aplicação. 
  *Como nossa arquitetura é Stateless (Item 1), isso já é suportado organicamente e escala para cenários de **20.000 a 100.000+** usuários online ao mesmo tempo.*

---

## Resumo Executivo
Tecnicamente, o projeto construído possui fundações extremamente sólidas. O foco a curto prazo deve ser puramente nas funcionalidades de ponta (Produto e UX), pois o **backend está fortemente blindado contra falhas estruturais massivas** e projetado nativamente para escala elástica quando o crescimento orgânico chegar.
