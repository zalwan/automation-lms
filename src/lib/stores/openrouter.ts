import { get, writable } from 'svelte/store';

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

const STORAGE_KEY = 'openrouterApiKey';
const FEEDBACK_TIMEOUT_MS = 2800;

export const apiKey = writable('');
export const apiKeyDraft = writable('');
export const isSettingsOpen = writable(false);
export const settingsFeedback = writable('');

let feedbackTimeout: ReturnType<typeof setTimeout> | null = null;

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

function persistApiKey(value: string) {
	if (typeof chrome !== 'undefined' && chrome?.storage?.sync) {
		chrome.storage.sync.set({ [STORAGE_KEY]: value }, () => {
			if (chrome.runtime?.lastError) {
				console.error('[LMalaS] Unable to store API key:', chrome.runtime.lastError.message);
				setFeedback('Could not store the API key. Try again.');
			}
		});
	} else if (typeof localStorage !== 'undefined') {
		localStorage.setItem(STORAGE_KEY, value);
	}
}

function removePersistedApiKey() {
	if (typeof chrome !== 'undefined' && chrome?.storage?.sync) {
		chrome.storage.sync.remove(STORAGE_KEY, () => {
			if (chrome.runtime?.lastError) {
				console.error('[LMalaS] Unable to remove API key:', chrome.runtime.lastError.message);
				setFeedback('Could not remove the API key. Try again.');
			}
		});
	} else if (typeof localStorage !== 'undefined') {
		localStorage.removeItem(STORAGE_KEY);
	}
}

export function loadApiKey() {
	if (typeof chrome !== 'undefined' && chrome?.storage?.sync) {
		chrome.storage.sync.get([STORAGE_KEY], (result) => {
			if (chrome.runtime?.lastError) {
				console.error('[LMalaS] Unable to retrieve API key:', chrome.runtime.lastError.message);
				return;
			}

			const stored = (result?.[STORAGE_KEY] as string | undefined) ?? '';
			apiKey.set(stored);
			apiKeyDraft.set(stored);
		});
	} else if (typeof localStorage !== 'undefined') {
		const stored = localStorage.getItem(STORAGE_KEY) ?? '';
		apiKey.set(stored);
		apiKeyDraft.set(stored);
	}
}

export function toggleSettings() {
	isSettingsOpen.update((value) => !value);
	setFeedback('');
}

export function setApiKeyDraft(value: string) {
	apiKeyDraft.set(value);
}

export function saveApiKey() {
	const value = get(apiKeyDraft).trim();
	apiKey.set(value);
	persistApiKey(value);
	setFeedback(value ? 'API key saved.' : 'API key cleared.');
}

export function clearApiKey() {
	apiKey.set('');
	apiKeyDraft.set('');
	removePersistedApiKey();
	setFeedback('API key cleared.');
}
