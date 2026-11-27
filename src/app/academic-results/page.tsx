"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  ChevronDown,
  GraduationCap,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { MyBkConnectModal } from "@/components/mybk/mybk-connect-modal";
import { CurriculumProgressTab } from "@/components/mybk/curriculum-progress-tab";
import {
  ComponentScoreItem,
  CourseDetailModal,
  CourseGradeDetailInput,
  OtherCourseRecord,
} from "@/components/mybk/course-detail-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapse } from "@/components/ui/collapse";
import { Select } from "@/components/ui/select";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { AcademicResultsSkeleton } from "@/components/ui/skeleton";
import {
  ConnectPrompt,
  EmptyState,
  ErrorState,
  StaleBanner,
} from "@/components/ui/state";
import { toast } from "@/components/ui/toast";
import { normalizeSearch } from "@/lib/format";
import { gradeTone } from "@/lib/grades";
import { useMybkResource, type ResourcePayload } from "@/lib/use-mybk-resource";
import { cn } from "@/lib/utils";

interface StudentOverviewInfo {
  masv: string;
  malop: string;
  hovaten: string;
  namHocHocKyTen: string;
}

interface SemesterRecord {
  sinhVienId: number;
  namHocHocKyId: number;
  maNamHocHocKy: string;
  namHocHocKyTen: string;
  soTCTLHocKy: number;
  diemTBTLHocKy: string;
  diemTBHocKyHe10?: string | null;
  diemChuHocKy?: string | null;
  soTCTLChung: string;
  diemTBTLChung: string;
  diemTBTLChungHe10?: string | null;
  capNhatCuoi: string | null;
}

interface CourseGradeRecord {
  sinhVienId: number;
  namHocHocKyId: number;
  maHocKy: string;
  monHocId: number;
  maMonHoc: string;
  tenMonHoc: string;
  tenMonHocEn?: string | null;
  soTinChi: number;
  soTinChiHocPhan?: number | null;
  diemChu: string | null;
  diemSo: number | null;
  diemDat: string | null;
  tinhTrangDiem: string | null;
  diemKhongIn: string | null;
  nhomTo: string | null;
  nhomThucHanh?: string | null;
  ghiChu: string | null;
  ngayCongBoDiem?: string | null;
  isNewUpdate?: boolean;
  componentScores?: ComponentScoreItem[];
}

interface SyncChangeNotification {
  id?: string;
  semesterCode: string;
  courseCode: string;
  title: string;
  message: string;
  createdAt: string;
}

interface TranscriptPayload extends ResourcePayload {
  studentId?: string | null;
  studentInfo?: StudentOverviewInfo | null;
  semesters?: SemesterRecord[];
  courses?: CourseGradeRecord[];
  otherCourses?: OtherCourseRecord[];
  recentChanges?: SyncChangeNotification[];
}

const BANNER_STORAGE_KEY = "mt-grade-banner-dismissed";
const SPECIAL_SCORES = new Set(["Miễn", "Đạt", "Rút môn"]);

function formatNumericScore(
  diemSo: number | null,
  diemChu: string | null
): string {
  if (diemSo === null || diemSo === undefined) return "--";
  const l = (diemChu || "").trim().toUpperCase();
  if (l === "MT" || diemSo === 12) return "Miễn";
  if (l === "DT" || diemSo === 21) return "Đạt";
  if (l === "RT" || diemSo === 17) return "Rút môn";
  if (diemSo > 10) return "--";
  return diemSo.toFixed(1);
}

function formatSyncTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function changeSignature(changes: SyncChangeNotification[]): string {
  return changes
    .map((c) => c.id ?? `${c.courseCode}-${c.createdAt}`)
    .join("|");
}

/** Trạng thái đồng bộ nhỏ ở thanh trên cùng */
function SyncStatus({
  refreshing,
  failed,
  lastSyncedAt,
  onRetry,
}: {
  refreshing: boolean;
  failed: boolean;
  lastSyncedAt: string | null;
  onRetry: () => void;
}) {
  if (refreshing) {
    return (
      <span className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
        <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
        Đang đồng bộ...
      </span>
    );
  }
  if (failed) {
    return (
      <span className="inline-flex items-center gap-2 text-[13px] text-warning-fg">
        <span className="h-2 w-2 rounded-full bg-warning" />
        Đồng bộ lỗi
        <button
          type="button"
          onClick={onRetry}
          className="font-semibold underline-offset-2 hover:underline"
        >
          Thử lại
        </button>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
      <span className="h-2 w-2 rounded-full bg-success" />
      {lastSyncedAt ? `Cập nhật ${formatSyncTime(lastSyncedAt)}` : "Đã đồng bộ"}
    </span>
  );
}

function Stat({
  label,
  children,
  sub,
}: {
  label: string;
  children: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="px-6 py-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold leading-none text-foreground">
        {children}
      </p>
      {sub && (
        <p className="mt-1.5 font-mono text-xs text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}

export default function AcademicResultsPage() {
  const resource = useMybkResource<TranscriptPayload>({
    url: "/api/mybk/transcript",
    isEmpty: (d) => Boolean(d.connected) && (d.semesters?.length ?? 0) === 0,
  });
  const data = resource.data;

  const [activeTab, setActiveTab] = useState<"transcript" | "progress">(
    "transcript"
  );
  const [connectOpen, setConnectOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] =
    useState<CourseGradeDetailInput | null>(null);
  const [dismissedSig, setDismissedSig] = useState<string | null>(null);
  const [refreshingManual, setRefreshingManual] = useState(false);

  // Bộ lọc
  const [semesterLov, setSemesterLov] = useState("ALL");
  const [gradeLov, setGradeLov] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  // Mặc định mở tất cả học kỳ; người dùng có thể chủ động thu gọn từng kỳ
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [otherOpen, setOtherOpen] = useState(true);

  const connected = data?.connected === true;
  const semesters = useMemo(() => data?.semesters ?? [], [data]);
  const courses = useMemo(() => data?.courses ?? [], [data]);
  const otherCourses = useMemo(() => data?.otherCourses ?? [], [data]);
  const recentChanges = useMemo(() => data?.recentChanges ?? [], [data]);

  // Nhớ banner "điểm mới" đã đóng (theo nội dung, có thay đổi mới thì hiện lại)
  useEffect(() => {
    try {
      setDismissedSig(localStorage.getItem(BANNER_STORAGE_KEY));
    } catch {
      // không đọc được localStorage: banner vẫn hiện bình thường
    }
  }, []);

  // Đồng bộ ngầm định kỳ, chỉ khi đã kết nối; và khi quay lại tab (tối thiểu cách nhau 1 phút)
  const refreshRef = useRef(resource.refresh);
  refreshRef.current = resource.refresh;
  const lastAutoRef = useRef(Date.now());
  useEffect(() => {
    if (!connected) return;
    const run = () => {
      lastAutoRef.current = Date.now();
      void refreshRef.current(false);
    };
    const interval = setInterval(run, 5 * 60 * 1000);
    const onVisible = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastAutoRef.current > 60 * 1000
      ) {
        run();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [connected]);

  const orderedSemesters = useMemo(() => {
    const regular = semesters
      .filter((s) => s.maNamHocHocKy !== "BL")
      .sort((a, b) => b.maNamHocHocKy.localeCompare(a.maNamHocHocKy));
    const transfer = semesters.filter((s) => s.maNamHocHocKy === "BL");
    return [...regular, ...transfer];
  }, [semesters]);

  const regularSemesters = orderedSemesters.filter(
    (s) => s.maNamHocHocKy !== "BL" && Number(s.soTCTLChung) > 0
  );
  const latestCumulative = regularSemesters[0] || orderedSemesters[0];
  const latestWithGpa =
    regularSemesters.find((s) => Number(s.diemTBTLHocKy) > 0) ||
    latestCumulative;
  const cpa = latestCumulative?.diemTBTLChung || "--";
  const cpaHe10 = latestCumulative?.diemTBTLChungHe10 || null;
  const totalCredits = latestCumulative?.soTCTLChung || "--";
  const latestGpa = latestWithGpa?.diemTBTLHocKy || "--";
  const latestGpa10 = latestWithGpa?.diemTBHocKyHe10 || null;
  const latestGpaLetter = latestWithGpa?.diemChuHocKy || null;
  const latestCode = latestWithGpa?.maNamHocHocKy || "";

  const filtersActive = gradeLov !== "ALL" || searchQuery.trim() !== "";

  const matchGrade = (letter: string | null): boolean => {
    if (gradeLov === "ALL") return true;
    const l = (letter || "").trim().toUpperCase();
    if (gradeLov === "A") return l === "A+" || l === "A";
    if (gradeLov === "B") return l === "B+" || l === "B";
    if (gradeLov === "C") return l === "C+" || l === "C";
    if (gradeLov === "D")
      return l === "D+" || l === "D" || l === "F" || l === "RT";
    if (gradeLov === "EXEMPT") return l === "MT" || l === "DT";
    return true;
  };

  const query = normalizeSearch(searchQuery.trim());
  const matchQuery = (code: string, name: string) =>
    !query || normalizeSearch(`${code} ${name}`).includes(query);

  const visibleSemesters = useMemo(() => {
    return orderedSemesters
      .filter((s) => semesterLov === "ALL" || s.maNamHocHocKy === semesterLov)
      .map((sem) => {
        const semCourses = courses.filter((c) => {
          const same =
            String(c.maHocKy) === String(sem.maNamHocHocKy) ||
            Number(c.namHocHocKyId) === Number(sem.namHocHocKyId);
          return same && matchGrade(c.diemChu) && matchQuery(c.maMonHoc, c.tenMonHoc);
        });
        return { sem, courses: semCourses };
      })
      .filter((x) => !filtersActive || x.courses.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedSemesters, courses, semesterLov, gradeLov, query, filtersActive]);

  const visibleOther = otherCourses.filter(
    (o) =>
      (semesterLov === "ALL" || o.maHocKy === semesterLov) &&
      matchQuery(o.maMonHoc, o.tenMonHoc || "") &&
      gradeLov === "ALL"
  );

  const isOpen = (code: string) =>
    filtersActive ? true : toggled[code] ?? true;
  const toggleSemester = (code: string) =>
    setToggled((prev) => ({ ...prev, [code]: !isOpen(code) }));

  const openCourse = (course: CourseGradeRecord, sem?: SemesterRecord) => {
    setSelectedCourse({
      ...course,
      namHocHocKyTen: sem?.namHocHocKyTen,
      capNhatCuoi: sem?.capNhatCuoi,
    });
  };

  const openOther = (other: OtherCourseRecord) => {
    const sem = semesters.find((s) => s.maNamHocHocKy === other.maHocKy);
    const match = courses.find(
      (c) =>
        c.maMonHoc.toUpperCase() === other.maMonHoc.toUpperCase() &&
        c.maHocKy === other.maHocKy
    );
    if (match) {
      openCourse(match, sem);
      return;
    }
    setSelectedCourse({
      sinhVienId: semesters[0]?.sinhVienId || 0,
      namHocHocKyId: sem?.namHocHocKyId || 0,
      maHocKy: other.maHocKy,
      namHocHocKyTen: sem?.namHocHocKyTen || `Học kỳ ${other.maHocKy}`,
      capNhatCuoi: other.capNhatCuoi,
      monHocId: 0,
      maMonHoc: other.maMonHoc,
      tenMonHoc:
        other.tenMonHoc && other.tenMonHoc !== "--"
          ? other.tenMonHoc
          : `Chứng chỉ / Điều kiện (${other.maMonHoc})`,
      soTinChi: 0,
      diemChu: "DT",
      diemSo: other.diemSo ? Number(other.diemSo) : 21,
      diemDat: "1",
      tinhTrangDiem: "Chính thức",
      diemKhongIn: "1",
      nhomTo: null,
      ghiChu: other.ghiChu,
      componentScores: [],
    });
  };

  const openChange = (change: SyncChangeNotification) => {
    const course = courses.find(
      (c) => c.maMonHoc.toUpperCase() === change.courseCode.toUpperCase()
    );
    if (course) {
      openCourse(
        course,
        semesters.find((s) => s.maNamHocHocKy === course.maHocKy)
      );
    }
  };

  const handleRefresh = async () => {
    setRefreshingManual(true);
    try {
      const ok = await resource.refresh(true);
      if (ok) toast.success("Đã cập nhật Kết quả học tập");
      else toast.error("Không thể làm mới Kết quả học tập");
    } finally {
      setRefreshingManual(false);
    }
  };

  const dismissBanner = () => {
    const sig = changeSignature(recentChanges);
    setDismissedSig(sig);
    try {
      localStorage.setItem(BANNER_STORAGE_KEY, sig);
    } catch {
      // bỏ qua: chỉ mất ghi nhớ giữa các lần mở
    }
  };

  const ssoExpired =
    data?.errorCode === "SSO_EXPIRED" || resource.status === "sso-expired";

  if (!data && resource.status === "loading") {
    return <AcademicResultsSkeleton />;
  }

  const bannerVisible =
    recentChanges.length > 0 && dismissedSig !== changeSignature(recentChanges);

  // ===== Nội dung tab Bảng điểm =====
  const renderTranscript = () => {
    if (resource.status === "error") {
      return (
        <ErrorState
          title="Không tải được bảng điểm"
          message={resource.error ?? undefined}
          onRetry={resource.retry}
        />
      );
    }
    if (resource.status === "not-connected" || resource.status === "sso-expired") {
      const expired = resource.status === "sso-expired";
      return (
        <ConnectPrompt
          expired={expired}
          title={
            expired ? "Phiên đăng nhập myBK đã hết hạn" : "Chưa kết nối myBK"
          }
          description={
            expired
              ? "Đăng nhập lại để cập nhật bảng điểm."
              : "Kết nối tài khoản SSO HCMUT để đồng bộ bảng điểm của bạn."
          }
          actionLabel={expired ? "Đăng nhập lại" : "Kết nối SSO myBK"}
          onConnect={() => setConnectOpen(true)}
        />
      );
    }
    if (resource.status === "empty" || semesters.length === 0) {
      return (
        <EmptyState
          icon={<GraduationCap />}
          title="Chưa có dữ liệu điểm"
          description="Hãy làm mới để đồng bộ từ myBK."
          action={
            <Button
              variant="secondary"
              size="sm"
              loading={refreshingManual}
              onClick={handleRefresh}
            >
              Làm mới
            </Button>
          }
        />
      );
    }

    return (
      <>
        {/* ===== Tổng quan: danh tính + 3 chỉ số chính ===== */}
        <section className="overflow-hidden rounded-2xl border bg-card">
          <div className="border-b bg-muted/20 px-6 py-4">
            <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
              {data?.studentInfo?.hovaten || "Sinh viên Bách Khoa"}
            </h2>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              MSSV {data?.studentInfo?.masv || data?.studentId || "--"}
              {data?.studentInfo?.malop && ` · Lớp ${data.studentInfo.malop}`}
            </p>
          </div>
          <div className="grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <Stat
              label="CPA tích lũy"
              sub={cpaHe10 ? `${cpaHe10} / 10` : undefined}
            >
              <span className="text-success-fg">{cpa}</span>
            </Stat>
            <Stat label="Tín chỉ tích lũy">
              {totalCredits !== "--" ? (
                <>
                  {totalCredits}
                  <span className="ml-1 text-sm font-medium text-muted-foreground">
                    TC
                  </span>
                </>
              ) : (
                "--"
              )}
            </Stat>
            <Stat
              label={`GPA học kỳ ${latestCode || "gần nhất"}`}
              sub={
                latestGpa10
                  ? `${latestGpa10} / 10${
                      latestGpaLetter ? ` · ${latestGpaLetter}` : ""
                    }`
                  : undefined
              }
            >
              <span className="text-primary">{latestGpa}</span>
            </Stat>
          </div>
        </section>

        {/* ===== Bộ lọc ===== */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <Select
              value={semesterLov}
              onChange={(e) => setSemesterLov(e.target.value)}
              aria-label="Chọn học kỳ"
              className="max-w-[15rem] truncate"
            >
              <option value="ALL">Tất cả học kỳ ({orderedSemesters.length})</option>
              {orderedSemesters.map((s) => (
                <option key={s.maNamHocHocKy} value={s.maNamHocHocKy}>
                  {s.maNamHocHocKy} — {s.namHocHocKyTen}
                </option>
              ))}
            </Select>
            <Select
              value={gradeLov}
              onChange={(e) => setGradeLov(e.target.value)}
              aria-label="Lọc điểm chữ"
            >
              <option value="ALL">Tất cả điểm</option>
              <option value="A">A / A+</option>
              <option value="B">B / B+</option>
              <option value="C">C / C+</option>
              <option value="D">D / D+ / F / RT</option>
              <option value="EXEMPT">Miễn / Đạt</option>
            </Select>
          </div>

          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm môn (không cần gõ dấu)"
              aria-label="Tìm môn học"
              className="h-9 w-64 rounded-lg border bg-background pl-9 pr-8 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-primary/40 focus:border-primary"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Xóa tìm kiếm"
                className="absolute right-2 flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ===== Danh sách học kỳ ===== */}
        {visibleSemesters.length === 0 ? (
          <EmptyState
            title="Không có môn phù hợp bộ lọc"
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setGradeLov("ALL");
                  setSemesterLov("ALL");
                }}
              >
                Xóa bộ lọc
              </Button>
            }
          />
        ) : (
          <div className="mt-stagger space-y-4">
            {visibleSemesters.map(({ sem, courses: semCourses }) => {
              const open = isOpen(sem.maNamHocHocKy);
              const isTransfer = sem.maNamHocHocKy === "BL";
              return (
                <section
                  key={sem.maNamHocHocKy}
                  className="overflow-hidden rounded-2xl border bg-card"
                >
                  {/* Tiêu đề học kỳ: GPA + TC là chính, CPA là phụ */}
                  <button
                    type="button"
                    onClick={() => toggleSemester(sem.maNamHocHocKy)}
                    aria-expanded={open}
                    className={cn(
                      "flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-muted/25 px-5 py-3.5 text-left transition-colors hover:bg-muted/40",
                      open && "border-b"
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                          !open && "-rotate-90"
                        )}
                      />
                      <Badge tone="primary">{sem.maNamHocHocKy}</Badge>
                      <span className="truncate font-display text-[15px] font-semibold text-foreground">
                        {sem.namHocHocKyTen}
                      </span>
                    </span>
                    <span className="flex items-center gap-4 font-mono text-[13px] text-muted-foreground">
                      {isTransfer ? (
                        <span>
                          <span className="font-semibold text-success-fg">
                            {sem.soTCTLHocKy}
                          </span>{" "}
                          TC miễn / bảo lưu
                        </span>
                      ) : (
                        <>
                          <span>
                            GPA{" "}
                            <span className="font-semibold text-primary">
                              {sem.diemTBTLHocKy}
                            </span>
                          </span>
                          <span>
                            <span className="font-semibold text-foreground">
                              {sem.soTCTLHocKy}
                            </span>{" "}
                            TC
                          </span>
                          <span className="hidden sm:inline">
                            CPA {sem.diemTBTLChung}
                          </span>
                        </>
                      )}
                    </span>
                  </button>

                  <Collapse open={open}>
                    {semCourses.length === 0 ? (
                      <p className="px-5 py-6 text-center text-[13px] text-muted-foreground">
                        Chưa có điểm môn học trong học kỳ này
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-[13px]">
                          <thead>
                            <tr className="border-b text-xs font-semibold text-muted-foreground">
                              <th className="px-5 py-2.5">Môn học</th>
                              <th className="px-3 py-2.5 text-center">TC</th>
                              <th className="px-3 py-2.5">Điểm</th>
                              <th className="hidden px-5 py-2.5 sm:table-cell">
                                Ghi chú
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {semCourses.map((course) => {
                              const score = formatNumericScore(
                                course.diemSo,
                                course.diemChu
                              );
                              const special = SPECIAL_SCORES.has(score);
                              const note =
                                course.ghiChu ||
                                (course.diemDat === "1" && !course.diemChu
                                  ? "Đạt"
                                  : "");
                              return (
                                <tr
                                  key={`${sem.maNamHocHocKy}-${course.monHocId}-${course.maMonHoc}`}
                                  onClick={() => openCourse(course, sem)}
                                  className="cursor-pointer transition-colors hover:bg-muted/30"
                                >
                                  {/* Môn: tên, rồi mã · nhóm */}
                                  <td className="px-5 py-3">
                                    <p className="flex items-center gap-2 font-display text-sm font-semibold text-foreground">
                                      {course.tenMonHoc}
                                      {course.isNewUpdate && (
                                        <Badge tone="success">Mới</Badge>
                                      )}
                                    </p>
                                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                                      {course.maMonHoc}
                                      {course.nhomTo &&
                                        ` · Nhóm ${
                                          course.nhomThucHanh
                                            ? `${course.nhomTo}-${course.nhomThucHanh}`
                                            : course.nhomTo
                                        }`}
                                    </p>
                                  </td>

                                  <td className="px-3 py-3 text-center font-mono font-medium text-foreground">
                                    {course.soTinChi}
                                    {course.soTinChi === 0 &&
                                      course.soTinChiHocPhan &&
                                      course.soTinChiHocPhan > 0 && (
                                        <span className="ml-1 text-xs text-muted-foreground">
                                          ({course.soTinChiHocPhan} HP)
                                        </span>
                                      )}
                                  </td>

                                  {/* Điểm: số + chữ trong một ô */}
                                  <td className="px-3 py-3">
                                    {special ? (
                                      <Badge tone={gradeTone(course.diemChu)}>
                                        {score}
                                      </Badge>
                                    ) : (
                                      <span className="inline-flex items-center gap-2">
                                        <span className="min-w-8 font-mono text-sm font-semibold text-foreground">
                                          {score}
                                        </span>
                                        {course.diemChu && (
                                          <Badge tone={gradeTone(course.diemChu)}>
                                            {course.diemChu}
                                          </Badge>
                                        )}
                                      </span>
                                    )}
                                  </td>

                                  <td className="hidden px-5 py-3 text-xs text-muted-foreground sm:table-cell">
                                    {note || "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Collapse>
                </section>
              );
            })}

            {/* ===== Môn khác và chứng chỉ điều kiện: thu gọn sẵn ===== */}
            {visibleOther.length > 0 && (
              <section className="overflow-hidden rounded-2xl border bg-card">
                <button
                  type="button"
                  onClick={() => setOtherOpen((o) => !o)}
                  aria-expanded={otherOpen}
                  className={cn(
                    "flex w-full items-center justify-between bg-muted/25 px-5 py-3.5 text-left transition-colors hover:bg-muted/40",
                    otherOpen && "border-b"
                  )}
                >
                  <span className="font-display text-[15px] font-semibold text-foreground">
                    Môn khác & chứng chỉ điều kiện
                    <span className="ml-1.5 font-mono text-[13px] font-medium text-muted-foreground">
                      ({visibleOther.length})
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform duration-200",
                      !otherOpen && "-rotate-90"
                    )}
                  />
                </button>
                <Collapse open={otherOpen}>
                  <ul className="divide-y">
                    {visibleOther.map((oth, idx) => (
                      <li key={`other-${oth.maHocKy}-${oth.maMonHoc}-${idx}`}>
                        <button
                          type="button"
                          onClick={() => openOther(oth)}
                          className="grid w-full grid-cols-[4.5rem_1fr_auto] items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/30"
                        >
                          <span className="font-mono text-xs text-muted-foreground">
                            {oth.maHocKy}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-display text-sm font-semibold text-foreground">
                              {oth.tenMonHoc && oth.tenMonHoc !== "--"
                                ? oth.tenMonHoc
                                : `Chứng chỉ / Điều kiện (${oth.maMonHoc})`}
                            </span>
                            <span className="block font-mono text-xs text-muted-foreground">
                              {oth.maMonHoc}
                            </span>
                          </span>
                          <Badge tone="success">{oth.ghiChu || "Đạt"}</Badge>
                        </button>
                      </li>
                    ))}
                  </ul>
                </Collapse>
              </section>
            )}
          </div>
        )}
      </>
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* ===== Thanh trên: tab · trạng thái đồng bộ · làm mới · tài khoản SSO ===== */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3">
        <SegmentedTabs
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { value: "transcript", label: "Bảng điểm" },
            { value: "progress", label: "Tiến độ học tập" },
          ]}
        />
        <div className="flex flex-wrap items-center gap-3">
          {connected && (
            <SyncStatus
              refreshing={resource.refreshing || refreshingManual}
              failed={resource.isStale}
              lastSyncedAt={resource.lastSyncedAt}
              onRetry={handleRefresh}
            />
          )}
          {connected && (
            <Button
              variant="secondary"
              size="icon"
              onClick={handleRefresh}
              disabled={refreshingManual}
              aria-label="Đồng bộ ngay từ myBK"
              title="Đồng bộ ngay từ myBK"
            >
              <RefreshCw
                className={cn(
                  "h-4 w-4",
                  (refreshingManual || resource.refreshing) && "animate-spin"
                )}
              />
            </Button>
          )}
          <Button
            variant={connected ? "secondary" : "primary"}
            onClick={() => setConnectOpen(true)}
          >
            <ShieldCheck className="h-4 w-4" />
            {connected ? "Tài khoản SSO" : "Kết nối myBK"}
          </Button>
        </div>
      </div>

      {/* Phiên SSO hết hạn nhưng vẫn còn dữ liệu đã lưu */}
      {ssoExpired && connected && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-2.5 text-[13px] text-warning-fg animate-in fade-in duration-200">
          <span>Phiên đăng nhập myBK đã hết hạn, đang hiển thị điểm đã lưu.</span>
          <Button
            variant="ghost"
            size="sm"
            className="text-warning-fg hover:bg-warning/15"
            onClick={() => setConnectOpen(true)}
          >
            Đăng nhập lại
          </Button>
        </div>
      )}

      {/* Đồng bộ lỗi (không phải do SSO) nhưng còn dữ liệu */}
      {resource.isStale && !ssoExpired && connected && (
        <StaleBanner
          lastSyncedAt={resource.lastSyncedAt}
          message="Chưa cập nhật được điểm từ myBK, đang hiển thị dữ liệu đã lưu"
          refreshing={refreshingManual}
          onRefresh={handleRefresh}
        />
      )}

      {/* Điểm mới phát hiện: đóng được và nhớ lựa chọn */}
      {activeTab === "transcript" && bannerVisible && (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-success/30 bg-success/10 px-5 py-3.5 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex min-w-0 items-start gap-3">
            <Bell className="mt-0.5 h-4 w-4 shrink-0 text-success-fg" />
            <div className="min-w-0">
              <p className="font-display text-sm font-semibold text-foreground">
                Có cập nhật điểm mới từ myBK
              </p>
              <ul className="mt-1 space-y-0.5">
                {recentChanges.slice(0, 3).map((ch, i) => (
                  <li key={`${ch.courseCode}-${i}`}>
                    <button
                      type="button"
                      onClick={() => openChange(ch)}
                      className="text-left text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <span className="font-semibold text-foreground">
                        {ch.title}:
                      </span>{" "}
                      {ch.message}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <button
            type="button"
            onClick={dismissBanner}
            aria-label="Đóng thông báo điểm mới"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {activeTab === "progress" ? (
        <CurriculumProgressTab
          onConnect={() => setConnectOpen(true)}
          transcriptCourses={courses.map((c) => {
            const sem = semesters.find((s) => s.maNamHocHocKy === c.maHocKy);
            return {
              maMonHoc: c.maMonHoc,
              tenMonHocEn: c.tenMonHocEn,
              soTinChiHocPhan: c.soTinChiHocPhan,
              maHocKy: c.maHocKy,
              namHocHocKyTen: sem?.namHocHocKyTen,
              nhomTo: c.nhomTo,
              nhomThucHanh: c.nhomThucHanh,
              soTinChi: c.soTinChi,
              diemSo: c.diemSo,
              diemChu: c.diemChu,
              ghiChu: c.ghiChu,
              ngayCongBoDiem: c.ngayCongBoDiem,
              capNhatCuoi: sem?.capNhatCuoi,
              componentScores: c.componentScores,
            };
          })}
        />
      ) : (
        renderTranscript()
      )}

      <CourseDetailModal
        course={selectedCourse}
        allAttempts={
          selectedCourse
            ? courses
                .filter(
                  (c) =>
                    c.maMonHoc.toUpperCase() ===
                    selectedCourse.maMonHoc.toUpperCase()
                )
                .map((c) => {
                  const s = semesters.find(
                    (sem) => sem.maNamHocHocKy === c.maHocKy
                  );
                  return {
                    ...c,
                    namHocHocKyTen: s?.namHocHocKyTen,
                    capNhatCuoi: s?.capNhatCuoi,
                  };
                })
            : []
        }
        relatedOtherRecords={
          selectedCourse
            ? otherCourses.filter(
                (o) =>
                  o.maMonHoc.toUpperCase() ===
                  selectedCourse.maMonHoc.toUpperCase()
              )
            : []
        }
        onClose={() => setSelectedCourse(null)}
      />

      <MyBkConnectModal
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        connectedStudentId={data?.studentId ?? null}
        lastSyncedAt={data?.lastSyncedAt ?? null}
      />
    </div>
  );
}
