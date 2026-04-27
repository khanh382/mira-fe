/**
 * Origin gốc cho REST (`/api/v1`) và Socket.IO (`/webchat` + `/socket.io/`).
 * `NEXT_PUBLIC_API_URL` được Next gắn lúc build (static export).
 * Trên trình duyệt, nếu biến đó rỗng (build VPS thiếu .env), fallback về `window.location.origin`
 * để deploy cùng host (nginx: /api + /socket.io → backend) vẫn chạy được.
 */
export function getPublicApiOrigin(): string {
  const fromBuild = (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/+$/, "");
  if (fromBuild) return fromBuild;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
}
