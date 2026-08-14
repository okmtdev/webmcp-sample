'use client';

import { useEffect } from 'react';

export interface ModalProps {
  title: string;
  children: React.ReactNode;
  okLabel?: string;
  cancelLabel?: string;
  onOk?: () => void;
  onCancel: () => void;
  okDisabled?: boolean;
  hideCancel?: boolean;
}

/** 「本当によろしいですか？」を何度も出すためのモーダル。 */
export default function Modal({
  title,
  children,
  okLabel = 'OK',
  cancelLabel = 'キャンセル',
  onOk,
  onCancel,
  okDisabled,
  hideCancel,
}: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal">
        <div className="titlebar">
          <span>{title}</span>
          <button className="btn small" onClick={onCancel} aria-label="閉じる">
            ×
          </button>
        </div>
        <div className="body">{children}</div>
        <div className="actions">
          {!hideCancel && (
            <button className="btn" onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
          {onOk && (
            <button className="btn primary" onClick={onOk} disabled={okDisabled}>
              {okLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
