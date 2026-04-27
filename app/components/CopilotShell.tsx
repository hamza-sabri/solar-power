'use client';
import { CopilotKit } from '@copilotkit/react-core';
import { CopilotPopup } from '@copilotkit/react-ui';

export function CopilotShell({ children }: { children: React.ReactNode }) {
    return (
        <CopilotKit runtimeUrl="/api/copilotkit">
            {children}
            <CopilotPopup
                instructions={`You are a friendly home-solar assistant for a homeowner in Qalqiliya, Palestine.
The home has a Siemens PAC2200 grid meter that measures bidirectional grid flow:
  - "import" = energy drawn FROM the grid (when home > solar, or at night)
  - "export" = energy fed TO the grid (solar surplus)
The solar inverter is single-phase, wired only to L1.

Use the registered actions to fetch data — never invent numbers. Always include the period.
When the user asks general questions ("how was last week?", "did cleaning the panels help?",
"why is my bill high?"), call multiple actions and reason over the results.
Speak in plain, kind, non-technical language. Keep answers under 6 sentences unless asked.
If the user marks an event (e.g. cleaned panels), confirm warmly and reassure them you'll watch the next few days.`}
                labels={{
                    title: 'Solar assistant',
                    initial: 'Hi! Ask me anything about your solar — like "how was production last week?" or "did cleaning the panels help?"',
                }}
            />
        </CopilotKit>
    );
}
