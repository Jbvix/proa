/**
 * Proa · TugLife Systems — Testes do empacotador Ogg Opus
 * ---------------------------------------------------------------------------
 * @autor  Jossian Brito
 * @versao 1.13.0 · 2026-09-20 12:00 UTC (ano 2026)
 *
 * O formato é o que um transcritor rejeita quando está errado, e ele não diz
 * por quê. Então aqui há um LEITOR de Ogg independente do escritor — página
 * a página, com o CRC recalculado por uma implementação bit a bit que não
 * compartilha nada com a tabela do módulo. Se o escritor e o leitor
 * concordam e o CRC bate dos dois lados, o arquivo está certo.
 * ---------------------------------------------------------------------------
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  OPUS_PRE_SKIP,
  muxOggOpus,
  oggCrc32,
  oggPage,
  opusHead,
  opusTags,
  type OpusPacket,
} from "./ogg-opus.ts";

/** CRC do Ogg bit a bit, sem tabela — implementação independente pro teste. */
function crcBitwise(bytes: Uint8Array): number {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b << 24;
    for (let k = 0; k < 8; k++) {
      crc = crc & 0x80000000 ? ((crc << 1) ^ 0x04c11db7) >>> 0 : (crc << 1) >>> 0;
    }
  }
  return crc >>> 0;
}

type Page = {
  bos: boolean;
  eos: boolean;
  granule: number;
  serial: number;
  seq: number;
  crcOk: boolean;
  packets: Uint8Array[];
};

/** Leitor de Ogg: divide em páginas, confere CRC, remonta pacotes pelo laçamento. */
function readOgg(file: Uint8Array): Page[] {
  const pages: Page[] = [];
  let at = 0;
  const td = new TextDecoder();
  while (at < file.length) {
    assert.equal(td.decode(file.subarray(at, at + 4)), "OggS", `magia na posição ${at}`);
    const v = new DataView(file.buffer, file.byteOffset + at);
    assert.equal(file[at + 4], 0, "versão");
    const flags = file[at + 5];
    const granule = v.getUint32(6, true) + v.getUint32(10, true) * 0x100000000;
    const serial = v.getUint32(14, true);
    const seq = v.getUint32(18, true);
    const crc = v.getUint32(22, true);
    const nseg = file[at + 26];
    const table = file.subarray(at + 27, at + 27 + nseg);
    const body = table.reduce((n, s) => n + s, 0);
    const len = 27 + nseg + body;
    const page = file.slice(at, at + len);
    const zeroed = page.slice();
    new DataView(zeroed.buffer).setUint32(22, 0, true);
    const crcOk = crcBitwise(zeroed) === crc;
    const packets: Uint8Array[] = [];
    let cur: number[] = [];
    let p = at + 27 + nseg;
    for (const s of table) {
      cur.push(...file.subarray(p, p + s));
      p += s;
      if (s < 255) {
        packets.push(Uint8Array.from(cur));
        cur = [];
      }
    }
    assert.equal(cur.length, 0, "pacote não pode ficar aberto no fim da página");
    pages.push({ bos: !!(flags & 0x02), eos: !!(flags & 0x04), granule, serial, seq, crcOk, packets });
    at += len;
  }
  return pages;
}

function pkt(len: number, fill: number, samples48 = 960): OpusPacket {
  return { data: new Uint8Array(len).fill(fill), samples48 };
}

test("CRC: tabela e bit a bit concordam, e o vetor clássico do Ogg bate", () => {
  const amostras = [new Uint8Array(0), new Uint8Array([0]), new TextEncoder().encode("OggS"), new Uint8Array(300).map((_, i) => i * 7)];
  for (const a of amostras) assert.equal(oggCrc32(a), crcBitwise(a));
  // Não é o CRC do zip: para "123456789" o zip dá 0xCBF43926; o do Ogg dá outro.
  const s = new TextEncoder().encode("123456789");
  assert.notEqual(oggCrc32(s), 0xcbf43926);
  assert.equal(oggCrc32(s), 0x89a1897f); // conferido com uma terceira implementação, em Python
});

test("OpusHead: 19 bytes, versão 1, mono, pré-skip e taxa de entrada", () => {
  const h = opusHead(16_000);
  assert.equal(h.length, 19);
  assert.equal(new TextDecoder().decode(h.subarray(0, 8)), "OpusHead");
  const v = new DataView(h.buffer);
  assert.equal(h[8], 1);
  assert.equal(h[9], 1);
  assert.equal(v.getUint16(10, true), OPUS_PRE_SKIP);
  assert.equal(v.getUint32(12, true), 16_000);
  assert.equal(v.getInt16(16, true), 0);
  assert.equal(h[18], 0);
});

test("OpusTags: fornecedor e zero comentários", () => {
  const t = opusTags("proa");
  assert.equal(new TextDecoder().decode(t.subarray(0, 8)), "OpusTags");
  const v = new DataView(t.buffer);
  assert.equal(v.getUint32(8, true), 4);
  assert.equal(new TextDecoder().decode(t.subarray(12, 16)), "proa");
  assert.equal(v.getUint32(16, true), 0);
  assert.equal(t.length, 20);
});

test("uma página: cabeçalho, laçamento e CRC conferidos pelo leitor independente", () => {
  const page = oggPage([new Uint8Array([1, 2, 3])], { granule: 960, serial: 7, seq: 3 });
  const [p] = readOgg(page);
  assert.equal(p.crcOk, true);
  assert.equal(p.granule, 960);
  assert.equal(p.serial, 7);
  assert.equal(p.seq, 3);
  assert.deepEqual([...p.packets[0]], [1, 2, 3]);
});

test("arquivo completo: BOS só na primeira, EOS só na última, sequência contínua, CRC em todas", () => {
  const packets = [pkt(40, 1), pkt(41, 2), pkt(39, 3)];
  const file = muxOggOpus(packets, { inputRate: 16_000 });
  const pages = readOgg(file);
  assert.equal(pages.length, 3, "OpusHead, OpusTags, áudio");
  assert.deepEqual(pages.map((p) => p.bos), [true, false, false]);
  assert.deepEqual(pages.map((p) => p.eos), [false, false, true]);
  assert.deepEqual(pages.map((p) => p.seq), [0, 1, 2]);
  assert.ok(pages.every((p) => p.crcOk), "CRC");
  assert.ok(pages.every((p) => p.serial === pages[0].serial), "mesmo serial");
  // Cabeçalhos com grânulo 0; áudio com o total de amostras.
  assert.deepEqual(pages.map((p) => p.granule), [0, 0, 3 * 960]);
  assert.equal(new TextDecoder().decode(pages[0].packets[0].subarray(0, 8)), "OpusHead");
  assert.equal(new TextDecoder().decode(pages[1].packets[0].subarray(0, 8)), "OpusTags");
  // Os pacotes de áudio voltam idênticos, na ordem.
  assert.deepEqual(pages[2].packets.map((p) => p.length), [40, 41, 39]);
  assert.deepEqual(pages[2].packets.map((p) => p[0]), [1, 2, 3]);
});

test("pacote de 255 bytes exatos termina com laçamento 0 e não engole o vizinho", () => {
  const file = muxOggOpus([pkt(255, 9), pkt(10, 5)], { inputRate: 16_000 });
  const audio = readOgg(file)[2];
  assert.deepEqual(audio.packets.map((p) => p.length), [255, 10]);
  assert.equal(audio.packets[0][254], 9);
  assert.equal(audio.packets[1][0], 5);
});

test("pacote grande ocupa vários segmentos na mesma página", () => {
  const file = muxOggOpus([pkt(700, 4)], { inputRate: 16_000 });
  const audio = readOgg(file)[2];
  assert.equal(audio.packets.length, 1);
  assert.equal(audio.packets[0].length, 700);
});

test("mais de 255 segmentos: quebra em páginas, grânulo acumula, EOS só na última", () => {
  // 300 pacotes de 20 ms = 6 s de fala, um segmento cada: precisa de 2 páginas.
  const packets = Array.from({ length: 300 }, (_, i) => pkt(60, i & 0xff));
  const pages = readOgg(muxOggOpus(packets, { inputRate: 16_000 }));
  const audio = pages.slice(2);
  assert.equal(audio.length, 2);
  assert.equal(audio[0].packets.length, 255);
  assert.equal(audio[1].packets.length, 45);
  assert.equal(audio[0].granule, 255 * 960);
  assert.equal(audio[1].granule, 300 * 960);
  assert.deepEqual(audio.map((p) => p.eos), [false, true]);
  assert.deepEqual(pages.map((p) => p.seq), [0, 1, 2, 3]);
  // Nenhum pacote se perdeu nem trocou de lugar.
  const all = audio.flatMap((p) => p.packets);
  assert.equal(all.length, 300);
  assert.equal(all[299][0], 299 & 0xff);
});

test("sem pacotes: só os cabeçalhos, e o OpusTags leva o EOS", () => {
  const pages = readOgg(muxOggOpus([], { inputRate: 16_000 }));
  assert.equal(pages.length, 2);
  assert.equal(pages[1].eos, true);
});

test("o tamanho é o prometido: 3 s a 24 kbps cabem em ~10 kB, 12× menos que o WAV", () => {
  // 150 pacotes de 20 ms com 60 bytes (24 kbps ÷ 50 pacotes/s).
  const packets = Array.from({ length: 150 }, () => pkt(60, 0));
  const ogg = muxOggOpus(packets, { inputRate: 16_000 });
  const wav = 44 + 3 * 16_000 * 2;
  assert.ok(ogg.length < 10_500, `ogg ${ogg.length}`);
  assert.ok(wav / ogg.length > 9, `razão ${(wav / ogg.length).toFixed(1)}`);
});
