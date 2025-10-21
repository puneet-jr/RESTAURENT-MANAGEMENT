import express from "express";
import restaurentRouter from "./routes/restaurents.js";
import cusinesRouter from "./routes/cusines.js";
import { errorHandler } from "./middlewares/errorHandler.js";
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use("/restaurents", restaurentRouter);
app.use("/cuisines", cusinesRouter);


app.use(errorHandler);



app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
})
.on('error', (error) => {
  console.error('Failed to start server:', error);
});