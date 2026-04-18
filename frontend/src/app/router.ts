import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router";
import { useSessionStore } from "@/stores/session";

const routes: RouteRecordRaw[] = [
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
      { path: "leave", name: "leave", component: () => import("@/views/LeaveApplyView.vue") },
      { path: "leave/mine", name: "leave.list", component: () => import("@/views/LeaveListView.vue") },
      { path: "expense", name: "expense", component: () => import("@/views/ExpenseClaimView.vue") },
      { path: "expense/mine", name: "expense.list", component: () => import("@/views/ExpenseListView.vue") },
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

  router.beforeEach(async (to) => {
    const session = useSessionStore();
    await session.hydrate();
    if (!session.hasApiSecret && to.name !== "login" && to.name !== "pin") {
      return { name: "login" };
    }
    if (session.hasApiSecret && !session.isPinVerified && to.name !== "pin" && to.name !== "login") {
      return { name: "pin" };
    }
    return true;
  });

  return router;
}
