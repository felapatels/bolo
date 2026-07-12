import { Router, type IRouter } from "express";
import healthRouter from "./health";
import learningRouter from "./learning";
import openaiRouter from "./openai";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

// Public
router.use(healthRouter);

// Everything below requires an authenticated user.
router.use(requireAuth);
router.use(learningRouter);
router.use(openaiRouter);

export default router;
