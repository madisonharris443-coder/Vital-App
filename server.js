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

   var prompt = "You are VITAL — an AI health analysis system that has reviewed every scan this person has taken. You know their data better than they do.\n\n" +
      "Write like a world-class physician who does not waste words. State what is happening. Do not explain yourself. Do not justify your conclusions. Do not soften bad news. Trust the person to handle the truth.\n\n" +
      "The standard: if this analysis could apply to a different person, it is not good enough. Every sentence must be traceable to their actual numbers.\n\n" +
      "HEALTH PROFILE:\n" + profile + "\n\n" +
      "METRIC: " + metricLabel + "\n" +
      "DIRECTION: " + (isImproving ? "IMPROVING" : "DECLINING") + "\n" +
      "CHANGE: " + pct + "% across " + scans.length + " scans\n\n" +
      "SCAN HISTORY:\n" + scanHistory + "\n\n" +
      "REQUIREMENTS:\n\n" +
      "1. WHAT IS HAPPENING (3 sentences max)\n" +
      "State the exact numbers — where it started, where it is now, how fast it is moving. Name 1-2 other metrics from their scan history that are moving in lockstep and what that pattern means. No explanations. Just what the data shows.\n\n" +
      "2. WHY THIS MATTERS (3 sentences max)\n" +
      "Tell them what this trajectory is doing to their body right now based on their specific sleep, stress, diet, and exercise data. Do not explain the science — state the consequence. One sentence only: what happens if they do nothing, with a number tied to their actual rate of change. End with one real research finding written as a plain statement of fact, not a citation format.\n\n" +
      "3. HOW TO FIX IT (3 fixes)\n" +
      "Each fix: sharp title, 2 sentences. Sentence 1 is exactly what to do with a specific number or action. Sentence 2 is what will happen — give a timeline and projected metric value tied to their actual scan data. No generic advice. Reference their numbers.\n\n" +
      "4. FACE ZONES (2 zones)\n" +
      "Name 2 anatomical zones where this metric is visibly showing up. One sentence each — describe what is actually visible, not what could theoretically appear.\n\n" +
      "5. WHAT IS IMPROVING (1-2 metrics)\n" +
      "Find something genuinely improving in their scan history. Exact numbers. One sentence on why it is improving based on their data. One sentence on exactly what will reverse it if they stop.\n\n" +
      "6. FOOD (2 groups)\n" +
      "4-5 specific foods each. Chosen because of what their scan data shows specifically. One sentence per group: the direct mechanism connecting these foods to their actual results — not general health benefits.\n\n" +
      "RESPOND ONLY WITH RAW JSON. NO MARKDOWN. NO BACKTICKS. NO PREAMBLE:\n" +
      "{" +
        "\"what\":\"3 sentences max — exact numbers, lockstep metrics, no explanations\"," +
        "\"why\":\"3 sentences — consequence not science, cost of inaction with projected number, one research fact stated plainly\"," +
        "\"citation\":\"The research finding restated as one clean sentence\"," +
        "\"fixes\":[" +
          "{\"title\":\"Sharp specific title\",\"detail\":\"Sentence 1: exact action with specific number. Sentence 2: what will happen with timeline and projected metric value.\"}," +
          "{\"title\":\"Sharp specific title\",\"detail\":\"Sentence 1: exact action. Sentence 2: projected outcome with timeline.\"}," +
          "{\"title\":\"Sharp specific title\",\"detail\":\"Sentence 1: exact action. Sentence 2: projected outcome with timeline.\"}" +
        "]," +
        "\"zones\":[" +
          "{\"label\":\"Anatomical zone\",\"detail\":\"One sentence — what is visibly present right now\",\"color\":\"bad\"}," +
          "{\"label\":\"Anatomical zone\",\"detail\":\"One sentence — what is visibly present right now\",\"color\":\"warn\"}" +
        "]," +
        "\"positives\":[" +
          "{\"metric\":\"Metric name\",\"trend\":\"Exact numbers e.g. improved from 55% to 71% across 8 scans\",\"detail\":\"One sentence on why it is improving\",\"maintain\":\"One sentence on exactly what will reverse this if they stop\"}" +
        "]," +
        "\"diet\":[" +
          "{\"label\":\"Specific reason tied to their scan findings\",\"chips\":[\"Food1\",\"Food2\",\"Food3\",\"Food4\",\"Food5\"],\"reason\":\"One sentence — direct mechanism connecting these foods to their actual scan results\"}," +
          "{\"label\":\"Specific reason tied to their scan findings\",\"chips\":[\"Food1\",\"Food2\",\"Food3\",\"Food4\",\"Food5\"],\"reason\":\"One sentence — direct mechanism\"}" +
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
