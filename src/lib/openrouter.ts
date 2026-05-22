import { get } from 'svelte/store';
import {
	apiKey as apiKeyStore,
	apiProvider,
	getActiveApiKey,
	providerLabels,
	type AIProvider
} from '$lib/stores/openrouter';
import {
	OpenAIModelId,
	OpenAIFallbackModels,
	OpenRouterModelId,
	OpenRouterFallbackModels
} from '$lib/constants/static';

export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

export type ChatRole = 'system' | 'user' | 'assistant';

export type ChatMessage = {
	role: ChatRole;
	content: string;
};

export type ChatOptions = {
	messages: ChatMessage[];
	provider?: AIProvider;
	model?: string;
	temperature?: number;
	max_tokens?: number;
	stream?: boolean;
	apiKey?: string;
	signal?: AbortSignal;
	fallbackModels?: string[];
	maxRetries?: number;
};

type ProviderConfig = {
	url: string;
	defaultModel: string;
	fallbackModels: string[];
};

const providerConfig: Record<AIProvider, ProviderConfig> = {
	openrouter: {
		url: OPENROUTER_API_URL,
		defaultModel: OpenRouterModelId,
		fallbackModels: OpenRouterFallbackModels
	},
	openai: {
		url: OPENAI_API_URL,
		defaultModel: OpenAIModelId,
		fallbackModels: OpenAIFallbackModels
	}
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

function resolveProvider(provider?: AIProvider) {
	return provider ?? get(apiProvider);
}

function resolveApiKey(apiKey: string | undefined, provider: AIProvider) {
	const key = (apiKey ?? getActiveApiKey() ?? get(apiKeyStore)).trim();
	if (!key) throw new Error(`${providerLabels[provider]} API key missing. Set it in Settings.`);
	return key;
}

function createRequestBody(options: {
	model: string;
	messages: ChatMessage[];
	temperature: number;
	max_tokens?: number;
	stream?: boolean;
}) {
	return JSON.stringify({
		model: options.model,
		messages: options.messages,
		temperature: options.temperature,
		max_tokens: options.max_tokens,
		stream: options.stream
	});
}

export async function chatComplete(options: ChatOptions): Promise<string> {
	const provider = resolveProvider(options.provider);
	const config = providerConfig[provider];
	const {
		messages,
		model = config.defaultModel,
		temperature = 0,
		max_tokens,
		apiKey,
		signal,
		fallbackModels = config.fallbackModels,
		maxRetries = 1
	} = options;
	const key = resolveApiKey(apiKey, provider);

	const models = uniqueModels([model, ...fallbackModels]);
	for (const currentModel of models) {
		let attempt = 0;
		while (attempt <= maxRetries) {
			attempt += 1;
			const res = await fetch(config.url, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${key}`,
					'Content-Type': 'application/json'
				},
				body: createRequestBody({ model: currentModel, messages, temperature, max_tokens }),
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

	throw new Error(`${providerLabels[provider]} failed across configured models.`);
}

export type StreamHandlers = {
	onDelta?: (text: string) => void;
};

export async function chatStream(options: ChatOptions, handlers: StreamHandlers = {}) {
	const provider = resolveProvider(options.provider);
	const config = providerConfig[provider];
	const {
		messages,
		model = config.defaultModel,
		temperature = 0,
		apiKey,
		signal,
		fallbackModels = config.fallbackModels
	} = options;
	const key = resolveApiKey(apiKey, provider);

	const models = uniqueModels([model, ...fallbackModels]);
	let res: Response | null = null;
	for (const currentModel of models) {
		const tryRes = await fetch(config.url, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${key}`,
				'Content-Type': 'application/json'
			},
			body: createRequestBody({ model: currentModel, messages, temperature, stream: true }),
			signal
		});
		if (tryRes.ok && tryRes.body) {
			res = tryRes;
			break;
		}
	}

	if (!res || !res.body) {
		throw new Error(`${providerLabels[provider]} streaming failed across configured models.`);
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
