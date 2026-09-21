// Generador de íconos PNG para el manifest PWA, sin dependencias externas.
// Dibuja un fondo oscuro con una grilla 3x3 de "stickers" con los colores WCA.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BG = [0x11, 0x13, 0x18];
const COLORS = [
  [0xc4, 0x1e, 0x3a], // R rojo
  [0xff, 0xff, 0xff], // U blanco
  [0x00, 0x9e, 0x60], // F verde
  [0xff, 0x58, 0x00], // L naranja
  [0xff, 0xd5, 0x00], // D amarillo
  [0x00, 0x51, 0xba], // B azul
  [0x00, 0x9e, 0x60], // F verde
  [0xc4, 0x1e, 0x3a], // R rojo
  [0xff, 0xff, 0xff], // U blanco
];

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      t[n] = c;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function buildIcon(size) {
  const px = new Uint8Array(size * size * 4);

  const setPixel = (x, y, [r, g, b], a = 255) => {
    const i = (y * size + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  };

  // Fondo
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) setPixel(x, y, BG);
  }

  // Grilla 3x3 centrada, ocupando ~72% del ícono, con gap entre stickers
  const gridSize = Math.round(size * 0.72);
  const gap = Math.max(2, Math.round(size * 0.018));
  const cell = Math.round((gridSize - gap * 2) / 3);
  const gridTotal = cell * 3 + gap * 2;
  const offset = Math.round((size - gridTotal) / 2);
  const radius = Math.round(cell * 0.18);

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const color = COLORS[row * 3 + col];
      const x0 = offset + col * (cell + gap);
      const y0 = offset + row * (cell + gap);
      for (let y = 0; y < cell; y++) {
        for (let x = 0; x < cell; x++) {
          // esquinas redondeadas simples
          const cx = x < radius ? radius - x : (x >= cell - radius ? x - (cell - radius - 1) : 0);
          const cy = y < radius ? radius - y : (y >= cell - radius ? y - (cell - radius - 1) : 0);
          if (cx > 0 && cy > 0 && cx * cx + cy * cy > radius * radius) continue;
          setPixel(x0 + x, y0 + y, color);
        }
      }
    }
  }

  // Filas con filtro 0 (None) por scanline
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(px.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  const idat = zlib.deflateSync(raw, { level: 9 });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const png = Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return png;
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });

for (const size of [192, 512]) {
  const png = buildIcon(size);
  const file = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(file, png);
  console.log('Generado', file, png.length, 'bytes');
}
