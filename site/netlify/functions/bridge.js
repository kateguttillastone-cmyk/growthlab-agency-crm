// Pont serveur entre l'app GAC Pilot et n8n.
// Le secret du pont ne quitte jamais le serveur : le navigateur n'envoie
// qu'un mot de passe d'accès, vérifié ici.
// Les trois valeurs viennent des variables d'environnement Netlify.

const N8N_BASE = process.env.N8N_BASE || 'https://n8n.growthlab-agency.fr';
const BRIDGE_SECRET = process.env.BRIDGE_SECRET || '';
const APP_PASSWORD = process.env.APP_PASSWORD || '';

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  };
}

async function callN8n(path, payload) {
  const res = await fetch(N8N_BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-bridge-secret': BRIDGE_SECRET },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }
  return { ok: res.ok, status: res.status, data, text };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { code: 'method_not_allowed' });

  if (!BRIDGE_SECRET || !APP_PASSWORD) {
    return json(500, {
      code: 'config_manquante',
      message: 'Variables BRIDGE_SECRET et APP_PASSWORD à définir dans Netlify (Site settings → Environment variables).',
    });
  }

  const given = event.headers['x-app-password'] || event.headers['X-App-Password'] || '';
  if (given !== APP_PASSWORD) return json(401, { code: 'unauthorized', message: 'Mot de passe incorrect' });

  const action = (event.path || '').split('/').filter(Boolean).pop();
  let body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; } catch (_) { body = {}; }

  try {
    if (action === 'ping') return json(200, { ok: true });

    if (action === 'leads') {
      const r = await callN8n('/webhook/crm-bridge-list', {});
      if (!r.ok) return json(502, { code: 'bridge_error', message: 'n8n a répondu ' + r.status });
      const rows = Array.isArray(r.data) ? r.data : [];
      return json(200, rows.map((x) => ({ id: x.id, fields: x.fields || {} })));
    }

    if (action === 'schema') {
      const r = await callN8n('/webhook/crm-bridge-schema', {});
      if (!r.ok) return json(502, { code: 'bridge_error', message: 'n8n a répondu ' + r.status });
      const first = Array.isArray(r.data) ? r.data[0] : r.data;
      return json(200, { colonnes: (first && first.colonnes) || [] });
    }

    if (action === 'brevo') {
      const r = await callN8n('/webhook/crm-bridge-brevo', { days: body.days || 30 });
      if (!r.ok) return json(502, { code: 'bridge_error', message: 'n8n a répondu ' + r.status });
      const first = Array.isArray(r.data) ? r.data[0] : r.data;
      return json(200, first || { ok: false });
    }

    if (action === 'update') {
      if (!body.recordId) return json(400, { code: 'missing_record', message: 'recordId manquant' });
      const r = await callN8n('/webhook/crm-bridge-update', {
        recordId: body.recordId,
        fields: body.fields || {},
      });
      if (!r.ok) return json(502, { code: 'bridge_error', message: 'n8n a répondu ' + r.status });
      const blob = r.text || '';
      if (/UNKNOWN_FIELD_NAME/i.test(blob)) {
        const missing = (blob.match(/Unknown field name:\s*"([^"]+)"/i) || [])[1];
        return json(422, {
          code: 'colonne_absente',
          message: missing
            ? 'La colonne "' + missing + '" n\'existe pas encore dans Airtable.'
            : 'Une colonne utilisée par cette action n\'existe pas dans Airtable.',
        });
      }
      if (/"error"/i.test(blob) && !/"id"/i.test(blob)) {
        return json(422, { code: 'airtable_error', message: blob.slice(0, 300) });
      }
      return json(200, { ok: true });
    }

    if (action === 'sourcing') {
      const icp = body.icp || body;
      const res = await fetch(N8N_BASE + '/webhook/search-leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(icp),
      });
      if (!res.ok) return json(502, { code: 'sourcing_error', message: 'n8n a répondu ' + res.status });
      return json(200, { ok: true });
    }

    return json(404, { code: 'action_inconnue', message: 'Action « ' + action + ' » inconnue' });
  } catch (err) {
    return json(502, { code: 'reseau', message: String((err && err.message) || err) });
  }
};
