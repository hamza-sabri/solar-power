import { NextResponse } from 'next/server';
import { q } from '@/lib/server';

export const dynamic = 'force-dynamic';

// POST = acknowledge
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    await q(`UPDATE alerts SET acknowledged_at = NOW() WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
}
