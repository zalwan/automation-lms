// Default to OpenRouter's automatic model routing
export const ModelId = 'deepseek/deepseek-chat-v3.1:free';

// Preferred fallback models (in order)
export const FallbackModels = [
	'meta-llama/llama-3.3-70b-instruct:free',
	'meta-llama/llama-3.3-8b-instruct:free',
	'openrouter/auto'
];
