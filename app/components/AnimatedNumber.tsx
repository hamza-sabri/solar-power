'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * Tweens a number from its previous value to the new one using rAF.
 * Pure JS, no animation framework dependency.
 */
export function AnimatedNumber({
    value,
    decimals = 0,
    prefix = '',
    suffix = '',
    duration = 700,
    className = '',
}: {
    value: number;
    decimals?: number;
    prefix?: string;
    suffix?: string;
    duration?: number;     // ms
    className?: string;
}) {
    const [display, setDisplay] = useState<number>(value);
    const fromRef = useRef<number>(value);
    const startRef = useRef<number>(0);
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        const from = fromRef.current;
        const to = value;
        if (from === to) return;
        startRef.current = performance.now();

        const step = (now: number) => {
            const elapsed = now - startRef.current;
            const t = Math.min(1, elapsed / duration);
            const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
            const v = from + (to - from) * eased;
            setDisplay(v);
            if (t < 1) {
                rafRef.current = requestAnimationFrame(step);
            } else {
                fromRef.current = to;
                rafRef.current = null;
            }
        };
        rafRef.current = requestAnimationFrame(step);
        return () => {
            if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        };
    }, [value, duration]);

    const text =
        prefix +
        display.toLocaleString(undefined, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        }) +
        suffix;

    return <span className={`tabular-nums ${className}`}>{text}</span>;
}
