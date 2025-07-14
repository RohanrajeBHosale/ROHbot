// api/tts.js
const axios = require('axios');

// This is a Vercel serverless function
module.exports = async (req, res) => {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).send({ message: 'Only POST requests allowed' });
    }

    const { text } = req.body;

    if (!text) {
        return res.status(400).send({ message: 'Text is required' });
    }

    // IMPORTANT: NEVER expose your API key in the frontend.
    // Use environment variables for security.
    const XI_API_KEY = process.env.ELEVENLABS_API_KEY;
    const VOICE_ID = 'RBJ2S1JklYXJtRTqaggc'; // Paste your actual Voice ID here

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
            model_id: 'eleven_monolingual_v1', // Or a newer model
            voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
            },
        },
        responseType: 'stream' // We want the audio data as a stream
    };

    try {
        const response = await axios.request(options);
        // Set the header to tell the browser it's receiving an audio file
        res.setHeader('Content-Type', 'audio/mpeg');
        // Pipe the audio stream from ElevenLabs directly to the response
        response.data.pipe(res);
    } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Error generating speech' });
    }
};
