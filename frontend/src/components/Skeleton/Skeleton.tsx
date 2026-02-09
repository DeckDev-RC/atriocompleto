interface SkeletonProps {
  width?: string;
  height?: string;
  borderRadius?: string;
  className?: string;
}

export function Skeleton({
  width = '100%',
  height = '16px',
  borderRadius = '10px',
  className = '',
}: SkeletonProps) {
  return (
    <div
      className={`shimmer ${className}`}
      style={{ width, height, borderRadius }}
    />
  );
}

export function SkeletonCard({ minHeight = '220px' }: { minHeight?: string }) {
  return (
    <div
      className="flex flex-col gap-4 rounded-2xl bg-card p-6 border border-border shadow-soft dark:shadow-dark-card"
      style={{ minHeight }}
    >
      <Skeleton width="45%" height="14px" />
      <Skeleton width="70%" height="24px" />
      <Skeleton width="100%" height="120px" borderRadius="14px" />
    </div>
  );
}

export function SkeletonBanner() {
  return (
    <div
      className="relative mb-16 flex min-h-[190px] w-full flex-col overflow-visible rounded-2xl p-7 px-8 max-md:min-h-[160px] max-md:mb-20 max-sm:mb-4"
      style={{
        background: 'linear-gradient(135deg, #1c2a33 0%, #3e5d6f 35%, #3a81aa 70%, #38b6ff 100%)',
      }}
    >
      <div className="flex flex-col gap-2.5">
        <Skeleton width="200px" height="24px" className="shimmer-light" borderRadius="10px" />
        <Skeleton width="300px" height="14px" className="shimmer-light" borderRadius="8px" />
      </div>

      <div className="mt-auto flex translate-y-1/2 gap-4 max-md:flex-nowrap max-md:overflow-x-auto max-sm:translate-y-0 max-sm:mt-5 max-sm:flex-col">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={`${
              i === 0 ? 'flex-[1.35]' : 'flex-1'
            } flex flex-col gap-2.5 rounded-2xl bg-card p-5 px-6 shadow-float max-md:min-w-[175px] max-md:flex-none max-sm:min-w-0`}
          >
            <Skeleton width="55%" height="10px" />
            <Skeleton width="75%" height="26px" />
          </div>
        ))}
      </div>
    </div>
  );
}
