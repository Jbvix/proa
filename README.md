# Proa

PWA de passadiço da [TugLife Systems](https://github.com/Jbvix) para smartphone e tablet.

Captura movimento e posição do rebocador, atualiza características de onda a cada hora, consulta meteorologia marinha (Open-Meteo) e recomenda a faixa de RPM de viagem.

## O que o app faz

- **GPX** — a derrota entra por arquivo (track, rota ou waypoints)
- **RPM atual** — informe o regime do motor
- **Sensores** — mar ao vivo no casco (heave → Hs, amplitude, período)
- **Open-Meteo** — vento e corrente na posição; previsão marinha em cada waypoint do GPX
- **RPM ideal** — banda de viagem a partir do mar do casco, vento e encontro com a onda
- **Iara** — voz no passadiço. Chama **Iara**; ela responde sem apertar o microfone

## Uso a bordo

1. Abra o Proa — a captura e o mapa começam sozinhos (GPS + sensores)
2. Importe o arquivo GPX da derrota na aba **Rota**
3. Informe o RPM atual
4. Acompanhe o **Painel**, **Ondas**, **Rota** e **RPM**
5. Chama **Iara** pelo nome. Ela cumprimenta e espera o próximo chamado. “Tchau” pra ela voltar a esperar. Segura o ícone pra desligar. No tablet Samsung, o primeiro toque na tela libera o microfone. Se a Iara ainda se escutar, atualize o PWA.

Dados ficam só neste aparelho (sem conta, sem nuvem).

## Stack

TanStack Start (React 19), Vite, Tailwind v4, PWA.

Meteorologia: function Netlify `/api/meteo` (Open-Meteo Forecast + Marine). Com `OPENMETEO_API_KEY` no painel do Netlify, usa o endpoint comercial (`customer-api` / `customer-marine-api`). Sem a chave, cai no endpoint público (desenvolvimento). A chave nunca vai ao navegador; o JSON só traz `plano: "comercial" | "gratuito"`.

## Deploy (Netlify)

Site: [tuglife-proa.netlify.app](https://tuglife-proa.netlify.app)

Build: `npm run build` · publicação: `dist` · Node 22.

Variáveis:

- `VITE_AUTH_ENABLED=false` — o app não usa login nem banco
- `OPENMETEO_API_KEY` — assinatura comercial Open-Meteo (a mesma do Atalaia). Escopos: Functions + Runtime. Secret.
- `XAI_API_KEY` — Iara (Grok chat + fala feminina). No preview já entra sozinha; no Netlify, a mesma chave no painel (Functions + Runtime). Secret. Nunca vai ao aparelho.
