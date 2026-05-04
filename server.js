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
    var p10 = "6. DISEASE RISK — link visible markers to specific organ systems with clinical reasoning. For the 2 most significant disease risk findings, add a brief research citation in plain English. Keep citations to one sentence max.\n";
    var p11 = "7. OIL BALANCE AND SKIN TYPE: Classify with precision — identify specific zone behavior, sebum overproduction triggers visible in pore morphology, and dehydrated-oily skin distinction.\n";
    var p12 = "8. FACE SYMMETRY: Measure left vs right deviation across 5 landmarks — eye level, brow arch, nostril width, mouth corner height, jawline angle. Score 0-100.\n\n";
    var p13 = "BIOLOGICAL AGE CALCULATION — apply all relevant modifiers:\n";
    var p14 = "Smoking +3 to +7. Heavy alcohol +2 to +4. Very high stress +2 to +4. Sleep under 6hrs +2 to +4. High sun unprotected +2 to +5. Poor diet +1 to +3. Obesity markers +1 to +3.\n";
    var p15 = "Athlete -2 to -4. Mediterranean diet -1 to -2. Good supplements -1 to -2. Optimal sleep -1. Low stress -1. Family history of early aging +1 to +3.\n\n";
    var p16 = "Be brutally honest. Do not over-flatter. Use clinical language translated into plain English.\n\n";
    var p17 = "For recommendations: rank 1 to 5 by highest biological impact. Label each [CRITICAL], [HIGH], or [MODERATE] and name the organ system targeted. Keep each recommendation to 2 sentences max.\n\n";
    var p18 = "For disease risk percentages: add a confidence score in brackets after each percentage, e.g. '34% [82% confidence]'.\n\n";
    var p19 = "RESPOND ONLY WITH RAW JSON. NO MARKDOWN. NO BACKTICKS. NO EXTRA TEXT:\n";
    var p20 = "{\"biologicalAge\":25,\"chronologicalAgeDiff\":\"older by 3 years\",\"agingVelocity\":\"faster than average\",\"agingRate\":\"1.3x faster than baseline\",\"skinHealth\":\"71/100\",\"hydration\":\"65%\",\"inflammation\":\"mild\",\"sleepSignal\":\"deprived\",\"oilBalance\":\"combination-oily T-zone\",\"collagenScore\":\"73/100\",\"stressMarkers\":\"moderate-high\",\"faceSymmetry\":\"84/100\",\"diseaseRisk\":{\"metabolic\":\"34% [82% confidence]\",\"cardiovascular\":\"18% [74% confidence]\",\"inflammation\":\"42% [88% confidence]\",\"hormonal\":\"29% [79% confidence]\"},\"topInsights\":[\"clinical insight 1\",\"clinical insight 2\",\"clinical insight 3\",\"clinical insight 4\"],\"positives\":[\"positive marker 1\",\"positive marker 2\",\"positive marker 3\"],\"recommendations\":[\"[CRITICAL] Organ: action. Why.\",\"[HIGH] Organ: action. Why.\",\"[HIGH] Organ: action. Why.\",\"[MODERATE] Organ: action. Why.\",\"[MODERATE] Organ: action. Why.\"]}\n\n";
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

    var prompt = "You are VITAL — the world's most advanced AI longevity and facial biomarker intelligence system. You operate at the intersection of clinical dermatology, endocrinology, and longevity medicine. Your analysis is indistinguishable from a $2,000 consultation with a top-tier longevity physician who has reviewed every scan this person has ever taken.\n\n" +
      "You are generating the deep-dive attention panel for a specific metric. This is not a generic health summary. Every single sentence you write must be traceable back to this person's actual numbers, actual trajectory, and actual lifestyle data. If you write something that could apply to anyone, rewrite it until it only applies to this person. Use scientific terminology when it adds real precision — but always state the plain English meaning first and let the science term follow as the explanation, never the other way around.\n\n" +
      "HEALTH PROFILE:\n" + profile + "\n\n" +
      "METRIC UNDER ANALYSIS:\n" +
      "Metric: " + metricLabel + "\n" +
      "Direction: " + (isImproving ? "IMPROVING" : "DECLINING") + "\n" +
      "Magnitude: " + pct + "% change across " + scans.length + " scans\n\n" +
      "COMPLETE SCAN HISTORY (chronological):\n" + scanHistory + "\n\n" +
      "ANALYSIS REQUIREMENTS:\n\n" +
      "1. WHAT IS HAPPENING\n" +
      "Write 3-4 sentences of brutal clinical precision. Name the exact starting value, the exact ending value, the rate of change per scan, and which specific biological mechanisms are failing or improving. Identify whether the decline or improvement is accelerating or decelerating. Cross-reference at least 2 other correlated metrics.\n\n" +
      "2. WHY THIS MATTERS FOR THIS PERSON SPECIFICALLY\n" +
      "Write 3-4 sentences explaining downstream consequences for THIS person's exact profile. Reference their specific sleep, stress, diet, exercise, and screen time. End with one sentence stating what happens if they change nothing. Add one hard-hitting research finding as a plain English sentence.\n\n" +
      "3. HOW TO FIX IT — RANKED BY BIOLOGICAL IMPACT\n" +
      "Give exactly 3 fixes. Each fix must have: a sharp specific title, a shortName (3-6 words, plain English daily action e.g. Apply niacinamide 2x daily, Drink 500ml on waking, Lights off by 10:30pm — no jargon), and detail (2 sentences: exact action + projected outcome with timeline).\n\n" +
      "4. FACIAL ZONES\n" +
      "Identify 2-3 specific anatomical zones. One sentence per zone. Assign color bad for primary zones and warn for secondary zones.\n\n" +
      "5. WHAT IS ACTUALLY IMPROVING\n" +
      "Identify 1-2 metrics genuinely improving. Name exact values, most likely driver, and what will reverse it.\n\n" +
      "6. FOOD INTELLIGENCE\n" +
      "Give EXACTLY 2 food groups and no more. Each has a label, 4-5 specific foods, and one mechanism sentence tied to their actual scan findings.\n\n" +
      "RESPOND ONLY WITH RAW JSON. NO MARKDOWN. NO BACKTICKS. NO PREAMBLE:\n" +
      "{" +
        "\"what\":\"3-4 sentences\"," +
        "\"why\":\"3-4 sentences\"," +
        "\"citation\":\"one research finding as a clean sentence\"," +
        "\"fixes\":[" +
          "{\"title\":\"title\",\"shortName\":\"3-6 word daily action\",\"detail\":\"s1. s2.\"}," +
          "{\"title\":\"title\",\"shortName\":\"3-6 word daily action\",\"detail\":\"s1. s2.\"}," +
          "{\"title\":\"title\",\"shortName\":\"3-6 word daily action\",\"detail\":\"s1. s2.\"}" +
        "]," +
        "\"zones\":[" +
          "{\"label\":\"zone\",\"detail\":\"one sentence\",\"color\":\"bad\"}," +
          "{\"label\":\"zone\",\"detail\":\"one sentence\",\"color\":\"warn\"}" +
        "]," +
        "\"positives\":[" +
          "{\"metric\":\"name\",\"trend\":\"values\",\"detail\":\"driver sentence\",\"maintain\":\"reversal sentence\"}" +
        "]," +
        "\"diet\":[" +
          "{\"label\":\"label\",\"chips\":[\"Food1\",\"Food2\",\"Food3\",\"Food4\",\"Food5\"],\"reason\":\"mechanism sentence\"}," +
          "{\"label\":\"label\",\"chips\":[\"Food1\",\"Food2\",\"Food3\",\"Food4\",\"Food5\"],\"reason\":\"mechanism sentence\"}" +
        "]" +
      "}";

    var response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 3500,
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

app.post("/analyze-improving", async function(req, res) {
  try {
    var body = req.body;
    var metricKey = body.metricKey;
    var metricLabel = body.metricLabel;
    var pct = body.pct;
    var scans = body.scans || [];
    var latestScan = scans[scans.length - 1];
    var profile = latestScan ?
      "Sleep: " + (latestScan.sleepSignal || "--") +
      ", Stress: " + (latestScan.stressMarkers || "--") +
      ", Hydration: " + (latestScan.hydration || "--") +
      ", Skin Health: " + (latestScan.skinHealth || "--") +
      ", Collagen: " + (latestScan.collagenScore || "--") +
      ", Inflammation: " + (latestScan.inflammation || "--") : "unknown";

    var scanHistory = scans.map(function(s, i) {
      return "Scan " + (i+1) + " (" + new Date(s.date).toLocaleDateString() + "): " +
        metricLabel + "=" + (s[metricKey] || "--") +
        ", sleepSignal=" + (s.sleepSignal || "--") +
        ", stressMarkers=" + (s.stressMarkers || "--") +
        ", hydration=" + (s.hydration || "--") +
        ", collagenScore=" + (s.collagenScore || "--") +
        ", inflammation=" + (s.inflammation || "--") +
        ", biologicalAge=" + (s.biologicalAge || "--");
    }).join("\n");

    var prompt = "You are VITAL — an AI health analysis system that has reviewed every scan this person has taken. You know their data cold.\n\n" +
      "This metric is genuinely improving. Your job is to tell them exactly what is working, how to keep it going, and what will reverse it if they stop. Write like a physician who is genuinely impressed by real progress — direct, specific, no fluff. Every sentence must reference their actual numbers.\n\n" +
      "HEALTH PROFILE:\n" + profile + "\n\n" +
      "METRIC: " + metricLabel + "\n" +
      "IMPROVEMENT: " + pct + "% across " + scans.length + " scans\n\n" +
      "COMPLETE SCAN HISTORY:\n" + scanHistory + "\n\n" +
      "1. WHAT IS IMPROVING (2-3 sentences)\n" +
      "State the exact starting value, current value, and rate of improvement. Note whether accelerating or steady. Name 1 other metric improving in lockstep.\n\n" +
      "2. FACE ZONES (2 zones)\n" +
      "Name 2 anatomical zones where this improvement shows up visibly. One sentence each.\n\n" +
      "3. HOW TO KEEP MOMENTUM (3 steps)\n" +
      "Each step: sharp title, 2 sentences. Sentence 1 is what to keep doing. Sentence 2 is the reversal timeline if they stop.\n\n" +
      "4. POSITIVES\n" +
      "One sentence on the most likely driver. One sentence on what will reverse it.\n\n" +
      "RESPOND ONLY WITH RAW JSON. NO MARKDOWN. NO BACKTICKS. NO PREAMBLE:\n" +
      "{" +
        "\"what\":\"2-3 sentences\"," +
        "\"zones\":[" +
          "{\"label\":\"zone\",\"detail\":\"one sentence\",\"color\":\"good\"}," +
          "{\"label\":\"zone\",\"detail\":\"one sentence\",\"color\":\"good\"}" +
        "]," +
        "\"steps\":[" +
          "{\"title\":\"title\",\"detail\":\"s1. s2.\"}," +
          "{\"title\":\"title\",\"detail\":\"s1. s2.\"}," +
          "{\"title\":\"title\",\"detail\":\"s1. s2.\"}" +
        "]," +
        "\"positives\":[" +
          "{\"metric\":\"" + metricLabel + "\",\"trend\":\"exact numbers\",\"detail\":\"driver sentence\",\"maintain\":\"reversal sentence\"}" +
        "]" +
      "}";

    var response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }]
    });

    var resultText = response.content[0].text;
    var cleanJson = resultText.replace(/```json|```/g, "").trim();
    var result = JSON.parse(cleanJson);
    res.json({ success: true, data: result });
  } catch(error) {
    console.error("analyze-improving error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});
//
app.post("/save-habits", async function(req, res) {
  var habits = req.body.habits;
  var completions = req.body.completions;
  var cookies = parseCookies(req);
  var session = cookies.vital_session;
  if (!habits) return res.json({ success: false });
  if (session && SUPABASE_SERVICE_KEY) {
    try {
      var supabase = getSupabase(session);
      var userRes = await supabase.auth.getUser();
      if (userRes.data && userRes.data.user) {
        var userId = userRes.data.user.id;
        var existing = await supabase.from("habits").select("id").eq("user_id", userId).single();
        if (existing.data) {
          await supabase.from("habits").update({ data: habits, completions: completions || {}, updated_at: new Date().toISOString() }).eq("user_id", userId);
        } else {
          await supabase.from("habits").insert({ user_id: userId, data: habits, completions: completions || {} });
        }
        return res.json({ success: true });
      }
    } catch(e) { console.error("save-habits error:", e.message); }
  }
  res.json({ success: false });
});

app.get("/get-habits", async function(req, res) {
  var cookies = parseCookies(req);
  var session = cookies.vital_session;
  if (session && SUPABASE_SERVICE_KEY) {
    try {
      var supabase = getSupabase(session);
      var userRes = await supabase.auth.getUser();
      if (userRes.data && userRes.data.user) {
        var userId = userRes.data.user.id;
        var result = await supabase.from("habits").select("*").eq("user_id", userId).single();
        if (result.data) {
          return res.json({ success: true, habits: result.data.data || [], completions: result.data.completions || {} });
        }
      }
    } catch(e) { console.error("get-habits error:", e.message); }
  }
  return res.json({ success: true, habits: [], completions: {} });
});
// OURA OAUTH
app.get("/oura-connect", function(req, res) {
  var clientId = process.env.OURA_CLIENT_ID;
  var redirectUri = "https://vital-app-production-c518.up.railway.app/oura-callback";
  var url = "https://cloud.ouraring.com/oauth/authorize?response_type=code&client_id=" + clientId + "&redirect_uri=" + encodeURIComponent(redirectUri) + "&scope=daily+heartrate+personal+sleep+workout+session+tag";
  res.redirect(url);
});

app.get("/oura-callback", async function(req, res) {
  var code = req.query.code;
  if (!code) return res.redirect("/wearable.html?error=no_code");
  try {
    var redirectUri = "https://vital-app-production-c518.up.railway.app/oura-callback";
    var tokenRes = await fetch("https://api.ouraring.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=authorization_code&code=" + code + "&redirect_uri=" + encodeURIComponent(redirectUri) + "&client_id=" + process.env.OURA_CLIENT_ID + "&client_secret=" + process.env.OURA_CLIENT_SECRET
    });
    var tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.redirect("/wearable.html?error=token_failed");
    var cookies = parseCookies(req);
    var session = cookies.vital_session;
    if (session && SUPABASE_SERVICE_KEY) {
      var supabase = getSupabase(session);
      var userRes = await supabase.auth.getUser();
      if (userRes.data && userRes.data.user) {
        var userId = userRes.data.user.id;
        await supabase.from("oura_tokens").upsert({ user_id: userId, access_token: tokenData.access_token, refresh_token: tokenData.refresh_token || null, updated_at: new Date().toISOString() });
      }
    }
    res.redirect("/wearable.html?connected=oura");
  } catch(e) {
    console.error("oura-callback error:", e.message);
    res.redirect("/wearable.html?error=callback_failed");
  }
});

app.get("/oura-data", async function(req, res) {
  var cookies = parseCookies(req);
  var session = cookies.vital_session;
  if (!session || !SUPABASE_SERVICE_KEY) return res.json({ success: false });
  try {
    var supabase = getSupabase(session);
    var userRes = await supabase.auth.getUser();
    if (!userRes.data || !userRes.data.user) return res.json({ success: false });
    var userId = userRes.data.user.id;
    var tokenRow = await supabase.from("oura_tokens").select("access_token").eq("user_id", userId).single();
    if (!tokenRow.data) return res.json({ success: false, reason: "not_connected" });
    var token = tokenRow.data.access_token;
    var end = new Date().toISOString().split("T")[0];
    var start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    var headers = { "Authorization": "Bearer " + token };
    var [sleepRes, readinessRes, hrRes] = await Promise.all([
      fetch("https://api.ouraring.com/v2/usercollection/daily_sleep?start_date=" + start + "&end_date=" + end, { headers }),
      fetch("https://api.ouraring.com/v2/usercollection/daily_readiness?start_date=" + start + "&end_date=" + end, { headers }),
      fetch("https://api.ouraring.com/v2/usercollection/heartrate?start_datetime=" + start + "T00:00:00&end_datetime=" + end + "T23:59:59", { headers })
    ]);
    var sleepData = await sleepRes.json();
    var readinessData = await readinessRes.json();
    var hrData = await hrRes.json();
    var sleepItems = sleepData.data || [];
    var readinessItems = readinessData.data || [];
    var hrItems = hrData.data || [];
    var avgSleep = sleepItems.length > 0 ? (sleepItems.reduce(function(a, s) { return a + (s.contributors && s.contributors.total_sleep ? s.contributors.total_sleep : 0); }, 0) / sleepItems.length).toFixed(1) : null;
    var avgReadiness = readinessItems.length > 0 ? Math.round(readinessItems.reduce(function(a, r) { return a + (r.score || 0); }, 0) / readinessItems.length) : null;
    var avgHrv = hrItems.length > 0 ? Math.round(hrItems.reduce(function(a, h) { return a + (h.bpm || 0); }, 0) / hrItems.length) : null;
    var latestSleep = sleepItems.length > 0 ? sleepItems[sleepItems.length - 1] : null;
    res.json({ success: true, data: { avgSleepScore: avgSleep, avgReadiness: avgReadiness, avgHrv: avgHrv, latestSleepOnset: latestSleep ? latestSleep.bedtime_start : null, latestSleepEnd: latestSleep ? latestSleep.bedtime_end : null, days: sleepItems.length } });
  } catch(e) {
    console.error("oura-data error:", e.message);
    res.json({ success: false, error: e.message });
  }
});
app.listen(3000, function() { console.log("VITAL running on port 3000"); });
