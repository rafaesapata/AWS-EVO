/**
 * Card CTA Component
 * Call-to-action link for dashboard cards
 * Based on Figma design specifications
 */

import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface CardCTAProps {
  text: string;
  href: string;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export default function CardCTA({ 
  text, 
  href, 
  align = 'center',
  className = '' 
}: CardCTAProps) {
  const alignmentClass = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right'
  }[align];

  return (
    <Link
      to={href}
      className={`inline-flex items-center gap-1 text-xs font-light text-gray-700 hover:text-gray-900 transition-colors group ${alignmentClass} ${className}`}
    >
      <span>{text}</span>
      <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
    </Link>
  );
}
