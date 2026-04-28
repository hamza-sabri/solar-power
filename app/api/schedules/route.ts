import { NextResponse } from 'next/server';
import { q } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const rows = await q(
            `SELECT id, title, category, frequency_days,
                    last_done_at::text, next_due_at::text, enabled, notes
               FROM schedules
              ORDER BY enabled DESC, next_due_at ASC`
        );
        return NextResponse.json(rows);
    } catch (e: any) {
        console.error('[/api/schedules] failed:', e?.message);
        return NextResponse.json([]);
    }
}

export async function POST(req: Request) {
    const body = await req.json();
    const { title, category, frequency_days, notes } = body || {};
    if (!title || !category || !frequency_days) {
        return NextResponse.json({ error: 'title, category, frequency_days required' }, { status: 400 });
    }
    const days = Math.max(1, Number(frequency_days));
    const [row] = await q<{ id: number }>(
        `INSERT INTO schedules (title, category, frequency_days, next_due_at, notes)
         VALUES ($1, $2, $3, NOW() + ($3::int * INTERVAL '1 day'), $4)
         RETURNING id`,
        [title, category, days, notes || null]
    );
    return NextResponse.json({ ok: true, id: row.id });
}
