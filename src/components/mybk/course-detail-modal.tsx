"use client";

import { useEffect, useState } from "react";
import { Clock, X } from "lucide-react";
import { Modal, useRetained } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import {
  formatComponentScore,
  formatLetterDisplay,
  formatScore10,
  gradeTone,
  letterToGpa4,
} from "@/lib/grades";
import { cn } from "@/lib/utils";

export interface ComponentScoreItem {
  key: string;
  codeEn?: string;
  label: string;
  weight: number;
  score: number | null;
  rawGrade?: string | null;
  lastUpdatedAt?: string | null;
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

const attemptKey = (c: { maHocKy: string; monHocId: number }) =>
  `${c.maHocKy}-${c.monHocId}`;

/** Một ô chỉ số trong thẻ kết quả: nhãn nhỏ trên, giá trị lớn dưới */
function ResultCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-4 py-4 text-center">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-2 flex min-h-9 items-center justify-center font-display text-3xl font-bold leading-none text-foreground">
        {children}
      </div>
    </div>
  );
}

export function CourseDetailModal({
  course: courseProp,
  allAttempts,
  onClose,
}: CourseDetailModalProps) {
  const base = useRetained(courseProp);
  // Lần học đang xem: mặc định là môn được bấm, người dùng có thể chọn lần học khác
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const baseKey = base ? attemptKey(base) : null;
  useEffect(() => setPickedKey(null), [baseKey]);

  if (!base) return null;
  const course =
    (pickedKey && allAttempts.find((a) => attemptKey(a) === pickedKey)) || base;
  const attempts = [...allAttempts].sort((a, b) =>
    b.maHocKy.localeCompare(a.maHocKy)
  );

  const components = course.componentScores || [];
  const score10 = formatScore10(course.diemSo, course.diemChu);
  const special = score10 === "--" && Boolean(course.diemChu);
  const groupLabel = course.nhomTo
    ? course.nhomThucHanh
      ? `${course.nhomTo} (Tổ ${course.nhomThucHanh})`
      : course.nhomTo
    : null;
  const updated = course.ngayCongBoDiem || course.capNhatCuoi;

  return (
    <Modal
      open={Boolean(courseProp)}
      onClose={onClose}
      panelClassName="max-w-xl"
      label={course.tenMonHoc}
    >
      {/* ===== 1. Nhận diện môn: tên, tên EN, mã · tín chỉ · nhóm · học kỳ ===== */}
      <div className="flex items-start justify-between gap-4 border-b px-6 py-5">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold leading-snug tracking-tight text-foreground">
            {course.tenMonHoc}
          </h2>
          {course.tenMonHocEn && course.tenMonHocEn !== course.tenMonHoc && (
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {course.tenMonHocEn}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="primary">{course.maMonHoc}</Badge>
            <Badge>
              {course.soTinChi} TC
              {course.soTinChi === 0 &&
                course.soTinChiHocPhan &&
                course.soTinChiHocPhan > 0 &&
                ` (${course.soTinChiHocPhan} HP)`}
            </Badge>
            {groupLabel && <Badge>Nhóm {groupLabel}</Badge>}
            <Badge>HK {course.maHocKy}</Badge>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
        {/* ===== Chọn lần học (chỉ khi học nhiều lần) ===== */}
        {attempts.length > 1 && (
          <section>
            <h3 className="mb-2.5 text-[13px] font-semibold text-muted-foreground">
              Các lần học môn này
            </h3>
            <div className="flex flex-wrap gap-2">
              {attempts.map((att) => {
                const active = attemptKey(att) === attemptKey(course);
                const s10 = formatScore10(att.diemSo, att.diemChu);
                return (
                  <button
                    key={attemptKey(att)}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPickedKey(attemptKey(att))}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors",
                      active
                        ? "border-primary bg-primary/10"
                        : "bg-muted/10 hover:border-primary/40 hover:bg-muted/30"
                    )}
                  >
                    <span className="text-[13px] font-semibold text-foreground">
                      HK {att.maHocKy}
                    </span>
                    {att.diemChu ? (
                      <>
                        {s10 !== "--" && (
                          <span className="font-mono text-[13px] text-foreground">
                            {s10}
                          </span>
                        )}
                        <Badge tone={gradeTone(att.diemChu)}>
                          {(att.diemChu || "").toUpperCase()}
                        </Badge>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Chưa có điểm
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ===== 2. Kết quả cuối cùng ===== */}
        <section className="grid grid-cols-3 divide-x overflow-hidden rounded-xl border">
          <ResultCell label="Điểm hệ 10">
            <span className={cn(special && "text-muted-foreground/50")}>
              {score10}
            </span>
          </ResultCell>
          <ResultCell label="Điểm chữ">
            {course.diemChu ? (
              <Badge
                tone={gradeTone(course.diemChu)}
                className="px-3 py-1 text-xl"
              >
                {(course.diemChu || "").toUpperCase()}
              </Badge>
            ) : (
              <span className="text-muted-foreground/50">--</span>
            )}
          </ResultCell>
          <ResultCell label="Quy đổi hệ 4.0">
            <span className="text-primary">{letterToGpa4(course.diemChu)}</span>
          </ResultCell>
          {special && (
            <p className="col-span-3 border-t bg-muted/30 px-4 py-2 text-center text-xs text-muted-foreground">
              Kết quả: {formatLetterDisplay(course.diemChu, course.diemSo)}
            </p>
          )}
        </section>

        {/* ===== 3. Điểm thành phần ===== */}
        <section>
          <h3 className="mb-2.5 flex items-baseline justify-between text-[13px] font-semibold text-muted-foreground">
            <span>Điểm thành phần</span>
            {components.length > 0 && (
              <span className="font-mono text-xs font-medium">
                {components.length} cột điểm
              </span>
            )}
          </h3>

          {components.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-6 text-center text-[13px] text-muted-foreground">
              {course.ghiChu
                ? `Ghi chú: ${course.ghiChu}`
                : "Môn học này không chia cột điểm thành phần."}
            </p>
          ) : (
            <ul className="divide-y rounded-xl border">
              {components.map((comp) => {
                return (
                  <li
                    key={comp.key}
                    className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="flex items-baseline gap-2 text-sm font-medium text-foreground">
                        {comp.label}
                        <span className="font-mono text-xs font-normal text-muted-foreground">
                          {comp.weight}%
                        </span>
                      </p>
                    </div>
                    <span className="min-w-14 text-right font-mono text-lg font-semibold text-foreground">
                      {comp.score !== null
                        ? formatComponentScore(comp.score)
                        : comp.rawGrade || "--"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* ===== Chân modal: thời điểm cập nhật · ghi chú ===== */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/20 px-6 py-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          Cập nhật: <span className="font-mono">{updated || "--"}</span>
        </span>
        {course.ghiChu && components.length > 0 && (
          <span className="font-medium text-foreground">
            Ghi chú: {course.ghiChu}
          </span>
        )}
      </div>
    </Modal>
  );
}
