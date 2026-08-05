import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router";
import { useSessionStore } from "@/stores/session";
import { needsSiteSetup } from "@/app/platform";

const routes: RouteRecordRaw[] = [
  // Top-level, i.e. NOT a child of "/" — that is what keeps the chrome off.
  // This app has no chromeless-route list: TopAppBar / BottomNav are imported
  // per view, and the "/" parent is the only thing that implies a tab bar.
  // Sibling of login/pin, same as them.
  { path: "/setup", name: "setup", component: () => import("@/views/SiteSetupView.vue") },
  { path: "/login", name: "login", component: () => import("@/views/LoginView.vue") },
  { path: "/pin", name: "pin", component: () => import("@/views/PinView.vue") },
  {
    path: "/",
    component: () => import("@/app/App.vue"),
    children: [
      { path: "", name: "dashboard", component: () => import("@/views/DashboardView.vue") },
      { path: "checkin", name: "checkin", component: () => import("@/views/CheckinView.vue") },
      { path: "checkin/history", name: "checkin.history", component: () => import("@/views/CheckinHistoryView.vue") },
      { path: "attendance", name: "attendance", component: () => import("@/views/AttendanceCalendarView.vue") },
      { path: "leave", name: "leave", component: () => import("@/views/LeaveHubView.vue") },
      { path: "leave/apply", name: "leave.apply", component: () => import("@/views/LeaveApplyView.vue") },
      { path: "leave/mine", name: "leave.list", component: () => import("@/views/LeaveListView.vue") },
      { path: "approvals", name: "approvals", component: () => import("@/views/AttendanceApprovalsView.vue") },
      { path: "approvals/:name", name: "approvals.detail", component: () => import("@/views/AttendanceApprovalDetailView.vue") },
      { path: "expense", name: "expense", component: () => import("@/views/ExpenseListView.vue") },
      { path: "expense/new", name: "expense.new", component: () => import("@/views/ExpenseClaimView.vue") },
      { path: "expense/mine", redirect: "/expense" },
      { path: "sync-errors", name: "sync.errors", component: () => import("@/views/SyncErrorsView.vue") },
      { path: "tasks", name: "tasks", component: () => import("@/views/TaskListView.vue") },
      { path: "payslip", name: "payslip", component: () => import("@/views/PayslipListView.vue") },
      { path: "payslip/:name", name: "payslip.detail", component: () => import("@/views/PayslipDetailView.vue") },
      { path: "announcements", name: "announce", component: () => import("@/views/AnnouncementListView.vue") },
      { path: "announcements/:name", name: "announce.detail", component: () => import("@/views/AnnouncementDetailView.vue") },
      { path: "notifications", name: "notifications", component: () => import("@/views/NotificationView.vue") },
      { path: "profile", name: "profile", component: () => import("@/views/ProfileView.vue") },
      { path: "more", name: "more", component: () => import("@/views/MoreView.vue") },
    ],
  },
];

export function createAppRouter() {
  // Hash routing everywhere — survives page refresh on any server without
  // SPA fallback config, and plays nicely with Capacitor's WebView.
  // Base uses the full Frappe asset path so links resolve correctly.
  const router = createRouter({
    history: createWebHashHistory("/assets/fatehhr/spa/"),
    routes,
  });

  // Self-heal stale-chunk failures. Routes are lazy import()s; after a new
  // deploy the chunk hashes change and the old files are removed from the
  // server. A client running an out-of-date service-worker shell then 404s
  // when it tries to open a not-yet-loaded route (Attendance / Leave / Expense
  // "won't open the first time"). On such an error we force ONE hard reload to
  // the target path so the browser + SW pick up the fresh index and chunks.
  const RELOAD_KEY = "fatehhr.chunk-reload-once";
  router.onError((error, to) => {
    const msg = String((error && (error as Error).message) || error);
    const isChunkError =
      /dynamically imported module|Importing a module script failed|Failed to fetch dynamically|error loading dynamically imported/i.test(msg);
    if (!isChunkError) return;
    if (sessionStorage.getItem(RELOAD_KEY)) return; // already tried — avoid a loop
    sessionStorage.setItem(RELOAD_KEY, "1");
    if (to?.fullPath) window.location.hash = "#" + to.fullPath;
    window.location.reload();
  });
  // Clear the one-shot guard once any navigation succeeds, so a later deploy can
  // trigger a fresh self-heal.
  router.afterEach(() => sessionStorage.removeItem(RELOAD_KEY));

  // Routes reachable before a server + session exist.
  const PRE_AUTH = new Set(["setup", "login", "pin"]);

  router.beforeEach(async (to) => {
    // Server first. Without a site URL every later check can only produce a bare
    // network error, so this has to run ahead of the auth guards.
    if (needsSiteSetup() && to.name !== "setup") {
      return { name: "setup", replace: true };
    }

    const session = useSessionStore();
    await session.hydrate();

    // Configured → never sit on setup, so a cold start can't land here
    // (commandment 21). `?change=1` is the deliberate re-point from
    // More → Change server and is allowed through.
    //
    // NOT gated on being signed in: doing that strands a configured-but-signed-out
    // app on the setup screen with no way forward.
    if (to.name === "setup" && !needsSiteSetup() && to.query.change !== "1") {
      return { name: session.hasApiSecret ? "dashboard" : "login", replace: true };
    }

    if (!session.hasApiSecret && !PRE_AUTH.has(String(to.name))) {
      return { name: "login" };
    }
    if (session.hasApiSecret && !session.isPinVerified && !PRE_AUTH.has(String(to.name))) {
      return { name: "pin" };
    }
    return true;
  });

  return router;
}
