const express = require("express");
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
    if (userData.ethnicity) profile += "Ethnicity: " + userData.ethnicity + " (critical for skin tone baseline calibration). ";
    if (userData.fitness) profile += "Fitness level: " + userData.fitness + ". ";
    if (userData.sleep) profile += "Sleep: " + userData.sleep + " hours per night. ";
    if (userData.water) profile += "Water intake: " + userData.water + "L per day. ";
    if (userData.diet) profile += "Diet: " + userData.diet + ". ";
    if (userData.stress) profile += "Stress level: " + userData.stress + ". ";
    if (userData.smoker && userData.smoker !== "no") profile += "Smoking status: " + userData.smoker + ". ";
    if (userData.alcohol && userData.alcohol !== "none") profile += "Alcohol: " + userData.alcohol + ". ";
    if (userData.bloodType) profile += "Blood type: " + userData.bloodType + ". ";
    if (userData.sunExposure) profile += "Sun exposure: " + userData.sunExposure + ". ";
    if (userData.exerciseDays) profile += "Exercise frequency: " + userData.exerciseDays + " days per week. ";
    if (userData.screenTime) profile += "Screen time: " + userData.screenTime + " daily. ";
    if (userData.supplements) profile += "Supplements taken: " + userData.supplements + ". ";
    if (userData.diseases && userData.diseases.length > 0) {
      profile += "Family disease history: " + userData.diseases.join(", ") + ". ";
    }

    var prompt = "You are VITAL, the world's most advanced AI health intelligence system. Analyze this real selfie photo with extreme precision using the health profile below.\n\nHEALTH PROFILE:\n" + profile + "\n\nPERFORM A COMPREHENSIVE FACIAL BIOMARKER ANALYSIS:\n\n1. SKIN QUALITY ASSESSMENT:\n- Texture smoothness vs roughness\n- Pore size and visibility\n- Surface irregularities, bumps, texture\n- Active acne, blackheads, whiteheads\n- Scarring or post-acne marks\n- Skin tone evenness vs blotchiness\n- Redness, rosacea, broken capillaries\n- Pigmentation spots, sun damage, melasma\n\n2. HYDRATION & OIL ANALYSIS:\n- Skin plumpness and dewiness (hydrated) vs dullness and tightness (dehydrated)\n- Shine patterns indicating oil production zones\n- Under-eye hollowness or puffiness\n- Lip dryness or moisture\n\n3. AGING BIOMARKERS:\n- Forehead lines: depth, length, number\n- Crow's feet around eyes: severity\n- Nasolabial folds (smile lines): depth\n- Marionette lines: presence\n- Under-eye wrinkles and crepiness\n- Jawline definition vs sagging\n- Neck and jowl area if visible\n- Lip thinning and lip line definition\n- Temple hollowing\n- Cheek volume and fullness\n\n4. COLLAGEN & ELASTICITY:\n- Skin bounce and firmness appearance\n- Sagging around jaw and cheeks\n- Skin thickness appearance\n- Vertical lip lines\n\n5. INFLAMMATION INDICATORS:\n- Facial puffiness especially morning puffiness signals\n- Under-eye bag severity\n- General facial swelling\n- Redness distribution\n- Asymmetry that may indicate inflammatory imbalance\n\n6. LIFESTYLE BIOMARKERS FROM FACE:\n- Dark circles: purple (vascular, hereditary) vs brown (pigmentation) vs hollow (structural aging)\n- Sleep deprivation: dull skin, drooping, puffiness\n- Dehydration: lack of plumpness, dull grey tone\n- Stress: tension in forehead, jaw clenching signs, cortisol-pattern breakouts\n- Poor nutrition: pallor, dull hair-adjacent skin\n- Alcohol use: facial puffiness, spider veins, redness\n- Sun damage: texture, pigmentation, premature lines\n\n7. DISEASE RISK SIGNALS:\n- Metabolic risk: facial puffiness, skin texture changes\n- Cardiovascular: facial flushing, visible veins\n- Hormonal: acne distribution, facial hair (females), hair loss patterns at temples\n- Inflammation: chronic redness, skin reactivity patterns\n\nBIOLOGICAL AGE CALCULATION RULES:\nStart with chronological age as baseline. Apply adjustments based on BOTH visual evidence AND health profile:\n- Smoking: +3 to +7 years (accelerates aging significantly)\n- Heavy alcohol: +2 to +4 years\n- High stress: +1 to +3 years\n- Sleep under 6hrs: +2 to +4 years\n- High unprotected sun exposure: +2 to +5 years\n- Poor diet / fast food: +1 to +2 years\n- Athlete or very active: -2 to -4 years\n- Mediterranean or clean diet: -1 to -2 years\n- Good supplements (omega3, vit D, collagen): -1 to -2 years\n- Excellent hydration: -1 year\n- Family history of early aging diseases: +1 to +3 years\n\nIMPORTANT: Be honest and precise. Do not over-flatter. If someone shows signs of accelerated aging report it accurately. If they look younger than their age, report that too. The biological age must reflect BOTH what you see in the face AND the lifestyle data provided.\n\nRESPOND ONLY WITH THIS EXACT JSON — NO OTHER TEXT:\n{\"biologicalAge\": 25, \"chronologicalAgeDiff\": \"older by 3 years\", \"agingVelocity\": \"faster than average\", \"agingRate\": \"1.3x faster than baseline\", \"skinHealth\": \"71/100\", \"hydration\": \"65%\", \"inflammation\": \"mild\", \"sleepSignal\": \"deprived\", \"oilBalance\": \"combination\", \"collagenScore\": \"73/100\", \"stressMarkers\": \"moderate\", \"diseaseRisk\": {\"metabolic\": \"24%\", \"cardiovascular\": \"11%\", \"inflammation\": \"38%\", \"hormonal\": \"19%\"}, \"topInsights\": [\"specific observation about what you actually see in skin or face\", \"specific observation 2\", \"specific observation 3\", \"specific observation 4\"], \"positives\": [\"specific positive marker you observe\", \"specific positive 2\"], \"recommendations\": [\"specific actionable recommendation based on what you see\", \"specific recommendation 2\", \"specific recommendation 3\"]}\n\nReplace ALL placeholder values with real analysis. Every insight must reference something specific you observe in the photo or the health profile data.";

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
