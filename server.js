const express = require("express");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ===== ENV =====
const DIFY_API_URL = process.env.DIFY_API_URL || "https://api.dify.ai/v1/chat-messages";
const DIFY_API_KEY = process.env.DIFY_API_KEY || "";
const ZALO_OA_ACCESS_TOKEN = process.env.ZALO_OA_ACCESS_TOKEN || "";

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

// ===== HELPER: extract message from Zalo webhook payload =====
function extractZaloMessage(body) {
  try {
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
      body?.text ||
      body?.message ||
      null;

    return {
      userId: userId ? String(userId) : null,
      messageText: typeof messageText === "string" ? messageText.trim() : null,
    };
  } catch (error) {
    console.error("extractZaloMessage error:", error);
    return {
      userId: null,
      messageText: null,
    };
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

  if (!response.ok) {
    throw new Error(`Dify error ${response.status}: ${JSON.stringify(data)}`);
  }

  return data?.answer || "ShopQR đã nhận được tin nhắn của anh/chị.";
}

// ===== HELPER: reply to Zalo =====
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

  if (!response.ok) {
    throw new Error(`Zalo reply HTTP ${response.status}: ${JSON.stringify(data)}`);
  }

  if (data?.error && data.error !== 0) {
    throw new Error(`Zalo reply API error: ${JSON.stringify(data)}`);
  }

  return data;
}

// ===== OPTIONAL: GET webhook for manual testing =====
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
    console.log(JSON.stringify(req.body, null, 2));

    const { userId, messageText } = extractZaloMessage(req.body);

    console.log("Parsed userId:", userId);
    console.log("Parsed messageText:", messageText);

    // Always respond 200 quickly if payload is not a text message
    if (!userId || !messageText) {
      console.log("No valid text message found. Return 200.");
      return res.status(200).send("ok");
    }

    // Acknowledge webhook early
    res.status(200).send("ok");

    let answer = "";

    try {
      answer = await askDify(messageText, userId);
      console.log("Dify answer:", answer);
    } catch (difyError) {
      console.error("Dify error:", difyError);
      answer =
        "ShopQR đã nhận được yêu cầu của anh/chị. Anh/chị vui lòng để lại tên quán, số điện thoại và lỗi đang gặp để bên em hỗ trợ nhanh hơn.";
    }

    try {
      const zaloReply = await sendZaloTextMessage(userId, answer);
      console.log("Zalo reply success:", JSON.stringify(zaloReply, null, 2));
    } catch (zaloError) {
      console.error("Zalo reply error:", zaloError);
    }
  } catch (error) {
    console.error("Webhook unexpected error:", error);

    // If headers not sent yet, still return 200 to avoid webhook retries storm
    if (!res.headersSent) {
      return res.status(200).send("ok");
    }
  }
});

// ===== START =====
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
