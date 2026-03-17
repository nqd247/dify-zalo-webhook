import express from "express";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const DIFY_API_KEY = process.env.DIFY_API_KEY;

const ZALO_APP_ID = process.env.ZALO_APP_ID;
const ZALO_APP_SECRET = process.env.ZALO_APP_SECRET;
let ZALO_REFRESH_TOKEN = process.env.ZALO_REFRESH_TOKEN;

// token chạy runtime
let zaloAccessToken = null;
let zaloTokenExpireAt = 0;

app.get("/", (req, res) => {
  res.status(200).send("ShopQR AI server running");
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    hasZaloToken: !!zaloAccessToken,
    zaloTokenExpireAt,
  });
});

app.get("/zalo/webhook", (req, res) => {
  res.status(200).send("Zalo webhook is running");
});

async function refreshZaloAccessToken() {
  if (!ZALO_APP_ID || !ZALO_APP_SECRET || !ZALO_REFRESH_TOKEN) {
    throw new Error("Missing Zalo env: ZALO_APP_ID / ZALO_APP_SECRET / ZALO_REFRESH_TOKEN");
  }

  const body = new URLSearchParams({
    app_id: ZALO_APP_ID,
    refresh_token: ZALO_REFRESH_TOKEN,
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth.zaloapp.com/v4/oa/access_token", {
    method: "POST",
    headers: {
      secret_key: ZALO_APP_SECRET,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const data = await res.json();
  console.log("ZALO REFRESH RESPONSE:", JSON.stringify(data, null, 2));

  if (!res.ok || data.error) {
    throw new Error(`Refresh token failed: ${JSON.stringify(data)}`);
  }

  zaloAccessToken = data.access_token;
  if (data.refresh_token) {
    ZALO_REFRESH_TOKEN = data.refresh_token;
    console.log("NEW REFRESH TOKEN:", ZALO_REFRESH_TOKEN);
    console.log("Nhớ cập nhật ZALO_REFRESH_TOKEN mới vào Railway Variables.");
  }

  const expiresIn = Number(data.expires_in || 3600);
  zaloTokenExpireAt = Date.now() + (expiresIn - 120) * 1000;

  return zaloAccessToken;
}

async function getValidZaloAccessToken() {
  if (!zaloAccessToken || Date.now() >= zaloTokenExpireAt) {
    await refreshZaloAccessToken();
  }
  return zaloAccessToken;
}

function extractZaloMessage(body) {
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
    "";

  return {
    userId: userId ? String(userId) : null,
    messageText: String(messageText || "").trim(),
  };
}

async function askDify(messageText, userId) {
  const res = await fetch("https://api.dify.ai/v1/chat-messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DIFY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: {},
      query: messageText,
      response_mode: "blocking",
      user: String(userId),
    }),
  });

  const data = await res.json();
  console.log("DIFY RESPONSE:", JSON.stringify(data, null, 2));

  if (!res.ok) {
    throw new Error(`Dify error: ${JSON.stringify(data)}`);
  }

  return data?.answer || "ShopQR đã nhận được tin nhắn của anh/chị.";
}

async function sendZaloMessage(userId, text) {
  const token = await getValidZaloAccessToken();

  let res = await fetch("https://openapi.zalo.me/v3.0/oa/message/cs", {
    method: "POST",
    headers: {
      access_token: token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { user_id: String(userId) },
      message: { text },
    }),
  });

  let data = await res.json();
  console.log("ZALO REPLY RESULT:", JSON.stringify(data, null, 2));

  // token hết hạn hoặc invalid thì refresh và gửi lại 1 lần
  if (data?.error === -216 || /expired/i.test(data?.message || "")) {
    console.log("Zalo token expired -> refreshing and retrying...");
    await refreshZaloAccessToken();

    res = await fetch("https://openapi.zalo.me/v3.0/oa/message/cs", {
      method: "POST",
      headers: {
        access_token: zaloAccessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: { user_id: String(userId) },
        message: { text },
      }),
    });

    data = await res.json();
    console.log("ZALO RETRY RESULT:", JSON.stringify(data, null, 2));
  }

  return data;
}

app.post("/zalo/webhook", async (req, res) => {
  try {
    console.log("==== ZALO WEBHOOK RECEIVED ====");
    console.log("RAW BODY:", JSON.stringify(req.body, null, 2));

    const { userId, messageText } = extractZaloMessage(req.body);

    console.log("USER ID:", userId);
    console.log("MESSAGE:", messageText);

    res.status(200).send("ok");

    if (!userId || !messageText) return;

    let replyText = "ShopQR đã nhận được tin nhắn của anh/chị.";

    try {
      replyText = await askDify(messageText, userId);
    } catch (err) {
      console.error("DIFY ERROR:", err);
    }

    await sendZaloMessage(userId, replyText);
  } catch (err) {
    console.error("WEBHOOK ERROR:", err);
    if (!res.headersSent) {
      res.status(200).send("ok");
    }
  }
});

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  try {
    await refreshZaloAccessToken();
    console.log("Initial Zalo token ready");
  } catch (err) {
    console.error("Initial token refresh failed:", err);
  }
});
