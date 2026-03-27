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
          <main className="min-h-screen">{children}</main>
        ) : (
          <div className="flex min-h-screen bg-red-100/40">
            <AppSidebar
              collapsed={sidebarCollapsed}
              onToggleCollapse={() => {
                setSidebarCollapsed((prev) => {
                  const next = !prev;
                  if (typeof window !== "undefined") {
                    window.localStorage.setItem("mira_sidebar_collapsed", next ? "1" : "0");
                  }
                  return next;
                });
              }}
            />
            <main className="min-h-screen flex-1 p-6">{children}</main>
          </div>
        )}
      </LangProvider>
    </QueryClientProvider>
  );
}