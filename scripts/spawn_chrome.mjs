import { spawn } from 'child_process';

const chromePath = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
console.log('Spawning Chrome with pipe...');

const child = spawn(chromePath, [
  '--remote-debugging-port=9222',
  '--no-first-run',
  '--no-default-browser-check',
  '--user-data-dir=C:\\Users\\ad\\AppData\\Local\\Google\\Chrome\\User Data'
]);

child.stdout.on('data', (d) => console.log('STDOUT:', d.toString()));
child.stderr.on('data', (d) => console.log('STDERR:', d.toString()));
child.on('exit', (code) => console.log('EXIT CODE:', code));

setTimeout(() => {
  console.log('Timeout reached');
  process.exit(0);
}, 5000);
