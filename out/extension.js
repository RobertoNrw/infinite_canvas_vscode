"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
// Constants for configuration and magic numbers
const CANVAS_FILE_EXTENSION = '.canvas';
const SAVE_DEBOUNCE_MS = 200;
const MAX_LOAD_ATTEMPTS = 3;
const WINDOWS_PATH_SEPARATOR = '\\';
const UNIX_PATH_SEPARATOR = '/';
function activate(context) {
    console.log('Infinite Canvas extension is now active!');
    const provider = new CanvasEditorProvider(context.extensionUri);
    const registration = vscode.window.registerCustomEditorProvider('infinite-canvas.canvasEditor', provider);
    const newCanvasCommand = vscode.commands.registerCommand('infinite-canvas.newCanvas', async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Please open a workspace to create a new canvas');
            return;
        }
        const fileName = await vscode.window.showInputBox({
            prompt: 'Enter canvas file name',
            value: 'untitled.canvas',
            validateInput: (value) => {
                if (!value.endsWith(CANVAS_FILE_EXTENSION))
                    return `File must have ${CANVAS_FILE_EXTENSION} extension`;
                return null;
            }
        });
        if (fileName) {
            const filePath = vscode.Uri.joinPath(workspaceFolder.uri, fileName);
            const initialContent = JSON.stringify({ nodes: [], edges: [] }, null, 2);
            await vscode.workspace.fs.writeFile(filePath, Buffer.from(initialContent));
            await vscode.commands.executeCommand('vscode.open', filePath);
        }
    });
    context.subscriptions.push(registration, newCanvasCommand);
}
exports.activate = activate;
function deactivate() { }
exports.deactivate = deactivate;
class CanvasEditorProvider {
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
        this.isSaving = false;
        this.isLoading = false;
        this.loadAttempts = 0;
        this.pendingLoadQueue = [];
    }
    async resolveCustomTextEditor(document, webviewPanel, _token) {
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.extensionUri, 'webview'),
                vscode.Uri.joinPath(this.extensionUri, 'webview', 'src'),
                vscode.Uri.joinPath(this.extensionUri, 'webview', 'public')
            ]
        };
        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);
        // Track message handler to prevent duplicates
        let messageHandlerDisposed = false;
        const messageHandler = webviewPanel.webview.onDidReceiveMessage(async (message) => {
            if (messageHandlerDisposed)
                return; // Prevent handling after dispose
            try {
                switch (message.type) {
                    case 'save':
                        if (this.isSaving) {
                            console.log('⏸️ Save already in progress, skipping');
                            return;
                        }
                        this.isSaving = true;
                        await this.saveDocument(document, message.content);
                        setTimeout(() => { this.isSaving = false; }, SAVE_DEBOUNCE_MS);
                        break;
                    case 'ready':
                        // Send initial canvas content with race condition protection
                        if (!this.isLoading) {
                            this.isLoading = true;
                            webviewPanel.webview.postMessage({
                                type: 'loadContent',
                                content: document.getText()
                            });
                            // Immediately send OpenRouter API key so AI works without user action
                            const apiKey = await this.getOpenRouterApiKey();
                            if (apiKey) {
                                webviewPanel.webview.postMessage({
                                    type: 'openRouterApiKey',
                                    apiKey: apiKey
                                });
                                console.log('🔑 Sent OpenRouter API key to webview on ready');
                            }
                            else {
                                console.log('⚠️  No OpenRouter API key found in settings. User must enter it in the AI config panel.');
                            }
                            // Reset loading state after a short delay
                            setTimeout(() => { this.isLoading = false; }, 100);
                        }
                        else {
                            console.log('⏸️ Ready message received while loading, skipping');
                        }
                        break;
                    case 'loadFile':
                        await this.loadFileContent(webviewPanel, message.filePath, message.nodeId);
                        break;
                    case 'saveFile':
                        await this.saveFileContent(message.filePath, message.content, webviewPanel, message.nodeId);
                        break;
                    case 'createFile':
                        await this.createFile(message.filePath, message.content, webviewPanel);
                        break;
                    // Support both old and new message types for backwards compatibility
                    case 'getOpenRouterApiKey':
                    case 'getGroqApiKey': {
                        const key = await this.getOpenRouterApiKey();
                        if (key) {
                            webviewPanel.webview.postMessage({
                                type: 'openRouterApiKey',
                                apiKey: key
                            });
                        }
                        break;
                    }
                    default:
                        console.warn(`⚠️ Unknown message type: ${message.type}`);
                }
            }
            catch (error) {
                console.error('❌ Error handling message:', error);
                webviewPanel.webview.postMessage({
                    type: 'error',
                    message: `Operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
                });
            }
        });
        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                if (!this.isSaving && !this.isLoading) {
                    // Queue load requests to prevent race conditions
                    this.pendingLoadQueue.push({
                        content: document.getText(),
                        timestamp: Date.now()
                    });
                    // Process queue with debounce
                    if (this.pendingLoadQueue.length === 1) {
                        this.processLoadQueue(webviewPanel);
                    }
                }
            }
        });
        webviewPanel.onDidDispose(() => {
            messageHandlerDisposed = true;
            messageHandler.dispose();
            changeDocumentSubscription.dispose();
            this.pendingLoadQueue = [];
        });
    }
    async processLoadQueue(webviewPanel) {
        while (this.pendingLoadQueue.length > 0) {
            // Wait a bit to allow multiple changes to accumulate
            await new Promise(resolve => setTimeout(resolve, 50));
            // Get the latest content from the queue
            const latest = this.pendingLoadQueue[this.pendingLoadQueue.length - 1];
            this.pendingLoadQueue = [];
            // Only send if we're not currently interacting
            if (!this.isLoading) {
                this.isLoading = true;
                try {
                    webviewPanel.webview.postMessage({
                        type: 'loadContent',
                        content: latest.content
                    });
                }
                finally {
                    this.isLoading = false;
                }
            }
        }
    }
    async saveDocument(document, content) {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), content);
        await vscode.workspace.applyEdit(edit);
    }
    async loadFileContent(webviewPanel, filePath, nodeId) {
        try {
            let fileUri;
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                throw new Error('No workspace folder found');
            }
            // Use cross-platform path normalization
            const normalizedPath = this.normalizeToRelativePath(filePath, workspaceFolder.uri.fsPath);
            fileUri = vscode.Uri.joinPath(workspaceFolder.uri, normalizedPath);
            // Verify file exists before reading
            try {
                await vscode.workspace.fs.stat(fileUri);
            }
            catch (statError) {
                throw new Error(`File not found: ${filePath}`);
            }
            const fileStats = await vscode.workspace.fs.stat(fileUri);
            const fileContent = await vscode.workspace.fs.readFile(fileUri);
            const content = Buffer.from(fileContent).toString('utf8');
            webviewPanel.webview.postMessage({
                type: 'fileContentLoaded',
                nodeId,
                content,
                lastModified: fileStats.mtime
            });
        }
        catch (error) {
            console.error('Error loading file content:', error);
            webviewPanel.webview.postMessage({
                type: 'fileContentError',
                nodeId,
                error: `Failed to load file: ${filePath} - ${error instanceof Error ? error.message : 'Unknown error'}`
            });
        }
    }
    /**
     * Cross-platform path normalization that works on Windows, macOS, and Linux
     */
    normalizeToRelativePath(filePath, workspacePath) {
        // If path doesn't look like an absolute path, return as-is
        if (!filePath.includes('/') && !filePath.includes(WINDOWS_PATH_SEPARATOR)) {
            return filePath;
        }
        // Normalize path separators to forward slashes for comparison
        const normalizedFilePath = filePath.replace(/\\/g, '/');
        const normalizedWorkspacePath = workspacePath.replace(/\\/g, '/');
        // Handle Windows-style paths (e.g., C:/Users/...)
        if (normalizedFilePath.length > 1 && normalizedFilePath[1] === ':') {
            // Remove drive letter for comparison
            const filePathWithoutDrive = normalizedFilePath.substring(2);
            const workspacePathWithoutDrive = normalizedWorkspacePath.substring(2);
            if (filePathWithoutDrive.startsWith(workspacePathWithoutDrive)) {
                return filePathWithoutDrive.substring(workspacePathWithoutDrive.length + 1).replace(/\//g, WINDOWS_PATH_SEPARATOR);
            }
            return filePath;
        }
        // Handle Unix-style paths (e.g., /Users/... or /home/...)
        if (normalizedFilePath.startsWith(normalizedWorkspacePath)) {
            const relativePath = normalizedFilePath.substring(normalizedWorkspacePath.length + 1);
            // Convert back to platform-specific separator
            return process.platform === 'win32'
                ? relativePath.replace(/\//g, WINDOWS_PATH_SEPARATOR)
                : relativePath;
        }
        // Handle macOS Users path without leading slash
        if (normalizedFilePath.startsWith('Users/') || normalizedFilePath.startsWith('Users\\')) {
            const fullPath = '/' + normalizedFilePath;
            if (fullPath.startsWith(normalizedWorkspacePath)) {
                const relativePath = fullPath.substring(normalizedWorkspacePath.length + 1);
                return process.platform === 'win32'
                    ? relativePath.replace(/\//g, WINDOWS_PATH_SEPARATOR)
                    : relativePath;
            }
        }
        return filePath;
    }
    async saveFileContent(filePath, content, webviewPanel, nodeId) {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                throw new Error('No workspace folder found');
            }
            const normalizedPath = this.normalizeToRelativePath(filePath, workspaceFolder.uri.fsPath);
            const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, normalizedPath);
            // Ensure directory exists
            const dirUri = vscode.Uri.joinPath(fileUri, '..');
            try {
                await vscode.workspace.fs.stat(dirUri);
            }
            catch {
                await vscode.workspace.fs.createDirectory(dirUri);
            }
            await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf8'));
            const fileStats = await vscode.workspace.fs.stat(fileUri);
            webviewPanel.webview.postMessage({
                type: 'fileContentSaved',
                nodeId,
                lastModified: fileStats.mtime
            });
        }
        catch (error) {
            console.error('Error saving file content:', error);
            webviewPanel.webview.postMessage({
                type: 'fileContentError',
                nodeId,
                error: `Failed to save file: ${filePath} - ${error instanceof Error ? error.message : 'Unknown error'}`
            });
        }
    }
    async createFile(filePath, content, webviewPanel) {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                throw new Error('No workspace folder found');
            }
            const normalizedPath = this.normalizeToRelativePath(filePath, workspaceFolder.uri.fsPath);
            const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, normalizedPath);
            const dirUri = vscode.Uri.joinPath(fileUri, '..');
            try {
                await vscode.workspace.fs.stat(dirUri);
            }
            catch {
                await vscode.workspace.fs.createDirectory(dirUri);
            }
            await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf8'));
            console.log('✅ File created:', normalizedPath);
            // Notify user of successful creation
            vscode.window.showInformationMessage(`File created: ${normalizedPath}`);
        }
        catch (error) {
            console.error('Error creating file:', error);
            vscode.window.showErrorMessage(`Failed to create file: ${filePath} - ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    getHtmlForWebview(webview) {
        const webviewUri = vscode.Uri.joinPath(this.extensionUri, 'webview');
        const mainScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewUri, 'main.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewUri, 'style.css'));
        const nonce = this.getNonce();
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'unsafe-inline'; connect-src https:; img-src ${webview.cspSource} https: data:;">
    <link href="${styleUri}" rel="stylesheet">
    <title>Infinite Canvas</title>
    <style>
        body { margin:0; padding:0; height:100vh; overflow:hidden; background:#0d0d0f; }
        #canvas-container { width:100%; height:100%; position:relative; }
        canvas { display:block; cursor:grab; background:#0d0d0f; }
        canvas:active { cursor:grabbing; }
    </style>
</head>
<body>
    <div id="canvas-container">
        <canvas id="canvas"></canvas>
    </div>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        window.vsCodeAPI = {
            postMessage: (msg) => vscode.postMessage(msg),
            setState:    (s)   => vscode.setState(s),
            getState:    ()    => vscode.getState()
        };
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'loadContent' && window.loadCanvasContent) {
                window.loadCanvasContent(message.content);
            }
        });
        vscode.postMessage({ type: 'ready' });
    </script>
    <script nonce="${nonce}" type="module" src="${mainScriptUri}"></script>
</body>
</html>`;
    }
    /**
     * Retrieves the OpenRouter API key from VS Code settings.
     * In settings.json use: "infinite-canvas.openRouterApiKey": "sk-or-..."
     * Legacy key name "infinite-canvas.groqApiKey" is also checked for backwards compatibility.
     */
    async getOpenRouterApiKey() {
        try {
            const config = vscode.workspace.getConfiguration('infinite-canvas');
            // Primary key name
            const primaryKey = config.get('openRouterApiKey');
            if (primaryKey && primaryKey.trim())
                return primaryKey.trim();
            // Legacy key name (backwards compatibility)
            const legacyKey = config.get('groqApiKey');
            if (legacyKey && legacyKey.trim())
                return legacyKey.trim();
            // Environment variable fallback
            const envKey = process.env.OPENROUTER_API_KEY ||
                process.env.GROQ_API_KEY ||
                process.env.VITE_GROQ_API_KEY;
            if (envKey && envKey.trim())
                return envKey.trim();
            return null;
        }
        catch (error) {
            console.error('Error retrieving OpenRouter API key:', error);
            return null;
        }
    }
    getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++)
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        return text;
    }
}
CanvasEditorProvider.viewType = 'infinite-canvas.canvasEditor';
//# sourceMappingURL=extension.js.map