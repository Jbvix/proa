/**
 * Proa · TugLife Systems — Guarda dos endpoints públicos
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.2.0  (módulo novo nesta versão)
 * @data     2026-09-20 02:14 UTC  (ano 2026)
 *
 * POR QUE ISTO EXISTE
 * `/api/meteo` e `/api/voice` são abertos: sem conta, sem token, sem sessão —
 * e é assim de propósito, porque o Proa não tem login e a tripulação não vai
 * digitar senha com o navio jogando. Só que os dois fazem proxy para serviços
 * PAGOS (Open-Meteo comercial e xAI Grok: chat, transcrição e fala). Quem
 * descobrir a URL pode rodar um laço e queimar a cota. Não é vazamento de
 * dado — é vazamento de fatura.
 *
 * O QUE ESTA GUARDA FAZ, E O QUE ELA NÃO FAZ
 *  - Limite de taxa por IP: é o controle que realmente segura o laço.
 *  - Allowlist de origem: defesa em profundidade. Note que a ausência de
 *    cabeçalhos CORS já impede o navegador de ler a resposta de outra origem;
 *    esta checagem existe para deixar a intenção explícita e barrar o embute
 *    ingênuo, não porque o navegador dependa dela.
 *  - NÃO substitui autenticação, e NÃO para um atacante distribuído.
 *
 * LIMITAÇÃO HONESTA DA CONTAGEM
 * O estado vive na memória da instância quente da função. Em serverless isso
 * significa: o limite vale por instância, não globalmente. Um laço vindo de um
 * cliente cai quase sempre na mesma instância quente e é barrado; uma botnet
 * espalhada por muitas instâncias, não. É um quebra-molas, não um cofre. Um
 * limite global de verdade exige armazenamento compartilhado (Netlify Blobs,
 * Redis) — está registrado como trabalho futuro no GDD.
 * ---------------------------------------------------------------------------
 */

export type RateRule = {
  /** Quantas passagens são permitidas dentro da janela. */
  limit: number;
  /** Tamanho da janela deslizante, em milissegundos. */
  windowMs: number;
};

export type RateState = Map<string, number[]>;

export type RateVerdict = { ok: true } | { ok: false; retryAfterS: number };

/**
 * Teto de chaves guardadas por balde. Passou disso, as mais antigas saem.
 * Sem esse teto, uma instância quente por horas viraria um mapa sem fundo.
 */
const MAX_KEYS = 5000;

/* ---------------------------------------------------------------------- */
/* Regras por endpoint                                                     */
/* ---------------------------------------------------------------------- */

/**
 * Meteorologia. O app só busca quando a posição muda de célula (1/8 de grau)
 * ou quando a derrota troca — na prática, um punhado de chamadas por hora.
 * 60/min é folga larga para o uso legítimo e corta o laço.
 */
export const METEO_RULES: RateRule[] = [
  { limit: 60, windowMs: 60_000 },
  { limit: 600, windowMs: 3_600_000 },
];

/**
 * Voz. Cada turno de conversa custa duas chamadas (transcrição, depois
 * chat + fala), e a fala é a parte cara. Uma conversa animada faz uns 6 turnos
 * por minuto, ou seja 12 chamadas; 40/min deixa margem de sobra. O teto
 * horário é o que limita o estrago de um laço que respeite o teto por minuto.
 */
export const VOICE_RULES: RateRule[] = [
  { limit: 40, windowMs: 60_000 },
  { limit: 400, windowMs: 3_600_000 },
];

/* ---------------------------------------------------------------------- */
/* Identificação do cliente                                                */
/* ---------------------------------------------------------------------- */

/**
 * De quem veio o pedido.
 *
 * Ordem de confiança: a Netlify põe o IP real em `x-nf-client-connection-ip`,
 * que o cliente não consegue forjar porque a plataforma reescreve. Só depois
 * disso se olha `x-forwarded-for`, e apenas a PRIMEIRA entrada — as demais são
 * o que a cadeia de proxies acrescentou e podem ser inventadas.
 *
 * Sem nenhum dos dois, todo mundo cai na mesma chave `desconhecido`. É
 * conservador de propósito: prefere limitar demais a não limitar nada.
 */
export function clientKey(headers: Headers): string {
  const direto = headers.get("x-nf-client-connection-ip");
  if (direto?.trim()) return direto.trim();
  const encaminhado = headers.get("x-forwarded-for");
  if (encaminhado) {
    const primeiro = encaminhado.split(",")[0]?.trim();
    if (primeiro) return primeiro;
  }
  const real = headers.get("x-real-ip");
  if (real?.trim()) return real.trim();
  return "desconhecido";
}

/* ---------------------------------------------------------------------- */
/* Origem                                                                  */
/* ---------------------------------------------------------------------- */

/**
 * A origem do pedido é aceitável?
 *
 * Comportamento conforme as variáveis:
 *   origem ausente        → true. Navegador não manda `Origin` em GET de
 *                           mesma origem, e cliente não-browser também não.
 *                           Barrar aqui quebraria o uso legítimo sem impedir
 *                           abuso nenhum — quem ataca simplesmente omite.
 *   origem == host        → true. Mesma origem: é o próprio app, em produção,
 *                           em deploy preview ou no sandbox de preview.
 *   localhost / 127.0.0.1 → true. Desenvolvimento.
 *   consta em `extras`    → true. Escape configurável por ambiente.
 *   qualquer outra        → false.
 */
export function isAllowedOrigin(
  origem: string | null,
  host: string,
  extras: string[] = [],
): boolean {
  if (!origem) return true;
  let url: URL;
  try {
    url = new URL(origem);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;

  const alvo = url.host.toLowerCase();
  if (host && alvo === host.toLowerCase()) return true;

  const nome = url.hostname.toLowerCase();
  if (nome === "localhost" || nome === "127.0.0.1" || nome === "[::1]") return true;

  for (const extra of extras) {
    const limpo = extra.trim().toLowerCase();
    if (!limpo) continue;
    if (alvo === limpo || nome === limpo) return true;
  }
  return false;
}

/** Lê `PROA_ALLOWED_ORIGINS` — hosts extras separados por vírgula. */
export function parseAllowedOrigins(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
}

/* ---------------------------------------------------------------------- */
/* Limite de taxa                                                          */
/* ---------------------------------------------------------------------- */

export function createRateState(): RateState {
  return new Map();
}

/**
 * Janela deslizante, com várias regras aplicadas ao mesmo tempo.
 *
 * Um pedido barrado NÃO é registrado. É de propósito: se cada tentativa
 * bloqueada empurrasse a janela para a frente, quem batesse no teto ficaria
 * preso para sempre, e a tripulação pagaria por um script de terceiro.
 *
 * @param state  balde de contagem (um por endpoint)
 * @param key    identificação do cliente, normalmente o IP
 * @param rules  regras a satisfazer — todas, simultaneamente
 * @param now    relógio, injetável para teste
 */
export function rateLimit(
  state: RateState,
  key: string,
  rules: RateRule[],
  now: number = Date.now(),
): RateVerdict {
  if (rules.length === 0) return { ok: true };
  const maiorJanela = Math.max(...rules.map((r) => r.windowMs));
  const batidas = (state.get(key) ?? []).filter((t) => now - t < maiorJanela);

  for (const regra of rules) {
    const dentro = batidas.filter((t) => now - t < regra.windowMs);
    if (dentro.length >= regra.limit) {
      state.set(key, batidas);
      const maisAntiga = dentro[0]!;
      const faltaMs = regra.windowMs - (now - maisAntiga);
      return { ok: false, retryAfterS: Math.max(1, Math.ceil(faltaMs / 1000)) };
    }
  }

  batidas.push(now);
  state.set(key, batidas);
  if (state.size > MAX_KEYS) podar(state, now, maiorJanela);
  return { ok: true };
}

/** Descarta quem não aparece desde a última janela inteira. */
function podar(state: RateState, now: number, janelaMs: number) {
  for (const [key, batidas] of state) {
    const ultima = batidas[batidas.length - 1];
    if (ultima == null || now - ultima >= janelaMs) state.delete(key);
  }
}

/** Balde compartilhado entre a rota Nitro e a function Netlify do mesmo host. */
export function sharedRateState(bucket: string): RateState {
  const g = globalThis as { __proaRate?: Record<string, RateState> };
  if (!g.__proaRate) g.__proaRate = {};
  const baldes = g.__proaRate;
  if (!baldes[bucket]) baldes[bucket] = createRateState();
  return baldes[bucket]!;
}

/* ---------------------------------------------------------------------- */
/* Porteiro                                                                */
/* ---------------------------------------------------------------------- */

export type GuardOptions = {
  /** Nome do balde de contagem — um por endpoint. */
  bucket: string;
  /** Regras de taxa a aplicar. */
  rules: RateRule[];
  /** Hosts extras aceitos além da mesma origem e do localhost. */
  extraOrigins?: string[];
  /** Relógio, injetável para teste. */
  now?: number;
};

/**
 * Passa o pedido pela portaria.
 *
 * @returns `null` quando pode seguir, ou a `Response` de recusa já pronta.
 */
export function guardRequest(req: Request, opts: GuardOptions): Response | null {
  const headers = req.headers;
  const host =
    headers.get("x-forwarded-host") ?? headers.get("host") ?? new URL(req.url).host;

  if (!isAllowedOrigin(headers.get("origin"), host, opts.extraOrigins ?? [])) {
    return Response.json(
      { ok: false, error: "Origem não autorizada." },
      { status: 403 },
    );
  }

  const veredito = rateLimit(
    sharedRateState(opts.bucket),
    clientKey(headers),
    opts.rules,
    opts.now,
  );
  if (!veredito.ok) {
    return Response.json(
      {
        ok: false,
        error: "Muitos pedidos deste aparelho. Aguarde um instante.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(veredito.retryAfterS) },
      },
    );
  }
  return null;
}
