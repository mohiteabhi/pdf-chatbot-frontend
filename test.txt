require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const Tesseract = require("tesseract.js");
const { fromPath } = require("pdf2pic");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { execFile } = require("child_process");
const util = require("util");
const execFileAsync = util.promisify(execFile);
const os = require("os");

const app = express();
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json());

const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

let documentText = "";

async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".pdf") {
    const raw = fs.readFileSync(filePath);
    const { text: parsedText, info } = await pdfParse(raw);

    if ((parsedText || "").trim().length > 500) {
      return parsedText;
    }

    console.log("Scanned PDF detected – using enhanced OCR pipeline...");

    const pages = info.Pages || 1;
    const ocrPages = [];
    const tempFiles = [];

    try {
      await Promise.all(
        Array.from({ length: pages }).map(async (_, index) => {
          const page = index + 1;
          const prefix = path.join(os.tmpdir(), `scan-${Date.now()}-${page}`);
          const pngPath = `${prefix}.png`;

          try {
            await execFileAsync("pdftoppm", [
              "-png",
              "-singlefile",
              "-r",
              "400",
              "-f",
              `${page}`,
              "-l",
              `${page}`,
              "-cropbox",
              "-aa",
              "yes",
              "-aaVector",
              "yes",
              filePath,
              prefix,
            ]);

            tempFiles.push(pngPath);

            const processedImage = await sharp(pngPath)
              .greyscale()
              .normalize({ upper: 90 })
              .linear(1.1, -0.1)
              .sharpen({ sigma: 1.2, flat: 1, jagged: 2 })
              .threshold(128, { grayscale: true })
              .negate()
              .toBuffer();

            const {
              data: { text },
            } = await Tesseract.recognize(processedImage, "eng", {
              logger: (m) => console.log(`Tesseract page ${page}:`, m),
              oem: 1,
              psm: 6,
              dpi: 400,
              tessedit_char_whitelist:
                "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.,-/$%()'\"&!?",
              preserve_interword_spaces: "1",
            });

            ocrPages[page - 1] = text; // Maintain page order
          } catch (err) {
            console.error(`Error processing page ${page}:`, err);
            ocrPages[page - 1] = ""; // Empty text for failed pages
          }
        })
      );
    } finally {
      tempFiles.forEach((file) => {
        try {
          fs.unlinkSync(file);
        } catch (err) {
          console.error("Cleanup error:", err);
        }
      });
    }

    return ocrPages.join("\n\n");
  }

  if ([".png", ".jpg", ".jpeg", ".bmp"].includes(ext)) {
    const processedImage = await sharp(filePath)
      .greyscale()
      .normalize({ upper: 95 })
      .linear(1.2, -0.2)
      .sharpen({ sigma: 1.5, flat: 1, jagged: 2 })
      .threshold(140)
      .negate()
      .toBuffer();

    const {
      data: { text },
    } = await Tesseract.recognize(processedImage, "eng", {
      oem: 1,
      psm: 3,
      dpi: 300,
    });

    return text;
  }

  throw new Error("Unsupported file type");
}

async function askGemini(prompt) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const result = await model.generateContent(prompt);
  return await result.response.text();
}

function detectRequestedFormat(question) {
  const q = question.toLowerCase();
  if (q.includes("table")) return "table";
  if (q.includes("json")) return "json";
  if (q.includes("bullet")) return "bullets";
  return "default";
}

app.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }
  try {
    const savedPath = req.file.path;
    documentText = await extractText(savedPath);
    console.log(`Extracted ${documentText.length} chars from ${savedPath}`);
    res.json({ message: "File uploaded and text extracted." });
  } catch (err) {
    console.error("Extraction error:", err);
    res.status(500).json({ error: "Failed to extract text." });
  }
});

app.post("/chat", async (req, res) => {
  const { question } = req.body;
  if (!documentText) {
    return res.status(400).json({ error: "Please upload a file first." });
  }
  if (!question?.trim()) {
    return res.status(400).json({ error: "Question cannot be empty." });
  }

  const isChecklist = question.toLowerCase().includes("checklist");
  const basicFormat = detectRequestedFormat(question);

  const format =
    isChecklist && basicFormat === "table"
      ? "checklist-table"
      : isChecklist
      ? "checklist-json"
      : basicFormat;

  let instruction = "";

  if (format === "checklist-table") {
    instruction = `
Provide a SPECIFIC answer to the question as a detailed RBI compliance checklist in **Respond strictly as a GitHub-Flavored Markdown table with header row and pipes** format.
Focus ONLY on the requirements mentioned in the question. Include these columns ONLY if relevant:
- title
- description
- activities
- periodicity
- regulation_reference
- action
- complianceType
- status`.trim();
  } else if (format === "checklist-json") {
    instruction = `
Provide a SPECIFIC answer to the question as a detailed RBI compliance checklist in **JSON** format.
Focus ONLY on the requirements mentioned in the question. Include these fields ONLY if relevant:
- "title"
- "description"
- "activities"
- "periodicity"
- "regulation_reference"
- "action"
- "complianceType"
- "status"`.trim();
  } else {
    switch (format) {
      case "table":
        instruction =
          "Respond strictly as a GitHub-Flavored Markdown table with header row and pipes.";
        break;
      case "json":
        instruction = "Respond strictly as valid JSON.";
        break;
      case "bullets":
        instruction = "Respond as bullet points.";
        break;
      default:
        instruction = "Respond in well-formatted Markdown.";
    }
  }

  const prompt = `
You are an AI assistant. Use the extracted document text below.

Document text:
${documentText}

User’s question: ${question}

${instruction}`;

  try {
    const answer = await askGemini(prompt);
    res.json({ answer, format });
  } catch (err) {
    console.error("AI error:", err);
    res.status(500).json({ error: "AI generation failed." });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () =>
  console.log(`Backend listening on http://localhost:${PORT}`)
);
