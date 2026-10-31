"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

// Native modal dialogs provide focus trapping, inert background and Escape.
// Explicitly restore focus to the opener when a modal unmounts.
export function Dialog({
  title,
  children,
  onClose,
  locked = false,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  locked?: boolean;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const label = useId();
  useEffect(() => {
    const opener = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={label}
      className={`order-dialog${wide ? " proof-dialog" : ""}`}
      onCancel={(event) => {
        event.preventDefault();
        if (!locked) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !locked) onClose();
      }}
    >
      <div className="dialog-heading">
        <h2 id={label}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Tutup dialog"
          disabled={locked}
          onClick={onClose}
        >
          <X size={22} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function ConfirmAction({
  title,
  description,
  label,
  busy,
  disabled = false,
  className,
  onConfirm,
  children,
}: {
  title: string;
  description: string;
  label: string;
  busy: boolean;
  disabled?: boolean;
  className?: string;
  onConfirm: () => Promise<unknown>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const lock = useRef(false);
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={busy || disabled}
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        {children}
      </button>
      {open && (
        <Dialog title={title} locked={working} onClose={() => setOpen(false)}>
          <p>{description}</p>
          {error && (
            <p className="message error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              className="secondary"
              disabled={working}
              onClick={() => setOpen(false)}
            >
              Kembali
            </button>
            <button
              type="button"
              disabled={busy || working}
              onClick={async () => {
                if (lock.current) return;
                lock.current = true;
                setWorking(true);
                setError("");
                try {
                  await onConfirm();
                  setOpen(false);
                } catch (error) {
                  setError(
                    error instanceof Error
                      ? error.message
                      : "Tindakan gagal. Coba lagi.",
                  );
                } finally {
                  lock.current = false;
                  setWorking(false);
                }
              }}
            >
              {working ? "Menyimpan…" : label}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
