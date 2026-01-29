/* global Buffer */
/**
 * FIREBASE_SERVICE_ACCOUNT 防弾パース
 *
 * - Bad control character in string literal 対策:
 *   - 生JSON内の改行を \\n に正規化してから parse
 * - Vercel 改行問題対策:
 *   - 二重エンコード時などに replace(/\\n/g, '\n') を適用
 *
 * 戻り値: { success: true, data } | { success: false, error: { code, message, position, vercelHint } }
 */

const CODE_PARSE_ERROR = 'FIREBASE_SERVICE_ACCOUNT_PARSE_ERROR';
const CODE_EMPTY = 'FIREBASE_SERVICE_ACCOUNT_EMPTY';

/** JSON文字列リテラル内の制御文字（改行等）を \\n にエスケープ。Bad control character 対策。 */
function normalizeJsonControlChars(s) {
  let out = '';
  let i = 0;
  let inString = false;
  let escape = false;
  while (i < s.length) {
    const c = s[i];
    if (escape) {
      out += c;
      escape = false;
      i++;
      continue;
    }
    if (c === '\\') {
      out += c;
      escape = true;
      i++;
      continue;
    }
    if (!inString) {
      if (c === '"') {
        inString = true;
      }
      out += c;
      i++;
      continue;
    }
    if (c === '"') {
      inString = false;
      out += c;
      i++;
      continue;
    }
    if (c === '\n' || c === '\r') {
      out += '\\n';
      if (c === '\r' && s[i + 1] === '\n') i++;
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** 二重エンコード等で得た文字列内の \\n を実際の改行に。Vercel 改行問題対策。 */
function normalizeNewlinesInString(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/\\n/g, '\n');
}

const REQUIRED_SA_KEYS = ['project_id', 'client_email', 'private_key'];

/** パース済みオブジェクトの必須項目検証。壊れている項目名を返す。Metadata 排除のため typeof string を要求。 */
function validateParsedServiceAccount(parsed) {
  const broken = [];
  for (const k of REQUIRED_SA_KEYS) {
    const v = parsed?.[k];
    if (typeof v !== 'string' || !v.trim()) {
      broken.push(k);
    }
  }
  return broken;
}

/** private_key の \\n → 実改行に正規化（credential.cert / PEM 用）。 */
function ensurePrivateKeyNewlines(parsed) {
  if (!parsed || typeof parsed.private_key !== 'string') return parsed;
  const key = normalizeNewlinesInString(parsed.private_key);
  return { ...parsed, private_key: key };
}

/**
 * パース失敗時の vercelHint（フロント用）
 */
const VERCEL_HINT =
  'Vercel の Settings > Environment Variables で FIREBASE_SERVICE_ACCOUNT の値を貼り付け直してください。' +
  ' Private Key は改行をそのまま入れず、\\n の形で1行に収めるか、JSON全体を1行で貼ってください。';

/**
 * SyntaxError から position / 原因らしき情報を抽出
 */
function extractParseErrorInfo(e) {
  const message = (e && e.message) || String(e);
  let position = null;
  const posMatch = message.match(/position\s+(\d+)/i) || message.match(/at\s+(\d+)/i);
  if (posMatch) position = parseInt(posMatch[1], 10);
  const controlMatch = /Bad control character|Unexpected token|JSON/i.test(message);
  return { message, position, controlMatch };
}

/**
 * FIREBASE_SERVICE_ACCOUNT 用防弾パース
 * @param {string} raw - 環境変数の生値
 * @returns {{ success: true, data: object } | { success: false, error: { code, message, position, vercelHint } }}
 */
export function parseFirebaseServiceAccount(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    return {
      success: false,
      error: {
        code: CODE_EMPTY,
        message: 'FIREBASE_SERVICE_ACCOUNT is empty',
        position: null,
        vercelHint: VERCEL_HINT,
      },
    };
  }

  const errors = [];

  const tryStrategy = (label, fn) => {
    try {
      const value = fn();
      if (value && typeof value === 'object') return value;
      throw new Error(`Parsed value is not an object (type=${typeof value})`);
    } catch (e) {
      const { message } = extractParseErrorInfo(e);
      errors.push(`${label}: ${message}`);
      return null;
    }
  };

  // 1) 制御文字正規化してからそのまま JSON パース（Bad control character 対策）
  let parsed = tryStrategy('direct JSON', () => {
    const prepared = normalizeJsonControlChars(trimmed);
    return JSON.parse(prepared);
  });
  if (parsed) {
    const broken = validateParsedServiceAccount(parsed);
    if (broken.length) {
      return {
        success: false,
        error: {
          code: CODE_PARSE_ERROR,
          message: `FIREBASE_SERVICE_ACCOUNT の必須項目が不足または壊れています: ${broken.join(', ')}`,
          brokenFields: broken,
          vercelHint: VERCEL_HINT,
        },
      };
    }
    return { success: true, data: ensurePrivateKeyNewlines(parsed) };
  }

  // 2) 外側クォート "\"{...}\""
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    const inner = trimmed.slice(1, -1);
    parsed = tryStrategy('outer-quoted JSON', () => JSON.parse(inner));
    if (parsed) {
      const broken = validateParsedServiceAccount(parsed);
      if (broken.length) {
        return {
          success: false,
          error: {
            code: CODE_PARSE_ERROR,
            message: `FIREBASE_SERVICE_ACCOUNT の必須項目が不足または壊れています: ${broken.join(', ')}`,
            brokenFields: broken,
            vercelHint: VERCEL_HINT,
          },
        };
      }
      return { success: true, data: ensurePrivateKeyNewlines(parsed) };
    }
    parsed = tryStrategy('outer-quoted double JSON', () => {
      const once = JSON.parse(inner);
      if (typeof once === 'string') {
        return JSON.parse(normalizeNewlinesInString(once));
      }
      return once;
    });
    if (parsed) {
      const broken = validateParsedServiceAccount(parsed);
      if (broken.length) {
        return {
          success: false,
          error: {
            code: CODE_PARSE_ERROR,
            message: `FIREBASE_SERVICE_ACCOUNT の必須項目が不足または壊れています: ${broken.join(', ')}`,
            brokenFields: broken,
            vercelHint: VERCEL_HINT,
          },
        };
      }
      return { success: true, data: ensurePrivateKeyNewlines(parsed) };
    }
  }

  // 3) 二重エンコード（replace(/\\n/g, '\n') 適用）
  parsed = tryStrategy('double-encoded JSON', () => {
    const once = JSON.parse(trimmed);
    if (typeof once === 'string') {
      return JSON.parse(normalizeNewlinesInString(once));
    }
    return once;
  });
  if (parsed) {
    const broken = validateParsedServiceAccount(parsed);
    if (broken.length) {
      return {
        success: false,
        error: {
          code: CODE_PARSE_ERROR,
          message: `FIREBASE_SERVICE_ACCOUNT の必須項目が不足または壊れています: ${broken.join(', ')}`,
          brokenFields: broken,
          vercelHint: VERCEL_HINT,
        },
      };
    }
    return { success: true, data: ensurePrivateKeyNewlines(parsed) };
  }

  // 4) Base64
  parsed = tryStrategy('base64 JSON', () => {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
    const prepared = normalizeJsonControlChars(decoded);
    return JSON.parse(prepared);
  });
  if (parsed) {
    const broken = validateParsedServiceAccount(parsed);
    if (broken.length) {
      return {
        success: false,
        error: {
          code: CODE_PARSE_ERROR,
          message: `FIREBASE_SERVICE_ACCOUNT の必須項目が不足または壊れています: ${broken.join(', ')}`,
          brokenFields: broken,
          vercelHint: VERCEL_HINT,
        },
      };
    }
    return { success: true, data: ensurePrivateKeyNewlines(parsed) };
  }

  // 5) Base64 of JSON string
  parsed = tryStrategy('base64 of JSON string', () => {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
    const once = JSON.parse(decoded);
    if (typeof once === 'string') {
      return JSON.parse(normalizeNewlinesInString(once));
    }
    return once;
  });
  if (parsed) {
    const broken = validateParsedServiceAccount(parsed);
    if (broken.length) {
      return {
        success: false,
        error: {
          code: CODE_PARSE_ERROR,
          message: `FIREBASE_SERVICE_ACCOUNT の必須項目が不足または壊れています: ${broken.join(', ')}`,
          brokenFields: broken,
          vercelHint: VERCEL_HINT,
        },
      };
    }
    return { success: true, data: ensurePrivateKeyNewlines(parsed) };
  }

  const detail = errors.join(' | ');
  const lastErr = errors[errors.length - 1] || '';
  const { position } = extractParseErrorInfo(new Error(lastErr));

  return {
    success: false,
    error: {
      code: CODE_PARSE_ERROR,
      message: `Failed to parse FIREBASE_SERVICE_ACCOUNT. ${detail}`,
      position,
      vercelHint: VERCEL_HINT,
    },
  };
}

export { CODE_PARSE_ERROR, CODE_EMPTY, VERCEL_HINT, normalizeJsonControlChars, normalizeNewlinesInString };
