import { GooeyInput } from "@/components/ui/gooey-input";
import { useLang } from "./lang";

const SEARCH_BG = "bg-white text-neutral-500 ring-1 ring-neutral-200";
const SEARCH_INPUT = "text-neutral-700 placeholder:text-neutral-400";

function sectionFor(query: string): string | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  if (/robot|solidworks|cswa|python|data|programm|تدريب|كورس|داتا|بايثون|برمج|سوليد|روبوت/.test(q))
    return "academy";
  if (/market|design|software|service|تسويق|تصميم|خدمة|برمجيات/.test(q))
    return "services";
  if (/review|آراء|تقييم|عميل/.test(q)) return "team";
  if (/contact|whatsapp|تواصل|واتساب|اتصل/.test(q)) return "contact";
  if (/pillar|ركائز|craft/.test(q)) return "pillars";
  return null;
}

export function TopNav() {
  const { lang, t, toggle } = useLang();
  const onSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const v =
      e.currentTarget.querySelector("input")?.value ?? "";
    const id = sectionFor(v);
    if (id) document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };
  const goSignin = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
      return;
    e.preventDefault();
    const root = document.querySelector(".langfade") as HTMLElement | null;
    try {
      window.sessionStorage.setItem("auth-anim", "1");
    } catch {
      /* ignore */
    }
    if (root) root.style.opacity = "0";
    window.setTimeout(() => {
      window.location.href = "signin.html";
    }, 220);
  };
  return (
    <header className="topnav" data-od-id="topnav">
      <div className="kt-wrap topnav-inner">
        <a
          className="brandlock"
          href="#top"
          aria-label="KineTech home"
          data-od-id="nav-brand"
        >
          <img
            className="logo-img"
            src="assets/logo.png"
            width="48"
            height="48"
            alt="KineTech split-circle logo"
            style={{ width: 48, height: 48 }}
          />
          <span className="wordmark">
            <span className="k">KINE</span>
            <span className="t">TECH</span>
          </span>
        </a>
        <div className="row" style={{ gap: 10 }}>
          <form
            onSubmit={onSearch}
            role="search"
            dir={lang === "ar" ? "rtl" : "ltr"}
            className="hidden md:block"
            aria-label={lang === "ar" ? "بحث" : "Search"}
          >
            <GooeyInput
              placeholder={lang === "ar" ? "ابحث" : "Search"}
              collapsedWidth={132}
              expandedWidth={200}
              expandedOffset={50}
              classNames={{
                trigger: SEARCH_BG,
                bubbleSurface: SEARCH_BG,
                input: SEARCH_INPUT,
              }}
            />
          </form>
          <button
            className="btn btn-secondary lang-toggle"
            type="button"
            onClick={toggle}
            aria-label="Switch language"
          >
            {t.toggle}
          </button>
          <a href="signin.html" onClick={goSignin} data-od-id="nav-cta" className="nav-signin">
            {t.nav.signin}
          </a>
        </div>
      </div>
    </header>
  );
}
