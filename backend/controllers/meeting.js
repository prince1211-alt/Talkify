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
        const newAudioPath = audioPath + ".webm";
        fs.renameSync(audioPath, newAudioPath);

        // 🎙️ 1️⃣ Speech to Text using Groq Whisper (Auto-detects language)
        const transcription = await groq.audio.transcriptions.create({
            file: fs.createReadStream(newAudioPath),
            model: "whisper-large-v3-turbo",
            response_format: "text"
        });

        const transcriptText =
            typeof transcription === "string" ? transcription : transcription.text;

        fs.appendFileSync("whisper_debug.log", `Transcription output: ${JSON.stringify(transcription)}\nText: ${transcriptText}\n`);

        if (!transcriptText || transcriptText.trim() === "") {
            fs.unlinkSync(newAudioPath);
            return res.status(400).json({
                success: false,
                message: "Audio is empty or could not be transcribed",
            });
        }

        // 🧠 2️⃣ Summarization using Groq LLaMA 3.3 (FREE!)
        const summaryResponse = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile", // Supported LLaMA 3.3 model on Groq
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

        // 🧹 Cleanup uploaded file
        fs.unlinkSync(newAudioPath);

        return res.status(200).json({
            success: true,
            transcript: transcriptText,
            summary: summary,
        });
    } catch (error) {
        console.error("Summarization Error:", error);
        fs.appendFileSync("whisper_debug.log", `Summarization Error: ${error.message}\nStack: ${error.stack}\n`);

        if (req.file?.path) {
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            if (fs.existsSync(req.file.path + ".webm")) fs.unlinkSync(req.file.path + ".webm");
        }

        return res.status(500).json({
            success: false,
            message: "Failed to process audio",
            error: error.message,
        });
    }
};