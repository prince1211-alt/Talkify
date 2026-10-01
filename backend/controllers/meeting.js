const fs = require("fs/promises");
const { createReadStream } = require("fs");
const path = require("path");
const Groq = require("groq-sdk");

// Created on first use: `new Groq()` throws when GROQ_API_KEY is missing,
// which used to crash the whole server at startup.
let groq = null;
const getGroq = () => {
    if (!groq) groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    return groq;
};

const AUDIO_EXTENSIONS = {
    "audio/webm": ".webm",
    "video/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/mp4": ".m4a",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
};

const removeQuietly = (filePath) => fs.rm(filePath, { force: true }).catch(() => {});

exports.summarizeMeeting = async (req, res) => {
    let audioPath = null;
    try {
        if (!process.env.GROQ_API_KEY) {
            return res.status(503).json({
                success: false,
                message: "Meeting summary is not configured on the server (GROQ_API_KEY missing).",
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No audio file provided",
            });
        }

        // Whisper needs a real file extension to detect the format
        const baseType = req.file.mimetype.split(";")[0];
        const ext = AUDIO_EXTENSIONS[baseType] || path.extname(req.file.originalname) || ".webm";
        audioPath = req.file.path + ext;
        await fs.rename(req.file.path, audioPath);

        // 🎙️ 1️⃣ Speech to Text using Groq Whisper (Auto-detects language)
        const transcription = await getGroq().audio.transcriptions.create({
            file: createReadStream(audioPath),
            model: "whisper-large-v3-turbo",
            response_format: "text"
        });

        const transcriptText =
            typeof transcription === "string" ? transcription : transcription.text;

        if (!transcriptText || transcriptText.trim() === "") {
            return res.status(400).json({
                success: false,
                message: "Audio is empty or could not be transcribed",
            });
        }

        // 🧠 2️⃣ Summarization using Groq LLaMA 3.3
        const summaryResponse = await getGroq().chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
                {
                    role: "system",
                    content:
                        "You are a helpful AI assistant that summarizes casual voice conversations and group calls. The transcript may be in any language (English, Hindi, Hinglish, etc.). \n\nIMPORTANT RULE 1: Describe the summary ALWAYS in English, regardless of the original language.\nIMPORTANT RULE 2: Extract the key topics and output a 3-5 point summary.\nIMPORTANT RULE 3: If the audio is extremely short (e.g. 5 seconds) OR if there is absolutely NO actual conversation, ONLY return the exact words: 'no important talks'.",
                },
                {
                    role: "user",
                    content: transcriptText,
                },
            ],
            temperature: 0.3,
            max_tokens: 512,
        });

        const summary = summaryResponse.choices[0].message.content;

        return res.status(200).json({
            success: true,
            transcript: transcriptText,
            summary: summary,
        });
    } catch (error) {
        console.error("Summarization Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Failed to process audio",
        });
    } finally {
        // 🧹 Never keep call recordings on the server
        if (req.file?.path) await removeQuietly(req.file.path);
        if (audioPath) await removeQuietly(audioPath);
    }
};
