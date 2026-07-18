import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

import { StorageService } from "./StorageService";
import { ViewProvider } from "./ViewProvider";

const MAX_WAKE_DELAY_MS = 24 * 60 * 60 * 1000;

export function activate(context: vscode.ExtensionContext) {
  const storage = new StorageService(
    context.workspaceState,
    context.globalState,
  );
  let provider: ViewProvider;
  let wakeTimer: ReturnType<typeof setTimeout> | undefined;

  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBar.command = "mydevnotes.reveal";
  context.subscriptions.push(statusBar);

  const armWakeTimer = () => {
    if (wakeTimer) {
      clearTimeout(wakeTimer);
      wakeTimer = undefined;
    }
    const nextWakeTime = storage.getNextWakeTime();
    if (!nextWakeTime) {
      return;
    }
    const delay = Math.max(
      0,
      Math.min(nextWakeTime - Date.now(), MAX_WAKE_DELAY_MS),
    );
    wakeTimer = setTimeout(() => {
      refreshAll();
    }, delay);
  };

  const updateStatusBar = () => {
    const currentTask = storage.getCurrentTask();
    if (!currentTask) {
      statusBar.hide();
      return;
    }
    const text = currentTask.text.replace(/\s+/g, " ").trim();
    const truncated = text.length > 40 ? `${text.slice(0, 37)}…` : text;
    statusBar.text = `$(pin) ${truncated}`;
    statusBar.tooltip = `Current task: ${text}`;
    statusBar.show();
  };

  const refreshAll = () => {
    provider?.refreshWebview();
    updateStatusBar();
    armWakeTimer();
  };

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (workspaceFolder) {
    const workspacePath = workspaceFolder.uri.fsPath;

    // Migrate old .vscode/.mytodos.json if it exists
    const oldFilePath = path.join(workspacePath, ".vscode", ".mytodos.json");
    if (fs.existsSync(oldFilePath)) {
      storage.setWorkspacePath(workspacePath);
      storage.importOldFile(oldFilePath);
    } else {
      storage.setWorkspacePath(workspacePath);
    }

    // Watch for external changes to the global data file (from MCP server)
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(
        vscode.Uri.file(path.dirname(storage.globalFilePath)),
        "data.json",
      ),
    );

    watcher.onDidChange(() => {
      if (storage.isWriting) {
        return;
      }
      if (storage.loadFromFile()) {
        refreshAll();
      }
    });

    watcher.onDidCreate(() => {
      if (storage.isWriting) {
        return;
      }
      if (storage.loadFromFile()) {
        refreshAll();
      }
    });

    context.subscriptions.push(watcher);

    // Handle MCP auto-registration
    handleMcpAutoRegister(context, workspacePath);
  }

  provider = new ViewProvider(
    context.extensionUri,
    storage,
    context.globalState,
    refreshAll,
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("mydevnotes.addTodo", () => {
      provider.postMessageToWebview({ type: "focusAddInput" });
    }),
    vscode.commands.registerCommand("mydevnotes.focusSearch", () => {
      provider.postMessageToWebview({ type: "focusSearch" });
    }),
    vscode.commands.registerCommand("mydevnotes.reveal", () => {
      vscode.commands.executeCommand("mydevnotes.mainView.focus");
    }),
  );

  // Clean up archived items older than 7 days
  storage.cleanupExpiredArchive();
  refreshAll();

  // Periodic archive cleanup every 30 minutes
  const cleanupInterval = setInterval(
    () => {
      storage.cleanupExpiredArchive();
      refreshAll();
    },
    30 * 60 * 1000,
  );

  context.subscriptions.push(
    { dispose: () => clearInterval(cleanupInterval) },
    { dispose: () => wakeTimer && clearTimeout(wakeTimer) },
  );
}

export function deactivate() {}

function handleMcpAutoRegister(
  context: vscode.ExtensionContext,
  workspacePath: string,
): void {
  const config = vscode.workspace.getConfiguration("mydevnotes");
  const setting = config.get<string>("mcpAutoRegister", "ask");

  if (setting === "disabled") {
    return;
  }

  if (setting === "ask") {
    // First time — ask the user
    vscode.window
      .showInformationMessage(
        "My Dev Notes: Enable MCP server for AI agents (e.g. Claude Code)?",
        "Enable",
        "No thanks",
      )
      .then((choice) => {
        if (choice === "Enable") {
          config.update(
            "mcpAutoRegister",
            "enabled",
            vscode.ConfigurationTarget.Global,
          );
          registerMcpServer(context, workspacePath);
        } else if (choice === "No thanks") {
          config.update(
            "mcpAutoRegister",
            "disabled",
            vscode.ConfigurationTarget.Global,
          );
        }
        // If dismissed (undefined), ask again next time
      });
    return;
  }

  if (setting === "enabled") {
    registerMcpServer(context, workspacePath);
  }
}

function registerMcpServer(
  context: vscode.ExtensionContext,
  _workspacePath: string,
): void {
  const mcpServerPath = path.join(
    context.extensionPath,
    "out",
    "mcp-server.js",
  );
  if (!fs.existsSync(mcpServerPath)) {
    return;
  }

  const claudeJsonPath = path.join(os.homedir(), ".claude.json");

  try {
    let config: any = {};
    if (fs.existsSync(claudeJsonPath)) {
      config = JSON.parse(fs.readFileSync(claudeJsonPath, "utf-8"));
    }

    // Check if already registered with the correct path
    const existing = config.mcpServers?.mydevnotes;
    if (existing && existing.args?.[0] === mcpServerPath) {
      return;
    }

    // Register / update
    if (!config.mcpServers) {
      config.mcpServers = {};
    }
    config.mcpServers.mydevnotes = {
      command: "node",
      args: [mcpServerPath],
    };

    // Clean up old mytodos entry if present
    if (config.mcpServers.mytodos) {
      delete config.mcpServers.mytodos;
    }

    fs.writeFileSync(claudeJsonPath, JSON.stringify(config, null, 2), "utf-8");
  } catch {
    /* ignore */
  }
}
