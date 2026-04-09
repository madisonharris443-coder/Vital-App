const express = require(“express”);
const multer = require(“multer”);
const Anthropic = require(”@anthropic-ai/sdk”);
const fs = require(“fs”);

const app = express();
const upload = multer({ dest: “uploads/” });
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(express.static(“public”));
app.use(express.json());

function parseCookies(req) {
var cookies = {};
var header = req.headers.cookie;
if (!header) return cookies;
header.split(”;”).forEach(function(c) {
var parts = c.trim().split(”=”);
var key = parts[0].trim();
var val = parts.slice(1).join(”=”).trim();
cookies[key] = decodeURIComponent(val);
});
return cookies;
}

app.get(”/”, (req, res) => { res.redirect(”/auth.html”); });

app.get(”/config”, (req, res) => {
res.json({
supabaseUrl: “https://xdtvecuitjnumobmsrhj.supabase.co”,
supabaseKey: “sb_publishable_HqxQ_1RqmVazq4BfkMhNwg_Th6JKCsL”
});
});

app.post(”/save-user”, (req, res) => {
var user = req.body.user;
var session = req.body.session;
if (!user) return res.json({ success: false });
var headers = [];
headers.push(“vital_user=” + encodeURIComponent(JSON.stringify(user)) + “; Max-Age=” + (365*24*60*60) + “; Path=/; SameSite=Lax”);
if (session) headers.push(“vital_session=” + encodeURIComponent(session) + “; Max-Age=” + (365*24*60*60) + “; Path=/; SameSite=Lax”);
res.setHeader(“Set-Cookie”, headers);
res.json({ success: true });
});

app.post(”/save-scans”, (req, res) => {
var scans = req.body.scans;
if (!scans) return res.json({ success: false });
res.setHeader(“Set-Cookie”, “vital_scans=” + encodeURIComponent(JSON.stringify(scans)) + “; Max-Age=” + (365*24*60*60) + “; Path=/; SameSite=Lax”);
res.json({ success: true });
});

app.post(”/save-avatar”, (req, res) => {
var avatar = req.body.avatar;
if (!avatar) return res.json({ success: false });
res.setHeader(“Set-Cookie”, “vital_avatar=” + encodeURIComponent(avatar) + “; Max-Age=” + (365*24*60*60) + “; Path=/; SameSite=Lax”);
res.json({ success: true });
});

app.get(”/get-data”, (req, res) => {
var cookies = parseCookies(req);
var user = null;
var scans = “[]”;
var avatar = null;
try { if (cookies.vital_user) user = JSON.parse(cookies.vital_user); } catch(e) {}
try { if (cookies.vital_scans) scans = cookies.vital_scans; } catch(e) {}
try { if (cookies.vital_avatar) avatar = cookies.vital_avatar; } catch(e) {}
res.json({ user: user, session: cookies.vital_session || null, scans: scans, avatar: avatar });
});

app.post(”/signout”, (req, res) => {
var headers = [
“vital_user=; Max-Age=0; Path=/; SameSite=Lax”,
“vital_session=; Max-Age=0; Path=/; SameSite=Lax”
];
res.setHeader(“Set-Cookie”, headers);
res.json({ success: true });
});

app.post(”/analyze”, upload.single(“photo”), async (req, res) => {
try {
const imageData = fs.readFileSync(req.file.path);
const base64Image = imageData.toString(“base64”);
const mimeType = req.file.mimetype;
var userData = {};
if (req.body.userData) {
try { userData = JSON.parse(req.body.userData); } catch(e) {}
}
var profile = “”;
if (userData.age) profile += “Chronological age: “ + userData.age + “. “;
if (userData.sex) profile += “Sex: “ + userData.sex + “. “;
if (userData.height) profile += “Height: “ + userData.height + “. “;
if (userData.weight) profile += “Weight: “ + userData.weight + “. “;
if (userData.ethnicity) profile += “Ethnicity: “ + userData.ethnicity + “ (critical for skin tone baseline). “;
if (userData.fitness) profile += “Fitness level: “ + userData.fitness + “. “;
if (userData.sleep) profile += “Sleep: “ + userData.sleep + “ hours per night. “;
if (userData.water) profile += “Water intake: “ + userData.water + “L per day. “;
if (userData.diet) profile += “Diet: “ + userData.diet + “. “;
if (userData.stress) profile += “Stress level: “ + userData.stress + “. “;
if (userData.smoker && userData.smoker !== “no”) profile += “Smoking: “ + userData.smoker + “. “;
if (userData.alcohol && userData.alcohol !== “none”) profile += “Alcohol: “ + userData.alcohol + “. “;
if (userData.bloodType) profile += “Blood type: “ + userData.bloodType + “. “;
if (userData.sunExposure) profile += “Sun exposure: “ + userData.sunExposure + “. “;
if (userData.exerciseDays) profile += “Exercise: “ + userData.exerciseDays + “ days per week. “;
if (userData.screenTime) profile += “Screen time: “ + userData.screenTime + “ daily. “;
if (userData.supplements) profile += “Supplements: “ + userData.supplements + “. “;
if (userData.diseases && userData.diseases.length > 0) {
profile += “Family disease history: “ + userData.diseases.join(”, “) + “. “;
}

```
var prompt = "You are VITAL, the world's most advanced AI health intelligence system. Analyze this real selfie photo with extreme precision using the health profile below.\n\nHEALTH PROFILE:\n" + profile + "\n\nPERFORM A COMPREHENSIVE FACIAL BIOMARKER ANALYSIS:\n\n1. SKIN QUALITY: texture, pore size, hydration vs dullness, oiliness, redness, pigmentation, sun damage, acne\n2. AGING MARKERS: forehead lines, crow's feet, nasolabial folds, jawline definition, cheek volume, lip thinning\n3. COLLAGEN: skin plumpness, elasticity, firmness, sagging\n4. INFLAMMATION: puffiness, under-eye bags, redness patterns\n5. LIFESTYLE SIGNALS: dark circles, dull complexion, stress lines, dehydration signs\n6. DISEASE RISK SIGNALS: metabolic, cardiovascular, hormonal, inflammatory patterns\n7. OIL BALANCE: t-zone, combination, dry, oily patterns\n8. FACE SYMMETRY: carefully compare the left and right sides of the face. Analyze eye level alignment, nostril symmetry, mouth corner alignment, cheekbone balance, and jawline evenness. Score from 0-100 where 100 is perfect symmetry. Note that slight asymmetry is normal. Significant asymmetry can indicate inflammation, muscle imbalance, or other health signals. Express as a score like '84/100'.\n\nBIOLOGICAL AGE RULES:\n- Smoking: +3 to +7 years\n- Heavy alcohol: +2 to +4 years\n- High stress: +1 to +3 years\n- Sleep under 6hrs: +2 to +4 years\n- High unprotected sun: +2 to +5 years\n- Poor diet: +1 to +2 years\n- Athlete/very active: -2 to -4 years\n- Mediterranean diet: -1 to -2 years\n- Good supplements: -1 to -2 years\n- Family history early aging: +1 to +3 years\n\nBe honest and precise. Do not over-flatter.\n\nRESPOND ONLY WITH THIS EXACT JSON (no markdown, no backticks):\n{\"biologicalAge\": 25, \"chronologicalAgeDiff\": \"older by 3 years\", \"agingVelocity\": \"faster than average\", \"agingRate\": \"1.3x faster than baseline\", \"skinHealth\": \"71/100\", \"hydration\": \"65%\", \"inflammation\": \"mild\", \"sleepSignal\": \"deprived\", \"oilBalance\": \"combination\", \"collagenScore\": \"73/100\", \"stressMarkers\": \"moderate\", \"faceSymmetry\": \"84/100\", \"diseaseRisk\": {\"metabolic\": \"24%\", \"cardiovascular\": \"11%\", \"inflammation\": \"38%\", \"hormonal\": \"19%\"}, \"topInsights\": [\"insight 1\", \"insight 2\", \"insight 3\", \"insight 4\"], \"positives\": [\"positive 1\", \"positive 2\"], \"recommendations\": [\"rec 1\", \"rec 2\", \"rec 3\"]}\n\nReplace ALL values with real analysis from the photo.";

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
```

} catch (error) {
console.error(“Error:”, error);
res.status(500).json({ success: false, error: error.message });
}
});

app.listen(3000, () => { console.log(“VITAL app running at http://localhost:3000”); });