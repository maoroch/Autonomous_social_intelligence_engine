import { describe, it } from "node:test";
import assert from "node:assert/strict";

interface SlideData {
  key: string;
  badge: string;
  title: string;
  bullets: string[];
  footer: string;
  illustration?: string;
}

describe("Carousel Illustration Editor", () => {
  it("should update slide illustration with preset key or custom URL", () => {
    const slides: SlideData[] = [
      {
        key: "slide_1",
        badge: "B2B CASE",
        title: "Спасение котельной",
        bullets: ["Внедрение Testo 350"],
        footer: "",
        illustration: "testo_300",
      },
    ];

    function handleIllustrationChange(index: number, newIllustration: string) {
      slides[index] = {
        ...slides[index],
        illustration: newIllustration,
      };
    }

    // 1. User picks preset "gauge"
    handleIllustrationChange(0, "gauge");
    assert.equal(slides[0].illustration, "gauge", "Illustration should update to preset key");

    // 2. User pastes a custom image URL
    const customUrl = "https://static-int.testo.com/media/17/91/e8cde96b29a5/POP-Smart_Probes_Feature_05_master.jpg";
    handleIllustrationChange(0, customUrl);
    assert.equal(slides[0].illustration, customUrl, "Illustration should support external URLs");

    // 3. User clears illustration
    handleIllustrationChange(0, "");
    assert.equal(slides[0].illustration, "", "Illustration can be cleared");
  });
});
