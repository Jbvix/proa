# Proa — Documento de Design (GDD)

**Projeto:** Proa · PWA de passadiço para rebocador
**Organização:** TugLife Systems
**Autor:** Jossian Brito
**Versão do documento:** 1.1.0
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

## 6. O modelo de RPM

```
centro = cruzeiro − penalidadeMar − penalidadeVento − penalidadeEncontro
faixa  = centro ± (70 + Hs × 18), limitada a [marcha lenta, 78 % do máximo]
```

O ângulo de encontro classifica o mar em **proa**, **través** ou **popa** pelo
cosseno da diferença entre o rumo e a direção para onde a onda vai. Mar de popa
devolve penalidade negativa — ajuda a andar.

> **Limitação conhecida e documentada.** As constantes (78, 420, 55) são
> empíricas e não têm procedência publicada. A resistência adicionada em ondas,
> pela formulação padrão STAWAVE-1 (ISO 15016 / ITTC), escala com **Hs²**, não
> linearmente com Hs. A declividade usada (`Hs/T`) tem unidade de m/s e não é
> declividade de onda — a declividade real é `Hs/(1,56·T²)`, adimensional.
> Ambos são itens de trabalho futuro (ver §9).

## 7. A Lara

Assistente de voz presencial, não rádio nem atendente. Português do Brasil,
contrações naturais, sem emoji, sem lista numerada.

- **Acordar:** palavra-chave `Lara` (o STT também aceita *Iara*, *Yara*, *Hiara*).
- **Modo conversa:** toca em Conversar, toca de novo para encerrar.
- **Escopo:** derrota, COLREG, estabilidade (GM, superfície livre, lastro),
  NORMAM, MARPOL, SOLAS.
- **Regra dura:** fatos só do contexto ao vivo. Não inventa posição, Hs, SOG,
  ETA, waypoint nem número de regra. Se faltar dado, diz que não tem.
- **Alertas espontâneos:** só XTE acima do limite, passagem de waypoint e fim de
  turno de tripulante.

## 8. Privacidade

Nada de conta, nada de nuvem, nada de banco. O estado vive em `localStorage`.
As chaves de API (`OPENMETEO_API_KEY`, `XAI_API_KEY`) ficam exclusivamente no
servidor e nunca chegam ao aparelho — o JSON de meteorologia devolve apenas o
campo `plano: "comercial" | "gratuito"`.

Sai do aparelho: coordenada (para a meteorologia) e áudio da fala (para o STT
do Grok, quando a Lara está em conversa).

## 9. Trabalho futuro

| # | Item | Estado |
|---|---|---|
| P4 | Código de estado do mar está deslocado em 1 face à escala WMO; declividade com dimensão errada | **Pendente** |
| P5 | `/api/voice` e `/api/meteo` são públicos e sem limite de taxa sobre APIs pagas | **Pendente** |
| P7 | Peso morto: `multiplayer/` (579 linhas, zero importações), `auth/` desligado (1.888), endpoints duplicados | **Pendente** |
| P8 | Migrar `seaPenalty` para STAWAVE-1 (∝ Hs²), calibrado com dado de viagem real | **Pendente** |
| P9 | `voice-assistant.tsx` tem 1.025 linhas e 30+ refs; quebrar em hooks | **Pendente** |
| — | Calibração assistida: regressão de `hsObs` contra `hsForecast` ao longo da viagem | Ideia |
| — | Assinatura hidrodinâmica: acumular (heave, roll) × (Hs, Tz, encontro) = RAO experimental do casco | Ideia |

## 10. Histórico de versões

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
