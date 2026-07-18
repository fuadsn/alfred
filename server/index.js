import express from "express";

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());

app.listen(port, () => {
  console.log(`Debrief server listening on http://localhost:${port}`);
});
