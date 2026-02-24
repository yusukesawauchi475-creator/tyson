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
    // Journal notice
    journalNotice: 'ジャーナルは相手に表示＆後でAI解析。日常写真は保存のみ（相手には表示されません）。',
    // Alts
    parentJournalAlt: '親のジャーナル',
    parentJournalZoomAlt: '親のジャーナル（拡大）',
    // Errors / messages
    tryAgain: 'もう一度お試しください',
    uploadFailed: 'うまくいきませんでした。もう一度お試しください（ID: {{id}}）',
    playFailed: 'うまくいきませんでした。もう一度お試しください（ID: PLAY-ERR）',
    micDenied: 'マイクへのアクセスが許可されていません',
    selectImage: '画像ファイルを選んでください',
    uploadError: 'アップロードに失敗しました',
    initError: '初期化: {{msg}}',
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
    journalNotice: 'Journal is shared with the other person and analyzed by AI later. Daily photos are saved only (not shown to the other person).',
    parentJournalAlt: "Parent's journal",
    parentJournalZoomAlt: "Parent's journal (zoom)",
    tryAgain: 'Please try again',
    uploadFailed: 'Something went wrong. Please try again (ID: {{id}})',
    playFailed: 'Something went wrong. Please try again (ID: PLAY-ERR)',
    micDenied: 'Microphone access was denied',
    selectImage: 'Please select an image file',
    uploadError: 'Upload failed',
    initError: 'Init: {{msg}}',
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
  let s = localeDict[key] ?? dict.ja[key] ?? (typeof key === 'string' ? key : '')
  if (vars && typeof vars === 'object') {
    Object.keys(vars).forEach((k) => {
      s = String(s).replace(new RegExp(`{{${k}}}`, 'g'), String(vars[k] ?? ''))
    })
  }
  return s
}

export { dict }
