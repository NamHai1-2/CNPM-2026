import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

/** Asks a question on the terminal without echoing the answer (for passwords). */
export async function promptHidden(question: string): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) process.stdout.write(chunk);
      callback();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  try {
    const pending = rl.question(question);
    muted = true;
    return await pending;
  } finally {
    muted = false;
    rl.close();
    process.stdout.write('\n');
  }
}
