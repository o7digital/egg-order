import { readFileSync } from 'node:fs';
const catalog = JSON.parse(readFileSync(new URL('../assets/translations.json', import.meta.url), 'utf8'));
export function localizeResponse(req, res) {
  const lang = req.headers?.['x-portal-language'] === 'es' ? 'es' : 'en';
  const json = res.json.bind(res);
  res.json = body => {
    for (const field of ['error', 'message']) {
      if (typeof body[field] === 'string') body[field] = catalog[body[field]]?.[lang] || (lang === 'es' ? 'No se pudo procesar la solicitud. Contacte a Artimex.' : 'Unable to process the request. Contact Artimex.');
    }
    res.setHeader('Content-Language', lang);
    return json(body);
  };
}
