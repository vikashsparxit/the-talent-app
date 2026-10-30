// Maskable PWA icons, derived at build time from public/android-chrome-512x512.png
// so a rebranded instance only has to replace that one file.
//
// A maskable icon is cropped to a circle or squircle by the launcher, so the
// artwork must sit inside the central safe zone (a circle of 40% radius). The
// source icon is scaled into that zone over a full-bleed background sampled
// from the source's own background colour.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import type { Plugin } from 'vite';

export const MASKABLE_ICON_SIZES = [192, 512] as const;
export const maskableIconFile = (size: number): string => `maskable-icon-${size}x${size}.png`;

interface Image {
  width: number;
  height: number;
  /** RGBA, 8 bits per channel. */
  pixels: Uint8Array;
}

export function decodePng(buf: Buffer): Image {
  let p = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette: Buffer | null = null;
  let transparency: Buffer | null = null;
  const idat: Buffer[] = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') transparency = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[colorType];
  if (depth !== 8 || interlace !== 0 || !channels) {
    throw new Error(`Unsupported PNG (bit depth ${depth}, colour type ${colorType}, interlace ${interlace})`);
  }

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? px[y * stride + x - channels] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? px[(y - 1) * stride + x - channels] : 0;
      let v = raw[line + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - b);
        const pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + x] = v & 255;
    }
  }

  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    if (colorType === 6) pixels.set(px.subarray(o, o + 4), o);
    else if (colorType === 2) pixels.set([px[i * 3], px[i * 3 + 1], px[i * 3 + 2], 255], o);
    else if (colorType === 0) pixels.set([px[i], px[i], px[i], 255], o);
    else if (colorType === 4) pixels.set([px[i * 2], px[i * 2], px[i * 2], px[i * 2 + 1]], o);
    else {
      const k = px[i];
      const alpha = transparency && k < transparency.length ? transparency[k] : 255;
      pixels.set([palette![k * 3], palette![k * 3 + 1], palette![k * 3 + 2], alpha], o);
    }
  }
  return { width, height, pixels };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export function encodePng({ width, height, pixels }: Image): Buffer {
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Render a size×size opaque maskable icon. `scale` is the share of the canvas
 * the source icon occupies; 0.78 keeps the corners of typical artwork inside
 * the safe-zone circle.
 */
export function renderMaskableIcon(source: Buffer, size: number, scale = 0.78): Buffer {
  const img = decodePng(source);
  // Background: a pixel in the source's background, left of centre.
  const bi = (Math.round(img.height / 2) * img.width + Math.round(img.width * 0.04)) * 4;
  const bg = [img.pixels[bi], img.pixels[bi + 1], img.pixels[bi + 2]];

  const inner = size * scale;
  const offset = (size - inner) / 2;
  const step = img.width / inner;
  const samples = Math.max(2, Math.ceil(step * 2));
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const u = Math.floor((x + (sx + 0.5) / samples - offset) * step);
          const v = Math.floor((y + (sy + 0.5) / samples - offset) * step);
          if (u < 0 || v < 0 || u >= img.width || v >= img.height) continue;
          const i = (v * img.width + u) * 4;
          const alpha = img.pixels[i + 3] / 255;
          r += img.pixels[i] * alpha;
          g += img.pixels[i + 1] * alpha;
          b += img.pixels[i + 2] * alpha;
          a += alpha;
        }
      }
      const n = samples * samples;
      const cover = a / n;
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / n + bg[0] * (1 - cover));
      out[o + 1] = Math.round(g / n + bg[1] * (1 - cover));
      out[o + 2] = Math.round(b / n + bg[2] * (1 - cover));
      out[o + 3] = 255;
    }
  }
  return encodePng({ width: size, height: size, pixels: out });
}

/** Emits maskable-icon-192x192.png and maskable-icon-512x512.png into the build. */
export function maskableIconsPlugin(sourcePath: string): Plugin {
  return {
    name: 'tta-maskable-icons',
    apply: 'build',
    generateBundle() {
      const source = readFileSync(path.resolve(sourcePath));
      for (const size of MASKABLE_ICON_SIZES) {
        this.emitFile({ type: 'asset', fileName: maskableIconFile(size), source: renderMaskableIcon(source, size) });
      }
    },
  };
}
