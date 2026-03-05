const fs = require("fs");
const Groq = require("groq-sdk");

// Initialize Groq client (free API - no OpenAI key needed!)
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

exports.summarizeMeeting = async (req, res) => {
    try {
        if (!process.env.GROQ_API_KEY) {
            return res.status(500).json({
                success: false,
                message: "GROQ_API_KEY missing in .env file. Get free key at console.groq.com",
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No audio file provided",
            });
        }

        const audioPath = req.file.path;

        // 🎙️ 1️⃣ Speech to Text using Groq Whisper (FREE - no OpenAI key needed!)
        const transcription = await groq.audio.transcriptions.create({
            file: fs.createReadStream(audioPath),
            model: "whisper-large-v3-turbo", // Free & fast Whisper model on Groq
            response_format: "text",
            language: "en",
        });

        const transcriptText =
            typeof transcription === "string" ? transcription : transcription.text;

        if (!transcriptText || transcriptText.trim() === "") {
            fs.unlinkSync(audioPath);
            return res.status(400).json({
                success: false,
                message: "Audio is empty or could not be transcribed",
            });
        }

        // 🧠 2️⃣ Summarization using Groq LLaMA 3 (FREE!)
        const summaryResponse = await groq.chat.completions.create({
            model: "llama3-8b-8192", // Free LLaMA 3 model on Groq
            messages: [
                {
                    role: "system",
                    content:
                        "You are a meeting assistant. Summarize the following meeting transcript in 5-7 concise bullet points. Focus on key decisions, action items, and important topics discussed.",
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

        // 🧹 Cleanup uploaded file
        fs.unlinkSync(audioPath);

        return res.status(200).json({
            success: true,
            transcript: transcriptText,
            summary: summary,
        });
    } catch (error) {
        console.error("Summarization Error:", error);

        if (req.file?.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        return res.status(500).json({
            success: false,
            message: "Failed to process audio",
            error: error.message,
        });
    }
};