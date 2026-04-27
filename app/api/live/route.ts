import { NextResponse } from 'next/server';
import { getOverview, getInstantaneous } from '@/lib/server';

// Always hit the meter directly so the user gets fresh values regardless of
// whether the poller is running on a separate VPS.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
    try {
        const [o, i] = await Promise.all([
            getOverview(),
            getInstantaneous().catch(() => ({} as any)),
        ]);
        const inst = i as any;
        return NextResponse.json({
            ...o,
            v_l1: inst.v_l1, v_l2: inst.v_l2, v_l3: inst.v_l3,
            i_l1: inst.i_l1, i_l2: inst.i_l2, i_l3: inst.i_l3,
            pf_l1: inst.pf_l1, pf_l2: inst.pf_l2, pf_l3: inst.pf_l3,
            freq_hz: inst.freq_hz,
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || 'meter unreachable' }, { status: 503 });
    }
}
