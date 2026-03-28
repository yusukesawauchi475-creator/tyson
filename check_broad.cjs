const fs = require('fs');
const env = fs.readFileSync('/Users/yusukesawauchi/mixc-nekolist/Tyson/.env.local','utf8');
const vars = {};
env.split('\n').forEach(l=>{const m=l.match(/^([^=]+)=(.*)/);if(m)vars[m[1].trim()]=m[2].trim();});
const admin = require('firebase-admin');
const sa = JSON.parse(vars['FIREBASE_SERVICE_ACCOUNT']);
admin.initializeApp({credential:admin.credential.cert(sa),storageBucket:vars['VITE_FIREBASE_STORAGE_BUCKET']});
const bucket = admin.storage().bucket(vars['VITE_FIREBASE_STORAGE_BUCKET']);
const cutoff = Date.now() - 24*60*60*1000;
Promise.all([
  bucket.getFiles({prefix:'journal/demo'}).then(([files])=>{
    console.log('=journal recent 24h=');
    const recent = files.filter(f=>new Date(f.metadata.timeCreated).getTime() > cutoff);
    recent.forEach(f=>console.log(f.metadata.timeCreated, f.name));
    if(!recent.length) console.log('nothing');
  }),
  bucket.getFiles({prefix:'pair-media/demo'}).then(([files])=>{
    console.log('=voice recent 24h=');
    const recent = files.filter(f=>new Date(f.metadata.timeCreated).getTime() > cutoff);
    recent.forEach(f=>console.log(f.metadata.timeCreated, f.name));
    if(!recent.length) console.log('nothing');
  }),
]).then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1);});
