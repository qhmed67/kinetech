# MANUAL-TODO — كل اللي عليك تعمله بإيدك (بالترتيب)

الملف ده **مستقل تمامًا**: مش محتاج المحادثة اللي قبله عشان تنفّذه.
كل بند مكتوب بصيغة: **إيه** — **فين بالظبط** — **ليه** — **إزاي تتأكد إنه اشتغل** — **درجة الخطورة** — **إزاي ترجع لو مشتغلش**.

| الوسم | المعنى |
|---|---|
| `SAFE` | مفيش تأثير على الطلاب. ينفع تتعمل في أي وقت. |
| `CAUTION` | بيأثر على الإنتاج (سلوك أو أداء). لازم rollback جاهز. |
| `DANGEROUS` | ممكن **يقفل طلاب بره** أو **يكسر التشغيل**. متعملهاش غير وانت متأكد، والـ rollback لازم يكون متاح. |

> **قاعدة دايمة:** أي إعداد جديد لازم يكون **fail-open** (لو الـ DB أو الإعداد واقع، السلوك القديم هو اللي شغال). لو لقيت إعداد بيفصل الطالب عند فشل، ده عيب في الكود.

---

## TL;DR — الحالة الحقيقية دلوقتي (2026-11-24)

1. كل الشغل البرمجي اتدمج: `main` = `f54a9db` (آخر merge = PR #49 — التوثيق)، والـ PRs #46 و #47 و #48 و #49 **كلهم MERGED**، ومفيش أي PR مفتوح.
2. **Production** شغال على `https://kinetechtest.vercel.app`، ومنسوب headers جديدة اتأكدت من بره: `x-content-type-options: nosniff`، `x-frame-options: SAMEORIGIN`، `referrer-policy: strict-origin-when-cross-origin`، `permissions-policy: …, fullscreen=(self)`.
3. الـ JS bundle في الإنتاج **نضيف**: مفيش أي string يبدأ بـ `AIza` (مفتاح Google) ومفيش أي اسم متغيّر `VITE_*` — غير رابط Supabase + `sb_publishable…` (عادي ومتوقع).
4. `app_settings.video_worker_enabled = {enabled:false}` — طبقة الـ Worker **مقفولة**، واللي شغال فعليًا هو **Direct Drive ثم YouTube** بس.
5. `app_settings.direct_drive_enabled = {enabled:true}` — طبقة Direct شغالة وكأنها بتسلّم الـ Drive file id + مفتاح المتصفح لكل طالب.
6. `app_settings.session_limits = {mode:"log", max_concurrent_sessions:2, max_concurrent_devices:3, heartbeat_ttl_minutes:30, ip_binding:false}` — **log only**، يعني مفيش حد بيتمنع.
7. `app_settings.stream_token_ttl_seconds = {seconds:3600}` — عمر توكن البث ساعة.
8. `app_settings.native_gate = {gate_enabled:true, min_supported_version:"0.0.0", force_update:false}` — مفيش حد متمنع من الـ update.
9. الـ Worker اللي بيخدم R2 اسمه `kinetech-video` **مش موجود أصلًا** على حساب Cloudflare (error 10007). الموجود بس هو prototype اسمه `kinetech-video-test` (بيخدم من Google Drive وبيستخدم مفتاح اختبار).
10. يعني: **التشغيل المتاح = Direct Drive → YouTube**، والـ R2 rollout هو شغل Phase 5 (الشرح الكامل في `docs/R2-WORKER-SETUP.md`).
11. **جدول `app_logs` فيه صفوف `env=dev` بس** (كل الـ 2777 صف، مفيش صف واحد من الإنتاج). أخطاء الإنتاج تُقرأ من **سجلات Vercel**: Vercel → `kinetechtest` → **Logs** — مش من `app_logs`.
12. 4 برانشات قديمة لسه على الـ remote وفيها شغل مش مندمج: اتعملها **archive tags** (مش merge، مش delete) — شوف PHASE 9 (آخر الفصول).

---

## PHASE 0 — فحوصات قبل الاعتماد

- [ ] **اتأكد من الـ VITE_* الموجودة على Production scope** — **المكان:** Vercel → Project `kinetechtest` → Settings → Environment Variables → switch على scope **Production** → اقرأ **الأسماء** بس (القيمة مش مهمة). دوّر على `VITE_DRIVE_BROWSER_KEY`، `VITE_SUPABASE_URL`، `VITE_SUPABASE_ANON_KEY`، `VITE_SUPABASE_PUBLISHABLE_KEY`. — **ليه:** `VITE_*` بتتحط جوه الـ bundle العامة، وأي مفتاح Google في `VITE_*` بيكون **مكشوف للكل** (الريبو public). — **التأكد:** كتبت اسم كل متغيّر موجود. — `SAFE` — **الرجوع:** مفيش حاجة تتعمل.

- [ ] **قرّر: هل مفتاح Google يعتبر مكشوف (leaked)؟** — **المكان:** نفس الشاشة + Google Cloud Console → APIs & Services → Credentials. — **ليه:** لو `VITE_DRIVE_BROWSER_KEY` كان موجود على **Production** وقت ما النسخة القديمة كانت منشورة، فالمفتاح كان داخل `assets/env-*.js` على موقع عام → يُعتبر **مكشوف** ولازم يتعمله rotate. لو كان موجود على **Preview** بس، فالمخاطرة أقل (الـ preview كان محمي بـ SSO) برضه الأفضل تعمل rotate واحد نظيف في Phase 1 وتخلص. — **التأكد:** قرار مكتوب: **مكشوف** أو **مش مكشوف**. — `CAUTION` — **الرجوع:** المفتاح القديم بيشتغل لحد ما تحذفه من Google Cloud (يعني Phase 1 هيقياس لو حذفته قبل ما تظبط `DRIVE_BROWSER_KEY` الجديد).

- [ ] **نظّف الـ PRs** — **المكان:** `gh pr list --state all` (أو GitHub → Pull requests). — **ليه:** #46 (Task 1+2) و #47 (Task 3) و #48 (headers + guard + docs) و #49 (قائمة المهام) **كلهم MERGED**. مفيش PR مفتوح ولا برانش قديم محتاج إغلاق غلط. — **التأكد:** `gh pr list --state open` يطلع **فاضي**. بعد ما تتأكد، تقدر تحذف البرانش: `git push origin --delete feat/plan-v2-tasks` (اختياري، مش لازم). — `SAFE` — **الرجوع:** البرانش لسه موجود على الـ remote لحد ما تحذفه.

- [ ] **فاتح الـ verify guard** — **المكان:** `ALLOW_TEST_CHANGES=1 bash scripts/verify.sh full` من جوه الـ repo + Node 24: `export PATH="$HOME/.nvm/versions/node/v24.22.2/bin:$PATH"`. — **ليه:** الـ guard `guard: tests not weakened` بيشتكي من حذف `PlayerTest.test.tsx` (حذف أنت وافق عليه). الـ bypass **بتاعك** هو اللي يقدر يعمله، مش الوكيل. — **التأكد:** آخر سطر `VERIFY OK (… checks, mode=full)`. ملاحظة: بعد ما #48 اتدمج بقى الـ diff ضد `main` مستندات بس، والـ guard بيعدّي من غير bypass (اتأكدنا: `VERIFY OK` على البرانش ده). — `SAFE` — **الرجوع:** مفيش.

- [ ] **افحص الـ preview جوّه Vercel** (اختياري، Production اتأكد منه) — **المكان:** Vercel → project `kinetechtest` → Deployments → deployment بتاع برانش `feat/plan-v2-tasks` → Open Preview URL (محمي بـ SSO، فهتحتاج تكون داخل حسابك). — **ليه:** الـ preview بيورّث نفس `apps/web/vercel.json`. — **التأكد:** في الـ response headers تلاقي `x-content-type-options: nosniff`، `x-frame-options: SAMEORIGIN`، `referrer-policy: strict-origin-when-cross-origin`، `permissions-policy: … fullscreen=(self)`. — `SAFE` — **الرجوع:** مفيش.

- [ ] **تأكد إن مفيش "AIza" في الـ JS** (من Production — اتأكدت منه فعلاً، وكمان عدّيه بعد كل deploy جديد) — **المكان:** افتح DevTools → Network → أي ملف `assets/*.js` → Ctrl+F على `AIza`. أو الأمر: `curl -s https://kinetechtest.vercel.app/ | grep -oE '/assets/[a-zA-Z0-9._-]+\.js' | sort -u` ودوّر في كل chunk. — **ليه:** لو ظهر `AIza` يبقى في متغيّر VITE اتسرّب تاني. — **التأكد:** مفيش أي `AIza` في أي chunk. — `SAFE` — **الرجوع:** مفيش.

- [ ] **تأكد إن `/api/play` بيرفض الطلب من غير جلسة** (سلوك الـ gate) — **المكان:** `curl -s -X POST https://kinetechtest.vercel.app/api/play -H "content-type: application/json" -d '{"video_id":"<uuid>"}'`. — **ليه:** لازم يفضل يرفض قبل أي playback بجد. — **التأكد:** الرد `{"ok":false,"code":"INVALID_TOKEN",…}`. (اتأكدنا منه: شغال صح.) — `SAFE` — **الرجوع:** مفيش.

- [ ] **تأكد إن صفحة الاختبار اتشالت** — **المكان:** `curl -s -o /dev/null -w "%{http_code}" https://kinetechtest.vercel.app/player-test`. — **ليه:** `#/player-test` كانت صفحة debug بلا حماية؛ اتشالت في commit `4d47b3c`. — **التأكد:** `404` (اتأكدنا منه). — `SAFE` — **الرجوع:** مفيش.

---

## PHASE 1 — مفتاح Google API (الجزء الأهم أمنيًا)

- [ ] **اعمل مفتاح Google API جديد ومقيّد** — **المكان:** Google Cloud Console → **APIs & Services** → **Credentials** → **Create credentials** → **API key** → بعد الإنشاء: **Edit** →
 - *Application restrictions* → **HTTP referrers** → Add: `https://kinetechtest.vercel.app` و `https://*.vercel.app` (للـ preview) و `http://localhost:5173` (تطوير محلي).
 - *API restrictions* → **Drive API** فقط (شيل أي تاني).
 - *Quota* → متظبطش حاجة هنا: حصة الـ Drive API بتتقاد من مستوى الـ project (**APIs & Services → Quota**) — سيبها زي ما هي.

- [ ] **حط المفتاح الجديد كـ `DRIVE_BROWSER_KEY` على السيرفر** — **المكان:** Vercel → `kinetechtest` → Settings → Environment Variables → Add → Name: `DRIVE_BROWSER_KEY` → Value: **قيمة المفتاح الجديد** → Scope: **Preview** و **Production** → Save. — **ليه:** السيرفر بس هو اللي يقرا `DRIVE_BROWSER_KEY` (`apps/web/api/play.ts`) ويبعته في رد `/api/play` — المسار ده مالوش علاقة بـ `VITE_*`. — **التأكد:** المفتاح موجود بالاسمين (Preview + Production) والقيمة مخفية (type `sensitive`). — `CAUTION` (بيأثر على التشغيل لو اتغيّر صح/غلط) — **الرجوع:** رجّع قيمة `DRIVE_BROWSER_KEY` القديمة أو امسح المتغيّر — الـ code بيرجع `SYS_003` ("Direct Drive is not enabled on this deployment — try the normal Drive player.") بدل ما يكسر.

- [ ] **اعمل إعادة نشر (redeploy)** — **المكان:** Vercel → `kinetechtest` → Deployments → آخر deployment → **⋯** → **Redeploy**. (أو ادفع commit فاضي؛ الـ Redeploy أسرع.) — **ليه:** تغيير متغيّر بيئة محتاج إعادة نشر عشان يتطبّق. — **التأكد:** الـ deployment الجديد حالته **Ready** والوقت بعد التغيير. — `CAUTION` — **الرجوع:** من نفس شاشة الـ Deployments → **⋯** → **Promote** على الـ deployment القديم (أو Redeploy القديم).

- [ ] **جرّب درس Drive من حسابيك** — **المكان:** `https://kinetechtest.vercel.app` → Dashboard → اختر كورس فيه درس Drive → شغّل الدرس. — **ليه:** للتأكد إن الـ Direct tier لسه شغال بعد تغيير المفتاح (وكمان إن القيد بالـ referrer مش بيكسر الطلب). — **التأكد:** الفيديو بيشتغل، وفي الـ Network tab تلاقي `POST /api/play` ردّه `mode:"direct"` فيه `key` (المفتاح جاي من السيرفر). — `DANGEROUS` (لو اتكسر، الطلاب مش هيقدروا يشوفوا الدرس) — **الرجوع:** رجّع `DRIVE_BROWSER_KEY` القديمة + Redeploy، أو شيل المتغيّر وخلّي السلسلة تروح YouTube.

- [ ] **احذف المفتاح القديم من Google Cloud** — **المكان:** Google Cloud Console → APIs & Services → Credentials → المفتاح القديم → **Delete**. — **ليه:** لو كان مكشوف في bundle الإنتاج، لازم يموت. — **التأكد:** المفتاح القديم مش موجود في القائمة. — `DANGEROUS` (لو المفتاح القديم لسه مستخدم في أي مكان، كل تشغيل لدرس Drive هيقع) — **الرجوع:** اعمل مفتاح تاني بنفس القيود (الاسم والقيد ثابتين) وحطه في `DRIVE_BROWSER_KEY` + Redeploy — **مفيش رجوع بعد الحذف**.

- [ ] **احذف `VITE_DRIVE_BROWSER_KEY` من Vercel (الاسكوپين)** — **المكان:** Vercel → `kinetechtest` → Settings → Environment Variables → دوّر على `VITE_DRIVE_BROWSER_KEY` → حذف من **Preview** ومن **Production**. — **ليه:** الكود بقى **مش بيقراه خالص** (بعد `22cc6fe` الـ bundle بتقرأ المتغيّرات كـ members فبتتحط القيمتين العامّين بس)، فلو سيبته ممكن يرجع يتسرّب تاني لو حد رجع يقرا `import.meta.env` كـ object كامل. — **التأكد:** المتغيّر مش موجود في أي scope، والـ bundle بعد الـ redeploy مفيهوش أي `VITE_` name. — `SAFE` — **الرجوع:** أضفه تاني (عارض للـ guard: الـ **build** هيفشل لو رجع key حقيقي جوه الـ bundle)).

---

## PHASE 2 — التحقق على الإنتاج بحساب طالب حقيقي (الدمج خلص فعلًا)

> الدمج خلص فعلًا (#46، #47، #48، #49 — `main` = `f54a9db`، و Production اتنشر من `main`). البنود دي **تحقق** على الإنتاج المنشور، مش دمج جديد.

- [ ] **الدرس يشتغل من حساب طالب** — **المكان:** `https://kinetechtest.vercel.app` → Dashboard → درس → تشغيل. — **ليه:** لازم نتأكد إن السلسلة (Direct → YouTube) شغالة بعد تغييرات اليوم، وإن `viewsLeft` بيتنقص صح. — **التأكد:** الفيديو شغال + في الـ Network tab رد `/api/play` فيه `mode` صحيح. — `SAFE` — **الرجوع:** مفيش.

- [ ] **الـ fullscreen (تكبير) شغال** — **المكان:** نفس الدرس → زرار maximize في Plyr (أو زرار التوسعة في الموبايل). — **ليه:** `Permissions-Policy: fullscreen=(self)` متظبطة عشان كده — لازم نتأكد إن المتصفح ما رفضش الطلب. — **التأكد:** الفيديو بياخد الشاشة كاملة على الـ desktop، ومفيش console error عن Permissions-Policy. — `CAUTION` (لو المتصفح رفض، الـ student مش هيقدر يكبّر) — **الرجوع:** غيّر `fullscreen=(self)` إلى `fullscreen=*` في `apps/web/vercel.json` + Redeploy.

- [ ] **الـ scroll lock شغال ومش بيسيب الصفحة معلّقة** — **المكان:** على الموبايل: افتح الدرس → وسّع → اقفل → حاول تعمل scroll. — **ليه:** الـ scroll lock (`apps/web/src/lib/useScrollLock.ts`) كان فيه bug قديم ثابت في baseline. — **التأكد:** بعد إففال اللاعب الصفحة ترجع الـ scroll طبيعي (مش مساحة بيضا). — `CAUTION` — **الرجوع:** آخر إصلاح للـ scroll lock كان `ee4109d` (PR #45)؛ لو ظهرت المشكلة من جديد: `git revert` الـ commit المسؤول أو ارجع لآخر baseline مستقر.

- [ ] **الـ watermark موجود ومتحرك** — **المكان:** نفس الدرس → بص على الفيديو. — **ليه:** الـ watermark (إيميل + آخر 4 أرقام) هو أهم وسيلة ردع. — **التأكد:** الإيميل ظاهر فوق الفيديو وبيتحرك كل 15 ثانية. — `SAFE` — **الرجوع:** مفيش.

- [ ] **شاشة الـ update-required ماتغيّرتش** — **المكان:** Admin → `https://kinetechtest.vercel.app/#/admin/settings` → قسم **"Native app version gate"**. — **ليه:** لازم الـ gate يفضل fail-open: `min_supported_version` = `0.0.0` و `Force update` = OFF. أي تغيير هنا = قفل طلاب. — **التأكد:** `Minimum supported version` = `0.0.0` و toggle **"Force update (block outdated apps)"** متظبط off. — `SAFE` — **الرجوع:** لو اتغيّر بالغلط: نفس الشاشة → رجّع `0.0.0` + Force update off → Save (وهي fail-open تلقائيًا).

---

## PHASE 3 — اختبارات الأجهزة (اللي ما ينفعش أعملها من هنا)

- [ ] **fullscreen + scroll lock + watermark في الـ app الحقيقي** — **المكان:** ثبّت آخر build من EAS على موبايلك → افتح درس. — **ليه:** مفيش جهاز حقيقي في البيئة اللي شغال فيها، والـ baseline كان فيه شك في سلوك الموبايل. — **التأكد:** الفيديو بيكبر، الـ scroll بيرجع طبيعي بعد الإقفال، الـ watermark بيتحرك. — `SAFE` — **الرجوع:** مفيش.

- [ ] **سلوك الـ screen capture (FLAG_SECURE) — محتاج development build** — **المكان:** من `apps/mobile/`: `npx expo run:android` (أو EAS development build) → افتح الدرس → جرّب تسجيل شاشة (Screen Recorder) → أو جرّب cast. — **ليه:** موديل `KinetechSecurity` بيشتغل في development build بس؛ **Expo Go مش هيشغّل الموديل** (يعني الـ check بيرجع قيم افتراضية آمنة). — **التأكد:** التسجيل بيطلب إذن وبيطلع أسود، أو اللعبة بتتوقف (pause). — `SAFE` — **الرجوع:** مفيش (ده السلوك اللي عايزه).

- [ ] **شاشة "update required"** — **المكان:** نفس الـ dev build (أو build بإصدار قديم من `APP_VERSION`). — **ليه:** لازم نتأكد إن الرسالة بالعربية/الإنجليزية بتظهر صح والزر بيودي لصفحة التحديث، وإن مفيش طريقة تتخطاها. — **التأكد:** الشاشة بتمنع أي وصول للـ WebView لحد ما تعمل Update. — `DANGEROUS` (لو رفعت `min_supported_version` على جهازك بس، التطبيق بتاعك هيقف — وفي نفس الوقت لو نسيت ترجّعها، كل الطلاب القدامى هيقفوا) — **الرجوع:** Admin → Settings → **"Native app version gate"** → `gate_enabled` = **false** (الـ toggle بيكتب عليه "Version gate disabled (kill switch)") أو رجّع `min_supported_version` = `0.0.0` + `Force update (block outdated apps)` off → Save. اعمل الرجوع ده **فورًا** بعد الاختبار.

---

## PHASE 4 — قرارات الإعدادات

- [ ] **قرار الـ self-signup (تسجيل حساب جديد مفتوح؟)** — **المكان:** Supabase Dashboard (`zvtzhcrmqzwkifcwnbcl`) → **Authentication** → **Providers** → **Email** → **"Allow new users to sign up"**. — **ليه:** دلوقتي `disable_signup=false` (أي حد يعمل حساب) + `apps/web/public/signup.html` بيعمل signup من المتصفح. **النتيجة:** حد عايز يعيد المشاهدة يعمل حساب جديد، فيعمل reset للـ 3 views بتاعة كل درس. من غير signup مفتوح، الـ cap بيبقى حقيقي. — **التأكد:** الـ toggle متظبط حسب قرارك (OFF = الحسابات الجديدة متتعملش). — `CAUTION` — **الرجوع:** رجّعه ON من نفس الشاشة (لو أكتر من حساب لازم يتعمل فورًا).

- [ ] **قرار `session_limits`: log-only ولا enforce؟** — **المكان:** Admin → Settings → **"Concurrent sessions & devices"**. — **ليه:** دلوقتي `mode="log"` (تسجيل بس، مفيش منع). لو هتعمل enforce، لازم تبص على الأرقام الأول. — **التأكد (قبل التغيير):** بص على السجلات:
 - `npm run logs -- --source db --level warn --route /api/play --since 24h` (محتاج `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` في env المحلي؛ لو مش عندكهم، استخدم الـ SQL اللي تحته في Supabase → SQL Editor — نفس النتيجة) — الـ event بالظبط اسمه **`api.play.session_limit`** (level `warn`) وبيبقى فيه `ctx.reason` = `sessions` أو `devices`، والـ error code = `AUTH_003` (جلسات) أو `AUTH_004` (أجهزة).
 - أو SQL مباشرة (الجدول `app_logs` موجود وشغال — بس **لحد دلوقتي كل صفوفه `env=dev`**؛ أخطاء الإنتاج تُقرأ من Vercel → `kinetechtest` → **Logs**):
 ```sql
 select ctx->>'reason' as reason, ctx->>'liveSessions' as sessions, ctx->>'liveDevices' as devices, count(*)
   from app_logs
  where event = 'api.play.session_limit' and ts > now() - interval '7 days'
  group by 1,2,3 order by 4 desc;
 ```
 - بص على `play_sessions` (قلب الـ guard): `select count(*) from play_sessions;` — الـ heartbeat بيكتب session/device حالية.
 - **الحدود المقترحة للبداية:** `max_concurrent_sessions = 2`، `max_concurrent_devices = 3`، `heartbeat_ttl_minutes = 30`، `ip_binding = false` (خلي `ip_binding` off على الموبايل: الشبكات بتغيّر الـ IP أثناء الدرس).
 **التأكد (بعد التغيير):** طالب بيحط درس من جهازين → يطلعله `TOO_MANY_SESSIONS` (403) في Network tab. — `DANGEROUS` (لو الحد صغير، طالب شرعي بيتمنع من الدرس أثناء امتحان أو timeout بعد كراش) — **الرجوع:** Admin → Settings → نفس القسم → `Mode` = **"Log only (recommended)"** → Save → يسري فورًا (الـ server بيقرأ كل 20 ثانية).

- [ ] **قرار `stream_token_ttl_seconds`** — **المكان:** Admin → Settings → **"Stream token lifetime"**. — **ليه:** ده عمر الـ URL المنسوخ: كل ما قلّلته، كل ما الـ URL المسروق يموت بسرعة. لكن كل ما قلّلته، زاد عدد طلبات `/api/playback/stream-refresh` (استهلاك Vercel functions + طلبات Worker). الحالي `3600`. الحد المسموح في السيرفر 300..7200. — **التأكد:** القيمة بين 300 و 7200؛ لو غيّرتها، جرّب درس ولاحظ إن التحديث بيحصل قبل الانتهاء. — `SAFE` — **الرجوع:** رجّعها `3600`.

- [ ] **قرار الـ Expo advisories (متوسط الخطورة) — موثّق: مفيش downgrade** — **المكان:** `npm audit` (3 moderate في `expo` / `@expo/fingerprint` / `minimatch`). — **ليه:** إصلاحها المعروض من npm بيقترح **Expo 52** (downgrade كبير) → هيكسّر الـ native app والـ build. **القرار الموثّق: ما ينزلش.** — **التأكد:** `npm audit --omit=dev` بيطلع نفس الـ 3 بس، والباقي نضيف. — `SAFE` — **الرجوع:** مفيش.

---

## PHASE 5 — تشغيل الـ R2 Worker (من `docs/R2-WORKER-SETUP.md`)

> **الهدف:** طبقة الـ Worker تبقى أول السلسلة، والـ student مياخدش الـ Drive file id خالص.
> **ليه مش متعمل دلوقتي:** الـ worker `kinetech-video` **مش موجود** على الحساب (`npx wrangler deployments list --config backend/video-worker/wrangler.toml` → error 10007). الملف الوحيد اللي شغال هو `kinetech-video-test` (prototype بيخدم من Google Drive بمفتاح اختبار).

- [ ] **اعمل الـ bucket** — **المكان:** `npx wrangler r2 bucket create kinetech` ثم `npx wrangler r2 bucket list`. — **ليه:** الـ lessons بتتخزن هنا (private). — **التأكد:** `kinetech` موجود في القائمة. — `SAFE` — **الرجوع:** `npx wrangler r2 bucket delete kinetech` (⚠ بيمسح الـ lessons — متعملهوش غير لو فاضي).

- [ ] **انشر الـ worker** — **المكان:** `npx wrangler deploy --config backend/video-worker/wrangler.toml` ثم `npx wrangler deployments list --config backend/video-worker/wrangler.toml`. — **ليه:** دي الخطوة اللي الـ Worker نفسه مش موجود من غيرها. — **التأكد:** deployment لـ `kinetech-video` + رابط workers.dev. — `CAUTION` — **الرجوع:** `npx wrangler delete kinetech-video`.

- [ ] **اعمل `GRANT_SECRET` وشاركه مع Vercel** — **المكان:** اعمل قيمة واحدة: `openssl rand -hex 32` (مرّة واحدة، واحفظها في مكان آمن)، وبعدين `npx wrangler secret put GRANT_SECRET --config backend/video-worker/wrangler.toml` بنفس القيمة. — **ليه:** نفس القيمة لازم تكون في السيرفر (Vercel) وفي الـ Worker، وإلا التوكنات هتترفض. — **التأكد:** `npx wrangler secret list --config backend/video-worker/wrangler.toml` بيطلع `GRANT_SECRET` (القيمة مش ظاهرة). — `DANGEROUS` (سر ناقص/مختلف = native playback مش هيشتغل) — **الرجوع:** حط نفس القيمة في الـ Worker **و** Vercel مع بعض، وبعدين Redeploy.

- [ ] **اربط الـ worker من السيرفر** — **المكان:** Vercel → `kinetechtest` → Settings → Environment Variables → Add → `VIDEO_WORKER_BASE_URL` = رابط workers.dev الجديد → Scope: **Preview** و **Production** → Save → Redeploy. — **ليه:** ده المتغيّر بتاع **stack الـ native/R2**. متخلطش بينه وبين `VIDEO_STREAM_WORKER_URL` (ده بتاع prototype القديم وهو مش جزء من الخطوة دي). — **التأكد:** الـ deployment الجديد **Ready**. — `CAUTION` — **الرجوع:** رجّع القيمة القديمة أو شيل المتغيّر + Redeploy.

- [ ] **ارفع درس واحد** — **المكان:** `node tools/upload-lesson/upload.mjs --lesson <lessonId> --input <file.mp4>` (أو `npm run lesson:upload -- --lesson <lessonId> --input <file.mp4>`)، وبعدين SQL: `update video_sources set source='r2', src_url='r2:<lessonId>' where video_id='<lessonId>';` — **ليه:** الـ Worker بيخدم من R2، فلازم يكون فيه درس واحد مرفوع فعلًا. — **التأكد:** الـ tool بيطبع حجم مرفوع، و الـ SQL بيرجّع صف واحد. — `CAUTION` — **الرجوع:** رجّع `src_url` للقيمة القديمة، والـ `source` لـ `drive`.

- [ ] **اختبر قبل ما تفتح الـ toggle** — **المكان:** `npx wrangler tail --config backend/video-worker/wrangler.toml` + شغّل الدرس من حسابك. — **ليه:** لازم نتأكد الـ token والـ Range شغالين قبل ما نغيّر سلوك كل الطلاب. — **التأكد:** الـ tail بيوري طلبات 206 + `Content-Range`، والدرس بيشتغل من غير ما يظهر رابط Drive في الـ URL. — `DANGEROUS` (لو الـ Worker بيرجّع 5xx، السلسلة بتتدور للأمام زي ما هي مصمّمة) — **الرجوع:** استنى شوية، شوف الـ tail، وكمّل Phase 5-6 بالترتيب.

- [ ] **افتح طبقة الـ Worker** — **المكان:** Admin → Settings → **"Worker streaming tier"** → التبديل → تأكيد. — **ليه:** دلوقتي `video_worker_enabled = {enabled:false}`، فالسلسلة بتبدأ من Direct. — **التأكد:** `select key,value from app_settings where key='video_worker_enabled';` بيرجّع `{"enabled": true}`، والـ logs **مش** بتوري `api.play.worker_disabled` (ده معناه الـ flag لسه مقفول). لو الـ flag مفتوح بس الـ worker مش متظبط، بتظهر `api.play.worker_skipped` أو `api.play.worker_failed`. — `DANGEROUS` — **الرجوع فورًا:** نفس القسم → الرجوع لـ **off** → Save (والسلسلة ترجعي Direct → YouTube، والـ logs بيوري `api.play.worker_disabled`).

---

## PHASE 6 — إصدار الـ native app والـ force update

> **الترتيب ملزم:** ارفع الـ build الأول → استنى الطلاب يحدّثوا → **بعدين** ارفع `min_supported_version` → **بعدين** شغّل Force update. عكس الترتيب ده = **قفل طلاب (lockout)**.

- [ ] **انشر build جديد** — **المكان:** من `apps/mobile/`: `eas build --platform android --profile production` (الـ profile موجود في `apps/mobile/eas.json`) → توزيعه على الطلاب (APK link / Play Console). — **ليه:** الـ force update بيمنع الإصدارات القديمة. لازم الناس يكون عندهم الجديد الأول. — **التأكد:** الإصدار الجديد (`APP_VERSION` في `apps/mobile/src/config.ts`) متاح للتحميل. — `SAFE` — **الرجوع:** رجّع رابط التوزيع للإصدار القديم.

- [ ] **استنى الـ distributions** — **المكان:** عدّ التحميلات/التحديثات من EAS أو Google Play Console. — **ليه:** `min_supported_version` بتمنع اللي لسه قديم. — **التأكد:** نسبة التحديث وصلت للرقم المقبول (مثالًا 90٪). — `SAFE` — **الرجوع:** مفيش.

- [ ] **ارفع `min_supported_version`** — **المكان:** Admin → Settings → **"Native app version gate"** → `Minimum supported version` → نفس قيمة `APP_VERSION` الجديدة → Save (فيه confirm). — **ليه:** الـ native app القديم مش هيشتغل مع السيرفر الجديد. — **التأكد:** الـ native app القديم بيطلّع **426** من `/api/play` بـ code `APP_001`. — `DANGEROUS` (كل موبايل قديم بيقف فورًا) — **الرجوع:** نفس الشاشة → رجّع `0.0.0` → Save (أو `gate_enabled = false` — وده نفس الـ kill switch).

- [ ] **شغّل Force update** — **المكان:** نفس القسم → toggle **"Force update (block outdated apps)"** → Save. — **ليه:** يظهر بدل التحذير الناعم شاشة "update required" بلا زر إغلاق. — **التأكد:** الـ app القديم بيعرض شاشة التحديث فقط (مالوش طريق يوصل الـ WebView). — `DANGEROUS` — **الرجوع (kill switch):** نفس القسم → `gate_enabled` = **false** (الـ toggle بيكتب عليه "Version gate disabled (kill switch)") → Save → كل الأجهزة ترجع تشتغل فورًا (والـ server بيقرأه fail-open).

---

## PHASE 7 — تنظيف وبيانات الدخول (اعملها **آخر حاجة**)

- [ ] **اتأكد من `git status` الأول** — **المكان:** `git status` من جوه الـ repo. — **ليه:** فيه ملفات متجاهَلة (ignored) فيها أسرار؛ لازم تتأكد إن مفيش ملف tracked اتلمس. — **التأكد:** مفيش تغييرات على الملفات الـ tracked غير اللي انت عملته في الشغل ده (`docs/MANUAL-TODO.md` + الكود اللي اتدمج). — `SAFE` — **الرجوع:** مفيش.

- [ ] **احذف ملف الجلسة اللي فيه توكن حي** — **المكان:** ملف `session-*.md` في جذر الـ repo (اسمه بيبدأ بـ `session-` ويحتوي management token لـ Supabase). — **ليه:** الملف ده اتنشر على جهازك وفيه access token شغال لـ Supabase، والـ repo public. (بعد ما تعمل rotation في البند اللي بعده). — **التأكد:** `ls session-*.md` مفيش حاجة. — `SAFE` — **الرجوع:** مفيش.

- [ ] **تدوير التوكنات (اعملهم فعلاً، مش بس توثيق)** — **المكان بالظبط:**
 - **Supabase management token:** Supabase Dashboard → avatar (أسفل يسار) → **Account Settings** → **Access Tokens** → **Generate new token** →_scope "Management API"_ → احذف القديم.
 - **Vercel token:** Vercel → avatar → **Account Settings** → **Tokens** → اعمل token جديد → احذف القديم.
 - **GitHub PAT:** GitHub → avatar → **Settings** → **Developer settings** → **Personal access tokens** → ولّد واحد جديد narrow-scoped → احذف القديم.
 - **Cloudflare token:** من الـ repo: `npx wrangler logout` (بيشيل الـ OAuth token من `~/.config/.wrangler/config/default.toml`) + Cloudflare dashboard → **My Profile** → **API Tokens** → احذف التوكنات القديمة. — **ليه:** كل توكن اتسرّب أو اتسجّل في سجل المحادثة (transcript) لازم يموت. — **التأكد:** كل توكن قديم مش موجود في الـ dashboards، والـ CLI بيقول "Logged out" بعد `wrangler logout`. — `SAFE` — **الرجوع:** **مفيش رجوع** — لازم تعمل token جديد. (لذلك اعمل الـ rotation بعد ما تخلص الشغل كله، مش قبله.)

- [ ] **تأكد إن مفيش حاجة تانية ماسكه القيم القديمة** — **المكان:** `grep -rn "sbp_\|AIza\|GRANT_SECRET\|STREAM_TOKEN_SECRET" --exclude-dir=node_modules --exclude-dir=.git . | grep -v "^\./docs/"` (ودوّر على مكان السطر لو ظهر) + راجع env vars على Vercel/Cloudflare/Supabase. — **ليه:** بتدور على أي بقايا للـ tokens القديمة في ملفات أو إعدادات. — **التأكد:** مفيش نتايج خارج الـ docs. — `SAFE` — **الرجوع:** مفيش.

- [ ] **نظّف الـ junk** — **قاعدة قبل أي حذف:** كل حاجة تحت موجودة في `.gitignore` (يعني **مش متتبعة** في git) → حذفها **مش بيأثر على الريبو**، واللي **متتبّع** في git **مينفعش** يتحذف هنا. اتأكد بـ `git status` الأول.

  **آمن تتحذفه (سكراشبت ومخرجات مولّدة، كله ignored):**
  ```
  rm -rf .fixbackup .freebuff .pages-proxy-hold .playwright-mcp
  rm -f .live.html .live2.html .prod-index.html head.bin new_head.bin
  rm -rf apps/web/test-results          # مخرجات Playwright
  rm -rf apps/mobile/.expo               # cache
  rm -rf backend/video-worker/.wrangler  # state محلي — بيتولّد تاني
  rm -f apps/web/public/supabase-config.js  # ملف متولّد (gen-supabase-config.cjs) وقيمه فاضية
  ```
  — **ليه:** ملفات مولّدة/مؤقتة، مالها أي لازمة، ومفيش منها أي tracked file. — **التأكد:** `ls` ما لقاش الملفات + `git status` نضيف. — `SAFE` — **الرجوع:** مفيش (بتتولّد تاني).

  **الـ worktree القديم (داخل الريبو):**
  ```
  git worktree remove .verify-wt          # قديم، detached عند 0908f52
  git worktree prune                     # ينضّف الـ worktrees المسجّلة والمتخليّة عنها
  ```
  — لو رفض الأمر الأول ( فيه تغييرات غير متتبعة)، **اتأكد الأول** وبعدين `git worktree remove --force .verify-wt`. — `SAFE` — **الرجوع:** `git worktree add .verify-wt 0908f52`.

  **خلّيه (مالك أو إعدادات أدوات — متحذفش):**
  - `AGENTS.md` — دليل المشروع بتاعك (ignored، بس هو المرجع؛ **خلّيه**).
  - `docs/mobile/` — دوكمنتدشن local خاصة بيك (ignored؛ **خلّيه**).
  - `.agents/` و `.opencode/` و `opencode.json` و `skills-lock.json` — إعدادات أدواتك (ignored؛ **خلّيه**).
  - `react-native-plan-full.md` — خطتك (ignored؛ **خلّيه**).
  - `apps/mobile/.env` — إعدادات الموبايل المحلية (`EXPO_PUBLIC_*` بس، مفيش مفتاح Google؛ **خلّيه**).
  - `/home/ahmed/.sesori/worktrees/kinetech-4f698349/gray-capybara` — **worktree بتاع أداة تانية** خارج الريبو (detached عند `81acdf6`): سيبه كما هو، ما تمسحوش غير لما تأكد إن الأداة مش شغالة.
  - `GazaStrip1.mp4` و `GazaStrip1_720.mp4` — مقاطع اختبار: **قرارك** (احذفهم أو خلّيهم).
  - `newPLanV2.md` و `problem-v1.md` و `scripts/merge-pr39-if-green.sh` — **ملفاتك أنت**، ولسه **مش ignored** (بتظهر في `git status`): لو عايزهم في الريبو أضفهم بـ `git add`، أو خلّيهم عندك. **ما يمسحش من غير قرار.**

  — **ليه:** بننضّف اللي هو مولّد/مؤقت، وبنترك اللي مالك. — **التأكد:** `git worktree list` من غير `.verify-wt` + `git status --ignored` يبقى نضيف إلا اللي قرارك بيخلّيه. — `SAFE` — **الرجوع:** الملفات المولّدة بتتولّد تاني، واللي خلّيناه ما اتمسحش.

- [ ] **لو هتسلّمني توكنات جديد بعدين** — **المكان:** GitHub tokens + Vercel + Supabase + Cloudflare. — **ليه:** الأفضل توكنات قصيرة العمر ومحدودة الصلاحية. — **التأكد:** كل توكن جديد scope محدود (read/write على اللي محتاجه بس) + expiry قريب. — `SAFE` — **الرجوع:** تلغيه من الـ dashboard.

---

## PHASE 8 — خطة الرجوع (لو لازم rolled back)

### 8.1 رجوع الـ merge نفسه

- [ ] **رجوع الكود بتاع آخر merge** — **المكان:** GitHub → PR #49 → **⋯** → **Revert** → Review → **Revert pull request**. (أو `git revert -m 1 f54a9db` + push على برانش جديد + PR.) — **ليه:** آخر merge هو **#49** (`f54a9db`) وهو **توثيق فقط** (قائمة المهام) — رجوعه **مش** بيأثر على الكود. لو عايز ترجّع **سلوك** (الـ headers + الـ guard + إصلاح الـ env) → **PR #48** (`7fd78fc`) هو الهدف، وهو لسه valid revert target. — **التأكد:** الـ deployment الجديد **Ready** والـ headers رجعت/اختفت حسب reverted content. — `CAUTION` — **الرجوع:** اعمل revert للـ revert.

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

الـ migrations اللي اتعملت في الشغل ده **كلها إضافية (additive)** (بتضيف جداول أو صفوف، ومفيش DROP ولا تعديل على بيانات طلاب):

| الملف | بيعمل إيه | لو محتاج ترجّعه |
|---|---|---|
| `supabase/migrations/20261120_app_logs.sql` | جدول `app_logs` (سجلات) | **متحذفش**: الجدول ده سجل تدقيق + مصدر الـ logs. لو هو اللي بيكسر، رجّع الكود بس (الكود بيفشل open لو الجدول مش موجود). |
| `supabase/migrations/20261123_app_settings.sql` | جدول `app_settings` + `app_settings_audit` | **متحذفش**. لو محتاج ترجّع قيمة، اعمل `update app_settings set value = … where key = …` (السجل القديم في `app_settings_audit`). |
| `supabase/migrations/20261125_play_sessions.sql` | جدول `play_sessions` + 3 صفوف في `app_settings` | **متحذفش** (الـ guard بيكتب فيه heartbeat). لو عملت `drop table` هتبوّظ الميزة بس **مش هيكسر playback** (الكود fail-open). الأفضل: `delete from play_sessions;` ومسيبش الجدول. |

> **تحذير:** مفيش أي `DROP TABLE` متاح كـ "رجوع" هنا. الجداول `profiles` و `enrollments` و `video_sources` و `watch_events` فيها **بيانات طلاب** — أي `delete`/`drop` عليهم بيمسح بيانات حقيقية وبيكسر المنصة. لو migration جد نفسه مالوش حالة → سجّل وامشِ.

- [ ] **لو migration اتعطلت أثناء التطبيق** — **المكان:** Supabase → SQL Editor → شوف الرسالة. — **ليه:** الـ SQL بتاع الـ migration idempotent (يتنفذ تاني من غير مشكلة) فيمكن تعيد تشغيله. — **التأكد:** الـ error بيختفي والجداول/الصفوف موجودة (`select key,value from app_settings order by key;`). — `CAUTION` — **الرجوع:** ملوش — الـ migrations idempotent.

## PHASE 9 — احسمها بعدين (مؤرشف، مش مدموج)

4 برانشات قديمة من شغل سابق لسه على الـ remote، وفيها commits **مش موجودة في `main`** (`git cherry` بيقول كده). اتعملها **archive tags** — **مش اتدمجت، ومش اتمسحت**. البرانشات نفسها سابت زي ما هي.

| الـ archive tag | البرانش الأصلي | الـ commit | فيه إيه |
|---|---|---|---|
| `archive/feat/mobile-app-bootstrap` | `feat/mobile-app-bootstrap` | `8d338dc` | 6 commits: شغل Expo bootstrap (تصغير الـ bundle + الشاشات) |
| `archive/feat/mobile-screens` | `feat/mobile-screens` | `185fc4b` | 5 commits: شاشات الموبايل + تسجيل baseline `stable-2026-11-21` |
| `archive/worker-video-proto` | `feat/worker-video-proto` | `2e1cbb8` | 6 commits: prototype الـ Worker → Drive → YouTube chain |
| `archive/fix/mobile-drive-playerView` | `fix/mobile-drive-playerView` | `e7eeaf8` | 5 commits: ضبط إطار Drive جوه fullscreen |

- [ ] **احسمهم لما ييجي وقتها** — **المكان:** GitHub → Tags (أو `git ls-remote --tags origin | grep archive/`). — **ليه:** الشغل القديم محفوظ كـ tags من غير ما يفضل مفتوح على الـ remote، ومتشالوش نهائيًا. — **التأكد:** الـ 4 tags موجودة على الـ remote. — `SAFE` — **الرجوع:** `git tag -d archive/<name> && git push origin :refs/tags/archive/<name>` (البرانش نفسه موجود كمان، فالشغل مش ضاع).
- **لو decided تدمج واحد منهم:** افتح PR جديد من البرانش الأصلي (لسه موجود) أو من الـ tag — **مش من الـ main مباشرة**.
- **مهم:** ده **مش** بيعني إن ده شغل ناقص في `main` — ده شغل **قديم** بقى متقادم من شغلات سابقة، وأغلبه ات solving بطرق تانية في `main` (زي `fix/player-tier-machine` و `fix/watch-resolve-and-worker-diag` اللي طلعوا متطابقين في المحتوى مع `main`).

---

## لو حاجة باظت — أول حاجة تشيك عليها

> **مهم:** `app_logs` دلوقتي فيه صفوف **`env=dev` بس** (مفيش صف واحد من الإنتاج). أخطاء **الإنتاج** تُقرأ من **سجلات Vercel**: Vercel → project `kinetechtest` → **Logs** (lines السيرفر) — مش من `app_logs`. أمر `npm run logs -- --source db` بيفيدك للـ dev ولـ الـ client-shipped lines بس.

| العَرَض | أول حاجة تشيك | الـ toggle / الرجوع |
|---|---|---|
| الدرس مش بيشتغل خالص (حتى YouTube) | `npm run logs -- --source db --level error --route /api/play --since 1h` (محتاج `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` في env المحلي) — بص على الغلطة الأولى في السلسلة | `direct_drive_enabled` (off/on) + `video_worker_enabled` (off) |
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
