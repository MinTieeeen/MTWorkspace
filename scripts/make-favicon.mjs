// Sinh favicon.ico (16/32/48) và public/brand/icon-512.png từ hình học logo.
// Tự rasterize (supersampling) nên không cần thư viện ảnh. Chạy: node scripts/make-favicon.mjs
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const BG = [0x0b, 0x86, 0xc8];
const WHITE = [255, 255, 255];
const ACCENT = [0xfb, 0xbf, 0x24];
const STROKE = 3;
// Đường nét logo trong hệ 40x40 (khớp src/lib/brand.ts)
const SEGMENTS = [
  [[6, 27], [6, 13]],
  [[6, 13], [13, 22]],
  [[13, 22], [20, 13]],
  [[20, 13], [26.5, 13]],
  [[26.5, 13], [26.5, 27]],
  [[26.5, 13], [33.5, 13]],
];
const DOT = { x: 26.5, y: 27 };
const CORNER = 10; // bo góc 10/40

function distToSegment(px, py, [[ax, ay], [bx, by]]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function insideRounded(x, y, r) {
  const cx = Math.min(Math.max(x, r), 40 - r);
  const cy = Math.min(Math.max(y, r), 40 - r);
  return Math.hypot(x - cx, y - cy) <= r;
}

// Trả về [r,g,b,a] của điểm (x,y) trong hệ 40x40
function sample(x, y, rounded) {
  if (rounded && !insideRounded(x, y, CORNER)) return [0, 0, 0, 0];
  let c = BG;
  if (SEGMENTS.some((s) => distToSegment(x, y, s) <= STROKE / 2)) c = WHITE;
  const d = Math.hypot(x - DOT.x, y - DOT.y);
  if (d <= 4.5) c = d <= 2.5 ? ACCENT : BG;
  return [...c, 255];
}

function render(px, rounded) {
  const SS = 4;
  const buf = Buffer.alloc(px * px * 4);
  for (let j = 0; j < px; j++) {
    for (let i = 0; i < px; i++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sj = 0; sj < SS; sj++) {
        for (let si = 0; si < SS; si++) {
          const x = ((i + (si + 0.5) / SS) / px) * 40;
          const y = ((j + (sj + 0.5) / SS) / px) * 40;
          const [sr, sg, sb, sa] = sample(x, y, rounded);
          r += sr * sa; g += sg * sa; b += sb * sa; a += sa;
        }
      }
      const o = (j * px + i) * 4;
      if (a > 0) {
        buf[o] = Math.round(r / a);
        buf[o + 1] = Math.round(g / a);
        buf[o + 2] = Math.round(b / a);
      }
      buf[o + 3] = Math.round(a / (SS * SS));
    }
  }
  return buf;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(px, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(px, 0);
  ihdr.writeUInt32BE(px, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((px * 4 + 1) * px);
  for (let j = 0; j < px; j++) {
    raw[j * (px * 4 + 1)] = 0;
    rgba.copy(raw, j * (px * 4 + 1) + 1, j * px * 4, (j + 1) * px * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = 6 + entries.length * 16;
  const dirs = entries.map(({ size, data }) => {
    const d = Buffer.alloc(16);
    d[0] = size >= 256 ? 0 : size;
    d[1] = size >= 256 ? 0 : size;
    d.writeUInt16LE(1, 4);
    d.writeUInt16LE(32, 6);
    d.writeUInt32LE(data.length, 8);
    d.writeUInt32LE(offset, 12);
    offset += data.length;
    return d;
  });
  return Buffer.concat([header, ...dirs, ...entries.map((e) => e.data)]);
}

const ico = [16, 32, 48].map((size) => ({ size, data: encodePng(size, render(size, true)) }));
writeFileSync("src/app/favicon.ico", buildIco(ico));
writeFileSync("public/brand/icon-512.png", encodePng(512, render(512, true)));
writeFileSync("public/brand/icon-180.png", encodePng(180, render(180, false)));
console.log("OK: src/app/favicon.ico, public/brand/icon-512.png, public/brand/icon-180.png");
