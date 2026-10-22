import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const restaurants = JSON.parse(readFileSync(new URL('../assets/restaurants.json', import.meta.url), 'utf8'));
export function validate(body) {
  const { restaurant, filename, content } = body || {};
  if (typeof restaurant !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 ._-]{1,79}$/.test(restaurant)) throw Error('Indiquez le nom du restaurant (2 à 80 caractères).');
  if (!restaurants.some(item => item.name === restaurant)) throw Error('Sélectionnez un restaurant dans la liste Artimex.');
  if (typeof filename !== 'string' || !/\.csv$/i.test(filename) || filename.length > 180 || /[\/\\\x00-\x1f]/.test(filename)) throw Error('Sélectionnez un fichier .csv.');
  if (typeof content !== 'string' || content.length > 2800000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content)) throw Error('Fichier invalide ou trop volumineux (2 Mo maximum).');
  const bytes = Buffer.from(content, 'base64');
  if (!bytes.length || bytes.length > 2 * 1024 * 1024 || bytes.includes(0)) throw Error('Le CSV doit être un fichier texte non vide de 2 Mo maximum.');
  const slug = restaurant.trim().replace(/[^A-Za-z0-9_-]+/g, '-');
  const original = filename.slice(0, -4).replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 80) || 'export';
  return { bytes, name: `${slug}_${new Date().toISOString().replace(/[:.]/g, '-')}_${randomUUID()}_${original}.csv` };
}
