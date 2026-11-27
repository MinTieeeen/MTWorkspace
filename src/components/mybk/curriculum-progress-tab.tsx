"use client";

import { useMemo, useState } from "react";
import {
  Award,
  ChevronDown,
  FolderCheck,
  GraduationCap,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapse } from "@/components/ui/collapse";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ConnectPrompt,
  EmptyState,
  ErrorState,
  StaleBanner,
} from "@/components/ui/state";
import { toast } from "@/components/ui/toast";
import {
  CurriculumCourseModal,
  CurriculumModalCourseContext,
  TranscriptAttemptSummary,
} from "@/components/mybk/curriculum-course-modal";
import { normalizeSearch } from "@/lib/format";
import { gradeTone } from "@/lib/grades";
import { useMybkResource, type ResourcePayload } from "@/lib/use-mybk-resource";
import type {
  CurriculumProgressPayload,
  NormalizedCurriculumBlock,
  NormalizedCurriculumCourse,
  NormalizedOutsideCourse,
} from "@/lib/mybk-curriculum";
import type { NormalizedTimetableItem } from "@/lib/mybk-timetable";
import type { NormalizedExamItem } from "@/lib/mybk-exams";

interface CurriculumProgressTabProps {
  transcriptCourses: TranscriptAttemptSummary[];
  /** Mở modal kết nối myBK (do trang cha quản lý) */
  onConnect?: () => void;
}

type BlockFilter = "ALL" | "INCOMPLETE" | "COMPLETED";
type TimetablePayload = ResourcePayload & { items?: NormalizedTimetableItem[] };
type ExamsPayload = ResourcePayload & { items?: NormalizedExamItem[] };

const MAX_PENDING_PREVIEW = 3;

function formatScoreDisplay(
  score: number | null,
  letter: string | null
): string {
  if (score === null || score === undefined) return "--";
  const l = (letter || "").trim().toUpperCase();
  if (l === "MT" || score === 12) return "Miễn";
  if (l === "DT" || score === 21) return "Đạt";
  if (l === "RT" || score === 17) return "Rút";
  if (score > 10) return "--";
  return Number.isInteger(score) ? score.toFixed(1) : String(score);
}

/** "92/128" -> { current: 92, total: 128 }; không hợp lệ thì null (không đoán số) */
function parseRatio(raw: string | undefined | null) {
  if (!raw || !raw.includes("/")) return null;
  const [a, b] = raw.split("/");
  const current = Number(a);
  const total = Number(b);
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) {
    return null;
  }
  return { current, total };
}

/** Điểm số + điểm chữ trong cùng một ô */
function ScoreCell({
  score,
  letter,
}: {
  score: number | null;
  letter: string | null;
}) {
  const text = formatScoreDisplay(score, letter);
  const special = text === "Miễn" || text === "Đạt" || text === "Rút";
  if (!letter && text === "--") {
    return <span className="text-muted-foreground">--</span>;
  }
  if (special) {
    return <Badge tone={gradeTone(letter)}>{text}</Badge>;
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className="min-w-8 font-mono text-sm font-semibold text-foreground">
        {text}
      </span>
      {letter && <Badge tone={gradeTone(letter)}>{letter}</Badge>}
    </span>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="px-6 py-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl font-bold leading-none text-foreground">
        {value}
      </p>
      {sub && (
        <p className="mt-1.5 font-mono text-xs text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}

function ProgressSkeleton() {
  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-2xl border bg-card p-6">
        <Skeleton className="h-6 w-64 rounded-lg" />
        <Skeleton className="h-9 w-40 rounded-lg" />
        <Skeleton className="h-3 w-full rounded-full" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export function CurriculumProgressTab({
  transcriptCourses,
  onConnect,
}: CurriculumProgressTabProps) {
  const cur = useMybkResource<CurriculumProgressPayload>({
    url: "/api/mybk/curriculum",
    isEmpty: (d) => !d.blocks || d.blocks.length === 0,
  });
  // Lịch học và lịch thi chỉ để bổ sung ngữ cảnh cho modal môn học: đọc dữ liệu đã lưu, dùng chung cache
  const tkb = useMybkResource<TimetablePayload>({
    url: "/api/mybk/timetable",
    revalidate: false,
  });
  const exm = useMybkResource<ExamsPayload>({
    url: "/api/mybk/exams",
    revalidate: false,
  });
  const data = cur.data;
  const timetableItems = useMemo(() => tkb.data?.items ?? [], [tkb.data]);
  const examItems = useMemo(() => exm.data?.items ?? [], [exm.data]);

  const [blockFilter, setBlockFilter] = useState<BlockFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [toggled, setToggled] = useState<Record<number, boolean>>({});
  const [showCatalog, setShowCatalog] = useState<Record<number, boolean>>({});
  const [outsideOpen, setOutsideOpen] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCourseCtx, setActiveCourseCtx] =
    useState<CurriculumModalCourseContext | null>(null);

  const blocks = useMemo(() => data?.blocks ?? [], [data]);
  const incompleteBlocks = useMemo(
    () => blocks.filter((b) => !b.isBlockCompleted),
    [blocks]
  );
  const completedCount = blocks.length - incompleteBlocks.length;

  const query = normalizeSearch(searchQuery.trim());
  const searching = query !== "";

  const filteredBlocks = useMemo(() => {
    return blocks.filter((blk) => {
      if (blockFilter === "INCOMPLETE" && blk.isBlockCompleted) return false;
      if (blockFilter === "COMPLETED" && !blk.isBlockCompleted) return false;
      if (!searching) return true;
      const inTitle = normalizeSearch(
        `${blk.blockName} ${blk.subLabel ?? ""}`
      ).includes(query);
      const inCourses = blk.courses.some((c) =>
        normalizeSearch(`${c.subjectCode} ${c.subjectName}`).includes(query)
      );
      return inTitle || inCourses;
    });
  }, [blocks, blockFilter, query, searching]);

  const openForBlockCourse = (
    course: NormalizedCurriculumCourse,
    block: NormalizedCurriculumBlock
  ) => {
    const matched = transcriptCourses.find(
      (tc) => tc.maMonHoc.toUpperCase() === course.subjectCode.toUpperCase()
    );
    setActiveCourseCtx({
      subjectCode: course.subjectCode,
      subjectName: course.subjectName,
      subjectNameEn: matched?.tenMonHocEn,
      credits: course.credits,
      courseCredits: matched?.soTinChiHocPhan,
      blockName: block.blockName,
      blockSubLabel: block.subLabel,
      blockTypeLabel: block.blockTypeLabel,
      blockEarnedCredits: block.earnedCredits,
      blockRequiredCredits: block.requiredCredits,
      isPassedInCurriculum: course.isPassed,
      isEffectiveInCurriculum: course.isEffective,
      countedAsFreeElective: Boolean(course.freeElectiveRef),
      freeElectiveRef: course.freeElectiveRef,
      curriculumScore: course.numericScore,
      curriculumLetter: course.letterGrade,
      curriculumNote: course.note,
    });
  };

  const openForOutside = (out: NormalizedOutsideCourse) => {
    const matched = transcriptCourses.find(
      (tc) => tc.maMonHoc.toUpperCase() === out.maMonHoc.toUpperCase()
    );
    setActiveCourseCtx({
      subjectCode: out.maMonHoc,
      subjectName: out.tenMonHoc,
      subjectNameEn: matched?.tenMonHocEn,
      credits: out.soTinChi,
      courseCredits: matched?.soTinChiHocPhan,
      blockName: out.countedAsFreeElective
        ? "Tự chọn tự do (xét từ môn ngoài CTĐT)"
        : "Môn học ngoài Chương trình đào tạo",
      blockTypeLabel: out.countedAsFreeElective ? "Tự chọn" : "Ngoài CTĐT",
      isPassedInCurriculum: true,
      isEffectiveInCurriculum: out.countedAsFreeElective,
      countedAsFreeElective: out.countedAsFreeElective,
      curriculumScore: out.diemSo,
      curriculumLetter: out.diemChu,
      curriculumNote: out.ghiChu,
    });
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const ok = await cur.refresh(true);
      if (ok) toast.success("Đã cập nhật Tiến độ học tập");
      else toast.error("Không thể làm mới Tiến độ học tập");
    } finally {
      setRefreshing(false);
    }
  };

  // ===== Các trạng thái thay cho nội dung =====
  if (!data && cur.status === "loading") return <ProgressSkeleton />;

  if (cur.status === "error") {
    return (
      <ErrorState
        title="Không tải được tiến độ học tập"
        message={cur.error ?? undefined}
        onRetry={cur.retry}
      />
    );
  }

  if (cur.status === "not-connected" || cur.status === "sso-expired") {
    const expired = cur.status === "sso-expired";
    return (
      <ConnectPrompt
        expired={expired}
        title={expired ? "Phiên đăng nhập myBK đã hết hạn" : "Chưa kết nối myBK"}
        description={
          expired
            ? "Đăng nhập lại để cập nhật chương trình đào tạo."
            : "Kết nối tài khoản để xem tiến độ theo chương trình đào tạo."
        }
        actionLabel={expired ? "Đăng nhập lại" : "Kết nối myBK"}
        onConnect={() => onConnect?.()}
      />
    );
  }

  if (blocks.length === 0) {
    return (
      <EmptyState
        icon={<GraduationCap />}
        title="Chưa có dữ liệu chương trình đào tạo"
        description="Hãy làm mới để đồng bộ từ myBK."
        action={
          <Button
            variant="secondary"
            size="sm"
            loading={refreshing}
            onClick={handleRefresh}
          >
            Làm mới
          </Button>
        }
      />
    );
  }

  // ===== Số liệu tổng quan (không dùng số giả khi thiếu dữ liệu) =====
  const ov = data?.overview;
  const ratio = parseRatio(ov?.sotctl);
  const earned = ratio?.current ?? 0;
  const total = ratio?.total ?? 0;
  const inProgress = data?.inProgressNewCredits ?? 0;
  const projected = total ? Math.min(total, earned + inProgress) : 0;
  const remaining = total ? Math.max(0, total - projected) : 0;
  const earnedPct = total ? Math.min(100, (earned / total) * 100) : 0;
  const inProgressPct = total
    ? Math.min(100 - earnedPct, (inProgress / total) * 100)
    : 0;
  const cpa4 = ov?.tbtlhe4?.split("/")[0]?.trim() || "--";
  const cpa10 = ov?.tbtlhe10?.split("/")[0]?.trim() || null;
  const registeredCount =
    (data?.inProgressCourseCodes.length ?? 0) +
    (data?.retakeCourseCodes.length ?? 0);

  const isOpen = (blk: NormalizedCurriculumBlock) =>
    searching ? true : toggled[blk.blockId] ?? true;
  const toggleBlock = (blk: NormalizedCurriculumBlock) =>
    setToggled((prev) => ({ ...prev, [blk.blockId]: !isOpen(blk) }));

  return (
    <div className="space-y-4">
      {cur.isStale && (
        <StaleBanner
          lastSyncedAt={cur.lastSyncedAt}
          message="Chưa cập nhật được chương trình đào tạo từ myBK, đang hiển thị dữ liệu đã lưu"
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />
      )}

      {/* ===== 1. Tổng quan: CTĐT + thanh tiến độ + 3 chỉ số ===== */}
      <section className="overflow-hidden rounded-2xl border bg-card">
        <div className="border-b bg-muted/20 px-6 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
              {ov?.tenctdt || "Chương trình đào tạo"}
            </h2>
            {ov?.mactdt && <Badge tone="primary">{ov.mactdt}</Badge>}
          </div>
          {(ov?.tenkhoa || ov?.capnhatcuoi) && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {ov?.tenkhoa}
              {ov?.tenkhoa && ov?.capnhatcuoi && " · "}
              {ov?.capnhatcuoi && (
                <span className="font-mono">CTĐT cập nhật {ov.capnhatcuoi}</span>
              )}
            </p>
          )}
        </div>

        {/* Tín chỉ tích lũy */}
        <div className="space-y-3 px-6 py-5">
          {total > 0 ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-display text-3xl font-bold leading-none text-foreground">
                  {earned}
                  <span className="ml-1.5 text-base font-medium text-muted-foreground">
                    / {total} tín chỉ
                  </span>
                </p>
                <span className="font-mono text-sm font-semibold text-success-fg">
                  {earnedPct.toFixed(1)}%
                </span>
              </div>

              <div
                role="progressbar"
                aria-valuenow={earned}
                aria-valuemin={0}
                aria-valuemax={total}
                className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full bg-success transition-all duration-500"
                  style={{ width: `${earnedPct}%` }}
                />
                {inProgressPct > 0 && (
                  <div
                    className="h-full bg-primary/70 transition-all duration-500"
                    style={{ width: `${inProgressPct}%` }}
                  />
                )}
              </div>

              <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-success" />
                  Đã đạt{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {earned}
                  </span>
                </span>
                {inProgress > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-primary/70" />
                    Đang học HK {data?.currentSemesterCode}{" "}
                    <span className="font-mono font-semibold text-foreground">
                      +{inProgress}
                    </span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-muted" />
                  Còn thiếu{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {remaining}
                  </span>
                </span>
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Chưa có số liệu tổng tín chỉ của chương trình.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 divide-y border-t sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Stat
            label="CPA theo CTĐT"
            value={<span className="text-success-fg">{cpa4}</span>}
            sub={cpa10 ? `${cpa10} / 10` : undefined}
          />
          <Stat
            label="Khối kiến thức hoàn tất"
            value={
              <>
                {completedCount}
                <span className="ml-1 text-sm font-medium text-muted-foreground">
                  / {blocks.length}
                </span>
              </>
            }
          />
          <Stat
            label={`Đang đăng ký HK ${data?.currentSemesterCode ?? ""}`.trim()}
            value={
              <>
                {registeredCount}
                <span className="ml-1 text-sm font-medium text-muted-foreground">
                  môn
                </span>
              </>
            }
          />
        </div>
      </section>

      {/* ===== 2. Hạng mục còn cần hoàn thành ===== */}
      {incompleteBlocks.length > 0 && (
        <section>
          <h3 className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-muted-foreground">
            <Award className="h-4 w-4 text-warning-fg" />
            Cần hoàn thành để tốt nghiệp
            <span className="font-mono font-medium">
              ({incompleteBlocks.length} khối)
            </span>
          </h3>
          <div className="mt-stagger grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {incompleteBlocks.map((blk) => {
              const missing = Math.max(
                0,
                blk.requiredCredits - blk.earnedCredits
              );
              const pending = blk.courses.filter((c) => !c.isPassed);
              const pct =
                blk.requiredCredits > 0
                  ? Math.min(100, (blk.earnedCredits / blk.requiredCredits) * 100)
                  : 0;
              return (
                <div
                  key={`rem-${blk.blockId}`}
                  className="flex flex-col rounded-2xl border bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-display text-sm font-semibold leading-snug text-foreground">
                      {blk.blockName}
                    </h4>
                    <Badge tone="warning" className="shrink-0">
                      {blk.requiredCredits > 0
                        ? `Thiếu ${missing} TC`
                        : "Còn điều kiện"}
                    </Badge>
                  </div>

                  {blk.requiredCredits > 0 && (
                    <div className="mt-3">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-warning"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="mt-1.5 font-mono text-xs text-muted-foreground">
                        {blk.earnedCredits} / {blk.requiredCredits} TC
                      </p>
                    </div>
                  )}

                  <div className="mt-3 space-y-1.5">
                    {pending.length > 0 ? (
                      <>
                        {pending.slice(0, MAX_PENDING_PREVIEW).map((c) => (
                          <button
                            key={c.uniqueKey}
                            type="button"
                            onClick={() => openForBlockCourse(c, blk)}
                            className="flex w-full items-center justify-between gap-2 rounded-lg border bg-muted/15 px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-medium text-foreground">
                                {c.subjectName}
                              </span>
                              <span className="block font-mono text-xs text-muted-foreground">
                                {c.subjectCode}
                              </span>
                            </span>
                            {c.inCurrentTimetable ? (
                              <Badge tone="primary">Đang học</Badge>
                            ) : (
                              <Badge>
                                {c.credits > 0 ? `${c.credits} TC` : "Chưa đạt"}
                              </Badge>
                            )}
                          </button>
                        ))}
                        {pending.length > MAX_PENDING_PREVIEW && (
                          <p className="px-1 text-xs text-muted-foreground">
                            và {pending.length - MAX_PENDING_PREVIEW} môn khác
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
                        Cần tích lũy thêm{" "}
                        <strong className="text-foreground">{missing} TC</strong>{" "}
                        tự chọn tự do (hoặc chuyển từ TC chuyên ngành dư).
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ===== 3. Lọc và tìm kiếm ===== */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3">
        <div
          role="radiogroup"
          aria-label="Lọc khối kiến thức"
          className="inline-flex items-center gap-1 rounded-xl bg-muted/60 p-1"
        >
          {(
            [
              ["ALL", "Tất cả", blocks.length],
              ["INCOMPLETE", "Chưa hoàn thành", incompleteBlocks.length],
              ["COMPLETED", "Đã hoàn thành", completedCount],
            ] as const
          ).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={blockFilter === value}
              onClick={() => setBlockFilter(value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors",
                blockFilter === value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
              <span className="ml-1.5 font-mono text-xs font-medium opacity-70">
                {count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm môn hoặc khối (không cần gõ dấu)"
              aria-label="Tìm môn hoặc khối kiến thức"
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
          <Button
            variant="secondary"
            size="icon"
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="Đồng bộ chương trình đào tạo từ myBK"
            title="Đồng bộ chương trình đào tạo từ myBK"
          >
            <RefreshCw
              className={cn(
                "h-4 w-4",
                (refreshing || cur.refreshing) && "animate-spin"
              )}
            />
          </Button>
        </div>
      </div>

      {/* ===== 4. Các khối kiến thức ===== */}
      {filteredBlocks.length === 0 ? (
        <EmptyState
          title="Không có khối hoặc môn phù hợp"
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setBlockFilter("ALL");
              }}
            >
              Xóa bộ lọc
            </Button>
          }
        />
      ) : (
        <div className="mt-stagger space-y-3.5">
          {filteredBlocks.map((blk) => {
            const open = isOpen(blk);
            const catalogOpen = Boolean(showCatalog[blk.blockId]);

            // Khối tự chọn: mặc định chỉ hiện môn đã đạt / đang học, danh mục chưa học thu gọn
            const activeOrPassed = blk.courses.filter(
              (c) =>
                c.isPassed ||
                c.inCurrentTimetable ||
                c.isRetakeInCurrentSem ||
                blk.isRequiredBlock
            );
            const unstudied = blk.isRequiredBlock
              ? []
              : blk.courses.filter(
                  (c) =>
                    !c.isPassed &&
                    !c.inCurrentTimetable &&
                    !c.isRetakeInCurrentSem
                );
            const visibleCourses =
              searching || catalogOpen ? blk.courses : activeOrPassed;

            return (
              <section
                key={blk.blockId}
                className="overflow-hidden rounded-2xl border bg-card"
              >
                {/* Tiêu đề khối: loại · tên | tiến độ · trạng thái */}
                <button
                  type="button"
                  onClick={() => toggleBlock(blk)}
                  aria-expanded={open}
                  className={cn(
                    "flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1.5 bg-muted/25 px-5 py-3.5 text-left transition-colors hover:bg-muted/40",
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
                    <Badge tone={blk.isRequiredBlock ? "primary" : "info"}>
                      {blk.blockTypeLabel}
                    </Badge>
                    <span className="truncate font-display text-[15px] font-semibold text-foreground">
                      {blk.blockName}
                      {blk.subLabel && (
                        <span className="ml-1.5 font-normal text-muted-foreground">
                          — {blk.subLabel}
                        </span>
                      )}
                    </span>
                  </span>

                  <span className="flex items-center gap-3">
                    {blk.requiredCredits > 0 && (
                      <span className="font-mono text-[13px] text-muted-foreground">
                        <span className="font-semibold text-foreground">
                          {blk.earnedCredits}
                        </span>{" "}
                        / {blk.requiredCredits} TC
                      </span>
                    )}
                    {blk.isBlockCompleted ? (
                      <Badge tone="success">Hoàn thành</Badge>
                    ) : (
                      <Badge tone="warning">Chưa đủ</Badge>
                    )}
                  </span>
                </button>

                <Collapse open={open}>
                  {visibleCourses.length === 0 ? (
                    <p className="px-5 py-6 text-center text-[13px] text-muted-foreground">
                      Chưa có môn học nào được ghi nhận trong khối này
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[13px]">
                        <thead>
                          <tr className="border-b text-xs font-semibold text-muted-foreground">
                            <th className="px-5 py-2.5">Môn học</th>
                            <th className="px-3 py-2.5 text-center">TC</th>
                            <th className="px-3 py-2.5">Điểm</th>
                            <th className="px-5 py-2.5 text-right">
                              Trạng thái
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {visibleCourses.map((course) => (
                            <tr
                              key={course.uniqueKey}
                              onClick={() => openForBlockCourse(course, blk)}
                              className="cursor-pointer transition-colors hover:bg-muted/30"
                            >
                              {/* Môn: tên, rồi mã */}
                              <td className="px-5 py-3">
                                <p className="flex flex-wrap items-center gap-2 font-display text-sm font-semibold text-foreground">
                                  {course.subjectName}
                                  {course.isRetakeInCurrentSem && (
                                    <Badge tone="info">Đang cải thiện</Badge>
                                  )}
                                </p>
                                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                                  {course.subjectCode}
                                </p>
                              </td>
                              <td className="px-3 py-3 text-center font-mono font-medium text-foreground">
                                {course.credits}
                              </td>
                              <td className="px-3 py-3">
                                <ScoreCell
                                  score={course.numericScore}
                                  letter={course.letterGrade}
                                />
                              </td>
                              <td className="px-5 py-3 text-right">
                                {course.isPassed ? (
                                  <Badge tone="success">
                                    {course.freeElectiveRef
                                      ? "Đã xét TCTD"
                                      : "Đã tích lũy"}
                                  </Badge>
                                ) : course.inCurrentTimetable ? (
                                  <Badge tone="primary">
                                    Đang học HK {data?.currentSemesterCode}
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    Chưa học
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {!searching && unstudied.length > 0 && (
                    <div className="border-t bg-muted/10 px-5 py-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          setShowCatalog((prev) => ({
                            ...prev,
                            [blk.blockId]: !prev[blk.blockId],
                          }))
                        }
                        className="text-[13px] font-semibold text-muted-foreground transition-colors hover:text-primary"
                      >
                        {catalogOpen
                          ? "Thu gọn danh mục môn tự chọn chưa học"
                          : `Xem thêm ${unstudied.length} môn tự chọn trong danh mục`}
                      </button>
                    </div>
                  )}
                </Collapse>
              </section>
            );
          })}
        </div>
      )}

      {/* ===== 5. Môn ngoài chương trình đào tạo: thu gọn sẵn ===== */}
      {data?.outsideCourses && data.outsideCourses.length > 0 && !searching && (
        <section className="overflow-hidden rounded-2xl border bg-card">
          <button
            type="button"
            onClick={() => setOutsideOpen((o) => !o)}
            aria-expanded={outsideOpen}
            className={cn(
              "flex w-full items-center justify-between bg-muted/25 px-5 py-3.5 text-left transition-colors hover:bg-muted/40",
              outsideOpen && "border-b"
            )}
          >
            <span className="font-display text-[15px] font-semibold text-foreground">
              Môn học ngoài chương trình đào tạo
              <span className="ml-1.5 font-mono text-[13px] font-medium text-muted-foreground">
                ({data.outsideCourses.length})
              </span>
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200",
                !outsideOpen && "-rotate-90"
              )}
            />
          </button>
          <Collapse open={outsideOpen}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b text-xs font-semibold text-muted-foreground">
                    <th className="px-5 py-2.5">Môn học</th>
                    <th className="px-3 py-2.5 text-center">TC</th>
                    <th className="px-3 py-2.5">Điểm</th>
                    <th className="px-5 py-2.5 text-right">Ghi nhận</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.outsideCourses.map((out) => (
                    <tr
                      key={out.maMonHoc}
                      onClick={() => openForOutside(out)}
                      className="cursor-pointer transition-colors hover:bg-muted/30"
                    >
                      <td className="px-5 py-3">
                        <p className="font-display text-sm font-semibold text-foreground">
                          {out.tenMonHoc}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                          {out.maMonHoc}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-center font-mono font-medium text-foreground">
                        {out.soTinChi}
                      </td>
                      <td className="px-3 py-3">
                        <ScoreCell score={out.diemSo} letter={out.diemChu} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        {out.countedAsFreeElective ? (
                          <Badge tone="success">
                            <FolderCheck className="h-3 w-3" />
                            Tính tự chọn tự do
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {out.maMonHoc.startsWith("PE")
                              ? "Học phần GDTC"
                              : "Ngoài CTĐT"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Collapse>
        </section>
      )}

      {/* Modal chi tiết môn theo CTĐT */}
      <CurriculumCourseModal
        open={Boolean(activeCourseCtx)}
        onClose={() => setActiveCourseCtx(null)}
        context={activeCourseCtx}
        transcriptAttempts={
          activeCourseCtx
            ? transcriptCourses.filter(
                (tc) =>
                  tc.maMonHoc.toUpperCase() ===
                  activeCourseCtx.subjectCode.toUpperCase()
              )
            : []
        }
        currentTimetableSlots={
          activeCourseCtx
            ? timetableItems.filter(
                (t) =>
                  t.subjectCode.toUpperCase() ===
                  activeCourseCtx.subjectCode.toUpperCase()
              )
            : []
        }
        currentExams={
          activeCourseCtx
            ? examItems.filter(
                (e) =>
                  e.subjectCode.toUpperCase() ===
                  activeCourseCtx.subjectCode.toUpperCase()
              )
            : []
        }
      />
    </div>
  );
}
