interface EmptyStateProps {
  title: string;
  body?: string;
}

/**
 * Minimal empty-state card. Use when a list or queue has no items to show.
 */
export function EmptyState({ title, body }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-6">
      <p className="text-2xl font-black text-foreground">{title}</p>
      {body && (
        <p className="text-muted-foreground font-medium text-sm max-w-xs">
          {body}
        </p>
      )}
    </div>
  );
}
