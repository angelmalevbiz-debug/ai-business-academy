"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ArrowRight, X } from "@phosphor-icons/react";
import { BrandLogo } from './brand-logo';

export function ModalFrame({
  title,
  description,
  close,
  children,
}: {
  title: string;
  description?: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (opener?.isConnected) requestAnimationFrame(() => opener.focus());
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={close}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const bounds = e.currentTarget.getBoundingClientRect();
        if (e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom) close();
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-heading">
        <BrandLogo compact />
        <button className="icon-button" onClick={close} aria-label="Затвори">
          <X size={22} />
        </button>
      </div>
      <h2 id="modal-title">{title}</h2>
      {description && <p className="muted">{description}</p>}
      {children}
    </dialog>
  );
}

export function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading inner-page-heading">
      <div>
        <h1>{title}</h1>
        {description?<p>{description}</p>:null}
      </div>
      {action}
    </div>
  );
}
export function EmptyState({
  title,
  text,
  action,
  onAction,
}: {
  icon?: ReactNode;
  title: string;
  text: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <button className="button secondary" onClick={onAction}>
          {action}
          <ArrowRight size={17} />
        </button>
      )}
    </div>
  );
}
