/**
 * Lightweight i18n for English demo route. No external library.
 * ja = default (existing), en = YC demo.
 */

const dict = {
  ja: {
    // Headings
    partnerRecordingListen: '相手の録音（聞く）',
    myRecordingRecordSend: '自分の録音（録る/送る）',
    journalSharedAi: 'ジャーナル（解析・共有）※1日1枚',
    dailyPhotosShared: '日常写真（共有）※最大3枚',
    parentJournalToday: '親のジャーナル（今日）',
    myJournal: '自分のジャーナル',
    todayPhotos: '今日の写真',
    // Buttons
    refresh: '更新',
    play: '再生',
    record: '録音',
    gallery: 'ギャラリー',
    camera: '撮影',
    anotherTopic: '別の話題',
    skip: 'スキップ',
    reload: '再読み込み',
    copy: 'Copy',
    // State
    received: '届いています',
    notReceivedYet: 'まだ届いていません',
    notReceivedYetOk: 'まだ届いていません（今日はこれで大丈夫です）',
    sentAt: '送信しました（{{time}}）',
    saved: '保存済み',
    savedWithDate: '保存済み（{{date}}）',
    loading: '読み込み中…',
    playing: '再生中…',
    sending: '送信中…',
    recording: '録音中…',
    todayPhotosCount: '今日の写真: {{count}}/3',
    notUploadedYet: 'まだアップされていません',
    checking: '確認中…',
    voiceReceivedToday: '今日は声が届いています',
    notYetOkToday: 'まだです（今日はこれで大丈夫です）',
    tapToEnlarge: 'タップで拡大',
    dailyPhotoLimit: '本日は3枚までです',
    todayTopic: '今日の話題',
    // Journal notice（ジャーナル=自分用/AI解析・相手に非共有 / 日常写真=相手と共有）
    journalNotice: 'ジャーナルは自分用・AI解析用（相手には共有されません）。日常写真は相手と共有されます。',
    journalShownToPartner: 'ジャーナルは相手に共有されません。',
    journalOverwriteConfirm: '今日のジャーナルを上書きします。よろしいですか？',
    // Alts
    parentJournalAlt: '親のジャーナル',
    roleLabelParent: '親',
    roleLabelChild: '子',
    parentJournalZoomAlt: '親のジャーナル（拡大）',
    // Errors / messages
    tryAgain: 'もう一度お試しください',
    uploadFailed: 'うまくいきませんでした。もう一度お試しください（ID: {{id}}）',
    playFailed: 'うまくいきませんでした。もう一度お試しください（ID: PLAY-ERR）',
    micDenied: 'マイクへのアクセスが許可されていません',
    selectImage: '画像ファイルを選んでください',
    uploadError: 'アップロードに失敗しました',
    uploadErrorSize: '画像が大きすぎます。小さくして再度お試しください',
    uploadErrorType: 'この形式は使えません。JPEGまたはPNGを選んでください',
    uploadErrorNetwork: '通信エラーです。接続を確認して再度お試しください',
    initError: '初期化: {{msg}}',
    // DailyPrompt questions (lang-specific, used only via mapping in DailyPromptCard)
    'dailyPrompt.q.what_did_you_eat': '今日は何食べた？',
    'dailyPrompt.q.how_was_weather': '今日の天気はどうだった？',
    'dailyPrompt.q.fun_highlight': '今日一番楽しかったことは？',
    'dailyPrompt.q.how_do_you_feel': '今日の気分は？',
    'dailyPrompt.q.where_did_you_go': '今日はどこに行った？',
    'dailyPrompt.q.what_left_impression': '今日の出来事で印象的だったことは？',
    'dailyPrompt.q.who_did_you_meet': '今日は誰に会った？',
    'dailyPrompt.q.what_did_you_do': '今日は何をした？',
    'dailyPrompt.q.what_did_you_notice': '今日の気づきは？',
    'dailyPrompt.q.how_was_your_day': '今日はどんな1日だった？',
    'dailyPrompt.q.what_was_highlight': '今日のハイライトは？',
    'dailyPrompt.q.what_did_you_learn': '今日は何を学んだ？',
    'dailyPrompt.q.what_did_you_feel_today': '今日はどんな気持ちだった？',
    'dailyPrompt.q.what_memory_today': '今日の思い出は？',
    'dailyPrompt.q.small_happiness': '今日の小さな幸せは？',
    'dailyPrompt.q.what_time_today': '今日はどんな時間を過ごした？',
    'dailyPrompt.q.what_talk_about': '今日の出来事で話したいことは？',
    'dailyPrompt.q.what_were_you_thinking': '今日は何を考えていた？',
    'dailyPrompt.q.describe_in_one_word': '今日の1日を一言で表すと？',
    'dailyPrompt.q.mood_color': '今日の気分を色で表すと？',
    'dailyPrompt.q.what_went_well': '今日は何が良かった？',
    'dailyPrompt.q.look_back_today': '今日の1日を振り返ると？',
    'dailyPrompt.q.what_did_you_enjoy': '今日は何を楽しんだ？',
    'dailyPrompt.q.put_feelings_in_words': '今日の気持ちを言葉にすると？',
  },
  en: {
    partnerRecordingListen: "Partner's recording (listen)",
    myRecordingRecordSend: 'My recording (record/send)',
    journalSharedAi: 'Journal (shared + AI) • 1 per day',
    dailyPhotosShared: 'Daily photos (shared) • up to 3',
    parentJournalToday: "Parent's journal (today)",
    myJournal: 'My journal',
    todayPhotos: "Today's photos",
    refresh: 'Refresh',
    play: 'Play',
    record: 'Record',
    gallery: 'Gallery',
    camera: 'Camera',
    anotherTopic: 'Another topic',
    skip: 'Skip',
    reload: 'Reload',
    copy: 'Copy',
    received: 'Received',
    notReceivedYet: 'Not received yet',
    notReceivedYetOk: 'Not received yet (It\'s okay for today)',
    sentAt: 'Sent ({{time}})',
    saved: 'Saved',
    savedWithDate: 'Saved ({{date}})',
    loading: 'Loading...',
    playing: 'Playing...',
    sending: 'Sending...',
    recording: 'Recording...',
    todayPhotosCount: "Today's photos: {{count}}/3",
    notUploadedYet: 'Not uploaded yet',
    checking: 'Checking...',
    voiceReceivedToday: 'Voice received today',
    notYetOkToday: 'Not yet (It\'s okay for today)',
    tapToEnlarge: 'Tap to enlarge',
    dailyPhotoLimit: 'Up to 3 per day',
    todayTopic: "Today's topic",
    journalNotice: 'Journal is for you and AI analysis (not shared with partner). Daily photos are shared with your partner.',
    journalShownToPartner: 'Journal is not shared with partner.',
    journalOverwriteConfirm: 'This will overwrite today\'s journal. Continue?',
    parentJournalAlt: "Parent's journal",
    roleLabelParent: 'Parent',
    roleLabelChild: 'Child',
    parentJournalZoomAlt: "Parent's journal (zoom)",
    tryAgain: 'Please try again',
    uploadFailed: 'Something went wrong. Please try again (ID: {{id}})',
    playFailed: 'Something went wrong. Please try again (ID: PLAY-ERR)',
    micDenied: 'Microphone access was denied',
    selectImage: 'Please select an image file',
    uploadError: 'Upload failed',
    uploadErrorSize: 'Image is too large. Try a smaller file',
    uploadErrorType: 'This format is not supported. Use JPEG or PNG',
    uploadErrorNetwork: 'Network error. Check connection and try again',
    initError: 'Init: {{msg}}',
    // DailyPrompt questions
    'dailyPrompt.q.what_did_you_eat': 'What did you eat today?',
    'dailyPrompt.q.how_was_weather': 'How was the weather today?',
    'dailyPrompt.q.fun_highlight': 'What was the most fun part of today?',
    'dailyPrompt.q.how_do_you_feel': 'How do you feel today?',
    'dailyPrompt.q.where_did_you_go': 'Where did you go today?',
    'dailyPrompt.q.what_left_impression': 'What left an impression on you today?',
    'dailyPrompt.q.who_did_you_meet': 'Who did you meet today?',
    'dailyPrompt.q.what_did_you_do': 'What did you do today?',
    'dailyPrompt.q.what_did_you_notice': 'What did you notice today?',
    'dailyPrompt.q.how_was_your_day': 'How was your day?',
    'dailyPrompt.q.what_was_highlight': "What was today's highlight?",
    'dailyPrompt.q.what_did_you_learn': 'What did you learn today?',
    'dailyPrompt.q.what_did_you_feel_today': 'What did you feel today?',
    'dailyPrompt.q.what_memory_today': 'What memory stands out from today?',
    'dailyPrompt.q.small_happiness': 'What small happiness did you have today?',
    'dailyPrompt.q.what_time_today': 'What kind of time did you have today?',
    'dailyPrompt.q.what_talk_about': 'What from today do you want to talk about?',
    'dailyPrompt.q.what_were_you_thinking': 'What were you thinking about today?',
    'dailyPrompt.q.describe_in_one_word': 'If you put today in one word, what would it be?',
    'dailyPrompt.q.mood_color': 'If your mood today was a color, what color would it be?',
    'dailyPrompt.q.what_went_well': 'What went well today?',
    'dailyPrompt.q.look_back_today': 'Looking back on today, how was it?',
    'dailyPrompt.q.what_did_you_enjoy': 'What did you enjoy today?',
    'dailyPrompt.q.put_feelings_in_words': 'If you put your feelings today into words, what would you say?',
  },
}

/**
 * @param {'ja'|'en'} lang
 * @param {string} key
 * @param {Record<string, string>} [vars]
 * @returns {string}
 */
export function t(lang, key, vars = {}) {
  const locale = lang === 'en' ? 'en' : 'ja'
  const localeDict = dict[locale] || dict.ja
  // 英語ルートで dailyPrompt の key のときは dict.ja にフォールバックしない（本文が日本語で出るのを防ぐ）
  const fallbackJa = (locale === 'en' && typeof key === 'string' && key.startsWith('dailyPrompt.')) ? key : (dict.ja[key] ?? (typeof key === 'string' ? key : ''))
  let s = localeDict[key] ?? fallbackJa
  if (vars && typeof vars === 'object') {
    Object.keys(vars).forEach((k) => {
      s = String(s).replace(new RegExp(`{{${k}}}`, 'g'), String(vars[k] ?? ''))
    })
  }
  return s
}

export { dict }
