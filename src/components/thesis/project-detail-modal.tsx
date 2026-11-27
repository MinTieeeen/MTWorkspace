"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { looksLikeHtml, sanitizeHtml } from "@/lib/thesis/sanitize-html";
import type { BilingualText, ProjectView } from "@/lib/thesis/types";

type Section = "description" | "requirements" | "references";
type Lang = "vi" | "en";

const SECTIONS: { value: Section; label: string }[] = [
  { value: "description", label: "Mô tả" },
  { value: "requirements", label: "Yêu cầu" },
  { value: "references", label: "Tài liệu tham khảo" },
];

export function ProjectDetailModal({
  open,
  onClose,
  project,
}: {
  open: boolean;
  onClose: () => void;
  project: ProjectView | null;
}) {
  const [section, setSection] = useState<Section>("description");
  const [lang, setLang] = useState<Lang>("vi");

  const text: BilingualText | undefined = project?.[section];
  // Nếu bản tiếng đã chọn trống thì rơi về bản còn lại
  const shown = text ? text[lang] || text[lang === "vi" ? "en" : "vi"] : null;

  // Nội dung từ trường thường là HTML: lọc rồi hiển thị; không phải HTML thì giữ nguyên xuống dòng
  const safeHtml = useMemo(
    () => (open && shown && looksLikeHtml(shown) ? sanitizeHtml(shown) : null),
    [open, shown]
  );

  return (
    <Modal open={open} onClose={onClose} size="md" label="Chi tiết đồ án">
      <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-primary">Chi tiết đồ án</p>
          <h2 className="mt-0.5 font-display text-base font-bold leading-snug text-foreground">
            {project?.titleVi || project?.titleEn || "Đồ án"}
          </h2>
          {(project?.batchName || project?.department) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {[project?.batchName, project?.department].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
        <SegmentedTabs value={section} onChange={setSection} options={SECTIONS} />
        <SegmentedTabs
          value={lang}
          onChange={setLang}
          options={[
            { value: "vi", label: "VI" },
            { value: "en", label: "EN" },
          ]}
        />
      </div>

      <div className="min-h-[10rem] flex-1 overflow-y-auto px-5 py-4">
        {shown && safeHtml ? (
          <div
            className="text-sm leading-relaxed text-foreground [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h1]:font-display [&_h1]:text-lg [&_h1]:font-bold [&_h2]:font-display [&_h2]:text-base [&_h2]:font-bold [&_h3]:font-semibold [&_li]:mb-1 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-3 [&_p:empty]:hidden [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        ) : shown ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {shown}
          </p>
        ) : (
          <p className="py-8 text-center text-[13px] text-muted-foreground">
            Chưa có nội dung.
          </p>
        )}
      </div>
    </Modal>
  );
}
