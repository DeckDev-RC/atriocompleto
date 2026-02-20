import nodemailer from "nodemailer";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

async function main() {
    console.log("Testing SMTP connection...");
    try {
        await transporter.verify();
        console.log("✅ SMTP connection successful!");

        console.log("Sending test email...");
        const info = await transporter.sendMail({
            from: process.env.SMTP_FROM,
            to: process.env.SMTP_USER, // Send to self
            subject: "Test Email from Atrio",
            text: "This is a test email to verify SMTP configuration.",
        });
        console.log("✅ Email sent successfully!", info.messageId);
    } catch (error) {
        console.error("❌ Error:", error);
    }
}

main();
