cons t express = require("express");
const multer = require("multer");
const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const app = express();
const upload = multer({ dest: "uploads/" });
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
app.get("/", (req, res) => { res.redirect("/auth.html"); });
app.use(express.static("public"));
app.get("/config", (req, res) => {
  res.json({
    supabaseUrl: "https://xdtvecuitjnumobmsrhj.supabase.co",
    supabaseKey: "sb_publishable_HqxQ_1RqmVazq4BfkMhNwg_Th6JKCsL"
  });
});
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
    if (userData.age) profile += "Chronological age: " + userData.age + ". ";
    if (userData.sex) profile += "Sex: " + userData.sex + ". ";
    if (userData.height) profile += "Height: " + userData.height + ". ";
    if (userData.weight) profile += "Weight: " + userData.weight + ". ";
    if (userData.ethnicity) profile += "Ethnicity: " + userData.ethnicity + ". ";
    if (userData.fitness) profile += "Fitness level: " + userData.fitness + ". ";
    if (userData.sleep) profile += "Sleep: " + userData.sleep + " hours per night. ";
    if (userData.water) profile += "Water intake: " + userData.water + "L per day. ";
    if (userData.diet) profile += "Diet: " + userData.diet + ". ";
    if (userData.stress) profile += "Stress level: " + userData.stress + ". ";
    if (userData.smoker && userData.smoker !== "no") profile += "Smoking: " + userData.smoker + ". ";
    if (userData.alcohol && userData.alcohol !== "none") profile += "Alcohol: " + userData.alcohol + ". ";
    if (userData.bloodType) profile += "Blood type: " + userData.bloodType + ". ";
    if (userData.sunExposure) profile += "Sun exposure: " + userData.sunExposure + ". ";
    if (userData.exerciseDays) profile += "Exercise: " + userData.exerciseDays + " days per week. ";
    if (userData.screenTime) profile += "Screen time: " + userData.screenTime + ". ";
    if (userData.supplements) profile += "Supplements: " + userData.supplements + ". ";
    if (userData.diseases && userData.diseases.length > 0) {
      profile += "Family history: " + userData.diseases.join(", ") + ". ";
    }
    var prompt = "You are VITAL, the world's most advanced AI health intelligence system. Analyze this real selfie photo with extreme precision using the health profile below.\n\nHEALTH PROFILE:\n" + profile + "\n\nPERFORM A COMPREHENSIVE FACIAL BIOMARKER ANALYSIS:\n\n1. SKIN: texture, pore size, hydration vs dullness, oiliness, redness, pigmentation, sun damage, acne, scarring\n2. AGING: wrinkle depth at forehead, crow feet, nasolabial folds, jawline sagging, cheek volume loss, lip thinning\n3. INFLAMMATION: under-eye puffiness and bags, facial swelling, redness patterns, asymmetry\n4. LIFESTYLE SIGNALS: dark circles type (purple vascular vs brown pigmentation), sleep deprivation signs, dehydration, stress lines, cortisol breakout patterns\n5. COLLAGEN: skin firmness, elasticity appearance, sagging, vertical lip lines\n6. HORMONAL SIGNALS: acne distribution patterns, facial hair signals, temple hair loss\n7. DISEASE RISK: metabolic signals, cardiovascular facial signs, inflammatory skin patterns\n\nBIOLOGICAL AGE RULES - apply based on BOTH visual evidence AND health profile:\n- Smoking: +3 to +7 years\n- Heavy alcohol: +2 to +4 years\n- High stress: +1 to +3 years\n- Sleep under 6hrs: +2 to +4 years\n- High unprotected sun: +2 to +5 years\n- Poor diet: +1 to +2 years\n- Athlete or very active: -2 to -4 years\n- Mediterranean diet: -1 to -2 years\n- Good supplements: -1 to -2 years\n- Family history early aging: +1 to +3 years\n\nBe honest and precise. Do not over-flatter. Reference specific things you actually see.\n\nRespond ONLY with this JSON: {\"biologicalAge\": 25, \"chronologicalAgeDiff\": \"older by 2 years\", \"agingVelocity\": \"faster than average\", \"agingRate\": \"1.2x faster\", \"skinHealth\": \"72/100\", \"hydration\": \"68%\", \"inflammation\": \"mild\", \"sleepSignal\": \"deprived\", \"oilBalance\": \"combination\", \"collagenScore\": \"74/100\", \"stressMarkers\": \"moderate\", \"diseaseRisk\": {\"metabolic\": \"28%\", \"cardiovascular\": \"12%\", \"inflammation\": \"35%\", \"hormonal\": \"18%\"}, \"topInsights\": [\"specific insight 1\", \"specific insight 2\", \"specific insight 3\", \"specific insight 4\"], \"positives\": [\"specific positive 1\", \"specific positive 2\"], \"recommendations\": [\"specific rec 1\", \"specific rec 2\", \"specific rec 3\"]}. Replace ALL values with real analysis referencing what you actually observe.";

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
app.listen(3000, () => { console.log("VITAL running"); });
