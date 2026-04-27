import { NextResponse } from 'next/server';
import { q } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const body = await req.json();
    const updates: string[] = [];
    const values: any[] = [];

    if (body.name != null)             { values.push(body.name);              updates.push(`name = $${values.length}`); }
    if (body.metric != null)           { values.push(body.metric);            updates.push(`metric = $${values.length}`); }
    if (body.comparator != null)       { values.push(body.comparator);        updates.push(`comparator = $${values.length}`); }
    if (body.threshold != null)        { values.push(Number(body.threshold)); updates.push(`threshold = $${values.length}`); }
    if (body.cooldown_minutes != null) { values.push(Number(body.cooldown_minutes)); updates.push(`cooldown_minutes = $${values.length}`); }
    if (body.enabled != null)          { values.push(!!body.enabled);         updates.push(`enabled = $${values.length}`); }
    if (body.notes !== undefined)      { values.push(body.notes);             updates.push(`notes = $${values.length}`); }
    if (body.mark_triggered)           { updates.push(`last_triggered_at = NOW()`); }

    if (updates.length) {
        values.push(id);
        await q(`UPDATE alert_rules SET ${updates.join(', ')} WHERE id = $${values.length}`, values);
    }

    // When the client says "mark_triggered", also log to alerts table so it shows
    // up in the on-page Alerts panel and the bell badge counter.
    if (body.mark_triggered && body.value != null) {
        const [rule] = await q<{ name: string; metric: string; comparator: string; threshold: number }>(
            `SELECT name, metric, comparator, threshold::float FROM alert_rules WHERE id = $1`, [id]
        );
        if (rule) {
            await q(
                `INSERT INTO alerts (severity, category, title, body, metrics)
                 VALUES ('warn','custom_rule',$1,$2,$3::jsonb)`,
                [
                    rule.name,
                    `${rule.metric.replace(/_/g, ' ')} ${rule.comparator} ${rule.threshold} (now ${Number(body.value).toFixed(2)})`,
                    JSON.stringify({ rule_id: Number(id), value: Number(body.value), threshold: rule.threshold }),
                ]
            );
        }
    }
    return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    await q(`DELETE FROM alert_rules WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
}
