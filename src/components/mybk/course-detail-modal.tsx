"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Clock, History, Layers, X } from "lucide-react";

export interface ComponentScoreItem {
  key: string;
  label: string;
  weight: number;
  score: number | null;
}

export interface CourseGradeDetailInput {
  sinhVienId: number;
  namHocHocKyId: number;
  maHocKy: string;
  namHocHocKyTen?: string;
  capNhatCuoi?: string | null;
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
  componentScores?: ComponentScoreItem[];
}

export interface OtherCourseRecord {
  maHocKy: string;
  maMonHoc: string;
  tenMonHoc: string;
  diemSo: string | null;
  diemdat: string | null;
  ghiChu: string | null;
  capNhatCuoi: string | null;
}

interface CourseDetailModalProps {
  course: CourseGradeDetailInput | null;
  allAttempts: CourseGradeDetailInput[];
  relatedOtherRecords: OtherCourseRecord[];
  onClose: () => void;
}

function convertLetterToGpa4(letter: string | null): string {
  const l = (letter || "").trim().toUpperCase();
  switch (l) {
    case "A+":
    case "A":
      return "4.0";
    case "B+":
      return "3.5";
    case "B":
      return "3.0";
    case "C+":
      return "2.5";
    case "C":
      return "2.0";
    case "D+":
      return "1.5";
    case "D":
      return "1.0";
    case "F":
      return "0.0";
    default:
      return "--";
  }
}

function formatScore10(
  diemSo: number | null,
  diemChu: string | null
): string {
  if (diemSo === null || diemSo === undefined) return "--";
  const l = (diemChu || "").trim().toUpperCase();
  if (l === "MT" || l === "DT" || l === "RT" || diemSo > 10) return "--";
  return diemSo.toFixed(1);
}

function formatLetterDisplay(
  diemChu: string | null,
  diemSo: number | null
): string {
  const l = (diemChu || "").trim().toUpperCase();
  if (l === "MT" || diemSo === 12) return "MT (Miễn)";
  if (l === "DT" || diemSo === 21) return "DT (Đạt)";
  if (l === "RT" || diemSo === 17) return "RT (Rút môn)";
  return l || "--";
}

function formatComponentScore(score: number | null): string {
  if (score === null || score === undefined) return "--";
  if (score === 13) return "Vắng thi";
  if (score === 12) return "Miễn";
  if (score === 21) return "Đạt";
  if (score > 10) return String(score);
  return Number.isInteger(score) ? score.toFixed(1) : String(score);
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

export function CourseDetailModal({
  course,
  allAttempts,
  onClose,
}: CourseDetailModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!course || !mounted) return null;

  const components = course.componentScores || [];

  const modalContent = (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-2xl"
      >
        {/* Clean Minimal Header: Course Name Only */}
        <div className="flex items-center justify-between gap-4 border-b px-6 py-4">
          <h2 className="font-display text-lg font-extrabold text-foreground">
            {course.tenMonHoc}
          </h2>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Unified Course Metadata & Grade Box */}
          <div className="overflow-hidden rounded-xl border bg-muted/20">
            {/* Top Row: Final Scores */}
            <div className="grid grid-cols-3 divide-x border-b">
              <div className="p-3.5 text-center">
                <span className="text-xs font-semibold text-muted-foreground">
                  Điểm hệ 10
                </span>
                <p className="font-display mt-1 text-xl font-extrabold text-foreground">
                  {formatScore10(course.diemSo, course.diemChu)}
                </p>
              </div>

              <div className="p-3.5 text-center">
                <span className="text-xs font-semibold text-muted-foreground">
                  Điểm chữ
                </span>
                <div className="mt-1">
                  <span
                    className={`inline-block rounded-lg px-2.5 py-0.5 text-sm font-extrabold ${getLetterBadgeStyle(
                      course.diemChu
                    )}`}
                  >
                    {formatLetterDisplay(course.diemChu, course.diemSo)}
                  </span>
                </div>
              </div>

              <div className="p-3.5 text-center">
                <span className="text-xs font-semibold text-muted-foreground">
                  Quy đổi hệ 4.0
                </span>
                <p className="font-display mt-1 text-xl font-extrabold text-primary">
                  {convertLetterToGpa4(course.diemChu)}
                </p>
              </div>
            </div>

            {/* Bottom Row: Synchronized Course Details (Mã môn, Học kỳ, Nhóm lớp, Tín chỉ) */}
            <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
              <div className="bg-card px-3.5 py-2.5">
                <span className="text-[11px] font-medium text-muted-foreground">
                  Mã môn
                </span>
                <p className="font-mono mt-0.5 text-xs font-bold text-primary">
                  {course.maMonHoc}
                </p>
              </div>

              <div className="bg-card px-3.5 py-2.5">
                <span className="text-[11px] font-medium text-muted-foreground">
                  Học kỳ
                </span>
                <p className="font-mono mt-0.5 text-xs font-bold text-foreground">
                  {course.maHocKy}
                </p>
              </div>

              <div className="bg-card px-3.5 py-2.5">
                <span className="text-[11px] font-medium text-muted-foreground">
                  Nhóm lớp
                </span>
                <p className="font-mono mt-0.5 text-xs font-bold text-foreground">
                  {course.nhomTo || "--"}
                </p>
              </div>

              <div className="bg-card px-3.5 py-2.5">
                <span className="text-[11px] font-medium text-muted-foreground">
                  Tín chỉ
                </span>
                <p className="mt-0.5 text-xs font-bold text-foreground">
                  {course.soTinChi} TC
                </p>
              </div>
            </div>
          </div>

          {/* Read-Only Component Scores Breakdown (No count badge, no redundant final score row at bottom) */}
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-3 text-sm font-bold">
              <Layers className="h-4 w-4 text-primary" />
              <span>Bảng điểm thành phần</span>
            </div>

            {components.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {course.ghiChu
                  ? `Ghi chú: ${course.ghiChu}`
                  : "Môn học này không chia cột điểm thành phần"}
              </div>
            ) : (
              <div className="divide-y">
                {components.map((comp) => (
                  <div
                    key={comp.key}
                    className="flex items-center justify-between gap-4 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-foreground">
                          {comp.label}
                        </span>
                        <span className="font-mono text-xs font-semibold text-muted-foreground">
                          {comp.weight}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary/70"
                          style={{ width: `${Math.min(100, comp.weight)}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex h-9 min-w-[4.5rem] shrink-0 items-center justify-center rounded-xl border bg-muted/30 px-3 font-mono text-sm font-extrabold text-foreground whitespace-nowrap">
                      {formatComponentScore(comp.score)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Course Attempt History if studied across multiple semesters */}
          {allAttempts.length > 1 && (
            <div className="overflow-hidden rounded-xl border bg-card">
              <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <History className="h-3.5 w-3.5 text-primary" />
                <span>Lịch sử các học kỳ của môn này</span>
              </div>
              <div className="divide-y text-xs">
                {allAttempts.map((att) => (
                  <div
                    key={`att-${att.maHocKy}-${att.monHocId}`}
                    className="flex items-center justify-between px-4 py-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono rounded bg-muted px-2 py-0.5 font-bold">
                        HK {att.maHocKy}
                      </span>
                      {att.nhomTo && (
                        <span className="text-muted-foreground">
                          Nhóm {att.nhomTo}
                        </span>
                      )}
                      {att.ghiChu && (
                        <span className="text-muted-foreground">
                          • {att.ghiChu}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {formatScore10(att.diemSo, att.diemChu) !== "--" && (
                        <span className="font-mono font-bold">
                          {formatScore10(att.diemSo, att.diemChu)}
                        </span>
                      )}
                      <span
                        className={`rounded px-2 py-0.5 font-bold ${getLetterBadgeStyle(
                          att.diemChu
                        )}`}
                      >
                        {formatLetterDisplay(att.diemChu, att.diemSo)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Non-sticky Bottom Meta Line (Flows naturally at the bottom of the content) */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <span>Cập nhật cuối: {course.capNhatCuoi || "--"}</span>
            </div>
            {course.ghiChu && (
              <span className="font-medium text-foreground">
                Ghi chú: {course.ghiChu}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
