import { NextResponse } from 'next/server';
import { q } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const body = await req.json();
    const updates: string[] = [];
    const values: any[] = [];

    if (body.title != null)          { values.push(body.title);            updates.push(`title = $${values.length}`); }
    if (body.category != null)       { values.push(body.category);         updates.push(`category = $${values.length}`); }
    if (body.frequency_days != null) { values.push(Number(body.frequency_days)); updates.push(`frequency_days = $${values.length}`); }
    if (body.enabled != null)        { values.push(!!body.enabled);        updates.push(`enabled = $${values.length}`); }
    if (body.notes !== undefined)    { values.push(body.notes);            updates.push(`notes = $${values.length}`); }
    if (body.snooze_days != null) {
        const d = Math.max(1, Number(body.snooze_days));
        updates.push(`next_due_at = NOW() + ${d}::int * INTERVAL '1 day'`);
    }

    if (!updates.length) return NextResponse.json({ ok: true });

    values.push(id);
    await q(
        `UPDATE schedules SET ${updates.join(', ')} WHERE id = $${values.length}`,
        values
    );
    return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    await q(`DELETE FROM schedules WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
}
