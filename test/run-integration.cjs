const {runTests} = require('@vscode/test-electron');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
async function main() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(),'excel-vscode-'));
  const workspace = path.join(temporary,'workspace'); await fs.mkdir(workspace);
  try {
    await runTests({
      vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH || undefined,
      extensionDevelopmentPath: path.resolve(__dirname,'..'),
      extensionTestsPath: path.resolve(__dirname,'integration.cjs'),
      extensionTestsEnv: {EXCEL_TEST_WORKSPACE:workspace},
      launchArgs: [workspace,'--disable-extensions','--disable-workspace-trust','--skip-welcome','--skip-release-notes','--user-data-dir',path.join(temporary,'user-data'),'--extensions-dir',path.join(temporary,'extensions')]
    });
  } finally { await fs.rm(temporary,{recursive:true,force:true,maxRetries:10,retryDelay:100}); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
