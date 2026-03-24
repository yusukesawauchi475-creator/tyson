/**
 * GET /api/daily-theme
 * Generate a daily conversation topic using OpenAI.
 * Falls back to null if OpenAI is unavailable.
 * Query: ?lang=ja|en
 */
import OpenAI from 'openai';

const PROMPT_JA = '日本に住む親と海外在住の子が毎日声を交換するアプリのお題を1つ生成してください。表面的な日常ではなく、記憶・感情・家族の歴史系の深掘りできる質問にしてください。20文字以内。お題のテキストだけ返してください。';
const PROMPT_EN = 'Generate one daily voice exchange topic for a parent in Japan and a child living abroad. Focus on deep questions about memories, emotions, and family history, not surface-level daily life. Under 15 words. Return only the topic text.';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const lang = (req.query.lang || 'ja').trim();
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.status(200).json({ success: false, topic: null, reason: 'no_api_key' });
  }

  try {
    const openai = new OpenAI({ apiKey });
    const prompt = lang === 'en' ? PROMPT_EN : PROMPT_JA;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 60,
      temperature: 0.9,
    });

    const topic = completion.choices?.[0]?.message?.content?.trim() || null;
    return res.status(200).json({ success: true, topic, lang });
  } catch (e) {
    console.error('[daily-theme] OpenAI error:', e?.message);
    return res.status(200).json({ success: false, topic: null, reason: e?.message });
  }
}
