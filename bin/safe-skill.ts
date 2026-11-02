#!/usr/bin/env node
import { main } from '../src/cli.ts';

main().then((code) => {
  if (typeof code === 'number' && code !== 0) {
    process.exit(code);
  }
}).catch((err) => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
