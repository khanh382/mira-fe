import { toast } from "sonner";

type NotifyType = "success" | "error" | "info";

export const notify = {
  success: (message: string) => toast.success(message),
  error: (message: string) => toast.error(message),
  info: (message: string) => toast(message),
  warning: (message: string) => toast.warning(message),
  /**
   * Helper cho các response POST/PATCH/DELETE sau này:
   * truyền message từ API vào để hiển thị thống nhất.
   */
  fromApi: (message: string | null | undefined, type: NotifyType = "success", fallback = "Done.") => {
    const text = (message || "").trim() || fallback;
    if (type === "error") {
      toast.error(text);
      return;
    }
    if (type === "info") {
      toast(text);
      return;
    }
    toast.success(text);
  },
};

export const isPageReload = (): boolean => {
  if (typeof window === "undefined") return false;
  const nav = window.performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (nav?.type) return nav.type === "reload";

  const legacy = window.performance as Performance & {
    navigation?: { type?: number };
  };
  return legacy.navigation?.type === 1;
};
