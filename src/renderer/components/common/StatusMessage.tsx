import React from 'react';
import './StatusMessage.css';

export type StatusType = 'success' | 'error' | 'warning' | 'info';

interface StatusMessageProps {
  type: StatusType;
  message: string;
  onClose?: () => void;
  className?: string;
}

export const StatusMessage: React.FC<StatusMessageProps> = ({
  type,
  message,
  onClose,
  className = ''
}) => {
  const classNames = [
    'common-status-message',
    `common-status-message--${type}`,
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={classNames}>
      <span className="common-status-message-text">{message}</span>
      {onClose && (
        <button
          className="common-status-message-close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      )}
    </div>
  );
};