import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;

// ===== ENV =====
const DIFY_API_URL =
  process.env.DIFY_API_URL || "https://api.dify.ai/v1/chat-messages";
const DIFY_API_KEY = process.env.DIFY_API_KEY || "";
const ZALO_OA_ACCESS_TOKEN = process.env.ZALO_OA_ACCESS_TOKEN || "";

// ===== PATH HELPERS =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== MIDDLEWARE =====
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ===== BASIC ROUTES =====
app.get("/", (req, res) => {
  res.status(200).send("ShopQR AI server running");
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "shopqr-ai",
    time: new Date().toISOString(),
  });
});

// ===== HELPER: extract message from Zalo payload (nhiều dạng) =====
function extractZaloMessage(body) {
  try {
    console.log("RAW ZALO BODY:", JSON.stringify(body, null, 2));

    const userId =
      body?.sender?.id ||
      body?.sender?.user_id ||
      body?.data?.sender?.id ||
      body?.data?.sender?.user_id ||
      body?.source?.uid ||
      null;

    const messageText =
      body?.message?.text ||
      body?.data?.message?.text ||
      (typeof body?.message === "string" ? body.message : null) ||
      body?.text ||
      null;

    console.log("Parsed userId:", userId);
    console.log("Parsed messageText:", messageText);

    return {
      userId: userId ? String(userId) : null,
      messageText: typeof messageText === "string" ? messageText.trim() : null,
    };
  } catch (err) {
    console.error("extractZaloMessage error:", err);
    return { userId: null, messageText: null };
  }
}

// ===== HELPER: call Dify =====
async function askDify(query, userId) {
  if (!DIFY_API_KEY) {
    throw new Error("Missing DIFY_API_KEY");
  }

  const response = await fetch(DIFY_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DIFY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: {},
      query,
      response_mode: "blocking",
      user: userId,
    }),
  });

  const data = await response.json().catch(() => ({}));

  console.log("DIFY RAW:", JSON.stringify(data, null, 2));

  if (!response.ok) {
    throw new Error(`Dify error ${response.status}`);
  }

  return data?.answer || "ShopQR đã nhận được tin nhắn của anh/chị.";
}

// ===== HELPER: send message back to Zalo =====
async function sendZaloTextMessage(userId, text) {
  if (!ZALO_OA_ACCESS_TOKEN) {
    throw new Error("Missing ZALO_OA_ACCESS_TOKEN");
  }

  const response = await fetch("https://openapi.zalo.me/v2.0/oa/message", {
    method: "POST",
    headers: {
      access_token: ZALO_OA_ACCESS_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: {
        user_id: userId,
      },
      message: {
        text,
      },
    }),
  });

  const data = await response.json().catch(() => ({}));

  console.log("ZALO REPLY RESULT:", JSON.stringify(data, null, 2));

  if (!response.ok) {
    throw new Error(`Zalo HTTP error ${response.status}`);
  }

  if (data?.error && data.error !== 0) {
    throw new Error(`Zalo API error: ${JSON.stringify(data)}`);
  }

  return data;
}

// ===== WEBHOOK TEST =====
app.get("/zalo/webhook", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Zalo webhook endpoint is running",
  });
});

// ===== MAIN WEBHOOK =====
app.post("/zalo/webhook", async (req, res) => {
  try {
    console.log("==== ZALO WEBHOOK RECEIVED ====");

    const { userId, messageText } = extractZaloMessage(req.body);

    // luôn trả 200 nhanh để Zalo không retry
    res.status(200).send("ok");

    if (!userId || !messageText) {
      console.log("No valid message detected.");
      return;
    }

    let answer = "";

    try {
      answer = await askDify(messageText, userId);
      console.log("Dify answer:", answer);
    } catch (err) {
      console.error("Dify error:", err);
      answer =
        "ShopQR đã nhận được tin nhắn của anh/chị. Anh/chị vui lòng mô tả chi tiết vấn đề để bên em hỗ trợ.";
    }

    try {
      await sendZaloTextMessage(userId, answer);
    } catch (err) {
      console.error("Zalo reply error:", err);
    }
  } catch (err) {
    console.error("Webhook unexpected error:", err);
    if (!res.headersSent) res.status(200).send("ok");
  }
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
