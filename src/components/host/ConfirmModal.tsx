import { Loader2 } from 'lucide-react';
import React from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  eyebrow?: string;
  message: string;
  confirmLabel?: string;
  confirmTone?: 'gold' | 'cyan' | 'danger';
  loading?: boolean;
  children?: React.ReactNode;
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  eyebrow = 'CONFIRM ACTION',
  message,
  confirmLabel = 'Confirm',
  confirmTone = 'gold',
  loading = false,
  children,
}: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : onClose}
      eyebrow={eyebrow}
      title={title}
      maxWidthClass="max-w-lg"
      footer={
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" size="sm" disabled={loading} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={confirmTone === 'danger' ? 'outline' : confirmTone}
            size="sm"
            disabled={loading}
            onClick={onConfirm}
            className={
              confirmTone === 'danger'
                ? 'border-red-500 bg-red-500 text-white hover:border-red-400 hover:bg-red-400 hover:text-white'
                : ''
            }
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <span>{confirmLabel}</span>
            )}
          </Button>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-[#E8ECF4]">{message}</p>
      {children && <div className="mt-4">{children}</div>}
    </Modal>
  );
}
