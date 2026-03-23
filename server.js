const express = require("express");
const multer = require("multer");
const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");

const app = express();
const upload = multer({ dest: "uploads/" });
const client = new Anthropic({ apiKey: "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" });

app.use(express.static(__dirname));


app.post("/analyze", upload.single("photo"), async (req, res) => {
  try {
    const imageData = fs.readFileSync(req.file.path);
    const base64Image = imageData.toString("base64");
    const mimeType = req.file.mimetype;
    const response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimeType, data: base64Image }},
          { type: "text", text: "Analyze this selfie. Reply ONLY with JSON no extra text: {\"biologicalAge\":25,\"chronologicalAgeDiff\":\"older by 2 years\",\"agingVelocity\":\"faster\",\"skinHealth\":\"72/100\",\"hydration\":\"68%\",\"inflammation\":\"mild\",\"sleepSignal\":\"deprived\",\"topInsights\":[\"insight 1\",\"insight 2\",\"insight 3\"]}. Replace all values with real analysis of the photo." }
        ]
      }]
    });
    const resultText = response.content[0].text;
    const cleanJson = resultText.replace(/```json|```/g, "").trim();
    const result = JSON.parse(cleanJson);
    fs.unlinkSync(req.file.path);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(3000, () => {
  console.log("VITAL app running at http://localhost:3000");
});
