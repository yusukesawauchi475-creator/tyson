/**
 * FIREBASE_SERVICE_ACCOUNT 整合性の予備チェック（クライアント用）
 * GET /api/env-check → { ok, code?, vercelHint? }
 * 秘密は返さない。
 */

import { parseFirebaseServiceAccount } from './lib/parseFirebaseServiceAccount.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  const result = parseFirebaseServiceAccount(raw);

  if (result.success) {
    return res.status(200).json({ ok: true });
  }

  return res.status(200).json({
    ok: false,
    code: result.error?.code ?? 'unknown',
    vercelHint: result.error?.vercelHint ?? null,
    brokenFields: result.error?.brokenFields ?? null,
  });
}
