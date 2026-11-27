import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-xl bg-muted/75 dark:bg-muted/50",
        className
      )}
      {...props}
    />
  );
}

export function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-6xl">
      {/* Main 2-Column Workspace Grid Skeleton */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-2xl border bg-card">
              <div className="flex items-center gap-2.5 border-b px-5 py-3.5">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="h-5 w-28 rounded-md" />
              </div>
              <div className="p-6 space-y-3">
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-12 w-3/4 rounded-xl" />
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-2xl border bg-card">
              <div className="flex items-center justify-between border-b px-4 py-3.5">
                <div className="flex items-center gap-2.5">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <Skeleton className="h-5 w-20 rounded-md" />
                </div>
                <Skeleton className="h-8 w-24 rounded-lg" />
              </div>
              <div className="p-4 space-y-3">
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-12 w-full rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AcademicResultsSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* Top Tabs & Action Bar Skeleton */}
      <div className="flex items-center justify-between rounded-2xl border bg-card px-5 py-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-36 rounded-xl" />
          <Skeleton className="h-9 w-32 rounded-xl" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-40 rounded-xl" />
          <Skeleton className="h-9 w-32 rounded-xl" />
        </div>
      </div>

      {/* Unified Overview Box Skeleton */}
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="flex items-center gap-3.5 border-b bg-muted/20 px-6 py-4">
          <Skeleton className="h-11 w-11 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-48 rounded-md" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-28 rounded-md" />
              <Skeleton className="h-5 w-24 rounded-md" />
              <Skeleton className="h-5 w-44 rounded-md" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-6 py-4 space-y-2">
              <Skeleton className="h-3.5 w-28 rounded-md" />
              <Skeleton className="h-7 w-16 rounded-lg" />
            </div>
          ))}
        </div>
      </div>

      {/* Filter Toolbar Skeleton */}
      <div className="flex items-center justify-between rounded-2xl border bg-card px-5 py-3">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-9 w-44 rounded-xl" />
          <Skeleton className="h-9 w-32 rounded-xl" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-56 rounded-xl" />
          <Skeleton className="h-9 w-9 rounded-xl" />
        </div>
      </div>

      {/* Semester Tables Skeleton */}
      {Array.from({ length: 2 }).map((_, semIdx) => (
        <div
          key={semIdx}
          className="overflow-hidden rounded-2xl border bg-card"
        >
          <div className="flex items-center justify-between border-b bg-muted/30 px-5 py-3.5">
            <div className="flex items-center gap-3">
              <Skeleton className="h-6 w-14 rounded-lg" />
              <Skeleton className="h-5 w-60 rounded-md" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-20 rounded-lg" />
              <Skeleton className="h-6 w-16 rounded-lg" />
              <Skeleton className="h-6 w-20 rounded-lg" />
              <Skeleton className="h-6 w-16 rounded-lg" />
            </div>
          </div>
          <div className="divide-y p-4 space-y-3">
            {Array.from({ length: 4 }).map((__, rowIdx) => (
              <div
                key={rowIdx}
                className="flex items-center justify-between pt-3 first:pt-0"
              >
                <div className="flex items-center gap-4">
                  <Skeleton className="h-4 w-16 rounded-md" />
                  <Skeleton className="h-4 w-56 rounded-md" />
                </div>
                <div className="flex items-center gap-6">
                  <Skeleton className="h-4 w-10 rounded-md" />
                  <Skeleton className="h-4 w-8 rounded-md" />
                  <Skeleton className="h-4 w-10 rounded-md" />
                  <Skeleton className="h-6 w-10 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function MailWorkspaceSkeleton() {
  return (
    <div className="mx-auto -mb-24 flex h-[calc(100vh-6.5rem)] max-w-7xl flex-col gap-4">
      {/* Top Toolbar Skeleton */}
      <div className="flex items-center justify-between rounded-2xl border bg-card px-5 py-3">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-9 w-36 rounded-xl" />
          <Skeleton className="h-9 w-40 rounded-xl" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-56 rounded-xl" />
          <Skeleton className="h-9 w-9 rounded-xl" />
        </div>
      </div>

      {/* Main Split View Skeleton */}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-12">
        {/* Left Email List Skeleton */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-card lg:col-span-5">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <Skeleton className="h-4 w-20 rounded-md" />
            <Skeleton className="h-4 w-24 rounded-md" />
          </div>
          <div className="flex-1 divide-y p-4 space-y-4 overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2 pt-3 first:pt-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-14 rounded" />
                    <Skeleton className="h-4 w-28 rounded" />
                  </div>
                  <Skeleton className="h-3.5 w-12 rounded" />
                </div>
                <Skeleton className="h-4 w-4/5 rounded" />
                <Skeleton className="h-3.5 w-3/5 rounded" />
              </div>
            ))}
          </div>
        </div>

        {/* Right Email Reader Skeleton */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-card lg:col-span-7">
          <div className="border-b px-6 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-2/3 rounded-md" />
              <div className="flex items-center gap-1.5">
                <Skeleton className="h-8 w-20 rounded-lg" />
                <Skeleton className="h-8 w-20 rounded-lg" />
                <Skeleton className="h-8 w-24 rounded-lg" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-48 rounded-md" />
              <Skeleton className="h-4 w-36 rounded-md" />
            </div>
          </div>
          <div className="flex-1 p-6 space-y-3">
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-4 w-11/12 rounded" />
            <Skeleton className="h-4 w-4/5 rounded" />
            <Skeleton className="h-32 w-full rounded-xl mt-4" />
            <Skeleton className="h-4 w-3/4 rounded" />
            <Skeleton className="h-4 w-1/2 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function TimetableSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* Top Tabs & Action Bar Skeleton */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-8 w-24 rounded-xl" />
          <Skeleton className="h-8 w-28 rounded-xl" />
          <Skeleton className="h-8 w-24 rounded-xl" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-48 rounded-xl" />
          <Skeleton className="h-9 w-44 rounded-xl" />
          <Skeleton className="h-9 w-9 rounded-xl" />
        </div>
      </div>

      {/* Merged Week Navigation Bar Skeleton */}
      <div className="flex items-center justify-between rounded-2xl border bg-card px-3.5 py-2">
        <div className="flex items-center gap-1">
          <Skeleton className="h-7 w-7 rounded-lg" />
          <Skeleton className="h-7 w-7 rounded-lg" />
        </div>
        <div className="flex items-center gap-1">
          <Skeleton className="h-7 w-36 rounded-lg" />
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-8 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-7 w-24 rounded-lg" />
      </div>

      {/* Weekly Calendar Grid Skeleton */}
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="grid grid-cols-7 divide-x border-b bg-muted/25">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="px-3.5 py-2.5 space-y-1.5">
              <Skeleton className="h-3.5 w-14 rounded-md" />
              <Skeleton className="h-3 w-10 rounded-md" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 divide-x min-h-[380px]">
          {Array.from({ length: 7 }).map((_, colIdx) => (
            <div key={colIdx} className="p-2.5 space-y-2.5">
              {colIdx < 5 && (
                <>
                  <Skeleton className="h-24 w-full rounded-xl" />
                  {colIdx % 2 === 0 && (
                    <Skeleton className="h-24 w-full rounded-xl" />
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Compact Bottom Summary Bar Skeleton */}
      <div className="flex items-center justify-between rounded-2xl border bg-card px-5 py-3">
        <div className="flex items-center gap-4">
          <Skeleton className="h-4 w-48 rounded-md" />
          <Skeleton className="h-4 w-24 rounded-md" />
          <Skeleton className="h-4 w-24 rounded-md" />
        </div>
        <Skeleton className="h-6 w-36 rounded-lg" />
      </div>
    </div>
  );
}

export function ExamScheduleSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* Điều khiển: học kỳ + lọc loại kỳ | xuất lịch + làm mới */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-56 rounded-lg" />
          <Skeleton className="h-9 w-64 rounded-xl" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-9 rounded-lg" />
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-12">
        {/* Thẻ ca thi tiếp theo: nhãn, tên môn, đếm ngược, 3 hàng thông tin */}
        <div className="space-y-5 rounded-2xl border bg-card p-5 lg:col-span-5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-28 rounded-md" />
            <Skeleton className="h-5 w-32 rounded-md" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-6 w-4/5 rounded-lg" />
            <Skeleton className="h-3.5 w-40 rounded-md" />
          </div>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
          <div className="space-y-2 rounded-xl border p-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full rounded-md" />
            ))}
          </div>
        </div>

        {/* Danh sách ca thi */}
        <div className="overflow-hidden rounded-2xl border bg-card lg:col-span-7">
          <div className="border-b bg-muted/25 px-5 py-3">
            <Skeleton className="h-4 w-24 rounded-md" />
          </div>
          <div className="divide-y">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[3.5rem_1fr_auto] gap-3 px-5 py-3.5">
                <Skeleton className="h-14 rounded-xl" />
                <div className="space-y-2">
                  <Skeleton className="h-3 w-16 rounded-md" />
                  <Skeleton className="h-4 w-3/4 rounded-md" />
                  <Skeleton className="h-3 w-40 rounded-md" />
                  <Skeleton className="h-3 w-24 rounded-md" />
                </div>
                <Skeleton className="h-5 w-16 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

