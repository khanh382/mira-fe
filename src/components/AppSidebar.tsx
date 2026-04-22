"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLang } from "@/lang";
import { useAuth } from "@/hooks/useAuth";
import { logoutUser } from "@/services/AuthService";
import {
  Bot,
  ChevronLeft,
  Globe,
  LogOut,
  MessageSquare,
  Moon,
  Settings,
  Sun,
  User,
  Users,
  Webhook,
  Workflow,
  X,
} from "lucide-react";

interface AppSidebarProps {
  collapsed: boolean;
  /** Mobile drawer: when true, the sidebar panel is visible (&lt; md) */
  mobileOpen: boolean;
  onMobileClose: () => void;
  theme: "light" | "dark";
  onToggleCollapse: () => void;
  onToggleTheme: () => void;
}

export default function AppSidebar({
  collapsed,
  mobileOpen,
  onMobileClose,
  theme,
  onToggleCollapse,
  onToggleTheme,
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, lang, setLang } = useLang();
  const { logout, user } = useAuth();

  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const go = () => setIsNarrow(mq.matches);
    go();
    mq.addEventListener("change", go);
    return () => mq.removeEventListener("change", go);
  }, []);

  const showCollapsed = !isNarrow && collapsed;
  const onNav = () => {
    if (isNarrow) onMobileClose();
  };

  const onLogout = async () => {
    try {
      await logoutUser();
    } catch {
      // Always clear local auth even if API logout fails.
    } finally {
      logout();
      onMobileClose();
      router.push("/login");
    }
  };
  const navItems = [
    { href: "/chat", label: t("sidebar.chat"), icon: MessageSquare },
    { href: "/workflows", label: t("sidebar.workflows"), icon: Workflow },
    { href: "/websites", label: t("sidebar.myWebsites"), icon: Globe },
    { href: "/account/profile", label: t("sidebar.profile"), icon: User },
    ...(user?.level === "owner"
      ? [
          { href: "/account/user-management", label: t("sidebar.userManagement"), icon: Users },
          { href: "/webhooks", label: t("sidebar.webhooks"), icon: Webhook },
        ]
      : []),
    { href: "/bot-config", label: t("sidebar.botConfig"), icon: Bot },
    { href: "/settings", label: t("sidebar.settings"), icon: Settings },
  ];

  const isDark = theme === "dark";

  return (
    <aside
      className={`group flex h-full shrink-0 flex-col backdrop-blur-xl transition-[width,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] md:static md:z-20 ${
        isDark
          ? "border-r border-zinc-800/80 bg-zinc-950/80 md:border-r"
          : "border-r border-zinc-200/60 bg-white/90 md:border-r"
      } max-md:fixed max-md:top-0 max-md:bottom-0 max-md:left-0 max-md:z-50 max-md:shadow-2xl max-md:duration-200 ${
        mobileOpen ? "max-md:translate-x-0" : "max-md:pointer-events-none max-md:-translate-x-full"
      } ${
        showCollapsed ? "w-[72px]" : "w-72 max-w-[min(18rem,calc(100vw-0.5rem))]"
      } `}
    >
      <div
        className={`relative flex min-h-[3.5rem] items-center p-3 sm:p-4 transition-all duration-300 ${
          showCollapsed ? "justify-center" : "justify-between"
        }`}
      >
        {!showCollapsed ? (
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden px-1 pl-0 sm:px-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[rgb(173,8,8)] to-red-600 font-bold text-white shadow-md shadow-red-500/20">
              M
            </div>
            <p
              className={`min-w-0 flex-1 truncate text-lg font-black uppercase tracking-widest sm:text-xl ${
                isDark ? "text-zinc-100" : "text-zinc-800"
              }`}
            >
              MIRA
            </p>
            {isNarrow ? (
              <button
                type="button"
                onClick={onMobileClose}
                className={`ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border md:hidden ${
                  isDark
                    ? "border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                    : "border-zinc-200 text-zinc-600 hover:bg-zinc-100"
                }`}
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            ) : null}
          </div>
        ) : (
          <div className="mx-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[rgb(173,8,8)] to-red-600 font-bold text-white shadow-sm">
            M
          </div>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          className={`absolute -right-3 top-1/2 z-30 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border shadow-sm transition hover:text-[rgb(173,8,8)] md:flex ${
            isDark
              ? "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
              : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50"
          } ${showCollapsed ? "rotate-180" : ""}`}
          aria-label="Toggle sidebar"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <div
        className={`flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 scrollbar-thin scrollbar-track-transparent ${
          isDark ? "scrollbar-thumb-zinc-700" : "scrollbar-thumb-zinc-200"
        }`}
      >
        {!showCollapsed ? (
          <div className="mb-4 flex items-center gap-2 px-2 sm:mb-6 sm:px-3">
            <div className="relative flex-1">
              <select
                value={lang}
                onChange={(e) => {
                  setLang(e.target.value as "en" | "vi");
                  onNav();
                }}
                className={`min-h-11 w-full min-w-0 touch-manipulation appearance-none rounded-xl border px-3 py-2 text-sm font-medium outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-500/10 ${
                  isDark
                    ? "border-zinc-700 bg-zinc-900 text-zinc-200"
                    : "border-zinc-200/80 bg-zinc-50/50 text-zinc-600"
                }`}
                aria-label={t("common.language")}
              >
                <option value="en">🇺🇸 English</option>
                <option value="vi">🇻🇳 Tiếng Việt</option>
              </select>
            </div>
            <button
              type="button"
              onClick={onToggleTheme}
              className={`flex h-10 min-h-[44px] w-10 min-w-[44px] shrink-0 items-center justify-center rounded-xl border transition ${
                isDark
                  ? "border-zinc-700 bg-zinc-900 text-amber-400 hover:bg-zinc-800"
                  : "border-zinc-200/80 bg-zinc-50/50 text-zinc-600 hover:bg-zinc-100"
              }`}
              aria-label={isDark ? "Light mode" : "Dark mode"}
              title={isDark ? "Light mode" : "Dark mode"}
            >
              {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
          </div>
        ) : (
          <div className="mb-4 flex justify-center sm:mb-6">
            <button
              type="button"
              onClick={onToggleTheme}
              className={`flex h-10 min-h-[44px] w-10 min-w-[44px] items-center justify-center rounded-xl border transition ${
                isDark
                  ? "border-zinc-700 bg-zinc-900 text-amber-400 hover:bg-zinc-800"
                  : "border-zinc-200/80 bg-zinc-50/50 text-zinc-600 hover:bg-zinc-100"
              }`}
              aria-label={isDark ? "Light mode" : "Dark mode"}
              title={isDark ? "Light mode" : "Dark mode"}
            >
              {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
          </div>
        )}

        <nav className="space-y-0.5 sm:space-y-1">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNav}
                className={`group relative flex touch-manipulation items-center overflow-hidden rounded-xl transition-all duration-200 ${
                  showCollapsed ? "min-h-[44px] justify-center px-0 py-3" : "min-h-[44px] gap-3 px-2 py-2.5 sm:px-3"
                } ${
                  active
                    ? isDark
                      ? "bg-gradient-to-r from-[rgb(173,8,8)]/20 to-zinc-900 text-red-300 font-semibold shadow-[inset_2px_0_0_0_rgb(173,8,8)]"
                      : "bg-gradient-to-r from-[rgb(173,8,8)]/10 to-red-50/50 text-[rgb(173,8,8)] font-semibold shadow-[inset_2px_0_0_0_rgb(173,8,8)]"
                    : isDark
                      ? "text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100"
                      : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
                }`}
                title={showCollapsed ? item.label : undefined}
              >
                <Icon
                  className={`shrink-0 transition-transform duration-200 ${
                    showCollapsed ? "h-[22px] w-[22px]" : "h-5 w-5"
                  } ${active ? "scale-110 text-[rgb(173,8,8)]" : "group-hover:scale-110 group-hover:text-[rgb(173,8,8)]"}`}
                />
                {!showCollapsed && <span className="min-w-0 flex-1 truncate pr-0.5 text-left">{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-3">
        <button
          type="button"
          onClick={() => void onLogout()}
          className={`group flex min-h-[48px] touch-manipulation items-center overflow-hidden rounded-xl text-sm font-semibold transition-colors ${
            showCollapsed
              ? isDark
                ? "justify-center p-3 border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:text-red-200"
                : "justify-center p-3 border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700"
              : isDark
                ? "w-full items-center justify-start gap-3 border border-red-500/30 bg-red-500/10 px-2 py-3 text-red-300 sm:px-3 sm:py-2.5"
                : "w-full items-center justify-start gap-3 border border-red-200 bg-red-50 px-2 py-3 text-red-600 sm:px-3 sm:py-2.5"
          } ${
            !showCollapsed && isDark ? "hover:bg-red-500/20 hover:text-red-200" : ""
          } ${
            !showCollapsed && !isDark ? "hover:bg-red-100 hover:text-red-700" : ""
          } `}
          title={showCollapsed ? t("sidebar.logoutLocal") : undefined}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!showCollapsed && <span className="min-w-0 flex-1 truncate text-left">{t("sidebar.logoutLocal")}</span>}
        </button>
      </div>
    </aside>
  );
}
