import {
  CalendarClock,
  FileCheck2,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
  Mail,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  title: string;
  /** Mô tả ngắn, dùng trong bảng lệnh Ctrl K */
  hint: string;
  icon: LucideIcon;
  /** Màu nhận diện riêng của mục (bộ ba HSL, dùng cho dock) */
  hue: string;
  /** Từ khoá tìm kiếm thêm (không dấu cũng được) */
  keywords?: string;
}

/** Các nhóm điều hướng, giữa các nhóm có vạch ngăn trong dock */
export const NAV_GROUPS: NavItem[][] = [
  [
    {
      href: "/",
      hue: "199 58% 52%",
      title: "Tổng quan",
      hint: "Lịch hôm nay, ca thi sắp tới, hộp thư",
      icon: LayoutDashboard,
      keywords: "dashboard home trang chu",
    },
    {
      href: "/mail",
      hue: "350 50% 60%",
      title: "Hộp thư",
      hint: "Gmail cá nhân và HCMUT",
      icon: Mail,
      keywords: "gmail email thu",
    },
  ],
  [
    {
      href: "/timetable",
      hue: "152 38% 46%",
      title: "Thời khóa biểu",
      hint: "Lịch học theo tuần",
      icon: CalendarClock,
      keywords: "tkb lich hoc schedule",
    },
    {
      href: "/exams",
      hue: "27 60% 54%",
      title: "Lịch thi",
      hint: "Ca thi giữa kỳ, cuối kỳ",
      icon: FileCheck2,
      keywords: "thi exam",
    },
    {
      href: "/academic-results",
      hue: "42 56% 52%",
      title: "Kết quả học tập",
      hint: "Bảng điểm, GPA, tiến độ CTĐT",
      icon: GraduationCap,
      keywords: "diem gpa cpa bang diem ctdt",
    },
    {
      href: "/thesis",
      hue: "180 38% 46%",
      title: "Đồ án",
      hint: "Đồ án chuyên ngành, mốc nộp, lịch bảo vệ, cuộc họp",
      icon: FolderKanban,
      keywords: "do an chuyen nganh thesis bao ve hoi dong gvhd",
    },
  ],
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flat();

export function isActiveHref(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function getPageTitle(pathname: string): string {
  return NAV_ITEMS.find((n) => isActiveHref(n.href, pathname))?.title ?? "MTWorkspace";
}

/** Sự kiện mở bảng lệnh Ctrl K từ bất kỳ đâu */
export const OPEN_COMMAND_EVENT = "mt-open-command";

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_COMMAND_EVENT));
}
