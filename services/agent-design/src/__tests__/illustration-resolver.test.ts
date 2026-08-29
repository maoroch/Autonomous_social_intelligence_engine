import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveIllustrationTag } from "../assets/illustration-loader.js";

describe("Illustration Resolver (URL, PNG and SVG support)", () => {
  it("should format direct image URLs into <img> tag", () => {
    const url = "https://static-int.testo.com/media/17/91/e8cde96b29a5/POP-Smart_Probes_Feature_05_master.jpg";
    const tag = resolveIllustrationTag(url, "industrial-measurement-equipment");

    assert.ok(tag.includes("<img"), "Must output <img> tag for URL");
    assert.ok(tag.includes(url), "Must contain image source URL");
  });

  it("should format direct data URI into <img> tag", () => {
    const dataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA";
    const tag = resolveIllustrationTag(dataUri, "industrial-measurement-equipment");

    assert.ok(tag.includes(dataUri), "Must preserve data URI in <img> tag");
  });

  it("should return empty string for empty illustration key", () => {
    const tag = resolveIllustrationTag("", "industrial-measurement-equipment");
    assert.equal(tag, "");
  });

  it("should resolve local PNG or SVG keys", () => {
    const tag = resolveIllustrationTag("gauge", "industrial-measurement-equipment");
    assert.ok(tag.includes("data:image/png;base64,") || tag.includes("<svg"), "Must resolve preset gauge to image data");
  });
});
