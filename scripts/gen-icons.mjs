// Generates minimal valid PNG icons for PWA manifest
import { createDeflate } from "zlib";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

function crc32(buf) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput));
  return Buffer.concat([len, typeBytes, data, crcBuf]);
}

async function generatePNG(size, outPath) {
  // Background: #0a0a0a (near black), accent: #f97316 (orange)
  const bg = [0x0a, 0x0a, 0x0a];
  const accent = [0xf9, 0x73, 0x16];

  // Build raw RGBA scanlines
  const scanlines = [];
  for (let y = 0; y < size; y++) {
    const row = [0]; // filter byte = None
    for (let x = 0; x < size; x++) {
      // Draw a simple "C" shape using geometry
      const cx = size / 2, cy = size / 2;
      const outerR = size * 0.38, innerR = size * 0.24;
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const inRing = dist >= innerR && dist <= outerR;
      // Cut right side of ring to form "C"
      const angle = Math.atan2(dy, dx); // -PI to PI
      const cut = Math.abs(angle) < Math.PI * 0.25; // ~45deg gap on right
      const isC = inRing && !cut;
      const color = isC ? accent : bg;
      row.push(...color, 255);
    }
    scanlines.push(Buffer.from(row));
  }

  const rawData = Buffer.concat(scanlines);

  // Deflate the raw pixel data
  const compressed = await new Promise((resolve, reject) => {
    const chunks = [];
    const deflate = createDeflate({ level: 9 });
    deflate.on("data", (c) => chunks.push(c));
    deflate.on("end", () => resolve(Buffer.concat(chunks)));
    deflate.on("error", reject);
    deflate.write(rawData);
    deflate.end();
  });

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 2;  // color type: RGB — wait, we have RGBA so use 6
  ihdrData[9] = 6;  // RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const png = Buffer.concat([
    sig,
    chunk("IHDR", ihdrData),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);

  await new Promise((resolve, reject) => {
    const ws = createWriteStream(outPath);
    ws.on("finish", resolve);
    ws.on("error", reject);
    ws.write(png);
    ws.end();
  });

  console.log(`Generated ${outPath} (${size}x${size})`);
}

await generatePNG(192, "public/icon-192.png");
await generatePNG(512, "public/icon-512.png");
