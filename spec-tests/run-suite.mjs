import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readConfig, readEnvironment, validateConfig } from '../environment/agent-device-mcp/config.mjs';
import { redactDiagnosticText } from '../environment/agent-device-mcp/artifact-redaction.mjs';
import { prepareFrontend, frontendEnvironment, frontendEvidence, verifyFrontend } from '../environment/agent-device-mcp/frontend-build.mjs';
import { reportStandaloneRunTime } from '../environment/agent-device-mcp/run-timing.mjs';

reportStandaloneRunTime();
const here = path.dirname(fileURLToPath(import.meta.url));
const suiteStarted = performance.now();
const repo = path.dirname(here);
const values = {}, flags = new Set();
const options = ['--scenarios-file','--artifacts-dir','--env-file','--url','--timeout','--case'];
let currentChild, interrupted = false;
const stop = () => { interrupted = true; currentChild?.kill('SIGTERM'); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
const emit = value => process.stdout.write(JSON.stringify(value) + '\n');
const event = (item, status, duration_seconds) => {
  const value = { event: 'scenario', scenario: item.global_id, status, ...(duration_seconds === undefined ? {} : {duration_seconds}) };
  if (item.global_id) process.stderr.write('AC_PROGRESS ' + JSON.stringify(value) + '\n');
  else process.stderr.write(`[spec-tests] ${status.toUpperCase()} ${item.test_id}${duration_seconds === undefined ? '' : ` (${duration_seconds}s)`}\n`);
};
try {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (['--dry-run','--json'].includes(key)) flags.add(key);
    else if (options.includes(key) && args[i+1] && values[key] === undefined) values[key] = args[++i];
    else throw new Error('Invalid or duplicate suite arguments');
  }
  const configOptions = { envFile:values['--env-file'], url:values['--url'] };
  const config = await readConfig(configOptions);
  const environment = await readEnvironment(configOptions);
  if (values['--url'] !== undefined) environment.WEBSHELL_TEST_URL = values['--url'];
  const timeout = Number(values['--timeout'] || 300);
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 3600) throw new Error('--timeout must be between 1 and 3600 seconds');
  const specDir = path.join(repo, 'spec');
  const domains = (await fs.readdir(specDir, {withFileTypes:true})).filter(entry => entry.isDirectory());
  const discovered = [];
  for (const domain of domains) {
    const features = await fs.readdir(path.join(specDir, domain.name), {withFileTypes:true});
    for (const feature of features) {
      if (!feature.isDirectory()) continue;
      const featureDir = path.join(here, domain.name, feature.name);
      let names = [];
      try { names = await fs.readdir(featureDir); } catch { continue; }
      for (const name of names) {
        if (!name.endsWith('.mjs') || name === 'helpers.mjs') continue;
        discovered.push({test_id: `${domain.name}/${feature.name}/${name}`});
      }
    }
  }
  discovered.sort((left, right) => left.test_id.localeCompare(right.test_id));
  const selected = values['--scenarios-file']
    ? JSON.parse(await fs.readFile(values['--scenarios-file'],'utf8')).scenarios
    : discovered.filter(item => !values['--case'] || item.test_id === values['--case'] || item.test_id === `${values['--case']}/test.mjs`);
  if (!Array.isArray(selected) || !selected.length) throw new Error('No test cases selected');
  const available = new Set(discovered.map(item => item.test_id)), seen = new Set();
  for (const item of selected) {
    if (!available.has(item.test_id) || seen.has(item.test_id)) throw new Error('Selection contains unavailable or duplicate test modules');
    seen.add(item.test_id);
  }
  if (flags.has('--dry-run') || environment.TESTS_AUTO_DRY_RUN === '1') {
    emit({status:'ready',dry_run:true,count:selected.length,cases:selected.map(item=>({test_id:item.test_id,scenario:item.global_id || null}))});
  } else {
    const frontend = await prepareFrontend({ force:true });
    Object.assign(environment, frontendEnvironment(frontend));
    config.localStaticDir = frontend.staticDir;
    config.productStaticDir = frontend.staticDir;
    config.frontendManifest = frontend.manifestPath;
    await validateConfig(config);
    const reportRoot = path.resolve(values['--artifacts-dir'] || path.join(here,'artifacts/suites',randomUUID()));
    await fs.mkdir(reportRoot,{recursive:true});
    await fs.writeFile(path.join(reportRoot,'frontend.json'),JSON.stringify(frontendEvidence(frontend),null,2));
    const results = [];
    for (const item of selected) {
      const started = performance.now(), caseName = item.test_id.replace(/\/test\.mjs$/, '').replace(/\.mjs$/, '');
      const directory = path.join(reportRoot,caseName);
      await fs.mkdir(directory,{recursive:true});
      event(item,'running');
      let result = { scenario:item.global_id, test_id:item.test_id, status:'failed', evidence_granularity:'scenario', debug_report:path.join(directory,'result.json') };
      if (interrupted) result = {...result,status:'skipped',error:'Suite interrupted before this module started'};
      else {
        const env = {...environment};
        env.WEBSHELL_PRODUCT_STATIC_DIR ||= env.WEBSHELL_LOCAL_STATIC_DIR || '';
        if (caseName === 'terminal/viewport' && !env.WEBSHELL_MOBILE_USER_AGENT) env.WEBSHELL_MOBILE_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
        let timedOut = false, diagnostic = '';
        const child = spawn(process.execPath,[path.join(here,'run-playwright.mjs'),path.join(here,item.test_id),'--artifacts-dir',directory,'--timeout',String(timeout)],{cwd:here,env,stdio:['ignore','pipe','pipe']});
        currentChild = child;
        for (const stream of [child.stdout,child.stderr]) stream.on('data',chunk=> { diagnostic=(diagnostic+chunk.toString()).slice(-16000); });
        const timer = setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},(timeout+15)*1000);
        const killTimer = setTimeout(()=>child.kill('SIGKILL'),(timeout+30)*1000);
        let code;
        try { code = await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);}); }
        finally { clearTimeout(timer);clearTimeout(killTimer);currentChild=undefined; }
        await fs.writeFile(path.join(directory,'runner.log'),redactDiagnosticText(diagnostic,[config.username,config.password]));
        try {
          const observed = JSON.parse(await fs.readFile(result.debug_report,'utf8'));
          if (!['passed','failed','skipped'].includes(observed.status)) throw new Error('Invalid module status');
          result.status = observed.status;
          if (observed.error) result.error = observed.error;
          if (timedOut || interrupted) result = {...result,status:'failed',error:'Module timed out or was interrupted'};
          else if ((code === 0) !== (observed.status === 'passed')) result = {...result,status:'failed',error:'Module result disagrees with process exit code'};
          if (result.status === 'passed') await fs.access(path.join(directory,'events.jsonl'));
        } catch (error) { result = {...result,status:'failed',error:'Module report is unavailable or invalid: '+error.message}; }
      }
      result.duration_seconds = Math.round((performance.now()-started))/1000;
      if (result.status === 'skipped' && !result.error) result.error = 'Module reported a skipped operation';
      results.push(result); event(item,result.status,result.duration_seconds);
      await fs.writeFile(path.join(reportRoot,'results.json'),JSON.stringify({results},null,2));
    }
    const status = results.every(item=>item.status === 'passed') ? 'passed' : 'failed';
    await verifyFrontend(frontend.manifestPath);
    const summary = Object.fromEntries(['passed','failed','skipped'].map(state=>[state,results.filter(item=>item.status===state).length]));
    const duration_seconds = Math.round(performance.now() - suiteStarted) / 1000;
    const report = {status,results,frontend:frontendEvidence(frontend),duration_seconds,summary:{total:results.length,...summary,duration_seconds}};
    await fs.writeFile(path.join(reportRoot,'results.json'),JSON.stringify(report,null,2));
    emit(report);process.exitCode = status === 'passed' ? 0 : 1;
  }
} catch (error) {
  const config = await readConfig().catch(()=>({}));
  emit({status:'failed',results:[],duration_seconds:Math.round(performance.now() - suiteStarted)/1000,error:redactDiagnosticText(error.message,[config.username,config.password])});process.exitCode=1;
} finally {process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
