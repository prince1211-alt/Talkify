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
                message: "GROQ_API_KEY missing in .env file.",
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

        // 🎙️ Speech to Text using Groq Whisper (Auto-detects language)
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

        // 🧠  Summarization using Groq LLaMA 3.3 (FREE!)
        const summaryResponse = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile", // Supported LLaMA 3.3 model on Groq
            messages: [
                {
                    role: "system",
                    content:
                    "You are an intelligent AI assistant that summarizes casual voice conversations, meetings, and group calls.\n\nThe transcript may contain speech in any language such as English, Hindi, Hinglish, or a mixture of multiple languages. Your task is to analyze the conversation and produce a concise summary.\n\n INSTRUCTIONS:1. Always write the summary in clear and simple English, regardless of the original language used in the transcript.\n2. Identify the main topics, decisions, or important points discussed in the conversation.\n3. Produce a concise summary consisting of 5** to 8 bullet points**.\n4. Focus only on meaningful discussion points. Ignore filler words, greetings, or irrelevant chatter.\n5. Keep each bullet point short, clear, and informative.\n\nSPECIAL CASE RULE:If the audio is extremely short (for example only a few seconds), contains only noise, greetings, or does not contain any meaningful discussion, you must respond with **exactly this sentence and nothing else**NO IMPORTANT TALKS , SORRY!"
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