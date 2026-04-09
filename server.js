const express = require("express");
const multer = require("multer");
const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");

const app = express();
const upload = multer({ dest: "uploads/" });
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(express.static("public"));
app.use(express.json());

function parseCookies(req) {
  var cookies = {};
  var header = req.headers.cookie;
  if (!header) return cookies;
  header.split(";").forEach(function(c) {
    var parts = c.trim().split("=");
    var key = parts[0].trim();
    var val = parts.slice(1).join("=").trim();
    cookies[key] = decodeURIComponent(val);
  });
  return cookies;
}

app.get("/", function(req, res) { res.sendFile(__dirname + "/public/auth.html"); });
app.get("/config", function(req, res) {
  res.json({
    supabaseUrl: "https://xdtvecuitjnumobmsrhj.supabase.co",
    supabaseKey: "sb_publishable_HqxQ_1RqmVazq4BfkMhNwg_Th6JKCsL"
  });
});

app.post("/save-user", function(req, res) {
  var user = req.body.user;
  var session = req.body.session;
  if (!user) return res.json({ success: false });
  var headers = [];
  headers.push("vital_user=" + encodeURIComponent(JSON.stringify(user)) + "; Max-Age=" + (365*24*60*60) + "; Path=/; SameSite=Lax");
  if (session) headers.push("vital_session=" + encodeURIComponent(session) + "; Max-Age=" + (365*24*60*60) + "; Path=/; SameSite=Lax");
  res.setHeader("Set-Cookie", headers);
  res.json({ success: true });
});

app.post("/save-scans", function(req, res) {
  var scans = req.body.scans;
  if (!scans) return res.json({ success: false });
  res.setHeader("Set-Cookie", "vital_scans=" + encodeURIComponent(JSON.stringify(scans)) + "; Max-Age=" + (365*24*60*60) + "; Path=/; SameSite=Lax");
  res.json({ success: true });
});

app.post("/save-avatar", function(req, res) {
  var avatar = req.body.avatar;
  if (!avatar) return res.json({ success: false });
  res.setHeader("Set-Cookie", "vital_avatar=" + encodeURIComponent(avatar) + "; Max-Age=" + (365*24*60*60) + "; Path=/; SameSite=Lax");
  res.json({ success: true });
});

app.get("/get-data", function(req, res) {
  var cookies = parseCookies(req);
  var user = null;
  var scans = "[]";
  var avatar = null;
  try { if (cookies.vital_user) user = JSON.parse(cookies.vital_user); } catch(e) {}
  try { if (cookies.vital_scans) scans = cookies.vital_scans; } catch(e) {}
  try { if (cookies.vital_avatar) avatar = cookies.vital_avatar; } catch(e) {}
  res.json({ user: user, session: cookies.vital_session || null, scans: scans, avatar: avatar });
});

app.post("/signout", function(req, res) {
  var headers = [
    "vital_user=; Max-Age=0; Path=/; SameSite=Lax",
    "vital_session=; Max-Age=0; Path=/; SameSite=Lax"
  ];
  res.setHeader("Set-Cookie", headers);
  res.json({ success: true });
});

app.post("/analyze", upload.single("photo"), async function(req, res) {
  try {
    var imageData = fs.readFileSync(req.file.path);
    var base64Image = imageData.toString("base64");
    var mimeType = req.file.mimetype;
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
    if (userData.screenTime) profile += "Screen time: " + userData.screenTime + " daily. ";
    if (userData.supplements) profile += "Supplements: " + userData.supplements + ". ";
    if (userData.diseases && userData.diseases.length > 0) {
      profile += "Family disease history: " + userData.diseases.join(", ") + ". ";
    }
    var p1 = "You are VITAL, the worlds most advanced AI health intelligence system. You analyze facial biomarkers with the precision of a medical-grade diagnostic tool combined with a longevity physician. ";
    var p2 = "Analyze this selfie photo with extreme clinical precision using the health profile below. Go deeper than surface level — look for subtle micro-indicators that most systems miss.\n\n";
    var p3 = "HEALTH PROFILE:\n" + profile + "\n\n";
    var p4 = "PERFORM A DEEP CLINICAL FACIAL BIOMARKER ANALYSIS — be specific, not generic:\n\n";
    var p5 = "1. SKIN QUALITY: Examine texture at a micro level — identify specific zones of congestion, dehydration lines vs true wrinkles, comedone patterns, inflammatory papules, sebaceous activity by zone. Note exact skin tone evenness, barrier integrity signals, and oxidative stress markers.\n";
    var p6 = "2. AGING MARKERS: Look beyond obvious lines. Examine periorbital skin crepiness, glabellar line depth, marionette line formation, jowl laxity, temporal hollowing, lip vermillion thinning, and philtrum elongation. Cross-reference with chronological age to determine precise aging delta.\n";
    var p7 = "3. COLLAGEN AND ELASTIN: Assess skin rebound signals, nasolabial depth relative to age, malar fat pad position, under-eye hollowing vs puffiness distinction, and dermal thickness indicators.\n";
    var p8 = "4. INFLAMMATION AND IMMUNE SIGNALS: Identify erythema patterns, telangiectasia, periorbital darkening type (vascular vs pigmented vs structural), facial edema distribution, and lymphatic drainage signals.\n";
    var p9 = "5. LIFESTYLE BIOMARKERS: Detect cortisol stress patterns in skin texture, blue light oxidative damage, dehydration at cellular vs surface level, nutritional deficiency signals (pallor, dullness, nail-adjacent skin), and sleep debt accumulation markers.\n";
    var p10 = "6. DISEASE RISK — link visible markers to specific organ systems: liver stress signals (skin tone, periorbital color), cardiovascular indicators (facial flushing patterns, ear lobe creasing if visible), hormonal imbalance (jaw acne, hairline recession, facial hair patterns), metabolic syndrome markers (fat distribution patterns visible in face), and neurological stress signals.\n";
    var p11 = "7. OIL BALANCE AND SKIN TYPE: Classify with precision — identify specific zone behavior (T-zone vs U-zone), sebum overproduction triggers visible in pore morphology, and dehydrated-oily skin distinction.\n";
    var p12 = "8. FACE SYMMETRY: Measure left vs right deviation across 5 landmarks — eye level, brow arch, nostril width, mouth corner height, jawline angle. Identify whether asymmetry is structural, muscular, inflammatory, or positional. Score 0-100. Note any asymmetry that could indicate underlying health issues.\n\n";
    var p13 = "BIOLOGICAL AGE CALCULATION — apply all relevant modifiers from profile:\n";
    var p14 = "Smoking +3 to +7. Heavy alcohol +2 to +4. Very high stress +2 to +4. Sleep under 6hrs +2 to +4. High sun unprotected +2 to +5. Poor diet +1 to +3. Obesity markers +1 to +3.\n";
    var p15 = "Athlete -2 to -4. Mediterranean diet -1 to -2. Good supplements -1 to -2. Optimal sleep -1. Low stress -1.\n";
    var p16 = "Family history of early aging diseases +1 to +3. Cross reference ALL profile data with visual markers for maximum accuracy.\n\n";
    var p17 = "Be brutally honest. Do not over-flatter. If something is concerning, say so specifically. Use clinical language translated into plain English.\n\n";
    var p18 = "For recommendations: rank them 1 to 5 by highest biological impact. Label each with its impact level: [CRITICAL], [HIGH], or [MODERATE]. Start each with the specific organ or system it targets.\n\n";
    var p19 = "RESPOND ONLY WITH RAW JSON. NO MARKDOWN. NO BACKTICKS. NO EXTRA TEXT:\n";
    var p20 = "{\"biologicalAge\":25,\"chronologicalAgeDiff\":\"older by 3 years\",\"agingVelocity\":\"faster than average\",\"agingRate\":\"1.3x faster than baseline\",\"skinHealth\":\"71/100\",\"hydration\":\"65%\",\"inflammation\":\"mild\",\"sleepSignal\":\"deprived\",\"oilBalance\":\"combination-oily T-zone\",\"collagenScore\":\"73/100\",\"stressMarkers\":\"moderate-high\",\"faceSymmetry\":\"84/100\",\"diseaseRisk\":{\"metabolic\":\"34%\",\"cardiovascular\":\"18%\",\"inflammation\":\"42%\",\"hormonal\":\"29%\"},\"topInsights\":[\"specific clinical insight linking visible marker to organ system\",\"specific clinical insight 2\",\"specific clinical insight 3\",\"specific clinical insight 4\"],\"positives\":[\"specific positive marker 1\",\"specific positive marker 2\",\"specific positive marker 3\"],\"recommendations\":[\"[CRITICAL] Organ/system: specific action and why it matters most\",\"[HIGH] Organ/system: specific action\",\"[HIGH] Organ/system: specific action\",\"[MODERATE] Organ/system: specific action\",\"[MODERATE] Organ/system: specific action\"]}\n\n";
    var p21 = "Replace ALL placeholder values with real analysis. Every insight and recommendation must reference something specifically visible in the photo or directly tied to the health profile data.";
    var prompt = p1+p2+p3+p4+p5+p6+p7+p8+p9+p10+p11+p12+p13+p14+p15+p16+p17+p18+p19+p20+p21;
    var response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 2500,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimeType, data: base64Image } },
          { type: "text", text: prompt }
        ]
      }]
    });
    var resultText = response.content[0].text;
    var cleanJson = resultText.replace(/```json|```/g, "").trim();
    var result = JSON.parse(cleanJson);
    fs.unlinkSync(req.file.path);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(3000, function() { console.log("VITAL running on port 3000"); });
