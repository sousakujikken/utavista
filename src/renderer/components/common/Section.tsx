import React from 'react';
import './Section.css';

interface SectionProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}

export const Section: React.FC<SectionProps> = ({
  title,
  subtitle,
  children,
  className = ''
}) => {
  const classNames = ['common-section', className].filter(Boolean).join(' ');

  return (
    <div className={classNames}>
      {title && <h3 className="common-section-title">{title}</h3>}
      {subtitle && <h4 className="common-section-subtitle">{subtitle}</h4>}
      <div className="common-section-content">
        {children}
      </div>
    </div>
  );
};