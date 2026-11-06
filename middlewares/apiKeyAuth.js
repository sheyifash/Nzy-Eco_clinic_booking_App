export default function apiKeyAuth(req, res, next) {
    const apiKey = req.get("X-API-Key");
    const expectedKey = process.env.API_KEY;

    console.log("API authentication diagnostic:", {
        environmentKeyExists: Boolean(expectedKey),
        receivedKeyExists: Boolean(apiKey),
        environmentKeyLength: expectedKey?.length,
        receivedKeyLength: apiKey?.length,
        keysMatch: apiKey === expectedKey
    });

    if (!apiKey || !expectedKey || apiKey !== expectedKey) {
        return res.status(401).json({
            error: "Unauthorized"
        });
    }

    next();
}