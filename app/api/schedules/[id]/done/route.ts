import { NextResponse } from 'next/server';
import { q } from '@/lib/server';

export const dynamic = 'force-dynamic';

/** Mark a schedule done: log an event AND advance its next_due_at by frequency_days. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const [sched] = await q<{ title: string; category: string; frequency_days: number }>(
        `SELECT title, category, frequency_days FROM schedules WHERE id = $1`, [id]
    );
    if (!sched) return NextResponse.json({ error: 'not found' }, { status: 404 });

    // 1. record an event
    await q(
        `INSERT INTO events (category, title, notes) VALUES ($1, $2, $3)`,
        [sched.category, sched.title, `Scheduled reminder #${id}`]
    );

    // 2. advance the schedule
    await q(
        `UPDATE schedules
            SET last_done_at = NOW(),
                next_due_at  = NOW() + frequency_days::int * INTERVAL '1 day'
          WHERE id = $1`,
        [id]
    );

    return NextResponse.json({ ok: true });
}
