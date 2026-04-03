const express = require("express");
const multer = require("multer");
const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const app = express();
const upload = multer({ dest: "uploads/" });
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
app.use(express.static("public"));
app.post("/analyze", upload.single("photo"), async (req, res) => {
  try {
    const imageData = fs.readFileSync(req.file.path);
    const base64Image = imageData.toString("base64");
    const mimeType = req.file.mimetype;
    var userData = {};
    if (req.body.userData) {
      try { userData = JSON.parse(req.body.userData); } catch(e) {}
    }
    var profile = "";
    if (userData.age) profile += "Age: " + userData.age + ". ";
    if (userData.sex) profile += "Sex: " + userData.sex + ". ";
    if (userData.ethnicity) profile += "Ethnicity: " + userData.ethnicity + ". ";
    if (userData.sleep) profile += "Sleep: " + userData.sleep + " hrs. ";
    if (userData.stress) profile += "Stress: " + userData.stress + ". ";
    if (userData.diet) profile += "Diet: " + userData.diet + ". ";
    if (userData.smoker) profile += "Smoker: " + userData.smoker + ". ";
    if (userData.alcohol) profile += "Alcohol: " + userData.alcohol + ". ";
    if (userData.diseases && userData.diseases.length > 0) {
      profile += "Family history: " + userData.diseases.join(", ") + ". ";
    }
    var prompt = "You are VITAL, an AI health intelligence system. Health profile: " + profile + " Analyze this selfie carefully. Respond ONLY with valid JSON and nothing else: {\"biologicalAge\": 25, \"chronologicalAgeDiff\": \"older by 2 years\", \"agingVelocity\": \"faster than average\", \"agingRate\": \"1.2x faster than baseline\", \"skinHealth\": \"72/100\", \"hydration\": \"68%\", \"inflammation\": \"mild\", \"sleepSignal\": \"deprived\", \"oilBalance\": \"combination\", \"collagenScore\": \"74/100\", \"stressMarkers\": \"moderate\", \"diseaseRisk\": {\"metabolic\": \"28%\", \"cardiovascular\": \"12%\", \"inflammation\": \"35%\", \"hormonal\": \"18%\"}, \"topInsights\": [\"insight 1\", \"insight 2\", \"insight 3\"], \"positives\": [\"positive 1\", \"positive 2\"], \"recommendations\": [\"rec 1\", \"rec 2\", \"rec 3\"]}. Replace ALL placeholder values with your real analysis of the photo and health profile provided.";
    const response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimeType, data: base64Image }},
          { type: "text", text: prompt }
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
app.listen(3000, () => { console.log("VITAL app running at http://localhost:3000"); });
