'use client';

import { useEffect } from 'react';

export interface DialogProps {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onSubmit?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  submitDisabled?: boolean;
  danger?: boolean;
}

export default function Dialog({
  title,
  children,
  onClose,
  onSubmit,
  submitLabel = '保存',
  cancelLabel = 'キャンセル',
  submitDisabled,
  danger,
}: DialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="s-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="s-modal">
        <div className="s-modal-head">
          <span>{title}</span>
          <button className="s-btn link" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </div>
        <div className="s-modal-body">{children}</div>
        <div className="s-modal-foot">
          <button className="s-btn" onClick={onClose}>
            {cancelLabel}
          </button>
          {onSubmit && (
            <button
              className={danger ? 's-btn danger' : 's-btn primary'}
              onClick={onSubmit}
              disabled={submitDisabled}
            >
              {submitLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
