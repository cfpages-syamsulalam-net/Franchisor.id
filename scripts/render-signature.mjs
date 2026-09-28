#!/usr/bin/env node
/**
 * Read and render a stored signature.
 *
 * `account_erasure_consents.signature_payload` holds a gesture, not a picture, which is what keeps each record
 * under a kilobyte. The cost of that choice is that the evidence has to be *rendered to be looked at*, so this
 * file is part of the feature rather than a convenience: without it a consent row is unreadable, and unreadable
 * evidence proves nothing.
 *
 *   node scripts/render-signature.mjs --row consent.json --out signature.png
 *   node scripts/render-signature.mjs --payload "<base64>" --out signature.png
 *
 * The format is versioned (`path/v1`) and the schema only accepts known formats, so a client that changes the
 * encoding without a matching schema change fails loudly instead of writing a row nothing can read.
 */
import { readFileSync, writeFileSync } from "node:fs";
import zlib from "node:zlib";

/**
 * `path/v1`: width, height, then each point as a signed 16-bit delta from the previous one.
 * Mirrors the browser encoder in `js/settings-delete-account.js`.
 */
export function encodePath(points, width, height, options = {}) {
  const maxPoints = options.maxPoints || 512;
  const clamped = points.slice(0, maxPoints);
  const buffer = Buffer.alloc(4 + clamped.length * 4);
  buffer.writeInt16LE(width, 0);
  buffer.writeInt16LE(height, 2);

  let offset = 4;
  let previousX = 0;
  let previousY = 0;
  for (const [x, y] of clamped) {
    const dx = Math.max(-32768, Math.min(32767, x - previousX));
    const dy = Math.max(-32768, Math.min(32767, y - previousY));
    buffer.writeInt16LE(dx, offset);
    buffer.writeInt16LE(dy, offset + 2);
    offset += 4;
    previousX += dx;
    previousY += dy;
  }

  return buffer.toString("base64");
}

/** Returns `{ width, height, points }`, or throws with a reason that says what is wrong with the payload. */
export function decodePath(payload, options = {}) {
  const maxDimension = options.maxDimension || 2000;
  const maxPoints = options.maxPoints || 512;
  const buffer = Buffer.from(String(payload || ""), "base64");
  if (buffer.length < 4 || (buffer.length - 4) % 4 !== 0) {
    throw new Error("path/v1 payload is not a whole number of points");
  }

  const width = buffer.readInt16LE(0);
  const height = buffer.readInt16LE(2);
  // Bounded before anything allocates: the rasteriser below reserves width × height × 4 bytes, so unbounded
  // geometry is a memory-exhaustion input. The same bound lives in the server schema; the two must agree.
  if (width <= 0 || height <= 0 || width > maxDimension || height > maxDimension) {
    throw new Error("path/v1 payload has no usable canvas size");
  }

  const points = [];
  let x = 0;
  let y = 0;
  for (let offset = 4; offset < buffer.length; offset += 4) {
    x += buffer.readInt16LE(offset);
    y += buffer.readInt16LE(offset + 2);
    points.push([x, y]);
    if (points.length > maxPoints) throw new Error("path/v1 payload holds more points than the schema allows");
  }

  return { width, height, points };
}

/** Rasterises the gesture. Deliberately simple and dependency-free: this is a reader, not a renderer. */
export function renderPointsToRgba(width, height, points, options = {}) {
  const thickness = options.thickness || 2;
  const rgba = Buffer.alloc(width * height * 4, 0xff);

  const stamp = (cx, cy) => {
    for (let oy = -thickness; oy <= thickness; oy += 1) {
      for (let ox = -thickness; ox <= thickness; ox += 1) {
        if (ox * ox + oy * oy > thickness * thickness + 1) continue;
        const px = cx + ox;
        const py = cy + oy;
        if (px < 0 || py < 0 || px >= width || py >= height) continue;
        const index = (py * width + px) * 4;
        rgba[index] = 0x11;
        rgba[index + 1] = 0x11;
        rgba[index + 2] = 0x11;
        rgba[index + 3] = 0xff;
      }
    }
  };

  for (let index = 0; index < points.length; index += 1) {
    const [x, y] = points[index];
    if (index === 0) {
      stamp(x, y);
      continue;
    }
    // Bresenham, so a sparsely sampled signature still renders as a continuous stroke.
    let [x0, y0] = points[index - 1];
    const [x1, y1] = [x, y];
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let error = dx - dy;
    for (;;) {
      stamp(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const doubled = 2 * error;
      if (doubled > -dy) {
        error -= dy;
        x0 += sx;
      }
      if (doubled < dx) {
        error += dx;
        y0 += sy;
      }
    }
  }

  return rgba;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    crc ^= buffer[index];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

/** 8-bit RGBA PNG. Raw scanlines with filter type 0; no interlacing. */
export function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export function renderSignature(row) {
  const format = row?.signature_format || "path/v1";
  if (format !== "path/v1") {
    throw new Error(`signature_format "${format}" is not a path; read it as ${format} bytes instead`);
  }
  const { width, height, points } = decodePath(row.signature_payload);
  return encodePng(width, height, renderPointsToRgba(width, height, points));
}

function parseArgs(argv) {
  const args = { row: "", payload: "", out: "signature.png" };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--row") args.row = argv[++index] || "";
    else if (value === "--payload") args.payload = argv[++index] || "";
    else if (value === "--out") args.out = argv[++index] || "signature.png";
  }
  return args;
}

const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("scripts/render-signature.mjs");
if (invokedDirectly) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (!args.row && !args.payload) {
      console.error("Usage: node scripts/render-signature.mjs --row <consent.json> | --payload <base64> [--out signature.png]");
      process.exit(1);
    }
    const row = args.row ? JSON.parse(readFileSync(args.row, "utf8")) : { signature_format: "path/v1", signature_payload: args.payload };
    const png = renderSignature(row);
    writeFileSync(args.out, png);
    console.log(`signature written to ${args.out} (${png.length} bytes)`);
  } catch (error) {
    console.error(`render failed: ${error?.message || error}`);
    process.exit(1);
  }
}
