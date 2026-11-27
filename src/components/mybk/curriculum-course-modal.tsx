"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, MapPin, User, X } from "lucide-react";
import { Modal, useRetained } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import type { ComponentScoreItem } from "@/components/mybk/course-detail-modal";
import type { NormalizedTimetableItem } from "@/lib/mybk-timetable";
import type { NormalizedExamItem } from "@/lib/mybk-exams";
import {
  DAY_FULL_LABELS,
  DAY_SHORT,
  formatCampus,
  formatDateVi,
  padTime,
} from "@/lib/format";
import {
  formatComponentScore,
  formatLetterDisplay,
  formatScore10,
  gradeTone,
  letterToGpa4,
} from "@/lib/grades";
import { cn } from "@/lib/utils";

export interface CurriculumModalCourseContext {
  subjectCode: string;
  subjectName: string;
  subjectNameEn?: string | null;
  credits: number;
  courseCredits?: number | null;
  // Khối kiến thức trong chương trình đào tạo
  blockName: string;
  blockSubLabel?: string;
  blockTypeLabel: string; // "Bắt buộc" | "Tự chọn" | "Ngoài CTĐT"
  blockEarnedCredits?: number;
  blockRequiredCredits?: number;
  isPassedInCurriculum: boolean;
  isEffectiveInCurriculum: boolean;
  countedAsFreeElective?: boolean;
  freeElectiveRef?: string | null;
  curriculumScore: number | null;
  curriculumLetter: string | null;
  curriculumNote?: string | null;
}

export interface TranscriptAttemptSummary {
  maMonHoc: string;
  tenMonHocEn?: string | null;
  soTinChiHocPhan?: number | null;
  maHocKy: string;
  namHocHocKyTen?: string;
  nhomTo: string | null;
  nhomThucHanh?: string | null;
  soTinChi: number;
  diemSo: number | null;
  diemChu: string | null;
  ghiChu: string | null;
  ngayCongBoDiem?: string | null;
  capNhatCuoi?: string | null;
  componentScores?: ComponentScoreItem[];
}

interface CurriculumCourseModalProps {
  open: boolean;
  onClose: () => void;
  context: CurriculumModalCourseContext | null;
  transcriptAttempts: TranscriptAttemptSummary[];
  currentTimetableSlots: NormalizedTimetableItem[];
  currentExams: NormalizedExamItem[];
}

type TabId = "overview" | "grades" | "term";

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <dt className="shrink-0 text-[13px] text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium text-foreground">
        {children}
      </dd>
    </div>
  );
}

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

const attemptKey = (a: TranscriptAttemptSummary, idx: number) =>
  `${a.maHocKy}-${idx}`;

export function CurriculumCourseModal({
  open,
  onClose,
  context: contextProp,
  transcriptAttempts,
  currentTimetableSlots,
  currentExams,
}: CurriculumCourseModalProps) {
  const context = useRetained(contextProp);
  const [tab, setTab] = useState<TabId>("overview");
  // Lần học đang xem; null = mặc định (lần gần nhất đã có điểm)
  const [pickedKey, setPickedKey] = useState<string | null>(null);

  // Mở môn khác thì quay về tab Tổng quan
  const subjectCode = context?.subjectCode ?? null;
  useEffect(() => {
    setTab("overview");
    setPickedKey(null);
  }, [subjectCode]);

  const attempts = useMemo(
    () =>
      [...transcriptAttempts].sort((a, b) => b.maHocKy.localeCompare(a.maHocKy)),
    [transcriptAttempts]
  );

  if (!context) return null;

  const primaryAttempt = attempts[0] ?? null;
  const effectiveScore =
    context.curriculumScore ?? primaryAttempt?.diemSo ?? null;
  const effectiveLetter =
    context.curriculumLetter ?? primaryAttempt?.diemChu ?? null;

  const hasGrades = context.isPassedInCurriculum || attempts.length > 0;
  const hasTerm = currentTimetableSlots.length > 0 || currentExams.length > 0;
  const isStudyingNow = currentTimetableSlots.length > 0;
  const isRetakingNow = isStudyingNow && context.isPassedInCurriculum;

  // Trạng thái chung của môn
  const status: { label: string; tone: "success" | "info" | "primary" | "neutral" } =
    context.isPassedInCurriculum
      ? isRetakingNow
        ? { label: "Đã tích lũy · Đang cải thiện", tone: "info" }
        : { label: "Đã tích lũy", tone: "success" }
      : isStudyingNow
      ? {
          label: `Đang học HK ${currentTimetableSlots[0].semesterYearCode}`,
          tone: "primary",
        }
      : { label: "Chưa đăng ký học", tone: "neutral" };

  const englishTitle =
    context.subjectNameEn || currentTimetableSlots[0]?.subjectNameEn || null;

  // Lần học đang xem trong tab Điểm số: mặc định là lần gần nhất đã có điểm
  const defaultAttempt =
    attempts.find((a) => Boolean(a.diemChu)) ?? attempts[0] ?? null;
  const pickedAttempt =
    (pickedKey &&
      attempts.find((a, i) => attemptKey(a, i) === pickedKey)) ||
    defaultAttempt;
  const activeKey = pickedAttempt
    ? attempts.findIndex((a) => a === pickedAttempt)
    : -1;
  // Không có lần học nào trong bảng điểm (vd được miễn): dùng kết quả ghi trong CTĐT
  const viewScore = pickedAttempt ? pickedAttempt.diemSo : effectiveScore;
  const viewLetter = pickedAttempt ? pickedAttempt.diemChu : effectiveLetter;
  const componentSource = pickedAttempt;
  const components = componentSource?.componentScores ?? [];
  const score10 = formatScore10(viewScore, viewLetter);
  const special = score10 === "--" && Boolean(viewLetter);

  const tabs: { value: TabId; label: string }[] = [
    { value: "overview", label: "Tổng quan" },
    ...(hasGrades ? [{ value: "grades" as TabId, label: "Điểm số" }] : []),
    ...(hasTerm ? [{ value: "term" as TabId, label: "Học kỳ này" }] : []),
  ];
  const activeTab = tabs.some((t) => t.value === tab) ? tab : "overview";

  const blockPct =
    context.blockRequiredCredits && context.blockRequiredCredits > 0
      ? Math.min(
          100,
          ((context.blockEarnedCredits ?? 0) / context.blockRequiredCredits) *
            100
        )
      : null;

  const updated =
    primaryAttempt?.ngayCongBoDiem || primaryAttempt?.capNhatCuoi || null;

  return (
    <Modal
      open={open && Boolean(contextProp)}
      onClose={onClose}
      panelClassName="max-w-2xl"
      label={context.subjectName}
    >
      {/* ===== Đầu modal: trạng thái · tên · mã, tín chỉ, loại ===== */}
      <div className="flex items-start justify-between gap-4 border-b px-6 pb-4 pt-5">
        <div className="min-w-0">
          <div className="mb-2">
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <h2 className="font-display text-xl font-bold leading-snug tracking-tight text-foreground">
            {context.subjectName}
          </h2>
          {englishTitle && englishTitle !== context.subjectName && (
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {englishTitle}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="primary">{context.subjectCode}</Badge>
            <Badge>
              {context.credits} TC
              {context.credits === 0 &&
                context.courseCredits &&
                context.courseCredits > 0 &&
                ` (${context.courseCredits} HP)`}
            </Badge>
            <Badge>{context.blockTypeLabel}</Badge>
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

      {/* ===== Các tab ===== */}
      {tabs.length > 1 && (
        <div className="border-b px-6 py-3">
          <SegmentedTabs value={activeTab} onChange={setTab} options={tabs} />
        </div>
      )}

      <div
        key={activeTab}
        className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5 animate-in fade-in duration-150"
      >
        {/* ================= TAB 1: TỔNG QUAN ================= */}
        {activeTab === "overview" && (
          <>
            <section className="rounded-xl border px-4 py-3.5">
              <p className="text-xs font-semibold text-muted-foreground">
                Khối kiến thức trong chương trình đào tạo
              </p>
              <p className="mt-1.5 font-display text-[15px] font-semibold text-foreground">
                {context.blockName}
                {context.blockSubLabel && (
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    — {context.blockSubLabel}
                  </span>
                )}
              </p>
              {blockPct !== null && (
                <div className="mt-3">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-success"
                      style={{ width: `${blockPct}%` }}
                    />
                  </div>
                  <p className="mt-1.5 font-mono text-xs text-muted-foreground">
                    Tiến độ khối: {context.blockEarnedCredits ?? 0} /{" "}
                    {context.blockRequiredCredits} TC
                  </p>
                </div>
              )}
            </section>

            <dl className="divide-y rounded-xl border">
              <InfoRow label="Phân loại">{context.blockTypeLabel}</InfoRow>
              <InfoRow label="Số tín chỉ theo CTĐT">
                <span className="font-mono">
                  {context.credits} TC
                  {context.credits === 0 &&
                    context.courseCredits &&
                    context.courseCredits > 0 &&
                    ` (${context.courseCredits} HP)`}
                </span>
              </InfoRow>
              <InfoRow label="Hiệu lực tích lũy">
                <span
                  className={cn(
                    context.isEffectiveInCurriculum ||
                      context.countedAsFreeElective
                      ? "text-success-fg"
                      : "text-muted-foreground"
                  )}
                >
                  {context.countedAsFreeElective
                    ? "Xét tự chọn tự do"
                    : context.isEffectiveInCurriculum
                    ? "Có tính tích lũy"
                    : context.isPassedInCurriculum
                    ? "Đạt điều kiện"
                    : "Chưa tích lũy"}
                </span>
              </InfoRow>
              {effectiveLetter && (
                <InfoRow label="Kết quả">
                  <span className="inline-flex items-center gap-2">
                    {formatScore10(effectiveScore, effectiveLetter) !== "--" && (
                      <span className="font-mono">
                        {formatScore10(effectiveScore, effectiveLetter)}
                      </span>
                    )}
                    <Badge tone={gradeTone(effectiveLetter)}>
                      {formatLetterDisplay(effectiveLetter, effectiveScore)}
                    </Badge>
                  </span>
                </InfoRow>
              )}
              {context.freeElectiveRef && (
                <InfoRow label="Mã xét tự chọn tự do">
                  <span className="font-mono">#{context.freeElectiveRef}</span>
                </InfoRow>
              )}
            </dl>

            {!hasGrades && !hasTerm && (
              <p className="rounded-xl border border-dashed px-4 py-3 text-[13px] text-muted-foreground">
                Môn học thuộc danh mục {context.blockTypeLabel.toLowerCase()} của
                khối {context.blockName}. Bạn chưa đăng ký học môn này.
              </p>
            )}

            {context.curriculumNote && (
              <p className="rounded-xl bg-muted/40 px-4 py-3 text-[13px] text-muted-foreground">
                Ghi chú: {context.curriculumNote}
              </p>
            )}
          </>
        )}

        {/* ================= TAB 2: ĐIỂM SỐ ================= */}
        {activeTab === "grades" && (
          <>
            {/* Chọn lần học (chỉ khi học từ 2 lần trở lên) */}
            {attempts.length > 1 && (
              <section>
                <h3 className="mb-2.5 text-[13px] font-semibold text-muted-foreground">
                  Xem điểm theo lần học
                </h3>
                <div className="flex flex-wrap gap-2">
                  {attempts.map((att, idx) => {
                    const key = attemptKey(att, idx);
                    const active = idx === activeKey;
                    const s10 = formatScore10(att.diemSo, att.diemChu);
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setPickedKey(key)}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[13px] transition-colors",
                          active
                            ? "border-primary bg-primary/10"
                            : "bg-muted/10 hover:border-primary/40 hover:bg-muted/30"
                        )}
                      >
                        <span className="font-semibold text-foreground">
                          HK {att.maHocKy}
                        </span>
                        {att.diemChu ? (
                          <>
                            {s10 !== "--" && (
                              <span className="font-mono text-foreground">
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

            {/* Kết quả của lần đang xem */}
            <section className="grid grid-cols-3 divide-x overflow-hidden rounded-xl border">
              <ResultCell label="Điểm hệ 10">
                <span className={cn(special && "text-muted-foreground/50")}>
                  {score10}
                </span>
              </ResultCell>
              <ResultCell label="Điểm chữ">
                {viewLetter ? (
                  <Badge
                    tone={gradeTone(viewLetter)}
                    className="px-3 py-1 text-xl"
                  >
                    {viewLetter.toUpperCase()}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground/50">--</span>
                )}
              </ResultCell>
              <ResultCell label="Quy đổi hệ 4.0">
                <span className="text-primary">{letterToGpa4(viewLetter)}</span>
              </ResultCell>
              {special && (
                <p className="col-span-3 border-t bg-muted/30 px-4 py-2 text-center text-xs text-muted-foreground">
                  Kết quả: {formatLetterDisplay(viewLetter, viewScore)}
                </p>
              )}
            </section>

            {/* Điểm thành phần */}
            <section>
              <h3 className="mb-2.5 flex items-baseline justify-between text-[13px] font-semibold text-muted-foreground">
                <span>
                  Điểm thành phần
                  {componentSource && (
                    <span className="ml-2 font-mono text-xs font-medium">
                      HK {componentSource.maHocKy}
                      {componentSource.nhomTo &&
                        ` · Nhóm ${componentSource.nhomTo}`}
                    </span>
                  )}
                </span>
                {components.length > 0 && (
                  <span className="font-mono text-xs font-medium">
                    {components.length} cột điểm
                  </span>
                )}
              </h3>
              {components.length === 0 ? (
                <p className="rounded-xl border border-dashed px-4 py-6 text-center text-[13px] text-muted-foreground">
                  Chưa có điểm thành phần cho lần học này.
                </p>
              ) : (
                <ul className="divide-y rounded-xl border">
                  {components.map((comp) => (
                    <li
                      key={comp.key}
                      className="flex items-center justify-between gap-4 px-4 py-3"
                    >
                      <p className="flex items-baseline gap-2 text-sm font-medium text-foreground">
                        {comp.label}
                        <span className="font-mono text-xs font-normal text-muted-foreground">
                          {comp.weight}%
                        </span>
                      </p>
                      <span className="font-mono text-lg font-semibold text-foreground">
                        {comp.score !== null
                          ? formatComponentScore(comp.score)
                          : comp.rawGrade || "--"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {/* ================= TAB 3: HỌC KỲ NÀY ================= */}
        {activeTab === "term" && (
          <>
            {currentTimetableSlots.length > 0 && (
              <section>
                <h3 className="mb-2.5 text-[13px] font-semibold text-muted-foreground">
                  Lịch học HK {currentTimetableSlots[0].semesterYearCode}
                </h3>
                <ul className="space-y-2">
                  {currentTimetableSlots.map((slot) => {
                    const scheduled = slot.dayOfWeek >= 2;
                    const room =
                      slot.roomCode && slot.roomCode !== "------"
                        ? slot.roomCode
                        : "";
                    return (
                      <li
                        key={slot.scheduleId}
                        className="rounded-xl border px-4 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-display text-sm font-semibold text-foreground">
                              {scheduled
                                ? DAY_FULL_LABELS[slot.dayOfWeek]
                                : "Đồ án / không xếp tiết cố định"}
                            </p>
                            {scheduled && (
                              <p className="mt-0.5 font-mono text-[13px] text-foreground">
                                {padTime(slot.startTime)} –{" "}
                                {padTime(slot.endTime)}
                              </p>
                            )}
                          </div>
                          {slot.classGroup && (
                            <Badge>Nhóm {slot.classGroup}</Badge>
                          )}
                        </div>
                        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5" />
                            <span
                              className={cn(
                                "font-mono",
                                room && "font-medium text-foreground"
                              )}
                            >
                              {room || "Chưa xếp phòng"}
                            </span>
                            {slot.campusNameVi && (
                              <span>· {formatCampus(slot.campusNameVi)}</span>
                            )}
                          </span>
                          {slot.employeeName && (
                            <span className="inline-flex items-center gap-1.5">
                              <User className="h-3.5 w-3.5" />
                              {slot.employeeName}
                            </span>
                          )}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {currentExams.length > 0 && (
              <section>
                <h3 className="mb-2.5 text-[13px] font-semibold text-muted-foreground">
                  Lịch thi trong học kỳ
                </h3>
                <ul className="space-y-2">
                  {currentExams.map((ex) => (
                    <li
                      key={ex.examId}
                      className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-foreground">
                          {ex.examType === "CK" ? "Cuối kỳ" : "Giữa kỳ"}
                          <span className="ml-2 font-mono font-medium text-muted-foreground">
                            {DAY_SHORT[ex.dayOfWeek]},{" "}
                            {formatDateVi(ex.examDate).full}
                          </span>
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                          {padTime(ex.startTime)}–{padTime(ex.endTime)} ·{" "}
                          {ex.durationMinutes} phút
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-[13px] font-medium text-foreground">
                        {ex.roomCode || "Chưa xếp phòng"}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>

      {/* ===== Chân modal ===== */}
      <div className="flex items-center gap-1.5 border-t bg-muted/20 px-6 py-3 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        {updated ? (
          <span>
            Cập nhật điểm: <span className="font-mono">{updated}</span>
          </span>
        ) : (
          <span>Dữ liệu đối chiếu từ chương trình đào tạo myBK</span>
        )}
      </div>
    </Modal>
  );
}
