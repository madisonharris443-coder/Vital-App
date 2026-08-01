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
app.get("/", function(req, res) { res.sendFile(__dirname + "/public/splash.html"); });
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
    supabaseKey: process.env.SUPABASE_ANON_KEY
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

app.get("/get-data", async function(req, res) {
  var cookies = parseCookies(req);
  var user = null;
  var scans = "[]";
  var avatar = null;
  try { if (cookies.vital_scans) scans = cookies.vital_scans; } catch(e) {}
  try { if (cookies.vital_avatar) avatar = cookies.vital_avatar; } catch(e) {}

  var session = cookies.vital_session;
  if (session && SUPABASE_SERVICE_KEY) {
    try {
      var supabase = getSupabase(session);
      var userRes = await supabase.auth.getUser();
      if (userRes.data && userRes.data.user) {
        user = userRes.data.user;
      }
    } catch(e) {
      console.error("get-data session validation error:", e.message);
    }
  }

  res.json({ user: user, session: user ? session : null, scans: scans, avatar: avatar });
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

    // OURA DATA INJECTION
    var ouraProfile = "";
    try {
      var cookiesNow = parseCookies(req);
      var sessionNow = cookiesNow.vital_session;
      if (sessionNow && SUPABASE_SERVICE_KEY) {
        var supabaseOura = getSupabase(sessionNow);
        var ouraUserRes = await supabaseOura.auth.getUser();
        if (ouraUserRes.data && ouraUserRes.data.user) {
          var ouraUserId = ouraUserRes.data.user.id;
          var ouraTokenRow = await supabaseOura.from("oura_tokens").select("access_token").eq("user_id", ouraUserId).single();
          if (ouraTokenRow.data) {
            var ouraToken = ouraTokenRow.data.access_token;
            var ouraEnd = new Date().toISOString().split("T")[0];
            var ouraStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
            var ouraHeaders = { "Authorization": "Bearer " + ouraToken };
            var [ouraSleepRes, ouraReadinessRes, ouraHrvRes] = await Promise.all([
              fetch("https://api.ouraring.com/v2/usercollection/daily_sleep?start_date=" + ouraStart + "&end_date=" + ouraEnd, { headers: ouraHeaders }),
              fetch("https://api.ouraring.com/v2/usercollection/daily_readiness?start_date=" + ouraStart + "&end_date=" + ouraEnd, { headers: ouraHeaders }),
              fetch("https://api.ouraring.com/v2/usercollection/daily_hrv?start_date=" + ouraStart + "&end_date=" + ouraEnd, { headers: ouraHeaders })
            ]);
            var ouraSleepData = await ouraSleepRes.json();
            var ouraReadinessData = await ouraReadinessRes.json();
            var ouraHrvData = await ouraHrvRes.json();
            var ouraSleepItems = ouraSleepData.data || [];
            var ouraReadinessItems = ouraReadinessData.data || [];
            var ouraHrvItems = ouraHrvData.data || [];
            if (ouraSleepItems.length > 0) {
              var avgSleepDuration = (ouraSleepItems.reduce(function(a, s) { return a + (s.total_sleep_duration || 0); }, 0) / ouraSleepItems.length / 3600).toFixed(1);
              var avgSleepScore = Math.round(ouraSleepItems.reduce(function(a, s) { return a + (s.score || 0); }, 0) / ouraSleepItems.length);
              var latestSleep = ouraSleepItems[ouraSleepItems.length - 1];
              var sleepOnset = latestSleep.bedtime_start ? new Date(latestSleep.bedtime_start).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : null;
              ouraProfile += "OURA RING DATA (last 7 days, verified biometric): ";
              ouraProfile += "Average sleep duration: " + avgSleepDuration + " hours (actual). ";
              ouraProfile += "Average sleep score: " + avgSleepScore + "/100. ";
              if (sleepOnset) ouraProfile += "Latest sleep onset: " + sleepOnset + ". ";
            }
            if (ouraReadinessItems.length > 0) {
              var avgReadiness = Math.round(ouraReadinessItems.reduce(function(a, r) { return a + (r.score || 0); }, 0) / ouraReadinessItems.length);
              ouraProfile += "Average readiness score: " + avgReadiness + "/100. ";
            }
            if (ouraHrvItems.length > 0) {
              var avgHrv = Math.round(ouraHrvItems.reduce(function(a, h) { return a + (h.rmssd || 0); }, 0) / ouraHrvItems.length);
              ouraProfile += "Average HRV (RMSSD): " + avgHrv + "ms (actual measured). ";
            }
            if (ouraProfile) {
              ouraProfile += "NOTE: This user has a connected Oura Ring. Prioritize these verified biometric readings over self-reported values when they conflict. Use the actual sleep, HRV, and readiness data to inform your biological age calculation and all metric scores.";
              console.log("Oura data injected into scan analysis");
            }
          }
        }
      }
    } catch(ouraErr) { console.error("Oura injection error:", ouraErr.message); }

        // FETCH SCAN HISTORY FOR CONTEXT
    var scanHistory = "";
    try {
      var cookiesHist = parseCookies(req);
      var sessionHist = cookiesHist.vital_session;
      if (sessionHist && SUPABASE_SERVICE_KEY) {
        var supabaseHist = getSupabase(sessionHist);
        var histUserRes = await supabaseHist.auth.getUser();
        if (histUserRes.data && histUserRes.data.user) {
          var histUserId = histUserRes.data.user.id;
          var histResult = await supabaseHist.from("scans").select("*").eq("user_id", histUserId).order("created_at", { ascending: true });
          if (histResult.data && histResult.data.length > 0) {
            var prevScans = histResult.data.map(function(row) { return row.data; });
            scanHistory = "PREVIOUS SCAN HISTORY (" + prevScans.length + " scans):\n";
            prevScans.forEach(function(s, i) {
              scanHistory += "Scan " + (i+1) + " (" + new Date(s.date).toLocaleDateString() + "): ";
              scanHistory += "Bio Age=" + (s.biologicalAge || "--") + ", ";
              scanHistory += "Skin=" + (s.skinHealth || "--") + ", ";
              scanHistory += "Hydration=" + (s.hydration || "--") + ", ";
              scanHistory += "Inflammation=" + (s.inflammation || "--") + ", ";
              scanHistory += "Sleep=" + (s.sleepSignal || "--") + ", ";
              scanHistory += "Collagen=" + (s.collagenScore || "--") + ", ";
              scanHistory += "Stress=" + (s.stressMarkers || "--") + ", ";
              scanHistory += "AgingRate=" + (s.agingRate || "--") + "\n";
            });
          }
        }
      }
    } catch(histErr) { console.error("Scan history fetch error:", histErr.message); }

    var prompt = "You are VITAL — the world's most advanced AI health intelligence system. You analyze facial biomarkers with the precision of a medical-grade longevity physician who has reviewed thousands of cases.\n\n" +

"YOUR IDENTITY AND STANDARDS:\n" +
"You are not a wellness app. You are a clinical intelligence system. Every finding must be traceable to something you can actually see in this photo or something present in this person's health profile. If you cannot trace it, do not say it. You commit to specific findings — you never hedge with 'may indicate', 'could suggest', or 'appears to show'. If you see it, say it directly.\n\n" +

"HOW YOU COMMUNICATE:\n" +
"Plain English first, clinical precision second. Always. Lead with what it means in everyday language, then follow with the clinical term if it adds precision. A 16-year-old and a 45-year-old physician should both understand exactly what you're saying. Write like a doctor who genuinely cares about this patient — direct, warm, specific. No jargon walls. No generic advice. Every sentence must feel like it was written specifically for this person.\n\n" +

"LANGUAGE RULES — STRICTLY ENFORCED:\n" +
"- BANNED phrases: 'may indicate', 'could suggest', 'appears to show', 'might be', 'seems like', 'possibly', 'perhaps'\n" +
"- Every insight must name a specific facial zone, skin signal, or profile data point\n" +
"- Recommendations must be specific actions with timelines — not general lifestyle advice\n" +
"- Biological age must be justified with specific visible evidence from the photo\n\n" +
"HARD MEDICAL BOUNDARIES — NEVER VIOLATE:\n" +
"- NEVER name or suggest a specific diagnosable medical condition or disease (e.g. PCOS, thyroid disease, diabetes, hormonal disorders) by name, even as a 'risk' or possibility. Describe only what is visible — skin patterns, inflammation, texture — never the underlying diagnosis that might explain it.\n" +
"- NEVER calculate, state, or reference a BMI number. You cannot measure BMI from a photo. If height/weight are in the profile, you may reference general body composition only in vague, non-numeric terms if directly relevant to a skin finding — never compute or cite a BMI figure.\n" +
"- NEVER recommend specific lab tests, bloodwork panels, imaging (ultrasounds, scans), or name specific hormones to test (e.g. 'testosterone', 'DHEA-S', 'LH', 'FSH'). Instead say 'a routine checkup with your doctor' or 'discuss this with a healthcare provider.'\n" +
"- NEVER state a disease risk as if it confirms an undiagnosed condition exists. Frame everything as general wellness patterns worth monitoring, not clinical evidence of a specific disorder.\n\n" +


"HEALTH PROFILE:\n" + profile + "\n\n" +
(ouraProfile ? "WEARABLE BIOMETRICS (Oura Ring — verified, prioritize over self-reported):\n" + ouraProfile + "\n\n" : "") +
(scanHistory ? scanHistory + "\n" : "") +

"WHAT TO ANALYZE IN THIS PHOTO:\n\n" +

"1. SKIN QUALITY — name specific zones by anatomical location:\n" +
"Identify dehydration lines vs true wrinkles (different causes, different fixes). Map congestion zones, inflammatory papules, sebaceous activity by zone. Note barrier integrity — is the skin holding moisture or losing it? Any oxidative stress markers visible.\n\n" +

"2. AGING MARKERS — go beyond obvious lines:\n" +
"Periorbital crepiness (thin skin under eyes showing age faster than cheeks). Glabellar line depth (between eyebrows — stress and sun damage indicator). Nasolabial fold depth relative to chronological age. Malar fat pad position (cheek fullness — drops with age). Jawline definition. Cross-reference all of this with their chronological age to calculate the aging delta precisely.\n\n" +

"3. COLLAGEN AND SKIN STRUCTURE:\n" +
"Assess skin thickness and rebound signals. Under-eye area: hollowing (collagen loss) vs puffiness (inflammation/fluid) — these are opposite problems. Nasolabial depth. Overall dermal thickness indicators visible in skin texture.\n\n" +

"4. INFLAMMATION SIGNALS:\n" +
"Redness patterns — where exactly and what type (diffuse vs localized). Periorbital darkening: is it vascular (bluish), pigmented (brownish), or structural (shadowing from hollowing)? Each has a different cause. Facial puffiness distribution. Any telangiectasia (visible broken capillaries — name the zones).\n\n" +

"5. LIFESTYLE VISIBLE IN THE FACE:\n" +
"Sleep debt shows in periorbital area and skin texture. Cortisol/stress shows in forehead tension lines and skin barrier breakdown. Dehydration shows in surface texture vs cellular dehydration (different appearance). Screen time/blue light oxidative damage patterns. Nutritional deficiencies visible in skin tone and texture.\n\n" +

"6. DISEASE RISK — for each of the 4 systems:\n" +
"Give a percentage risk. Give a confidence score. Explain specifically what you see in THIS photo that indicates this risk — name the exact zone, the exact signal. Give 3 biological drivers specific to this person's profile. Give an honest projection if nothing changes. Give 3 ranked actions with specific timelines.\n\n" +

"7. OIL BALANCE:\n" +
"T-zone vs cheek behavior. Pore size and morphology by zone. Dehydrated-oily distinction (skin producing oil because it's actually dehydrated — very common, very different treatment).\n\n" +

"8. FACE SYMMETRY:\n" +
"Measure deviation across: eye level, brow arch height, nostril width, mouth corner height, jawline angle. Score 0-100 where 100 is perfect symmetry.\n\n" +

"BIOLOGICAL AGE CALCULATION:\n" +
"Start from chronological age. Apply these modifiers based on what you see AND what's in the profile:\n" +
"ADD: Smoking +3 to +7. Heavy alcohol +2 to +4. Very high stress +2 to +4. Sleep under 6hrs +2 to +4. High unprotected sun +2 to +5. Poor diet +1 to +3. Obesity markers +1 to +3. Family history of early aging +1 to +3.\n" +
"SUBTRACT: Athlete -2 to -4. Mediterranean diet -1 to -2. Good supplement stack -1 to -2. Optimal sleep -1. Low stress -1.\n" +
(scanHistory ? "IMPORTANT: If this person has previous scans, factor in their trajectory. A person whose bio age has been improving deserves credit for that trend.\n\n" : "\n") +
      "OUTPUT LENGTH RULES — STRICTLY ENFORCED:\n" +
"- topInsights: exactly 3 items. Each must be 2-3 sentences. First sentence names the specific visible finding and its zone. Second sentence explains what is driving it using this person's profile data. Third sentence states the clinical significance in plain English. No sentence should be generic enough to apply to anyone else.\n" +
"- recommendations: exactly 4 items. Each is one sentence only — lead with the action, follow with the specific reason tied to this scan. No paragraphs.\n" +
"- positives: exactly 3 items. Each must be 2-3 sentences. First sentence names what is performing well and gives the actual score. Second sentence explains why it matters for this person specifically. Third sentence states what will reverse it.\n" +
"- diseaseRisk.what: 2 sentences max — name the exact visible signal and its location.\n" +
"- diseaseRisk.drivers: each driver is 1 sentence, grounded in either a visible facial signal or a self-reported profile data point. Never generic.\n" +
"- diseaseRisk.projection: 2 sentences max — name the skin/facial consequence and the timeline.\n\n" +
"FIELD LENGTH RULES — STRICTLY ENFORCED:\n" +
"- skinHealth: number score only e.g. '74/100'\n" +
"- hydration: percentage only e.g. '68%'\n" +
"- inflammation: 2-3 words max e.g. 'mild', 'moderate-high', 'severe'\n" +
"- sleepSignal: 2-3 words max e.g. 'deprived', 'optimal', 'fair'\n" +
"- oilBalance: 5 words max e.g. 'combination-oily T-zone'\n" +
"- collagenScore: number score only e.g. '72/100'\n" +
"- stressMarkers: 2-3 words max e.g. 'high', 'moderate', 'low'\n" +
"- faceSymmetry: number score only e.g. '79/100'\n" +
"- agingRate: short phrase only e.g. '1.2x faster than baseline'\n" +
"The detailed clinical explanation for each metric goes in topInsights and recommendations — NOT in the metric fields themselves.\n\n" +
"RESPOND ONLY WITH RAW JSON. NO MARKDOWN. NO BACKTICKS. NO EXTRA TEXT:\n" +
"{\"biologicalAge\":25,\"chronologicalAgeDiff\":\"2 years older than your chronological age — your skin is aging slightly faster than it should be\",\"agingVelocity\":\"faster than average\",\"agingRate\":\"1.2x faster than baseline\",\"skinHealth\":\"71/100\",\"hydration\":\"65%\",\"inflammation\":\"mild\",\"sleepSignal\":\"deprived\",\"oilBalance\":\"combination-oily T-zone with dehydrated cheeks\",\"collagenScore\":\"73/100\",\"stressMarkers\":\"moderate-high\",\"faceSymmetry\":\"84/100\",\"diseaseRisk\":{\"metabolic\":{\"pct\":\"34%\",\"confidence\":\"82%\",\"what\":\"specific visible finding in this exact photo\",\"drivers\":[\"specific driver tied to this person's data\",\"specific driver 2\",\"specific driver 3\"],\"projection\":\"honest plain English projection for 5-10 years\",\"actions\":[\"specific action with timeline\",\"specific action 2\",\"specific action 3\"]},\"cardiovascular\":{\"pct\":\"18%\",\"confidence\":\"74%\",\"what\":\"specific visible finding\",\"drivers\":[\"driver 1\",\"driver 2\",\"driver 3\"],\"projection\":\"projection\",\"actions\":[\"action 1\",\"action 2\",\"action 3\"]},\"inflammation\":{\"pct\":\"42%\",\"confidence\":\"88%\",\"what\":\"specific visible finding\",\"drivers\":[\"driver 1\",\"driver 2\",\"driver 3\"],\"projection\":\"projection\",\"actions\":[\"action 1\",\"action 2\",\"action 3\"]},\"hormonal\":{\"pct\":\"29%\",\"confidence\":\"79%\",\"what\":\"specific visible finding\",\"drivers\":[\"driver 1\",\"driver 2\",\"driver 3\"],\"projection\":\"projection\",\"actions\":[\"action 1\",\"action 2\",\"action 3\"]}},\"topInsights\":[\"specific insight referencing a visible finding or profile data point\",\"specific insight 2\",\"specific insight 3\",\"specific insight 4\"],\"positives\":[\"specific positive marker visible in the photo or profile\",\"positive 2\",\"positive 3\"],\"recommendations\":[\"[CRITICAL] Organ system: exact action. Specific reason tied to their scan.\",\"[HIGH] Organ system: exact action. Specific reason.\",\"[HIGH] Organ system: exact action. Specific reason.\",\"[MODERATE] Organ system: exact action. Specific reason.\",\"[MODERATE] Organ system: exact action. Specific reason.\"]}\n\n" +
"Replace ALL placeholder values with real findings. chronologicalAgeDiff must be written as a plain English sentence a regular person immediately understands. Every insight, driver, and recommendation must be specific to this exact person — nothing that could apply to anyone else.";

    var response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 4000,
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
var jsonStart = cleanJson.indexOf("{");
var jsonEnd = cleanJson.lastIndexOf("}");
if (jsonStart !== -1 && jsonEnd !== -1) {
  cleanJson = cleanJson.substring(jsonStart, jsonEnd + 1);
}
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

    // HEALTH CHART — generate clinical note
    try {
      var cookies2 = parseCookies(req);
      var session2 = cookies2.vital_session;
      if (session2 && SUPABASE_SERVICE_KEY) {
        var supabase2 = getSupabase(session2);
        var userRes2 = await supabase2.auth.getUser();
        if (userRes2.data && userRes2.data.user) {
          var userId2 = userRes2.data.user.id;
          var scanCountRes = await supabase2.from("health_chart").select("id").eq("user_id", userId2);
          var scanNumber = (scanCountRes.data ? scanCountRes.data.length : 0) + 1;

          var notePrompt = "You are VITAL — a clinical AI health system. Write a concise physician-style clinical note for this scan. Be specific, reference actual numbers, and flag anything concerning. Write like a doctor updating a patient chart after a visit.\n\n" +
            "SCAN DATA:\n" +
            "Biological Age: " + result.biologicalAge + "\n" +
            "Chronological Age: " + (userData.age || "unknown") + "\n" +
            "Skin Health: " + result.skinHealth + "\n" +
            "Hydration: " + result.hydration + "\n" +
            "Inflammation: " + result.inflammation + "\n" +
            "Sleep Signal: " + result.sleepSignal + "\n" +
            "Collagen Score: " + result.collagenScore + "\n" +
            "Stress Markers: " + result.stressMarkers + "\n" +
            "Oil Balance: " + result.oilBalance + "\n" +
            "Face Symmetry: " + result.faceSymmetry + "\n" +
            "Aging Rate: " + (result.agingRate || result.agingVelocity) + "\n\n" +
            "HEALTH PROFILE:\n" + profile + "\n\n" +
            "RESPOND ONLY WITH RAW JSON. NO MARKDOWN. NO BACKTICKS:\n" +
            "{\"note\":\"2-3 sentence clinical note\",\"flags\":[\"flag1\",\"flag2\"],\"status\":\"improving|stable|concern\",\"patterns\":[\"pattern1\"]}";

          var noteRes = await client.messages.create({
            model: "claude-opus-4-6",
            max_tokens: 500,
            messages: [{ role: "user", content: notePrompt }]
          });

          var noteRaw = noteRes.content[0].text.replace(/```json|```/g, "").trim();
var noteStart = noteRaw.indexOf("{");
var noteEnd = noteRaw.lastIndexOf("}");
if (noteStart !== -1 && noteEnd !== -1) { noteRaw = noteRaw.substring(noteStart, noteEnd + 1); }
var noteJson = JSON.parse(noteRaw);


          await supabase2.from("health_chart").insert({
            user_id: userId2,
            scan_number: scanNumber,
            date: new Date().toISOString(),
            clinical_note: noteJson.note,
            flags: JSON.stringify(noteJson.flags || []),
            status: noteJson.status || "stable",
            patterns: JSON.stringify(noteJson.patterns || []),
            profile_snapshot: userData
          });
          console.log("Health chart entry saved for scan " + scanNumber);
        }
      }
    } catch(chartErr) {
      console.error("Health chart generation error:", chartErr.message);
    }

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
"HARD MEDICAL BOUNDARIES — NEVER VIOLATE:\n" +
"- NEVER name or suggest a specific diagnosable medical condition or disease (e.g. PCOS, thyroid disease, diabetes, hormonal disorders) by name, even as a possibility or risk. Describe only visible skin/facial patterns — never the underlying diagnosis that might explain them.\n" +
"- NEVER calculate, state, or reference a BMI number. You cannot measure BMI from a photo.\n" +
"- NEVER recommend specific lab tests, bloodwork panels, imaging, or name specific hormones to test. Instead say 'a routine checkup with your doctor' or 'discuss this with a healthcare provider.'\n" +
"- NEVER frame a risk percentage as evidence that confirms an undiagnosed condition exists.\n" +
"- NEVER assert internal physiological states as established fact (e.g. 'your heart never gets recovery windows', 'elevated sympathetic tone', 'hormone cycling is disrupted'). You cannot measure heart rate, blood pressure, hormone levels, or organ function from a photo. Ground every claim in what is visibly observable (skin color, texture, vascular patterns on the face) plus what the person self-reported (sleep hours, exercise frequency, stress level) — phrase internal mechanisms as 'this pattern is commonly associated with' rather than stating it as their current physiological reality.\n" +
"- When uncertain whether a claim crosses from observable to assumed, default to the more conservative, less certain framing.\n" +
"- Keep projections anchored to what facial/skin signals can reasonably predict: skin health trajectory, visible aging, and continued facial symptoms (redness, breakouts, puffiness, etc). Do NOT extrapolate into unrelated internal systems you cannot observe from a face photo — no predictions about joint health, gut health, organ function, or immune system status. If you want to convey severity, do it through the visible/skin consequences intensifying, not through claiming unrelated body systems will be affected.\n\n" +



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
    var avgSleep = sleepItems.length > 0 ? (sleepItems.reduce(function(a, s) { return a + (s.total_sleep_duration || 0); }, 0) / sleepItems.length / 3600).toFixed(1) : null;
    var avgReadiness = readinessItems.length > 0 ? Math.round(readinessItems.reduce(function(a, r) { return a + (r.score || 0); }, 0) / readinessItems.length) : null;
    var avgHrv = hrItems.length > 0 ? Math.round(hrItems.reduce(function(a, h) { return a + (h.bpm || 0); }, 0) / hrItems.length) : null;
    var latestSleep = sleepItems.length > 0 ? sleepItems[sleepItems.length - 1] : null;
    res.json({ success: true, data: { avgSleep: avgSleep, avgReadiness: avgReadiness, avgHrv: avgHrv, latestSleepOnset: latestSleep ? latestSleep.bedtime_start : null, days: sleepItems.length } });
  } catch(e) {
    console.error("oura-data error:", e.message);
    res.json({ success: false, error: e.message });
  }
});
app.post("/vital-chat", async function(req, res) {
  try {
    var messages = req.body.messages || [];
    var healthContext = req.body.healthContext || {};

    var context = "";
    if (healthContext.biologicalAge) context += "Biological age: " + healthContext.biologicalAge + ". ";
    if (healthContext.skinHealth) context += "Skin health: " + healthContext.skinHealth + ". ";
    if (healthContext.hydration) context += "Hydration: " + healthContext.hydration + ". ";
    if (healthContext.inflammation) context += "Inflammation: " + healthContext.inflammation + ". ";
    if (healthContext.sleepSignal) context += "Sleep signal: " + healthContext.sleepSignal + ". ";
    if (healthContext.collagenScore) context += "Collagen score: " + healthContext.collagenScore + ". ";
    if (healthContext.stressMarkers) context += "Stress markers: " + healthContext.stressMarkers + ". ";
    if (healthContext.oilBalance) context += "Oil balance: " + healthContext.oilBalance + ". ";
    if (healthContext.faceSymmetry) context += "Face symmetry: " + healthContext.faceSymmetry + ". ";
    if (healthContext.agingRate) context += "Aging rate: " + healthContext.agingRate + ". ";
    if (healthContext.scanCount) context += "Total scans: " + healthContext.scanCount + ". ";
    if (healthContext.habits && healthContext.habits.length > 0) {
      context += "Active habits: " + healthContext.habits.map(function(h) { return h.name; }).join(", ") + ". ";
    }

    var systemPrompt = "You are VITAL AI — the world's most advanced personal health intelligence system. You think at the level of a physician who has completed fellowships in longevity medicine, clinical dermatology, endocrinology, and preventive cardiology. You have reviewed thousands of cases. You have read every major study published in the last 30 years on biological aging, inflammation, metabolic health, and skin biomarkers. You are not a chatbot. You are the smartest doctor the user has ever spoken to — and you have already reviewed every scan they have ever taken.\n\n" +
      "USER'S COMPLETE HEALTH DATA:\n" + context + "\n\n" +
      "HOW YOU THINK:\n" +
      "- You think in systems. Every symptom connects to an organ system, a hormonal axis, a metabolic pathway. You always think two levels deeper than the surface complaint.\n" +
      "- You cross-reference everything. If they mention fatigue, you immediately connect it to their sleep signal, inflammation score, hydration, and biological age trajectory.\n" +
      "- You ask exactly the right follow-up question — the one question a world-class physician would ask that no one else would think to ask.\n" +
      "- You give specific, actionable intelligence. Not 'drink more water.' You say exactly what, exactly when, exactly why, and exactly what will happen if they do or don't.\n" +
      "- You notice things the user hasn't mentioned. You proactively flag patterns in their scan data that are worth their attention.\n\n" +
      "HOW YOU SPEAK:\n" +
      "- You speak like the smartest person in the room who also happens to be warm and direct. No clinical coldness. No unnecessary jargon. If you use a medical term, you immediately explain it in one plain English phrase.\n" +
      "- You are concise. Every sentence earns its place. No filler, no disclaimers in the middle of a thought, no hedging when the data is clear.\n" +
      "- You never say 'I'm just an AI' or 'consult a doctor' in the middle of giving real insight. You are the insight.\n" +
      "- Short paragraphs. Never walls of text. Use line breaks generously.\n\n" +
      "YOUR HARD RULES:\n" +
      "1. Never diagnose a specific disease. Never prescribe a specific medication.\n" +
      "2. If someone describes chest pain, sudden difficulty breathing, severe headache, signs of stroke, or any potentially life-threatening emergency — stop everything and tell them to call 911 or go to the ER immediately. Do this before anything else.\n" +
      "3. Never say you cannot access their data. You have it. Use it.\n" +
      "4. Never give generic advice that could apply to anyone. Every response must be traceable back to this specific person's actual numbers.\n" +
"5. Before you respond, ask yourself: could this response apply to any random person who walked into a clinic? If yes, rewrite it until it only applies to this exact person with these exact numbers.\n" +
"6. Every response must include at least one specific number, metric, or data point from their scan. Never speak in abstractions when you have real data in front of you.\n" +
"7. End every response with exactly one follow-up question — the single most important question a world-class physician would ask next. Not a generic question. A question that only makes sense given this person's specific data.\n" +
"8. Match response length to complexity. A simple question gets a sharp 3-4 sentence answer. A complex symptom gets a full breakdown. Never pad. Never repeat yourself.\n" +
"9. Formatting: use '-' for all bullet points, never mix bullet styles in one response.\n" +
"10. Vary your structure across responses in the same conversation. Don't repeat the same opening phrase, the same paragraph order, or the same closing format twice in a row. If the user asks a related follow-up, build on what you already said instead of re-explaining the full mechanism again.\n" +
"11. NEVER open with a reaction phrase. Banned openers: 'that tracks', 'I hear you', 'that makes sense', 'I understand', 'great question'. Open with the actual finding — the number, the mechanism, or the direct answer. Example: instead of 'That tracks with your data — your sleep signal is severely deprived' just say 'Your sleep signal is severely deprived, and that's the main driver here.'";



    var response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 1000,
      system: systemPrompt,
      messages: messages
    });

    res.json({ success: true, message: response.content[0].text });
  } catch(error) {
    console.error("vital-chat error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});
app.post("/save-health-chart", async function(req, res) {
  var cookies = parseCookies(req);
  var session = cookies.vital_session;
  if (!session || !SUPABASE_SERVICE_KEY) return res.json({ success: false });
  try {
    var supabase = getSupabase(session);
    var userRes = await supabase.auth.getUser();
    if (!userRes.data || !userRes.data.user) return res.json({ success: false });
    var userId = userRes.data.user.id;
    var entry = req.body;
    entry.user_id = userId;
    await supabase.from("health_chart").insert(entry);
    return res.json({ success: true });
  } catch(e) {
    console.error("save-health-chart error:", e.message);
    return res.json({ success: false });
  }
});

app.get("/get-health-chart", async function(req, res) {
  var cookies = parseCookies(req);
  var session = cookies.vital_session;
  if (!session || !SUPABASE_SERVICE_KEY) return res.json({ success: false, entries: [] });
  try {
    var supabase = getSupabase(session);
    var userRes = await supabase.auth.getUser();
    if (!userRes.data || !userRes.data.user) return res.json({ success: false, entries: [] });
    var userId = userRes.data.user.id;
    var result = await supabase.from("health_chart").select("*").eq("user_id", userId).order("date", { ascending: true });
    return res.json({ success: true, entries: result.data || [] });
  } catch(e) {
    console.error("get-health-chart error:", e.message);
    return res.json({ success: false, entries: [] });
  }
});
app.get("/product-search", async function(req, res) {
  var query = req.query.q;
  if (!query) return res.json({ success: false, products: [] });
  try {
    var serpRes = await fetch("https://serpapi.com/search.json?engine=google_shopping&q=" + encodeURIComponent(query) + "&api_key=" + process.env.SERPAPI_KEY + "&num=3");
    var serpData = await serpRes.json();
    var results = serpData.shopping_results || [];
    var products = results.slice(0, 3).map(function(p) {
      return {
        name: p.title,
        price: p.price,
        retailer: p.source,
        link: p.link,
        image: p.thumbnail
      };
    });
    res.json({ success: true, products: products });
  } catch(e) {
    console.error("product-search error:", e.message);
    res.json({ success: false, products: [] });
  }
});

app.listen(3000, function() { console.log("VITAL running on port 3000"); });
