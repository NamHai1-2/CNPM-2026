import { loadEnv } from '../src/env.js';

// Same .env as the application, so TEST_DATABASE_URL works without exporting variables by hand.
loadEnv();
