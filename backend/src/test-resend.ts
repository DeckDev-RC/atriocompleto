async function testResend() {
    const email = "renatoagregar@gmail.com";
    console.log(`Testing resend-verification for ${email}...`);
    try {
        const response = await fetch("http://localhost:3001/api/auth/resend-verification", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ email }),
        });
        const data = await response.json() as any;
        console.log("Response Status:", response.status);
        console.log("Response Data:", JSON.stringify(data, null, 2));
    } catch (error: any) {
        console.error("Error Message:", error.message);
    }
}

testResend();
