export const DefaultProvider = 'openrouter';

export const ProviderLabels = {
	openrouter: 'OpenRouter',
	openai: 'OpenAI'
};

// Default to OpenRouter's automatic model routing
export const OpenRouterModelId = 'deepseek/deepseek-chat-v3.1:free';

// OpenAI Chat Completions model used for the direct OpenAI provider.
export const OpenAIModelId = 'gpt-4o-mini';

// Preferred fallback models (in order)
export const OpenRouterFallbackModels = [
	'meta-llama/llama-3.3-70b-instruct:free',
	'meta-llama/llama-3.3-8b-instruct:free',
	'openrouter/auto'
];

export const OpenAIFallbackModels = ['gpt-4o'];

export const ModelId = OpenRouterModelId;
export const FallbackModels = OpenRouterFallbackModels;
