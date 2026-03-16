import express from "express";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const DIFY_API_KEY = process.env.DIFY_API_KEY;
const ZALO_OA_ACCESS_TOKEN = process.env.ZALO_OA_ACCESS_TOKEN;

app.get("/", (req, res) => {
  res.status(200).send("ShopQR AI server running");
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/zalo/webhook", (req, res) => {
  res.status(200).send("Zalo webhook is running");
});

app.post("/zalo/webhook", async (req, res) => {
  try {
    console.log("==== ZALO WEBHOOK RECEIVED ====");
    console.log("RAW BODY:", JSON.stringify(req.body, null, 2));

    const body = req.body;

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

    console.log("USER ID:", userId);
    console.log("MESSAGE:", messageText);

    // trả 200 ngay cho Zalo
    res.status(200).send("ok");

    if (!userId || !messageText) {
      console.log("No valid userId/messageText");
      return;
    }

    let replyText = "ShopQR đã nhận được tin nhắn của anh/chị.";

    // 1) Gọi Dify
    try {
      const difyRes = await fetch("https://api.dify.ai/v1/chat-messages", {
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
      console.log("DIFY RESPONSE:", JSON.stringify(difyData, null, 2));

      if (difyData?.answer) {
        replyText = difyData.answer;
      }
    } catch (err) {
      console.error("DIFY ERROR:", err);
    }

    console.log("DIFY ANSWER:", replyText);

    // 2) Gửi lại Zalo bằng Message V3
    try {
      const zaloRes = await fetch("https://openapi.zalo.me/v3.0/oa/message/cs", {
        method: "POST",
        headers: {
          access_token: ZALO_OA_ACCESS_TOKEN,
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
      console.log("ZALO REPLY RESULT:", JSON.stringify(zaloData, null, 2));
    } catch (err) {
      console.error("ZALO REPLY ERROR:", err);
    }
  } catch (err) {
    console.error("WEBHOOK ERROR:", err);
    if (!res.headersSent) {
      res.status(200).send("ok");
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
