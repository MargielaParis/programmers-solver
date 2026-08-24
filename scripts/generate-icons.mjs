import { deflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";

const root = new URL("../chrome-extension/", import.meta.url);
const resourcesRoot = new URL("../resources/", import.meta.url);
const colors = {
  background: [21, 26, 29, 255],
  cyan: [98, 198, 183, 255],
  amber: [215, 168, 91, 255],
};

const chunk = (type, data) => {
  const bytes = Buffer.from(data);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  const crc = Buffer.alloc(4);
  let value = 0xffffffff;
  for (const byte of Buffer.concat([Buffer.from(type), bytes])) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
    }
  }
  crc.writeUInt32BE((value ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, Buffer.from(type), bytes, crc]);
};

const writePng = async (size, fileName) => {
  const pixels = Buffer.alloc(size * size * 4);
  const setPixel = (x, y, color) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const offset = (y * size + x) * 4;
    pixels.set(color, offset);
  };
  const scale = size / 64;
  const fillRoundedRect = (x, y, width, height, radius, color) => {
    for (let py = Math.floor(y * scale); py < Math.ceil((y + height) * scale); py += 1) {
      for (let px = Math.floor(x * scale); px < Math.ceil((x + width) * scale); px += 1) {
        const dx = Math.max(x * scale - px, 0, px - (x + width) * scale);
        const dy = Math.max(y * scale - py, 0, py - (y + height) * scale);
        if (Math.hypot(dx, dy) <= radius * scale) setPixel(px, py, color);
      }
    }
  };
  const line = (x1, y1, x2, y2, width, color) => {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * scale;
    for (let step = 0; step <= steps; step += 1) {
      const progress = steps === 0 ? 0 : step / steps;
      const x = (x1 + (x2 - x1) * progress) * scale;
      const y = (y1 + (y2 - y1) * progress) * scale;
      const radius = Math.max(1, Math.ceil((width * scale) / 2));
      for (let py = -radius; py <= radius; py += 1) {
        for (let px = -radius; px <= radius; px += 1) {
          if (px * px + py * py <= radius * radius) setPixel(Math.round(x) + px, Math.round(y) + py, color);
        }
      }
    }
  };

  fillRoundedRect(0, 0, 64, 64, 11, colors.background);
  line(25, 17, 13, 32, 6, colors.cyan);
  line(13, 32, 25, 47, 6, colors.cyan);
  line(39, 17, 51, 32, 6, colors.cyan);
  line(51, 32, 39, 47, 6, colors.cyan);
  line(29, 32, 35, 32, 4, colors.amber);

  const signature = Buffer.from("\x89PNG\r\n\x1a\n", "binary");
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    rows[y * (size * 4 + 1)] = 0;
    pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const png = Buffer.concat([signature, chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
  await writeFile(new URL(fileName, root), png);
};

await mkdir(root, { recursive: true });
await mkdir(resourcesRoot, { recursive: true });
for (const size of [16, 48, 128]) {
  await writePng(size, `icon${size}.png`);
}
await writePng(128, new URL("programmers-solver.png", resourcesRoot));
