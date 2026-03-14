import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;

const DIFY_API_URL =
  process.env.DIFY_API_URL || "https://api.dify.ai/v1/chat-messages";
const DIFY_API_KEY = process.env.DIFY_API_KEY || "";
const ZALO_OA_ACCESS_TOKEN = process.env.ZALO_OA_ACCESS_TOKEN || "";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

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
      (typeof body?.message === "string" ? body.message : null) ||
      null;

    return {
      userId: userId ? String(userId) : null,
      messageText: typeof messageText === "string" ? messageText.trim() : null,
    };
  } catch (error) {
    console.error("extractZaloMessage error:", error);
    return { userId: null, messageText: null };
  }
}

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

app.get("/zalo/webhook", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Zalo webhook endpoint is running",
  });
});

app.post("/zalo/webhook", async (req, res) => {
  try {
    console.log("==== ZALO WEBHOOK RECEIVED ====");
    console.log(JSON.stringify(req.body, null, 2));

    const { userId, messageText } = extractZaloMessage(req.body);

    console.log("Parsed userId:", userId);
    console.log("Parsed messageText:", messageText);

    if (!userId || !messageText) {
      return res.status(200).send("ok");
    }

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

    if (!res.headersSent) {
      return res.status(200).send("ok");
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
