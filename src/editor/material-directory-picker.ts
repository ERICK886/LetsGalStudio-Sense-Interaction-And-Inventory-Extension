import type { ExtensionContext } from "@avg-studio/sdk";
import { connectMaterialRoot } from "./material-storage";
import type { MaterialManifest } from "./material-library";

interface OsApi { platform(): string; }
interface ProcessApi { env: { SystemRoot?: string }; }
interface PathApi { join(...parts: string[]): string; }
interface BufferApi {
  Buffer: { from(value: string, encoding: string): { toString(encoding: string): string } };
}
interface ChildProcessApi {
  execFile(
    file: string, args: string[], options: { windowsHide: boolean; encoding: "utf8"; maxBuffer: number },
    callback: (error: unknown, stdout: string, stderr: string) => void,
  ): unknown;
}

export function canPickMaterialDirectory(ctx: ExtensionContext): boolean {
  try { return ctx.native.node.require<OsApi>("node:os").platform() === "win32"; }
  catch { return false; }
}

/** 使用 Windows 自带文件夹窗口；路径编码为数据，绝不作为 PowerShell 代码执行。 */
export async function pickMaterialDirectory(ctx: ExtensionContext, initialDirectory = ""): Promise<string | null> {
  if (!canPickMaterialDirectory(ctx)) throw new Error("当前环境不支持文件夹选择，请手动填写扩展源目录");
  const { Buffer } = ctx.native.node.require<BufferApi>("node:buffer");
  const initial = Buffer.from(initialDirectory, "utf8").toString("base64");
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$picker = New-Object System.Windows.Forms.FolderBrowserDialog
$owner = New-Object System.Windows.Forms.Form
try {
  $picker.Description = '请选择包含 extension.json 的扩展源目录'
  $picker.ShowNewFolderButton = $false
  $initial = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${initial}'))
  if ([System.IO.Directory]::Exists($initial)) { $picker.SelectedPath = $initial }
  $owner.TopMost = $true
  [void]$owner.Handle
  if ($picker.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::Write([Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($picker.SelectedPath)))
  }
} finally {
  $picker.Dispose()
  $owner.Dispose()
}
`;
  const process = ctx.native.node.require<ProcessApi>("node:process");
  const path = ctx.native.node.require<PathApi>("node:path");
  const powershell = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const child = ctx.native.node.require<ChildProcessApi>("node:child_process");
  return new Promise((resolve, reject) => {
    child.execFile(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-STA", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
      { windowsHide: true, encoding: "utf8", maxBuffer: 64 * 1024 }, (error, stdout) => {
        if (error) { reject(new Error("无法打开系统文件夹选择窗口，请手动填写扩展源目录")); return; }
        const result = stdout.trim();
        if (!result) { resolve(null); return; }
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(result)) { reject(new Error("文件夹选择结果无效")); return; }
        resolve(Buffer.from(result, "base64").toString("utf8"));
      });
  });
}

/** 选中后复用原有目录和扩展 ID 校验；取消不读写文件。 */
export async function selectMaterialRoot(
  ctx: ExtensionContext, initialDirectory = "",
): Promise<{ root: string; manifest: MaterialManifest } | null> {
  const selected = await pickMaterialDirectory(ctx, initialDirectory);
  return selected ? connectMaterialRoot(ctx, selected) : null;
}
