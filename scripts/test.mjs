import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
await build({entryPoints:['src/core.ts','src/legacy.ts','src/client.ts','src/local-client.ts','src/main.ts','src/settings.ts','src/connector.ts','src/collector.ts','src/i18n.ts','src/audio.ts','src/media.ts','src/whisper.ts','src/whisper-mac.ts'],outdir:'.test-build',outExtension:{'.js':'.cjs'},bundle:true,platform:'node',format:'cjs',external:['obsidian','electron']});
const result=spawnSync(process.execPath,['--test','tests/core.test.cjs','tests/plugin.test.cjs','tests/setup.test.cjs','tests/whisper.test.cjs','tests/whisper-mac.test.cjs'],{stdio:'inherit'});
process.exitCode=result.status??1;
