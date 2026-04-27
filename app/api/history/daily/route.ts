import { NextResponse } from 'next/server';
import { q } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const url = new URL(req.url);
    const days = Math.max(1, Math.min(400, Number(url.searchParams.get('days') ?? 30)));
    const rows = await q(
        `SELECT day::text, imported_kwh::float AS imported_kwh, exported_kwh::float AS exported_kwh,
                net_kwh::float AS net_kwh
           FROM daily_energy
          WHERE day >= (CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day')
          ORDER BY day ASC`,
        [days]
    );
    return NextResponse.json(rows);
}
