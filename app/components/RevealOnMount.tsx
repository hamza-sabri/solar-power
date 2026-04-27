'use client';
/**
 * Fade-up entrance animation. Pure CSS — uses the `fade-up` keyframe in
 * globals.css. `delay` is seconds.
 */
export function RevealOnMount({
    children,
    delay = 0,
    className = '',
}: {
    children: React.ReactNode;
    delay?: number;
    className?: string;
}) {
    return (
        <div className={`fade-up ${className}`} style={{ animationDelay: `${delay}s` }}>
            {children}
        </div>
    );
}
