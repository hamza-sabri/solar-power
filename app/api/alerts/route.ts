import { NextResponse } from 'next/server';
import { q } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const rows = await q(
            `SELECT id, ts::text, severity, category, title, body, acknowledged_at::text
               FROM alerts
              ORDER BY (acknowledged_at IS NULL) DESC, ts DESC
              LIMIT 50`
        );
        return NextResponse.json(rows);
    } catch (e: any) {
        console.error('[/api/alerts] failed:', e?.message);
        return NextResponse.json([]);
    }
}
