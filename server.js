const express = require("express");
const multer = require("multer");
const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");

const app = express();
const upload = multer({ dest: "uploads/" });
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(express.static(__dirname));
app.post("/analyze", upload.single("photo"), async (req, res) => {
  try {
    const imageData = fs.readFileSync(req.file.path);
    const base64Image = imageData.toString("base64");
    const mimeType = req.file.mimetype;

    var userData = {};
    if (req.body.userData) {
      try { userData = JSON.parse(req.body.userData); } catch(e) {}
    }

    var profileText = "User health profile: ";
    if (userData.age) profileText += "Age " + userData.age + ", ";
    if (userData.sex) profileText += "Sex: " + userData.sex + ", ";
    if (userData.height) profileText += "Height: " + userData.height + "cm, ";
    if (userData.weight) profileText += "Weight: " + userData.weight + "kg, ";
    if (userData.ethnicity) profileText += "Ethnicity: " + userData.ethnicity + ", ";
    if (userData.fitness) profileText += "Fitness: " + userData.fitness + ", ";
    if (userData.sleep) profileText += "Sleep: " + userData.sleep + " hrs/night, ";
    if (userData.water) profileText += "Water intake: " + userData.water + "L/day, ";
    if (userData.diet) profileText += "Diet: " + userData.diet + ", ";
    if (userData.stress) profileText += "Stress: " + userData.stress + ", ";
    if (userData.smoker) profileText += "Smoker: " + userData.smoker + ", ";
    if (userData.alcohol) profileText += "Alcohol: " + userData.alcohol + ", ";
    if (userData.diseases && userData.diseases.length > 0) profileText += "Family disease history: " + userData.diseases.join(", ") + ". ";

    var promptText = profileText + " Now analyze this selfie photo carefully. Consider all the health profile data above alongside the visual facial markers. Respond ONLY with valid JSON and nothing else: {\"biologicalAge\": 25, \"chronologicalAgeDiff\": \"older by 2 years\", \"agingVelocity\": \"faster\", \"skinHealth\": \"72/100\", \"hydration\": \"68%\", \"inflammation\": \"mild\", \"sleepSignal\": \"deprived\", \"topInsights\": [\"insight 1\", \"insight 2\", \"insight 3\"]}. Replace all values with real analysis based on both the photo and health profile. Make the biological age estimate accurate by factoring in ALL the profile data provided.";

    const response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimeType, data: base64Image }},
          { type: "text", text: promptText }
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
