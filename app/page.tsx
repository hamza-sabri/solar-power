import { HeroLive } from './components/HeroLive';
import { RealtimeFlow } from './components/RealtimeFlow';
import { PeriodTotals } from './components/PeriodTotals';
import { BillStory } from './components/BillStory';
import { DailyChart } from './components/DailyChart';
import { PhaseImbalance } from './components/PhaseImbalance';
import { AlertsPanel } from './components/AlertsPanel';
import { Insights } from './components/Insights';
import { RevealOnMount } from './components/RevealOnMount';

export default function Home() {
    return (
        <>
            <main className="max-w-7xl mx-auto px-3 sm:px-5 py-4 sm:py-6 space-y-4 sm:space-y-5">
                <RevealOnMount delay={0.0}><HeroLive /></RevealOnMount>
                <RevealOnMount delay={0.06}><RealtimeFlow /></RevealOnMount>
                <RevealOnMount delay={0.12}><PeriodTotals /></RevealOnMount>
                <RevealOnMount delay={0.18}><Insights /></RevealOnMount>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
                    <RevealOnMount delay={0.0}><BillStory /></RevealOnMount>
                    <RevealOnMount delay={0.08}><DailyChart /></RevealOnMount>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
                    <RevealOnMount delay={0.0}><PhaseImbalance /></RevealOnMount>
                    <RevealOnMount delay={0.08}><AlertsPanel /></RevealOnMount>
                </div>
            </main>

            <footer className="max-w-7xl mx-auto px-3 sm:px-5 py-4 sm:py-6 kpi-number text-[10px] text-fgDim flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 border-t border-hairline mt-6 sm:mt-8">
                <span>METER · 82.213.14.12:83 · PAC2200 V3.2.2</span>
                <span>NEON · eu-central-1 · LIVE</span>
            </footer>
        </>
    );
}
