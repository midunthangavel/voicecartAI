---
kind: frontend_style
name: Neumorphic CSS Design System with Dark/Light Theme Tokens (Client) + Expo Mobile Color Tokens
category: frontend_style
scope:
    - '**'
source_files:
    - client/src/index.css
    - client/src/App.jsx
    - client/src/components/Sidebar.jsx
    - mobile/src/theme/colors.js
    - client/package.json
    - mobile/package.json
---

## What system/approach is used

The repository implements a **hand-authored CSS design system** for the web dashboard (`client/`) and a **JavaScript token file** for the mobile app (`mobile/`). There is no CSS-in-JS library, Tailwind, or component library — styling is done via plain CSS files and inline React styles.

- **Web client**: A single global stylesheet `client/src/index.css` defines a dual-theme (dark/light) design system built on CSS custom properties (CSS variables). The theme is toggled by setting `data-theme="light"` or `data-theme="dark"` on `<html>` and is persisted in `localStorage` under the key `voicecart_theme`. The default theme is dark.
- **Mobile app**: A small token module `mobile/src/theme/colors.js` exports `colors`, `spacing`, and `radius` objects that are imported into components and consumed as `style={{ color: colors.primary }}` etc. No separate CSS file exists for the mobile app; it uses React Native style objects.

## Key files and packages

- `client/src/index.css` — the entire visual design system: tokens, layout, neumorphic shadows, buttons, cards, tables, voice simulator UI, KDS order cards, catalog table, and responsive breakpoints.
- `client/src/App.jsx` — holds theme state, writes `data-theme` to `document.documentElement`, and persists the choice to `localStorage`.
- `client/src/components/Sidebar.jsx` — exposes the theme toggle button wired to `onToggleTheme`.
- `mobile/src/theme/colors.js` — centralized color palette, spacing scale, and border-radius tokens for the Expo app.
- `client/package.json` — confirms no CSS framework dependency; only `react`, `react-dom`, `lucide-react`, and Vite tooling.
- `mobile/package.json` — Expo/React Native runtime; no styling library beyond React Native primitives.

## Architecture and conventions

### CSS custom property tokens (design tokens)
All visual values are declared as CSS variables under `:root` / `[data-theme='dark']` and overridden under `[data-theme='light']`. Token categories include:

| Category | Variables |
|---|---|
| Surfaces | `--bg-primary`, `--bg-secondary`, `--bg-card`, `--bg-card-hover`, `--bg-elevated`, `--bg-input` |
| Neumorphic shadows | `--neu-shadow-flat`, `--neu-shadow-hover`, `--neu-shadow-inset`, `--neu-shadow-button`, `--neu-shadow-button-active` |
| Text | `--text-primary`, `--text-secondary`, `--text-muted` |
| Accents | `--accent-violet`, `--accent-cyan`, `--accent-emerald`, `--accent-amber`, `--accent-rose`, `--accent-blue` plus their `-dim` variants |
| Gradients | `--gradient-violet`, `--gradient-emerald`, `--gradient-amber`, `--gradient-hero` |
| Borders & radii | `--border-subtle`, `--border-active`, `--radius-sm/md/lg/full` |
| Typography | `--font-sans` (Inter), `--font-mono` (JetBrains Mono/Fira Code) |
| Layout | `--sidebar-width: 280px` |
| Background pattern | `--dot-color`, `--dot-size` for a dot-grid background |

### Theme switching mechanism
1. `App.jsx` maintains `theme` state initialized from `localStorage.getItem('voicecart_theme') || 'dark'`.
2. On mount and on change, `document.documentElement.setAttribute('data-theme', theme)` is called.
3. CSS selectors `[data-theme='dark']` and `[data-theme='light']` swap all variable values.
4. The Sidebar renders a `.theme-toggle-btn` that calls `toggleTheme`.

### Visual style identity
- **Neumorphism**: Every surface uses `box-shadow: var(--neu-shadow-flat)` (or hover/inset variants) to create soft extrusion rather than flat borders. Cards, sidebar items, buttons, stat icons, and transcript bubbles all follow this pattern.
- **Dark-first palette**: The default dark theme uses near-black surfaces (`#14161f`, `#191b26`, `#1d202d`) with violet/cyan/emerald accents. Light mode mirrors the same structure with light gray surfaces (`#e6e9ef`, `#eceff5`).
- **Dot-grid background**: `body` uses a radial-gradient dot pattern sized by `--dot-size`.
- **Consistent radius scale**: `--radius-sm: 8px`, `--radius-md: 14px`, `--radius-lg: 20px`, `--radius-full: 9999px`.
- **Accent-dim backgrounds**: Each accent has a matching `--accent-*:dim` rgba variant used for badge/icon backgrounds.

### Component-level styling conventions
- Reusable class names in `index.css`: `.card`, `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-sm`, `.stat-card`, `.stat-icon.{violet|emerald|cyan|amber|rose|blue}`, `.text-input`, `.empty-state`, `.orders-grid`, `.order-card`, `.catalog-table`, `.transcript-bubble`, `.call-button.{idle|active}`.
- Components compose these classes (e.g., `className="stat-card"`) and add semantic modifier classes (e.g., `.order-badge.confirmed|pending|cancelled`, `.cat-biryani|curry|bread|beverage`).
- Inline `style={{}}` props are used sparingly for one-off layout tweaks inside JSX (e.g., flex gaps, margins in `App.jsx`), but never for colors or typography — those go through CSS variables.

### Mobile styling conventions
- Colors are imported from `src/theme/colors.js` and applied directly as React Native style object values (e.g., `color: colors.primary`, `backgroundColor: colors.surface`).
- Shared tokens: `colors` (backgrounds, brand accents, status badges, dietary tags), `spacing` (4–24 px scale), `radius` (6–24 px + full).
- No CSS file; everything is JS-style objects consistent with React Native.

### Responsive strategy
- Single breakpoint in `index.css`: `@media (max-width: 1200px)` collapses the 6-column `.stats-grid` to 3 columns.
- The sidebar is fixed at `--sidebar-width: 280px`; main content margin accounts for it via `margin-left: calc(var(--sidebar-width) + 24px)`.
- Order cards use `grid-template-columns: repeat(auto-fill, minmax(320px, 1fr))` for fluid reflow.

## Conventions and constraints

- **No CSS frameworks**: The project deliberately avoids Tailwind, Bootstrap, Material UI, etc. All styling lives in `index.css` and component style objects.
- **Theme must be set via `data-theme` attribute**: The CSS selectors depend on `:root`/`[data-theme='dark']`/`[data-theme='light']`; adding a new theme requires defining both a selector block and updating `App.jsx` logic.
- **New colors must be added as CSS variables**: To keep consistency, any new color should be introduced as a `--accent-*` / `--bg-*` / `--text-*` variable under both dark and light blocks, not as hard-coded hex literals in components.
- **Neumorphic shadow tokens are mandatory for surfaces**: New card-like elements should use `--neu-shadow-flat` / `--neu-shadow-hover` / `--neu-shadow-inset` rather than ad-hoc `box-shadow` values.
- **Radius tokens preferred over raw numbers**: Use `var(--radius-sm/md/lg/full)` instead of arbitrary pixel values.
- **Mobile tokens are the single source of truth**: Mobile components should import from `src/theme/colors.js` rather than defining local color constants.
- **Fonts are locked to Inter + JetBrains Mono**: `--font-sans` and `--font-mono` are defined centrally; components should reference them via `font-family: var(--font-sans)` rather than specifying font stacks inline.