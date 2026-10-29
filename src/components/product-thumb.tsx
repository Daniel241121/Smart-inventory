import { Footprints } from 'lucide-react';
import { cn } from './ui';

/** Foto pequeña del modelo, o un ícono si no tiene. */
export function ProductThumb({ url, size = 'md', className }: { url: string | null | undefined; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const box = { sm: 'h-9 w-9', md: 'h-11 w-11', lg: 'h-20 w-20' }[size];
  return (
    <div className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-slate-300', box, className)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <Footprints className={size === 'lg' ? 'h-8 w-8' : 'h-4 w-4'} />
      )}
    </div>
  );
}
