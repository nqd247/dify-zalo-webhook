import express from "express";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const DIFY_API_KEY = process.env.DIFY_API_KEY;
const DIFY_API_URL = "https://api.dify.ai/v1/chat-messages";

app.post("/zalo/webhook", async (req, res) => {
  try {
    console.log("==== ZALO WEBHOOK RECEIVED ====");
    console.log(JSON.stringify(req.body, null, 2));

    const body = req.body;

    const userId =
      body?.sender?.id ||
      body?.sender?.user_id ||
      body?.data?.sender?.id ||
      body?.data?.sender?.user_id ||
      null;

    const messageText =
      body?.message?.text ||
      body?.data?.message?.text ||
      "";

    console.log("User:", userId);
    console.log("Message:", messageText);

    res.status(200).send("ok");

    if (!userId || !messageText) return;

    let replyText = "ShopQR đã nhận được tin nhắn của anh/chị.";

    try {
      const difyRes = await fetch(DIFY_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${DIFY_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inputs: {},
          query: messageText,
          response_mode: "blocking",
          user: String(userId)
        })
      });

      const difyData = await difyRes.json();
      console.log("DIFY:", JSON.stringify(difyData, null, 2));

      if (difyData?.answer) {
        replyText = difyData.answer;
      }
    } catch (err) {
      console.error("Dify error:", err);
    }

    const zaloRes = await fetch("https://openapi.zalo.me/v3.0/oa/message/cs", {
      method: "POST",
      headers: {
        access_token: process.env.ZALO_OA_ACCESS_TOKEN,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        recipient: {
          user_id: String(userId)
        },
        message: {
          text: replyText
        }
      })
    });

    const zaloData = await zaloRes.json();
    console.log("Zalo reply:", JSON.stringify(zaloData, null, 2));
  } catch (err) {
    console.error("Webhook error:", err);
    if (!res.headersSent) {
      res.status(200).send("ok");
    }
  }
});

app.get("/", (req, res) => {
  res.send("ShopQR AI server running");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
