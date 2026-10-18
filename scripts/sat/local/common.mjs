import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const QUARTERS = ['2025-Q1', '2025-Q2', '2025-Q3', '2025-Q4'];
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
export const readJsonl = async (file) => (await readFile(file, 'utf8')).split(/\r?\n/).filter(Boolean).map((line, index) => {
  try { return JSON.parse(line); } catch (error) { throw new Error(`${file}:${index + 1}: ${error.message}`); }
});
export const flag = (args, name, fallback) => {
  const at = args.indexOf(name);
  if (at < 0) return fallback;
  if (!args[at + 1] || args[at + 1].startsWith('--')) throw new Error(`${name} needs a value`);
  return args[at + 1];
};
export const checksum = (record) => {
  const item = record.checksum?.find(({ algorithm, value }) => algorithm && value);
  if (!item) throw new Error(`${record.productId}: a published checksum is required`);
  const algorithm = item.algorithm.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (algorithm === 's3etag') return { algorithm: 's3-etag', value: String(item.value).replace(/^\"|\"$/g, '').toLowerCase() };
  if (!['md5', 'sha1', 'sha256', 'sha384', 'sha512'].includes(algorithm)) {
    throw new Error(`${record.productId}: unsupported checksum algorithm ${item.algorithm}`);
  }
  return { algorithm, value: item.value.toLowerCase() };
};
export const objectName = (record) => `${record.productId}-${record.name.replace(/[^A-Za-z0-9._-]/g, '_')}`;
export const sourceFile = (work, record) => resolve(work, 'source', record.quarter, objectName(record));
export const cacheStem = (window, quarter, digest) => `${window.id}__${quarter}__${digest.slice(0, 16)}`.replaceAll('/', '_');
