# Proa

PWA de passadiço da [TugLife Systems](https://github.com/Jbvix) para smartphone e tablet.

Captura movimento e posição do rebocador, atualiza características de onda a cada hora, consulta meteorologia marinha (Open-Meteo) e recomenda a faixa de RPM de viagem.

## O que o app faz

- **GPX** — a derrota entra por arquivo (track, rota ou waypoints)
- **RPM atual** — informe o regime do motor
- **Sensores** — mar ao vivo no casco (heave → Hs, amplitude, período)
- **Open-Meteo** — vento e corrente na posição; previsão marinha em cada waypoint do GPX
- **RPM ideal** — banda de viagem a partir do mar do casco, vento e encontro com a onda
- **Lara** — voz no passadiço. Chama pelo nome; nos 10 s depois da resposta dela pode emendar sem o nome. Toca em Conversar pra abrir a gaveta; 90 s de silêncio fecham
- **Relatório da hora cheia e diário de travessia** — a Lara fala na hora redonda em singradura e grava uma linha por hora (14 dias), exportável em CSV na aba RPM

## Uso a bordo

1. Abra o Proa — a captura e o mapa começam sozinhos (GPS + sensores)
2. Importe o arquivo GPX da derrota na aba **Rota**
3. Informe o RPM atual
4. Acompanhe o **Painel**, **Ondas**, **Rota** e **RPM**
5. Toca em **Conversar** pra falar com a **Lara**. Toca de novo pra encerrar. No tablet Samsung, o primeiro toque na tela libera o microfone.

Dados ficam só neste aparelho (sem conta, sem nuvem).

## Documentação

- [Documento de Design (GDD)](docs/GDD.md) — arquitetura, o motor de onda e as decisões de projeto
- [Manual do Usuário](docs/MANUAL.md) — uso a bordo, precisão esperada e solução de problemas

## Stack

TanStack Start (React 19), Vite, Tailwind v4, PWA.

## Desenvolvimento

```bash
npm run dev            # servidor em :8080
npm test               # testes de domínio (278) — tem de ficar verde
npm run test:scaffold  # testes do andaime do template (exige .grok/)
npm run test:all       # os dois
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
```

`npm test` cobre só `src/` justamente pra ficar verde num clone limpo: os testes
de `scripts/` dependem do diretório `.grok/`, que não vai pro repositório.

Meteorologia: function Netlify `/api/meteo` (Open-Meteo Forecast + Marine). Com `OPENMETEO_API_KEY` no painel do Netlify, usa o endpoint comercial (`customer-api` / `customer-marine-api`). Sem a chave, cai no endpoint público (desenvolvimento). A chave nunca vai ao navegador; o JSON só traz `plano: "comercial" | "gratuito"`.

## Deploy (Netlify)

Site: [tuglife-proa.netlify.app](https://tuglife-proa.netlify.app)

Vinculado a este repositório, branch `main`: **todo push em `main` publica
sozinho**, em cerca de 40 segundos.

Build: `npm run build` · publicação: `dist` · Node 22. Tudo declarado no
`netlify.toml`, que tem precedência sobre o painel — deixe os campos de build em
branco lá.

Para reproduzir o build do CI localmente (é o caminho que o Netlify usa, e o
único em que o estático vai para `dist/`):

```bash
NETLIFY=true npx vite build
```

Variáveis:

- `VITE_AUTH_ENABLED=false` — herdado do template; desde a 1.3.0 não há código de login nem banco no projeto
- `OPENMETEO_API_KEY` — assinatura comercial Open-Meteo (a mesma do Atalaia). Escopos: Functions + Runtime. Secret.
- `XAI_API_KEY` — Lara (Grok chat + fala feminina). No preview já entra sozinha; no Netlify, a mesma chave no painel (Functions + Runtime). Secret. Nunca vai ao aparelho.
- `PROA_ALLOWED_ORIGINS` — opcional. Hosts extras aceitos pelos endpoints, separados por vírgula.
