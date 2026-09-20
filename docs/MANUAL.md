# Proa — Manual do Usuário

**Para a tripulação do passadiço**
**Autor:** Jossian Brito · TugLife Systems
**Versão:** 1.12.0 · 2026-09-20 12:00 UTC (ano 2026)

---

## 1. O que o Proa faz

O Proa usa o tablet como instrumento de bordo. O acelerômetro do aparelho sente
o mar no casco, o GPS acompanha a derrota, e o app recomenda a **faixa de RPM
de viagem**.

O casco vira a boia: o mar que aparece na tela é o que o rebocador está
sentindo agora, não o que um modelo global calculou para a região.

## 2. Antes de sair

### 2.1 Instalar

Abra [tuglife-proa.netlify.app](https://tuglife-proa.netlify.app) e adicione à
tela de início.

- **iPad / iPhone:** botão Compartilhar → *Adicionar à Tela de Início*
- **Android / Samsung:** menu ⋮ → *Instalar aplicativo*

### 2.2 Fixar o aparelho

**Isto é o que mais afeta a qualidade da medição.** O Proa mede o movimento do
que está preso ao aparelho. Se o tablet estiver solto na mesa, ele mede a mesa.

- Prenda firme à estrutura do passadiço — suporte, berço ou fita.
- Quanto mais perto do centro do navio, melhor: nas extremidades, o pitch
  soma-se ao heave e infla a leitura.
- Não segure na mão durante a captura.

### 2.3 Liberar os sensores

Na primeira abertura o aparelho pede permissão de **localização** e de
**movimento**. Precisa das duas.

No tablet Samsung, **o primeiro toque na tela libera o microfone** — sem esse
toque a Lara não ouve.

## 3. Uso a bordo

1. **Abra o Proa.** A captura e o mapa começam sozinhos.
2. **Importe o GPX** da derrota na aba **Rota** (aceita track, rota ou waypoints).
3. **Informe o RPM atual** na aba **RPM**.
4. **Acompanhe** Painel, Ondas, Rota e RPM.
5. **Toque em Conversar** para falar com a Lara. Toque de novo para encerrar — ou ela encerra sozinha depois de 90 s sem ninguém falar com ela.

## 4. As quatro abas

### Painel

Visão geral: posição, SOG, rumo, mar ao vivo, vento e a faixa de RPM.

O campo ao lado da velocidade diz **de onde veio o número**:

| Indicação | Significado |
|---|---|
| `validada` | GPS e distância percorrida concordam. Pode confiar. |
| `GPS 9.2 · derrota 4.0` | Discordam. Julgue: pode ser GPS ruim ou corrente. |
| `derrota 4.1 nós` | Só a distância percorrida. O GPS não deu velocidade. |
| `sem confirmação` | Ainda não há base para afirmar velocidade. |

### Ondas

O mar medido no casco: **Hs** (altura significativa), **amplitude**, **período**
e o osciloscópio de heave dos últimos 24 s.

**Leia o selo de confiança.** Quando o app não confia na própria leitura, ele
avisa. Isso acontece quando:

- alguém pegou o aparelho (a leitura fica suspensa por 2,5 s);
- o Hs estourou o limite de casco (8 m) — é deriva do sensor, não mar;
- **não há período confiável** — sem período, o app não consegue compensar os
  filtros e o Hs sai subestimado.

A leitura precisa de cerca de **90 segundos** de captura para assentar. Nos
primeiros instantes depois de ligar, ignore.

**O grau do mar** ao lado do título segue a escala **Douglas / WMO 3700**, a
mesma que se reporta à praticagem e se lança no diário:

| Grau | Hs | Como se chama |
|---|---|---|
| 0 – 1 | até 0,1 m | Calmo |
| 2 | 0,1 – 0,5 m | Bonançoso |
| 3 | 0,5 – 1,25 m | Fraco |
| 4 | 1,25 – 2,5 m | Moderado |
| 5 | 2,5 – 4 m | Grosso |
| 6 | 4 – 6 m | Muito grosso |
| 7 | 6 – 9 m | Alto |
| 8 | 9 – 14 m | Muito alto |
| 9 | acima de 14 m | Excepcional |

> **Atenção a quem usou versões anteriores.** Até a 1.1.0 o app numerava um grau
> abaixo do padrão: o que ele chamava de 3 é o grau 4 da escala. A partir da
> 1.2.0 o número na tela é o número da publicação. Se você vinha anotando o grau
> do app no diário, some 1 aos registros antigos.

O selo muda de cor por **altura**, não por grau: âmbar a partir de 1,25 m,
vermelho a partir de 2,5 m.

### Rota

O GPX importado no mapa, com os waypoints do arquivo, previsão marinha em cada
um, e o **afastamento da derrota (XTE)** com o bordo:

- **BB** — bombordo, você está à esquerda de quem olha a proa da derrota
- **EB** — estibordo, à direita
- **na linha** — em cima da derrota

### RPM

A faixa recomendada, com o porquê: Hs, período, vento e o encontro com a onda
(**mar de proa**, **de través** ou **de popa**).

Abaixo, o conselho de combustível — se o tempo está a favor e dá para aliviar,
ou se cortar RPM só vai alongar a viagem sem economizar.

**O período pesa tanto quanto a altura.** Dois metros em 14 segundos embalam o
rebocador; dois metros em 6 segundos martelam. A faixa distingue os dois: em
vaga curta ela desce mais, em swell longo ela alivia.

**Dobrar a onda quadruplica a força.** Desde a 1.6.0 a tela mostra a
**resistência adicionada pela onda**, em quilonewtons — o que o mar está
comendo do seu bollard pull. Ela cresce com o quadrado do Hs, que é como a
física manda e como o casco sente. Consequência prática: em mar fraco a faixa
ficou mais generosa que nas versões antigas, e em mar grosso ela desce bem mais
rápido. Acima de Hs 3 m a recomendação encosta na marcha lenta e para de
distinguir — nessa altura já não é viagem.

### Informe o seu casco

No fim da aba RPM há o cartão **Casco**, com dois campos:

| Campo | O que é | Onde achar |
|---|---|---|
| **Boca** | boca moldada, em metros | plano de linhas ou arqueação |
| **Proa na LWL** | comprimento da proa na linha d'água até onde o casco atinge 95 % da boca | plano de linhas |

O padrão é um rebocador de porto de ~30 m (boca 11,5 m, proa 7 m). Se o seu for
outro, corrija: a resistência adicionada depende dos dois, e proa curta e
cheia — a assinatura do ASD — martela mais que proa fina.

## 5. A Lara

Colega de passadiço, não rádio.

| Para... | Faça... |
|---|---|
| Começar a conversa | Toque em **Conversar** |
| Acordar pela voz | Diga **"Lara"** |
| Encerrar | Toque em **Conversar** de novo, ou diga "tchau, Lara" |
| Deixar encerrar | Fique 90 s sem falar com ela. A conversa fecha sozinha, sem ela falar nada |

**Enquanto a conversa está aberta**, o ícone da Lara no alto da tela fica com
um anel aceso. É o "canal aberto": tudo que se diz no passadiço vai para ela,
sem precisar chamar pelo nome. Nos últimos 15 segundos aparece um número no
canto do ícone contando para trás — basta falar qualquer coisa para renovar o
prazo. Quando fecha, fica escrito na gaveta: *"Fechei a conversa…"*. A partir
daí só **"Lara"** a acorda de novo.

> **Por que ela fecha sozinha.** Antes da 1.10.0 a conversa ficava aberta até
> alguém lembrar de encerrar — e ninguém lembrava. Ordens ao timoneiro, horas
> depois, viravam pergunta para a Lara. Agora o esquecimento custa no máximo
> 90 segundos.

**Pergunte à vontade sobre:** posição, quanto falta, ETA, mar, vento, maré,
waypoints, COLREG, estabilidade (GM, superfície livre, lastro), NORMAM,
MARPOL, SOLAS.

**A Lara avisa sozinha** em três casos apenas: afastamento da derrota acima do
limite, passagem de waypoint e, desde a 1.12.0, **o relatório da hora cheia**.

**Relatório da hora cheia.** Toda hora redonda (14:00, 15:00…), com o
rebocador em singradura, a Lara diz: velocidade e rumo, Hs medido no casco e
Hs previsto, vento, RPM (e a faixa, se estiver fora dela), milhas restantes e
ETA, próximo waypoint, maré. No cais ou fundeado ela não fala — mas grava.
Ao abrir o app no meio da hora, o primeiro relatório é só na próxima hora
redonda. Um aviso de XTE ou de waypoint no mesmo instante tem prioridade; o
relatório sai logo depois.

**Diário de travessia.** Cada relatório da hora fica gravado no aparelho —
falado ou não — por até 14 dias: posição, SOG, rumo, Hs medido e previsto,
vento, corrente, RPM e faixa, milhas, ETA, maré. Na aba **RPM**, o cartão
*Diário de travessia* mostra quantas horas há e permite **Compartilhar CSV**
(abre a folha do Android: WhatsApp, Drive, e-mail) ou **Limpar**. Exporte o
CSV ao fim de cada viagem: é com ele que a faixa de RPM vai ser calibrada
para o seu casco.

> **O controle de turno saiu na 1.5.0.** O Proa chegou a aceitar "me avisa
> quando acabar o turno do Pedro", respondia "fechou, aviso às 20:00" — e não
> avisava. O aviso tinha sido desligado numa reescrita e ninguém percebeu,
> porque o código e os testes ficaram no lugar. Em vez de religar, a
> funcionalidade foi removida inteira: **um app de passadiço que promete
> chamar e não chama é pior que um app que não promete nada**. Para render a
> vigia, use o despertador do aparelho.

> **Duas vozes, de propósito (desde a 1.11.0).** Perguntas de número —
> "qual o SOG", "e o vento", "como tá o Hs", "quanto falta" — são respondidas
> pelo próprio tablet e saem **na voz do Android**, na hora, sem passar pela
> rede. Consultoria, relatório e conversa saem na voz da Lara, que vem do
> servidor e demora um pouco mais. Se a voz do Android não estiver instalada
> em português, tudo sai na voz da Lara, como antes. Para instalar:
> *Configurações → Gerenciamento geral → Conversão de texto em voz → Google →
> Instalar dados de voz → Português (Brasil)*.

> **Respostas mais curtas.** A Lara agora responde como se fala no
> passadiço: uma a duas frases numa pergunta direta, no máximo quatro num
> relatório. Se quiser mais, pergunte de novo.

> **A Lara orienta, não ordena.** É suporte de consultoria. Não substitui o
> oficial de serviço nem o texto oficial da norma. Se ela não tiver o dado no
> contexto, ela diz que não tem — e isso é de propósito.

## 6. Precisão — o que esperar

O mar medido no casco tem precisão de cerca de **±5 %** em ondas de 4 a 14
segundos, depois que a janela de 90 s assenta.

Fora dessa faixa:

- **Abaixo de 3 s** — vaga muito curta, tratada como ruído e descartada.
- **Acima de 16 s** — swell muito longo para a janela; o período é rejeitado e
  o Hs sai sem compensação, ou seja, **abaixo do real**. O selo de confiança
  cai. Nesse caso use a previsão do Open-Meteo.

Se o Hs parecer baixo demais em swell longo, confira: (a) o aparelho está
firme? (b) o período aparece na tela ou está em branco?

## 6.1 Qual versão está no seu aparelho

O número aparece **no alto da tela**, ao lado de "Sensores do aparelho" /
"Simulação de bordo": `v1.9.0`.

Diga sempre esse número ao reportar qualquer coisa estranha. O Proa é um app
instalado, e o aparelho pode segurar uma versão antiga em cache — dois tablets
do mesmo rebocador podem estar rodando versões diferentes. Se o seu estiver
atrás, feche e reabra o app; se insistir, limpe o cache do navegador.

## 7. Problemas comuns

| Sintoma | O que fazer |
|---|---|
| Mapa parado numa posição fixa | GPS ainda esquentando. Depois de 4 s sem fix, o app cai em simulação — saia para o convés ou perto da janela. |
| Hs em zero com mar visível | Aparelho solto ou permissão de movimento negada. Prenda firme e recarregue. |
| Período em branco | Mar fora da faixa de 3 a 16 s, ou captura com menos de 90 s. |
| A Lara não ouve | No Samsung, toque uma vez na tela. Confira a permissão de microfone. |
| A Lara parou de responder sem chamar pelo nome | A conversa expirou (90 s de silêncio) — veja a linha "Fechei a conversa" na gaveta. Diga **"Lara"** ou toque em **Conversar**. |
| A Lara não deu o relatório da hora | Ou não estava em singradura (SOG abaixo de 0,6 nó — ela grava e cala), ou a captura estava parada, ou o app foi aberto depois da hora redonda. Confira o diário na aba RPM: se a hora está lá, ela gravou. |
| Resposta de número sai numa voz diferente da Lara | É a voz do Android, escolhida de propósito para responder na hora. Veja a nota "Duas vozes" na seção 5. |
| A Lara responde a conversa que não era com ela | Confira se o anel do ícone está aceso: a conversa está aberta. Toque em **Conversar** para encerrar, ou espere os 90 s. |
| "Open-Meteo indisponível" | Sem rede. Vento e corrente passam a ser locais e aproximados; o mar do casco continua real. |
| "Muitos pedidos deste aparelho" | Proteção contra uso descontrolado dos serviços pagos. Aguarde o tempo indicado; o uso normal de bordo nunca chega perto do limite. |
| Tela clara demais à noite | Alterne o tema para `night`. |

## 8. Seus dados

Tudo fica **neste aparelho**, em armazenamento local. Sem conta, sem nuvem, sem
banco de dados.

Sai do aparelho apenas: a **coordenada** (para buscar a meteorologia) e o
**áudio da sua fala** (para a transcrição, só enquanto a Lara está em conversa).

Limpar os dados do site apaga: derrota importada, perfis de motor e casco,
nomes da tripulação, vozes cadastradas e o histórico de ondas.

> **Limpeza feita na 1.8.0.** Quem usou o controle de turno antes de ele ser
> removido tinha ficado com **nome de tripulante e hora de fim de turno**
> guardados no aparelho, sem nenhuma tela que mostrasse ou apagasse. Na
> primeira vez que o app abrir na 1.8.0 esse resto é apagado sozinho. Não é
> preciso fazer nada, e nada mais que você tenha configurado se perde.

## 9. Para quem faz deploy

**Site:** [tuglife-proa.netlify.app](https://tuglife-proa.netlify.app)

O site está vinculado ao repositório **`Jbvix/proa`**, branch **`main`**:
**todo push em `main` publica sozinho**, em cerca de 40 segundos. Não há passo
manual nem upload.

| Item | Valor |
|---|---|
| Production branch | `main` |
| Build | `npm run build` · Node 22 |
| Publicação | `dist/` |
| Functions | `netlify/functions/` |

Deixe build command e publish directory **em branco no painel** — o
`netlify.toml` já declara os dois e tem precedência.

**Voltar atrás:** Deploys → escolher o deploy anterior → *Publish deploy*. Um
clique, e cada deploy traz o commit de origem para você saber ao que está
voltando.

| Variável | Papel |
|---|---|
| `VITE_AUTH_ENABLED=false` | Herdado do template. Desde a 1.3.0 não há mais código de login nem banco no projeto; a variável fica só para o andaime do template. |
| `OPENMETEO_API_KEY` | Assinatura comercial Open-Meteo. Escopos: Functions + Runtime. Secret. |
| `XAI_API_KEY` | Lara (Grok chat, STT e TTS). Functions + Runtime. Secret. |
| `PROA_ALLOWED_ORIGINS` | Opcional. Hosts extras aceitos pelos endpoints, separados por vírgula. Mesma origem e localhost já passam sem configuração. |

Nenhuma das chaves chega ao navegador.

**Comandos de desenvolvimento:**

```bash
npm run dev            # servidor em :8080
npm test               # testes de domínio (202) — tem de ficar verde
npm run test:scaffold  # testes do andaime do template (precisa de .grok/)
npm run test:all       # os dois
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
```

---

*Dúvidas e melhorias: Jossian Brito · TugLife Systems*
