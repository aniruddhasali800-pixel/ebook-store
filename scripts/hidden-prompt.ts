/**
 * The keyboard prompts the operator-only scripts share, so a secret is handled
 * one way everywhere: visible for an email, muted for a password, a Postgres
 * connection string or a storage token. A muted answer is never echoed, never
 * written to a log, and never travels through a shell argument — it goes from
 * the keyboard straight into the process that hashes or stores it.
 */
import { createInterface } from 'node:readline';

export function closePrompt(): void {
  rl.close();
}

const rl = createInterface({ input: process.stdin, output: process.stdout });

export function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())));
}

/**
 * Character-by-character stdin with the echo turned off, so the password does not
 * appear on screen or in a terminal recording. Ctrl-C still cancels.
 */
export function askHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error('This is not a terminal. Run it from a real prompt so the password stays hidden.'));
      return;
    }
    process.stdout.write(question);
    const chars: string[] = [];
    // readline owns stdin for the visible prompts; hand it over while raw.
    rl.pause();
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const finish = (value: string | null) => {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      rl.resume();
      process.stdout.write('\n');
      if (value === null) reject(new Error('cancelled'));
      else resolve(value);
    };

    function onData(chunk: Buffer) {
      for (const char of chunk.toString('utf8')) {
        if (char === '\u0003') return finish(null); // Ctrl-C
        if (char === '\r' || char === '\n') return finish(chars.join(''));
        if (char === '\u007f' || char === '\b') chars.pop();
        else if (char >= ' ') chars.push(char);
      }
    }

    process.stdin.on('data', onData);
  });
}
