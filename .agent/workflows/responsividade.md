# Testes de responsividade — Átrio

Breakpoints Tailwind usados no projeto:
- **max-sm:** < 640px (mobile)
- **max-md:** < 768px (mobile/tablet)
- **max-lg:** < 1024px (tablet)
- **max-xl:** < 1280px (desktop pequeno)

## Viewports de teste

| Nome        | Largura | Uso                    |
|------------|---------|------------------------|
| Mobile S   | 375px   | iPhone SE, Android pequeno |
| Mobile M   | 390px   | iPhone 14, Android     |
| Tablet     | 768px   | iPad portrait          |
| Desktop S  | 1024px  | Laptop                 |
| Desktop    | 1280px  | Monitor                |
| Desktop L  | 1920px  | Full HD                |

## Páginas e pontos de verificação

### Login
- [ ] Formulário centralizado e legível em 375px
- [ ] Botões com área de toque adequada (min 44px)
- [ ] Sem overflow horizontal

### Dashboard (após login)
- [ ] Sidebar: em max-md vira drawer (oculta por padrão, abre por botão)
- [ ] Header com filtros: empilhamento em mobile, legível
- [ ] Banner e cards: grid 1 coluna em max-sm, 2 em max-lg
- [ ] Gráficos: sem overflow, legenda legível
- [ ] Legenda “Por canal”: wrap em max-sm, clicável

### Agente (Optimus)
- [ ] Header com ícone e status visíveis em 375px
- [ ] Área de mensagens e input sem overflow
- [ ] Gráficos inline (Chart.js) responsivos

### Configurações
- [ ] Seções empilhadas, formulários utilizáveis em mobile
- [ ] Upload de foto e botões acessíveis

### Admin
- [ ] Tabelas com scroll horizontal se necessário ou cards em mobile

## Checklist rápido por viewport

1. **375px (mobile):** sidebar drawer, 1 coluna, sem scroll horizontal
2. **768px (tablet):** grids 2 colunas onde aplicável, sidebar ainda drawer
3. **1280px (desktop):** layout completo, sidebar fixa, múltiplas colunas

## Como testar

- DevTools (F12) → Toggle device toolbar (Ctrl+Shift+M) → escolher dispositivo ou tamanho custom.
- Ou redimensionar a janela do navegador.

## Resultados (amostra)

- **Login:** Layout em coluna &lt;768px (painel azul em cima, formulário embaixo); duas colunas ≥768px. Ajustes aplicados: padding e título menores em mobile (px-6, text-2xl) para melhor uso em 375px.
- **Dashboard:** Sidebar vira drawer em max-md; conteúdo usa grid responsivo (1 col max-sm, 2 max-lg, etc.).
- **Gráficos:** Legenda "Por canal" com flex-wrap em max-sm; sem overflow horizontal.

## Melhorias aplicadas

- **Login:** padding responsivo (px-6/pt-10 no mobile, px-12/pt-16 no md+), título Entrar menor no mobile (text-2xl), min-height do card em auto no mobile.
- **Dashboard / Header:**
  - Título e subtítulo com truncate e tamanho menor no mobile (text-xl / text-[12px]).
  - Filtros (período e status) no desktop ficam à direita do título; no mobile/tablet (md:hidden) vão para uma segunda linha com flex-wrap, evitando aperto.
  - Margem inferior do header reduzida no mobile (mb-6 max-sm:gap-3).
- **Dashboard página:** `min-w-0 overflow-x-hidden` no container para evitar overflow horizontal.
- **Global:** `overflow-x: hidden` no `body` (index.css).
