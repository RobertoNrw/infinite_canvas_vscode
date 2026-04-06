import * as vscode from 'vscode';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    console.log('Infinite Canvas extension is now active!');

    const provider = new CanvasEditorProvider(context.extensionUri);
    const registration = vscode.window.registerCustomEditorProvider(
        'infinite-canvas.canvasEditor',
        provider
    );

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
                if (!value.endsWith('.canvas')) return 'File must have .canvas extension';
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

export function deactivate() {}

class CanvasEditorProvider implements vscode.CustomTextEditorProvider {
    private static readonly viewType = 'infinite-canvas.canvasEditor';
    private isSaving = false;

    constructor(private readonly extensionUri: vscode.Uri) {}

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.extensionUri, 'webview'),
                vscode.Uri.joinPath(this.extensionUri, 'webview', 'src'),
                vscode.Uri.joinPath(this.extensionUri, 'webview', 'public')
            ]
        };

        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

        webviewPanel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case 'save':
                        this.isSaving = true;
                        await this.saveDocument(document, message.content);
                        setTimeout(() => { this.isSaving = false; }, 200);
                        break;

                    case 'ready':
                        // Send initial canvas content
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
                        } else {
                            console.log('⚠️  No OpenRouter API key found in settings. User must enter it in the AI config panel.');
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
                }
            }
        );

        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                if (!this.isSaving) {
                    webviewPanel.webview.postMessage({
                        type: 'loadContent',
                        content: document.getText()
                    });
                }
            }
        });

        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
        });
    }

    private async saveDocument(document: vscode.TextDocument, content: string): Promise<void> {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(
            document.uri,
            new vscode.Range(0, 0, document.lineCount, 0),
            content
        );
        await vscode.workspace.applyEdit(edit);
    }

    private async loadFileContent(webviewPanel: vscode.WebviewPanel, filePath: string, nodeId: string): Promise<void> {
        try {
            let fileUri: vscode.Uri;
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) throw new Error('No workspace folder found');

            const normalizedPath = this.normalizeToRelativePath(filePath, workspaceFolder.uri.fsPath);
            fileUri = vscode.Uri.joinPath(workspaceFolder.uri, normalizedPath);

            const fileStats = await vscode.workspace.fs.stat(fileUri);
            const fileContent = await vscode.workspace.fs.readFile(fileUri);
            const content = Buffer.from(fileContent).toString('utf8');

            webviewPanel.webview.postMessage({
                type: 'fileContentLoaded',
                nodeId,
                content,
                lastModified: fileStats.mtime
            });
        } catch (error) {
            console.error('Error loading file content:', error);
            webviewPanel.webview.postMessage({
                type: 'fileContentError',
                nodeId,
                error: `Failed to load file: ${filePath}`
            });
        }
    }

    private normalizeToRelativePath(filePath: string, workspacePath: string): string {
        if (!filePath.includes('/') || (!filePath.startsWith('/') && !filePath.startsWith('Users'))) {
            return filePath;
        }
        if (filePath.startsWith('Users')) {
            const fullPath = '/' + filePath;
            if (fullPath.startsWith(workspacePath)) {
                return fullPath.substring(workspacePath.length + 1);
            }
        }
        if (filePath.startsWith('/') && filePath.startsWith(workspacePath)) {
            return filePath.substring(workspacePath.length + 1);
        }
        return filePath;
    }

    private async saveFileContent(filePath: string, content: string, webviewPanel: vscode.WebviewPanel, nodeId: string): Promise<void> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) throw new Error('No workspace folder found');

            const normalizedPath = this.normalizeToRelativePath(filePath, workspaceFolder.uri.fsPath);
            const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, normalizedPath);
            await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf8'));
            const fileStats = await vscode.workspace.fs.stat(fileUri);

            webviewPanel.webview.postMessage({
                type: 'fileContentSaved',
                nodeId,
                lastModified: fileStats.mtime
            });
        } catch (error) {
            console.error('Error saving file content:', error);
            webviewPanel.webview.postMessage({
                type: 'fileContentError',
                nodeId,
                error: `Failed to save file: ${filePath}`
            });
        }
    }

    private async createFile(filePath: string, content: string, webviewPanel: vscode.WebviewPanel): Promise<void> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) throw new Error('No workspace folder found');

            const normalizedPath = this.normalizeToRelativePath(filePath, workspaceFolder.uri.fsPath);
            const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, normalizedPath);
            const dirUri = vscode.Uri.joinPath(fileUri, '..');
            try { await vscode.workspace.fs.stat(dirUri); }
            catch { await vscode.workspace.fs.createDirectory(dirUri); }

            await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf8'));
            console.log('✅ File created:', normalizedPath);
        } catch (error) {
            console.error('Error creating file:', error);
            vscode.window.showErrorMessage(`Failed to create file: ${filePath}`);
        }
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
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
    private async getOpenRouterApiKey(): Promise<string | null> {
        try {
            const config = vscode.workspace.getConfiguration('infinite-canvas');

            // Primary key name
            const primaryKey = config.get<string>('openRouterApiKey');
            if (primaryKey && primaryKey.trim()) return primaryKey.trim();

            // Legacy key name (backwards compatibility)
            const legacyKey = config.get<string>('groqApiKey');
            if (legacyKey && legacyKey.trim()) return legacyKey.trim();

            // Environment variable fallback
            const envKey = process.env.OPENROUTER_API_KEY ||
                           process.env.GROQ_API_KEY ||
                           process.env.VITE_GROQ_API_KEY;
            if (envKey && envKey.trim()) return envKey.trim();

            return null;
        } catch (error) {
            console.error('Error retrieving OpenRouter API key:', error);
            return null;
        }
    }

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
        return text;
    }
}
