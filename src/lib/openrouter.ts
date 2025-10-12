import { get } from 'svelte/store';
import { apiKey as apiKeyStore } from '$lib/stores/openrouter';
import { ModelId, FallbackModels } from '$lib/constants/static';

export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export type ChatRole = 'system' | 'user' | 'assistant';

export type ChatMessage = {
	role: ChatRole;
	content: string;
};

export type ChatOptions = {
    messages: ChatMessage[];
    model?: string;
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
    apiKey?: string;
    signal?: AbortSignal;
    fallbackModels?: string[];
    maxRetries?: number;
};

function uniqueModels(list: string[]) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const it of list) {
        if (!seen.has(it)) {
            seen.add(it);
            out.push(it);
        }
    }
    return out;
}

async function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

export async function chatComplete(options: ChatOptions): Promise<string> {
    const {
        messages,
        model = ModelId,
        temperature = 0,
        max_tokens,
        apiKey,
        signal,
        fallbackModels = FallbackModels,
        maxRetries = 1
    } = options;

    const key = (apiKey ?? get(apiKeyStore)).trim();
    if (!key) throw new Error('OpenRouter API key missing. Set it in Settings.');

    const models = uniqueModels([model, ...fallbackModels]);
    for (const currentModel of models) {
        let attempt = 0;
        while (attempt <= maxRetries) {
            attempt += 1;
            const res = await fetch(OPENROUTER_API_URL, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${key}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ model: currentModel, messages, temperature, max_tokens }),
                signal
            });

            if (res.ok) {
                const data = await res.json();
                const answer: string | undefined = data?.choices?.[0]?.message?.content?.trim();
                if (answer) return answer;
            }

            if (res.status === 429 || res.status >= 500) {
                await sleep(300 * attempt);
                continue;
            }
            break;
        }
    }

    throw new Error('OpenRouter failed across all models including auto-routing.');
}

export type StreamHandlers = {
	onDelta?: (text: string) => void;
};

export async function chatStream(options: ChatOptions, handlers: StreamHandlers = {}) {
    const { messages, model = ModelId, temperature = 0, apiKey, signal, fallbackModels = FallbackModels } = options;
    const key = (apiKey ?? get(apiKeyStore)).trim();
    if (!key) throw new Error('OpenRouter API key missing. Set it in Settings.');

    const models = uniqueModels([model, ...fallbackModels]);
    let res: Response | null = null;
    for (const currentModel of models) {
        const tryRes = await fetch(OPENROUTER_API_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ model: currentModel, messages, temperature, stream: true }),
            signal
        });
        if (tryRes.ok && tryRes.body) {
            res = tryRes;
            break;
        }
    }

    if (!res || !res.body) {
        throw new Error('OpenRouter streaming failed across all models.');
    }

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	let streamComplete = false;
	let finalText = '';

	type StreamChunk = { choices?: { delta?: { content?: string } }[] };

	const processEventBlock = (block: string) => {
		for (const line of block.split('\n')) {
			const trimmed = line.trim();
			if (!trimmed.startsWith('data:')) continue;

			const payload = trimmed.slice(5).trim();
			if (!payload) continue;

			if (payload === '[DONE]') {
				streamComplete = true;
				return;
			}

			try {
				const parsed = JSON.parse(payload) as StreamChunk;
				const content = parsed.choices?.[0]?.delta?.content;
				if (content) {
					finalText += content;
					handlers.onDelta?.(content);
				}
			} catch (err) {
				// swallow parse errors for non-JSON lines
			}
		}
	};

	while (!streamComplete) {
		const { value, done } = await reader.read();
		if (done) {
			buffer += decoder.decode();
			if (buffer.trim()) processEventBlock(buffer);
			break;
		}
		const chunk = decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
		buffer += chunk;

		let sep = buffer.indexOf('\n\n');
		while (sep !== -1) {
			const eventBlock = buffer.slice(0, sep);
			buffer = buffer.slice(sep + 2);
			processEventBlock(eventBlock);
			if (streamComplete) break;
			sep = buffer.indexOf('\n\n');
		}
		if (streamComplete) break;
	}

	return finalText.trim();
}
