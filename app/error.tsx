'use client';
import { useEffect } from 'react';

// Global error boundary. If any client component throws during render,
// this catches it instead of letting the entire page show a blank
// "Application error" screen.
export default function Error({
    error, reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('[error boundary]', error);
    }, [error]);

    return (
        <div className="max-w-2xl mx-auto px-5 py-12 text-fg">
            <div className="kpi-number text-[10px] tracking-widest text-rose2 mb-2">
                ⚠ DASHBOARD CRASHED
            </div>
            <h1 className="text-2xl font-semibold mb-2">Something went wrong rendering the page.</h1>
            <p className="text-sm text-fgMuted mb-4">
                A component threw an error. The data layer is fine — only the UI tree crashed.
                Most often this is a stale cached chunk; reload usually fixes it.
            </p>
            <pre className="kpi-number text-[11px] text-rose2 bg-white/5 border border-hairline rounded p-3 overflow-x-auto">
                {error?.message || 'Unknown error'}
                {error?.digest && `\n\ndigest: ${error.digest}`}
            </pre>
            <div className="mt-4 flex gap-2">
                <button onClick={() => reset()}
                    className="kpi-number text-xs px-3 py-2 rounded bg-white text-black">
                    TRY AGAIN
                </button>
                <button onClick={() => window.location.reload()}
                    className="kpi-number text-xs px-3 py-2 rounded border border-hairline text-fg">
                    HARD RELOAD
                </button>
                <a href="/api/health" target="_blank"
                    className="kpi-number text-xs px-3 py-2 rounded border border-hairline text-cyan2">
                    /API/HEALTH ↗
                </a>
            </div>
        </div>
    );
}
