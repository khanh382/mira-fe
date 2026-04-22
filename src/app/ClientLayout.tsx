"use client";

import React, { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Menu, Moon, Sun } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { LangProvider } from "@/lang/LangProvider";
import AppSidebar from "@/components/AppSidebar";

interface ClientLayoutProps {
  children: React.ReactNode;
}

export function ClientLayout({ children }: ClientLayoutProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnMount: true,
          },
        },
      })
  );

  const pathname = usePathname();
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Check if current page is login
  const isLoginPage =
    pathname === "/login" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password";

  const { isAuth, isChecking, checkAuth } = useAuth();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    const stored =
      typeof window !== "undefined"
        ? window.localStorage.getItem("mira_sidebar_collapsed")
        : null;
    setSidebarCollapsed(stored === "1");
  }, []);

  useEffect(() => {
    const storedTheme =
      typeof window !== "undefined"
        ? window.localStorage.getItem("mira_theme")
        : null;
    setTheme(storedTheme === "light" ? "light" : "dark");
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const body = document.body;
    body.classList.toggle("theme-dark", theme === "dark");
  }, [theme]);

  // Handle authentication redirects
  useEffect(() => {
    if (isChecking) return;

    if (!isAuth && !isLoginPage) {
      router.push("/login");
    }

    if (isAuth && isLoginPage) {
      router.push("/chat");
    }
  }, [isAuth, isChecking, isLoginPage, router]);

  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  useEffect(() => {
    closeMobileNav();
  }, [pathname, closeMobileNav]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (mobileNavOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [mobileNavOpen]);

  return (
    <QueryClientProvider client={queryClient}>
      <LangProvider>
        {isLoginPage ? (
          <main className="min-h-dvh font-sans selection:bg-red-200 selection:text-red-900 sm:min-h-screen">{children}</main>
        ) : (
          <div
            className={`flex h-[100dvh] min-h-0 w-full font-sans selection:bg-red-200 selection:text-red-900 md:min-h-screen ${
              theme === "dark" ? "bg-zinc-950" : "bg-slate-50"
            }`}
          >
            {mobileNavOpen && (
              <button
                type="button"
                className="fixed inset-0 z-40 cursor-default bg-black/50 backdrop-blur-sm md:hidden"
                aria-label="Close menu"
                onClick={closeMobileNav}
              />
            )}

            <AppSidebar
              collapsed={sidebarCollapsed}
              mobileOpen={mobileNavOpen}
              onMobileClose={closeMobileNav}
              theme={theme}
              onToggleCollapse={() => {
                setSidebarCollapsed((prev) => {
                  const next = !prev;
                  if (typeof window !== "undefined") {
                    window.localStorage.setItem("mira_sidebar_collapsed", next ? "1" : "0");
                  }
                  return next;
                });
              }}
              onToggleTheme={() => {
                setTheme((prev) => {
                  const next = prev === "dark" ? "light" : "dark";
                  if (typeof window !== "undefined") {
                    window.localStorage.setItem("mira_theme", next);
                  }
                  return next;
                });
              }}
            />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <header
                className={`flex h-12 shrink-0 items-center gap-2 border-b px-2 pr-1 sm:h-14 md:hidden ${
                  theme === "dark" ? "border-zinc-800 bg-zinc-950/95" : "border-zinc-200/80 bg-white/95"
                }`}
                style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
              >
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(true)}
                  className={`inline-flex h-10 min-h-[44px] w-10 min-w-[44px] items-center justify-center rounded-xl border ${
                    theme === "dark"
                      ? "border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                      : "border-zinc-200 text-zinc-800 hover:bg-zinc-100"
                  }`}
                  aria-expanded={mobileNavOpen}
                  aria-label="Open navigation menu"
                >
                  <Menu className="h-6 w-6" />
                </button>
                <div className="flex min-w-0 flex-1 items-center justify-center pr-2">
                  <span className="truncate text-lg font-black uppercase tracking-widest text-[rgb(173,8,8)]">MIRA</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setTheme((p) => {
                      const n = p === "dark" ? "light" : "dark";
                      if (typeof window !== "undefined") window.localStorage.setItem("mira_theme", n);
                      return n;
                    });
                  }}
                  className={`inline-flex h-10 min-h-[44px] w-10 min-w-[44px] items-center justify-center rounded-xl border ${
                    theme === "dark"
                      ? "border-zinc-700 text-amber-400 hover:bg-zinc-800"
                      : "border-zinc-200 text-zinc-600 hover:bg-zinc-100"
                  }`}
                  aria-label={theme === "dark" ? "Light mode" : "Dark mode"}
                >
                  {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                </button>
              </header>
              <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden p-1.5 sm:p-2 md:p-3 lg:p-4">
                <div
                  className={`relative flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden rounded-xl sm:rounded-2xl sm:ring-1 ${
                    theme === "dark"
                      ? "border border-zinc-800 bg-zinc-900 shadow-none ring-zinc-800"
                      : "border border-zinc-200/50 bg-white shadow-sm ring-zinc-200"
                  }`}
                >
                  {children}
                </div>
              </main>
            </div>
          </div>
        )}
      </LangProvider>
    </QueryClientProvider>
  );
}