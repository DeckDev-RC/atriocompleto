
import axios from 'axios';

const API_URL = 'http://localhost:3001/api';
const ENDPOINTS = [
    '/health',
    '/auth/forgot-password'
];

async function testRateLimit(endpoint: string, limit: number) {
    console.log(`\n--- Testing ${endpoint} (Limit: ${limit}) ---`);
    let successes = 0;
    let blocked = 0;

    for (let i = 1; i <= limit + 5; i++) {
        try {
            await axios.get(`${API_URL}${endpoint}`);
            successes++;
            process.stdout.write('.');
        } catch (error: any) {
            if (error.response?.status === 429) {
                blocked++;
                process.stdout.write('X');
            } else {
                console.error(`\n[${i}] Error: ${error.message}`);
            }
        }
    }

    console.log(`\nResults for ${endpoint}:`);
    console.log(`- Successes: ${successes}`);
    console.log(`- Blocked (429): ${blocked}`);

    if (successes === limit && blocked > 0) {
        console.log('✅ Rate limit enforced correctly.');
    } else {
        console.log('❌ Rate limit enforcement failed or inconsistent.');
    }
}

async function runTests() {
    try {
        // Health is GET
        await testRateLimit('/health', 20);

        // Forgot password is POST - slightly different tester
        console.log(`\n--- Testing /auth/forgot-password (Limit: 20) ---`);
        let successes = 0;
        let blocked = 0;
        for (let i = 1; i <= 25; i++) {
            try {
                await axios.post(`${API_URL}/auth/forgot-password`, { email: 'test@example.com' });
                successes++;
                process.stdout.write('.');
            } catch (error: any) {
                if (error.response?.status === 429) {
                    blocked++;
                    process.stdout.write('X');
                } else {
                    process.stdout.write('?');
                }
            }
        }
        console.log(`\nResults for /auth/forgot-password:`);
        console.log(`- Successes: ${successes}`);
        console.log(`- Blocked (429): ${blocked}`);

    } catch (error) {
        console.error('Test suite failed:', error);
    }
}

runTests();
