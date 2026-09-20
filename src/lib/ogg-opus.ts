/**
 * Proa · TugLife Systems — Empacotador Ogg Opus (RFC 7845 / RFC 3533)
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.13.0  (módulo novo nesta versão)
 * @data     2026-09-20 12:00 UTC  (ano 2026)
 *
 * POR QUE ISTO EXISTE (P11, item 11.4)
 * Até a 1.12.0 o clipe de voz subia como WAV PCM16 em base64: 42 kB por
 * segundo de fala. Três segundos, 125 kB — pra dizer "qual o vento". Em 4G
 * costeiro ou banda-larga de bordo, isso sozinho custava de 1 a 5 s por
 * pergunta. É o casco sujo de cracas: a mesma máquina, muito mais arrasto.
 *
 * Opus a 24 kbps são 3 kB por segundo. O codificador o Chrome já tem
 * (`AudioEncoder`, WebCodecs) — mas ele devolve PACOTES soltos, e o
 * transcritor quer um ARQUIVO. Este módulo é o que falta entre os dois: põe
 * os pacotes num contêiner Ogg, com os dois cabeçalhos que o Opus exige
 * (`OpusHead` e `OpusTags`), o CRC de cada página e a posição de grânulo que
 * diz ao leitor quanto áudio já passou.
 *
 * É PURO DE PROPÓSITO. Entram bytes e contagens, saem bytes. Nada de DOM, nada
 * de WebCodecs: quem fala com o codificador é `voice-opus.ts`. Assim o
 * formato — que é o que um transcritor rejeita quando está errado — fica
 * coberto por teste em Node, com um leitor de Ogg independente conferindo
 * página a página.
 *
 * O FORMATO, EM UMA TELA
 *   Página Ogg  = "OggS" · versão 0 · flags (BOS 0x02, EOS 0x04) ·
 *                 grânulo int64 LE · serial u32 · sequência u32 · CRC u32 ·
 *                 nº de segmentos u8 · tabela de laçamento · dados
 *   Laçamento   = cada pacote vira ⌊L/255⌋ bytes 255 seguidos de L mod 255;
 *                 um pacote de 255·k bytes exatos termina com um 0.
 *   Página 0    = só OpusHead, BOS, grânulo 0
 *   Página 1    = só OpusTags, grânulo 0
 *   Páginas 2…  = pacotes de áudio; grânulo = amostras a 48 kHz acumuladas
 *                 até o fim do último pacote da página (RFC 7845 §4, sempre
 *                 48 kHz, qualquer que seja a taxa de entrada)
 *   CRC         = polinômio 0x04C11DB7, sem reflexão, início 0, sem XOR
 *                 final, calculado com o campo CRC zerado
 * ---------------------------------------------------------------------------
 */

/** Um pacote Opus e quanto áudio ele carrega, em amostras a 48 kHz. */
export type OpusPacket = {
  data: Uint8Array;
  samples48: number;
};

export type OggOpusOptions = {
  /** Taxa de amostragem do áudio que entrou no codificador (informativa no OpusHead). */
  inputRate: number;
  /**
   * Amostras (a 48 kHz) que o decodificador descarta no início — a latência
   * do codificador. O libopus do Chrome usa 312 (6,5 ms). Errar isto em
   * alguns ms não muda uma transcrição; deixar de escrever muda tudo.
   */
  preSkip?: number;
  /** Serial do fluxo; qualquer u32 serve, é só pra distinguir fluxos num mesmo arquivo. */
  serial?: number;
  /** Texto de fornecedor do OpusTags; informativo. */
  vendor?: string;
};

/** Pré-skip padrão do libopus a 48 kHz. */
export const OPUS_PRE_SKIP = 312;

/* ----------------------------------------------------------------------- */
/* CRC de página Ogg                                                        */
/* ----------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let k = 0; k < 8; k++) r = r & 0x80000000 ? ((r << 1) ^ 0x04c11db7) >>> 0 : (r << 1) >>> 0;
    t[i] = r >>> 0;
  }
  return t;
})();

/**
 * CRC-32 do Ogg: polinômio 0x04C11DB7, direto (sem reflexão), valor inicial
 * 0, sem XOR final. NÃO é o CRC-32 do zip — usar o do zip é o erro clássico
 * que faz todo leitor de Ogg rejeitar a página como corrompida.
 */
export function oggCrc32(bytes: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < bytes.length; i++) {
    crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ bytes[i]) & 0xff]) >>> 0;
  }
  return crc >>> 0;
}

/* ----------------------------------------------------------------------- */
/* Cabeçalhos Opus                                                          */
/* ----------------------------------------------------------------------- */

const ASCII = new TextEncoder();

/** OpusHead (RFC 7845 §5.1): 19 bytes, mono, mapeamento 0. */
export function opusHead(inputRate: number, preSkip = OPUS_PRE_SKIP): Uint8Array {
  const b = new Uint8Array(19);
  const v = new DataView(b.buffer);
  b.set(ASCII.encode("OpusHead"), 0);
  b[8] = 1; // versão
  b[9] = 1; // canais
  v.setUint16(10, preSkip, true);
  v.setUint32(12, inputRate >>> 0, true);
  v.setInt16(16, 0, true); // ganho de saída, dB Q7.8
  b[18] = 0; // família de mapeamento 0 = mono/estéreo simples
  return b;
}

/** OpusTags (RFC 7845 §5.2): fornecedor e zero comentários. */
export function opusTags(vendor = "proa"): Uint8Array {
  const vend = ASCII.encode(vendor);
  const b = new Uint8Array(8 + 4 + vend.length + 4);
  const v = new DataView(b.buffer);
  b.set(ASCII.encode("OpusTags"), 0);
  v.setUint32(8, vend.length, true);
  b.set(vend, 12);
  v.setUint32(12 + vend.length, 0, true); // nº de comentários
  return b;
}

/* ----------------------------------------------------------------------- */
/* Páginas                                                                  */
/* ----------------------------------------------------------------------- */

/** Tabela de laçamento de um pacote de `len` bytes. */
function lacing(len: number): number[] {
  const out: number[] = [];
  let rest = len;
  while (rest >= 255) {
    out.push(255);
    rest -= 255;
  }
  out.push(rest); // 0 quando len é múltiplo exato de 255: é o terminador
  return out;
}

/** Máximo de segmentos por página (o campo é um byte). */
const MAX_SEGMENTS = 255;

/**
 * Uma página Ogg pronta, com CRC. `packets` já vêm agrupados de modo que a
 * tabela de laçamento caiba em 255 segmentos — quem agrupa é `muxOggOpus`.
 */
export function oggPage(
  packets: readonly Uint8Array[],
  opts: { granule: number; serial: number; seq: number; bos?: boolean; eos?: boolean },
): Uint8Array {
  const table = packets.flatMap((p) => lacing(p.length));
  if (table.length > MAX_SEGMENTS) throw new Error(`página com ${table.length} segmentos`);
  const body = packets.reduce((n, p) => n + p.length, 0);
  const page = new Uint8Array(27 + table.length + body);
  const v = new DataView(page.buffer);
  page.set(ASCII.encode("OggS"), 0);
  page[4] = 0;
  page[5] = (opts.bos ? 0x02 : 0) | (opts.eos ? 0x04 : 0);
  // Grânulo int64 LE. Um clipe de passadiço tem no máximo 10 s = 480 000
  // amostras a 48 kHz, longe de 2^32; ainda assim escreve-se as duas metades.
  v.setUint32(6, opts.granule >>> 0, true);
  v.setUint32(10, Math.floor(opts.granule / 0x100000000) >>> 0, true);
  v.setUint32(14, opts.serial >>> 0, true);
  v.setUint32(18, opts.seq >>> 0, true);
  v.setUint32(22, 0, true); // CRC, preenchido abaixo
  page[26] = table.length;
  page.set(table, 27);
  let at = 27 + table.length;
  for (const p of packets) {
    page.set(p, at);
    at += p.length;
  }
  v.setUint32(22, oggCrc32(page), true);
  return page;
}

/**
 * O arquivo Ogg Opus inteiro a partir dos pacotes do codificador.
 *
 * Comportamento conforme as variáveis:
 *   `packets` vazio       → só as duas páginas de cabeçalho; a segunda leva EOS
 *   pacotes pequenos      → vários por página, até 255 segmentos por página
 *   pacote ≥ 255 bytes    → ocupa vários segmentos (laçamento), mesma página
 *   última página         → flag EOS; grânulo = total de amostras
 *
 * Um pacote nunca é dividido entre páginas: não é preciso (o maior pacote
 * Opus a 24 kbps tem ~100 bytes) e evitaria o caso mais chato do formato.
 */
export function muxOggOpus(packets: readonly OpusPacket[], opts: OggOpusOptions): Uint8Array {
  const serial = opts.serial ?? 0x50524f41; // "PROA"
  const preSkip = opts.preSkip ?? OPUS_PRE_SKIP;
  const pages: Uint8Array[] = [];
  let seq = 0;

  pages.push(oggPage([opusHead(opts.inputRate, preSkip)], { granule: 0, serial, seq: seq++, bos: true }));
  pages.push(
    oggPage([opusTags(opts.vendor)], { granule: 0, serial, seq: seq++, eos: packets.length === 0 }),
  );

  let granule = 0;
  let group: Uint8Array[] = [];
  let segs = 0;
  let i = 0;
  while (i < packets.length) {
    const p = packets[i];
    const need = lacing(p.data.length).length;
    if (group.length && segs + need > MAX_SEGMENTS) {
      pages.push(oggPage(group, { granule, serial, seq: seq++ }));
      group = [];
      segs = 0;
      continue;
    }
    group.push(p.data);
    segs += need;
    granule += p.samples48;
    i++;
  }
  if (group.length) pages.push(oggPage(group, { granule, serial, seq: seq++, eos: true }));

  const total = pages.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of pages) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
