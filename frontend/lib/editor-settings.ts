export type EditorSettings = {
  aiAssistant?: boolean;
  autoIndent?: boolean;
  tabSize?: number;
  fontSize?: number;
  fontFamily?: string;
  minimap?: boolean;
  formatOnType?: boolean;
  formatOnPaste?: boolean;
  insertSpaces?: boolean;
};

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  aiAssistant: true,
  autoIndent: true,
  tabSize: 2,
  fontSize: 13,
  fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, Monaco, monospace',
  minimap: false,
  formatOnType: true,
  formatOnPaste: true,
  insertSpaces: true,
};
