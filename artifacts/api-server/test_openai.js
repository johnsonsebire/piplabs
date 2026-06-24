import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "process.env.OPENAI_API_KEY",
});

async function test() {
  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Help me analyze this chart." }
      ],
    });
    console.log("Success:", completion.choices[0].message.content);
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
