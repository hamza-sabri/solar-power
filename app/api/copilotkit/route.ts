import { NextRequest } from 'next/server';
import {
    CopilotRuntime,
    OpenAIAdapter,
    copilotRuntimeNextJSAppRouterEndpoint,
} from '@copilotkit/runtime';
import OpenAI from 'openai';

// CopilotKit uses an OpenAI-compatible client; OpenRouter is OpenAI-compatible.
// Set OPENROUTER_API_KEY in .env. If absent, the route still works but the
// chat will return a graceful "AI key not configured" message.

const openrouter = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY || 'missing',
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
        // OpenRouter recommends these:
        'HTTP-Referer': process.env.PUBLIC_BASE_URL || 'http://localhost:3000',
        'X-Title': 'Solar Dashboard',
    },
});

const serviceAdapter = new OpenAIAdapter({
    openai: openrouter as any,
    model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-70b-instruct:free',
} as any);

const runtime = new CopilotRuntime();

export const POST = async (req: NextRequest) => {
    const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
        runtime,
        serviceAdapter,
        endpoint: '/api/copilotkit',
    });
    return handleRequest(req);
};
