import React from 'react';
import './Select.css';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  fullWidth?: boolean;
}

export const Select: React.FC<SelectProps> = ({
  label,
  fullWidth = false,
  className = '',
  id,
  ...props
}) => {
  const selectId = id || `select-${Math.random().toString(36).substr(2, 9)}`;
  const classNames = [
    'common-select',
    fullWidth ? 'common-select--full-width' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className="common-select-wrapper">
      {label && (
        <label htmlFor={selectId} className="common-select-label">
          {label}
        </label>
      )}
      <select id={selectId} className={classNames} {...props} />
    </div>
  );
};