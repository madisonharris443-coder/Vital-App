const express = require("express");
const multer = require("multer");
const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const upload = multer({ dest: "uploads/" });
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SUPABASE_URL = "https://xdtvecuitjnumobmsrhj.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

app.use(express.json());
app.get("/", function(req, res) { res.sendFile(__dirname + "/public/auth.html"); });
app.use(express.static("public"));

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

function getSupabase(token) {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    global: { headers: { Authorization: "Bearer " + token } }
  });
}

app.get("/config", function(req, res) {
  res.json({
    supabaseUrl: SUPABASE_URL,
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

app.post("/save-scans", async function(req, res) {
  var scans = req.body.scans;
  var cookies = parseCookies(req);
  var session = cookies.vital_session;
  if (!scans) return res.json({ success: false });
  if (session && SUPABASE_SERVICE_KEY) {
    try {
      var supabase = getSupabase(session);
      var userRes = await supabase.auth.getUser();
      if (userRes.data && userRes.data.user) {
        var userId = userRes.data.user.id;
        var latest = scans[scans.length - 1];
        var insertRes = await supabase.from("scans").insert({ user_id: userId, data: latest });
        if (insertRes.error) { console.error("Supabase insert error:", insertRes.error); }
        else { console.log("Scan saved to Supabase successfully"); }
      } else { console.error("No user found in session"); }
    } catch(e) { console.error("Supabase save error:", e.message); }
  }
  res.setHeader("Set-Cookie", "vital_scans=" + encodeURIComponent(JSON.stringify(scans)) + "; Max-Age=" + (365*24*60*60) + "; Path=/; SameSite=Lax");
  res.json({ success: true });
});

app.get("/get-scans", async function(req, res) {
  var cookies = parseCookies(req);
  var session = cookies.vital_session;
  if (session && SUPABASE_SERVICE_KEY) {
    try {
      var supabase = getSupabase(session);
      var userRes = await supabase.auth.getUser();
      if (userRes.data && userRes.data.user) {
        var userId = userRes.data.user.id;
        var result = await supabase.from("scans").select("*").eq("user_id", userId).order("created_at", { ascending: true });
        if (result.data && result.data.length > 0) {
          var scans = result.data.map(function(row) { return row.data; });
          return res.json({ success: true, scans: scans });
        }
      }
    } catch(e) { console.error("Supabase get error:", e.message); }
  }
  var cookieScans = cookies.vital_scans;
  try {
    var parsed = cookieScans ? JSON.parse(cookieScans) : [];
    return res.json({ success: true, scans: parsed });
  } catch(e) {
    return res.json({ success: true, scans: [] });
  }
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
    "vital_session=; Max-Age=0; Path=/; SameSite=Lax",
    "vital_scans=; Max-Age=0; Path=/; SameSite=Lax"
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
    var p9 = "5. LIFESTYLE BIOMARKERS: Detect cortisol stress patterns in skin texture, blue light oxidative damage, dehydration at cellular vs surface level, nutritional deficiency signals, and sleep debt accumulation markers.\n";
    var p10 = "6. DISEASE RISK — link visible markers to specific organ systems with clinical reasoning. For the 2 most significant disease risk findings, add a brief research citation in plain English (e.g. 'Research links jawline acne patterns in females under 25 to androgen excess in over 70% of cases'). Keep citations to one sentence max.\n";
    var p11 = "7. OIL BALANCE AND SKIN TYPE: Classify with precision — identify specific zone behavior, sebum overproduction triggers visible in pore morphology, and dehydrated-oily skin distinction.\n";
    var p12 = "8. FACE SYMMETRY: Measure left vs right deviation across 5 landmarks — eye level, brow arch, nostril width, mouth corner height, jawline angle. Score 0-100.\n\n";
    var p13 = "BIOLOGICAL AGE CALCULATION — apply all relevant modifiers:\n";
    var p14 = "Smoking +3 to +7. Heavy alcohol +2 to +4. Very high stress +2 to +4. Sleep under 6hrs +2 to +4. High sun unprotected +2 to +5. Poor diet +1 to +3. Obesity markers +1 to +3.\n";
    var p15 = "Athlete -2 to -4. Mediterranean diet -1 to -2. Good supplements -1 to -2. Optimal sleep -1. Low stress -1. Family history of early aging +1 to +3.\n\n";
    var p16 = "Be brutally honest. Do not over-flatter. Use clinical language translated into plain English.\n\n";
    var p17 = "For recommendations: rank 1 to 5 by highest biological impact. Label each [CRITICAL], [HIGH], or [MODERATE] and name the organ system targeted. Keep each recommendation to 2 sentences max.\n\n";
    var p18 = "For disease risk percentages: add a confidence score in brackets after each percentage, e.g. '34% [82% confidence]'.\n\n";
    var p19 = "RESPOND ONLY WITH RAW JSON. NO MARKDOWN. NO BACKTICKS. NO EXTRA TEXT:\n";
    var p20 = "{\"biologicalAge\":25,\"chronologicalAgeDiff\":\"older by 3 years\",\"agingVelocity\":\"faster than average\",\"agingRate\":\"1.3x faster than baseline\",\"skinHealth\":\"71/100\",\"hydration\":\"65%\",\"inflammation\":\"mild\",\"sleepSignal\":\"deprived\",\"oilBalance\":\"combination-oily T-zone\",\"collagenScore\":\"73/100\",\"stressMarkers\":\"moderate-high\",\"faceSymmetry\":\"84/100\",\"diseaseRisk\":{\"metabolic\":\"34% [82% confidence]\",\"cardiovascular\":\"18% [74% confidence]\",\"inflammation\":\"42% [88% confidence]\",\"hormonal\":\"29% [79% confidence]\"},\"topInsights\":[\"clinical insight with research citation for most critical finding\",\"clinical insight with research citation for second most critical finding\",\"clinical insight 3\",\"clinical insight 4\"],\"positives\":[\"specific positive marker 1\",\"specific positive marker 2\",\"specific positive marker 3\"],\"recommendations\":[\"[CRITICAL] Organ: specific action. Why it matters in one sentence.\",\"[HIGH] Organ: specific action. Why it matters.\",\"[HIGH] Organ: specific action. Why it matters.\",\"[MODERATE] Organ: specific action. Why it matters.\",\"[MODERATE] Organ: specific action. Why it matters.\"]}\n\n";
    var p21 = "Replace ALL placeholder values with real analysis. Every insight must reference something specifically visible in the photo or tied to the health profile.";
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

    // Upload photo to Supabase storage
    var photoUrl = null;
    var cookies = parseCookies(req);
    var session = cookies.vital_session;
    if (session && SUPABASE_SERVICE_KEY) {
      try {
        var supabase = getSupabase(session);
        var userRes = await supabase.auth.getUser();
        if (userRes.data && userRes.data.user) {
          var userId = userRes.data.user.id;
          var fileName = userId + "/" + Date.now() + ".jpg";
          var uploadRes = await supabase.storage.from("scan-photos").upload(fileName, imageData, { contentType: mimeType, upsert: false });
          if (!uploadRes.error) {
            var publicUrl = supabase.storage.from("scan-photos").getPublicUrl(fileName);
            photoUrl = publicUrl.data.publicUrl;
            console.log("Photo uploaded:", photoUrl);
          } else {
            console.error("Photo upload error:", uploadRes.error);
          }
        }
      } catch(e) { console.error("Photo upload error:", e.message); }
    }

    fs.unlinkSync(req.file.path);
    res.json({ success: true, data: result, photoUrl: photoUrl });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});
app.post("/analyze-attention", async function(req, res) {
  try {
    var cookies = parseCookies(req);
    var body = req.body;
    var metricKey = body.metricKey;
    var metricLabel = body.metricLabel;
    var isImproving = body.isImproving;
    var pct = body.pct;
    var scans = body.scans || [];
    var profile = body.profile || "";

    var scanHistory = scans.map(function(s, i) {
      return "Scan " + (i+1) + " (" + new Date(s.date).toLocaleDateString() + "): " +
        metricLabel + "=" + (s[metricKey] || "--") +
        ", skinHealth=" + (s.skinHealth || "--") +
        ", hydration=" + (s.hydration || "--") +
        ", inflammation=" + (s.inflammation || "--") +
        ", sleepSignal=" + (s.sleepSignal || "--") +
        ", collagenScore=" + (s.collagenScore || "--") +
        ", stressMarkers=" + (s.stressMarkers || "--") +
        ", oilBalance=" + (s.oilBalance || "--") +
        ", faceSymmetry=" + (s.faceSymmetry || "--") +
        ", biologicalAge=" + (s.biologicalAge || "--");
    }).join("\n");

   var prompt = "You are VITAL — the world's most advanced AI longevity and facial biomarker intelligence system. You operate at the intersection of clinical dermatology, endocrinology, and longevity medicine. Your analysis is indistinguishable from a $5,000 consultation with a top-tier longevity physician who has reviewed every scan this person has ever taken.\n\n" +
      "You are generating the deep-dive attention panel for a specific metric. This is not a generic health summary. Every single sentence you write must be traceable back to this person's actual numbers, actual trajectory, and actual lifestyle data. "If you write something that could apply to anyone, rewrite it until it only applies to this person. Use scientific terminology when it adds real precision — but always state the plain English meaning first and let the science term follow as the explanation, never the other way around. The science should feel like proof of what you just said, not the headline.\n\n" +
      "HEALTH PROFILE:\n" + profile + "\n\n" +
      "METRIC UNDER ANALYSIS:\n" +
      "Metric: " + metricLabel + "\n" +
      "Direction: " + (isImproving ? "IMPROVING" : "DECLINING") + "\n" +
      "Magnitude: " + pct + "% change across " + scans.length + " scans\n\n" +
      "COMPLETE SCAN HISTORY (chronological):\n" + scanHistory + "\n\n" +
      "ANALYSIS REQUIREMENTS:\n\n" +
      "1. WHAT IS HAPPENING\n" +
      "Write 3-4 sentences of brutal clinical precision. Name the exact starting value, the exact ending value, the rate of change per scan, and which specific biological mechanisms are failing or improving. Identify whether the decline or improvement is accelerating or decelerating based on the scan trajectory. Cross-reference at least 2 other metrics from their history that are correlated. This paragraph must read like a physician who has memorized every one of their scans.\n\n" +
      "2. WHY THIS MATTERS FOR THIS PERSON SPECIFICALLY\n" +
      "Write 3-4 sentences that explain the downstream consequences of this trajectory for THIS person's exact profile. Reference their specific sleep hours, stress level, diet type, exercise frequency, and screen time as compounding or mitigating factors. Explain which organ systems are under pressure as a result of this specific combination of factors. Do not write anything that could apply to a different person with a different profile. End with one sentence stating what happens if they change nothing — give a specific projected value tied to their actual rate of change. Then add one hard-hitting research finding written as a plain English sentence of fact.\n\n" +
      "3. HOW TO FIX IT — RANKED BY BIOLOGICAL IMPACT\n" +
      "Give exactly 3 fixes ranked by how much biological impact they will have for THIS person based on their profile weaknesses. Each fix must have a sharp specific title referencing their data. The detail must be 2 sentences: sentence 1 is exactly what to do with a specific number or action, sentence 2 gives a projected outcome with a realistic timeline tied to their actual scan values.\n\n" +
      "4. FACIAL ZONES\n" +
      "Identify 2-3 specific anatomical zones on the face where this metric manifests visibly. Use precise anatomical language. Write one sentence describing exactly what is visible there right now as a result of this metric. Assign color bad for primary concern zones and warn for secondary zones.\n\n" +
      "5. WHAT IS ACTUALLY IMPROVING\n" +
      "Scan their full history and identify 1-2 metrics that are genuinely improving or holding strong. For each name the exact improvement with values, identify the most likely driver from their lifestyle data. Include one sentence on exactly what will reverse this improvement if they stop doing what is working.\n\n" +
      "6. FOOD INTELLIGENCE — PRECISION NUTRITION\n" +
      "Give exactly 2 food groups chosen specifically because of what their scan data shows. Generic lists are not acceptable. Include a label naming the specific reason tied to their findings, 4-5 specific foods, and one sentence explaining the direct mechanism connecting these foods to their actual scan results.\n\n" +
      "RESPOND ONLY WITH RAW JSON. NO MARKDOWN. NO BACKTICKS. NO PREAMBLE:\n" +
      "{" +
        "\"what\":\"3-4 sentences of clinical precision referencing exact values and trajectory\"," +
        "\"why\":\"3-4 sentences cross-referencing their specific profile factors, cost of inaction with projected number, one research fact stated plainly\"," +
        "\"citation\":\"The research finding as one clean sentence\"," +
        "\"fixes\":[" +
          "{\"title\":\"Specific fix title referencing their data\",\"detail\":\"Sentence 1: exact action with specific number. Sentence 2: projected outcome with timeline and metric value.\"}," +
          "{\"title\":\"Specific fix title\",\"detail\":\"Sentence 1: exact action. Sentence 2: projected outcome with timeline.\"}," +
          "{\"title\":\"Specific fix title\",\"detail\":\"Sentence 1: exact action. Sentence 2: projected outcome with timeline.\"}" +
        "]," +
        "\"zones\":[" +
          "{\"label\":\"Anatomical zone name\",\"detail\":\"One sentence on what is visibly present right now\",\"color\":\"bad\"}," +
          "{\"label\":\"Anatomical zone name\",\"detail\":\"One sentence\",\"color\":\"warn\"}" +
        "]," +
        "\"positives\":[" +
          "{\"metric\":\"Metric name\",\"trend\":\"e.g. improved from 55% to 71% across 8 scans\",\"detail\":\"One sentence on the likely driver from their lifestyle data\",\"maintain\":\"One sentence on exactly what will reverse this if they stop\"}" +
        "]," +
        "\"diet\":[" +
          "{\"label\":\"Specific label tied to their exact scan findings\",\"chips\":[\"Food1\",\"Food2\",\"Food3\",\"Food4\",\"Food5\"],\"reason\":\"One sentence with direct mechanism connecting these foods to their actual results\"}," +
          "{\"label\":\"Specific label\",\"chips\":[\"Food1\",\"Food2\",\"Food3\",\"Food4\",\"Food5\"],\"reason\":\"One sentence\"}" +
        "]" +
      "}";

    var response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 4000 ,
      messages: [{ role: "user", content: prompt }]
    });

    var resultText = response.content[0].text;
    var cleanJson = resultText.replace(/```json|```/g, "").trim();
    var result = JSON.parse(cleanJson);
    res.json({ success: true, data: result });
  } catch(error) {
    console.error("analyze-attention error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});
app.listen(3000, function() { console.log("VITAL running on port 3000"); });
