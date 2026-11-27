"use client";

import { useEffect, useState } from "react";
import {
  CalendarClock,
  FolderKanban,
  ListChecks,
  NotebookPen,
  Pencil,
  RefreshCw,
  Link2,
  KeyRound,
  Gavel,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ConnectPrompt,
  EmptyState,
  ErrorState,
  StaleBanner,
} from "@/components/ui/state";
import {
  CommitteeCard,
  ProjectCard,
} from "@/components/thesis/overview-cards";
import { MilestoneRoadmap } from "@/components/thesis/milestone-roadmap";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { LinksTab } from "@/components/thesis/links-tab";
import { MeetingsTab } from "@/components/thesis/meetings-tab";
import { NotesTab } from "@/components/thesis/notes-tab";
import { TasksTab } from "@/components/thesis/tasks-tab";
import { ManualProjectModal } from "@/components/thesis/manual-project-modal";
import { ApprovalStatusModal } from "@/components/thesis/approval-status-modal";
import { ProjectDetailModal } from "@/components/thesis/project-detail-modal";
import { useMybkResource } from "@/lib/use-mybk-resource";
import type { ThesisPayload } from "@/lib/thesis/types";

type Tab = "overview" | "meetings" | "tasks" | "notes" | "links";

const TABS = [
  { value: "overview", label: "Tổng quan", icon: <FolderKanban className="h-4 w-4" /> },
  { value: "meetings", label: "Cuộc họp", icon: <CalendarClock className="h-4 w-4" /> },
  { value: "tasks", label: "Công việc", icon: <ListChecks className="h-4 w-4" /> },
  { value: "notes", label: "Ghi chú", icon: <NotebookPen className="h-4 w-4" /> },
  { value: "links", label: "Tài liệu", icon: <Link2 className="h-4 w-4" /> },
] as const;

function ThesisSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Skeleton className="h-14 w-full" />
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-5">
          <Skeleton className="h-52 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
        <div className="space-y-4 lg:col-span-7">
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    </div>
  );
}

export default function ThesisPage() {
  // Đồ án (theo học kỳ) đang xem; null = server chọn học kỳ mới nhất
  const [projectId, setProjectId] = useState<string | null>(null);
  const thesis = useMybkResource<ThesisPayload>({
    url: `/api/thesis${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`,
    isEmpty: (d) => !d.project,
  });
  const data = thesis.data;

  const [tab, setTab] = useState<Tab>("overview");
  const [refreshing, setRefreshing] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  // Cập nhật mỗi 30 giây để đổi trạng thái mốc đúng lúc
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    setNowMs(Date.now());
    const t = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const ok = await thesis.refresh(true);
      if (ok) toast.success("Đã cập nhật Đồ án");
      else toast.error("Không thể làm mới Đồ án");
    } finally {
      setRefreshing(false);
    }
  };

  /** Sau khi lưu nhập tay: yêu cầu hook tải lại */
  const handleSaved = () => window.dispatchEvent(new Event("mt-mybk-updated"));

  const linkGoogle = () => {
    window.location.href = "/api/auth/google";
  };

  if ((!data && thesis.status === "loading") || nowMs === null) {
    return <ThesisSkeleton />;
  }

  if (thesis.status === "error") {
    return (
      <div className="mx-auto max-w-2xl pt-10">
        <ErrorState
          title="Không tải được đồ án"
          message={thesis.error ?? undefined}
          onRetry={thesis.retry}
        />
      </div>
    );
  }

  const project = data?.project ?? null;

  // Phiên trường hết hạn mà chưa có dữ liệu đã lưu
  if (!project && (thesis.status === "sso-expired" || thesis.status === "not-connected")) {
    const expired = thesis.status === "sso-expired";
    return (
      <div className="mx-auto max-w-2xl space-y-3 pt-10">
        <ConnectPrompt
          expired={expired}
          title={expired ? "Phiên đăng nhập trường đã hết hạn" : "Chưa liên kết tài khoản HCMUT"}
          description="Đăng nhập Google bằng tài khoản @hcmut.edu.vn để lấy thông tin đồ án từ hệ thống của trường."
          actionLabel="Đăng nhập Google"
          onConnect={linkGoogle}
        />
        <div className="text-center">
          <Button variant="ghost" size="sm" onClick={() => setManualOpen(true)}>
            <Pencil className="h-3.5 w-3.5" />
            Hoặc nhập thông tin tay
          </Button>
        </div>
        <ManualProjectModal
          open={manualOpen}
          onClose={() => setManualOpen(false)}
          project={null}
          committee={null}
          onSaved={handleSaved}
        />
      </div>
    );
  }

  // Chưa có đồ án nào
  if (!project) {
    const linked = Boolean(data?.linked);
    return (
      <div className="mx-auto max-w-2xl space-y-3 pt-10">
        {linked ? (
          <EmptyState
            icon={<FolderKanban />}
            title="Chưa thấy đồ án của bạn"
            description="Hệ thống trường chưa có đồ án nào gắn với tài khoản này. Bạn có thể làm mới, hoặc nhập thông tin tay để theo dõi."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="secondary" size="sm" onClick={handleRefresh} loading={refreshing}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Làm mới
                </Button>
                <Button size="sm" onClick={() => setManualOpen(true)}>
                  <Pencil className="h-3.5 w-3.5" />
                  Nhập tay
                </Button>
              </div>
            }
          />
        ) : (
          <EmptyState
            icon={<KeyRound />}
            title="Chưa liên kết tài khoản HCMUT"
            description="Liên kết Google @hcmut.edu.vn để tự lấy thông tin đồ án, hoặc nhập tay nếu chỉ muốn dùng công cụ quản lý."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="sm" onClick={linkGoogle}>
                  Đăng nhập Google
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setManualOpen(true)}>
                  <Pencil className="h-3.5 w-3.5" />
                  Nhập tay
                </Button>
              </div>
            }
          />
        )}
        <ManualProjectModal
          open={manualOpen}
          onClose={() => setManualOpen(false)}
          project={null}
          committee={null}
          onSaved={handleSaved}
        />
      </div>
    );
  }

  const isManual = project.source === "MANUAL";
  const projects = data?.projects ?? [];
  // LOV học kỳ: mỗi đồ án thuộc một học kỳ; học kỳ trùng tên thì thêm mã đồ án cho phân biệt
  const semesterOptions = projects.map((p) => {
    const base = p.semesterName || p.label;
    const dup = projects.filter((x) => (x.semesterName || x.label) === base).length > 1;
    return { id: p.id, text: dup ? `${base} · ${p.label}` : base };
  });
  const milestones = data?.milestones ?? [];
  const committee = data?.committee ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {thesis.isStale && (
        <StaleBanner
          lastSyncedAt={thesis.lastSyncedAt}
          message={thesis.error ?? "Đang hiển thị dữ liệu đồ án đã lưu, chưa cập nhật được từ trường"}
          refreshing={refreshing}
          onRefresh={data?.linked ? handleRefresh : undefined}
        />
      )}

      {/* ===== Điều khiển: tab · nguồn · làm mới ===== */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <SegmentedTabs
            value={tab}
            onChange={setTab}
            options={TABS.map((t) => ({ value: t.value, label: t.label, icon: t.icon }))}
            className="max-w-full overflow-x-auto"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={project.id}
            onChange={(e) => setProjectId(e.target.value)}
            aria-label="Chọn học kỳ"
            title="Chọn học kỳ / đồ án"
            className="max-w-[16rem] truncate"
          >
            {semesterOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.text}
              </option>
            ))}
          </Select>
          {isManual && (
            <Button variant="secondary" size="sm" onClick={() => setManualOpen(true)}>
              <Pencil className="h-3.5 w-3.5" />
              Sửa
            </Button>
          )}
          {data?.linked && (
            <Button
              variant="secondary"
              size="icon"
              onClick={handleRefresh}
              disabled={refreshing}
              aria-label="Làm mới từ hệ thống trường"
              title="Làm mới từ hệ thống trường"
            >
              <RefreshCw
                className={cn(
                  "h-4 w-4",
                  (refreshing || thesis.refreshing) && "animate-spin"
                )}
              />
            </Button>
          )}
        </div>
      </div>

      {tab === "overview" ? (
        <div className="mt-stagger space-y-4">
          <div className="grid items-start gap-4 lg:grid-cols-12">
            {/* Trái: hội đồng bảo vệ */}
            <div className="space-y-4 lg:col-span-5">
              {committee ? (
                <CommitteeCard committee={committee} nowMs={nowMs} />
              ) : (
                <Card className="flex items-center gap-3 px-5 py-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Gavel className="h-[18px] w-[18px]" />
                  </span>
                  <div>
                    <p className="font-display text-sm font-semibold text-foreground">
                      Hội đồng bảo vệ
                    </p>
                    <p className="text-[13px] text-muted-foreground">
                      Chưa có lịch bảo vệ. Trường sẽ công bố sau.
                    </p>
                  </div>
                </Card>
              )}
            </div>
            {/* Phải: hồ sơ đồ án */}
            <div className="lg:col-span-7">
              <ProjectCard
                project={project}
                onOpenDetail={() => setDetailOpen(true)}
                onOpenStatus={() => setStatusOpen(true)}
              />
            </div>
          </div>
          {/* Dưới: lộ trình theo chặng */}
          <MilestoneRoadmap milestones={milestones} nowMs={nowMs} />
        </div>
      ) : tab === "meetings" ? (
        <MeetingsTab project={project} nowMs={nowMs} />
      ) : tab === "tasks" ? (
        <TasksTab project={project} nowMs={nowMs} />
      ) : tab === "notes" ? (
        <NotesTab project={project} nowMs={nowMs} />
      ) : (
        <LinksTab project={project} />
      )}

      <ApprovalStatusModal
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        project={project}
      />
      <ProjectDetailModal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        project={project}
      />
      <ManualProjectModal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        project={isManual ? project : null}
        committee={isManual ? committee : null}
        onSaved={handleSaved}
      />
    </div>
  );
}
