// ROHbot/api/tts.js

const ALLOWED_ORIGINS = new Set([
  "https://rohanraje.com",
  "https://www.rohanraje.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function setCors(req, res) {
  const origin = req.headers.origin;

  // Strict allowlist (no "*")
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

export default async function handler(req, res) {
  setCors(req, res);

  // Preflight
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const { text } = req.body || {};
    const clean = (text || "").trim();
    if (!clean) return res.status(400).json({ error: "Missing text" });

    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID;

    if (!apiKey) return res.status(500).json({ error: "Missing ELEVENLABS_API_KEY" });
    if (!voiceId) return res.status(500).json({ error: "Missing ELEVENLABS_VOICE_ID" });

    // ElevenLabs TTS endpoint (mp3)
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify({
        text: clean,
        // Optional tuning: adjust if you want
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.75,
          style: 0.25,
          use_speaker_boost: true,
        },
      }),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      console.error("ElevenLabs TTS error:", r.status, errText);
      return res.status(500).json({ error: "TTS failed" });
    }

    // Return audio bytes
    const arrayBuffer = await r.arrayBuffer();
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(Buffer.from(arrayBuffer));
  } catch (e) {
    console.error("tts error:", e);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
