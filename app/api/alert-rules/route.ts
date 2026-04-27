import { NextResponse } from 'next/server';
import { q } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    const rows = await q(
        `SELECT id, name, metric, comparator, threshold::float, enabled,
                cooldown_minutes, last_triggered_at::text, notes
           FROM alert_rules
          ORDER BY enabled DESC, name ASC`
    );
    return NextResponse.json(rows);
}

export async function POST(req: Request) {
    const body = await req.json();
    const { name, metric, comparator, threshold, cooldown_minutes, notes } = body || {};
    if (!name || !metric || !comparator || threshold == null) {
        return NextResponse.json({ error: 'name, metric, comparator, threshold required' }, { status: 400 });
    }
    const [row] = await q<{ id: number }>(
        `INSERT INTO alert_rules (name, metric, comparator, threshold, cooldown_minutes, notes)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [name, metric, comparator, Number(threshold), Number(cooldown_minutes ?? 30), notes || null]
    );
    return NextResponse.json({ ok: true, id: row.id });
}
