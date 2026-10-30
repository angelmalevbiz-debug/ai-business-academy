"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from 'next/dynamic';
import {
  ArrowRight,
  ArrowUpRight,
  ArrowLeft,
  Path as PathIcon,
  Books,
  UsersThree,
  Wrench,
  BookmarkSimple,
  MagnifyingGlass,
  Bell,
  CaretDown,
  CaretRight,
  Check,
  CheckCircle,
  Clock,
  Sparkle,
  X,
  List,
  SignOut,
  GearSix,
  ShieldCheck,
  PaperPlaneTilt,
  ChatCircle,
  ArrowSquareOut,
  Lock,
  Target,
  WarningCircle,
  Compass,
  FlowArrow,
  Globe,
  Storefront,
  Info,
} from "@phosphor-icons/react";
import { PATHS as SEED_PATHS, LESSONS as SEED_LESSONS } from "@/lib/content";
import { brand } from "@/lib/brand";
import type { WorkspaceData, Post } from "@/lib/domain";
import Link from "next/link";
import { AdminControlDesk } from './admin-control-desk';
import { CommunitySurface } from './community-surface';
import { ExamplePathCard } from './example-path-card';
import exampleStyles from './example-path-card.module.css';
import { AccountDataControls } from './account-data-controls';
import { TemplateShelf } from './template-shelf';
import { QuickLessonReport } from './quick-lesson-report';
import { ModalFrame, PageHeading, EmptyState } from "./ui";
import { Onboarding } from "./onboarding";
import { WorkspaceHome } from "./workspace-home";
import { BrandLogo } from "./brand-logo";
import {BusinessGoals} from './business-goals';
import {GoogleSignIn} from './google-sign-in';

type View =
  | "overview"
  | "path"
  | "library"
  | "community"
  | "tools"
  | "saved"
  | "profile"
  | "admin"
  | "lesson"
  | "daily"
  | "universe"
  | "workflow"
  | "business"
  | "websites"
  | "studio";
type Modal =
  "login" | "register" | "onboarding" | "post" | "notifications" | "about" | null;
type QuickReport = {
  lessonId: string;
  tried: string;
  outcome: string;
  check: string;
};
const views: View[] = [
  "overview",
  "path",
  "library",
  "community",
  "tools",
  "saved",
  "profile",
  "admin",
  "lesson",
  "daily",
  "universe",
  "workflow",
  "business",
  "websites",
  "studio",
];
const navigation = [
  { view: "overview" as View, group: "ЗАПОЧНИ", label: "Начало", icon: Compass },
  { view: "business" as View, group: "ЗАПОЧНИ", label: "Бизнес", icon: Storefront },
  { view: "workflow" as View, group: "ЗАПОЧНИ", label: "Работа с AI", icon: FlowArrow },
  { view: "library" as View, group: "РАЗГЛЕДАЙ", label: "Примери", icon: Compass },
  { view: "community" as View, group: "РАЗГЛЕДАЙ", label: "Общност", icon: UsersThree },
  { view: "universe" as View, group: "ЗА ТЕБ", label: "Фокус и навици", icon: Sparkle },
  { view: "daily" as View, group: "ЗА ТЕБ", label: "План за деня", icon: Target },
  { view: "path" as View, group: "ЗА ТЕБ", label: "Моят път", icon: PathIcon },
  { view: "tools" as View, group: "ОЩЕ", label: "AI инструменти", icon: Wrench },
  { view: "websites" as View, group: "ОЩЕ", label: "Моите сайтове", icon: Globe },
];
const viewLabels: Record<View, string> = {
  overview: "Начало",
  path: "Моят път",
  library: "Примери",
  community: "Общност",
  tools: "AI инструменти",
  saved: "Запазени",
  profile: "Моят профил",
  admin: "Администрация",
  lesson: "Пример в действие",
  daily: "План за деня",
  universe: "Фокус и навици",
  workflow: "Работа с AI",
  business: "Бизнес",
  websites: "Моите сайтове",
  studio: "Студио за съдържание",
};

function SurfaceLoading() {
  return <div className="surface-loading" role="status"><span className="surface-loading-route" aria-hidden="true"><i/><b/><i/><b/><i/></span><span>Зарежда се</span></div>;
}
const loadUniverse = () => import('./universe');
const loadDailyPlan = () => import('./daily-plan');
const loadContentStudio = () => import('./content-studio');
const loadAdminReview = () => import('./admin-review');
const loadScenario = () => import('./interactive-scenario');
const loadWorkflow = () => import('./workflow');
const Workflow = dynamic(() => loadWorkflow().then(module=>module.Workflow), {loading:SurfaceLoading});
const WebsiteStudio = dynamic(() => import('./website-studio').then(module=>module.WebsiteStudio), {loading:SurfaceLoading});
const MessageSorter = dynamic(() => import('./message-sorter').then(module=>module.MessageSorter), { loading: SurfaceLoading });
const Universe = dynamic(() => loadUniverse().then(module => module.Universe), { loading: SurfaceLoading });
const DailyPlan = dynamic(() => loadDailyPlan().then(module => module.DailyPlan), { loading: SurfaceLoading });
const ContentStudio = dynamic(() => loadContentStudio().then(module => module.ContentStudio), { loading: SurfaceLoading });
const AdminReview = dynamic(() => loadAdminReview().then(module => module.AdminReview), { loading: SurfaceLoading });
const InteractiveScenario = dynamic(() => loadScenario().then(module => module.InteractiveScenario), { loading: SurfaceLoading });

function preloadView(view: View) {
  const load = view === 'workflow' ? loadWorkflow : view === 'universe' ? loadUniverse : view === 'daily' ? loadDailyPlan : view === 'studio' ? loadContentStudio : view === 'admin' ? loadAdminReview : view === 'lesson' ? loadScenario : null;
  if (load) void load().catch(() => { /* An optional preload can retry when its surface opens. */ });
}

const categoryLabels = {
  question: "Въпрос",
  progress: "Работа в процес",
  resource: "Ресурс",
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
}
function formatDate(value: string) {
  return new Date(value).toLocaleDateString("bg-BG", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Sofia",
  });
}
function draftPostTitle(body: string) {
  const compact = body.trim().replace(/\s+/g, " ");
  const end = compact.search(/[.!?](?=\s|$)/);
  const firstSentence = end >= 4 ? compact.slice(0, end + 1) : compact;
  return (firstSentence.length >= 5 ? firstSentence : compact).slice(0, 140);
}

export function CommunityApp({
  initialView,
  initialLesson,
  initialFrom,
  initialFilter,
}: {
  initialView: string;
  initialLesson?: string;
  initialFrom?: string;
  initialFilter?: string;
}) {
  const [view, setView] = useState<View>(
    views.includes(initialView as View) ? (initialView as View) : "overview",
  );
  const [lessonId, setLessonId] = useState(initialLesson || "process-map");
  const [lessonOrigin,setLessonOrigin] = useState<'library'|'saved'|'path'|'overview'>(initialFrom==='library'||initialFrom==='saved'||initialFrom==='overview'?initialFrom:'path');
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [postKind, setPostKind] = useState<Post["category"]>("question");
  const [busy, setBusy] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const navFocusTarget = useRef<"trigger" | "content" | "none">("trigger");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [category, setCategory] = useState("all");
  const [activePost, setActivePost] = useState<string | null>(null);
  const [draftEdits, setDraftEdits] = useState<Record<string, string>>({});

  const [libraryFilter, setLibraryFilter] = useState(initialFilter||"all");
  const [toolProblem, setToolProblem] = useState("");
  const [quickReport, setQuickReport] = useState<QuickReport>({ lessonId: "", tried: "", outcome: "", check: "" });
  const [studioDirty, setStudioDirty] = useState(false);
  const [workflowDirty,setWorkflowDirty]=useState(false);
  const [websiteDirty,setWebsiteDirty]=useState(false);
  const journeySurface = view === 'path' || view === 'lesson';

  useEffect(() => {
    if (!mobileNav) return;
    const mobile = window.matchMedia("(max-width: 1100px)");
    const sidebar = sidebarRef.current;
    const menuTrigger = menuTriggerRef.current;
    if ((!mobile.matches && !journeySurface) || !sidebar) return;
    const appBody = document.querySelector<HTMLElement>(".app-body");
    const wasInert = appBody?.inert || false;
    const previousOverflow = document.body.style.overflow;
    if (appBody) appBody.inert = true;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        sidebar.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getClientRects().length > 0);
    const firstItem = sidebar.querySelector<HTMLElement>(".nav-item") || focusable()[0];
    let initialFocus = requestAnimationFrame(() => {
      initialFocus = requestAnimationFrame(() => {
        // A user can reach another destination before the opening transition ends.
        // Keep their chosen link focused instead of sending the next Enter to home.
        if (!sidebar.contains(document.activeElement)) firstItem?.focus({ preventScroll: true });
      });
    });
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileNav(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || !sidebar!.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !sidebar!.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }
    function containFocus(event: FocusEvent) {
      if (!sidebar!.contains(event.target as Node)) focusable()[0]?.focus();
    }
    function resize() {
      if (!mobile.matches && !journeySurface) {
        navFocusTarget.current = "none";
        setMobileNav(false);
      }
    }
    document.addEventListener("keydown", keydown);
    document.addEventListener("focusin", containFocus);
    mobile.addEventListener("change", resize);
    return () => {
      cancelAnimationFrame(initialFocus);
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("focusin", containFocus);
      mobile.removeEventListener("change", resize);
      if (appBody) appBody.inert = wasInert;
      document.body.style.overflow = previousOverflow;
      const destination = navFocusTarget.current;
      requestAnimationFrame(() => {
        const focused = document.activeElement;
        const userMovedFocus = focused instanceof HTMLElement && focused !== document.body && focused !== menuTrigger && focused.id !== 'main-content' && !sidebar?.contains(focused);
        if (userMovedFocus) return;
        if (destination === "content") document.getElementById("main-content")?.focus({ preventScroll: true });
        else if (destination === "trigger" && menuTrigger?.getClientRects().length) menuTrigger.focus();
      });
    };
  }, [mobileNav, journeySurface]);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/workspace");
      const value = await response.json();
      if (!response.ok)
        throw new Error(value.error || "Страницата не се зареди. Опитай отново.");
      setData(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Няма връзка със сървъра.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/workspace", { signal: controller.signal })
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok)
          throw new Error(
            value.error || "Страницата не се зареди. Опитай отново.",
          );
        return value as WorkspaceData;
      })
      .then((value) => setData(value))
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Няма връзка със сървъра.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const retainedUrl=window.location.href;
    function back() {
      if(view==='websites'&&websiteDirty&&!window.confirm('Имаш незапазени промени в сайта. Да напуснем без тях?')){window.history.pushState({},'',retainedUrl);return;}
      const params = new URLSearchParams(window.location.search);
      const target = params.get("view") as View;
      if(view==='workflow'&&target!=='workflow'&&workflowDirty&&!window.confirm('Имаш незапазен текст в Workflow. Искаш ли да напуснеш без да го запазиш?')){window.history.pushState({},'',retainedUrl);return;}
      setView(views.includes(target) ? target : "overview");
      setLessonId(params.get("lesson") || "process-map");
      const from=params.get('from');setLessonOrigin(from==='library'||from==='saved'||from==='overview'?from:'path');
      if(params.get('filter'))setLibraryFilter(params.get('filter')!);
      navFocusTarget.current = "content";
      setMobileNav(false);
    }
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, [view,workflowDirty,websiteDirty]);

  function navigate(target: View, id?: string, retainedSearch = '') {
    if(view==='websites'&&target!=='websites'&&websiteDirty&&!window.confirm('Имаш незапазени промени в сайта. Да напуснем без тях?'))return;
    if(view==='workflow'&&target!=='workflow'&&workflowDirty&&!window.confirm('Имаш незапазен текст в Workflow. Искаш ли да напуснеш без да го запазиш?'))return;
    if (view === 'studio' && target !== 'studio' && studioDirty && !window.confirm('Имаш незапазени промени в студиото. Искаш ли да напуснеш без да ги запазиш?')) return;
    preloadView(target);
    const changeView = () => {
    if (mobileNav) navFocusTarget.current = "content";
    setView(target);
    setMobileNav(false);
    setSearch(retainedSearch);
    setError("");
    setActivePost(null);
    if (id) setLessonId(id);
    const url = new URL(window.location.href);
    url.search = "";
    if (target !== "overview") url.searchParams.set("view", target);
    if (id) url.searchParams.set("lesson", id);
    if(target==='lesson'){const origin=view==='lesson'?lessonOrigin:view==='library'||view==='saved'||view==='overview'?view:'path';setLessonOrigin(origin);url.searchParams.set('from',origin);if(origin==='library'&&libraryFilter!=='all')url.searchParams.set('filter',libraryFilter);}
    window.history.pushState({}, "", url);
    window.scrollTo({ top: 0, behavior: "instant" });
    };
    changeView();
  }
  function requireUser(action: () => void) {
    if (!data?.user) {
      setModal("register");
      return;
    }
    action();
  }
  function openWorkflowIntent(goal:'content'|'business'|'automation', recipe?:string) {
    navigate('workflow');
    const url=new URL(window.location.href);url.searchParams.set('goal',goal);if(recipe)url.searchParams.set('task',recipe);window.history.replaceState({},'',url);
  }
  function openWebsite(stage:'new'|'existing'){navigate('websites');const url=new URL(window.location.href);url.searchParams.set('stage',stage);window.history.replaceState({},'',url);}
  function openSavedWorkflow(id:string){navigate('workflow');const url=new URL(window.location.href);url.searchParams.set('project',id);window.history.replaceState({},'',url);}
  function openProductPositioning(){navigate('workflow');const url=new URL(window.location.href);url.searchParams.set('room','positioning');window.history.replaceState({},'',url);}
  function openProgress() {
    requireUser(() => {
      setPostKind("progress");
      setModal("post");
    });
  }
  function openQuestion() {
    requireUser(() => {
      setPostKind("question");
      setModal("post");
    });
  }
  async function mutate(payload: Record<string, unknown>, message?: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const value = await response.json();
      if (!response.ok)
        throw new Error(value.error || "Не успяхме да запазим промяната. Опитай отново.");
      setData(value);
      if (message) setToast(message);
      return true;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Няма връзка. Текстът ти остава тук. Опитай отново.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  const user = data?.user;
  const PATHS = data?.catalog?.paths || SEED_PATHS;
  const LESSONS = data?.catalog?.lessons || SEED_LESSONS;
  const completed = data?.completedLessonIds || [];
  const mainPath =
    PATHS.find(
      (p) =>
        p.lessonIds.length > 0 && p.id ===
        (user?.profile?.goal === "business"
          ? "ai-for-business"
          : user?.profile?.goal === "learn" &&
              user.profile.level === "practitioner"
            ? "ai-development"
            : "automation"),
    ) || PATHS.find(p => p.lessonIds.length > 0) || SEED_PATHS[0];
  const mainLessonIds = mainPath.lessonIds.filter(
    (id) =>
      user?.ageBand !== "14-17" || !LESSONS.find((l) => l.id === id)?.adultOnly,
  );
  const ownSubmissions =
    data?.submissions.filter((s) => s.userId === user?.id) || [];
  const returnedWork = ownSubmissions.find(item=>item.status==='needs_changes');
  const savedWork = data?.development.drafts.find(item=>item.text.trim()&&LESSONS.some(lesson=>lesson.id===item.lessonId));
  const continueWorkId = returnedWork?.lessonId || savedWork?.lessonId;
  const nextLesson =
    LESSONS.find(
      (l) => mainLessonIds.includes(l.id) && !completed.includes(l.id),
    ) || LESSONS.find((l) => l.id === mainLessonIds[0])!;
  const mainCompleted = mainLessonIds.filter((id) =>
    completed.includes(id),
  ).length;
  const pathDone = mainLessonIds.length > 0 && mainCompleted === mainLessonIds.length;
  const lesson = LESSONS.find((l) => l.id === lessonId) || LESSONS[0];
  const draftKey = `${user?.id || 'guest'}:${lesson.id}`;
  const storedDraft = data?.development?.drafts.find(d => d.lessonId === lesson.id)?.text || '';
  const worksheet = draftEdits[draftKey] ?? storedDraft;
  const currentQuickReport = quickReport.lessonId === lesson.id
    ? quickReport
    : { lessonId: lesson.id, tried: "", outcome: "", check: "" };
  const quickReportText = currentQuickReport.tried && currentQuickReport.outcome && currentQuickReport.check
    ? `Пробвах: ${currentQuickReport.tried}. Резултат: ${currentQuickReport.outcome}. Проверих го чрез: ${currentQuickReport.check}.`
    : "";
  const submissionText = worksheet.trim().length >= 30 ? worksheet.trim() : quickReportText;
  const setWorksheet = (text: string) => setDraftEdits(previous => ({ ...previous, [draftKey]: text }));
  function setQuickReportField(field: "tried" | "outcome" | "check", value: string) {
    setQuickReport({ ...currentQuickReport, [field]: value });
  }
  function openQuickReport() {
    const material=document.getElementById('lesson-material');
    if(material instanceof HTMLDetailsElement)material.open=true;
    const details = document.getElementById("lesson-submission");
    if (!(details instanceof HTMLDetailsElement)) return;
    details.open = true;
    requestAnimationFrame(() => {
      details.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" });
      details.querySelector("summary")?.focus();
    });
  }
  function openLessonMaterial() {
    const material=document.getElementById('lesson-material');
    if(!(material instanceof HTMLDetailsElement))return;
    material.open=true;
    requestAnimationFrame(()=>{material.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});material.querySelector('summary')?.focus();});
  }
  useEffect(() => {
    const dirty = Object.entries(draftEdits).some(([key, value]) => {
      if (!key.startsWith(`${user?.id || 'guest'}:`)) return false;
      const id = key.slice(key.indexOf(':') + 1);
      return value !== (data?.development?.drafts.find(draft => draft.lessonId === id)?.text || '');
    });
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draftEdits, data, user?.id]);
  const submission = data?.submissions.find(
    (s) => s.lessonId === lesson.id && s.userId === user?.id,
  );
  const posts = (data?.posts || []).filter(
    (p) =>
      (category === "all" || p.category === category) &&
      (!search ||
        `${p.title} ${p.body}`
          .toLocaleLowerCase("bg")
          .includes(search.toLocaleLowerCase("bg"))),
  );
  const selectedPost = data?.posts.find((p) => p.id === activePost);
  const filteredPaths = PATHS.filter(
    (p) =>
      (view === "saved" || libraryFilter === "all" || p.id === libraryFilter) &&
      (!search ||
        `${p.title} ${p.description}`
          .toLocaleLowerCase("bg")
          .includes(search.toLocaleLowerCase("bg"))),
  );
  const lessonSearchIndex = useMemo(() => LESSONS.map(lesson => ({
    lesson,
    text: `${lesson.title} ${lesson.summary} ${lesson.task} ${lesson.sections.map(section => `${section.title} ${section.body}`).join(' ')}`.toLocaleLowerCase('bg'),
  })), [LESSONS]);
  const searchText = search.toLocaleLowerCase('bg');
  const searchLessons = searchText ? lessonSearchIndex.filter(item => item.text.includes(searchText)).slice(0, 5).map(item => item.lesson) : [];

  function rememberLessonPath(id: string) {
    const path = PATHS.find(item => item.lessonIds.includes(id));
    if (!path) return;
    try { sessionStorage.setItem(`academy:journey:${user?.id || 'guest'}`, JSON.stringify({phase: 'map', pathId: path.id, selectedId: id})); } catch { /* Navigation remains available without browser storage. */ }
  }
  function lessonLink(id: string) {
    rememberLessonPath(id);
    navigate("lesson", id);
  }
  function renderPathCard(path: (typeof PATHS)[number],featured=false) {
    const accessibleIds = path.lessonIds.filter(id => user?.ageBand !== '14-17' || !LESSONS.find(l => l.id === id)?.adultOnly);
    const minutes = LESSONS.filter(l => accessibleIds.includes(l.id)).reduce((sum, l) => sum + l.minutes, 0);
    const saved = data?.bookmarkedPathIds.includes(path.id);
    return <ExamplePathCard key={path.id} path={path} accessibleIds={accessibleIds} completed={completed} minutes={minutes} saved={Boolean(saved)} featured={featured} open={lessonLink} save={()=>requireUser(()=>{void mutate({action:'bookmark',pathId:path.id},saved?'Премахнато от запазени.':'Пътят е запазен.');})}/>;
  }
  function renderLessonList(path = mainPath) {
    return (
      <div className="lesson-list">
        {path.lessonIds
          .filter(
            (id) =>
              user?.ageBand !== "14-17" ||
              !LESSONS.find((l) => l.id === id)?.adultOnly,
          )
          .map((id, index) => {
            const item = LESSONS.find((l) => l.id === id)!;
            const done = completed.includes(id);
            const current = !pathDone && item.id === nextLesson.id;
            return (
              <button
                className={`lesson-row ${done ? "done" : ""} ${current ? "current" : ""}`}
                onClick={() => lessonLink(id)}
                key={id}
              >
                <span className="lesson-number">
                  {done ? (
                    <Check size={18} weight="bold" />
                  ) : (
                    String(index + 1).padStart(2, "0")
                  )}
                </span>
                <span className="lesson-row-copy">
                  <strong>{item.title}</strong>
                  <span>
                    {item.minutes} мин · Практическа задача
                    {id === "service-offer" && " · 18+"}
                  </span>
                </span>
                <span className="lesson-row-end">
                  {done ? (
                    <CheckCircle weight="fill" size={21} />
                  ) : (
                    <ArrowUpRight size={20} />
                  )}
                </span>
              </button>
            );
          })}
      </div>
    );
  }

  return (
    <div className={`app-shell reference-shell academy-shell ${journeySurface ? 'journey-shell' : ''} ${view === 'lesson' ? 'journey-reading-shell' : ''} ${view === 'workflow' ? 'workflow-shell' : ''}`} data-surface={view}>
      <a className="skip-link" href="#main-content">
        Към съдържанието
      </a>
      {mobileNav && (
        <button
          className="sidebar-overlay"
          onClick={() => setMobileNav(false)}
          aria-label="Затвори менюто"
        />
      )}
      <aside
        ref={sidebarRef}
        id="primary-navigation"
        className={`sidebar ${mobileNav ? "open" : ""}`}
        aria-label="Основна навигация"
      >
        <button className="icon-button mobile-menu mobile-nav-close" onClick={() => setMobileNav(false)} aria-label="Затвори менюто">
          <X size={22} />
        </button>
        <button
          className="brand"
          onClick={() => navigate("overview")}
          aria-label="AI Business Academy начало"
        >
          <BrandLogo />
        </button>
        <div className="workspace-switch">
          <span className="workspace-icon">
            <Compass size={19} />
          </span>
          <span>
            {brand.academy}
            <small>Работа и умения</small>
          </span>
        </div>
        <nav>
          {navigation.filter(item=>!['universe','daily','path','tools'].includes(item.view)).map((item) => {
            const active = view === item.view || (view === "lesson" && item.view === lessonOrigin);
            return (
              <div className="nav-entry" key={item.view}>
                <Link
                  href={`/?view=${item.view}`}
                  prefetch={false}
                  onPointerEnter={() => preloadView(item.view)}
                  onFocus={() => preloadView(item.view)}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                    e.preventDefault();
                    navigate(item.view);
                  }}
                  className={`nav-item ${active ? "active" : ""}`}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                >
                  <item.icon size={21} weight={active ? "fill" : "regular"} />
                  <span>{item.label}</span>
                </Link>
              </div>
            );
          })}
<details className="nav-more" key={`more:${view}`} open={["universe","daily","path","tools"].includes(view)||undefined}><summary>За теб<CaretDown size={15} aria-hidden="true"/></summary><div>
          {navigation.filter(item=>['universe','daily','path','tools'].includes(item.view)).map((item) => {
            const active = view === item.view || (view === "lesson" && item.view === lessonOrigin);
            return (
              <div className="nav-entry" key={item.view}>
                <Link
                  href={`/?view=${item.view}`}
                  prefetch={false}
                  onPointerEnter={() => preloadView(item.view)}
                  onFocus={() => preloadView(item.view)}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                    e.preventDefault();
                    navigate(item.view);
                  }}
                  className={`nav-item ${active ? "active" : ""}`}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                >
                  <item.icon size={21} weight={active ? "fill" : "regular"} />
                  <span>{item.label}</span>
                </Link>
              </div>
            );
          })}
</div></details>
        </nav>
        <div className="sidebar-divider" />
        <Link
          className={`nav-item ${view === "saved" ? "active" : ""}`}
          href="/?view=saved"
          prefetch={false}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            navigate("saved");
          }}
        >
          <BookmarkSimple size={21} />
          <span>Запазени</span>
          {!!data?.bookmarkedPathIds.length && (
            <span className="nav-count">{data.bookmarkedPathIds.length}</span>
          )}
        </Link>
        {user?.role === "admin" && (
          <button
            className={`nav-item ${view === "admin" ? "active" : ""}`}
            onClick={() => navigate("admin")}
          >
            <ShieldCheck size={21} />
            Администрация
          </button>
        )}
        {user?.role === "admin" && <button className={`nav-item ${view === 'studio' ? 'active' : ''}`} onClick={() => navigate('studio')}><Books size={21} />Студио за съдържание</button>}
        <div className="sidebar-bottom">
          <button className="platform-info-link" onClick={() => {
            if (mobileNav) {
              navFocusTarget.current = "none";
              setMobileNav(false);
              requestAnimationFrame(() => { menuTriggerRef.current?.focus(); setModal("about"); });
            } else setModal("about");
          }}><Info size={16} aria-hidden="true"/><span>За платформата</span></button>
          <button
            className="user-card"
            onClick={() => {
              if (user) navigate("profile");
              else {
                navFocusTarget.current = "none";
                setMobileNav(false);
                requestAnimationFrame(() => {
                  menuTriggerRef.current?.focus();
                  setModal("register");
                });
              }
            }}
          >
            <span className="avatar">
              {user ? initials(user.name) : <UsersThree size={21} />}
            </span>
            <span>
              <strong>{user?.name || "Присъедини се"}</strong>
              <small>
                {user ? user.role==='admin'?'Администратор':"Безплатен член" : "Създай безплатен профил"}
              </small>
            </span>
            <CaretDown size={15} />
          </button>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              ref={menuTriggerRef}
              className="icon-button mobile-menu"
              onClick={() => {
                navFocusTarget.current = "trigger";
                setMobileNav(true);
              }}
              aria-label="Отвори менюто"
              aria-expanded={mobileNav}
              aria-controls="primary-navigation"
            >
              <List size={24} />
            </button>
            {journeySurface && <button className="journey-brand" onClick={() => navigate('overview')} aria-label="AI Business Academy начало"><BrandLogo /></button>}
            <span>Академията</span>
            <CaretRight size={13} />
            <strong>{viewLabels[view]}</strong>
          </div>
          <div className="topbar-actions">
            <div className="search-box" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false); }}>
              <MagnifyingGlass size={18} />
              <input
                aria-label="Търси в общността"
                placeholder="Потърси пример или разговор"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={event => { if (event.key === 'Escape') setSearchOpen(false); }}
              />
              
              {search && searchOpen && (
                <div className="search-results">
                  <span>Намерени уроци</span>
                  {searchLessons.length ? (
                    searchLessons.map((item) => (
                      <button key={item.id} onClick={() => lessonLink(item.id)}>
                        <Books size={17} />
                        <span>{item.title}</span>
                        <ArrowUpRight size={15} />
                      </button>
                    ))
                  ) : (
                    <p>Няма намерени уроци. Опитай „процес“ или „AI“.</p>
                  )}
                  <button
                    onClick={() => {
                      navigate("community", undefined, search);
                      setSearchOpen(false);
                    }}
                  >
                    <UsersThree size={17} />
                    Търси и в дискусиите
                    <ArrowRight size={15} />
                  </button>
                </div>
              )}
            </div>
            <button
              className="icon-button notification-button"
              onClick={() => setModal("notifications")}
              aria-label="Известия"
            >
              <Bell size={21} />
              {ownSubmissions.some((s) => s.status !== "pending") && <span />}
            </button>
            <span className="topbar-divider" />
            <button
              className="top-avatar"
              onClick={() => (user ? navigate("profile") : setModal("login"))}
              aria-label={user ? `${initials(user.name)} · Моят профил` : "Вход"}
            >
              {user ? initials(user.name) : <UsersThree size={19} />}
            </button>
          </div>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>
          {error && data && (
            <div role="alert" className="error-banner">
              <WarningCircle size={19} />
              <span>{error}</span>
              {!data && (
                <button
                  onClick={() => {
                    void refresh();
                  }}
                >
                  Опитай отново
                </button>
              )}
              <button
                aria-label="Скрий съобщението"
                onClick={() => setError("")}
              >
                <X size={17} />
              </button>
            </div>
          )}
          {loading && !data ? (
            <div className="loading-state" aria-label="Зареждане" role="status">
              <div />
              <div />
              <div />
              <p>Зареждане на страницата…</p>
            </div>
          ) : !data ? (
            <section className="empty-state" role="alert">
              <h1>Страницата не се зареди</h1>
              <p>{error || "Не успяхме да получим данните. Провери връзката и опитай отново."}</p>
              <button className="button secondary" onClick={() => void refresh()}>Опитай отново</button>
            </section>
          ) : (
            <div className="route-surface" data-view={view} key={`${view}:${view === 'lesson' ? lessonId : ''}`}>
              {view === "overview" && <WorkspaceHome key={`home:${user?.id||"guest"}`} data={data} path={mainPath} lessons={LESSONS} nextLesson={nextLesson} pathDone={pathDone} openLesson={lessonLink} openWorkflow={openWorkflowIntent} openWork={openSavedWorkflow} openBusiness={() => navigate('business')} openPath={() => navigate('path')} openDaily={() => navigate('daily')} openLibrary={() => navigate('library')} openCommunity={() => navigate('community')} openUniverse={() => navigate('universe')} openPost={id => { navigate('community'); setActivePost(id); }} setup={() => requireUser(() => setModal('onboarding'))} shareProgress={openProgress} />}

              {view === 'universe' && data && <Universe key={user?.id || 'guest'} data={data} mutate={mutate} busy={busy} signIn={() => setModal('register')} openDaily={() => navigate('daily')} />}
              {view === 'daily' && data && <DailyPlan key={user?.id || 'guest'} data={data} mutate={mutate} busy={busy} signIn={() => setModal('register')} scenarioId={nextLesson.id} openUniverse={() => navigate('universe')} openLesson={() => pathDone ? navigate('library') : lessonLink(nextLesson.id)} />}
              {view === 'studio' && data && (user?.role === 'admin' ? <ContentStudio data={data} mutate={mutate} busy={busy} onDirtyChange={setStudioDirty} /> : <EmptyState icon={<Lock size={35} />} title="Само за екипа." text="Студиото е достъпно за администратори." action="Вход" onAction={() => setModal('login')} />)}

              {view === "path" && <WorkspaceHome key={`path:${user?.id||"guest"}`} initialPhase="map" data={data} path={mainPath} lessons={LESSONS} nextLesson={nextLesson} pathDone={pathDone} openLesson={lessonLink} openWorkflow={openWorkflowIntent} openWork={openSavedWorkflow} openBusiness={() => navigate('business')} openPath={() => navigate('path')} openDaily={() => navigate('daily')} openLibrary={() => navigate('library')} openCommunity={() => navigate('community')} openUniverse={() => navigate('universe')} openPost={id => { navigate('community'); setActivePost(id); }} setup={() => requireUser(() => setModal('onboarding'))} shareProgress={openProgress} />}

              {(view === "library" || view === "saved") && (
                <>
                  <PageHeading
                    title={
                      view === "saved"
                        ? "Запазени пътища"
                        : "Виж пример в действие."
                    }
                    description={
                      view === "saved"
                        ? "Пътищата, които си запазил за по-късно."
                        : "Пробвай избор. Виж какво се променя."
                    }
                  />
                  {view === "library" && (
                    <div className="filter-tabs">
                      <button
                        className={libraryFilter === "all" ? "selected" : ""}
                        aria-pressed={libraryFilter === "all"}
                        onClick={() => setLibraryFilter("all")}
                      >
                        Всички теми
                      </button>
                      {PATHS.map((p) => (
                        <button
                          key={p.id}
                          className={libraryFilter === p.id ? "selected" : ""}
                          aria-pressed={libraryFilter === p.id}
                          onClick={() => setLibraryFilter(p.id)}
                        >
                          {p.category}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className={`library-grid ${exampleStyles.gallery}`} data-count={filteredPaths.filter(p=>view!=='saved'||data?.bookmarkedPathIds.includes(p.id)).length}>
                    {filteredPaths
                      .filter(
                        (p) =>
                          view !== "saved" ||
                          data?.bookmarkedPathIds.includes(p.id),
                      )
                      .map((p,index) => renderPathCard(p,index===0))}
                  </div>
                  {view === "saved" && !data?.bookmarkedPathIds.length && (
                    <EmptyState
                      icon={<BookmarkSimple size={35} />}
                      title="Нямаш запазени пътища"
                      text="Използвай отметката до учебен път, за да го намериш тук."
                      action="Разгледай библиотеката"
                      onAction={() => navigate("library")}
                    />
                  )}
                  {((view === "library" && !filteredPaths.length) || (view === "saved" && !!data?.bookmarkedPathIds.length && !filteredPaths.some(path => data.bookmarkedPathIds.includes(path.id)))) && (
                    <EmptyState
                      icon={<MagnifyingGlass size={35} />}
                      title="Няма съвпадения"
                      text="Промени търсенето или го изчисти."
                      action="Изчисти търсенето"
                      onAction={() => { setSearch(""); setLibraryFilter("all"); }}
                    />
                  )}
                </>
              )}

              {view === "lesson" && !LESSONS.some(item => item.id === lessonId) && <EmptyState title="Този урок не е наличен" text="Линкът може да е стар или урокът да е свален от публикация." action="Избери друг урок" onAction={() => navigate('library')} />}
              {view === "lesson" && LESSONS.some(item => item.id === lessonId) && (
                <>
                  <button
                    className="back-link"
                    onClick={() => { rememberLessonPath(lesson.id); navigate(lessonOrigin); }}
                  >
                    <ArrowLeft size={17} />
                    {lessonOrigin==='library'?'Към примерите':lessonOrigin==='saved'?'Към запазените':lessonOrigin==='overview'?'Към началото':'Към картата'}
                  </button>
                  <div className="lesson-layout">
                    <article className="lesson-article">
                      <InteractiveScenario key={`${user?.id||'guest'}:${lesson.id}`} scenarioId={lesson.id} scope={user?.id||'guest'} primary title={lesson.title} summary={lesson.summary} restricted={user?.ageBand==='14-17'&&!!lesson.adultOnly} practice={openLessonMaterial} next={()=>{
                        const path=PATHS.find(item=>item.id===lesson.pathId);
                        const position=path?.lessonIds.indexOf(lesson.id)??-1;
                        const next=path?.lessonIds.slice(position+1).find(id=>user?.ageBand!=='14-17'||!LESSONS.find(item=>item.id===id)?.adultOnly);
                        if(next)lessonLink(next);else navigate('library');
                      }}/>
                      {['product-problem','service-offer'].includes(lesson.id)?<button className="button secondary" onClick={openProductPositioning}>Пробвай послание за свой продукт<ArrowRight size={18}/></button>:null}
                      <details className="scene-reference" id="lesson-material">
                        <summary>Обяснение, източници и своя практика<CaretDown size={18}/></summary>
                        <div className="scene-reference-body">
                      <div className="lesson-article-header">
                        <span className="tag">
                          <Books size={14} />
                          Материал към примера
                        </span>
                        <span className="muted">
                          <Clock size={15} />
                          {lesson.minutes} мин
                        </span>
                      </div>
                      <h2>{lesson.title}</h2>
                      <p className="lesson-summary">{lesson.summary}</p>
                      <div className="lesson-first-action">
                        <span>Виж примера. После пробвай своя.</span>
                        <button className="button secondary" onClick={openQuickReport}>
                          Към задачата
                          <ArrowRight size={17} />
                        </button>
                      </div>
                      {lesson.sections.map((section, i) => (
                        <details className="lesson-detail" key={i}>
                          <summary><h2>{section.title}</h2><CaretDown size={18} /></summary>
                          <p>{section.body}</p>
                          {section.bullets && (
                            <ul>
                              {section.bullets.map((b) => (
                                <li key={b}>{b}</li>
                              ))}
                            </ul>
                          )}
                        </details>
                      ))}
                      {lesson.resourceLinks && (
                        <section className="lesson-resources">
                          <h2>Допълнителни материали</h2>
                          {lesson.resourceLinks.map((r) => (
                            <a
                              key={r.url}
                              href={r.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {r.title}
                              <ArrowSquareOut size={16} />
                            </a>
                          ))}
                        </section>
                      )}
                      <section className="worksheet" id="lesson-practice" tabIndex={-1}>
                        <h2>Провери го на практика</h2>
                        <p>{lesson.task}</p>
                        <ul className="task-checklist">
                          {lesson.checklist.map((c) => (
                            <li key={c}>
                              <CheckCircle size={18} />
                              {c}
                            </li>
                          ))}
                        </ul>
                        {user?.ageBand === "14-17" && lesson.adultOnly ? (
                          <div className="info-note">
                            <ShieldCheck size={20} />
                            <p>
                              Тази стъпка е за търговски отношения и е достъпна
                              за пълнолетни. Продължи с учебен казус и обсъди
                              реална работа с родител или попечител и
                              квалифициран специалист.
                            </p>
                          </div>
                        ) : completed.includes(lesson.id) ? (
                          <div className="lesson-tried-state" role="status">
                            <CheckCircle size={19} />
                            <span>Отбелязано за теб. Продължи, когато си готов.</span>
                          </div>
                        ) : (
                          <div className="lesson-tried-action">
                            <button
                              className="button secondary"
                              onClick={openQuickReport}
                            >
                              Отвори краткия отчет
                              <ArrowRight size={17} />
                            </button>
                            <small>Три избора вместо дълъг текст. Екипът ще види какво си пробвал.</small>
                          </div>
                        )}
                        {user?.ageBand === "14-17" && lesson.adultOnly ? null : (
                          <details className="lesson-submission-details" id="lesson-submission">
                            <summary>Кратък отчет за екипа</summary>
                            <p>Три избора подготвят отчета. Можеш да добавиш свои подробности.</p>
                            <form
                              onSubmit={async (e) => {
                                e.preventDefault();
                                requireUser(() => {
                                  void (async () => {
                                    const success = await mutate(
                                      {
                                        action: "submit",
                                        lessonId: lesson.id,
                                        text: submissionText,
                                      },
                                      "Задачата е изпратена за преглед.",
                                    );
                                    if (success) setWorksheet("");
                                  })();
                                });
                              }}
                            >
                              <QuickLessonReport key={lesson.id} checklist={lesson.checklist} report={currentQuickReport} onChange={setQuickReportField} />
                                <p className="lesson-report-preview" aria-live="polite">
                                  <span>Отчетът ти</span>
                                  {submissionText || "Избери три отговора, за да го подготвиш."}
                                </p>
                              <details className="lesson-write-more">
                                <summary>Добави свои подробности <span>по желание</span></summary>
                                <label htmlFor="worksheet">Твоят текст <span className="muted">(30–6000 знака)</span></label>
                                <textarea
                                  id="worksheet"
                                  rows={4}
                                  placeholder="Опиши какво пробва и как го провери. Работи с примерни данни."
                                  value={worksheet}
                                  onChange={(e) => setWorksheet(e.target.value)}
                                  maxLength={6000}
                                />
                                <div className="form-caption">
                                  <span>Не включвай пароли или лични данни.</span>
                                  <span>{worksheet.length}/6000</span>
                                </div>
                                <div className="draft-actions"><button type="button" className="button secondary" disabled={busy || !worksheet} onClick={() => requireUser(() => { void mutate({ action: 'saveDraft', lessonId: lesson.id, text: worksheet }, 'Черновата е запазена в профила ти.'); })}>Запази чернова</button><small>{worksheet !== storedDraft ? 'Имаш незапазени промени.' : storedDraft ? 'Черновата е запазена в профила ти.' : 'Можеш да я довършиш по-късно.'}</small></div>
                              </details>
                              <button
                                className="button primary"
                                disabled={busy || submissionText.length < 30}
                                type="submit"
                              >
                                {busy ? "Изпращане…" : "Изпрати за обратна връзка"}
                                <PaperPlaneTilt size={17} />
                              </button>
                            </form>
                          </details>
                        )}
                        {submission && (
                          <div className="submission-result">
                            <strong>
                              <CheckCircle size={20} />
                              Предадена задача
                            </strong>
                            <span
                              className={`tag ${submission.status === "pending" ? "" : "green-tag"}`}
                            >
                              {submission.status === "pending"
                                ? "Очаква преглед"
                                : submission.status === "reviewed"
                                  ? "Прегледана"
                                  : "За доработка"}
                            </span>
                            <p>{submission.text}</p>
                            {submission.feedback && (
                              <blockquote>
                                <strong>Обратна връзка</strong>
                                {submission.feedback}
                              </blockquote>
                            )}
                            {submission.history && submission.history.length > 1 && <details className="submission-history"><summary>Предишни версии ({submission.history.length})</summary>{submission.history.map(version => <div key={version.revision}><strong>Версия {version.revision}</strong><p className="preserve-text">{version.text}</p>{version.reviews.map((review, index) => <p key={index}><strong>{review.reviewer}:</strong> {review.feedback}</p>)}</div>)}</details>}
                            <button
                              className="button secondary"
                              disabled={busy || completed.includes(lesson.id)}
                              onClick={() => {
                                void mutate(
                                  { action: "complete", lessonId: lesson.id },
                                  "Напредъкът е запазен.",
                                );
                              }}
                            >
                              {completed.includes(lesson.id)
                                ? "Стъпката е завършена"
                                : "Отбележи стъпката като завършена"}
                              <Check size={17} />
                            </button>
                            <small>
                              Отметката е за твое проследяване. Статусът на прегледа се вижда отделно.
                            </small>
                          </div>
                        )}
                      </section>
                        </div>
                      </details>
                    </article>
                    <aside className="lesson-aside">
                      <section className="panel">
                        <h3>
                          {PATHS.find((p) => p.id === lesson.pathId)?.title}
                        </h3>
                        {renderLessonList(
                          PATHS.find((p) => p.id === lesson.pathId),
                        )}
                      </section>
                      <div className="subtle-note">
                        <ChatCircle size={21} />
                        <p>
                          Имаш въпрос по задачата?
                          <button
                            className="text-link"
                            onClick={() => navigate("community")}
                          >
                            Попитай общността
                            <ArrowRight size={15} />
                          </button>
                        </p>
                      </div>
                    </aside>
                  </div>
                </>
              )}

              {view === "community" && <CommunitySurface posts={posts} selectedPost={selectedPost||null} user={user||null} busy={busy} category={category} categoryLabels={categoryLabels} setCategory={setCategory} openPost={setActivePost} closePost={()=>setActivePost(null)} openQuestion={openQuestion} openProgress={openProgress} mutate={mutate} requireUser={requireUser}/>}

              {view === 'business' && <BusinessGoals openWebsite={openWebsite} openWorkflow={openWorkflowIntent} openPositioning={openProductPositioning} openTeam={()=>navigate('workflow')}/>}
              {view === 'websites' && <WebsiteStudio key={user?.id||'guest'} userId={user?.id} onJoin={()=>setModal('register')} onDirty={setWebsiteDirty}/>}
              {view === "workflow" && <Workflow key={user?.id||'guest'} user={user||null} onJoin={()=>setModal('register')} onDirty={setWorkflowDirty}/>}
              {view === "tools" && (
                <>
                  <MessageSorter primary />
                  <details className="tools-more"><summary>Вземи основата или предложи свой инструмент<ArrowRight size={18}/></summary>
                  <div className="tools-layout">
                    <TemplateShelf />
                    <details className="tool-request-disclosure"><summary>Липсва ти инструмент?<ArrowRight size={18}/></summary><section className="panel tool-discovery">
                      <h2>
                        Какъв инструмент ти липсва?
                      </h2>
                      <p>
                        Опиши повтаряща се задача и как я вършиш сега. Това ще ни помогне да изберем какво да разработим.
                      </p>
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const form = e.currentTarget;
                          const fields = new FormData(form);
                          requireUser(() => {
                            void (async () => {
                              if (
                                await mutate(
                                  {
                                    action: "requestTool",
                                    problem: fields.get("problem"),
                                  },
                                  "Предложението ти е записано.",
                                )
                              ) {
                                form.reset();
                                setToolProblem("");
                              }
                            })();
                          });
                        }}
                      >
                        <label htmlFor="problem">
                          Задачата, която би искал да улесниш
                        </label>
                        <textarea
                          id="problem"
                          name="problem"
                          required
                          minLength={30}
                          maxLength={3000}
                          rows={3}
                          value={toolProblem}
                          onChange={(event) => setToolProblem(event.target.value)}
                          placeholder="Например: всяка седмица преписвам поръчките от имейл в таблица."
                        />
                        <details className="tool-starters">
                          <summary>Избери пример за отправна точка</summary>
                          <div>
                            {[
                              "Всяка седмица прехвърлям едни и същи данни между няколко таблици.",
                              "Получавам повтарящи се въпроси и подготвям почти еднакви отговори.",
                              "Проверявам ръчно едни и същи полета във всеки нов документ.",
                            ].map((example) => (
                              <button type="button" key={example} onClick={() => setToolProblem(example)}>{example}</button>
                            ))}
                          </div>
                        </details>
                        <button className="button primary" disabled={busy}>
                          Изпрати предложение
                          <ArrowRight size={17} />
                        </button>
                      </form>
                      <small>
                        Събираме предложения. Изпращането не създава абонамент.
                      </small>
                    </section></details>
                  </div>
                  </details>
                </>
              )}

              {view === "profile" && (
                <>
                  <PageHeading
                    title={user?"Моят профил":"Запази работата си."}
                    description={user?"Започнатото и обратната връзка са тук.":undefined}
                  />
                  {user ? (
                    <div className="profile-layout">
                      <section className="profile-return">
                        <span>{continueWorkId ? returnedWork ? 'Има отговор по твоята работа' : 'Остави нещо започнато' : 'Готов пример те чака'}</span>
                        <h2>{continueWorkId ? LESSONS.find(item=>item.id===continueWorkId)?.title : nextLesson.title}</h2>
                        {returnedWork?.feedback&&<p>{returnedWork.feedback}</p>}
                        <button className="button primary" onClick={()=>{lessonLink(continueWorkId||nextLesson.id);if(continueWorkId)requestAnimationFrame(()=>openLessonMaterial());}}>{continueWorkId?'Продължи от запазеното':'Пусни примера'}<ArrowRight size={18}/></button>
                      </section>
                      <section className="panel">
                        <div className="profile-identity">
                          <span className="avatar large-avatar">
                            {initials(user.name)}
                          </span>
                          <div>
                            <h2>{user.name}</h2>
                            <p className="muted">{user.email}</p>
                          </div>
                        </div>
                        <dl className="profile-facts">
                          <div>
                            <dt>План</dt>
                            <dd>Безплатна общност</dd>
                          </div>
                          <div>
                            <dt>Предадени задачи</dt>
                            <dd>{ownSubmissions.length}</dd>
                          </div>
                          <div>
                            <dt>Завършени стъпки</dt>
                            <dd>{completed.length}</dd>
                          </div>
                          <div>
                            <dt>Седмично време</dt>
                            <dd>
                              {user.profile
                                ? `${user.profile.hours} часа`
                                : "Не е зададено"}
                            </dd>
                          </div>
                        </dl>
                        <button
                          className="button secondary"
                          onClick={() => setModal("onboarding")}
                        >
                          <GearSix size={18} />
                          Персонализирай плана
                        </button>
                        <button
                          className="button subtle logout"
                          disabled={busy}
                          onClick={async () => {
                            if (await mutate({ action: "logout" }))
                              navigate("overview");
                          }}
                        >
                          <SignOut size={18} />
                          Изход от профила
                        </button>
                      </section>
                      <section className="panel">
                        <h2>Предадени задачи</h2>
                        {ownSubmissions.length ? (
                          ownSubmissions.map((s) => (
                            <button
                              className="submission-mini"
                              key={s.id}
                              onClick={() => lessonLink(s.lessonId)}
                            >
                              <span>
                                <strong>
                                  {
                                    LESSONS.find((l) => l.id === s.lessonId)
                                      ?.title
                                  }
                                </strong>
                                <small>
                                  {s.status === "pending"
                                    ? "Очаква обратна връзка"
                                    : s.status === "reviewed"
                                      ? "Прегледана"
                                      : "За доработка"}
                                </small>
                              </span>
                              <ArrowUpRight size={18} />
                            </button>
                          ))
                        ) : (
                          <p className="muted">
                            Тук ще откриваш задачите, които си предал, и
                            обратната връзка към тях.
                          </p>
                        )}
                      </section>
                      <GoogleSignIn linking ageBand={user.ageBand}/>
                      <AccountDataControls ageBand={user.ageBand} isAdmin={user.role === 'admin'} busy={busy} deleteAccount={async (password,authentication) => {
                        const deleted = await mutate({ action: 'deleteAccount', password, authentication, confirmation: 'DELETE' }, 'Профилът е изтрит.');
                        if (deleted) { setDraftEdits({}); navigate('overview'); }
                        return deleted;
                      }} />
                    </div>
                  ) : (
                    <EmptyState
                      icon={<UsersThree size={35} />}
                      title="Продължи оттам, докъдето стигна."
                      text="Създай профил, за да пазиш работата си."
                      action="Създай профил"
                      onAction={() => setModal("register")}
                    />
                  )}
                </>
              )}

              {view === "admin" && (
                <>
                  <PageHeading
                    title="Преглед на задачи"
                    description="Прегледай работата и върни конкретна следваща стъпка."
                  />
                  {user?.role === "admin" ? (
                    <>
                      <AdminControlDesk pending={data.submissions.filter(item=>item.status==="pending").length} openWorkflow={()=>navigate("workflow")} openMedia={()=>{navigate("workflow");const url=new URL(window.location.href);url.searchParams.set("room","media");window.history.replaceState({},"",url);}} openStudio={()=>navigate("studio")}/>
                      <h2 className="admin-section-heading">
                        Предадена работа
                      </h2>
                      {data?.submissions.map((s) => (
                        <AdminReview
                          key={`${s.id}:${s.revision}`}
                          submission={s}
                          lessonTitle={LESSONS.find(item => item.id === s.lessonId)?.title}
                          busy={busy}
                          review={(status, feedback) =>
                            mutate(
                              {
                                action: "review",
                                submissionId: s.id,
                                expectedRevision: s.revision,
                                status,
                                feedback,
                              },
                              "Обратната връзка е записана.",
                            )
                          }
                        />
                      ))}
                      {!data?.submissions.length && (
                        <EmptyState
                          icon={<Books size={35} />}
                          title="Още няма предадена работа."
                          text="Когато член предаде задача, тя ще се появи тук за преглед."
                        />
                      )}
                      <h2 className="admin-section-heading">
                        Предложения за инструменти
                      </h2>
                      {data?.tools.map((t) => (
                        <div className="panel tool-request" key={t.id}>
                          <p className="preserve-text">{t.problem}</p>
                          <small>{formatDate(t.createdAt)}</small>
                        </div>
                      ))}
                    </>
                  ) : (
                    <EmptyState
                      icon={<Lock size={35} />}
                      title="Само за екипа."
                      text="Тази зона изисква администраторски профил."
                      action="Вход"
                      onAction={() => setModal("login")}
                    />
                  )}
                </>
              )}
            </div>
          )}
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle size={21} weight="fill" />
          {toast}
          <button onClick={() => setToast("")} aria-label="Затвори">
            <X size={17} />
          </button>
        </div>
      )}
      {modal === "about" && <ModalFrame title="За платформата" close={() => setModal(null)}>
        <div className="platform-info">
          <strong>{brand.name}</strong>
          <p>{brand.descriptor}</p>
          <button className="button secondary" onClick={() => { setModal(null); navigate("community"); }}>Дай обратна връзка<ArrowUpRight size={17} aria-hidden="true"/></button>
          <small>© {new Date().getFullYear()} {brand.name}</small>
        </div>
      </ModalFrame>}
      {(modal === "login" || modal === "register") && (
        <ModalFrame
          close={() => {
            setModal(null);
            setError("");
          }}
          title={
            modal === "register"
              ? "Създай профил"
              : "Вход"
          }
          description={
            modal === "register"
              ? "Запазвай задачите си и получавай обратна връзка."
              : "Въведи имейла и паролата си."
          }
        >
          <GoogleSignIn/>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const fields = new FormData(e.currentTarget);
              const isRegister = modal === "register";
              const success = await mutate({
                action: isRegister ? "register" : "login",
                email: fields.get("email"),
                password: fields.get("password"),
                ...(isRegister
                  ? { name: fields.get("name"), ageBand: fields.get("ageBand") }
                  : {}),
              });
              if (success) setModal(isRegister&&!(['workflow','websites','business'] as View[]).includes(view) ? "onboarding" : null);
            }}
          >
            {modal === "register" && (
              <>
                <label htmlFor="name">Име или псевдоним</label>
                <input
                  id="name"
                  name="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={80}
                  placeholder="Как да те наричаме?"
                />
              </>
            )}
            <label htmlFor="email">Имейл</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
            <label htmlFor="password">
              Парола
              {modal === "register" && (
                <span className="muted"> · поне 12 знака</span>
              )}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={
                modal === "register" ? "new-password" : "current-password"
              }
              minLength={modal === "register" ? 12 : undefined}
              required
              maxLength={128}
            />
            {modal === "register" && (
              <>
                <label htmlFor="ageBand">Възрастова група</label>
                <select name="ageBand" id="ageBand" required defaultValue="">
                  <option value="" disabled>
                    Избери група
                  </option>
                  <option value="18+">18 или повече години</option>
                  <option value="14-17">14–17 години</option>
                </select>
                <div className="form-note">
                  Регистрацията е за навършили 14 години. На 14–17 г. използвай учебните задачи. Преди работа с клиенти обсъди условията с родител или попечител и специалист.
                </div>
                <p className="form-note">
                  Името ти се вижда към публикациите. Имейлът и предадените задачи са лични. Данните се пазят в тази работна версия на платформата.
                </p>
              </>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary full" disabled={busy}>
              {busy
                ? "Момент…"
                : modal === "register"
                  ? "Създай безплатен профил"
                  : "Влез в профила"}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="auth-switch">
            {modal === "register"
              ? "Вече имаш профил?"
              : "Тук си за първи път?"}
            <button
              onClick={() => {
                setModal(modal === "register" ? "login" : "register");
                setError("");
              }}
            >
              {modal === "register" ? "Влез" : "Създай профил"}
            </button>
          </p>
        </ModalFrame>
      )}
      {modal === "onboarding" && (
        <Onboarding
          close={() => setModal(null)}
          busy={busy}
          error={error}
          profile={user?.profile}
          ageBand={user?.ageBand || "18+"}
          save={async (values) => {
            if (
              await mutate(
                { action: "profile", ...values },
                "Учебният ти план е запазен.",
              )
            ) {
              setModal(null);
              navigate("path");
            }
          }}
        />
      )}
      {modal === "post" && (
        <ModalFrame
          close={() => setModal(null)}
          title={postKind === "progress" ? "Сподели опит" : "Нова дискусия"}
          description={postKind === "progress" ? "Едно изречение стига. Недовършеното също има място тук." : "Кажи какво искаш да разбереш. Едно изречение стига."}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const fields = new FormData(e.currentTarget);
              if (
                await mutate(
                  {
                    action: "post",
                    title: String(fields.get("title") || "").trim() || draftPostTitle(String(fields.get("body") || "")),
                    body: fields.get("body"),
                    category: fields.get("category"),
                  },
                  "Дискусията е публикувана.",
                )
              )
                setModal(null);
            }}
          >
            <input type="hidden" name="category" value={postKind} />
            <details className="optional-post-title">
              <summary>Добави заглавие <span>по желание</span></summary>
              <label htmlFor="post-title">Заглавие</label>
              <input id="post-title" name="title" maxLength={140} placeholder="Например: Как проверявате този резултат?" />
            </details>
            <label htmlFor="post-body">{postKind === "progress" ? "Какво пробваш?" : "Какъв е въпросът?"}</label>
            <textarea
              id="post-body"
              name="body"
              required
              minLength={20}
              maxLength={6000}
              rows={4}
              placeholder={postKind === "progress" ? "Едно нещо, което опита или научи…" : "Какво искаш да разбереш? Добави какво вече пробва…"}
            />
            <p className="form-note">Заглавието ще се направи от първото изречение. Можеш да го промениш при нужда.</p>
            <p className="form-note">
              Не публикувай лични данни, поверителна информация или обещания за
              гарантиран доход.
            </p>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button disabled={busy} className="button primary full">
              Публикувай
              <PaperPlaneTilt size={18} />
            </button>
          </form>
        </ModalFrame>
      )}
      {modal === "notifications" && (
        <ModalFrame
          close={() => setModal(null)}
          title="Обратна връзка"
          description="Коментарите на екипа по предадените ти задачи."
        >
          {data?.submissions
            .filter((s) => s.status !== "pending" && s.userId === user?.id)
            .map((s) => (
              <button
                className="notification-item"
                key={s.id}
                onClick={() => {
                  setModal(null);
                  lessonLink(s.lessonId);
                }}
              >
                <CheckCircle size={24} />
                <span>
                  <strong>
                    {LESSONS.find((l) => l.id === s.lessonId)?.title}
                  </strong>
                  <small>
                    {s.feedback || "Има нова обратна връзка по твоята задача."}
                  </small>
                </span>
                <ArrowUpRight size={18} />
              </button>
            ))}
          {!data?.submissions.some(
            (s) => s.status !== "pending" && s.userId === user?.id,
          ) && (
            <EmptyState
              icon={<Bell size={32} />}
              title="Още няма обратна връзка"
              text="Когато екипът прегледа твоя задача, ще намериш обратната връзка тук."
            />
          )}
        </ModalFrame>
      )}
    </div>
  );
}




