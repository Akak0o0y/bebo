$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class BeboNative {
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [StructLayout(LayoutKind.Sequential)] public struct MouseInput { public int x,y; public uint data,flags,time; public UIntPtr extra; }
 [StructLayout(LayoutKind.Sequential)] public struct KeyInput { public ushort key,scan; public uint flags,time; public UIntPtr extra; }
 [StructLayout(LayoutKind.Explicit)] public struct InputData { [FieldOffset(0)] public MouseInput mouse; [FieldOffset(0)] public KeyInput keyboard; }
 [StructLayout(LayoutKind.Sequential)] public struct Input { public uint type; public InputData data; }
 [DllImport("user32.dll",SetLastError=true)] static extern uint SendInput(uint count,Input[] inputs,int size);
 [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
 [DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber();
 static void Submit(Input[] inputs) { if(SendInput((uint)inputs.Length,inputs,Marshal.SizeOf(typeof(Input))) != inputs.Length) throw new Exception("Windows did not accept the input. Check the target app and its permission level."); }
 public static void Keys(byte[] keys) {
  // Down and up events enter the input queue together. Killing the helper cannot
  // interrupt a PowerShell sleep with Ctrl/Alt/Win still held down.
  foreach(int modifier in new int[]{16,17,18,91,92}) if((GetAsyncKeyState(modifier)&0x8000)!=0) throw new Exception("Release held modifier keys before Bebo sends keyboard input.");
  var inputs=new Input[keys.Length*2];
  for(int i=0;i<keys.Length;i++){inputs[i].type=1;inputs[i].data.keyboard.key=keys[i];int end=inputs.Length-i-1;inputs[end].type=1;inputs[end].data.keyboard.key=keys[i];inputs[end].data.keyboard.flags=2;}
  Submit(inputs);
 }
 public static void Click() { var inputs=new Input[2];inputs[0].data.mouse.flags=2;inputs[1].data.mouse.flags=4;Submit(inputs); }
 public static void Scroll(uint amount) { var inputs=new Input[1];inputs[0].data.mouse.flags=0x0800;inputs[0].data.mouse.data=amount;Submit(inputs); }
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
 public delegate bool EnumWindowProc(IntPtr hwnd, IntPtr data);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowProc proc, IntPtr data);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd, System.Text.StringBuilder text, int count);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hwnd, System.Text.StringBuilder text, int count);
 [DllImport("user32.dll", SetLastError=true)] public static extern bool PostMessage(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
 public class WindowInfo { public string id, title, windowClass; public uint pid; public bool foreground; }
 public static WindowInfo[] Windows() {
  var result=new System.Collections.Generic.List<WindowInfo>(); var front=GetForegroundWindow();
  EnumWindows((hwnd,data)=>{ if(IsWindowVisible(hwnd)) { var text=new System.Text.StringBuilder(512); GetWindowText(hwnd,text,512); if(text.Length>0){uint processId;GetWindowThreadProcessId(hwnd,out processId);var klass=new System.Text.StringBuilder(256);GetClassName(hwnd,klass,256);result.Add(new WindowInfo{id=hwnd.ToInt64().ToString(),title=text.ToString(),windowClass=klass.ToString(),pid=processId,foreground=hwnd==front});} } return result.Count<80; },IntPtr.Zero);
  return result.ToArray();
 }
}
'@
[void][BeboNative]::SetProcessDPIAware()
function Get-BeboWindows {
 @([BeboNative]::Windows() | ForEach-Object {
  $windowInfo = $_; $processInfo = Get-Process -Id $windowInfo.pid -ErrorAction SilentlyContinue
  $started = ''; try { $started = $processInfo.StartTime.ToUniversalTime().Ticks.ToString() } catch {}
  $protectedReason = ''
  if ([int]$windowInfo.pid -in @($request.protectedPids)) { $protectedReason = 'Bebo owns this window.' }
  elseif ($windowInfo.windowClass -eq '#32770') { $protectedReason = 'Application dialog; handle any unsaved-work decision on screen.' }
  elseif ($windowInfo.windowClass -in @('Progman','WorkerW','Shell_TrayWnd','Shell_SecondaryTrayWnd','Windows.UI.Core.CoreWindow')) { $protectedReason = 'Windows desktop or system surface.' }
  elseif ($processInfo.ProcessName -in @('dwm','csrss','winlogon','LogonUI','LockApp','ShellExperienceHost','StartMenuExperienceHost','SearchHost','SearchApp','TextInputHost','ApplicationFrameHost')) { $protectedReason = 'Windows system surface.' }
  elseif (!$processInfo -or !$started) { $protectedReason = 'Window owner could not be verified.' }
  @{id=$windowInfo.id;title=$windowInfo.title;pid=$windowInfo.pid;app=$processInfo.ProcessName;processStarted=$started;windowClass=$windowInfo.windowClass;foreground=$windowInfo.foreground;closable=(!$protectedReason);protectedReason=$protectedReason}
 })
}
if ($request.op -eq 'inspect') {
 $windows = @(Get-BeboWindows)
 @{windows=$windows;truncated=($windows.Count -ge 80);capturedAt=[DateTime]::UtcNow.ToString('o');primary=@{width=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width;height=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height}} | ConvertTo-Json -Depth 5 -Compress
 exit
}
if ($request.op -eq 'close-windows') {
 if (@($request.windows).Count -lt 1 -or @($request.windows).Count -gt 80) { throw 'Choose between 1 and 80 observed windows.' }
 $current = @(Get-BeboWindows); $requested = @(); $skipped = @()
 foreach ($targetWindow in $request.windows) {
  $match = @($current | Where-Object { $_.id -ceq [string]$targetWindow.id })
  if ($match.Count -ne 1) { $skipped += @{id=$targetWindow.id;reason='Window already closed or is no longer visible.'}; continue }
  $item = $match[0]
  if (!$item.closable) { $skipped += @{id=$item.id;reason=$item.protectedReason}; continue }
  if ($item.pid -ne $targetWindow.pid -or $item.processStarted -cne $targetWindow.processStarted -or $item.windowClass -cne $targetWindow.windowClass -or $item.title -cne $targetWindow.title) { $skipped += @{id=$item.id;reason='Window changed since observation. Inspect again.'}; continue }
  $nativeHandle = [IntPtr]::new([long]$item.id); [uint32]$ownerId = 0
  [void][BeboNative]::GetWindowThreadProcessId($nativeHandle,[ref]$ownerId)
  if ($ownerId -ne $item.pid) { $skipped += @{id=$item.id;reason='Window owner changed.'}; continue }
  if ([BeboNative]::PostMessage($nativeHandle,0x0010,[IntPtr]::Zero,[IntPtr]::Zero)) { $requested += @{id=$item.id;title=$item.title} }
  else { $skipped += @{id=$item.id;reason='Windows did not accept the close request.'} }
 }
 # A queued WM_CLOSE is not proof of closure; apps may display an unsaved-work prompt.
 Start-Sleep -Milliseconds 400
 $remaining = @(Get-BeboWindows)
 @{requested=$requested;skipped=$skipped;remaining=$remaining;note='Close requests sent without force termination. Verify remaining windows and leave save prompts for the human.'} | ConvertTo-Json -Depth 6 -Compress
 exit
}
if ($request.op -eq 'apps' -or $request.op -eq 'open-app') {
 $apps = @(Get-StartApps)
 if ($request.op -eq 'apps') {
  $query = [string]$request.query
  @{apps=@($apps | Where-Object {$_.Name.IndexOf($query,[StringComparison]::OrdinalIgnoreCase) -ge 0} | Select-Object -First 80 | ForEach-Object {@{name=$_.Name;id=$_.AppID}})} | ConvertTo-Json -Depth 4 -Compress
 } else {
  $targetApp = @($apps | Where-Object {$_.AppID -ceq [string]$request.appId})
  if ($targetApp.Count -ne 1) { throw 'The installed app ID was not found. Search installed apps again.' }
  $shellApp = New-Object -ComObject Shell.Application
  $folder = $shellApp.NameSpace('shell:AppsFolder')
  $item = $folder.ParseName($targetApp[0].AppID)
  if (!$item) { throw 'Windows could not resolve this app. Use the screen to open it.' }
  $item.InvokeVerb('open')
  @{requested=$true;name=$targetApp[0].Name;id=$targetApp[0].AppID} | ConvertTo-Json -Compress
 }
 exit
}
if ($request.op -eq 'capture') {
 $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
 $bitmap = [System.Drawing.Bitmap]::new($bounds.Width,$bounds.Height)
 $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
 try {
  $graphics.CopyFromScreen($bounds.Location,[System.Drawing.Point]::Empty,$bounds.Size)
  $scaledWidth = [Math]::Min(1440,$bounds.Width)
  $scaledHeight = [int]($bounds.Height * $scaledWidth / $bounds.Width)
  $scaled = [System.Drawing.Bitmap]::new($bitmap,[System.Drawing.Size]::new($scaledWidth,$scaledHeight))
  $stream = [System.IO.MemoryStream]::new()
  try { $scaled.Save($stream,[System.Drawing.Imaging.ImageFormat]::Png); @{image=[Convert]::ToBase64String($stream.ToArray());width=$bounds.Width;height=$bounds.Height;left=$bounds.Left;top=$bounds.Top;hwnd=[BeboNative]::GetForegroundWindow().ToInt64().ToString()} | ConvertTo-Json -Compress } finally {$stream.Dispose();$scaled.Dispose()}
 } finally {$graphics.Dispose();$bitmap.Dispose()}
 exit
}
if ($request.op -eq 'listen') {
 Add-Type -AssemblyName System.Speech
 $recognizer = [System.Speech.Recognition.SpeechRecognitionEngine]::new()
 try {
  $recognizer.SetInputToDefaultAudioDevice()
  $recognizer.LoadGrammar([System.Speech.Recognition.DictationGrammar]::new())
  $result = $recognizer.Recognize([TimeSpan]::FromSeconds(12))
  if (!$result) { throw 'I did not catch that. Try again, or type your request.' }
  @{text=$result.Text} | ConvertTo-Json -Compress
 } finally { $recognizer.Dispose() }
 exit
}
function Send-CursorEvent([string]$phase) { @{event='cursor';phase=$phase} | ConvertTo-Json -Compress | Write-Output; [Console]::Out.Flush() }
if ($request.op -ne 'action') { throw 'Unsupported operation' }
$action = $request.action
$ctx = $request.context
$target = [IntPtr]::new([long]$ctx.hwnd)
if (![BeboNative]::IsWindow($target)) { throw 'The target window closed. Send your request again.' }
[void][BeboNative]::SetForegroundWindow($target)
Start-Sleep -Milliseconds 200
if ([BeboNative]::GetForegroundWindow() -ne $target) { throw 'Could not focus the target window. No input was sent.' }
$currentBounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
if ($currentBounds.Width -ne $ctx.width -or $currentBounds.Height -ne $ctx.height -or $currentBounds.Left -ne $ctx.left -or $currentBounds.Top -ne $ctx.top) { throw 'Display size changed. Send your request again.' }
if ($action.type -in @('click','double_click','scroll')) {
 $x = [int]($ctx.left + ($action.x / 1000.0 * ($ctx.width - 1)))
 $y = [int]($ctx.top + ($action.y / 1000.0 * ($ctx.height - 1)))
 $start = [System.Windows.Forms.Cursor]::Position
 Send-CursorEvent 'moving'
 for($i=1;$i -le 36;$i++){$t=$i/36.0;$ease=$t*$t*(3-2*$t);[void][BeboNative]::SetCursorPos([int]($start.X+($x-$start.X)*$ease),[int]($start.Y+($y-$start.Y)*$ease));Start-Sleep -Milliseconds 14}
 if ([BeboNative]::GetForegroundWindow() -ne $target) { throw 'Focus changed before input. No input was sent.' }
 if ($action.type -eq 'scroll') { Send-CursorEvent 'scroll'; $delta=if($action.text -eq 'up'){[uint32]360}else{[uint32]::MaxValue - 359};[BeboNative]::Scroll($delta) }
 else { $count=if($action.type -eq 'double_click'){2}else{1};for($i=0;$i -lt $count;$i++){Send-CursorEvent 'click';[BeboNative]::Click();Start-Sleep -Milliseconds 80} }
} elseif ($action.type -eq 'type') {
 Send-CursorEvent 'typing'
 # Preserve the whole clipboard object, including images, when available.
 $oldData = [System.Windows.Forms.Clipboard]::GetDataObject()
 $clipboardVersion = $null
 try {
  if ($action.text.Length -gt 0) { [System.Windows.Forms.Clipboard]::SetText($action.text);$clipboardVersion=[BeboNative]::GetClipboardSequenceNumber();[BeboNative]::Keys([byte[]]@(17,86));Start-Sleep -Milliseconds 350 }
 } finally {
  # A user's copy action during typing takes precedence over our saved clipboard.
  if($null -ne $clipboardVersion -and [BeboNative]::GetClipboardSequenceNumber() -eq $clipboardVersion){if($null -ne $oldData){[System.Windows.Forms.Clipboard]::SetDataObject($oldData,$true)}else{[System.Windows.Forms.Clipboard]::Clear()}}
 }
} elseif ($action.type -eq 'key') {
 Send-CursorEvent 'keyboard'
 $mapping=@{ENTER=13;ESC=27;TAB=9;BACKSPACE=8;DELETE=46;SPACE=32;UP=38;DOWN=40;LEFT=37;RIGHT=39;HOME=36;END=35;PAGEUP=33;PAGEDOWN=34;WIN=91;CTRL=17;ALT=18;F4=115;A=65;C=67;V=86;L=76;F=70;S=83;N=78;T=84;W=87;E=69;D=68}
 $sequence = foreach($part in $action.text.Split('+')){if(!$mapping.ContainsKey($part)){throw 'Unsupported key'};[byte]$mapping[$part]}
 [BeboNative]::Keys([byte[]]$sequence)
} else { throw 'Unsupported action' }
@{ok=$true} | ConvertTo-Json -Compress
