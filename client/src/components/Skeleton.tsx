// Shimmering placeholder block. Compose to build loading skeletons.
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`shimmer ${className}`} />;
}

// A few stacked lines, for list/panel loading states.
export function SkeletonLines({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}

// Skeleton rows for the standup table. Widths come from the table's colgroup,
// so each cell is just a full-width shimmer block.
export function SkeletonTableRows({ rows = 5 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
          <td className="p-2"><Skeleton className="h-12 w-full" /></td>
          <td className="p-2"><Skeleton className="h-12 w-full" /></td>
          <td className="p-2"><Skeleton className="h-12 w-full" /></td>
          <td className="p-2"><Skeleton className="h-12 w-full" /></td>
          <td className="p-2"><Skeleton className="h-12 w-full" /></td>
          <td className="p-2"><Skeleton className="h-6 w-full" /></td>
        </tr>
      ))}
    </>
  );
}
