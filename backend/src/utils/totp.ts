import speakeasy from 'speakeasy';
import QRCode from "qrcode";
import crypto from "node:crypto";
import { env } from "../config/env";

export class TOTPService {
    private static readonly ALGORITHM = "aes-256-cbc";
    private static readonly IV_LENGTH = 16;

    static generateSecret(): string {
        return speakeasy.generateSecret({ length: 20 }).base32;
    }

    static async generateQRCode(email: string, secret: string): Promise<string> {
        const otpauth = speakeasy.otpauthURL({
            secret,
            label: email,
            issuer: "Atrio",
            encoding: 'base32'
        });

        return QRCode.toDataURL(otpauth, {
            margin: 2,
            width: 400,
            color: {
                dark: "#09CAFF", // brand-primary (cyan)
                light: "#FFFFFF" // White background for better compatibility
            }
        });
    }

    static verifyToken(token: string, secret: string): boolean {
        return speakeasy.totp.verify({
            secret,
            encoding: 'base32',
            token,
            window: 2 // Maior tolerância para desvio de relógio (60s)
        });
    }

    static encryptSecret(secret: string): string {
        const iv = crypto.randomBytes(this.IV_LENGTH);
        const key = Buffer.from(env.AUTH_SECURITY_SECRET, "hex");
        const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);
        let encrypted = cipher.update(secret);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString("hex") + ":" + encrypted.toString("hex");
    }

    static decryptSecret(encryptedData: string): string {
        const textParts = encryptedData.split(":");
        const ivValue = textParts.shift();
        if (!ivValue) throw new Error("Invalid encrypted data: missing IV");
        const iv = Buffer.from(ivValue, "hex");
        const encryptedText = Buffer.from(textParts.join(":"), "hex");
        const key = Buffer.from(env.AUTH_SECURITY_SECRET, "hex");
        const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    }

    static generateRecoveryCodes(count: number = 10): string[] {
        return Array.from({ length: count }, () =>
            crypto.randomBytes(4).toString("hex").toUpperCase()
        );
    }
}