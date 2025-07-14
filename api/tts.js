// api/tts.js
const axios = require('axios');

module.exports = async (req, res) => {
    // Set CORS headers for all responses
    res.setHeader('Access-Control-Allow-Origin', '*'); // Allows all origins
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle the preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        // If it's an OPTIONS request, we just send back a success status.
        // The browser will then send the actual POST request.
        return res.status(200).end();
    }

    // Handle the actual POST request
    if (req.method === 'POST') {
        const { text } = req.body;

        if (!text) {
            return res.status(400).send({ message: 'Text is required' });
        }

        const XI_API_KEY = process.env.ELEVENLABS_API_KEY;
        const VOICE_ID = 'sk_63216ccad1dc380747470f2e8bbedf2fdf3fcddad0bd6fb5'; // Make sure your Voice ID is correct

        if (!XI_API_KEY) {
            console.error("ElevenLabs API Key is not configured on Vercel.");
            return res.status(500).send({ message: 'Server configuration error: Missing API Key.' });
        }

        const options = {
            method: 'POST',
            url: `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
            headers: {
                'accept': 'audio/mpeg',
                'xi-api-key': XI_API_KEY,
                'Content-Type': 'application/json',
            },
            data: {
                text: text,
                model_id: 'eleven_monolingual_v1',
                voice_settings: { stability: 0.5, similarity_boost: 0.75 },
            },
            responseType: 'stream'
        };

        try {
            const response = await axios.request(options);
            res.setHeader('Content-Type', 'audio/mpeg');
            response.data.pipe(res);
        } catch (error) {
            console.error('Error from ElevenLabs:', error.response ? error.response.data : error.message);
            res.status(500).send({ message: 'Error generating speech from upstream API' });
        }

    } else {
        // If it's not OPTIONS or POST, then it's a method we don't allow.
        res.setHeader('Allow', ['POST', 'OPTIONS']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
};
