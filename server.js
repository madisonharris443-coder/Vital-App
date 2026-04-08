const express = require("express");
const multer = require("multer");
const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const cookieParser = require("cookie-parser");

const app = express();
const upload = multer({ dest: "uploads/" });
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(express.static("public"));
app.use(express.json());
app.use(cookieParser());

app.get("/", (req, res) => { res.redirect("/auth.html"); });

app.get("/config", (req, res) => {
  res.json({
    supabaseUrl: "https://xdtvecuitjnumobmsrhj.supabase.co",
    supabaseKey: "sb_publishable_HqxQ_1RqmVazq4BfkMhNwg_Th6JKCsL"
  });
});

app.post("/save-user", (req, res) => {
  var user = req.body.user;
  var session = req.body.session;
  if (!user) return res.json({ success: false });
  res.cookie("vital_user", JSON.stringify(user), { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: false, sameSite: "lax" });
  if (session) res.cookie("vital_session", session, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: false, sameSite: "lax" });
  res.json({ success: true });
});

app.post("/save-scans", (req, res) => {
  var scans = req.body.scans;
  if (!scans) return res.json({ success: false });
  res.cookie("vital_scans", JSON.stringify(scans), { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: false, sameSite: "lax" });
  res.json({ success: true });
});

app.get("/get-data", (req, res) => {
  res.json({
    user: req.cookies.vital_user || null,
    session: req.cookies.vital_session || null,
    scans: req.cookies.vital_scans || "[]",
    avatar: req.cookies.vital_avatar || null
  });
});

app.post("/save-avatar", (req, res) => {
  var avatar = req.body.avatar;
  if (!avatar) return res.json({ success: false });
  res.cookie("vital_avatar", avatar, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: false, sameSite: "lax" });
  res.json({ success: true });
});

app.post("/signout", (req, res) => {
  res.clearCookie("vital_user");
  res.clearCookie("vital_session");
  res.json({ success: true });
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
    var prompt = "You are VITAL, the world's most advanced AI health intelligence system. Analyze this real selfie photo with extreme precision using the health profile below.\n\nHEALTH PROFILE:\n" + profile + "\n\nPERFORM A COMPREHENSIVE FACIAL BIOMARKER ANALYSIS:\n\n1. SKIN QUALITY: texture, pore size, hydration vs dullness, oiliness, redness, pigmentation, sun damage, acne\n2. AGING MARKERS: forehead lines, crow's feet, nasolabial folds, jawline definition, cheek volume, lip thinning\n3. COLLAGEN: skin plumpness, elasticity, firmness, sagging\n4. INFLAMMATION: puffiness, under-eye bags, redness patterns, facial asymmetry\n5. LIFESTYLE SIGNALS: dark circles, dull complexion, stress lines, dehydration signs\n6. DISEASE RISK SIGNALS: metabolic, cardiovascular, hormonal, inflammatory patterns\n\nBIOLOGICAL AGE RULES - apply to chronological age:\n- Smoking: +3 to +7 years\n- Heavy alcohol: +2 to +4 years\n- High stress: +1 to +3 years\n- Sleep under 6hrs: +2 to +4 years\n- High unprotected sun: +2 to +5 years\n- Poor diet: +1 to +2 years\n- Athlete/very active: -2 to -4 years\n- Mediterranean diet: -1 to -2 years\n- Good supplements: -1 to -2 years\n- Family history early aging: +1 to +3 years\n\nBe honest and precise. Do not over-flatter.\n\nRESPOND ONLY WITH THIS EXACT JSON:\n{\"biologicalAge\": 25, \"chronologicalAgeDiff\": \"older by 3 years\", \"agingVelocity\": \"faster than average\", \"agingRate\": \"1.3x faster than baseline\", \"skinHealth\": \"71/100\", \"hydration\": \"65%\", \"inflammation\": \"mild\", \"sleepSignal\": \"deprived\", \"oilBalance\": \"combination\", \"collagenScore\": \"73/100\", \"stressMarkers\": \"moderate\", \"diseaseRisk\": {\"metabolic\": \"24%\", \"cardiovascular\": \"11%\", \"inflammation\": \"38%\", \"hormonal\": \"19%\"}, \"topInsights\": [\"specific insight 1\", \"specific insight 2\", \"specific insight 3\", \"specific insight 4\"], \"positives\": [\"specific positive 1\", \"specific positive 2\"], \"recommendations\": [\"specific recommendation 1\", \"specific recommendation 2\", \"specific recommendation 3\"]}\n\nReplace ALL values with real analysis.";

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
