import Groq from "groq-sdk";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";

const WHISPER_MODEL = "whisper-large-v3-turbo"; // Fast + accurate

// Download audio from S3 as Buffer
async function downloadFromS3(key: string): Promise<Buffer> {
  const s3 = new S3Client({
    region: process.env.REGION ?? "us-east-1",
    credentials: {
      accessKeyId: process.env.ACCESS_KEY!,
      secretAccessKey: process.env.SECRET_KEY!,
    },
  });

  const command = new GetObjectCommand({
    Bucket: process.env.BUCKET_NAME!,
    Key: key,
  });

  const response = await s3.send(command);
  const chunks: Uint8Array[] = [];

  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

// Transcribe audio buffer using Groq Whisper
export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string,
  language = "en"
): Promise<string> {
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY not set");

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const lower = filename.toLowerCase();
  const mime =
    lower.endsWith(".m4a") || lower.endsWith(".mp4")
      ? "audio/mp4"
      : lower.endsWith(".ogg")
        ? "audio/ogg"
        : lower.endsWith(".wav")
          ? "audio/wav"
          : "audio/webm";

  const file = new File([new Uint8Array(audioBuffer)], filename, { type: mime });

  try {
    const transcription = await groq.audio.transcriptions.create({
      file,
      model: WHISPER_MODEL,
      language:
        language === "en" ? "en" : language === "hi" ? "hi" : language === "es" ? "es" : language === "fr" ? "fr" : "en",
      response_format: "text",
    });

    return typeof transcription === "string" ? transcription : (transcription as { text: string }).text ?? "";
  } catch (err) {
    // MediaRecorder sometimes sends a valid-looking WebM with ~0s of audio (silence / flush / header-only).
    const raw = err instanceof Error ? err.message : JSON.stringify(err);
    if (/too short|minimum audio length|0\.01 seconds/i.test(raw)) {
      return "";
    }
    throw err;
  }
}

// Full pipeline: fetch from S3 → transcribe → save to DB
export async function transcribeSession(sessionId: string): Promise<string | null> {
  try {
    const session = await db.interviewSession.findUnique({
      where: { id: sessionId },
      select: { audioKey: true, language: true, transcript: true },
    });

    if (!session?.audioKey) return null;
    if (session.transcript) return session.transcript; // already done

    const audioBuffer = await downloadFromS3(session.audioKey);
    const ext = session.audioKey.split(".").pop() ?? "webm";
    const filename = `recording.${ext}`;

    const transcript = await transcribeAudio(audioBuffer, filename, session.language ?? "en");

    if (transcript) {
      await db.interviewSession.update({
        where: { id: sessionId },
        data: { transcript },
      });
    }

    return transcript;
  } catch (err) {
    console.error("[TRANSCRIBE]", sessionId, err);
    return null;
  }
}
