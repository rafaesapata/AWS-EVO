/**
 * Card CTA Component
 * Call-to-action link for dashboard cards
 * Based on Figma design specifications
 * - Text: 12px Light (300)
 * - Color: #484848 (gray-700)
 * - Arrow: → with hover animation
 */

import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface CardCTAProps {
  /** Translation key for the CTA text (e.g., 'executiveDashboard.cta.viewSecurity') */
  textKey: string;
  /** Fallback text if translation is not found */
  fallback: string;
  /** Navigation href */
  href: string;
  /** Text alignment */
  align?: 'left' | 'center' | 'right';
  /** Additional CSS classes */
  className?: string;
}

export default function CardCTA({ 
  textKey,
  fallback,
  href, 
  align = 'center',
  className = '' 
}: CardCTAProps) {
  const { t } = useTranslation();
  
  const alignmentClass = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end'
  }[align];

  return (
    <div className={`flex ${alignmentClass} ${className}`}>
      <Link
        to={href}
        className="inline-flex items-center gap-1 font-light text-[#484848] hover:text-[#393939] transition-colors group"
        style={{ fontSize: '12px' }}
      >
        <span>{t(textKey, fallback)}</span>
        <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
      </Link>
    </div>
  );
}
