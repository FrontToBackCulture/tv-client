const fs = require('fs');
const path = require('path');

// Minimal valid PNG generator (creates solid color PNG)
function createPNG(width, height, r, g, b) {
  // PNG signature
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  
  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 2;  // color type (RGB)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = createChunk('IHDR', ihdrData);
  
  // IDAT chunk (image data)
  const zlib = require('zlib');
  const rawData = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    rawData[y * (width * 3 + 1)] = 0; // filter byte
    for (let x = 0; x < width; x++) {
      const offset = y * (width * 3 + 1) + 1 + x * 3;
      rawData[offset] = r;
      rawData[offset + 1] = g;
      rawData[offset + 2] = b;
    }
  }
  const compressed = zlib.deflateSync(rawData);
  const idat = createChunk('IDAT', compressed);
  
  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  
  const typeBuffer = Buffer.from(type);
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);
  
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  const table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  const result = Buffer.alloc(4);
  result.writeUInt32BE((crc ^ 0xFFFFFFFF) >>> 0, 0);
  return result;
}

// Brand color: #1E3A5F (navy blue)
const r = 0x1E, g = 0x3A, b = 0x5F;

const iconsDir = path.join(__dirname, 'src-tauri', 'icons');

// Generate icons
fs.writeFileSync(path.join(iconsDir, '32x32.png'), createPNG(32, 32, r, g, b));
fs.writeFileSync(path.join(iconsDir, '128x128.png'), createPNG(128, 128, r, g, b));
fs.writeFileSync(path.join(iconsDir, '128x128@2x.png'), createPNG(256, 256, r, g, b));

console.log('Icons generated successfully');
