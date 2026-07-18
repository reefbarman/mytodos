// Re-export shared types for webview usage
export type {
  Scope,
  TodoItem,
  TodoGroup,
  NoteItem,
  WebviewState,
} from "../src/types";

// VS Code API type for webview
export interface VSCodeApi {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
}

declare global {
  function acquireVsCodeApi(): VSCodeApi;
}
