# Proa — Documento de Design (GDD)

**Projeto:** Proa · PWA de passadiço para rebocador
**Organização:** TugLife Systems
**Autor:** Jossian Brito
**Versão do documento:** 1.5.0
**Data:** 2026-09-20 02:14 UTC (ano 2026)

---

## 1. Conceito

O Proa transforma o tablet do passadiço num instrumento de bordo. A tese
central é simples e incomum:

> **O casco é a boia oceanográfica.**

Em vez de perguntar a um modelo global qual é o mar na posição, o Proa pergunta
ao próprio rebocador. O acelerômetro do aparelho, fixado à estrutura, sente o
heave real do casco; dele saem altura significativa (Hs) e período (Tz)
medidos, não estimados. A previsão do Open-Meteo entra como segunda opinião,
não como verdade.

Disso nasce o produto: uma **faixa de RPM de viagem** calculada a partir do mar
que o navio está de fato sentindo.

## 2. Público

Tripulação de rebocador ASD em navegação costeira. Comandante, imediato e chefe
de máquinas. Uso a bordo, com uma mão, sob movimento, muitas vezes no escuro —
daí o tema `night` como padrão.

## 3. Pilares de design

| Pilar | O que significa na prática |
|---|---|
| **Medir, não adivinhar** | Todo número na tela tem procedência declarada. Se o app não sabe, ele diz que não sabe. |
| **Zero fricção** | Sem conta, sem login, sem nuvem. Abriu, está capturando. |
| **O dado é do navio** | Tudo em `localStorage`. Nada sai do aparelho, exceto coordenada para a meteorologia. |
| **Linguagem de passadiço** | Nós e milhas náuticas. Nunca km/h. Bombordo e estibordo, não esquerda e direita. |
| **O oficial de serviço manda** | A Lara orienta; nunca ordena. Toda consultoria termina lembrando disso. |

## 4. Arquitetura

```
┌─────────────┐   60 Hz   ┌──────────────┐   10 Hz   ┌──────────────┐
│  IMU        │──────────►│ SensorEngine │──────────►│ HeaveIntegr. │
│ devicemotion│  acumula  │  (decimação) │  dt real  │  (waves.ts)  │
└─────────────┘           └──────────────┘           └──────┬───────┘
                                                            │ heave [m]
┌─────────────┐                                             ▼
│  GPS        │──► fix, SOG, COG ──► passage.ts ──► ETA, XTE, progresso
└─────────────┘                                             │
┌─────────────┐                                             ▼
│ Open-Meteo  │──► /api/meteo ──► vento, corrente, maré ──► BridgeProvider
└─────────────┘                                             │
                                                            ▼
                                         ┌──────────────────────────────┐
                                         │ Painel · Ondas · Rota · RPM  │
                                         │           Lara               │
                                         └──────────────────────────────┘
```

**Stack:** TanStack Start (React 19) · Vite · Tailwind v4 · Zustand · Leaflet ·
PWA. Funções serverless em Netlify. Sem banco de dados.

### 4.1 Módulos do domínio

| Módulo | Responsabilidade |
|---|---|
| `waves.ts` | Cadeia de heave, Hs, Tz, estado do mar, compensação de ganho |
| `sensor-engine.ts` | IMU, GPS, decimação, simulação, snapshot de estado |
| `geo.ts` | Haversine, rumo, XTE, progresso na derrota |
| `gpx.ts` | Importação de track, rota e waypoints |
| `passage.ts` | Singradura: andado, falta, ETA, afastamento |
| `rpm.ts` | Faixa de RPM e conselho de combustível |
| `tide.ts` | Fase de maré e janela de enchente |
| `meteo.ts` | Open-Meteo, previsão por waypoint, fallback sintético |
| `api-guard.ts` | Limite de taxa e allowlist de origem dos endpoints |
| `api/*-handler.ts` | Lógica de `/api/meteo` e `/api/voice`, partilhada pelas duas pontas |
| `voice-alerts.ts` | Decide QUANDO a Lara fala sem ser chamada (puro, testado) |
| `voice-echo.ts` | Memória das duas últimas falas, contra realimentação acústica |
| `voice-tts.ts` | Cache e busca do áudio da fala |

## 5. O motor de onda — decisões de projeto

### 5.1 Por que dupla integração e não um sensor dedicado

O acelerômetro entrega aceleração; a onda é deslocamento. Entre um e outro há
duas integrações, e toda integração amplifica a deriva do MEMS — do mesmo modo
que um erro pequeno de agulha vira milhas de desvio depois de uma singradura
longa. A cadeia intercala passa-altas e integradores com fuga para segurar essa
deriva.

```
acc → HP → HP → ∫(fuga) → HP → ∫(fuga) → HP → heave
```

Parâmetros: `HEAVE_HP_FC = 0,055 Hz` (corta tudo mais lento que ~18 s) e
`HEAVE_VEL_LEAK = 0,988` por amostra a 10 Hz (τ ≈ 8,3 s).

### 5.2 O preço dos filtros, e como ele é pago

Os passa-altas cobram caro justamente no swell longo — o que impõe o pitch num
rebocador em viagem costeira. Ganho da cadeia, medido em bancada:

| Período | Ganho bruto |
|---|---|
| 4 s | 0,86 |
| 6 s | 0,76 |
| 8 s | 0,66 |
| 10 s | 0,55 |
| 12 s | 0,44 |
| 14 s | 0,36 |

`heaveResponseGain()` calcula esse fator analiticamente, a partir da função de
transferência discreta da cadeia, e `correctChainHs()` devolve ao Hs o que os
filtros tiraram. É a mesma ideia de calibrar o corrediço contra a milha medida:
o instrumento lê baixo por construção, e se aplica o fator conhecido.

Precisão resultante, com mar senoidal de Hs = 1,50 m:

| T real | Hs bruto | Tz lido | Hs corrigido | Erro |
|---|---|---|---|---|
| 4 s | 1,290 | 4,00 | 1,501 | +0,1 % |
| 6 s | 1,146 | 5,99 | 1,499 | −0,1 % |
| 8 s | 0,989 | 8,00 | 1,507 | +0,5 % |
| 10 s | 0,818 | 10,03 | 1,502 | +0,1 % |
| 12 s | 0,667 | 12,00 | 1,500 | 0,0 % |
| 14 s | 0,535 | 13,99 | 1,498 | −0,1 % |

### 5.3 Decimação de 60 Hz para 10 Hz

O IMU de tablet dispara a ~60 Hz; a cadeia trabalha a 10 Hz. As amostras são
**acumuladas entre ticks e promediadas**. A média de janela é um passa-baixa —
que é exatamente o anti-aliasing que toda redução de taxa exige. Sem ela, uma
vibração de motor a 25 Hz rebateria dentro da banda da onda e viraria mar que
não existe.

O campo `imuHz` do snapshot expõe a taxa real medida do acelerômetro. É o
número que permite confirmar, no aparelho, que a decimação está de pé.

### 5.4 Quando o app admite que não sabe

`wave.trusted` cai para `false` quando:

- o Hs bate no teto de casco (`HS_HULL_MAX = 8 m`) — é deriva, não mar;
- alguém pegou o aparelho (pico acima de `HEAVE_ACC_SPIKE = 2,8 m/s²`), por 2,5 s;
- **não há período confiável** — sem frequência onde avaliar o ganho, a leitura
  fica crua e subestimada, e o passadiço merece saber disso.

### 5.5 Escala de estado do mar

O grau exibido segue **Douglas / WMO 3700**, de 0 a 9, e vive em
`SEA_STATE_TABLE` como dado — não como cadeia de `if` — justamente para poder
ser conferido linha a linha contra a publicação.

| Grau | Hs (m) | Rótulo |
|---|---|---|
| 0 | 0 | Calmo (espelhado) |
| 1 | 0 – 0,1 | Calmo (encrespado) |
| 2 | 0,1 – 0,5 | Bonançoso |
| 3 | 0,5 – 1,25 | Fraco |
| 4 | 1,25 – 2,5 | Moderado |
| 5 | 2,5 – 4 | Grosso |
| 6 | 4 – 6 | Muito grosso |
| 7 | 6 – 9 | Alto |
| 8 | 9 – 14 | Muito alto |
| 9 | > 14 | Excepcional |

Os limiares de alarme vivem em `seaTone()` e são fixados em **altura**, não em
número de grau: âmbar a partir de 1,25 m, vermelho a partir de 2,5 m. Assim uma
futura mexida na escala não desloca o alarme junto.

## 6. O modelo de RPM

```
centro = cruzeiro − penalidadeMar − penalidadeVento − penalidadeEncontro
faixa  = centro ± (70 + Hs × 18), limitada a [marcha lenta, 78 % do máximo]
```

O ângulo de encontro classifica o mar em **proa**, **través** ou **popa** pelo
cosseno da diferença entre o rumo e a direção para onde a onda vai. Mar de popa
devolve penalidade negativa — ajuda a andar.

A penalidade de mar tem dois termos, com efeitos físicos distintos: a
**altura** cobra o trabalho de levantar o casco, a **declividade** cobra o
castigo do impacto. Uma onda de 2 m em 14 s embala o rebocador; a mesma altura
em 6 s martela.

A declividade é `Hs/L`, adimensional, com `L = g·T²/(2π)` em águas profundas —
escala com `1/T²`. Até a 1.1.0 usava-se `Hs/T`, que tem unidade de m/s e escala
com `1/T`, de modo que o modelo mal distinguia swell longo de vaga curta. A
constante foi recalibrada no ponto de referência Hs 1,5 m / T 8 s, de modo que
só a resposta ao período mudou:

| Hs · T | Penalidade de mar antes | Depois | Δ |
|---|---|---|---|
| 1,5 m · 5 s | 243 rpm | 319 rpm | **+76** |
| 1,5 m · 8 s | 196 rpm | 196 rpm | 0 (calibração) |
| 1,5 m · 12 s | 170 rpm | 152 rpm | **−17** |
| 2,0 m · 6 s | 296 rpm | 343 rpm | **+47** |
| 2,0 m · 14 s | 216 rpm | 190 rpm | **−26** |
| 3,0 m · 7 s | 381 rpm | 440 rpm | **+59** |

> **Limitação que permanece.** As constantes (78, 5250, 55) seguem empíricas e
> sem procedência publicada. A resistência adicionada em ondas, pela formulação
> padrão STAWAVE-1 (ISO 15016 / ITTC), escala com **Hs²**, não linearmente com
> Hs. Corrigiu-se a dimensão da declividade, não a calibração absoluta do
> modelo — esta continua sendo o item P8 do §9, e exige dado de viagem real.

## 7. A Lara

Assistente de voz presencial, não rádio nem atendente. Português do Brasil,
contrações naturais, sem emoji, sem lista numerada.

- **Acordar:** palavra-chave `Lara` (o STT também aceita *Iara*, *Yara*, *Hiara*).
- **Modo conversa:** toca em Conversar, toca de novo para encerrar.
- **Escopo:** derrota, COLREG, estabilidade (GM, superfície livre, lastro),
  NORMAM, MARPOL, SOLAS.
- **Regra dura:** fatos só do contexto ao vivo. Não inventa posição, Hs, SOG,
  ETA, waypoint nem número de regra. Se faltar dado, diz que não tem.
- **Alertas espontâneos:** XTE acima do limite e passagem de waypoint, e mais
  nada. A decisão vive em `voice-alerts.ts`, pura e testada, com travas de
  cadência de 45 s (XTE) e 18 s (waypoint).

## 8. Privacidade e segurança

Nada de conta, nada de nuvem, nada de banco. O estado vive em `localStorage`.
As chaves de API (`OPENMETEO_API_KEY`, `XAI_API_KEY`) ficam exclusivamente no
servidor e nunca chegam ao aparelho — o JSON de meteorologia devolve apenas o
campo `plano: "comercial" | "gratuito"`.

Sai do aparelho: coordenada (para a meteorologia) e áudio da fala (para o STT
do Grok, quando a Lara está em conversa).

### 8.1 Guarda dos endpoints públicos

`/api/meteo` e `/api/voice` são abertos de propósito — o Proa não tem login, e
a tripulação não vai digitar senha com o navio jogando. Mas os dois fazem proxy
para serviços **pagos**. A exposição não é de dado, é de **fatura**.

`src/lib/api-guard.ts` põe uma portaria antes de qualquer trabalho, nos quatro
pontos de entrada (as duas rotas Nitro e as duas functions Netlify):

| Endpoint | Por minuto | Por hora |
|---|---|---|
| `/api/meteo` | 60 | 600 |
| `/api/voice` | 40 | 400 |

Contagem por IP, em janela deslizante. Um pedido barrado **não** é contado —
senão um script de terceiro trancaria o aparelho da tripulação para sempre.
Resposta `429` com `Retry-After`.

A allowlist de origem aceita mesma origem (o que já cobre produção, deploy
preview e sandbox), localhost, e o que estiver em `PROA_ALLOWED_ORIGINS`.

> **O que esta guarda não é.** O limite de taxa é o controle substantivo; a
> allowlist de origem é defesa em profundidade, porque a ausência de cabeçalhos
> CORS já impede o navegador de ler a resposta de outra origem. E a contagem
> vive na memória da instância quente: vale por instância, não globalmente. É
> um quebra-molas contra um laço, não um cofre contra um ataque distribuído.
> Um limite global exige armazenamento compartilhado — ver §9.

## 8.2 Os dois pontos de entrada de cada endpoint

`/api/meteo` e `/api/voice` têm **duas** pontas, e as duas estão vivas em alvos
diferentes:

| Ponta | Onde serve |
|---|---|
| `src/routes/api/*.ts` (TanStack/Nitro) | desenvolvimento local, sandbox de preview, preset Vercel |
| `netlify/functions/*.mts` | produção na Netlify — declara `path`, tem precedência sobre o SSR |

Até a 1.2.0 cada ponta carregava sua própria cópia da lógica, e elas já tinham
divergido (só a rota Nitro devolvia o cabeçalho de diagnóstico `x-proa-voice`).
Duas cartas para a mesma derrota é como navegar sem saber qual está corrigida.

Desde a 1.3.0 a lógica mora em `src/lib/api/` e as quatro pontas somam 44 linhas
de casca. Nenhum alvo foi removido: os dois continuam necessários.

## 9. Trabalho futuro

| # | Item | Estado |
|---|---|---|
| P4 | Código de estado do mar deslocado em 1 face à escala WMO; declividade com dimensão errada | ✅ **Feito em 1.2.0** |
| P5 | `/api/voice` e `/api/meteo` públicos e sem limite de taxa sobre APIs pagas | ✅ **Feito em 1.2.0** |
| P7 | Peso morto: `multiplayer/`, `app-data/`, `auth/`, endpoints duplicados, deps órfãs | ✅ **Feito em 1.3.0** |
| P8 | Migrar `seaPenalty` para STAWAVE-1 (∝ Hs²), calibrado com dado de viagem real | **Pendente** |
| P9 | `voice-assistant.tsx` tem 1.025 linhas e 30+ refs; quebrar em hooks | 🟡 **Parcial em 1.4.0** — três peças extraídas, o laço de turno continua no componente |
| ~~BUG~~ | ~~O aviso de fim de turno não dispara~~ | ✅ **Resolvido em 1.5.0 por remoção** — ver §10 |
| — | Limite de taxa global (hoje é por instância quente): exige Netlify Blobs, Redis ou equivalente | Ideia |
| — | Calibração assistida: regressão de `hsObs` contra `hsForecast` ao longo da viagem | Ideia |
| — | Assinatura hidrodinâmica: acumular (heave, roll) × (Hs, Tz, encontro) = RAO experimental do casco | Ideia |

## 10. Histórico de versões

### 1.5.0 — 2026-09-20

Removido o controle de turno de tripulação.

O defeito achado na 1.4.0 tinha duas saídas: religar o aviso ou tirar a
funcionalidade. Foi tirada, e a razão é de produto, não de código: o app
aceitava "me avisa quando acabar o turno do Pedro", respondia **"Fechou. Aviso
o Pedro às 20:00."** — e não avisava. Enquanto o fio esteve cortado, essa frase
foi uma mentira dita à tripulação. **Num app de passadiço, promessa que não se
cumpre é pior que recurso que não existe**: quem confia no aviso não põe o
despertador.

Saíram de `crew.ts` o tipo `CrewWatch` e as funções `parseWatchAsk`,
`parseWatchCancel`, `upsertWatch`, `dropWatch`, `pruneWatches`, `dueWarn`,
`dueWatch`, `watchLine`, `watchWarnLine` e `parseClockPt` — esta última um
analisador de hora em português ("às 8 da manhã", "20h", "daqui 2 horas") que
não tinha nenhum outro consumidor. Com elas saíram `crewWatches` do store, o
campo `turnos[]` do contexto da Lara, a resposta rápida sobre turno, a linha
"Turno:" do prompt do sistema, o painel de turnos na gaveta da conversa e as
duas regras de eco para "fim de turno", que a Lara não diz mais.

O **cadastro de nomes da tripulação continua** — é o que faz a Lara chamar o
pessoal pelo nome, e não depende de turno nenhum.

`crew.ts` cai de 228 para 79 linhas; `voice-assistant.tsx` de 952 para 899.
Cobertura: 164 para 159 testes, a diferença sendo os 5 testes de turno.

### 1.4.0 — 2026-09-20

Primeira etapa do P9. `voice-assistant.tsx` cai de 1.025 para 952 linhas, e o
que saiu virou três módulos puros e testados, em vez de mudar de lugar:

| Extraído | Linhas | O que ganhou |
|---|---|---|
| `voice-alerts.ts` | 156 | a decisão dos avisos espontâneos era um bloco de ~70 linhas dentro de um `setInterval`; agora é uma função pura com 12 testes |
| `voice-tts.ts` | 109 | cache e busca do áudio, com 7 testes cobrindo storage bloqueado, cota cheia e sobra curta demais |
| `voice-echo.ts` | 58 | memória das duas últimas falas contra realimentação acústica, com 8 testes |

**Preservação de comportamento.** O tick de waypoint continua sem rodar no passo
em que o XTE alerta — é como o laço original agia, e trocar isso durante uma
extração seria mudar a conduta às cegas. Há teste amarrando essa regra.

A única mudança de conduta é na memória de eco: antes o `lastLineRef` era
re-sincronizado a partir do estado do React a cada render, o que podia
sobrescrever a referência com um valor velho. Agora a memória é o dono do dado,
e o estado serve só ao que aparece na tela.

**Achado durante a leitura:** o aviso de fim de turno está implementado e
testado, e não é chamado por ninguém desde `5e2c387`. Registrado em §9.

Cobertura: 138 para 164 testes.

### 1.3.0 — 2026-09-20

Amputação do peso morto. **−5.363 linhas de código e −36 dependências diretas**,
sem mudar uma vírgula do comportamento do app.

O que saiu, e a evidência de que estava morto:

| Removido | Linhas | Evidência |
|---|---|---|
| `src/lib/multiplayer/` (P2P WebRTC) | 579 | zero importadores |
| `src/lib/app-data/` (conectores Grok) | 768 | laço fechado — a ponte de preview disparava um evento que só um hook escutava, e esse hook nunca era montado |
| `src/lib/auth/` | 1.888 | o `AuthProvider` era `return <>{children}</>`; nada disso entrava no bundle; README e GDD já declaravam "sem conta, sem nuvem" |
| `src/lib/db.ts` + `migrations/` + `scripts/migrate*` | ~400 | só a auth usava |
| `vite.config.ts`: `pgliteBootstrapPlugin`, `authPopupPlugin` | ~130 | dependiam do que saiu |
| `src/components/route-plot.tsx` | 110 | substituído pelo `nautical-map.tsx` e nunca removido |
| 31 dependências de UI (21 Radix, react-hook-form, react-query, react-table, cmdk, date-fns, sonner, vaul…) | — | nenhum import em lugar nenhum: biblioteca do template para telas que nunca existiram |
| 5 dependências de banco (better-auth, pglite, pg, kysely, jose) | — | idem |

Também **unificados** os endpoints duplicados: a lógica foi para
`src/lib/api/`, e as quatro pontas viraram cascas (ver §8.2). Isso corrigiu uma
divergência real — a function Netlify não devolvia o cabeçalho de diagnóstico
que a rota Nitro devolvia.

O que **não** saiu, e por quê: `react-dom` (é o renderizador),
`@tanstack/router-plugin` (gera o route tree), e os scripts de andaime em
`scripts/` (são do template, seguem funcionando, e mexer neles ampliaria o raio
de explosão sem ganho de produto).

Cobertura: 193 para 138 testes — a queda é só a saída dos 55 testes de `auth/`
e `app-data/`. Nenhum teste de domínio foi perdido.

### 1.2.0 — 2026-09-20

Escala, dimensão e portaria.

1. **Escala de estado do mar.** A tabela usava as faixas certas mas numerava a
   partir de 0 na faixa 0–0,1 m, deslocando todo grau em 1 face à Douglas /
   WMO 3700, e truncava em 7. Quem reportasse "mar estado 4" à praticagem
   estava um grau abaixo do padrão. Agora vai de 0 a 9, e os limiares de alarme
   saíram das telas para `seaTone()`, presos à altura e não ao número do grau.
2. **Declividade de onda.** `Hs/T` tem unidade de m/s e não é declividade.
   Trocado por `Hs/L` com `L = g·T²/(2π)`, adimensional, que escala com `1/T²`.
   Constante recalibrada no ponto de referência, de modo que só a resposta ao
   período mudou.
3. **Guarda dos endpoints.** Limite de taxa por IP e allowlist de origem em
   `/api/meteo` e `/api/voice`, nos quatro pontos de entrada.

Cobertura: 165 para 193 testes.

### 1.1.0 — 2026-09-20

Correção do motor de onda. Três defeitos que faziam o instrumento principal
mentir a bordo enquanto parecia correto na bancada:

1. **Taxa de amostragem.** Todo evento `devicemotion` era integrado com `dt`
   fixo de 1/10 s, mas o IMU dispara a ~60 Hz. Num mar de 1,50 m e 8 s o app
   mostrava 0,008 m e período zero. O simulador não sofria porque empurrava
   amostras de dentro do próprio tick, a 10 Hz certos. Agora há decimação com
   `dt` medido.
2. **Realimentação na cadeia.** `disp = heave` substituía o estado do
   integrador pela saída filtrada a cada amostra, subtraindo a baixa frequência
   recursivamente. O Hs lido caía a 16 % do real em 8 s e 4,7 % em 12 s.
   Removida; a cadeia saiu para `waves.ts` como `HeaveIntegrator`, pura e
   testável.
3. **Estimador de período.** `zeroCrossingPeriod` dividia a janela inteira pelo
   número de cruzamentos, o que fazia uma onda de 12 s e uma de 14 s lerem
   ambas 12,84 s numa janela de 90 s. Agora mede entre o primeiro e o último
   cruzamento, com interpolação linear. Importa em dobro, porque é nessa
   frequência que o ganho da cadeia é avaliado.

Acrescentado: `heaveResponseGain()`, `correctChainHs()`, campo `imuHz`.
Cobertura: 37 testes novos (`geo`, `passage`, regressão da cadeia de heave),
de 128 para 165.
Infraestrutura: `npm test` encadeava andaime e domínio com `&&`; como o andaime
falhava primeiro, **os testes de domínio nunca rodavam**. Separados em `test` e
`test:scaffold`.

### 1.0.0 — 2026-09-17 a 2026-09-19

Versão inicial. Captura de sensores, GPX, Open-Meteo, faixa de RPM, Lara.
