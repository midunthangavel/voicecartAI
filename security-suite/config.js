import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const config = {
  suiteRoot: __dirname,
  targets: {
    server: {
      path: resolve(__dirname, '../server'),
      sandboxPort: parseInt(process.env.SECURITY_SANDBOX_PORT || '3999', 10),
      sandboxHost: process.env.SECURITY_SANDBOX_HOST || '127.0.0.1',
      sandboxDb: resolve(__dirname, './sandboxes/test_sec_sandbox.db'),
      healthEndpoint: '/health/live',
    },
    client: {
      path: resolve(__dirname, '../client'),
      srcPath: resolve(__dirname, '../client/src'),
      buildPath: resolve(__dirname, '../client/dist'),
    },
    mobile: {
      path: resolve(__dirname, '../mobile'),
      appPath: resolve(__dirname, '../mobile/App.js'),
      configPath: resolve(__dirname, '../mobile/app.json'),
    },
  },
  reportsDir: resolve(__dirname, './reports'),
  strix: {
    llm: process.env.STRIX_LLM || 'gemini/gemini-2.0-flash',
    apiKey: process.env.LLM_API_KEY || process.env.GEMINI_API_KEY || '',
  },
};
