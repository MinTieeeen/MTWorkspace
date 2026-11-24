"use client";

import { useEffect, useState } from "react";
import {
  Award,
  BookOpen,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Layers,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { MyBkConnectModal } from "@/components/mybk/mybk-connect-modal";

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
  if (l === "D+" || l === "D" || l === "F") {
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
  if (l === "MT") return "Miễn";
  if (l === "DT") return "Đạt";
  if (diemSo > 10) return "--";
  return diemSo.toFixed(1);
}

export default function AcademicResultsPage() {
  const [activeTab, setActiveTab] = useState<"transcript" | "progress">(
    "transcript"
  );
  const [connected, setConnected] = useState(false);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [semesters, setSemesters] = useState<SemesterRecord[]>([]);
  const [courses, setCourses] = useState<CourseGradeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // Filters
  const [semesterLov, setSemesterLov] = useState("ALL");
  const [gradeLov, setGradeLov] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedSemesters, setCollapsedSemesters] = useState<
    Record<string, boolean>
  >({});

  const loadTranscript = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mybk/transcript", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setConnected(Boolean(data.connected));
      setStudentId(data.studentId || null);
      setLastSyncedAt(data.lastSyncedAt || null);
      setSemesters(data.semesters || []);
      setCourses(data.courses || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTranscript();
    const onUpdate = () => loadTranscript();
    window.addEventListener("mt-mybk-updated", onUpdate);
    return () => window.removeEventListener("mt-mybk-updated", onUpdate);
  }, []);

  // Compute summary metrics from the latest non-zero semester
  const regularSemesters = semesters.filter(
    (s) => s.maNamHocHocKy !== "BL" && Number(s.soTCTLChung) > 0
  );
  const latestCumulative = regularSemesters[0] || semesters[0];
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
    if (gradeLov === "D") return l === "D+" || l === "D" || l === "F";
    if (gradeLov === "EXEMPT") return l === "MT" || l === "DT";
    return true;
  };

  const filteredSemesters = semesters.filter((sem) =>
    semesterLov === "ALL" ? true : sem.maNamHocHocKy === semesterLov
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Top Bar: 2 Tabs (Bảng điểm học kỳ & Tiến độ học tập) + SSO Connection Status */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-5 py-3.5">
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

        <div className="flex items-center gap-2.5">
          {connected && studentId && (
            <span className="rounded-xl border bg-muted/50 px-3 py-1.5 text-xs font-bold text-foreground">
              MSSV: {studentId}
            </span>
          )}
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="group inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <ShieldCheck className="h-4 w-4 icon-anim-wiggle" />
            <span>{connected ? "Đồng bộ SSO myBK" : "Kết nối SSO myBK"}</span>
          </button>
        </div>
      </div>

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
          {/* 4 Summary Metric Cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="group rounded-2xl border bg-card p-5 transition-colors hover:border-emerald-500/50">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-muted-foreground">
                  CPA tích lũy
                </span>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <GraduationCap className="h-5 w-5 icon-anim-wiggle" />
                </div>
              </div>
              <p className="font-display mt-3 text-3xl font-extrabold tracking-tight">
                {cpa}
              </p>
            </div>

            <div className="group rounded-2xl border bg-card p-5 transition-colors hover:border-sky-500/50">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-muted-foreground">
                  Tín chỉ tích lũy
                </span>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                  <Layers className="h-5 w-5 icon-anim-slide" />
                </div>
              </div>
              <p className="font-display mt-3 text-3xl font-extrabold tracking-tight">
                {totalCredits}
              </p>
            </div>

            <div className="group rounded-2xl border bg-card p-5 transition-colors hover:border-teal-500/50">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-muted-foreground">
                  GPA kỳ {latestSemCode || "gần nhất"}
                </span>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
                  <Award className="h-5 w-5 icon-anim-tick" />
                </div>
              </div>
              <p className="font-display mt-3 text-3xl font-extrabold tracking-tight">
                {latestSemGpa}
              </p>
            </div>

            <div className="group rounded-2xl border bg-card p-5 transition-colors hover:border-amber-500/50">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-muted-foreground">
                  Tổng môn học
                </span>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <BookOpen className="h-5 w-5 icon-anim-wiggle" />
                </div>
              </div>
              <p className="font-display mt-3 text-3xl font-extrabold tracking-tight">
                {courses.length || "--"}
              </p>
            </div>
          </div>

          {/* Filter Toolbar (LOV Semester + LOV Grade + Search) */}
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
                    Tất cả học kỳ ({semesters.length})
                  </option>
                  {semesters.map((s) => (
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
                    Điểm D / D+ / F
                  </option>
                  <option value="EXEMPT" className="bg-card text-foreground">
                    Miễn / Đạt (MT / DT)
                  </option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>

            {/* Search & Refresh */}
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
                onClick={loadTranscript}
                title="Làm mới"
                className="group flex h-9 w-9 items-center justify-center rounded-xl border bg-card text-foreground transition-colors hover:border-primary/40 hover:bg-muted"
              >
                <RefreshCw
                  className={`h-4 w-4 text-primary transition-transform duration-500 group-hover:rotate-180 ${
                    loading ? "animate-spin" : ""
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Semesters & Courses List */}
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
                                  className="transition-colors hover:bg-muted/40"
                                >
                                  <td className="px-5 py-3 font-mono text-xs font-bold text-primary">
                                    {course.maMonHoc}
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
            </div>
          )}
        </>
      )}

      <MyBkConnectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        connectedStudentId={studentId}
        lastSyncedAt={lastSyncedAt}
        onSuccess={loadTranscript}
      />
    </div>
  );
}
