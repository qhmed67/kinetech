/* Shared EN/AR dictionary + fade toggle for static auth pages. */
(function () {
  var I18N = {
    en: {
      toggle: "عربي",
      signinTitle: "Sign in · KineTech",
      signupTitle: "Sign up · KineTech",
      backAlt: "KineTech home",
      inH1: "Welcome back!",
      inSub:
        "We empower developers and technical teams to create, simulate, and manage AI-driven workflows visually",
      upH1: "Create your account!",
      upSub:
        "Join KineTech Academy — learn programming, data, and CAD with engineers, from ZERO level to certification",
      fn: "First name",
      fnPh: "Mohamed",
      ln: "Last name",
      lnPh: "Ahmed",
      email: "Email",
      emailPh: "youremail@yourdomain.com",
      phone: "Phone / WhatsApp",
      phonePh: "+20 1x xxxx xxxx",
      track: "Service Category",
      trackPh: "Choose a service category",
      opt1: "Educational Services / Tutoring",
      opt2: "Marketing & Growth",
      opt3: "Software & Web Development",
      opt4: "Design & Creative",
      natId: "National ID",
      natIdPh: "14-digit number",
      grade: "Grade",
      gradePh: "Choose your grade",
      g1: "First Secondary Grade",
      g2: "Second Secondary Grade",
      pw: "Password",
      pwPh: "Create a password",
      inSubmit: "Sign in",
      upSubmit: "Create account",
      or: "or",
      google: "Continue with Google",
      googleAria: "Continue with Google",
      inFootPre: "Already have an account? ",
      inFootLink: "Sign up",
      upFootPre: "Already have an account? ",
      upFootLink: "Sign in",
      inPH1: "Build. Market.",
      inPH2: "Design. Teach.",
      inPP:
        "One technology company — marketing, software, design, and hands-on engineering courses.",
      upPH1: "Half-machine.",
      upPH2: "Half-mind.",
      upPP:
        "Engineers who ship client work — and teach it. From ZERO level to certification-ready.",
      pill1: "Programming",
      pill2: "Python + Data",
      inPill3: "SolidWorks",
      upPill3: "CSWA prep",
      inS1: "Verifying your email",
      inS2: "Checking your password",
      inS3: "Opening your dashboard",
      upS1: "Creating your account",
      upS2: "Reserving your track seat",
      upS3: "Setting up your workspace",
      inDone: "Signed in ✓",
      upDone: "Account created ✓",
    },
    ar: {
      toggle: "EN",
      signinTitle: "تسجيل الدخول · كاين تك",
      signupTitle: "إنشاء حساب · كاين تك",
      backAlt: "كاين تك الرئيسية",
      inH1: "أهلاً بعودتك!",
      inSub:
        "نُمكّن المطورين والفرق التقنية من إنشاء ومحاكاة وإدارة سير عمل مدعومة بالذكاء الاصطناعي بصرياً",
      upH1: "أنشئ حسابك!",
      upSub:
        "انضم لأكاديمية كاين تك — اتعلم البرمجة والداتا والـ CAD مع مهندسين، من مستوى ZERO لحد الشهادة",
      fn: "الاسم الأول",
      fnPh: "محمد",
      ln: "اسم العائلة",
      lnPh: "أحمد",
      email: "البريد الإلكتروني",
      emailPh: "youremail@yourdomain.com",
      phone: "الهاتف / واتساب",
      phonePh: "+20 1x xxxx xxxx",
      track: "تصنيف الخدمة",
      trackPh: "اختر تصنيف الخدمة",
      opt1: "خدمات تعليمية / كورسات طلاب",
      opt2: "خدمات التسويق والنمو",
      opt3: "تطوير البرمجيات والمواقع",
      opt4: "خدمات التصميم والإبداع",
      natId: "الرقم القومي",
      natIdPh: "رقم مكون من 14 رقماً",
      grade: "الصف الدراسي",
      gradePh: "اختر صفك الدراسي",
      g1: "الصف الأول الثانوي",
      g2: "الصف الثاني الثانوي",
      pw: "كلمة المرور",
      pwPh: "أنشئ كلمة مرور",
      inSubmit: "تسجيل الدخول",
      upSubmit: "إنشاء الحساب",
      or: "أو",
      google: "المتابعة عبر Google",
      googleAria: "المتابعة عبر Google",
      inFootPre: "عندك حساب؟ ",
      inFootLink: "إنشاء حساب",
      upFootPre: "عندك حساب؟ ",
      upFootLink: "تسجيل الدخول",
      inPH1: "نبني. نسوّق.",
      inPH2: "نصمّم. نعلّم.",
      inPP:
        "شركة تكنولوجيا واحدة — تسويق وبرمجيات وتصميم وكورسات هندسية عملية.",
      upPH1: "نصف آلة.",
      upPH2: "نصف عقل.",
      upPP:
        "مهندسون بينفذوا شغل العملاء — ويدرّسوه. من مستوى ZERO لحد الجاهزية للشهادة.",
      pill1: "البرمجة",
      pill2: "بايثون + داتا",
      inPill3: "سوليدووركس",
      upPill3: "تحضير CSWA",
      inS1: "التحقق من بريدك",
      inS2: "التحقق من كلمة المرور",
      inS3: "فتح لوحة حسابك",
      upS1: "إنشاء حسابك",
      upS2: "حجز مقعدك في المسار",
      upS3: "تجهيز مساحة عملك",
      inDone: "تم تسجيل الدخول ✓",
      upDone: "تم إنشاء الحساب ✓",
    },
  };

  function saved() {
    try {
      return window.localStorage.getItem("kt-lang") === "en" ? "en" : "ar";
    } catch (e) {
      return "ar";
    }
  }

  function apply(lang, instant) {
    var dict = I18N[lang] || I18N.en;
    var body = document.body;
    var swap = function () {
      document.documentElement.lang = lang;
      document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
      document.querySelectorAll("[data-i18n]").forEach(function (el) {
        var k = el.getAttribute("data-i18n");
        if (dict[k] != null) el.textContent = dict[k];
      });
      document.querySelectorAll("[data-i18n-ph]").forEach(function (el) {
        var k = el.getAttribute("data-i18n-ph");
        if (dict[k] != null) el.setAttribute("placeholder", dict[k]);
      });
      document.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
        var k = el.getAttribute("data-i18n-aria");
        if (dict[k] != null) el.setAttribute("aria-label", dict[k]);
      });
      document.querySelectorAll("[data-i18n-alt]").forEach(function (el) {
        var k = el.getAttribute("data-i18n-alt");
        if (dict[k] != null) el.setAttribute("alt", dict[k]);
      });
      var tg = document.getElementById("langToggle");
      if (tg) tg.textContent = dict.toggle;
      if (typeof window.syncTrackLabel === "function")
        window.syncTrackLabel(dict);
      try {
        window.localStorage.setItem("kt-lang", lang);
      } catch (e) {}
      body.style.opacity = "1";
    };
    if (instant || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) {
      swap();
    } else {
      body.style.opacity = "0";
      window.setTimeout(swap, 200);
    }
  }

  var reducedMotion = !!(
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  var isAuthNav = false;
  try {
    isAuthNav = window.sessionStorage.getItem("auth-anim") === "1";
    window.sessionStorage.removeItem("auth-anim");
  } catch (e) {}
  function fadeEl() {
    return document.querySelector("main.auth > div") || document.body;
  }
  if (isAuthNav && !reducedMotion) fadeEl().style.opacity = "0";
  /* apply saved language synchronously (before first paint — no EN flash) */
  apply(saved(), true);
  document.addEventListener("DOMContentLoaded", function () {
    if (isAuthNav && !reducedMotion) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          fadeEl().style.opacity = "1";
        });
      });
    }
    document
      .querySelectorAll('a[href$="signup.html"], a[href$="signin.html"]')
      .forEach(function (a) {
        a.addEventListener("click", function (e) {
          if (reducedMotion) return;
          e.preventDefault();
          try {
            window.sessionStorage.setItem("auth-anim", "1");
          } catch (err) {}
          fadeEl().style.opacity = "0";
          var href = a.getAttribute("href");
          window.setTimeout(function () {
            window.location.href = href;
          }, 220);
        });
      });
    var tg = document.getElementById("langToggle");
    if (tg) {
      tg.addEventListener("click", function () {
        apply(document.documentElement.dir === "rtl" ? "en" : "ar", false);
      });
    }
  });

  window.__authDict = function () {
    return I18N[saved()] || I18N.en;
  };

  /* Vanilla multi-step loader: staged check list, same behavior as the
     aceternity registry component (no loop, 1400ms per step). */
  var OUTLINE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="24" height="24" aria-hidden="true"><path d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>';
  var FILLED =
    '<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24" aria-hidden="true"><path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clip-rule="evenodd"/></svg>';

  window.runAuthLoader = function (btn, stepKeys, doneKey) {
    var dict = I18N[saved()] || I18N.en;
    var overlay = document.getElementById("msl");
    var list = document.getElementById("mslList");
    var finish = function () {
      btn.disabled = false;
      btn.textContent = dict[doneKey] || "Done ✓";
    };
    if (
      !overlay ||
      !list ||
      (window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    ) {
      finish();
      return;
    }
    btn.disabled = true;
    list.innerHTML = "";
    var rows = stepKeys.map(function (k) {
      var row = document.createElement("div");
      row.className = "msl-row";
      row.innerHTML =
        '<span class="msl-ic">' + OUTLINE + "</span><span>" + dict[k] + "</span>";
      list.appendChild(row);
      return row;
    });
    var render = function (value) {
      rows.forEach(function (row, i) {
        var dist = Math.abs(i - value);
        row.style.opacity = String(Math.max(1 - dist * 0.25, 0));
        row.classList.toggle("current", i === value);
        row.querySelector(".msl-ic").innerHTML = i <= value ? FILLED : OUTLINE;
      });
      list.style.transform = "translateY(" + -value * 40 + "px)";
    };
    overlay.hidden = false;
    requestAnimationFrame(function () {
      overlay.classList.add("show");
    });
    var value = 0;
    render(value);
    var tick = function () {
      if (value >= stepKeys.length - 1) {
        window.setTimeout(function () {
          overlay.classList.remove("show");
          window.setTimeout(function () {
            overlay.hidden = true;
            finish();
          }, 300);
        }, 900);
        return;
      }
      value += 1;
      render(value);
      window.setTimeout(tick, 1400);
    };
    window.setTimeout(tick, 1400);
  };
})();
