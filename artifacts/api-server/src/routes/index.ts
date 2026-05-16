import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import derivRouter from "./deriv";
import assetsRouter from "./assets";
import tradesRouter from "./trades";
import strategiesRouter from "./strategies";
import aiRouter from "./ai";
import dashboardRouter from "./dashboard";
import newsRouter from "./news";
import openaiRouter from "./openai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(derivRouter);
router.use(assetsRouter);
router.use(tradesRouter);
router.use(strategiesRouter);
router.use(aiRouter);
router.use(dashboardRouter);
router.use(newsRouter);
router.use(openaiRouter);

export default router;
