import { get, writable } from 'svelte/store';
import { DefaultProvider, ProviderLabels } from '$lib/constants/static';

declare const chrome: {
	storage?: {
		sync?: {
			set: (items: Record<string, unknown>, callback?: () => void) => void;
			get: (keys: string[], callback: (items: Record<string, unknown>) => void) => void;
			remove: (keys: string | string[], callback?: () => void) => void;
		};
	};
	runtime?: { lastError?: { message?: string } };
};

export type AIProvider = 'openrouter' | 'openai';

const STORAGE_KEYS = {
	provider: 'aiProvider',
	openrouter: 'openrouterApiKey',
	openai: 'openaiApiKey'
} as const;
const FEEDBACK_TIMEOUT_MS = 2800;

export const providerLabels = ProviderLabels as Record<AIProvider, string>;
export const apiProvider = writable<AIProvider>(DefaultProvider as AIProvider);
export const apiKey = writable('');
export const apiKeyDraft = writable('');
export const isSettingsOpen = writable(false);
export const settingsFeedback = writable('');

const providerKeys: Record<AIProvider, ReturnType<typeof writable<string>>> = {
	openrouter: writable(''),
	openai: writable('')
};

let feedbackTimeout: ReturnType<typeof setTimeout> | null = null;

function isProvider(value: unknown): value is AIProvider {
	return value === 'openrouter' || value === 'openai';
}

function setFeedback(message: string) {
	if (feedbackTimeout) {
		clearTimeout(feedbackTimeout);
	}

	settingsFeedback.set(message);

	if (message) {
		feedbackTimeout = setTimeout(() => {
			settingsFeedback.set('');
		}, FEEDBACK_TIMEOUT_MS);
	}
}

function persist(values: Record<string, unknown>, errorMessage: string) {
	if (typeof chrome !== 'undefined' && chrome?.storage?.sync) {
		chrome.storage.sync.set(values, () => {
			if (chrome.runtime?.lastError) {
				console.error('[LMalaS] Storage error:', chrome.runtime.lastError.message);
				setFeedback(errorMessage);
			}
		});
		return;
	}

	if (typeof localStorage !== 'undefined') {
		for (const [key, value] of Object.entries(values)) {
			localStorage.setItem(key, String(value ?? ''));
		}
	}
}

function removePersisted(key: string, errorMessage: string) {
	if (typeof chrome !== 'undefined' && chrome?.storage?.sync) {
		chrome.storage.sync.remove(key, () => {
			if (chrome.runtime?.lastError) {
				console.error('[LMalaS] Storage remove error:', chrome.runtime.lastError.message);
				setFeedback(errorMessage);
			}
		});
		return;
	}

	if (typeof localStorage !== 'undefined') {
		localStorage.removeItem(key);
	}
}

function getStoredProviderKey(provider: AIProvider) {
	return get(providerKeys[provider]);
}

function setProviderKey(provider: AIProvider, value: string) {
	providerKeys[provider].set(value);
	if (get(apiProvider) === provider) {
		apiKey.set(value);
		apiKeyDraft.set(value);
	}
}

function activateProvider(provider: AIProvider, draftValue = getStoredProviderKey(provider)) {
	apiProvider.set(provider);
	apiKey.set(draftValue);
	apiKeyDraft.set(draftValue);
}

export function getActiveProvider() {
	return get(apiProvider);
}

export function getActiveProviderLabel() {
	return providerLabels[getActiveProvider()];
}

export function getActiveApiKey() {
	return getStoredProviderKey(getActiveProvider()).trim();
}

export function getApiKeyPlaceholder(provider = getActiveProvider()) {
	return provider === 'openai' ? 'sk-...' : 'sk-or-...';
}

export function loadApiKey() {
	const fallbackProvider = DefaultProvider as AIProvider;

	if (typeof chrome !== 'undefined' && chrome?.storage?.sync) {
		chrome.storage.sync.get(
			[STORAGE_KEYS.provider, STORAGE_KEYS.openrouter, STORAGE_KEYS.openai],
			(result) => {
				if (chrome.runtime?.lastError) {
					console.error(
						'[LMalaS] Unable to retrieve API settings:',
						chrome.runtime.lastError.message
					);
					return;
				}

				const storedProvider = result?.[STORAGE_KEYS.provider];
				const provider: AIProvider = isProvider(storedProvider) ? storedProvider : fallbackProvider;
				providerKeys.openrouter.set(
					(result?.[STORAGE_KEYS.openrouter] as string | undefined) ?? ''
				);
				providerKeys.openai.set((result?.[STORAGE_KEYS.openai] as string | undefined) ?? '');
				activateProvider(provider);
			}
		);
		return;
	}

	if (typeof localStorage !== 'undefined') {
		const providerRaw = localStorage.getItem(STORAGE_KEYS.provider);
		const provider = isProvider(providerRaw) ? providerRaw : fallbackProvider;
		providerKeys.openrouter.set(localStorage.getItem(STORAGE_KEYS.openrouter) ?? '');
		providerKeys.openai.set(localStorage.getItem(STORAGE_KEYS.openai) ?? '');
		activateProvider(provider);
	}
}

export function toggleSettings() {
	isSettingsOpen.update((value) => !value);
	setFeedback('');
}

export function selectProvider(provider: AIProvider) {
	activateProvider(provider);
	persist({ [STORAGE_KEYS.provider]: provider }, 'Could not store the selected provider.');
	setFeedback(`Using ${providerLabels[provider]}.`);
}

export function setApiKeyDraft(value: string) {
	apiKeyDraft.set(value);
}

export function saveApiKey() {
	const provider = getActiveProvider();
	const value = get(apiKeyDraft).trim();
	setProviderKey(provider, value);
	persist({ [STORAGE_KEYS[provider]]: value }, 'Could not store the API key. Try again.');
	setFeedback(
		value
			? `${providerLabels[provider]} API key saved.`
			: `${providerLabels[provider]} API key cleared.`
	);
}

export function clearApiKey() {
	const provider = getActiveProvider();
	setProviderKey(provider, '');
	removePersisted(STORAGE_KEYS[provider], 'Could not remove the API key. Try again.');
	setFeedback(`${providerLabels[provider]} API key cleared.`);
}
