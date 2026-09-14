import { readFileSync, writeFileSync } from 'node:fs';

const path = process.argv[2];
if (!path) throw new Error('WASM path required');
const bytes = readFileSync(path);
const read = (data, offset) => {
  let value = 0, shift = 0, p = offset;
  for (;;) { const b = data[p++]; value += (b & 127) * 2 ** shift; if (b < 128) return [value, p]; shift += 7; }
};
const leb = (value) => { const out = []; do { const b = value & 127; value >>>= 7; out.push(b | (value ? 128 : 0)); } while (value); return Buffer.from(out); };
const sections = [];
let globals = null;
for (let p = 8; p < bytes.length;) {
  const id = bytes[p++]; const [size, start] = read(bytes, p); p = start + size;
  const data = bytes.subarray(start, p); sections.push({ id, data });
  if (id === 6) globals = data;
}
// This ABI is intentionally restricted to this pinned Ghostty build: all VT
// heap state lives in memory, and the sole mutable global is the stack pointer.
if (!globals || globals[0] !== 1 || globals[1] !== 0x7f || globals[2] !== 1 || globals[3] !== 0x41)
  throw new Error('Unsupported WASM globals: re-audit checkpoint ABI before building');
const exports = sections.find((s) => s.id === 7);
const name = '__webshell_checkpoint_stack';
if (!exports.data.includes(Buffer.from(name))) {
  const [count, start] = read(exports.data, 0);
  exports.data = Buffer.concat([leb(count + 1), exports.data.subarray(start), leb(name.length), Buffer.from(name), Buffer.from([3, 0])]);
}
writeFileSync(path, Buffer.concat([bytes.subarray(0, 8), ...sections.map(({ id, data }) => Buffer.concat([Buffer.from([id]), leb(data.length), data]))]));
