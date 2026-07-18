import * as vscode from "vscode";

import {
  ExtensionToWebviewMessage,
  Scope,
  WebviewToExtensionMessage,
} from "./types";

import { StorageService } from "./StorageService";

const ACTIVE_SCOPE_KEY = "mydevnotes.activeScope";

function isScope(value: unknown): value is Scope {
  return value === "project" || value === "global";
}

export class ViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "mydevnotes.mainView";
  private view?: vscode.WebviewView;
  private activeScope: Scope;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly storage: StorageService,
    private readonly globalState: vscode.Memento,
    private readonly onStateChanged: () => void,
  ) {
    const storedScope = this.globalState.get<Scope>(
      ACTIVE_SCOPE_KEY,
      "project",
    );
    this.activeScope = isScope(storedScope) ? storedScope : "project";
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      (message: WebviewToExtensionMessage) => {
        this.handleMessage(message);
      },
    );

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.sendStateToWebview();
      }
    });
  }

  public refreshWebview(): void {
    this.sendStateToWebview();
  }

  public reveal(): void {
    vscode.commands.executeCommand("mydevnotes.mainView.focus");
  }

  public postMessageToWebview(message: ExtensionToWebviewMessage): void {
    this.view?.webview.postMessage(message);
  }

  private handleMessage(message: WebviewToExtensionMessage): void {
    switch (message.type) {
      case "ready":
        this.sendStateToWebview();
        break;
      case "setActiveScope":
        this.activeScope = message.scope;
        this.globalState.update(ACTIVE_SCOPE_KEY, message.scope);
        this.sendStateToWebview();
        break;
      case "setCurrentTask":
        this.storage.setCurrentTask(message.id);
        this.onStateChanged();
        break;
      case "addTodo":
        this.storage.addTodo(message.scope, message.text, message.groupId);
        this.onStateChanged();
        break;
      case "toggleTodo":
        this.storage.toggleTodo(message.scope, message.id);
        this.onStateChanged();
        break;
      case "deleteTodo":
        this.storage.deleteTodo(message.scope, message.id);
        this.onStateChanged();
        break;
      case "editTodo":
        this.storage.editTodo(message.scope, message.id, message.text);
        this.onStateChanged();
        break;
      case "reorderTodo":
        this.storage.reorderTodo(
          message.scope,
          message.id,
          message.newGroupId,
          message.newSortOrder,
        );
        this.onStateChanged();
        break;
      case "snoozeTodo":
        this.storage.snoozeTodo(message.scope, message.id, message.until);
        this.onStateChanged();
        break;
      case "unsnoozeTodo":
        this.storage.unsnoozeTodo(message.scope, message.id);
        this.onStateChanged();
        break;
      case "addGroup":
        this.storage.addGroup(message.scope, message.name);
        this.onStateChanged();
        break;
      case "renameGroup":
        this.storage.renameGroup(message.scope, message.id, message.name);
        this.onStateChanged();
        break;
      case "deleteGroup":
        this.storage.deleteGroup(message.scope, message.id);
        this.onStateChanged();
        break;
      case "reorderGroup":
        this.storage.reorderGroup(
          message.scope,
          message.id,
          message.newSortOrder,
        );
        this.onStateChanged();
        break;
      case "toggleGroupCollapse":
        this.storage.toggleGroupCollapse(message.scope, message.id);
        this.onStateChanged();
        break;
      case "restoreTodo":
        this.storage.restoreTodo(message.scope, message.id);
        this.onStateChanged();
        break;
      case "addNote":
        this.storage.addNote(message.scope, message.content);
        this.onStateChanged();
        break;
      case "editNote":
        this.storage.editNote(message.scope, message.id, message.content);
        this.onStateChanged();
        break;
      case "deleteNote":
        this.storage.deleteNote(message.scope, message.id);
        this.onStateChanged();
        break;
      case "reorderNote":
        this.storage.reorderNote(
          message.scope,
          message.id,
          message.newSortOrder,
        );
        this.onStateChanged();
        break;
    }
  }

  private sendStateToWebview(): void {
    if (!this.view) {
      return;
    }
    const state = this.storage.getWebviewState(this.activeScope);
    const message: ExtensionToWebviewMessage = { type: "stateUpdate", state };
    this.view.webview.postMessage(message);
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "out", "webview.js"),
    );
    const styleResetUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "reset.css"),
    );
    const styleVSCodeUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "vscode.css"),
    );
    const styleCodiconsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        "media",
        "codicons",
        "codicon.css",
      ),
    );
    const styleMainUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "main.css"),
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src ${webview.cspSource} data: blob:; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleResetUri}" rel="stylesheet">
  <link href="${styleVSCodeUri}" rel="stylesheet">
  <link href="${styleCodiconsUri}" rel="stylesheet">
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
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
