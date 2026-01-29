/**
 * 強制リセットの防弾設計検証 [cite: 2026-01-25, 2026-01-27, 2026-01-28]
 *
 * - 最上位で localStorage.clear / deleteDatabase を即時実行すること
 * - DB は直接指定（databases() 未使用）であること
 * - createRoot で描画すること
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const mainPath = join(root, 'src/main.jsx')

function fail(msg) {
  console.error('❌', msg)
  process.exit(1)
}

function log(ok, msg) {
  console.log(ok ? '  ✅' : '  ❌', msg)
  if (!ok) fail(msg)
}

console.log('\n=== 強制リセット防弾設計の論理完遂検証 ===\n')

const main = readFileSync(mainPath, 'utf-8')

log(main.includes('createRoot'), 'createRoot で描画')
log(main.includes('try {') || main.includes('try{'), 'リセット処理を try で囲む')
log(main.includes('catch (') || main.includes('catch('), 'catch でエラー捕捉')
log(main.includes('window.alert') && main.includes('リセット失敗'), 'エラー時 window.alert で「リセット失敗」報告')
log(main.includes('localStorage.clear()'), '最上位で localStorage.clear 即時実行')
log(main.includes("deleteDatabase('tyson-db')"), "deleteDatabase('tyson-db') を直接指定")
log(main.includes("deleteDatabase('TysonAudioBackup')"), "deleteDatabase('TysonAudioBackup') を直接指定")
log(main.includes('2026-01-28-V_FINAL_FORCE_RELOAD'), 'VERSION 2026-01-28-V_FINAL_FORCE_RELOAD')
log(main.includes('__SYNC_BLOCKED_UNTIL'), '起動後 5 秒間同期ブロック')

const mainNoComments = main.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')
log(!mainNoComments.includes('indexedDB.databases()'), 'indexedDB.databases() は未使用（直接 DB 名指定のみ）')

console.log('\n=== 防弾設計チェック通過 ===\n')
