import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { TodoViewProvider } from './TodoViewProvider';
import { TodoStorageService } from './TodoStorageService';

export function activate(context: vscode.ExtensionContext) {
  const storage = new TodoStorageService(context.workspaceState);

  // Set up file-based sync for MCP server access
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (workspaceFolder) {
    const filePath = path.join(workspaceFolder.uri.fsPath, '.vscode', '.mytodos.json');
    storage.setFilePath(filePath);

    // Watch for external changes (from MCP server)
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(workspaceFolder, '.vscode/.mytodos.json')
    );

    watcher.onDidChange(() => {
      if (storage.isWriting) { return; }
      if (storage.loadFromFile()) {
        provider.refreshWebview();
      }
    });

    watcher.onDidCreate(() => {
      if (storage.isWriting) { return; }
      if (storage.loadFromFile()) {
        provider.refreshWebview();
      }
    });

    context.subscriptions.push(watcher);

    // Handle MCP auto-registration
    handleMcpAutoRegister(context, workspaceFolder.uri.fsPath);
  }

  // Clean up archived items older than 7 days
  storage.cleanupExpiredArchive();

  const provider = new TodoViewProvider(context.extensionUri, storage);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      TodoViewProvider.viewType,
      provider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mytodos.addTodo', () => {
      provider.postMessageToWebview({ type: 'focusAddInput' });
    })
  );

  // Periodic archive cleanup every 30 minutes
  const cleanupInterval = setInterval(() => {
    storage.cleanupExpiredArchive();
    provider.refreshWebview();
  }, 30 * 60 * 1000);

  context.subscriptions.push({ dispose: () => clearInterval(cleanupInterval) });
}

export function deactivate() {}

function handleMcpAutoRegister(context: vscode.ExtensionContext, workspacePath: string): void {
  const config = vscode.workspace.getConfiguration('mytodos');
  const setting = config.get<string>('mcpAutoRegister', 'ask');

  if (setting === 'disabled') { return; }

  if (setting === 'ask') {
    // First time — ask the user
    vscode.window.showInformationMessage(
      'My TODOs: Enable MCP server for AI agents (e.g. Claude Code)?',
      'Enable',
      'No thanks'
    ).then(choice => {
      if (choice === 'Enable') {
        config.update('mcpAutoRegister', 'enabled', vscode.ConfigurationTarget.Global);
        registerMcpServer(context, workspacePath);
      } else if (choice === 'No thanks') {
        config.update('mcpAutoRegister', 'disabled', vscode.ConfigurationTarget.Global);
      }
      // If dismissed (undefined), ask again next time
    });
    return;
  }

  if (setting === 'enabled') {
    registerMcpServer(context, workspacePath);
  }
}

function registerMcpServer(context: vscode.ExtensionContext, _workspacePath: string): void {
  const mcpServerPath = path.join(context.extensionPath, 'out', 'mcp-server.js');
  if (!fs.existsSync(mcpServerPath)) { return; }

  // Register globally in ~/.claude.json so it works in all workspaces.
  // The MCP server uses process.cwd() to find .vscode/.mytodos.json,
  // and Claude Code sets cwd to the workspace root automatically.
  const claudeJsonPath = path.join(os.homedir(), '.claude.json');

  try {
    let config: any = {};
    if (fs.existsSync(claudeJsonPath)) {
      config = JSON.parse(fs.readFileSync(claudeJsonPath, 'utf-8'));
    }

    // Check if already registered with the correct path
    const existing = config.mcpServers?.mytodos;
    if (existing && existing.args?.[0] === mcpServerPath) { return; }

    // Register / update
    if (!config.mcpServers) { config.mcpServers = {}; }
    config.mcpServers.mytodos = {
      command: 'node',
      args: [mcpServerPath],
    };

    fs.writeFileSync(claudeJsonPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch { /* ignore */ }
}
