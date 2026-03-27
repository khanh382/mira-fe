"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLang } from "@/lang";
import { useAuth } from "@/hooks/useAuth";
import { logoutUser } from "@/services/AuthService";
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  LogOut,
  MessageSquare,
  Settings,
  User,
  Users,
  Workflow,
} from "lucide-react";

interface AppSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function AppSidebar({ collapsed, onToggleCollapse }: AppSidebarProps) {
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
    { href: "/account/profile", label: t("sidebar.profile"), icon: User },
    ...(user?.level === "owner"
      ? [{ href: "/account/user-management", label: t("sidebar.userManagement"), icon: Users }]
      : []),
    { href: "/bot-config", label: t("sidebar.botConfig"), icon: Bot },
    { href: "/settings", label: t("sidebar.settings"), icon: Settings },
  ];

  return (
    <aside
      className={`border-r border-red-200 bg-red-50/70 p-3 transition-all duration-200 ${
        collapsed ? "w-20" : "w-72"
      }`}
    >
      <div className={`mb-5 flex items-center ${collapsed ? "justify-center" : "justify-between"}`}>
        {!collapsed && (
          <p className="text-2xl font-bold uppercase tracking-[0.18em] text-[rgb(173,8,8)]">MIRA</p>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-white text-red-700 hover:bg-red-100"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {!collapsed && (
        <div className="mb-4">
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as "en" | "vi")}
            className="w-16 rounded-md border border-red-300 bg-white px-2 py-1.5 text-center text-base text-red-700 outline-none ring-red-400 focus:ring-2"
            aria-label={t("common.language")}
          >
            <option value="en">🇺🇸</option>
            <option value="vi">🇻🇳</option>
          </select>
        </div>
      )}

      <nav className="space-y-2">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center rounded-lg text-sm font-medium transition ${
                collapsed ? "justify-center px-2 py-2.5" : "gap-2 px-3 py-2"
              } ${
                active
                  ? "bg-[rgb(173,8,8)] text-white"
                  : "bg-white text-red-700 hover:bg-red-100"
              }`}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={() => void onLogout()}
        className={`mt-6 flex rounded-lg bg-white text-sm font-medium text-red-700 hover:bg-red-100 ${
          collapsed ? "h-10 w-full items-center justify-center" : "w-full items-center gap-2 px-3 py-2"
        }`}
        title={collapsed ? t("sidebar.logoutLocal") : undefined}
      >
        <LogOut className="h-4 w-4 shrink-0" />
        {!collapsed && <span>{t("sidebar.logoutLocal")}</span>}
      </button>
    </aside>
  );
}
