// 日替わりの修行テーマを生成するAPI
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

  const prompt = `今日は${dateStr}です。高齢者（おかん）向けの、ボケ防止や健康維持に関する日替わりの問いかけを1つ生成してください。

要件：
- 簡潔で分かりやすい（1-2文程度）
- ボケ防止や健康維持に関連する内容
- 温かみがあり、励ましの言葉を含む
- 毎日異なる内容にする

例：
- 「今日は、昨日食べた夕食のメニューを3つ思い出してみてください。記憶力を鍛えるトレーニングです。」
- 「今日は、深呼吸を3回してから、今の気持ちを言葉にしてみてください。心の健康も大切です。」

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
            content: 'あなたは高齢者の健康とボケ防止をサポートするアシスタントです。温かみのある、励ましの言葉を提供してください。'
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
      // フォールバック: デフォルトのテーマ
      const themes = [
        '今日は、昨日食べた夕食のメニューを3つ思い出してみてください。記憶力を鍛えるトレーニングです。',
        '今日は、深呼吸を3回してから、今の気持ちを言葉にしてみてください。心の健康も大切です。',
        '今日は、今朝起きた時間を思い出してみてください。規則正しい生活リズムが健康の基本です。',
        '今日は、最近会った人の名前を3人思い出してみてください。人とのつながりを大切にしましょう。',
        '今日は、今の季節の良いところを3つ挙げてみてください。ポジティブな気持ちが元気の源です。'
      ];
      const randomTheme = themes[Math.floor(Math.random() * themes.length)];
      return { theme: randomTheme };
    }
  } catch (error) {
    // エラー時はデフォルトのテーマを返す
    const themes = [
      '今日は、昨日食べた夕食のメニューを3つ思い出してみてください。記憶力を鍛えるトレーニングです。',
      '今日は、深呼吸を3回してから、今の気持ちを言葉にしてみてください。心の健康も大切です。'
    ];
    const randomTheme = themes[Math.floor(Math.random() * themes.length)];
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
    // エラー時もデフォルトのテーマを返す
    const themes = [
      '今日は、昨日食べた夕食のメニューを3つ思い出してみてください。記憶力を鍛えるトレーニングです。',
      '今日は、深呼吸を3回してから、今の気持ちを言葉にしてみてください。心の健康も大切です。'
    ];
    const randomTheme = themes[Math.floor(Math.random() * themes.length)];
    
    return res.status(200).json({
      success: true,
      theme: randomTheme,
      date: new Date().toISOString().split('T')[0]
    });
  }
}
