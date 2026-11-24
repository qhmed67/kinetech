# MANUAL-TODO — كل اللي عليك تعمله بإيدك (بالترتيب)

الملف ده **مستقل تمامًا**: مش محتاج المحادثة اللي قبله عشان تنفّذه.
كل بند مكتوب بصيغة: **إيه** — **فين بالظبط** — **ليه** — **إزاي تتأكد إنه اشتغل** — **درجة الخطورة** — **إزاي ترجع لو مشتغلش**.

| الوسم | Meaning |
|---|---|
| `SAFE` | مفيش تأثير على الطلاب. ينفع تتعمل في أي وقت. |
| `CAUTION` | بيبعد على الإنتاج (سلوك أو سلوك_prod). لازم rollback جاهز. |
| `DANGEROUS` | ممكن **يقفل students بره** أو **يكسر التشغيل**. متعملهاش غير وانت متأكد، والـ rollback لازم يكون متاح. |

> **قاعدة دايمة:** أي إعداد جديد لازم يكون **fail-open** (لو الـ DB أو الإعداد واقع، السلوك القديم هو اللي شغال). لو لقيت إعداد بيفصل الطالب عند فشل، ده bug.

---

## TL;DR — الحالة الحقيقية دلوقتي (2026-11-24)

1. كل الشغل البرمجي اتدمج: `main` = `7fd78fc`، والـ PRs #46 و #47 و #48 **كلهم MERGED**، ومفيش أي PR مفتوح.
2. **Production** شغال على `https://kinetechtest.vercel.app`، ومنسوب headers جديدة اتأكدت من بره: `x-content-type-options: nosniff`، `x-frame-options: SAMEORIGIN`، `referrer-policy: strict-origin-when-cross-origin`، `permissions-policy: …, fullscreen=(self)`.
3. الـ JS bundle في الإنتاج **نضيف**: مفيش أي string يبدأ بـ `AIza` (مفتاح Google) ومفيش أي اسم متغيّر `VITE_*` — غير رابط Supabase + `sb_publishable…` (عادي ومتوقع).
4. `app_settings.video_worker_enabled = {enabled:false}` — طبقة الـ Worker **مقفولة**، واللي شغال فعليًا هو **Direct Drive ثم YouTube** بس.
5. `app_settings.direct_drive_enabled = {enabled:true}` — طبقة Direct شغالة وكأنها بتسلّم الـ Drive file id + مفتاح المتصفح لكل طالب.
6. `app_settings.session_limits = {mode:"log", max_concurrent_sessions:2, max_concurrent_devices:3, heartbeat_ttl_minutes:30, ip_binding:false}` — **log only**، يعني مفيش حد بيتمنع.
7. `app_settings.stream_token_ttl_seconds = {seconds:3600}` — عمر توكن البث ساعة.
8. `app_settings.native_gate = {gate_enabled:true, min_supported_version:"0.0.0", force_update:false}` — مفيش حد متمنع من الـ update.
9. الـ Worker اللي بيخدم R2 اسمه `kinetech-video` **مش موجود أصلًا** على حساب Cloudflare (error 10007). الموجود بس هو prototype اسمه `kinetech-video-test` (بيخدم من Google Drive ومفتاحه مفتاح اختبار).
10. يعني: **التشغيل المتاح = Direct Drive → YouTube**، والـ R2 rollout هو شغل Phase 5 (الشرح الكامل في `docs/R2-WORKER-SETUP.md`).

---

## PHASE 0 — فحوصات قبل الاعتماد

- [ ] **اتأكد من الـ VITE_* الموجودة على Production scope** — **المكان:** Vercel → Project `kinetechtest` → Settings → Environment Variables → switch على scope **Production** → اقرأ **الأسماء** بس (القيمة مش مهمة). دوّر على `VITE_DRIVE_BROWSER_KEY`، `VITE_SUPABASE_URL`، `VITE_SUPABASE_ANON_KEY`، `VITE_SUPABASE_PUBLISHABLE_KEY`. — **ليه:** `VITE_*` بتتحط جوه الـ bundle العامة، وأي مفتاح Google في `VITE_*` بيكون **مكشوف للكل** (الريبو public). — **التأكد:** كتبت اسم كل متغيّر موجود. — `SAFE` — **الرجوع:** مفيش حاجة تتعمل.

- [ ] **قرّر: هل مفتاح Google يعتبر مكشوف (leaked)؟** — **المكان:** نفس الشاشة + Google Cloud Console → APIs & Services → Credentials. — **ليه:** لو `VITE_DRIVE_BROWSER_KEY` كان موجود على **Production** وقت ما النسخة القديمة كانت منشورة، فالمفتاح كان داخل `assets/env-*.js` على موقع عام → يُعتبر **مكشوف** ولازم يتعمله rotate. لو كان موجود على **Preview** بس، فالمخاطرة أقل (الـ preview كان محمي بـ SSO) برضه الأفضل تعمل rotate واحد نظيف في Phase 1 وتخلص. — **التأكد:** قرار مكتوب: exposed أو مش exposed. — `CAUTION` — **الرجوع:** المفتاح القديم بيشتغل لحد ما تحذفه من Google Cloud (يعني Phase 1 هيقياس لو حذفته قبل ما تظبط `DRIVE_BROWSER_KEY` الجديد).

- [ ] **نظّف الـ PRs** — **المكان:** `gh pr list --state all` (أو GitHub → Pull requests). — **ليه:** #46 (Task 1+2) و #47 (Task 3) و #48 (headers + guard + docs) **كلهم MERGED**. مفيش PR مفتوح ولا برانش قديم محتاج إغلاق غلط. — **التأكد:** `gh pr list --state open` يطلع **فاضي**. بعد ما تتأكد، تقدر تحذف البرانش: `git push origin --delete feat/plan-v2-tasks` (اختياري، مش لازم). — `SAFE` — **الرجوع:** البرانش لسه موجود على الـ remote لحد ما تحذفه.

- [ ] **فاتح الـ verify guard** — **المكان:** `ALLOW_TEST_CHANGES=1 bash scripts/verify.sh full` من جوه الـ repo + Node 24: `export PATH="$HOME/.nvm/versions/node/v24.22.2/bin:$PATH"`. — **ليه:** الـ guard `guard: tests not weakened` بيشتكي من حذف `PlayerTest.test.tsx` (حذف أنت وافق عليه). الـ bypass **بتاعك** هو اللي يقدر يعمله، مش الوكيل. — **التأكد:** آخر سطر `VERIFY OK (… checks, mode=full)`. ملاحظة: بعد ما #48 اتدمج الـ diff ضد `main` بقى فاضي والـ guard بيعدّي لوحده من غير bypass. — `SAFE` — **الرجوع:** مفيش.

- [ ] **افحص الـ preview جوّه Vercel** (اختياري، Production اتأكد منه) — **المكان:** Vercel → project `kinetechtest` → Deployments → deployment بتاع برانش `feat/plan-v2-tasks` → Open Preview URL (محمي بـ SSO، فهتحتاج تكون داخل حسابك). — **ليه:** الـ preview بيورّث نفس `apps/web/vercel.json`. — **التأكد:** في الـ response headers تلاقي `x-content-type-options: nosniff`، `x-frame-options: SAMEORIGIN`، `referrer-policy: strict-origin-when-cross-origin`، `permissions-policy: … fullscreen=(self)`. — `SAFE` — **الرجوع:** مفيش.

- [ ] **تأكد إن مفيش "AIza" في الـ JS** (من Production — اتأكدت منه فعلاً، وكمان عدّيه بعد كل deploy جديد) — **المكان:** افتح DevTools → Network → أي ملف `assets/*.js` → Ctrl+F على `AIza`. أو الأمر: `curl -s https://kinetechtest.vercel.app/ | grep -oE '/assets/[a-zA-Z0-9._-]+\.js' | sort -u` وبحث في كل chunk. — **ليه:** لو ظهر `AIza` يبقى في متغيّر VITE اتسرّب تاني. — **التأكد:** مفيش أي `AIza` في أي chunk. — `SAFE` — **الرجوع:** مفيش.

- [ ] **تأكد إن `/api/play` بيرفض الطلب من غير جلسة** (سلوك الـ gate) — **المكان:** `curl -s -X POST https://kinetechtest.vercel.app/api/play -H "content-type: application/json" -d '{"video_id":"<uuid>"}'`. — **ليه:** لازم يفضل يرفض قبل أي playback بجد. — **التأكد:** الرد `{"ok":false,"code":"INVALID_TOKEN",…}`. (اتأكدنا منه: شغال صح.) — `SAFE` — **الرجوع:** مفيش.

- [ ] **تأكد إن صفحة الاختبار اتشالت** — **المكان:** `curl -s -o /dev/null -w "%{http_code}" https://kinetechtest.vercel.app/player-test`. — **ليه:** `#/player-test` كانت صفحة debug بلا حماية؛ اتشالت في commit `4d47b3c`. — **التأكد:** `404` (اتأكدنا منه). — `SAFE` — **الرجوع:** مفيش.

---

## PHASE 1 — مفتاح Google API (الجزء الأهم أمنيًا)

- [ ] **اعمل مفتاح Google API جديد ومقيّد** — **المكان:** Google Cloud Console → **APIs & Services** → **Credentials** → **Create credentials** → **API key** → بعد الإنشاء: **Edit** →
 - *Application restrictions* → **HTTP referrers** → Add: `https://kinetechtest.vercel.app` و `https://*.vercel.app` (للـ preview) و `http://localhost:5173` (تطوير محلي).
 - *API restrictions* → **Drive API** فقط (شيل أي تاني).
 - *Quota* → سيبها default. — **ليه:** مفتاح الـ Direct tier بيوصل **للمتصفح**، فالقيد بالـ referrer + API scope هو الحماية الحقيقية الوحيدة ليه. — **التأكد:** المفتاح الجديد موجود واسمه واضح (مثل `drive-browser-restricted`). — `SAFE` — **الرجوع:** احذفه من Google Cloud.

- [ ] **حط المفتاح الجديد كـ `DRIVE_BROWSER_KEY` على السيرفر** — **المكان:** Vercel → `kinetechtest` → Settings → Environment Variables → Add → Name: `DRIVE_BROWSER_KEY` → Value: **قيمة المفتاح الجديد** → Scope: **Preview** و **Production** → Save. — **ليه:** السيرفر بس هو اللي يقرا `DRIVE_BROWSER_KEY` (`apps/web/api/play.ts`) ويبعته في رد `/api/play` — المسار ده مالوش علاقة بـ `VITE_*`. — **التأكد:** المفتاح موجود بالاسمين (Preview + Production) والقيمة مخفية (type `sensitive`). — `CAUTION` (بيأثر على التشغيل لو اتغيّر صح/غلط) — **الرجوع:** رجّع قيمة `DRIVE_BROWSER_KEY` القديمة أو امسح المتغيّر — الـ code بيرجع `SYS_003` "Direct Drive is not enabled" بدل ما يكسر.

- [ ] **اعمل redeploy** — **المكان:** Vercel → `kinetechtest` → Deployments → آخر deployment → **⋯** → **Redeploy**. (أو ادفع commit فاضي؛ الـ Redeploy أسرع.) — **ليه:** تغيير متغيّر بيئة محتاج redeploy عشان ياخد effect. — **التأكد:** الـ deployment الجديد حالته **Ready** والوقت بعد التغيير. — `CAUTION` — **الرجوع:** من نفس شاشة الـ Deployments → **⋯** → **Promote** على الـ deployment القديم (أو Redeploy القديم).

- [ ] **جرّب درس Drive من حسابيك** — **المكان:** `https://kinetechtest.vercel.app` → Dashboard → اختر كورس فيه درس Drive → شغّل الدرس. — **ليه:** للتأكد إن الـ Direct tier لسه شغال بعد تغيير المفتاح (وكمان إن القيد بالـ referrer مش بيكسر الطلب). — **التأكد:** الفيديو بيشتغل، وفي الـ Network tab تلاقي `POST /api/play` ردّه `mode:"direct"` فيه `key` (المفتاح جاي من السيرفر). — `DANGEROUS` (لو اتكسر، الطلاب مش هيقدروا يشوفوا الدرس) — **الرجوع:** رجّع `DRIVE_BROWSER_KEY` القديمة + Redeploy، أو شيل المتغيّر وخلّي السلسلة تروح YouTube.

- [ ] **احذف المفتاح القديم من Google Cloud** — **المكان:** Google Cloud Console → APIs & Services → Credentials → المفتاح القديم → **Delete**. — **ليه:** لو كان مكشوف في bundle الإنتاج، لازم يموت. — **التأكد:** المفتاح القديم مش موجود في القائمة. — `DANGEROUS` (لو المفتاح القديم لسه مستخدم في أي مكان، كل Drive playback هيقع) — **الرجوع:** اعمل مفتاح تاني بنفس القيود (الاسم والقيد ثابتين) وحطه في `DRIVE_BROWSER_KEY` + Redeploy — **مفيش رجوع بعد الحذف**.

- [ ] **احذف `VITE_DRIVE_BROWSER_KEY` من Vercel (الاسكوپين)** — **المكان:** Vercel → `kinetechtest` → Settings → Environment Variables → دوّر على `VITE_DRIVE_BROWSER_KEY` → حذف من **Preview** ومن **Production**. — **ليه:** الكود بقى **مش بيقراه خالص** (بعد `22cc6fe` الـ bundle بتقرأ المتغيّرات كـ members فبتتحط القيمتين العامّين بس)، فلو سيبته ممكن يرجع يتسرّب تاني لو حد رجع للـ bare-object. — **التأكد:** المتغيّر مش موجود في أي scope، والـ bundle بعد الـ redeploy مفيهوش أي `VITE_` name. — `SAFE` — **الرجوع:** أضفه تاني (عارض للـ guard: الـ **build** هيفشل لو رجع key حقيقي جوه الـ bundle)).

---

## PHASE 2 — التحقق على الإنتاج بحساب طالب حقيقي (الدمج خلص فعلًا)

> الـ merges خلصت فعلًا (#46، #47، #48 — `main` = `7fd78fc`، و Production اتنشر من `main`). البنود دي **تحقق** على الإنتاج المنشور، مش دمج جديد.

- [ ] **الدرس يشتغل من حساب طالب** — **المكان:** `https://kinetechtest.vercel.app` → Dashboard → درس → تشغيل. — **ليه:** لازم نتأكد إن السلسلة (Direct → YouTube) شغالة بعد تغييرات اليوم، وإن `viewsLeft` بيتنقص صح. — **التأكد:** الفيديو شغال + في الـ Network tab رد `/api/play` فيه `mode` صحيح. — `SAFE` — **الرجوع:** مفيش.

- [ ] **الـ fullscreen (تكبير) شغال** — **المكان:** نفس الدرس → زرار maximize في Plyr (أو زرار التوسعة في الموبايل). — **ليه:** `Permissions-Policy: fullscreen=(self)` متظبطة عشان كده — لازم نتأكد إن المتصفح ما رفضش الطلب. — **التأكد:** الفيديو بياخد الشاشة كاملة على الـ desktop، ومفيش console error عن Permissions-Policy. — `CAUTION` (لو المتصفح رفض، الـ student مش هيقدر يكبّر) — **الرجوع:** غيّر `fullscreen=(self)` إلى `fullscreen=*` في `apps/web/vercel.json` + Redeploy.

- [ ] **الـ scroll lock شغال ومش بيسيب الصفحة معلّقة** — **المكان:** على الموبايل: افتح الدرس → وسّع → اقفل → حاول تعمل scroll. — **ليه:** الـ scroll lock (`apps/web/src/lib/useScrollLock.ts`) كان فيه bug قديم ثابت في baseline. — **التأكد:** بعد إففال اللاعب الصفحة ترجع الـ scroll طبيعي (مش مساحة بيضا). — `CAUTION` — **الرجوع:** آخر إصلاح للـ scroll lock كان `ee4109d` (PR #45)؛ لو ظهرت المشكلة من جديد: `git revert` الـ commit المسؤول أو ارجع لآخر baseline مستقر.

- [ ] **الـ watermark موجود ومتحرك** — **المكان:** نفس الدرس → بص على الفيديو. — **ليه:** الـ watermark (إيميل + آخر 4 أرقام) هو deterrent الأساسي. — **التأكد:** الإيميل ظاهر فوق الفيديو وبيتحرك كل 15 ثانية. — `SAFE` — **الرجوع:** مفيش.

- [ ] **شاشة الـ update-required ماتغيّرتش** — **المكان:** Admin → `https://kinetechtest.vercel.app/#/admin/settings` → قسم **"Native app version gate"**. — **ليه:** لازم الـ gate يفضل fail-open: `min_supported_version` = `0.0.0` و `Force update` = OFF. أي تغيير هنا = قفل طلاب. — **التأكد:** `Minimum supported version` = `0.0.0` و toggle الـ Force update متظبط off. — `SAFE` — **الرجوع:** لو اتغيّر بالغلط: نفس الشاشة → رجّع `0.0.0` + Force update off → Save (وهي fail-open تلقائيًا).

---

## PHASE 3 — اختبارات الأجهزة (اللي ما ينفعش أعملها من هنا)

- [ ] **fullscreen + scroll lock + watermark في الـ app الحقيقي** — **المكان:** ثبّت آخر build من EAS على موبايلك → افتح درس. — **ليه:** مفيش جهاز حقيقي في البيئة اللي شغال فيها، والـ baseline كان فيه شك في سلوك الموبايل. — **التأكد:** الفيديو بيكبر، الـ scroll بيرجع طبيعي بعد الإقفال، الـ watermark بيتحرك. — `SAFE` — **الرجوع:** مفيش.

- [ ] **سلوك الـ screen capture (FLAG_SECURE) — محتاج development build** — **المكان:** `npx expo run:android` (أو EAS development build) → افتح الدرس → جرّب تسجيل شاشة (Screen Recorder) → أو جرّب cast. — **ليه:** موديل `KinetechSecurity` بيشتغل في development build بس؛ **Expo Go مش هيشغّل الموديل** (فـ check الـ native بيرجع قيم افتراضية آمنة). — **التأكد:** التسجيل بيطلب إذن وبيطلع أسود، أو اللعبة بتتوقف (pause). — `SAFE` — **الرجوع:** مفيش (ده السلوك اللي عايزه).

- [ ] **شاشة "update required"** — **المكان:** نفس الـ dev build (أو build بإصدار قديم من `APP_VERSION`). — **ليه:** لازم نتأكد إن الرسالة بالعربية/الإنجليزية بتظهر صح والزر بيودي لصفحة التحديث، وإن مفيش طريقة تتخطاها. — **التأكد:** الشاشة بتمنع أي وصول للـ WebView لحد ما تعمل Update. — `DANGEROUS` (لو رفعت `min_supported_version` على جهازك بس، التطبيق بتاعك هيقف — وفي نفس الوقت لو نسيت ترجّعها، كل الطلاب القدامى هيقفوا) — **الرجوع:** Admin → Settings → **"Native app version gate"** → `gate_enabled` = **false** (kill switch) أو رجّع `min_supported_version` = `0.0.0` + `Force update` off → Save. اعمل الرجوع ده **فورًا** بعد الاختبار.

---

## PHASE 4 — قرارات الإعدادات

- [ ] **قرار الـ self-signup (تسجيل حساب جديد مفتوح؟)** — **المكان:** Supabase Dashboard (`zvtzhcrmqzwkifcwnbcl`) → **Authentication** → **Providers** → **Email** → **"Allow new users to sign up"**. — **ليه:** دلوقتي `disable_signup=false` (أي حد يعمل حساب) + `apps/web/public/signup.html` بيعمل signup من المتصفح. **النتيجة:** حد عايز يعيد المشاهدة يعمل حساب جديد فيلـ.reset حد الـ 3 views لكل درس. من غير signup مفتوح، الـ cap بيبقى حقيقي. — **التأكد:** الـ toggle متظبط حسب قرارك (OFF = الحسابات الجديدة متتعملش). — `CAUTION` — **الرجوع:** رجّعه ON من نفس الشاشة (لو أكتر من حساب لازم يتعمل فورًا).

- [ ] **قرار `session_limits`: log-only ولا enforce؟** — **المكان:** Admin → Settings → **"Concurrent sessions & devices"**. — **ليه:** دلوقتي `mode="log"` (تسجيل بس، مفيش منع). لو هتعمل enforce، لازم تبص على الأرقام الأول. — **التأكد (قبل التغيير):** بص على السجلات:
 - `npm run logs -- --source db --level warn --since 24h` (سجلات السيرفر)
 - أو SQL مباشرة: `select event, count(*) from app_logs where event ilike '%too_many%' group by event;` (الجدول `app_logs` موجود وشغال).
 - بص على `play_sessions` (قلب الـ guard): `select count(*) from play_sessions;` — الـ heartbeat بيكتب session/device حالية.
 - **الحدود المقترحة للبداية:** `max_concurrent_sessions = 2`، `max_concurrent_devices = 3`، `heartbeat_ttl_minutes = 30`، `ip_binding = false` (خلي `ip_binding` off على الموبايل: الشبكات بتغيّر الـ IP أثناء الدرس).
 **التأكد (بعد التغيير):** student بيحط درس من جهازين → يطلعله `TOO_MANY_SESSIONS` (403) في Network tab. — `DANGEROUS` (لو الحد صغير، طالب شرعي بيتمنع من الدرس أثناء امتحان أو timeout بعد كراش) — **الرجوع:** Admin → Settings → نفس القسم → `Mode` = **"Log only (recommended)"** → Save → يسري فورًا (الـ server بيقرأ كل 20 ثانية).

- [ ] **قرار `stream_token_ttl_seconds`** — **المكان:** Admin → Settings → **"Stream token lifetime"**. — **ليه:** ده عمر الـ URL المنسوخ: كل ما قلّلته، كل ما الـ URL المسروق يموت بسرعة. لكن كل ما قلّلته، زاد عدد طلبات `/api/playback/stream-refresh` (استهلاك Vercel functions + طلبات Worker). الحالي `3600`. الحد المسموح في السيرفر 300..7200. — **التأكد:** القيمة بين 300 و 7200؛ لو غيّرتها، جرّب درس ولاحظ إن التحديث بيحصل قبل الانتهاء. — `SAFE` — **الرجوع:** رجّعها `3600`.

- [ ] **قرار الـ Expo advisories (متوسط الخطورة) — موثّق: مفيش downgrade** — **المكان:** `npm audit` (3 moderate في `expo` / `@expo/fingerprint` / `minimatch`). — **ليه:** إصلاحها المعروض من npm بيقترح **Expo 52** (downgrade كبير) → هيكسّر الـ native app والـ build. **القرار الموثّق: ما ينزلش.** — **التأكد:** `npm audit --omit=dev` بيطلع نفس الـ 3 بس، والباقي نضيف. — `SAFE` — **الرجوع:** مفيش.

---

## PHASE 5 — تشغيل الـ R2 Worker (من `docs/R2-WORKER-SETUP.md`)

> **الهدف:** طبقة الـ Worker تبقى أول السلسلة، والـ student مياخدش الـ Drive file id خالص.
> **ليه مش متعمل دلوقتي:** الـ worker `kinetech-video` **مش موجود** على الحساب (`npx wrangler deployments list --config backend/video-worker/wrangler.toml` → error 10007). الملف الوحيد اللي شغال هو `kinetech-video-test` (prototype بيخدم من Google Drive بمفتاح اختبار).

- [ ] **اعمل الـ bucket** — **المكان:** `npx wrangler r2 bucket create kinetech` ثم `npx wrangler r2 bucket list`. — **ليه:** الـ lessons بتتخزن هنا (private). — **التأكد:** `kinetech` موجود في القائمة. — `SAFE` — **الرجوع:** `npx wrangler r2 bucket delete kinetech` (⚠ بيمسح الـ lessons — متعملهوش غير لو فاضي).

- [ ] **انشر الـ worker** — **المكان:** `npx wrangler deploy --config backend/video-worker/wrangler.toml` ثم `npx wrangler deployments list --config backend/video-worker/wrangler.toml`. — **ليه:** دي الخطوة اللي الـ Worker نفسه مش موجود من غيرها. — **التأكد:** deployment لـ `kinetech-video` + رابط workers.dev. — `CAUTION` — **الرجوع:** `npx wrangler delete kinetech-video`.

- [ ] **اعمل `GRANT_SECRET` وشاركه مع Vercel** — **المكان:** اعمل قيمة واحدة: `openssl rand -hex 32` (مرّة واحدة، واحفظها في مكان آمن)، وبعدين `npx wrangler secret put GRANT_SECRET --config backend/video-worker/wrangler.toml` بنفس القيمة. — **ليه:** نفس القيمة لازم تكون في السيرفر (Vercel) وفي الـ Worker، وإلا التوكنات هتترفض. — **التأكد:** `npx wrangler secret list --config backend/video-worker/wrangler.toml` بيطلع `GRANT_SECRET` (القيمة مش ظاهرة). — `DANGEROUS` (سر ناقص/مختلف = native playback مش هيشتغل) — **الرجوع:** حط نفس القيمة في الـ Worker **و** Vercel مع بعض، وبعدين Redeploy.

- [ ] **اربط الـ worker من السيرفر** — **المكان:** Vercel → `kinetechtest` → Settings → Environment Variables → Add → `VIDEO_WORKER_BASE_URL` = رابط workers.dev الجديد → Scope: **Preview** و **Production** → Save → Redeploy. — **ليه:** ده المتغيّر بتاع **stack الـ native/R2**. مت confundهوش بـ `VIDEO_STREAM_WORKER_URL` (ده بتاع prototype القديم وهو مش جزء من الخطوة دي). — **التأكد:** الـ deployment الجديد **Ready**. — `CAUTION` — **الرجوع:** رجّع القيمة القديمة أو شيل المتغيّر + Redeploy.

- [ ] **ارفع درس واحد** — **المكان:** `node tools/upload-lesson/upload.mjs --lesson <lessonId> --input <file.mp4>` (أو `npm run lesson:upload -- --lesson <lessonId> --input <file.mp4>`)، وبعدين SQL: `update video_sources set source='r2', src_url='r2:<lessonId>' where video_id='<lessonId>';` — **ليه:** الـ Worker بيخدم من R2، فلازم درس one موجود فعلًا. — **التأكد:** الـ tool بيطبع حجم مرفوع، و الـ SQL بيرجّع صف واحد. — `CAUTION` — **الرجوع:** رجّع `src_url` للقيمة القديمة، والـ `source` لـ `drive`.

- [ ] **اختبر قبل ما تفتح الـ toggle** — **المكان:** `npx wrangler tail --config backend/video-worker/wrangler.toml` + شغّل الدرس من حسابك. — **ليه:** لازم نتأكد الـ token والـ Range شغالين قبل ما نغيّر سلوك كل الطلاب. — **التأكد:** الـ tail بيوري طلبات 206 + `Content-Range`، والدرس بيشتغل من غير ما يظهر رابط Drive في الـ URL. — `DANGEROUS` (لو الـ Worker بيرجّع 5xx، السلسلة بتتدور للأمام زي ما هي مصمّمة) — **الرجوع:**ettbewي، شوف الـ tail، وكمّل Phase 5-6 بالترتيب.

- [ ] **افتح طبقة الـ Worker** — **المكان:** Admin → Settings → **"Worker streaming tier"** → التبديل → تأكيد. — **ليه:** دلوقتي `video_worker_enabled = {enabled:false}`، فالسلسلة بتبدأ من Direct. — **التأكد:** `select key,value from app_settings where key='video_worker_enabled';` بيرجّع `{"enabled": true}`، والـ logs بتوري `api.play.worker_*` بدل `api.play.worker_disabled`. — `DANGEROUS` — **الرجوع فورًا:** نفس القسم → الرجوع لـ **off** → Save (والسلسلة ترجعي Direct → YouTube، والـ logs بيوري `api.play.worker_disabled`).

---

## PHASE 6 — إصدار الـ native app والـ force update

> **الترتيب ملزم:** ارفع الـ build الأول → استنى الطلاب يحدّثوا → **بعدين** ارفع `min_supported_version` → **بعدين** شغّل Force update. عكس الترتيب ده =lockout.

- [ ] **انشر build جديد** — **المكان:** EAS build (`eas build --platform android --profile production`) → توزيعه على الطلاب (APK link / Play Console). — **ليه:** الـ force update بيمنع الإصدارات القديمة. لازم الناس يكون عندهم الجديد الأول. — **التأكد:** الإصدار الجديد (`APP_VERSION` في `apps/mobile/src/config.ts`) متاح للتحميل. — `SAFE` — **الرجوع:** رجّع رابط التوزيع للإصدار القديم.

- [ ] **استنى الـ distributions** — **المكان:** عدّ التحميلات/التحديثات من EAS أو Google Play Console. — **ليه:** `min_supported_version` بتمنع اللي لسه قديم. — **التأكد:** نسبة التحديث وصلت للرقم المقبول (مثالًا 90٪). — `SAFE` — **الرجوع:** مفيش.

- [ ] **ارفع `min_supported_version`** — **المكان:** Admin → Settings → **"Native app version gate"** → `Minimum supported version` → نفس قيمة `APP_VERSION` الجديدة → Save (فيه confirm). — **ليه:** الـ native app القديم مش هيشتغل مع السيرفر الجديد. — **التأكد:** الـ native app القديم بيطلّع **426** من `/api/play` بـ code `APP_001`. — `DANGEROUS` (كل موبايل قديم بيقف فورًا) — **الرجوع:** نفس الشاشة → رجّع `0.0.0` → Save (أو `gate_enabled = false`).

- [ ] **شغّل Force update** — **المكان:** نفس القسم → toggle **"Force update"** → Save. — **ليه:** يظهر بدل التحذير الناعم شاشة "update required" بلا زر إغلاق. — **التأكد:** الـ app القديم بيعرض شاشة التحديث فقط (مالوش طريق يوصل الـ WebView). — `DANGEROUS` — **الرجوع (kill switch):** نفس القسم → `gate_enabled` = **false** → Save → كل الأجهزة ترجع تشتغل فورًا (والـ server بيقرأه fail-open).

---

## PHASE 7 — تنظيف وبيانات الدخول (اعملها **آخر حاجة**)

- [ ] **اتأكد من `git status` الأول** — **المكان:** `git status` من جوه الـ repo. — **ليه:** فيه ملفات متجاهَلة (ignored) فيها أسرار؛ لازم تتأكد إن مفيش ملف tracked اتلمس. — **التأكد:** مفيش تغييرات على الملفات الـ tracked غير اللي انت عملته في الشغل ده (`docs/MANUAL-TODO.md` + الكود اللي اتدمج). — `SAFE` — **الرجوع:** مفيش.

- [ ] **احذف ملف الجلسة اللي فيه توكن حي** — **المكان:** ملف `session-*.md` في جذر الـ repo (اسمه بيبدأ بـ `session-` ويحتوي management token لـ Supabase). — **ليه:** الملف ده اتنشر على جهازك وفيه access token شغال لـ Supabase، والـ repo public. (بعد ما تعمل rotation في البند اللي بعده). — **التأكد:** `ls session-*.md` مفيش حاجة. — `SAFE` — **الرجوع:** مفيش.

- [ ] **Rotations (اعملهم فعلاً، مش بس documentation)** — **المكان بالظبط:**
 - **Supabase management token:** Supabase Dashboard → avatar (أسفل يسار) → **Account Settings** → **Access Tokens** → **Generate new token** →_scope "Management API"_ → احذف القديم.
 - **Vercel token:** Vercel → avatar → **Account Settings** → **Tokens** → اعمل token جديد → احذف القديم.
 - **GitHub PAT:** GitHub → avatar → **Settings** → **Developer settings** → **Personal access tokens** → ولّد واحد جديد narrow-scoped → احذف القديم.
 - **Cloudflare token:** من الـ repo: `npx wrangler logout` (بيشيل الـ OAuth token من `~/.config/.wrangler/config/default.toml`) + Cloudflare dashboard → **My Profile** → **API Tokens** → احذف التوكنات القديمة. — **ليه:** كل توكن اتسرّب أو اتسجّل في transcript لازم يموت. — **التأكد:** كل توكن قديم مش موجود في الـ dashboards، والـ CLI بيقول "Logged out" بعد `wrangler logout`. — `SAFE` — **الرجوع:** **مفيش رجوع** — لازم تعمل token جديد. (لذلك اعمل الـ rotation بعد ما تخلص الشغل كله، مش قبله.)

- [ ] **تأكد إن مفيش حاجة تانية ماسكه القيم القديمة** — **المكان:** `grep -rn "sbp_\|AIza\|GRANT_SECRET\|STREAM_TOKEN_SECRET" --exclude-dir=node_modules --exclude-dir=.git . | grep -v "^\./docs/"` (ودوّر على مكان السطر لو ظهر) + راجع env vars على Vercel/Cloudflare/Supabase. — **ليه:** بتدور على أي بقايا للـ tokens القديمة في ملفات أو إعدادات. — **التأكد:** مفيش نتايج خارج الـ docs. — `SAFE` — **الرجوع:** مفيش.

- [ ] **نظّف الـ junk** (كله ignored، والحذر إنك متحذفش حاجة الـ owner محتاجها) — **المكان/الأوامر:**
 ```
 git worktree remove .verify-wt # worktree قديم على commit 0908f52
 git worktree prune # ينضّف الـ worktrees المسجّلة والمتخليّة عنها
 rm -rf .fixbackup .pages-proxy-hold .playwright-mcp .live.html .live2.html .prod-index.html head.bin new_head.bin
 # الفيديوهات: GazaStrip1.mp4 GazaStrip1_720.mp4 (اسأل نفسك قبل الحذف)
 ```
 — **ليه:** ملفات تجريب/سكراشبت ما ليها أي لازمة، وفيها مفاتيح ومقاطع. — **التأكد:** `git worktree list` يطلع من غير `.verify-wt`، و`ls` ما لقاش الملفات. **الملفات دي متتبعة أصلاً في `.gitignore` فحذفها مش يأثر على الـ repo.** — `SAFE` — **الرجوع:** مفيش (كلها ملفات محلية مالهاش قيمة). — **ملاحظة:** `newPLanV2.md` و `problem-v1.md` و `scripts/merge-pr39-if-green.sh` **لسه visible في git status** (مش ignored) — لو عايزهم في الريبو أضفهم بـ `git add`، أو خلّيهم عندك.

- [ ] **لو هتسلّمني توكنات جديد بعدين** — **المكان:** GitHub tokens + Vercel + Supabase + Cloudflare. — **ليه:** الأفضل توكنات قصيرة العمر ومحدودة الصلاحية. — **التأكد:** كل توكن جديد scope محدود (read/write على اللي محتاجه بس) + expiry قريب. — `SAFE` — **الرجوع:** تلغيه من الـ dashboard.

---

## PHASE 8 — خطة الرجوع (لو لازم rolled back)

### 8.1 رجوع الـ merge نفسه

- [ ] **رجوع الكود بتاع آخر merge** — **المكان:** GitHub → PR #48 → **⋯** → **Revert** → Review → **Revert pull request**. (أو `git revert -m 1 <merge-commit>` + push على برانش جديد + PR.) — **ليه:** آخر merge كان #48 (`7fd78fc`) وفيه headers + guard + إصلاح الـ env. الرجوع بيرجّع السلوك القديم fully. — **التأكد:** الـ deployment الجديد **Ready** والـ headers رجعت/اختفت حسب reverted content. — `CAUTION` — **الرجوع:** اعمل revert للـ revert.

- [ ] **أو انشر الـ deployment القديم على طول** — **المكان:** Vercel → Deployments → اختر deployment قديم (قبل الـ merge) → **⋯** → **Promote to Production**. — **ليه:** أسرع رجوع وقت، من غير ما تلمس الـ git. — **التأكد:** الـ production بيرجع للنسخة القديمة (الـ etag/الـ content بيتغيّر). — `CAUTION` — **الرجوع:** Promote أي deployment تاني.

### 8.2 رجوع كل toggle على حدة

| الـ toggle | فين | إزاي ترجّع فورًا | إيه اللي بيحصل |
|---|---|---|---|
| `video_worker_enabled` | Admin → Settings → **"Worker streaming tier"** | التبديل → off → Save | السيرفر يردّ `api.play.worker_disabled` والسلسلة تبدأ من Direct (fail-open، 20 ثانية) |
| `direct_drive_enabled` | Admin → Settings → **"Direct Drive tier"** | التبديل → off → Save | الـ Direct tier يردّ `SYS_003` والسلسلة تروح YouTube (مش بيقف الـ playback) |
| `session_limits` | Admin → Settings → **"Concurrent sessions & devices"** | `Mode` = **"Log only (recommended)"** → Save | مفيش حد بيتمنع (fail-open) |
| `stream_token_ttl_seconds` | Admin → Settings → **"Stream token lifetime"** | رجّعها `3600` → Save | التوكنات ترجع تعيش ساعة |
| `native_gate` | Admin → Settings → **"Native app version gate"** | `gate_enabled` = **false** → Save | **kill switch**: كل الأجهزة ترجع تشتغل فورًا |

### 8.3 رجوع الـ migrations

الـ migrations اللي اتعملت في الشغل ده **كلها additive** (بتضيف جداول أو صفوف، ومفيش DROP ولا تعديل على بيانات طلاب):

| الملف | بيعمل إيه | لو محتاج ترجّعه |
|---|---|---|
| `supabase/migrations/20261120_app_logs.sql` | جدول `app_logs` (سجلات) | **متحذفش**: الجدول ده سجل تدقيق + مصدر الـ logs. لو هو اللي بيكسر، رجّع الكود بس (الكود بيفشل open لو الجدول مش موجود). |
| `supabase/migrations/20261123_app_settings.sql` | جدول `app_settings` + `app_settings_audit` | **متحذفش**. لو محتاج ترجّع قيمة، اعمل `update app_settings set value = … where key = …` (السجل القديم في `app_settings_audit`). |
| `supabase/migrations/20261125_play_sessions.sql` | جدول `play_sessions` + 3 صفوف في `app_settings` | **متحذفش** (الـ guard بيكتب فيه heartbeat). لو عملت `drop table` هتبوّظ الميزة بس **مش هيكسر playback** (الكود fail-open). الأفضل: `delete from play_sessions;` ومسيبش الجدول. |

> **تحذير:** مفيش أي `DROP TABLE` متاح كـ "رجوع" هنا. الجداول `profiles` و `enrollments` و `video_sources` و `watch_events` فيها **بيانات طلاب** — أي `delete`/`drop` عليهم بيمسح بيانات حقيقية وبيكسر المنصة. لو migration جد نفسه مالوش حالة → سجّل وامشِ.

- [ ] **لو migration اتعطلت أثناء التطبيق** — **المكان:** Supabase → SQL Editor → شوف الرسالة. — **ليه:** الـ SQL بتاع الـ migration idempotent (يتنفذ تاني من غير مشكلة) فيمكن تعيد تشغيله. — **التأكد:** الـ error بيختفي والجداول/الصفوف موجودة (`select key,value from app_settings order by key;`). — `CAUTION` — **الرجوع:** ملوش — الـ migrations idempotent.

---

## لو حاجة باظت — أول حاجة تشيك عليها

| العَرَض | أول حاجة تشيك | الـ toggle / الرجوع |
|---|---|---|
| الدرس مش بيشتغل خالص (حتى YouTube) | `npm run logs -- --source db --level error --route /api/play --since 1h` — بص على الغلطة الأولى في السلسلة | `direct_drive_enabled` (off/on) + `video_worker_enabled` (off) |
| Drive tier بيرجع `SYS_003` | `DRIVE_BROWSER_KEY` موجود في Production scope؟ + الـ Vercel env | Admin → Settings → "Direct Drive tier" / مفاتيح Vercel |
| الفيديو بيقف نص الدرس (token expired) | `stream_token_ttl_seconds` + لوجات `api.playback.stream-refresh` | Admin → Settings → "Stream token lifetime" → رجّعها `3600` |
| الطالب اتمنع: `TOO_MANY_SESSIONS` / `TOO_MANY_DEVICES` | `mode` في `session_limits` (لو enforce) | Admin → Settings → "Concurrent sessions & devices" → `Mode` = Log only |
| كل الموبايلات واقفة (426 / APP_001) | `native_gate.min_supported_version` و `force_update` | Admin → Settings → "Native app version gate" → `gate_enabled` = **false** (kill switch) |
| الـ native app مش بيشتغل خالص | الـ R2 worker `kinetech-video` موجود؟ (`npx wrangler deployments list --config backend/video-worker/wrangler.toml`) | انشر الـ R2 worker (Phase 5) — أو خلّي `video_worker_enabled` off وروح على Direct |
| زرار الكبّر مش شغال | `permissions-policy` في الـ response headers + console المتصفح | `fullscreen=(self)` في `apps/web/vercel.json` → Redeploy |
| الصفحة مش بتعمل scroll بعد إقفال اللاعب | آخر commit فيه إصلاح للـ scroll lock + `useScrollLock.test.ts` | ارجع لآخر baseline مستقر |
| الـ build نفسه فشل في Vercel | لوجات الـ deployment (Vercel → Deployments → ⋯ → Build Logs) — غالبًا `check-bundle-secrets` ماسك مفتاح | شيل المتغيّر اللي فيه المفتاح (Vercel env) أو ارجع لـ `22cc6fe` |
| `npm run logs` رجّع فاضي | `/api/log` بيرجّع `CONFIG_MISSING`؟ + الـ service-role key في الـ scope | Vercel → Environment Variables → `SUPABASE_SERVICE_ROLE_KEY` |
| الـ Direct tier مش شغال بس YouTube شغال | `DRIVE_BROWSER_KEY` موجود في Production scope؟ + `direct_drive_enabled` | Admin → Settings → "Direct Drive tier" (on/off) + Vercel → Environment Variables |

---

**آخر سطر:** كل بند فوق مكتوب بحيث ينفّذ لوحده. لو وقفت عند بند، كمّل الباقي بالترتيب — الترتيب مقصود (Phase 1 قبل Phase 2، Phase 5 قبل Phase 6، Phase 7 آخر حاجة).
