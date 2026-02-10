import * as vscode from 'vscode';
import { TodoStorageService } from './TodoStorageService';
import { WebviewToExtensionMessage, ExtensionToWebviewMessage } from './types';

export class TodoViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'mytodos.todoView';
  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly storage: TodoStorageService
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message: WebviewToExtensionMessage) => {
      this.handleMessage(message);
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.sendStateToWebview();
      }
    });
  }

  public refreshWebview(): void {
    this.sendStateToWebview();
  }

  public postMessageToWebview(message: ExtensionToWebviewMessage): void {
    this.view?.webview.postMessage(message);
  }

  private handleMessage(message: WebviewToExtensionMessage): void {
    switch (message.type) {
      case 'ready':
        this.sendStateToWebview();
        break;
      case 'addTodo':
        this.storage.addTodo(message.text, message.groupId);
        this.sendStateToWebview();
        break;
      case 'toggleTodo':
        this.storage.toggleTodo(message.id);
        this.sendStateToWebview();
        break;
      case 'deleteTodo':
        this.storage.deleteTodo(message.id);
        this.sendStateToWebview();
        break;
      case 'editTodo':
        this.storage.editTodo(message.id, message.text);
        this.sendStateToWebview();
        break;
      case 'reorderTodo':
        this.storage.reorderTodo(message.id, message.newGroupId, message.newSortOrder);
        this.sendStateToWebview();
        break;
      case 'addGroup':
        this.storage.addGroup(message.name);
        this.sendStateToWebview();
        break;
      case 'renameGroup':
        this.storage.renameGroup(message.id, message.name);
        this.sendStateToWebview();
        break;
      case 'deleteGroup':
        this.storage.deleteGroup(message.id);
        this.sendStateToWebview();
        break;
      case 'reorderGroup':
        this.storage.reorderGroup(message.id, message.newSortOrder);
        this.sendStateToWebview();
        break;
      case 'toggleGroupCollapse':
        this.storage.toggleGroupCollapse(message.id);
        this.sendStateToWebview();
        break;
      case 'restoreTodo':
        this.storage.restoreTodo(message.id);
        this.sendStateToWebview();
        break;
    }
  }

  private sendStateToWebview(): void {
    if (!this.view) { return; }
    const state = this.storage.getWebviewState();
    const message: ExtensionToWebviewMessage = { type: 'stateUpdate', state };
    this.view.webview.postMessage(message);
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'main.js')
    );
    const styleResetUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'reset.css')
    );
    const styleVSCodeUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'vscode.css')
    );
    const styleMainUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'main.css')
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleResetUri}" rel="stylesheet">
  <link href="${styleVSCodeUri}" rel="stylesheet">
  <link href="${styleMainUri}" rel="stylesheet">
  <title>My TODOs</title>
</head>
<body>
  <div id="app">
    <div id="add-section">
      <div id="add-row">
        <input type="text" id="todo-input" placeholder="What needs to be done?" />
        <button id="add-btn" title="Add TODO"></button>
      </div>
      <div id="add-options">
        <select id="group-select"><option value="">Ungrouped</option></select>
      </div>
    </div>
    <div id="ungrouped-container">
      <div id="ungrouped-list" class="todo-list" data-group-id=""></div>
    </div>
    <div id="groups-container"></div>
    <details id="archive-section">
      <summary><span class="archive-chevron">&#9654;</span><span class="archive-label">Completed</span> <span id="archive-count" class="archive-badge">0</span></summary>
      <div id="archive-list"></div>
    </details>
    <div id="group-management">
      <input type="text" id="group-input" placeholder="New group name..." />
      <button id="add-group-btn">+ Group</button>
    </div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
