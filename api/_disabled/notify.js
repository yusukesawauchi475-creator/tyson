// 管理者への即時通知（Telegram/Slack/Webhook）

export default async function handler(req, res) {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let body;
    if (typeof req.body === 'string') {
      body = JSON.parse(req.body);
    } else {
      body = req.body || {};
    }

    const { analysisResult, userName, streakCount, adminUrl, previousAvgScore } = body;

    if (!analysisResult) {
      return res.status(400).json({ error: 'analysisResult is required' });
    }

    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';

    // 通知内容の生成
    const energyLevel = analysisResult.energyLevel?.score || analysisResult.energyLevel || 0;
    const mikeTysonIndex = analysisResult.mikeTysonIndex?.score || analysisResult.mikeTysonIndex || 0;
    const riskManagement = analysisResult.riskManagement?.score || analysisResult.riskManagement || 0;
    
    // 平均スコアを計算
    const avgScore = (energyLevel + mikeTysonIndex + riskManagement) / 3;
    
    // 異常検知: 前回より30点以上急落している場合
    const isUrgent = previousAvgScore !== undefined && (previousAvgScore - avgScore) >= 30;
    
    // 体調の要約
    let healthSummary = '正常';
    if (avgScore < 40) {
      healthSummary = '⚠️ 要注意：活力が低下しています';
    } else if (avgScore < 60) {
      healthSummary = '⚡ やや低下：注意が必要です';
    } else if (avgScore >= 80) {
      healthSummary = '✅ 良好：元気いっぱいです';
    }

    // 緊急度フィルター: 異常検知時のみ緊急通知
    const messagePrefix = isUrgent 
      ? '🚨【緊急・異常検知】\n\n' 
      : '';
    
    const message = `${messagePrefix}🔔 タイソン修行 - 解析完了通知

📊 おかんの体調サマリー: ${healthSummary}
📈 平均スコア: ${avgScore.toFixed(1)}点${previousAvgScore !== undefined ? ` (前回: ${previousAvgScore.toFixed(1)}点)` : ''}

詳細スコア:
• リスク管理能力: ${riskManagement}点
• マイク・タイソン指数: ${mikeTysonIndex}点
• 今日の元気度: ${energyLevel}点

連続日数: ${streakCount || 0}日目
ユーザー: ${userName || '修行者'}

${adminUrl ? `管理画面: ${adminUrl}` : ''}`;

    // 通知送信関数（リトライ機能付き）
    const sendNotificationWithRetry = async (sendFn, serviceName, maxRetries = 3) => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await sendFn();
          if (!isProduction) {
            console.log(`✅ ${serviceName}通知送信成功`);
          }
          return { success: true, attempt };
        } catch (error) {
          if (attempt === maxRetries) {
            if (!isProduction) {
              console.error(`❌ ${serviceName}通知送信失敗 (${maxRetries}回リトライ後):`, error);
            }
            // 最終的に失敗した場合、Firestoreにエラーログを記録
            try {
              const { initializeApp } = await import('firebase/app');
              const { getFirestore, collection, addDoc } = await import('firebase/firestore');
              
              const firebaseConfig = {
                apiKey: process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY,
                authDomain: process.env.FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN,
                projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID,
                storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET,
                messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
                appId: process.env.FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID,
              };
              
              const app = initializeApp(firebaseConfig);
              const db = getFirestore(app);
              
              await addDoc(collection(db, 'notification_errors'), {
                service: serviceName,
                error: error.message || 'Unknown error',
                timestamp: new Date(),
                analysisResult: analysisResult,
                userName: userName,
                streakCount: streakCount,
              });
            } catch (logError) {
              // ログ記録も失敗した場合は無視
            }
            return { success: false, attempt };
          }
          // リトライ前に待機（指数バックオフ）
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
      return { success: false, attempt: maxRetries };
    };

    // Telegram通知
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      await sendNotificationWithRetry(
        async () => {
          const telegramUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
          const response = await fetch(telegramUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: process.env.TELEGRAM_CHAT_ID,
              text: message,
              parse_mode: 'Markdown',
            }),
          });
          if (!response.ok) {
            throw new Error(`Telegram API error: ${response.status}`);
          }
        },
        'Telegram'
      );
    }

    // Slack通知
    if (process.env.SLACK_WEBHOOK_URL) {
      await sendNotificationWithRetry(
        async () => {
          const response = await fetch(process.env.SLACK_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: message,
              username: 'タイソン修行',
              icon_emoji: ':boxing_glove:',
            }),
          });
          if (!response.ok) {
            throw new Error(`Slack API error: ${response.status}`);
          }
        },
        'Slack'
      );
    }

    // 汎用Webhook通知
    if (process.env.WEBHOOK_URL) {
      await sendNotificationWithRetry(
        async () => {
          const response = await fetch(process.env.WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event: 'analysis_complete',
              timestamp: new Date().toISOString(),
              data: {
                userName,
                streakCount,
                analysisResult,
                healthSummary,
                avgScore,
                adminUrl,
                isUrgent,
              },
            }),
          });
          if (!response.ok) {
            throw new Error(`Webhook API error: ${response.status}`);
          }
        },
        'Webhook'
      );
    }

    return res.status(200).json({
      success: true,
      message: '通知を送信しました',
    });
  } catch (error) {
    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
    if (!isProduction) {
      console.error('Error in /api/notify:', error);
    }
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
}
