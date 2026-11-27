"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ResourceStatus =
  | "loading"
  | "ready"
  | "empty"
  | "not-connected"
  | "sso-expired"
  | "error";

/** Các trường chung mà API /api/mybk/* và /api/gmail/* trả về */
export interface ResourcePayload {
  connected?: boolean;
  authenticated?: boolean;
  isStale?: boolean;
  lastSyncedAt?: string | null;
  warning?: string;
  errorCode?: string;
  error?: string;
  code?: string;
}

interface Options<T> {
  /** Đường dẫn API gốc (kèm query). `null` để tạm dừng, vd khi chưa biết học kỳ. */
  url: string | null;
  /** Sau lần đọc đầu (từ DB) có gọi lại với `revalidate=1` để đồng bộ ngầm hay không */
  revalidate?: boolean;
  /** Xác định "rỗng thật" */
  isEmpty?: (data: T) => boolean;
  /** Tự gọi lại khi sự kiện này được phát trên window (mặc định mt-mybk-updated) */
  refetchEvent?: string | null;
}

export interface ResourceState<T> {
  status: ResourceStatus;
  data: T | null;
  /** Đang hiển thị dữ liệu đã lưu do lần đồng bộ mới thất bại / quá hạn */
  isStale: boolean;
  lastSyncedAt: string | null;
  error: string | null;
  /** Đang đồng bộ ngầm, không chặn giao diện */
  refreshing: boolean;
  retry: () => void;
  /** `force` = bỏ qua cache phía server và hỏi lại myBK */
  refresh: (force?: boolean) => Promise<boolean>;
}

// Cache theo module: các tab/trang dùng chung dữ liệu, tránh gọi lại cùng một API
const cache = new Map<string, unknown>();

export function getCachedResource<T>(url: string): T | undefined {
  return cache.get(url) as T | undefined;
}

export function invalidateResource(url?: string) {
  if (url) cache.delete(url);
  else cache.clear();
}

function withParams(url: string, params: Record<string, string>): string {
  const [path, query = ""] = url.split("?");
  const sp = new URLSearchParams(query);
  for (const [k, v] of Object.entries(params)) sp.set(k, v);
  const qs = sp.toString();
  return qs ? `${path}?${qs}` : path;
}

export function useMybkResource<T extends ResourcePayload>({
  url,
  revalidate = true,
  isEmpty,
  refetchEvent = "mt-mybk-updated",
}: Options<T>): ResourceState<T> {
  const [data, setData] = useState<T | null>(
    () => (url ? (cache.get(url) as T | undefined) ?? null : null)
  );
  const [status, setStatus] = useState<ResourceStatus>(
    url && cache.has(url) ? "ready" : "loading"
  );
  const [error, setError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const reqId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const isEmptyRef = useRef(isEmpty);
  isEmptyRef.current = isEmpty;
  const dataRef = useRef<T | null>(data);
  dataRef.current = data;

  /** Áp dụng một phản hồi; trả về true nếu coi là thành công */
  const apply = useCallback(
    (key: string, res: Response, json: T | null): boolean => {
      if (res.ok && json) {
        cache.set(key, json);
        setData(json);
        setError(json.warning ?? null);
        // `json.isStale` từ API chỉ nghĩa là "đã quá 5 phút, nên đồng bộ lại",
        // không phải lỗi. Chỉ báo dữ liệu cũ khi lần đồng bộ thật sự thất bại.
        setIsStale(Boolean(json.warning || json.errorCode));
        if (json.connected === false || json.authenticated === false) {
          setStatus("not-connected");
        } else if (isEmptyRef.current?.(json)) {
          setStatus("empty");
        } else {
          setStatus("ready");
        }
        return !json.warning;
      }

      const code = json?.code;
      const message = json?.error || `Lỗi máy chủ (${res.status})`;
      setError(message);
      if (code === "NOT_CONNECTED") setStatus("not-connected");
      else if (code === "SSO_EXPIRED") setStatus("sso-expired");
      else if (dataRef.current) {
        // Còn dữ liệu cũ: giữ lại và báo là dữ liệu đã lưu
        setIsStale(true);
        setStatus("ready");
      } else setStatus("error");
      return false;
    },
    []
  );

  const run = useCallback(
    async (opts: { force?: boolean; silent?: boolean } = {}) => {
      if (!url) return false;
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const id = ++reqId.current;

      const request = async (target: string) => {
        const res = await fetch(target, {
          cache: "no-store",
          signal: ctrl.signal,
        });
        const json = (await res.json().catch(() => null)) as T | null;
        return { res, json };
      };

      try {
        if (!opts.force) {
          if (!opts.silent && !cache.has(url)) setStatus("loading");
          const first = await request(url);
          if (id !== reqId.current) return false;
          apply(url, first.res, first.json);
          if (!revalidate) return first.res.ok;
        }

        setRefreshing(true);
        const target = withParams(
          url,
          opts.force ? { force: "1" } : { revalidate: "1" }
        );
        const second = await request(target);
        if (id !== reqId.current) return false;
        return apply(url, second.res, second.json);
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return false;
        if (id !== reqId.current) return false;
        setError("Lỗi kết nối, vui lòng kiểm tra mạng");
        if (dataRef.current) {
          setIsStale(true);
          setStatus("ready");
        } else setStatus("error");
        return false;
      } finally {
        if (id === reqId.current) setRefreshing(false);
      }
    },
    [url, revalidate, apply]
  );

  // Đổi url (vd đổi học kỳ): hiện cache ngay nếu có, rồi tải lại; huỷ request cũ
  useEffect(() => {
    if (!url) return;
    const cached = cache.get(url) as T | undefined;
    if (cached) {
      setData(cached);
      setStatus("ready");
    } else {
      setData(null);
      setStatus("loading");
    }
    setError(null);
    setIsStale(false);
    run();
    return () => {
      abortRef.current?.abort();
    };
  }, [url, run]);

  useEffect(() => {
    if (!refetchEvent) return;
    const onEvent = () => {
      if (url) cache.delete(url);
      run({ silent: true });
    };
    window.addEventListener(refetchEvent, onEvent);
    return () => window.removeEventListener(refetchEvent, onEvent);
  }, [refetchEvent, url, run]);

  const retry = useCallback(() => {
    run();
  }, [run]);

  const refresh = useCallback(
    (force = false) => run({ force, silent: true }),
    [run]
  );

  return {
    status,
    data,
    isStale,
    lastSyncedAt: data?.lastSyncedAt ?? null,
    error,
    refreshing,
    retry,
    refresh,
  };
}
