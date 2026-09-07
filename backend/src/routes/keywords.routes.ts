import { Router } from "express";
import { db } from "../db/client";
import { keywords } from "../db/schema";
import { ownedBy } from "../lib/authorization/ownership";
import { getCache } from "../lib/cache";
import { publish } from "../lib/kwsync";
import { getConfig } from "../config";

export const keywordsRoutes = Router();

keywordsRoutes.get("/", async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ message: "Não autenticado." });

  try {
    const rows = await db
      .select({ keyword: keywords.keyword, source: keywords.source })
      .from(keywords)
      .where(ownedBy(userId, keywords.userId))
      .orderBy(keywords.createdAt);

    return res.json({ ok: true, keywords: rows });
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao buscar keywords.",
      error: (error as Error).message,
    });
  }
});

keywordsRoutes.post("/", async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ message: "Não autenticado." });

  if (!getConfig().kwsyncEnabled) {
    return res.status(403).json({
      ok: false,
      message: "Submissão de keywords por usuário está desabilitada.",
    });
  }

  const raw = req.body?.keyword;
  const keyword = typeof raw === "string" ? raw.trim() : "";

  if (!keyword || typeof keyword !== "string") {
    return res.status(400).json({
      message: "O campo 'keyword' deve ser uma string não vazia.",
    });
  }

  await db
    .insert(keywords)
    .values({ keyword, source: "user", userId })
    .onConflictDoNothing({
      target: [keywords.userId, keywords.keyword],
    });

  const client = await getCache();
  await publish(client, keyword, "user", userId);

  return res.status(202).json({
    ok: true,
    message: "Keyword enfileirada para processamento.",
  });
});
