"use client";
import { useEffect } from "react";
import { X, AlertCircle, Loader2 } from "lucide-react";
import { statusLabels } from "@/lib/types";
// องค์ประกอบเล็กที่ใช้ซ้ำและรองรับ keyboard
export function Badge({ status }: { status: string }) {
  return (
    <span className={`badge badge-${status}`}>
      {statusLabels[status] || status}
    </span>
  );
}
export function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div role="alert" className="error-box">
      <AlertCircle size={17} />
      <span>{message}</span>
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="flex items-center justify-center gap-3 py-20 text-muted">
      <Loader2 className="animate-spin" size={22} />
      กำลังโหลดข้อมูล…
    </div>
  );
}
export function Empty({ text = "ยังไม่มีข้อมูล" }: { text?: string }) {
  return <div className="py-16 text-center text-muted">{text}</div>;
}
export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="text-muted mt-2 text-sm leading-7">{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.getElementById("academy-dialog");
    dialog?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && dialog) {
        const items = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            "button,input,textarea,select,a[href]",
          ),
        ).filter((x) => !x.hasAttribute("disabled"));
        const first = items[0],
          last = items[items.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === dialog)
        ) {
          e.preventDefault();
          last?.focus();
        }
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = old;
      window.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        id="academy-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">{title}</h2>
          <button aria-label="ปิด" className="icon-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
