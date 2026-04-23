// AI Service Module for VS Code Extension
// Using OpenRouter for AI model access (supports Perplexity, Qwen, Claude, GPT, Gemini, etc.)

export function getProviderName(baseURL) {
    if (baseURL && baseURL.includes('perplexity')) return 'Perplexity';
    if (baseURL && baseURL.includes('anthropic')) return 'Anthropic';
    return 'OpenRouter';
}

export function getErrorMessage(error) {
    let errorMessage = 'Failed to generate AI ideas. ';
    const errorString = error.message || JSON.stringify(error) || '';

    if (errorString.includes('No auth credentials found') || errorString.includes('401')) {
        errorMessage += 'Authentication failed. Please check your API key in the AI config panel.';
    } else if (errorString.includes('API key')) {
        errorMessage += 'API key issue. Please enter your OpenRouter API key in the AI config panel.';
    } else if (errorString.includes('quota') || errorString.includes('insufficient_quota')) {
        errorMessage += 'API quota exceeded. Please check your account limits at openrouter.ai.';
    } else if (errorString.includes('network') || errorString.includes('fetch')) {
        errorMessage += 'Network error. Please check your internet connection and try again.';
    } else if (errorString.includes('unauthorized')) {
        errorMessage += 'Unauthorized. Please verify your API key in the AI config panel.';
    } else if (errorString.includes('429') || errorString.includes('rate limit')) {
        errorMessage += 'Rate limit exceeded. Please wait a moment and try again.';
    } else if (errorString.includes('model') && errorString.includes('not found')) {
        errorMessage += 'Model not available. Please check your model names in the config panel.';
    } else {
        errorMessage += errorString || 'Unknown error occurred.';
    }

    return errorMessage;
}

// ============================================================================
// API KEY MANAGEMENT
// Secure multi-source: localStorage (UI panel) > VS Code config > env variables
// IMPORTANT: API keys are NEVER sent directly to webview - all API calls go through extension host
// Supported providers via OpenRouter: Claude, GPT, Gemini, Qwen, Perplexity, Grok, DeepSeek
// ============================================================================

let _cachedApiKey = null;

function getApiKey() {
    // 1. Always prefer what the user typed in the UI panel
    const lsKey = localStorage.getItem('ai-api-key');
    if (lsKey && lsKey.trim()) return lsKey.trim();

    // 2. Fallback to key received from VS Code extension (settings.json)
    if (_cachedApiKey && _cachedApiKey.trim()) return _cachedApiKey.trim();

    return null;
}

// Request the API key from the VS Code extension host on load
// Extension sends it back as 'openRouterApiKey' message (fixed from old 'groqApiKey')
if (typeof window !== 'undefined' && window.vsCodeAPI) {
    try {
        window.vsCodeAPI.postMessage({ type: 'getOpenRouterApiKey' });
    } catch (e) {
        console.warn('Could not request API key from VS Code host:', e);
    }
}

// Listen for the API key response from the extension
if (typeof window !== 'undefined') {
    window.addEventListener('message', event => {
        const message = event.data;
        // Handle BOTH old ('groqApiKey') and new ('openRouterApiKey') message types for compatibility
        if (message.type === 'openRouterApiKey' || message.type === 'groqApiKey') {
            if (message.apiKey) {
                _cachedApiKey = message.apiKey;
                // Also persist to localStorage so UI panel is in sync
                if (!localStorage.getItem('ai-api-key')) {
                    localStorage.setItem('ai-api-key', message.apiKey);
                }
                console.log('🔑 API key received from VS Code extension and cached');
            }
        }
    });
}

// ============================================================================
// MAIN AI GENERATION FUNCTION
// Supports any OpenAI-compatible endpoint (OpenRouter, Perplexity, Anthropic direct, etc.)
// ============================================================================

export async function generateAIIdeasGroq(
    selectedNodeText,
    connectedNodes = [],
    model = 'anthropic/claude-3.5-sonnet',
    fileContent = null
) {
    console.log('🎯 generateAIIdeas called');
    console.log('🤖 Model:', model);

    const baseUrl = (localStorage.getItem('ai-base-url') || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
    const apiKey  = getApiKey();

    console.log('🌐 Endpoint:', baseUrl);

    if (!apiKey) {
        throw new Error(
            'No API key configured. Please enter your OpenRouter API key in the AI config panel ' +
            '(click the ⚙️ button, then "AI Configuration").'
        );
    }

    // Build message history from ancestor nodes
    const messages = [];

    if (connectedNodes && connectedNodes.length > 0) {
        connectedNodes.forEach(node => {
            let nodeContent = null;
            if (node.loadedContent && typeof node.loadedContent === 'string' && node.loadedContent.trim()) {
                const label = node.text || node.file || node.fullPath || 'file';
                nodeContent = `File: ${label}\n\nContent:\n${node.loadedContent.trim()}`;
            } else if (node.text && node.text.trim()) {
                nodeContent = node.text.trim();
            } else if (node.file && node.file.trim()) {
                nodeContent = node.file.trim();
            } else if (node.fullPath && node.fullPath.trim()) {
                nodeContent = node.fullPath.trim();
            }
            if (nodeContent) {
                messages.push({ role: 'user', content: nodeContent });
            }
        });
    }

    // Current node content
    let content = selectedNodeText || 'Generate ideas';
    if (fileContent && fileContent.trim()) {
        content = `${selectedNodeText || 'Analyze file'}\n\nFile content:\n${fileContent}`;
    }
    if (!content || !content.trim()) content = 'Generate creative ideas';

    messages.push({ role: 'user', content });

    console.log('💬 Sending', messages.length, 'message(s) to', model);

    try {
        const apiUrl = `${baseUrl}/chat/completions`;

        const headers = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        };

        // OpenRouter-specific headers (ignored by other providers)
        if (baseUrl.includes('openrouter.ai')) {
            headers['HTTP-Referer'] = 'https://vscode-infinite-canvas.com';
            headers['X-Title'] = 'VS Code Infinite Canvas';
        }

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model,
                messages,
                temperature: 0.7,
                max_tokens: 2048,
            })
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`HTTP ${response.status}: ${errText || response.statusText}`);
        }

        const data = await response.json();
        const responseText = data?.choices?.[0]?.message?.content;

        if (!responseText || !responseText.trim()) {
            throw new Error('AI returned an empty response. Try a different model or rephrasing your prompt.');
        }

        console.log('✅ AI response received (', responseText.length, 'chars )');
        return [responseText.trim()]; // Always return as single-element array = one child node

    } catch (apiError) {
        console.error('❌ AI API Error:', apiError.message);
        throw apiError;
    }
}

// ============================================================================
// PUBLIC HELPERS
// ============================================================================

export function setOpenRouterApiKey(apiKey) {
    _cachedApiKey = apiKey;
    if (apiKey) localStorage.setItem('ai-api-key', apiKey);
    console.log('🔑 API key set programmatically');
}

// Expose globally for UI panel access
if (typeof window !== 'undefined') {
    window.setOpenRouterApiKey = setOpenRouterApiKey;
}

// ============================================================================
// SUGGESTED MODEL PRESETS
// Use these in the AI config panel "Models" field (comma-separated)
// All available via OpenRouter: https://openrouter.ai/models
// ============================================================================
export const MODEL_PRESETS = {
    fast: [
        'google/gemini-2.0-flash-001',
        'anthropic/claude-3.5-haiku',
        'openai/gpt-4o-mini',
    ],
    powerful: [
        'anthropic/claude-sonnet-4-5',
        'google/gemini-2.5-pro',
        'openai/gpt-4o',
        'x-ai/grok-3',
    ],
    reasoning: [
        'qwen/qwen3-235b-a22b-thinking',
        'anthropic/claude-opus-4-5',
        'google/gemini-2.5-pro',
        'tngtech/deepseek-r1t2-chimera:free',
    ],
    free: [
        'tngtech/deepseek-r1t2-chimera:free',
        'google/gemini-2.0-flash-thinking-exp:free',
        'meta-llama/llama-4-maverick:free',
    ]
};
