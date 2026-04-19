import * as vscode from 'vscode';
import { StorageService } from './StorageService';
import { WebviewToExtensionMessage, ExtensionToWebviewMessage } from './types';

export class ViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'mydevnotes.mainView';
  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly storage: StorageService
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
      case 'addNote':
        this.storage.addNote(message.content);
        this.sendStateToWebview();
        break;
      case 'editNote':
        this.storage.editNote(message.id, message.content);
        this.sendStateToWebview();
        break;
      case 'deleteNote':
        this.storage.deleteNote(message.id);
        this.sendStateToWebview();
        break;
      case 'reorderNote':
        this.storage.reorderNote(message.id, message.newSortOrder);
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
      vscode.Uri.joinPath(this.extensionUri, 'out', 'webview.js')
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
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleResetUri}" rel="stylesheet">
  <link href="${styleVSCodeUri}" rel="stylesheet">
  <link href="${styleMainUri}" rel="stylesheet">
  <title>My Dev Notes</title>
</head>
<body>
  <div id="root"></div>
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
