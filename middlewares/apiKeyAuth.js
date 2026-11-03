export default function apiKeyAuth(req, res, next){
    const apiKey = req.get("X-API-Key");

    if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({error:"unauthorized"});
    }

    next();
}