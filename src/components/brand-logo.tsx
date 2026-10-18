import Image from 'next/image';

export function BrandLogo({ className = '', tone = 'primary' }: { className?: string; tone?: 'primary' | 'white' }) {
  return (
    <Image
      src="/manuos-logo.png"
      alt="ManuOS"
      width={2048}
      height={524}
      className={`h-auto max-w-full shrink-0 ${tone === 'white' ? 'brightness-0 invert' : ''} ${className}`}
      priority
    />
  );
}
