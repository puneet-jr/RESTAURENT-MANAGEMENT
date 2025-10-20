import express from 'express';
import { validate } from '../middlewares/validate.js';
import { RestaurantSchema, type Restaurant } from '../schemas/restaurents.js';

const router = express.Router();

router.get("/", async (req, res) => {
  res.send("hello world");
});

router.post("/", validate(RestaurantSchema), async (req, res) => {
    const data = req.body as Restaurant;
   /* res.json({ success: true, data });*/

   res.send("Hello world!");
});

export default router;