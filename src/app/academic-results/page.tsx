"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  X,
} from "lucide-react";
import { MyBkConnectModal } from "@/components/mybk/mybk-connect-modal";
import { AcademicResultsSkeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import {
  ComponentScoreItem,
  CourseDetailModal,
  CourseGradeDetailInput,
  OtherCourseRecord,
} from "@/components/mybk/course-detail-modal";

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
  soTCTLChung: string;
  diemTBTLChung: string;
  capNhatCuoi: string | null;
}

interface CourseGradeRecord {
  sinhVienId: number;
  namHocHocKyId: number;
  maHocKy: string;
  monHocId: number;
  maMonHoc: string;
  tenMonHoc: string;
  soTinChi: number;
  diemChu: string | null;
  diemSo: number | null;
  diemDat: string | null;
  tinhTrangDiem: string | null;
  diemKhongIn: string | null;
  nhomTo: string | null;
  ghiChu: string | null;
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

function getLetterBadgeStyle(letter: string | null): string {
  const l = (letter || "").trim().toUpperCase();
  if (l === "A+" || l === "A") {
    return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
  }
  if (l === "B+" || l === "B") {
    return "bg-sky-500/15 text-sky-600 dark:text-sky-400";
  }
  if (l === "C+" || l === "C") {
    return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  }
  if (l === "MT" || l === "DT") {
    return "bg-teal-500/15 text-teal-600 dark:text-teal-400";
  }
  if (l === "D+" || l === "D" || l === "F" || l === "RT") {
    return "bg-rose-500/15 text-rose-600 dark:text-rose-400";
  }
  return "bg-muted text-muted-foreground";
}

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

function formatSyncTimeAgo(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function AcademicResultsPage() {
  const [activeTab, setActiveTab] = useState<"transcript" | "progress">(
    "transcript"
  );
  const [connected, setConnected] = useState(false);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [studentInfo, setStudentInfo] = useState<StudentOverviewInfo | null>(
    null
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [semesters, setSemesters] = useState<SemesterRecord[]>([]);
  const [courses, setCourses] = useState<CourseGradeRecord[]>([]);
  const [otherCourses, setOtherCourses] = useState<OtherCourseRecord[]>([]);
  const [recentChanges, setRecentChanges] = useState<SyncChangeNotification[]>(
    []
  );
  const [dismissedBanner, setDismissedBanner] = useState(false);

  const [loading, setLoading] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [bgSyncing, setBgSyncing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const bgSyncRunningRef = useRef(false);

  // Selected course for read-only detail modal
  const [selectedCourse, setSelectedCourse] =
    useState<CourseGradeDetailInput | null>(null);

  // Filters
  const [semesterLov, setSemesterLov] = useState("ALL");
  const [gradeLov, setGradeLov] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedSemesters, setCollapsedSemesters] = useState<
    Record<string, boolean>
  >({});

  const applyPayload = (data: {
    connected?: boolean;
    studentId?: string | null;
    studentInfo?: StudentOverviewInfo | null;
    lastSyncedAt?: string | null;
    semesters?: SemesterRecord[];
    courses?: CourseGradeRecord[];
    otherCourses?: OtherCourseRecord[];
    recentChanges?: SyncChangeNotification[];
  }) => {
    setConnected(Boolean(data.connected));
    setStudentId(data.studentId || null);
    setStudentInfo(data.studentInfo || null);
    setLastSyncedAt(data.lastSyncedAt || null);
    setSemesters(data.semesters || []);
    setCourses(data.courses || []);
    setOtherCourses(data.otherCourses || []);
    if (data.recentChanges && data.recentChanges.length > 0) {
      setRecentChanges(data.recentChanges);
    }
  };

  /**
   * Background SWR Revalidation:
   * Silently calls /api/mybk/transcript?revalidate=1 to refresh via Auto-SSO & Upsert into PostgreSQL
   */
  const runBackgroundRevalidate = useCallback(async (force = false) => {
    if (bgSyncRunningRef.current) return;
    bgSyncRunningRef.current = true;
    setBgSyncing(true);
    try {
      const res = await fetch(
        `/api/mybk/transcript?revalidate=1${force ? "&force=1" : ""}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const freshData = await res.json();
        applyPayload(freshData);
        if (force) {
          toast.success("Đã cập nhật Kết quả học tập");
        }
      } else if (force) {
        toast.error("Không thể làm mới Kết quả học tập");
      }
    } catch {
      if (force) {
        toast.error("Lỗi kết nối khi đồng bộ");
      }
    } finally {
      bgSyncRunningRef.current = false;
      setBgSyncing(false);
    }
  }, []);

  /**
   * Step 1: Fast <20ms initial read from PostgreSQL, followed by automatic SWR background check
   */
  const loadTranscriptSWR = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mybk/transcript", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      applyPayload(data);

      // Step 2: If connected and stale (or has auto-SSO), trigger silent background revalidation
      if (data.connected && (data.isStale || data.hasAutoSso)) {
        runBackgroundRevalidate(false);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setInitialLoaded(true);
    }
  }, [runBackgroundRevalidate]);

  useEffect(() => {
    loadTranscriptSWR();

    // Auto-revalidate every 5 minutes in the background while workspace is open
    const intervalId = setInterval(() => {
      runBackgroundRevalidate(false);
    }, 5 * 60 * 1000);

    // Revalidate when user switches back to this browser tab
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        runBackgroundRevalidate(false);
      }
    };

    const onManualUpdate = () => loadTranscriptSWR();

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("mt-mybk-updated", onManualUpdate);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("mt-mybk-updated", onManualUpdate);
    };
  }, [loadTranscriptSWR, runBackgroundRevalidate]);

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
  const totalCredits = latestCumulative?.soTCTLChung || "--";
  const latestSemGpa = latestWithGpa?.diemTBTLHocKy || "--";
  const latestSemCode = latestWithGpa?.maNamHocHocKy || "";

  const toggleSemester = (maHocKy: string) => {
    setCollapsedSemesters((prev) => ({
      ...prev,
      [maHocKy]: !prev[maHocKy],
    }));
  };

  const matchGradeFilter = (letter: string | null): boolean => {
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

  const filteredSemesters = orderedSemesters.filter((sem) =>
    semesterLov === "ALL" ? true : sem.maNamHocHocKy === semesterLov
  );

  const filteredOtherCourses = otherCourses.filter((o) => {
    if (semesterLov !== "ALL" && o.maHocKy !== semesterLov) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        o.maMonHoc.toLowerCase().includes(q) ||
        o.tenMonHoc.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleOpenCourseDetail = (
    course: CourseGradeRecord,
    sem?: SemesterRecord
  ) => {
    setSelectedCourse({
      ...course,
      namHocHocKyTen: sem?.namHocHocKyTen,
      capNhatCuoi: sem?.capNhatCuoi,
    });
  };

  const handleOpenOtherCourseDetail = (other: OtherCourseRecord) => {
    const sem = semesters.find((s) => s.maNamHocHocKy === other.maHocKy);
    const matchingCourse = courses.find(
      (c) =>
        c.maMonHoc.toUpperCase() === other.maMonHoc.toUpperCase() &&
        c.maHocKy === other.maHocKy
    );

    if (matchingCourse) {
      handleOpenCourseDetail(matchingCourse, sem);
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

  if (!initialLoaded) return <AcademicResultsSkeleton />;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* 1. Top Navigation Bar: 2 Tabs + Auto-Sync Status Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-5 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("transcript")}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
              activeTab === "transcript"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            Bảng điểm học kỳ
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("progress")}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
              activeTab === "progress"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            Tiến độ học tập
          </button>
        </div>

        {/* Right: Auto-SSO SWR Status Pill & Settings Trigger */}
        <div className="flex items-center gap-2">
          {connected && (
            <div className="inline-flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
              {bgSyncing ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span className="text-foreground">Đang đồng bộ ngầm...</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span>
                    Tự động đồng bộ
                    {lastSyncedAt
                      ? ` • ${formatSyncTimeAgo(lastSyncedAt)}`
                      : ""}
                  </span>
                </>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="group inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <ShieldCheck className="h-4 w-4 icon-anim-wiggle" />
            <span>{connected ? "Tài khoản SSO" : "Kết nối SSO myBK"}</span>
          </button>
        </div>
      </div>

      {/* Detected Grade Updates Notification Banner (From Diff Engine) */}
      {!dismissedBanner && recentChanges.length > 0 && (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3.5 text-sm">
          <div className="flex items-start gap-3">
            <Bell className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="space-y-1">
              <p className="font-bold text-foreground">
                Phát hiện cập nhật điểm mới từ myBK
              </p>
              <div className="space-y-0.5 text-xs text-muted-foreground">
                {recentChanges.slice(0, 3).map((ch, i) => (
                  <p key={`${ch.courseCode}-${i}`}>
                    <strong className="text-foreground">{ch.title}:</strong>{" "}
                    {ch.message}
                  </p>
                ))}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDismissedBanner(true)}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {activeTab === "progress" ? (
        <div className="flex h-80 flex-col items-center justify-center gap-2 rounded-2xl border bg-card p-6 text-center">
          <GraduationCap className="h-8 w-8 text-muted-foreground" />
          <p className="font-display text-base font-bold text-foreground">
            Tiến độ học tập
          </p>
          <p className="text-sm text-muted-foreground">
            Sẽ triển khai ở bước tiếp theo sau Bảng điểm học kỳ
          </p>
        </div>
      ) : (
        <>
          {/* 2. Unified Overview Box */}
          <section className="overflow-hidden rounded-2xl border bg-card">
            <div className="flex flex-col justify-between gap-4 border-b bg-muted/20 px-6 py-4 md:flex-row md:items-center">
              <div className="flex items-center gap-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <UserCheck className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-extrabold tracking-tight text-foreground">
                    {studentInfo?.hovaten || "Sinh viên Bách Khoa"}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <span className="font-mono rounded-md bg-primary/10 px-2 py-0.5 font-bold text-primary">
                      MSSV: {studentInfo?.masv || studentId || "--"}
                    </span>
                    {studentInfo?.malop && (
                      <span className="font-mono rounded-md border bg-card px-2 py-0.5 font-bold text-foreground">
                        Lớp: {studentInfo.malop}
                      </span>
                    )}
                    {studentInfo?.namHocHocKyTen && (
                      <span className="rounded-md bg-muted px-2 py-0.5">
                        {studentInfo.namHocHocKyTen}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Unified 4-Column Academic Summary Row */}
            <div className="grid grid-cols-2 divide-y sm:grid-cols-4 sm:divide-x sm:divide-y-0">
              <div className="px-6 py-4">
                <span className="text-xs font-semibold text-muted-foreground">
                  CPA tích lũy (Hệ 4)
                </span>
                <p className="font-display mt-1 text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                  {cpa}
                </p>
              </div>

              <div className="px-6 py-4">
                <span className="text-xs font-semibold text-muted-foreground">
                  Tín chỉ tích lũy
                </span>
                <p className="font-display mt-1 text-2xl font-extrabold text-foreground">
                  {totalCredits !== "--" ? `${totalCredits} TC` : "--"}
                </p>
              </div>

              <div className="px-6 py-4">
                <span className="text-xs font-semibold text-muted-foreground">
                  GPA kỳ {latestSemCode || "gần nhất"}
                </span>
                <p className="font-display mt-1 text-2xl font-extrabold text-primary">
                  {latestSemGpa}
                </p>
              </div>

              <div className="px-6 py-4">
                <span className="text-xs font-semibold text-muted-foreground">
                  Tổng môn đã học
                </span>
                <p className="font-display mt-1 text-2xl font-extrabold text-foreground">
                  {courses.length ? `${courses.length} môn` : "--"}
                </p>
              </div>
            </div>
          </section>

          {/* 3. Filter Toolbar (LOV Semester + LOV Grade + Search) */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-5 py-3">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* LOV 1: Semester */}
              <div className="relative">
                <select
                  value={semesterLov}
                  onChange={(e) => setSemesterLov(e.target.value)}
                  aria-label="Chọn học kỳ"
                  className="h-9 appearance-none rounded-xl border bg-muted/40 pl-3 pr-8 text-sm font-semibold text-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary"
                >
                  <option value="ALL" className="bg-card text-foreground">
                    Tất cả học kỳ ({orderedSemesters.length})
                  </option>
                  {orderedSemesters.map((s) => (
                    <option
                      key={s.maNamHocHocKy}
                      value={s.maNamHocHocKy}
                      className="bg-card text-foreground"
                    >
                      [{s.maNamHocHocKy}] {s.namHocHocKyTen}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>

              {/* LOV 2: Letter Grade */}
              <div className="relative">
                <select
                  value={gradeLov}
                  onChange={(e) => setGradeLov(e.target.value)}
                  aria-label="Lọc điểm chữ"
                  className="h-9 appearance-none rounded-xl border bg-muted/40 pl-3 pr-8 text-sm font-semibold text-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary"
                >
                  <option value="ALL" className="bg-card text-foreground">
                    Tất cả điểm
                  </option>
                  <option value="A" className="bg-card text-foreground">
                    Điểm A / A+
                  </option>
                  <option value="B" className="bg-card text-foreground">
                    Điểm B / B+
                  </option>
                  <option value="C" className="bg-card text-foreground">
                    Điểm C / C+
                  </option>
                  <option value="D" className="bg-card text-foreground">
                    Điểm D / D+ / F / RT
                  </option>
                  <option value="EXEMPT" className="bg-card text-foreground">
                    Miễn / Đạt (MT / DT)
                  </option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>

            {/* Search & Force Revalidate */}
            <div className="flex items-center gap-2">
              <div className="relative flex items-center">
                <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm mã môn, tên môn..."
                  className="h-9 w-56 rounded-xl border bg-muted/40 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-primary focus:bg-card"
                />
              </div>

              <button
                type="button"
                onClick={() => runBackgroundRevalidate(true)}
                title="Đồng bộ trực tiếp từ myBK ngay"
                className="group flex h-9 w-9 items-center justify-center rounded-xl border bg-card text-foreground transition-colors hover:border-primary/40 hover:bg-muted"
              >
                <RefreshCw
                  className={`h-4 w-4 text-primary transition-transform duration-500 group-hover:rotate-180 ${
                    loading || bgSyncing ? "animate-spin" : ""
                  }`}
                />
              </button>
            </div>
          </div>

          {/* 4. Semesters & Courses List */}
          {!connected && semesters.length === 0 ? (
            <div className="flex h-72 flex-col items-center justify-center gap-3 rounded-2xl border bg-card p-6 text-center">
              <GraduationCap className="h-10 w-10 text-primary" />
              <p className="font-display text-base font-bold text-foreground">
                Chưa đồng bộ bảng điểm từ myBK
              </p>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <ShieldCheck className="h-4 w-4" />
                <span>Kết nối SSO HCMUT ngay</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredSemesters.map((sem) => {
                const semCourses = courses.filter((c) => {
                  const sameSem =
                    String(c.maHocKy) === String(sem.maNamHocHocKy) ||
                    Number(c.namHocHocKyId) === Number(sem.namHocHocKyId);
                  if (!sameSem) return false;
                  if (!matchGradeFilter(c.diemChu)) return false;
                  if (searchQuery.trim()) {
                    const q = searchQuery.toLowerCase();
                    return (
                      c.maMonHoc.toLowerCase().includes(q) ||
                      c.tenMonHoc.toLowerCase().includes(q)
                    );
                  }
                  return true;
                });

                if (
                  (gradeLov !== "ALL" || searchQuery.trim()) &&
                  semCourses.length === 0
                ) {
                  return null;
                }

                const isCollapsed = Boolean(
                  collapsedSemesters[sem.maNamHocHocKy]
                );

                return (
                  <section
                    key={sem.maNamHocHocKy}
                    className="overflow-hidden rounded-2xl border bg-card"
                  >
                    {/* Semester Header */}
                    <div
                      onClick={() => toggleSemester(sem.maNamHocHocKy)}
                      className="flex flex-wrap cursor-pointer items-center justify-between gap-3 border-b bg-muted/30 px-5 py-3.5 transition-colors hover:bg-muted/60"
                    >
                      <div className="flex items-center gap-3">
                        {isCollapsed ? (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="font-mono rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                          {sem.maNamHocHocKy}
                        </span>
                        <h3 className="font-display text-base font-bold text-foreground">
                          {sem.namHocHocKyTen}
                        </h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-lg border bg-card px-2.5 py-1 font-semibold">
                          GPA HK:{" "}
                          <strong className="text-primary">
                            {sem.diemTBTLHocKy}
                          </strong>
                        </span>
                        <span className="rounded-lg border bg-card px-2.5 py-1 font-semibold">
                          TC HK: <strong>{sem.soTCTLHocKy}</strong>
                        </span>
                        <span className="rounded-lg border bg-card px-2.5 py-1 font-semibold">
                          CPA TL:{" "}
                          <strong className="text-emerald-600 dark:text-emerald-400">
                            {sem.diemTBTLChung}
                          </strong>
                        </span>
                        <span className="rounded-lg border bg-card px-2.5 py-1 font-semibold">
                          TC TL: <strong>{sem.soTCTLChung}</strong>
                        </span>
                        {sem.capNhatCuoi && (
                          <span className="hidden xl:inline text-muted-foreground pl-1">
                            {sem.capNhatCuoi}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Semester Courses Table */}
                    {!isCollapsed && (
                      <div className="overflow-x-auto">
                        {semCourses.length === 0 ? (
                          <div className="p-6 text-center text-sm text-muted-foreground">
                            Chưa có điểm môn học trong học kỳ này
                          </div>
                        ) : (
                          <table className="w-full text-left text-sm">
                            <thead>
                              <tr className="border-b bg-muted/15 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                <th className="px-5 py-3">Mã môn</th>
                                <th className="px-4 py-3">Tên môn học</th>
                                <th className="px-4 py-3 text-center">Nhóm</th>
                                <th className="px-4 py-3 text-center">
                                  Tín chỉ
                                </th>
                                <th className="px-4 py-3 text-center">
                                  Điểm số
                                </th>
                                <th className="px-4 py-3 text-center">
                                  Điểm chữ
                                </th>
                                <th className="px-5 py-3 text-right">
                                  Ghi chú
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {semCourses.map((course) => (
                                <tr
                                  key={`${sem.maNamHocHocKy}-${course.monHocId}-${course.maMonHoc}`}
                                  onClick={() =>
                                    handleOpenCourseDetail(course, sem)
                                  }
                                  className="cursor-pointer transition-colors hover:bg-primary/5"
                                >
                                  <td className="px-5 py-3 font-mono text-xs font-bold text-primary">
                                    <div className="flex items-center gap-1.5">
                                      <span>{course.maMonHoc}</span>
                                      {course.isNewUpdate && (
                                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-sans text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                          Mới
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 font-semibold text-foreground">
                                    {course.tenMonHoc}
                                  </td>
                                  <td className="px-4 py-3 text-center font-mono text-xs text-muted-foreground">
                                    {course.nhomTo || "--"}
                                  </td>
                                  <td className="px-4 py-3 text-center font-semibold">
                                    {course.soTinChi}
                                  </td>
                                  <td className="px-4 py-3 text-center font-mono font-bold">
                                    {formatNumericScore(
                                      course.diemSo,
                                      course.diemChu
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <span
                                      className={`inline-block min-w-10 rounded-lg px-2 py-0.5 text-xs font-bold ${getLetterBadgeStyle(
                                        course.diemChu
                                      )}`}
                                    >
                                      {course.diemChu || "--"}
                                    </span>
                                  </td>
                                  <td className="px-5 py-3 text-right text-xs text-muted-foreground">
                                    {course.ghiChu ||
                                      (course.diemDat === "1" ? "Đạt" : "--")}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </section>
                );
              })}

              {/* 5. Điểm môn học khác & Chứng chỉ điều kiện */}
              {filteredOtherCourses.length > 0 && (
                <section className="overflow-hidden rounded-2xl border bg-card">
                  <div className="flex items-center justify-between border-b bg-muted/30 px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="h-4 w-4 text-teal-500" />
                      <h3 className="font-display text-base font-bold text-foreground">
                        Điểm môn học khác & Chứng chỉ điều kiện (
                        {filteredOtherCourses.length})
                      </h3>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b bg-muted/15 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          <th className="px-5 py-3">Học kỳ</th>
                          <th className="px-4 py-3">Mã môn / CC</th>
                          <th className="px-4 py-3">Tên môn học / Chứng chỉ</th>
                          <th className="px-4 py-3 text-center">Kết quả</th>
                          <th className="px-5 py-3 text-right">
                            Cập nhật cuối
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredOtherCourses.map((oth, idx) => (
                          <tr
                            key={`other-${oth.maHocKy}-${oth.maMonHoc}-${idx}`}
                            onClick={() => handleOpenOtherCourseDetail(oth)}
                            className="cursor-pointer transition-colors hover:bg-primary/5"
                          >
                            <td className="px-5 py-3 font-mono text-xs font-bold text-muted-foreground">
                              {oth.maHocKy}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs font-bold text-primary">
                              {oth.maMonHoc}
                            </td>
                            <td className="px-4 py-3 font-semibold text-foreground">
                              {oth.tenMonHoc && oth.tenMonHoc !== "--"
                                ? oth.tenMonHoc
                                : `Chứng chỉ / Điều kiện (${oth.maMonHoc})`}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="inline-block rounded-lg bg-teal-500/15 px-2.5 py-0.5 text-xs font-bold text-teal-600 dark:text-teal-400">
                                {oth.ghiChu || "Đạt"}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-right text-xs text-muted-foreground">
                              {oth.capNhatCuoi || "--"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </div>
          )}
        </>
      )}

      {/* Read-Only Course Detail & Component Scores Modal */}
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
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        connectedStudentId={studentId}
        lastSyncedAt={lastSyncedAt}
        onSuccess={loadTranscriptSWR}
      />
    </div>
  );
}
