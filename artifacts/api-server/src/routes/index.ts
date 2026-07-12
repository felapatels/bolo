import { Router, type IRouter } from "express";
import healthRouter from "./health";
import profilesRouter from "./profiles";
import learningRouter from "./learning";
import openaiRouter from "./openai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(profilesRouter);
router.use(learningRouter);
router.use(openaiRouter);

export default router;
