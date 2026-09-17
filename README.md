# Proa

PWA de passadiço da [TugLife Systems](https://github.com/Jbvix) para smartphone e tablet.

Captura movimento e posição do rebocador, atualiza características de onda a cada hora, consulta meteorologia marinha (Open-Meteo) e recomenda a faixa de RPM de viagem.

## O que o app faz

- **GPX** — importe a rota ou use o exemplo Mucuripe → Pecém
- **RPM atual** — informe o regime do motor
- **Sensores** — heave do casco (DeviceMotion) e GPS; no desktop há simulação a 9,2 kn
- **Ondas** — Hs (4σ do heave), amplitude e período por cruzamento de zero, fundidos com a série horária da API
- **RPM ideal** — banda de viagem a partir de Hs, período, vento e mar de proa, no perfil do motor (450 / 980 / 1600)

## Uso a bordo

1. Abra o app no telefone ou tablet (adicione à tela inicial)
2. Importe o GPX da derrota e informe o RPM atual
3. Permita sensores e localização para captura ao vivo
4. Acompanhe o **Painel**, **Ondas**, **Rota** e **RPM**

Dados ficam só neste aparelho (sem conta, sem nuvem).

## Stack

TanStack Start (React 19), Vite, Tailwind v4, PWA. API meteorológica via `/api/meteo` (Open-Meteo, com fallback sintético).

## Deploy (Netlify)

Build: `npm run build` · publicação: `dist` · Node 22.

`VITE_AUTH_ENABLED=false` — o app não usa login nem banco.
