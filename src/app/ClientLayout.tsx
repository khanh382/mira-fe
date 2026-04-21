"use client";

import React, { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

  return (
    <QueryClientProvider client={queryClient}>
      <LangProvider>
        {isLoginPage ? (
          <main className="min-h-screen font-sans selection:bg-red-200 selection:text-red-900">{children}</main>
        ) : (
          <div
            className={`flex min-h-screen font-sans selection:bg-red-200 selection:text-red-900 ${
              theme === "dark" ? "bg-zinc-950" : "bg-slate-50"
            }`}
          >
            <AppSidebar
              collapsed={sidebarCollapsed}
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
            <main className="relative flex h-screen flex-1 flex-col overflow-hidden p-2 sm:p-3 lg:p-4">
              <div
                className={`relative flex flex-1 w-full flex-col overflow-y-auto overflow-x-hidden rounded-2xl ring-1 ${
                  theme === "dark"
                    ? "border border-zinc-800 bg-zinc-900 shadow-none ring-zinc-800"
                    : "border border-zinc-200/50 bg-white shadow-sm ring-zinc-200"
                }`}
              >
                {children}
              </div>
            </main>
          </div>
        )}
      </LangProvider>
    </QueryClientProvider>
  );
}