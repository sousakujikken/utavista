import React from 'react';
import './Input.css';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  fullWidth?: boolean;
}

export const Input: React.FC<InputProps> = ({
  label,
  fullWidth = false,
  className = '',
  id,
  ...props
}) => {
  const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;
  const classNames = [
    'common-input',
    fullWidth ? 'common-input--full-width' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className="common-input-wrapper">
      {label && (
        <label htmlFor={inputId} className="common-input-label">
          {label}
        </label>
      )}
      <input id={inputId} className={classNames} {...props} />
    </div>
  );
};