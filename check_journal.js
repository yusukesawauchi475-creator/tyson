const fs = require('fs');
const env = fs.readFileSync('/Users/yusukesawauchi/mixc-nekolist/Tyson/.env.local', 'utf8');
const vars = {};
env.split('\n').forEach(l => { const m = l.match(/^([^=]+)=(.*)$/); if (m) vars[m[1].trim()] = m[2].trim().replace(/^'|'$/g,'').replace(/^"|"$/g,''); });
const admin = require('firebase-admin');
if (!admin.apps.length) {
  const parsed = JSON.parse(vars['FIREBASE_SERVICE_ACCOUNT']);
  admin.initializeApp({ credential: admin.credential.cert(parsed) });
}
const db = admin.firestore();
db.collection('journal').doc('demo').collection('months').doc('2026-03').collection('days').doc('2026-03-10').get().then(snap => {
  console.log('exists:', snap.exists);
  if (snap.exists) console.log(JSON.stringify(snap.data(), null, 2));
  else console.log('NO DATA');
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
