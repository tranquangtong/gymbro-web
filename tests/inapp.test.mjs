import test from 'node:test';
import assert from 'node:assert/strict';
import {inAppBrowser,platformOf,externalOpenUrl} from '../src/ui/inapp.js';

const UA={
  zaloIos:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Zalo iOS/510 ZaloTheme/dark ZaloLanguage/vn',
  zaloAndroid:'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36 Zalo android/12100 ZaloTheme/light ZaloLanguage/vi',
  messengerIos:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/482.0.0.38.109;FBBV/650000000;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.1]',
  facebookAndroid:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/485.0.0.0;]',
  instagram:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0 (iPhone15,2; iOS 18_1; vi_VN)',
  safari:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  chromeIos:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
  chromeAndroid:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  desktop:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
};

test('In-app browsers are recognised by app; real browsers are not',()=>{
  assert.equal(inAppBrowser(UA.zaloIos),'Zalo');assert.equal(inAppBrowser(UA.zaloAndroid),'Zalo');
  assert.equal(inAppBrowser(UA.messengerIos),'Messenger');assert.equal(inAppBrowser(UA.facebookAndroid),'Facebook');assert.equal(inAppBrowser(UA.instagram),'Instagram');
  for(const k of ['safari','chromeIos','chromeAndroid','desktop'])assert.equal(inAppBrowser(UA[k]),null,k);
});

test('The open-in-browser link targets Safari on iOS and Chrome on Android, without the page hash',()=>{
  const href='https://tranquangtong.github.io/gymbro-web/#dashboard';
  assert.equal(platformOf(UA.zaloIos),'ios');assert.equal(platformOf(UA.zaloAndroid),'android');assert.equal(platformOf(UA.desktop),'other');
  assert.equal(externalOpenUrl(href,UA.zaloIos),'x-safari-https://tranquangtong.github.io/gymbro-web/');
  assert.equal(externalOpenUrl(href,UA.zaloAndroid),'intent://tranquangtong.github.io/gymbro-web/#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Ftranquangtong.github.io%2Fgymbro-web%2F;end');
  assert.equal(externalOpenUrl(href,UA.desktop),'https://tranquangtong.github.io/gymbro-web/');
});
