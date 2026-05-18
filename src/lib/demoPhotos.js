// Demo photos i18n structure: lang 別 demo photo 差替可能 (現状全 lang 同 URL、後日 en/es 撮影で差替)
// 公理 1 (URL=SoT): demo data は派生値、persist しない (純粋関数)

const COMMON_ALBUM_DAYS = [
  {
    date: '4月1日',
    photos: [
      '/demo-photos/kidstravelpakutasoIMG_3146_TP_V4.webp',
      '/demo-photos/kidstravelpakutasoIMG_3155_TP_V.webp',
      '/demo-photos/Gemini_Generated_Image_4fx62a4fx62a4fx6.png',
    ],
  },
  {
    date: '3月31日',
    photos: [
      '/demo-photos/nekocyanPAKE5233-481_TP_V.webp',
      '/demo-photos/Gemini_Generated_Image_dm6kcmdm6kcmdm6k.png',
    ],
  },
  {
    date: '3月30日',
    photos: [
      '/demo-photos/08redsugar720_TP_V.webp',
      '/demo-photos/susipakuKYPKPAR52703_TP_V.webp',
      '/demo-photos/Gemini_Generated_Image_9jztwk9jztwk9jzt.png',
      '/demo-photos/CCIMG_8140_TP_V4.webp',
    ],
  },
  {
    date: '3月28日',
    photos: [
      '/demo-photos/pakutaso_go33036_TP_V.jpg',
      '/demo-photos/Gemini_Generated_Image_ejq9x3ejq9x3ejq9.png',
    ],
  },
  {
    date: '3月25日',
    photos: [
      '/demo-photos/TKLA__7DA5611_TP_V.jpg',
      '/demo-photos/Family%20fun%20in%20winter%20wonderland.png',
      '/demo-photos/Gemini_Generated_Image_v6ips5v6ips5v6ip.png',
    ],
  },
  {
    date: '3月20日',
    photos: [
      '/demo-photos/nekocyanPAKE5233-481_TP_V4.webp',
      '/demo-photos/Gemini_Generated_Image_7if52r7if52r7if5.png',
      '/demo-photos/Gemini_Generated_Image_bnqbafbnqbafbnqb.png',
    ],
  },
]

// 暫定: 全 lang 同 URL。後日 Yusuke 撮影で en/es 別 photo 差替可能 structure。
const DEMO_ALBUM_DAYS_BY_LANG = {
  ja: COMMON_ALBUM_DAYS,
  en: COMMON_ALBUM_DAYS,
  es: COMMON_ALBUM_DAYS,
}

export function getDemoAlbumDays(lang) {
  return DEMO_ALBUM_DAYS_BY_LANG[lang] || DEMO_ALBUM_DAYS_BY_LANG.ja
}

export function getDemoAllPhotos(lang) {
  const days = getDemoAlbumDays(lang)
  const out = []
  for (const day of days) {
    for (const url of day.photos) out.push(url)
  }
  return out
}
