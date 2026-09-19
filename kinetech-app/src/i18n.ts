export type Lang = "en" | "ar";

const en = {
  toggle: "عربي",
  menu: "Open menu",
  nav: {
    services: "Services",
    academy: "Academy",
    reviews: "Reviews",
    signin: "Sign in",
    contact: "Contact",
    explore: "Explore services",
    whatsapp: "WhatsApp Us",
  },
  hero: {
    pill: "Company + Academy",
    t1: "Build Market",
    t2: "Design Teach",
    script: "one team, four crafts",
    lead: "KineTech is a technology company with four equal pillars — marketing, software, design, and hands-on engineering courses. One partner from strategy to execution.",
    cta1: "Start a Conversation",
    cta2: "See all 4 pillars →",
    c1: "Full-stack delivery, not just advice",
    c2: "Engineers who also teach",
    p1t: "01 · Marketing Services",
    p1d: "Social media management · content strategy · growth campaigns.",
    p2t: "02 · Software Services",
    p2d: "Custom web + app builds · integrations · delivered for clients.",
    p3t: "03 · Design Services",
    p3d: "UI/UX design · brand identity · production-ready handoff.",
    p4t: "04 · Academy Courses",
    p4d: "Python · Data · SolidWorks CSWA — limited seats per group.",
  },
  trust: {
    t1t: "Certified engineers",
    t1d: "Client work and courses led by ENG/-credited staff.",
    t2t: "From strategy to execution",
    t2d: "Marketing, code and design ship together, not in silos.",
    t3t: "Beginner to certification-ready",
    t3d: "Academy runs from ZERO level to CSWA preparation.",
  },
  pillars: {
    eyebrow: "Four pillars · equal weight",
    h2: "One company, four crafts.",
    bigPill: "Services + Academy",
    bigH: "We do the work — then we teach it.",
    bigP:
      "Client delivery funds real expertise; the academy passes it on. No theory detached from practice, no agency that can't build.",
    bigC1: "Strategy plus shipping",
    bigC2: "Arabic + English delivery",
    howH: "How to engage",
    howP: "One message for any pillar — tell us your goal.",
    howCta: "Contact about a pillar",
    mindH: "Half-machine, half-mind",
    mindP:
      "Technical rigor on one side, human teaching and design on the other — the split-circle idea in every engagement.",
    c1pill: "Pillar 01",
    c1t: "Marketing Services",
    c1d: "Social Media Management · Growth Campaigns",
    c1a: "Details →",
    c2pill: "Pillar 02",
    c2t: "Programming Services",
    c2d: "Custom Web Builds · App Development",
    c2a: "Details →",
    c3pill: "Pillar 03",
    c3t: "Design Services",
    c3d: "UI/UX Design · Brand Identity",
    c3a: "Details →",
    c4pill: "Pillar 04",
    c4t: "Academy Courses",
    c4d: "Python · Data · CSWA — limited seats!",
    c4a: "Courses →",
  },
  services: {
    eyebrow: "Service pillars in detail",
    h2: "What each service delivers.",
    mktT: "Marketing Services",
    mktD: "Growth support for clients who need momentum, not slides.",
    mktI: ["Social Media Management", "Content Strategy", "Growth Campaigns"],
    softT: "Programming Services",
    softD:
      "Custom software clients actually launch — distinct from the courses that teach programming.",
    softI: ["Custom Web Builds", "App Development", "Integrations & Support"],
    desT: "Design Services",
    desD:
      "Interfaces and identities with production-ready handoff to engineering.",
    desI: ["UI/UX Design", "Brand Identity Design", "Design Systems"],
    noteH: "Engagement note",
    noteP:
      "Tell us the outcome you need — we scope it as one delivery. Full scopes get their own pages.",
    noteCta: "Ask About a Service",
    gets: "What lands with you",
    mktG: [
      "Monthly content calendar",
      "Ad performance reports",
      "Growth review calls",
    ],
    softG: ["Live website or app", "Source code + docs", "Launch + aftercare"],
    desG: ["Screens + prototype", "Full identity kit", "Dev-ready handoff"],
    crsT: "Academy Courses",
    crsD: "Hands-on tracks with certified engineers — limited seats.",
    crsI: ["Programming from ZERO", "Python & Data tracks", "SolidWorks CSWA prep"],
    crsG: ["Structured curriculum", "Real capstone projects", "Certificate + CSWA prep"],
  },
  academy: {
    eyebrow: "Pillar 04 · Academy",
    h2: "Courses with engineers.",
    courses: [
      {
        name: "Programming & Data Course",
        designation: "Taught by a certified engineer · Our course",
        quote:
          "Python and data fundamentals — core building blocks, data wrangling with Pandas, and interactive capstone projects.",
      },
      {
        name: "Robotics Course",
        designation: "Foundations in Robotics · Our course",
        quote:
          "No experience? No problem. Learn by building — sensor integration, real robots from your ideas.",
      },
      {
        name: "SolidWorks Course",
        designation: "ENG/ Mohamed Walid · CSWA prep",
        quote:
          "From ZERO level to CSWA preparation — CAD training and real-life models. Limited seats!",
      },
    ],
    ctas: [
      "Ask about Python & Data",
      "Ask about Robotics",
      "Ask about CAD",
    ],
  },
  reviews: {
    eyebrow: "Reviews",
    h2: "What our users say.",
    cards: [
      {
        q: "From ZERO level to shipping my first web app. The logic-first teaching made frameworks click.",
        n: "Briana Patton",
        r: "Programming Course",
      },
      {
        q: "Smooth from day one. Small group, real review on every assignment — never felt lost.",
        n: "Bilal Ahmed",
        r: "Data Course",
      },
      {
        q: "The instructors answer like engineers, not a helpdesk. CSWA drills got me exam-ready.",
        n: "Saman Malik",
        r: "CAD / SolidWorks",
      },
      {
        q: "They scoped our marketing and site as one delivery. Strategy plus shipping, no silos.",
        n: "Omar Raza",
        r: "Marketing Services",
      },
      {
        q: "Brand identity plus UI that developers could actually build from. Clean handoff.",
        n: "Zainab Hussain",
        r: "Design Services",
      },
      {
        q: "Custom web build delivered and supported after launch. It just works.",
        n: "Aliza Khan",
        r: "Software Services",
      },
      {
        q: "Pandas finally makes sense. Wrangling real datasets beat watching tutorials.",
        n: "Farhan Siddiqui",
        r: "Data Course",
      },
      {
        q: "Real-life models, not toy exercises. Assemblies and drawings from day one.",
        n: "Sana Sheikh",
        r: "CAD / SolidWorks",
      },
      {
        q: "Evening groups fit my university schedule. Real engineers.",
        n: "Hassan Ali",
        r: "Programming Course",
      },
    ],
    note: "Sample stories — replace with verified feedback before launch.",
    allBtn: "All reviews →",
  },
  contact: {
    h2: "Service or seat? Talk to us.",
    p: "One message covers all four pillars — marketing, software, design, or a course seat. A real engineer replies with scope, times and fees.",
    wa: "WhatsApp KineTech",
    fb: "Facebook Page",
    metaNum: "+20 10 4203 1062",
    metaFb: "KineTech on Facebook",
    mapT: "One message. Everywhere.",
    mapD: "WhatsApp + Facebook — wherever you are.",
  },
  footer: {
    tag: "Academy · Marketing · Software · Design.",
    phone: "+20 10 4203 1062",
    fb: "KineTech on Facebook",
    rights: "© 2026 KineTech · Half-machine, half-mind.",
  },
  flow: {
    eyebrow: "How it works",
    h2: "From message to delivery.",
    steps: [
      {
        title: "Tell us your goal",
        desc: "One message for a course seat — or marketing, software, design.",
      },
      {
        title: "We scope it",
        desc: "Strategy plus shipping. One delivery with clear times and fees.",
      },
      {
        title: "We ship it",
        desc: "Engineers build and launch — campaigns, code, and design together.",
      },
      {
        title: "You keep growing",
        desc: "Courses pass the same expertise on — from ZERO level to certified.",
      },
    ],
    ctaTitle: "Start with a message",
    ctaText: "A real engineer replies with scope, times, and fees.",
    ctaBtn: "Start a Conversation",
  },
};

export type Strings = typeof en;

const ar: Strings = {
  toggle: "EN",
  menu: "افتح القائمة",
  nav: {
    services: "الخدمات",
    academy: "الأكاديمية",
    reviews: "الآراء",
    signin: "تسجيل الدخول",
    contact: "تواصل معنا",
    explore: "اكتشف الخدمات",
    whatsapp: "راسلنا واتساب",
  },
  hero: {
    pill: "الشركة + الأكاديمية",
    t1: "نبني نسوّق",
    t2: "نصمّم نعلّم",
    script: "فريق واحد، أربع حرف",
    lead: "كاين تك شركة تكنولوجيا بأربع ركائز متساوية — التسويق، والبرمجيات، والتصميم، وكورسات هندسية عملية. شريك واحد من الاستراتيجية لحد التنفيذ.",
    cta1: "ابدأ محادثة",
    cta2: "← شوف الركائز الأربعة",
    c1: "تنفيذ شامل، مش مجرد استشارات",
    c2: "مهندسون بيشتغلوا وبيدرّسوا",
    p1t: "01 · خدمات التسويق",
    p1d: "إدارة السوشيال ميديا · استراتيجية المحتوى · حملات النمو.",
    p2t: "02 · خدمات البرمجيات",
    p2d: "مواقع وتطبيقات مخصصة · تكاملات · بتتسلم للعملاء.",
    p3t: "03 · خدمات التصميم",
    p3d: "تصميم واجهات · هوية بصرية · تسليم جاهز للتنفيذ.",
    p4t: "04 · كورسات الأكاديمية",
    p4d: "بايثون · داتا · سوليدووركس CSWA — عدد محدود لكل مجموعة.",
  },
  trust: {
    t1t: "مهندسون معتمدون",
    t1d: "الشغل والكورسات بقيادة مهندسين بلقب ENG/.",
    t2t: "من الاستراتيجية للتنفيذ",
    t2d: "التسويق والكود والتصميم بيتسلموا مع بعض، مش منفصلين.",
    t3t: "من الصفر للجاهزية للشهادة",
    t3d: "الأكاديمية من مستوى ZERO لحد التحضير لـ CSWA.",
  },
  pillars: {
    eyebrow: "أربع ركائز · بنفس الأهمية",
    h2: "شركة واحدة، أربع حرف.",
    bigPill: "خدمات + أكاديمية",
    bigH: "بنشتغل بإيدينا — وبعدين بنعلّم.",
    bigP:
      "تنفيذ الشغل للعملاء هو اللي بيبني خبرتنا الحقيقية؛ والأكاديمية بتنقلها. لا نظريات منفصلة عن الواقع، ولا شركة مبتعرفش تنفذ.",
    bigC1: "استراتيجية مع التنفيذ",
    bigC2: "تقديم بالعربي والإنجليزي",
    howH: "إزاي نتعامل",
    howP: "رسالة واحدة لأي ركيزة — قولنا هدفك.",
    howCta: "تواصل بخصوص ركيزة",
    mindH: "نصف آلة، نصف عقل",
    mindP:
      "صرامة تقنية في ناحية، وتعليم وتصميم إنساني في الناحية التانية — فكرة الدايرة المنقسمة في كل تعامل.",
    c1pill: "الركيزة 01",
    c1t: "خدمات التسويق",
    c1d: "إدارة السوشيال ميديا · حملات النمو",
    c1a: "← التفاصيل",
    c2pill: "الركيزة 02",
    c2t: "خدمات البرمجة",
    c2d: "مواقع مخصصة · تطوير تطبيقات",
    c2a: "← التفاصيل",
    c3pill: "الركيزة 03",
    c3t: "خدمات التصميم",
    c3d: "تصميم UI/UX · الهوية البصرية",
    c3a: "← التفاصيل",
    c4pill: "الركيزة 04",
    c4t: "كورسات الأكاديمية",
    c4d: "بايثون · داتا · CSWA — أماكن محدودة!",
    c4a: "← الكورسات",
  },
  services: {
    eyebrow: "تفاصيل ركائز الخدمات",
    h2: "كل خدمة بتقدم إيه.",
    mktT: "خدمات التسويق",
    mktD: "دعم النمو للعملاء اللي محتاجين زخم، مش شرايح.",
    mktI: ["إدارة السوشيال ميديا", "استراتيجية المحتوى", "حملات النمو"],
    softT: "خدمات البرمجة",
    softD:
      "برمجيات مخصصة العملاء بيطلقوها فعلاً — مختلفة عن الكورسات اللي بتعلّم البرمجة.",
    softI: ["مواقع مخصصة", "تطوير التطبيقات", "تكاملات ودعم"],
    desT: "خدمات التصميم",
    desD: "واجهات وهويات بتسليم جاهز للتنفيذ الهندسي.",
    desI: ["تصميم UI/UX", "تصميم الهوية البصرية", "أنظمة التصميم"],
    noteH: "ملحوظة عن التعامل",
    noteP:
      "قولنا النتيجة اللي محتاجها — وبنحددها كتسليم واحد. النطاقات الكاملة ليها صفحاتها.",
    noteCta: "اسأل عن خدمة",
    gets: "هتستلم إيه",
    mktG: ["تقويم محتوى شهري", "تقارير أداء الحملات", "مكالمات مراجعة النمو"],
    softG: ["موقع أو تطبيق لايف", "السورس كود + توثيق", "إطلاق + متابعة"],
    desG: ["شاشات + بروتوتايب", "هوية كاملة", "تسليم جاهز للمطورين"],
    crsT: "كورسات الأكاديمية",
    crsD: "مسارات عملية مع مهندسين معتمدين — أماكن محدودة.",
    crsI: ["البرمجة من ZERO", "مسارات بايثون والداتا", "سوليدووركس وتحضير CSWA"],
    crsG: ["منهج منظم", "مشاريع حقيقية", "شهادة + تحضير CSWA"],
  },
  academy: {
    eyebrow: "الركيزة 04 · الأكاديمية",
    h2: "كورسات مع مهندسين.",
    courses: [
      {
        name: "كورس البرمجة والداتا",
        designation: "بقيادة مهندس معتمد · كورسنا",
        quote:
          "أساسيات بايثون والداتا — اللبنات الأساسية، وتنظيم الداتا بـ Pandas، ومشاريع تطبيقية تفاعلية.",
      },
      {
        name: "كورس الروبوتكس",
        designation: "أساسيات الروبوتكس · كورسنا",
        quote:
          "من غير خبرة لروبوتات حقيقية — اتعلم بالتنفيذ: حساسات وتكامل وروبوتات من أفكارك.",
      },
      {
        name: "كورس سوليدووركس",
        designation: "م/ محمد وليد · تحضير CSWA",
        quote:
          "من مستوى ZERO لحد التحضير لـ CSWA — تدريب CAD وموديلات من الواقع. أماكن محدودة!",
      },
    ],
    ctas: ["اسأل عن بايثون والداتا", "اسأل عن الروبوتكس", "اسأل عن الـ CAD"],
  },
  reviews: {
    eyebrow: "الآراء",
    h2: "عملاؤنا بيقولوا إيه.",
    cards: [
      {
        q: "من مستوى ZERO لحد ما أطلقت أول تطبيق ويب. التدريس اللي بيبدأ بالمنطق خلا الفريموركس مفهومة.",
        n: "بريانا باتون",
        r: "كورس البرمجة",
      },
      {
        q: "سلاسة من أول يوم. مجموعة صغيرة ومراجعة حقيقية لكل واجب — محسّتش إني تايهة.",
        n: "بلال أحمد",
        r: "كورس الداتا",
      },
      {
        q: "المدرسون بيردوا كمهندسين، مش كخدمة عملاء. تدريبات CSWA جهزتني للامتحان.",
        n: "سامان مالك",
        r: "CAD / سوليدووركس",
      },
      {
        q: "حددوا التسويق والموقع كتسليم واحد. استراتيجية مع التنفيذ، من غير جزر منعزلة.",
        n: "عمر رضا",
        r: "خدمات التسويق",
      },
      {
        q: "هوية بصرية وواجهات المطورون يقدروا ينفذوها فعلاً. تسليم نضيف.",
        n: "زينب حسين",
        r: "خدمات التصميم",
      },
      {
        q: "موقع مخصص اتسلم واتدعم بعد الإطلاق. شغال وبس.",
        n: "أليزا خان",
        r: "خدمات البرمجيات",
      },
      {
        q: "أخيراً فهمت Pandas. التعامل مع داتا حقيقية أحسن من مشاهدة الشروحات.",
        n: "فرحان صديقي",
        r: "كورس الداتا",
      },
      {
        q: "موديلات من الواقع، مش تمارين وهمية. تجميعات ولوحات من أول يوم.",
        n: "سناء شيخ",
        r: "CAD / سوليدووركس",
      },
      {
        q: "مجموعات المساء ناسبتني مع جدول الجامعة. مهندسون حقيقيون.",
        n: "حسن علي",
        r: "كورس البرمجة",
      },
    ],
    note: "قصص استرشادية — استبدلها بتقييمات موثقة قبل الإطلاق.",
    allBtn: "← كل الآراء",
  },
  contact: {
    h2: "خدمة ولا مقعد؟ كلمنا.",
    p: "رسالة واحدة تغطي الركائز الأربعة — تسويق، برمجيات، تصميم، أو مقعد في كورس. مهندس حقيقي بيرد بالنطاق والمواعيد والأسعار.",
    wa: "واتساب كاين تك",
    fb: "صفحة الفيسبوك",
    metaNum: "+20 10 4203 1062",
    metaFb: "كاين تك على فيسبوك",
    mapT: "رسالة واحدة. في كل مكان.",
    mapD: "واتساب وفيسبوك — أينما كنت.",
  },
  footer: {
    tag: "أكاديمية · تسويق · برمجيات · تصميم.",
    phone: "+20 10 4203 1062",
    fb: "كاين تك على فيسبوك",
    rights: "© 2026 كاين تك · نصف آلة، نصف عقل.",
  },
  flow: {
    eyebrow: "إزاي بنشتغل",
    h2: "من الرسالة للتسليم.",
    steps: [
      {
        title: "قولنا هدفك",
        desc: "رسالة واحدة لحجز مقعد في كورس — أو تسويق، برمجيات، تصميم.",
      },
      {
        title: "بنحدد النطاق",
        desc: "استراتيجية مع التنفيذ. تسليم واحد بمواعيد وأسعار واضحة.",
      },
      {
        title: "بننفذها",
        desc: "مهندسون بيبنوا ويطلقوا — حملات وكود وتصميم مع بعض.",
      },
      {
        title: "بتكمل نمو",
        desc: "الكورسات بتنقل نفس الخبرة — من مستوى ZERO للشهادة.",
      },
    ],
    ctaTitle: "ابدأ برسالة",
    ctaText: "مهندس حقيقي بيرد بالنطاق والمواعيد والأسعار.",
    ctaBtn: "ابدأ محادثة",
  },
};

export const STR: Record<Lang, Strings> = { en, ar };

export function getInitialLang(): Lang {
  if (typeof window === "undefined") return "ar";
  try {
    return window.localStorage.getItem("kt-lang") === "en" ? "en" : "ar";
  } catch {
    return "ar";
  }
}
