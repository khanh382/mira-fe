"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  Workflow,
} from "lucide-react";

interface AppSidebarProps {
  collapsed: boolean;
  theme: "light" | "dark";
  onToggleCollapse: () => void;
  onToggleTheme: () => void;
}

export default function AppSidebar({ collapsed, theme, onToggleCollapse, onToggleTheme }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, lang, setLang } = useLang();
  const { logout, user } = useAuth();
  const onLogout = async () => {
    try {
      await logoutUser();
    } catch {
      // Always clear local auth even if API logout fails.
    } finally {
      logout();
      router.push("/login");
    }
  };
  const navItems = [
    { href: "/chat", label: t("sidebar.chat"), icon: MessageSquare },
    { href: "/workflows", label: t("sidebar.workflows"), icon: Workflow },
    { href: "/websites", label: t("sidebar.myWebsites"), icon: Globe },
    { href: "/account/profile", label: t("sidebar.profile"), icon: User },
    ...(user?.level === "owner"
      ? [{ href: "/account/user-management", label: t("sidebar.userManagement"), icon: Users }]
      : []),
    { href: "/bot-config", label: t("sidebar.botConfig"), icon: Bot },
    { href: "/settings", label: t("sidebar.settings"), icon: Settings },
  ];

  const isDark = theme === "dark";

  return (
    <aside
      className={`group relative z-20 flex h-full flex-col backdrop-blur-xl transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
        isDark
          ? "border-r border-zinc-800/80 bg-zinc-950/80"
          : "border-r border-zinc-200/60 bg-white/70"
      } ${collapsed ? "w-[72px]" : "w-72"}`}
    >
      <div className={`flex items-center p-4 transition-all duration-300 ${collapsed ? "justify-center" : "justify-between"}`}>
        {!collapsed ? (
          <div className="flex items-center gap-2 overflow-hidden px-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[rgb(173,8,8)] to-red-600 font-bold text-white shadow-md shadow-red-500/20">
              M
            </div>
            <p
              className={`animate-in fade-in slide-in-from-left-2 truncate text-xl font-black uppercase tracking-widest ${
                isDark ? "text-zinc-100" : "text-zinc-800"
              }`}
            >
              MIRA
            </p>
          </div>
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[rgb(173,8,8)] to-red-600 font-bold text-white shadow-sm">
            M
          </div>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          className={`absolute -right-3 top-5 z-30 hidden h-6 w-6 items-center justify-center rounded-full border shadow-sm transition hover:text-[rgb(173,8,8)] md:flex ${
            isDark
              ? "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
              : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50"
          } ${collapsed ? "rotate-180" : ""}`}
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
        {!collapsed ? (
          <div className="mb-6 flex items-center gap-2 px-3">
            <div className="relative flex-1">
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as "en" | "vi")}
                className={`w-full appearance-none rounded-xl border px-3 py-2 text-sm font-medium outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-500/10 ${
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
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition ${
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
          <div className="mb-6 flex justify-center">
            <button
              type="button"
              onClick={onToggleTheme}
              className={`flex h-10 w-10 items-center justify-center rounded-xl border transition ${
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

        <nav className="space-y-1">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative flex items-center overflow-hidden rounded-xl transition-all duration-200 ${
                  collapsed ? "justify-center px-0 py-3" : "gap-3 px-3 py-2.5"
                } ${
                  active
                    ? isDark
                      ? "bg-gradient-to-r from-[rgb(173,8,8)]/20 to-zinc-900 text-red-300 font-semibold shadow-[inset_2px_0_0_0_rgb(173,8,8)]"
                      : "bg-gradient-to-r from-[rgb(173,8,8)]/10 to-red-50/50 text-[rgb(173,8,8)] font-semibold shadow-[inset_2px_0_0_0_rgb(173,8,8)]"
                    : isDark
                      ? "text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100"
                      : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
                }`}
                title={collapsed ? item.label : undefined}
              >
                <Icon
                  className={`shrink-0 transition-transform duration-200 ${
                    collapsed ? "h-[22px] w-[22px]" : "h-5 w-5"
                  } ${active ? "scale-110 text-[rgb(173,8,8)]" : "group-hover:scale-110 group-hover:text-[rgb(173,8,8)]"}`}
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-3">
        <button
          type="button"
          onClick={() => void onLogout()}
          className={`group flex items-center overflow-hidden rounded-xl text-sm font-semibold transition-colors ${
            collapsed
              ? isDark
                ? "justify-center p-3 border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:text-red-200"
                : "justify-center p-3 border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700"
              : isDark
                ? "w-full gap-3 px-3 py-2.5 border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:text-red-200"
                : "w-full gap-3 px-3 py-2.5 border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700"
          }`}
          title={collapsed ? t("sidebar.logoutLocal") : undefined}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span className="truncate">{t("sidebar.logoutLocal")}</span>}
        </button>
      </div>
    </aside>
  );
}
