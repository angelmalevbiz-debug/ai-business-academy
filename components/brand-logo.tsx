import Image from 'next/image';

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return <span className={`academy-brand ${compact ? 'compact' : ''}`}>
    <Image src="/brand/academy-mark-transparent.png" width={64} height={64} alt="" className="academy-mark" loading="eager" />
    {!compact && <span className="academy-wordmark"><strong>AI BUSINESS</strong>{' '}<span>ACADEMY</span></span>}
  </span>;
}
