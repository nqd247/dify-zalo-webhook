import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const DIFY_API_KEY = process.env.DIFY_API_KEY;
const ZALO_TOKEN = process.env.ZALO_TOKEN;

app.get("/zalo/webhook", (req, res) => {
  res.status(200).send("OK");
});

app.post("/zalo/webhook", async (req, res) => {

  const message = req.body.message?.text;
  const userId = req.body.sender?.id;

  if (!message) {
    return res.sendStatus(200);
  }

  try {

    const dify = await axios.post(
      "https://api.dify.ai/v1/chat-messages",
      {
        inputs: {},
        query: message,
        response_mode: "blocking",
        user: userId
      },
      {
        headers: {
          Authorization: `Bearer ${DIFY_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const answer = dify.data.answer;

    await axios.post(
      "https://openapi.zalo.me/v3.0/oa/message/cs",
      {
        recipient: { user_id: userId },
        message: { text: answer }
      },
      {
        headers: {
          access_token: ZALO_TOKEN
        }
      }
    );

  } catch (err) {
    console.log(err);
  }

  res.sendStatus(200);

});

app.listen(3000, () => {
  console.log("server running");
});
