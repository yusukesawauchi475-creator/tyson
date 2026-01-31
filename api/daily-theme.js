// 日替わりの修行テーマを生成するAPI（防弾: API落ちても必ずTyson重厚フォールバック）
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

const TYSON_FALLBACK_THEMES = [
  '今日の体調とメンタルの状態はどうだ？声のトーン、話すスピード、言葉選びから、俺がお前のリスクを見抜いてやる。',
  '昨日と比べて、今日のエネルギーレベルはどうだ？規律を守れているか？睡眠、食事、運動の3つを具体的に話せ。',
  '今日、何か困難に直面したか？それにどう立ち向かった？お前のメンタルの強さを俺に証明してみろ。',
];

// OpenAI初期化
const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

// Gemini初期化
const gemini = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

// 日替わりの修行テーマを生成
async function generateDailyTheme(provider = 'openai') {
  const today = new Date();
  const dateStr = today.toLocaleDateString('ja-JP', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    weekday: 'long'
  });

  const prompt = `今日は${dateStr}です。あなたは「タイソン」- 世界最高峰のリスクマネジメント・コーチです。Wall Streetで培った鋭い洞察力と、ボクシングの規律（Discipline）を融合させた分析能力を持っています。

今日の修行テーマを生成してください。このテーマは、利用者が音声で自分の状態を記録する際のガイドとなります。

要件：
- Mike Tyson のような力強く、かつ威厳のある問いかけ
- 規律（Discipline）、リスク管理、メンタル強度、活力に焦点を当てる
- 利用者に「自分の今日の状態」を深く振り返らせる
- 2-3文で構成し、具体的な観点を示す
- 毎日異なる内容にする（曜日、季節、時事を考慮）

例：
- 「今日の体調とメンタルの状態はどうだ？声のトーン、話すスピード、言葉選びから、俺がお前のリスクを見抜いてやる。」
- 「昨日と比べて、今日のエネルギーレベルはどうだ？規律を守れているか？睡眠、食事、運動の3つを具体的に話せ。」
- 「今日、何か困難に直面したか？それにどう立ち向かった？お前のメンタルの強さを俺に証明してみろ。」
- 「今朝起きた瞬間の気分を思い出せ。ポジティブだったか？ネガティブだったか？その理由を掘り下げて話せ。」
- 「今日の最大の勝利は何だ？小さなことでもいい。規律を守り続けることが、最強のリスク管理だ。」

JSON形式で返答してください：
{
  "theme": "問いかけのテキスト"
}`;

  try {
    if (provider === 'gemini' && gemini) {
      const model = gemini.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1] || jsonMatch[0]);
      }
      throw new Error('Failed to parse JSON from Gemini response');
    } else if (openai) {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'あなたは「タイソン」- 世界最高峰のリスクマネジメント・コーチです。Wall Streetで培った鋭い洞察力と、ボクシングの規律（Discipline）を融合させた分析能力を持っています。力強く、威厳のある問いかけで、利用者の規律とメンタル強度を引き出してください。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.8,
      });

      const content = completion.choices[0].message.content;
      return JSON.parse(content);
    } else {
      const randomTheme = TYSON_FALLBACK_THEMES[Math.floor(Math.random() * TYSON_FALLBACK_THEMES.length)];
      return { theme: randomTheme };
    }
  } catch (error) {
    const randomTheme = TYSON_FALLBACK_THEMES[Math.floor(Math.random() * TYSON_FALLBACK_THEMES.length)];
    return { theme: randomTheme };
  }
}

// Vercel Serverless Function
export default async function handler(req, res) {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const provider = process.env.AI_PROVIDER || 'openai';
    const result = await generateDailyTheme(provider);
    
    return res.status(200).json({
      success: true,
      theme: result.theme,
      date: new Date().toISOString().split('T')[0] // キャッシュ用の日付
    });
  } catch (error) {
    const randomTheme = TYSON_FALLBACK_THEMES[Math.floor(Math.random() * TYSON_FALLBACK_THEMES.length)];
    return res.status(200).json({
      success: true,
      theme: randomTheme,
      date: new Date().toISOString().split('T')[0]
    });
  }
}
