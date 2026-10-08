$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
# The child waits on stdin until it belongs to our Job Object. Closing or killing
# this helper closes the job handle and terminates every process in that job.
Add-Type @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
public static class BeboShell {
  [StructLayout(LayoutKind.Sequential)] struct BasicLimits { public long PerProcessUserTimeLimit, PerJobUserTimeLimit; public uint LimitFlags; public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize; public uint ActiveProcessLimit; public UIntPtr Affinity; public uint PriorityClass, SchedulingClass; }
  [StructLayout(LayoutKind.Sequential)] struct IoCounters { public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount, ReadTransferCount, WriteTransferCount, OtherTransferCount; }
  [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits { public BasicLimits BasicLimitInformation; public IoCounters IoInfo; public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed; }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int type, IntPtr info, uint size);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  public static int Run(string command, string cwd) {
    IntPtr job = CreateJobObject(IntPtr.Zero, null);
    if(job == IntPtr.Zero) throw new Exception("Could not create a cancellable terminal job.");
    try {
      ExtendedLimits limits = new ExtendedLimits(); limits.BasicLimitInformation.LimitFlags = 0x2000;
      int size = Marshal.SizeOf(limits); IntPtr memory = Marshal.AllocHGlobal(size);
      try { Marshal.StructureToPtr(limits, memory, false); if(!SetInformationJobObject(job, 9, memory, (uint)size)) throw new Exception("Could not configure terminal cancellation."); }
      finally { Marshal.FreeHGlobal(memory); }
      string bootstrap = "[Console]::InputEncoding=[Text.UTF8Encoding]::new($false); [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; $global:LASTEXITCODE=0; try { $s=[Console]::In.ReadToEnd(); & ([ScriptBlock]::Create($s)); if($LASTEXITCODE -ne 0){exit $LASTEXITCODE} } catch { [Console]::Error.WriteLine($_.ToString()); exit 1 }";
      ProcessStartInfo start = new ProcessStartInfo(System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), @"WindowsPowerShell\v1.0\powershell.exe"), "-NoProfile -NonInteractive -OutputFormat Text -EncodedCommand " + Convert.ToBase64String(Encoding.Unicode.GetBytes(bootstrap)));
      start.WorkingDirectory=cwd; start.UseShellExecute=false; start.CreateNoWindow=true;
      start.RedirectStandardInput=true; start.RedirectStandardOutput=true; start.RedirectStandardError=true;
      start.StandardOutputEncoding=Encoding.UTF8; start.StandardErrorEncoding=Encoding.UTF8;
      using(Process child = new Process()) {
        child.StartInfo=start;
        child.Start();
        if(!AssignProcessToJobObject(job, child.Handle)) { child.Kill(); throw new Exception("Could not attach the terminal to a cancellable job. Nothing was executed."); }
        // Forward bytes, not lines: an unbroken output line cannot grow an
        // unbounded StreamReader line buffer in the helper.
        Task stdout = child.StandardOutput.BaseStream.CopyToAsync(Console.OpenStandardOutput());
        Task stderr = child.StandardError.BaseStream.CopyToAsync(Console.OpenStandardError());
        // Raw UTF-8 avoids the .NET Framework StreamWriter default code page.
        byte[] bytes=Encoding.UTF8.GetBytes(command); child.StandardInput.BaseStream.Write(bytes, 0, bytes.Length); child.StandardInput.Close();
        child.WaitForExit(); int code=child.ExitCode;
        CloseHandle(job); job=IntPtr.Zero;
        Task.WaitAll(stdout, stderr); return code;
      }
    } finally { if(job != IntPtr.Zero) CloseHandle(job); }
  }
}
'@
exit [BeboShell]::Run([string]$request.command, [string]$request.cwd)
