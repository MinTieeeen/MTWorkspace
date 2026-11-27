// Helper giao diện Gmail dùng chung cho trang Hộp thư và widget ở Tổng quan.

export const accountLabel = (type: "HCMUT" | "PERSONAL") =>
  type === "HCMUT" ? "HCMUT" : "Cá nhân";

/** Đường dẫn mở đúng cuộc trò chuyện trong Gmail của đúng tài khoản. `#all/` mở được thư ở mọi thư mục (đến, đã gửi, gắn sao...). */
export function gmailThreadUrl(accountEmail: string, threadId: string): string {
  const user = encodeURIComponent(accountEmail).replace(/%40/g, "@");
  return `https://mail.google.com/mail/u/${user}/#all/${encodeURIComponent(
    threadId
  )}`;
}

/** Hôm nay hiện giờ, ngày khác hiện dd/mm */
export function formatMailDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  return sameDay
    ? d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

export function extractEnableApiUrl(rawError: string): string | null {
  const match = rawError.match(/https:\/\/console\.developers\.google\.com\S+/);
  return match ? match[0] : null;
}
