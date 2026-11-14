// In-app browsers (Zalo, Messenger, Facebook, Instagram, TikTok…) open the Google sign-in
// popup in a separate, storage-partitioned web view, so Firebase loses its initial state
// ("Unable to process request due to missing initial state"). Detect them and send the
// user to the real browser instead of letting sign-in fail.
const APPS=[
  ['Zalo',/Zalo/i],
  ['Messenger',/FBAN\/Messenger|MessengerForiOS|FB_IAB\/MESSENGER|Orca-Android/i],
  ['Facebook',/FBAN|FBAV|FB_IAB|FBIOS|FB4A/],
  ['Instagram',/Instagram/],
  ['Threads',/Barcelona/],
  ['TikTok',/BytedanceWebview|musical_ly|TikTok/i],
  ['LINE',/\bLine\//],
  ['WeChat',/MicroMessenger/],
  ['KakaoTalk',/KAKAOTALK/i],
  ['Telegram',/Telegram/i]
];

export function inAppBrowser(ua=globalThis.navigator?.userAgent||''){
  return APPS.find(([,re])=>re.test(ua))?.[0]||null;
}

export function platformOf(ua=globalThis.navigator?.userAgent||''){
  return /iPhone|iPad|iPod/i.test(ua)?'ios':/Android/i.test(ua)?'android':'other';
}

// A link that asks the OS to open the page in the system browser. iOS: Safari's
// x-safari-https scheme (not supported by every in-app browser). Android: a Chrome intent
// that falls back to the plain URL. Elsewhere: the plain URL.
export function externalOpenUrl(href,ua=globalThis.navigator?.userAgent||''){
  const url=new URL(href),plain=url.origin+url.pathname+url.search;
  const p=platformOf(ua);
  if(p==='ios')return 'x-safari-'+plain;
  if(p==='android')return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(plain)};end`;
  return plain;
}
