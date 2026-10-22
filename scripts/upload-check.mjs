import assert from 'node:assert/strict';
import handler, { validate } from '../api/upload.mjs';
const content = Buffer.from('SKU,Qty\r\nTEST,1\r\n');
const file = validate({ restaurant: 'EGG Canoga', filename: 'order.csv', content: content.toString('base64') });
assert.deepEqual(file.bytes, content);
assert.match(file.name, /^EGG-Canoga_.*_order\.csv$/);
assert.notEqual(file.name, validate({ restaurant: 'EGG Canoga', filename: 'order.csv', content: content.toString('base64') }).name);
for (const bad of [{ restaurant: 'EGG Unknown' }, { restaurant: '../other' }, { filename: '../order.csv' }, { filename: 'order.exe' }, { content: '' }, { content: Buffer.from([0,1]).toString('base64') }, { content: '!' }, { content: Buffer.alloc(2100000, 65).toString('base64') }]) {
  assert.throws(() => validate({ restaurant: 'EGG Canoga', filename: 'order.csv', content: content.toString('base64'), ...bad }));
}
const response = () => ({ setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
let res = response(); await handler({ method: 'GET' }, res); assert.equal(res.code, 405);
res = response(); await handler({ method: 'POST', headers: {} }, res); assert.equal(res.code, 401);
console.log('Upload validation, unique names, method and authentication checks passed');
