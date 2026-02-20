import { TOTPService } from './utils/totp';
import speakeasy from 'speakeasy';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function testTOTPFlow() {
    console.log('--- Testing TOTP End-to-End ---');

    try {
        // 1. Generate Secret
        const secret = TOTPService.generateSecret();
        console.log('Generated Secret:', secret);

        // 2. Encrypt Secret
        const encrypted = TOTPService.encryptSecret(secret);
        console.log('Encrypted Secret:', encrypted);

        // 3. Decrypt Secret
        const decrypted = TOTPService.decryptSecret(encrypted);
        console.log('Decrypted Secret:', decrypted);

        if (secret !== decrypted) {
            throw new Error('Encryption/Decryption mismatch!');
        }
        console.log('✅ Encryption/Decryption: PASS');

        // 4. Generate Token and Verify
        const token = speakeasy.totp({
            secret: secret,
            encoding: 'base32'
        });
        console.log('Generated Token for now:', token);

        const isValid = TOTPService.verifyToken(token, secret);
        console.log('Verification status:', isValid);

        if (!isValid) {
            throw new Error('Verification failed for current token!');
        }
        console.log('✅ TOTP Verification: PASS');

        // 5. Test with window
        console.log('Testing with window tolerance...');
        const pastToken = speakeasy.totp({
            secret: secret,
            encoding: 'base32',
            time: Math.floor(Date.now() / 1000) - 30 // 30 seconds ago
        });
        const isPastValid = TOTPService.verifyToken(pastToken, secret);
        console.log('Past token valid (within window):', isPastValid);

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

testTOTPFlow();
