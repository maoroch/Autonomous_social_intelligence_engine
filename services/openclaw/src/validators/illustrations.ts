import { Router } from "express";
import { getCollection, Collections } from "@pipeline/shared/db";
import { ObjectId } from "mongodb";

export function illustrationsRouter(): Router {
  const router = Router();

  const getCol = () => getCollection<any>(Collections.SVG_ILLUSTRATIONS);

  // GET /
  router.get("/", async (req, res) => {
    try {
      const list = await getCol().find({}).toArray();
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch illustrations" });
    }
  });

  // POST /
  router.post("/", async (req, res) => {
    try {
      const { name, svgContent } = req.body;
      if (!name || !svgContent) {
        return res.status(400).json({ error: "Name and svgContent are required" });
      }
      const existing = await getCol().findOne({ name });
      if (existing) {
        return res.status(400).json({ error: "An illustration with this name already exists" });
      }
      const result = await getCol().insertOne({ name, svgContent });
      res.json({ _id: result.insertedId, name, svgContent });
    } catch (err) {
      res.status(500).json({ error: "Failed to create illustration" });
    }
  });

  // PUT /:id
  router.put("/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { name, svgContent } = req.body;
      const updateDoc: Record<string, any> = {};
      if (name) updateDoc.name = name;
      if (svgContent) updateDoc.svgContent = svgContent;

      const result = await getCol().updateOne(
        { _id: new ObjectId(id) },
        { $set: updateDoc }
      );
      res.json({ ok: true, matched: result.matchedCount });
    } catch (err) {
      res.status(500).json({ error: "Failed to update illustration" });
    }
  });

  // DELETE /:id
  router.delete("/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await getCol().deleteOne({ _id: new ObjectId(id) });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete illustration" });
    }
  });

  return router;
}
